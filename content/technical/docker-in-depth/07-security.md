---
title: "Docker Security — Hardening Containers for Production"
order: 7
tags: ["docker", "security", "devops"]
date: "2026-05-06"
draft: false
lang: "en"
---

## The Security Illusion

Docker containers feel isolated. They have their own filesystem, their own network, their own process tree. But "isolated" and "secure" are not the same thing.

By default, a Docker container:
- Runs as **root**
- Shares the **host OS kernel**
- Has access to a broad set of **Linux capabilities**
- Can be configured to mount the **host filesystem**

If an attacker gains code execution inside a misconfigured container, the path to the host is often shorter than you'd expect. This chapter covers the specific risks and the practical steps to close them.

---

## The Threat Model

Before hardening, be clear about what you're defending against:

1. **Container escape** — an attacker inside a container gains access to the host.
2. **Privilege escalation** — a low-privileged process inside the container becomes root, then escapes.
3. **Secrets leakage** — credentials baked into images or passed insecurely at runtime.
4. **Supply chain attacks** — malicious code introduced via a compromised base image or dependency.
5. **Lateral movement** — a compromised container reaches other containers or internal services it shouldn't.

Most Docker security hardening addresses one or more of these.

---

## Run as Non-Root

This is the single most impactful change. A process running as root inside a container is root — if it escapes, it's root on the host.

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# create a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# own the app directory
RUN chown -R appuser:appgroup /app

# switch to it
USER appuser

EXPOSE 3000
CMD ["node", "src/index.js"]
```

After `USER appuser`, every subsequent `RUN`, `CMD`, and `ENTRYPOINT` runs as that user. The process has no ability to write outside `/app`, install packages, or modify system files.

Some base images provide a built-in non-root user. Node's official images include `node`:

```dockerfile
USER node
```

Check your base image's documentation before creating a new user unnecessarily.

---

## Read-Only Root Filesystem

If your application doesn't need to write to its container filesystem at runtime, make it read-only:

```bash
docker run --read-only my-app:latest
```

Or in Compose:

```yaml
services:
  api:
    image: my-api:latest
    read_only: true
    tmpfs:
      - /tmp        # allow writes to /tmp in memory
      - /var/run    # allow PID files
```

A read-only filesystem prevents an attacker from modifying your application code, installing tools, or writing persistence mechanisms inside the container. Most web servers and APIs can run read-only with a `tmpfs` mount for `/tmp`.

---

## Drop Linux Capabilities

Linux capabilities are fine-grained privileges split out from the monolithic root permission. A container with `CAP_NET_ADMIN` can reconfigure network interfaces. `CAP_SYS_PTRACE` can inspect other processes. `CAP_DAC_OVERRIDE` can bypass filesystem permission checks.

By default, Docker grants containers a subset of capabilities. The principle of least privilege says: drop everything you don't need, add back only what you do.

```bash
docker run \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  my-app:latest
```

`NET_BIND_SERVICE` allows binding to ports below 1024 (like port 80). For most applications, this is the only capability needed.

In Compose:

```yaml
services:
  api:
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

To audit what capabilities your container is using:

```bash
docker run --rm -it my-app:latest capsh --print
```

---

## Never Store Secrets in Images

Anything in a `Dockerfile` becomes part of the image layers — and image layers are permanent and inspectable.

```dockerfile
# WRONG — secret is visible in docker history and any image pull
ENV DATABASE_PASSWORD=supersecret
RUN aws configure set aws_secret_access_key AKIAIOSFODNN7EXAMPLE
```

```bash
docker history my-app:latest
# you'll see the ENV and RUN lines, including the values
```

The right approaches:

**1. Runtime environment variables** — pass at container start, not build time:

```bash
docker run -e DATABASE_PASSWORD=supersecret my-app:latest
```

**2. Docker secrets (Swarm)** — encrypted at rest, mounted as files:

