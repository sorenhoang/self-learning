---
title: "Service-to-Service Authentication: The Threat Model You're Ignoring"
description: "Most microservices deployments skip internal auth entirely. Here's what that costs you, and the three patterns that fix it."
tags: ["microservices", "security", "authentication", "distributed-systems", "mtls"]
date: "2026-06-24"
draft: false
lang: "en"
---

Most microservices treat internal traffic as implicitly trusted. If a request arrives inside the cluster, it must be legitimate — it came from *us*.

That assumption breaks the moment one of your services is compromised. An attacker inside the network can call every other service freely. No credentials needed. No audit trail. No way to know what they touched.

This is called lateral movement, and it's how the largest breaches in the past decade actually play out.

In 2020, attackers compromised the SolarWinds Orion service account. Because that account had accumulated admin privileges across 18,000 customer environments with no scope limits, one foothold became a full network compromise. In 2022, Uber's attackers found hardcoded credentials in a PowerShell script on an internal network share. From there, full domain admin — because nothing inside the network required authentication.

Both attacks succeeded not because the perimeter failed, but because nothing stopped lateral movement once the attacker was inside.

Service-to-service authentication is the answer. Here's the threat model, the patterns, and how to choose.

## The question each pattern answers

Before picking a pattern, be clear on what threat you're defending against:

- **Credential leak / replay** — Can a leaked token or key impersonate a service?
- **Lateral movement** — Can a compromised service call services it shouldn't?
- **Missing validation** — Can a developer accidentally skip auth on an "internal" route?
- **Audit gaps** — When something goes wrong, can you trace which service called what?

No single pattern perfectly addresses all four. The choice is about which risks you can accept.

## Pattern 1: Shared secrets and API keys

The most common starting point. Service A includes a static secret in a header; service B checks it.

```http
GET /internal/orders
Authorization: Bearer super-secret-internal-key-1234
```

It works. Until it doesn't.

The failure modes are predictable:

- Secrets get committed to source control. Not always by accident — by developers who are moving fast and don't have a better option.
- Secrets don't rotate. Rotation is painful, so it doesn't happen. A leaked key from three years ago is still valid.
- There's no scope. A single `internal-key` lets the holder call *everything*. Lateral movement is trivial once it leaks.
- No audit trail. You know the secret was used; you don't know by whom or when.

Shared secrets are fine for two services talking to each other in a prototype. They are not a foundation to grow into. The operational overhead of doing them *safely* — a secrets manager, rotation policy, per-service scoping — approaches the overhead of just doing it right from the start.

## Pattern 2: OAuth 2.0 Client Credentials

The OAuth 2.0 client credentials flow (RFC 6749) is the standard for machine-to-machine auth. No user is involved. The caller exchanges a `client_id` and `client_secret` for a short-lived token, then attaches that token to requests.

```
Service A  →  Auth Server:
  POST /token
  grant_type=client_credentials
  client_id=order-service
  client_secret=<secret>
  scope=inventory:read

Auth Server  →  Service A:
  { "access_token": "eyJ...", "expires_in": 300 }

Service A  →  Service B:
  GET /inventory/stock
  Authorization: Bearer eyJ...

Service B: validates token signature, checks scope, proceeds
```

Key properties:

- **Short-lived tokens.** 5 minutes is typical. A leaked token has a bounded window of usefulness.
- **Scoped.** The token declares what the caller is allowed to do. The callee can enforce it.
- **Auditable.** The auth server records when each service requested a token. You can reconstruct who called what.
- **Works across network boundaries.** External partners, CI/CD pipelines, services outside your cluster — all can participate with the same pattern.

The tradeoffs: every service must validate tokens. If a developer skips validation on an "internal" route, you have a gap. The auth server becomes a critical dependency. And the `client_secret` used to request tokens is still a shared secret — it needs the same hygiene: secrets manager, rotation, per-service credentials.

Client credentials is the right pattern when you want application-layer authorization — fine-grained scopes, revocable clients, and an audit log that maps tokens to specific services.

## Pattern 3: mTLS and workload identity

Mutual TLS is authentication at the transport layer. Both sides of a connection present X.509 certificates. If either side can't verify the other against a trusted CA, the connection is rejected — before any application code runs.

The difference from one-way TLS (standard HTTPS): the *client* also presents a certificate. The server knows exactly who it's talking to.

```
Service A  →  Service B (TLS handshake):

  A presents: spiffe://prod/ns/orders/sa/order-service
  B presents: spiffe://prod/ns/inventory/sa/inventory-service
  Both verify against shared CA
  → Handshake complete. Connection established.
```

The identity in those certificates follows the **SPIFFE** standard — a URI like `spiffe://domain/service-name` that uniquely identifies a workload. **SPIRE** is the production runtime that issues and rotates these certificates automatically. Default TTL: one hour. No developer touches them.

Why this matters:

- No application-layer secret to manage. The private key never leaves the workload.
- No developer can accidentally skip auth. Authentication happens at the network level.
- Certificates rotate automatically. Compromise window is bounded by TTL.

The tradeoffs: mTLS proves *identity* — who the caller is. It doesn't prove *authorization* — what they're allowed to do. For fine-grained access control, you still need something layered on top.

Operationally, you need a PKI or a service mesh. **Istio** and **Linkerd** make mTLS nearly zero-config — sidecar proxies intercept traffic and handle the handshake transparently. Istio ships SPIFFE-compliant identity by default. Without a mesh, you're managing certificate distribution yourself, which is painful at scale.

## Choosing your layer

These patterns are not mutually exclusive. The most common production setup:

- **mTLS** at the transport layer — proves which service is calling
- **JWT / OAuth2** at the application layer — carries what that service is allowed to do

The mesh handles mTLS automatically. The JWT is issued by an auth server with narrow scopes. Defense in depth: even if the mesh is misconfigured, the application still validates the token.

| | Shared secrets | OAuth2 client credentials | mTLS + SPIFFE |
|---|---|---|---|
| **Setup effort** | Low | Medium | High (with mesh) |
| **Works cross-network** | Yes | Yes | Harder |
| **Auto-rotation** | No | Partial | Yes |
| **Authorization (scopes)** | No | Yes | No (identity only) |
| **Audit trail** | No | Yes | Via mesh logs |
| **Dev footgun risk** | High | Medium | Low |

**Start with OAuth2 client credentials** if you don't control the infrastructure or have services outside Kubernetes. It's the right default when you need auditability and scope control without committing to a service mesh.

**Graduate to mTLS** when you're fully on Kubernetes. Istio enables it by default — the operational cost is low, and the security properties are significantly stronger.

**Drop shared API keys** as soon as you have more than two services. The failure modes are too predictable to treat them as a baseline.

One pitfall that applies to all three: **permission accumulation**. A service that starts with read access to one table shouldn't have admin rights to three systems two years later. Audit service credentials the same way you audit human IAM — regularly, with a default toward least privilege. SolarWinds wasn't a key management failure; it was a scope management failure.

The network perimeter is not your security model. Each service is.