```yaml
# docker-compose.yml (Swarm mode)
secrets:
  db_password:
    external: true

services:
  api:
    secrets:
      - db_password
    # available at /run/secrets/db_password inside the container
```

**3. Build-time secrets (BuildKit)** — available during build, not baked into layers:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine

RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN=$(cat /run/secrets/npm_token) npm ci
```

```bash
docker build --secret id=npm_token,src=.npmrc .
```

The secret is available during the `RUN` step but never written to any layer.

---

## Use Minimal Base Images

Every package in your base image is a potential attack surface. Prefer minimal images:

| Base image | Size | Use case |
|---|---|---|
| `ubuntu:22.04` | ~80 MB | When you need a full OS |
| `debian:bookworm-slim` | ~75 MB | Slightly trimmed Debian |
| `alpine:3.19` | ~8 MB | Minimal, musl libc |
| `gcr.io/distroless/nodejs20` | ~50 MB | No shell, no package manager |
| `scratch` | 0 bytes | For statically compiled binaries only |

**Distroless images** from Google are worth knowing. They contain only the application runtime and its dependencies — no shell, no package manager, no utilities. An attacker who gets RCE inside a distroless container has almost no tools to work with.

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM gcr.io/distroless/nodejs20-debian12
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["dist/index.js"]
```

---

## Scan Images for Vulnerabilities

Build hardening is only half the picture. Your base image and dependencies have their own CVEs. Scan regularly.

**Docker Scout** (built into Docker Desktop and CLI):

```bash
docker scout cves my-app:latest
docker scout recommendations my-app:latest
```

**Trivy** (open source, widely used in CI):

```bash
trivy image my-app:latest
trivy image --severity HIGH,CRITICAL my-app:latest
```

**Snyk:**

```bash
snyk container test my-app:latest
```

Integrate scanning into your CI pipeline so vulnerabilities are caught before images reach production. We'll cover this concretely in Chapter 8.

---

## Limit Container Resources

A container without resource limits can consume all host CPU and memory, intentionally (DoS) or by accident (memory leak). Always set limits in production:

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
```

OOM (out-of-memory) behavior: when a container hits its memory limit, the kernel kills the process. That's the desired behavior — it fails fast and visibly rather than degrading the whole host.

---

## Network Segmentation

By default in Compose, all services share one network and can reach each other freely. That's convenient for development; it's a lateral movement risk in production.

Use separate networks to enforce service boundaries:

```yaml
services:
  nginx:
    networks:
      - frontend

  api:
    networks:
      - frontend
      - backend

  postgres:
    networks:
      - backend

networks:
  frontend:
  backend:
```

`postgres` is now only reachable from `api`. `nginx` cannot reach the database directly. This limits the blast radius if `nginx` is compromised.

---

## The `--privileged` Flag — Never Use It

`--privileged` disables virtually all container isolation. The container gets full access to all Linux capabilities, all devices, and can remount the host filesystem. It's a complete bypass of the security model.

```bash
# NEVER do this in production
docker run --privileged my-app:latest
```

It exists for specific infrastructure tools (Docker-in-Docker, some GPU drivers). For application containers, there is no legitimate use case.

---

## Security Checklist

Before shipping a container to production, verify:

- [ ] Runs as a non-root user
- [ ] Read-only root filesystem (with `tmpfs` where needed)
- [ ] All capabilities dropped, only necessary ones added back
- [ ] No secrets in the Dockerfile or image layers
- [ ] Base image is minimal (Alpine or distroless)
- [ ] Image scanned for CVEs (Trivy or Docker Scout)
- [ ] Resource limits set (CPU and memory)
- [ ] Network segmented — only services that need to communicate are on the same network
- [ ] `--privileged` is not used

---

## What's Next

You now have a hardened container. Next: [Docker in CI/CD](./08-cicd.md) — how to build, test, scan, and deploy that container automatically so every push is validated and every release is reproducible.
