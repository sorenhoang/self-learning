---
title: "Error Retries: The Immune Response That Can Turn Autoimmune"
description: "Adding retries makes systems more reliable — until it doesn't. The systems that go down because of retries outnumber those that go down because they lacked them."
tags: ["distributed-systems", "reliability", "backend", "system-design"]
date: "2026-06-14"
draft: false
lang: "en"
---

You added retries. The service is now "resilient." You ship it.

Three weeks later, a downstream dependency has a blip — and your system doesn't just degrade, it falls over completely and takes two other services with it.

This is the retry paradox: the mechanism you added to handle failures becomes the mechanism that causes them. Like an immune system that turns on the body it was meant to protect.

Most guides tell you how to add retries. This one focuses on how to add them without triggering the autoimmune response.

## The naive retry and why it can kill your system

Consider a simple 5-layer call stack: frontend → API gateway → service A → service B → database. Each layer retries 3 times on failure. Seems reasonable.

The math is not reasonable: **3⁵ = 243 requests** hit the database for every single original request that failed.

This is Marc Brooker's number from the Amazon Builders' Library, and it's the most important number in this domain. A database healthy at 10,000 QPS might start receiving 243,000 QPS from a retry storm — during the exact moment it's already struggling.

There's a second failure mode: **thundering herd**. When many clients fail at the same moment (say, a brief network partition), they all back off for the same duration and then retry simultaneously. The load spike repeats on schedule.

DoorDash's May 2022 outage ran for three hours. The trigger was routine database maintenance. The cause of the outage was a misconfigured circuit breaker that made a 3-layer retry cascade unavoidable under any increased latency. They didn't lack retries — they had too many, in the wrong shape.

**The lesson:** retries don't just add extra requests. Under pressure, they multiply load against the exact system that's already failing.

## Add jitter, not just backoff

The standard fix for thundering herd is exponential backoff: `sleep = base * 2^attempt`. But synchronization doesn't disappear — all clients that failed together still retry together, just on a longer interval.

In 2015, AWS engineer Marc Brooker ran a simulation with 100 contending clients and tested four approaches. The results were decisive:

| Strategy | Relative load | Completion time |
|---|---|---|
| No backoff | Worst | Fastest (when it works) |
| Exponential, no jitter | High | Moderate |
| Equal jitter | Moderate | Moderate |
| **Full jitter** | **Lowest** | **Best** |

Full jitter: `sleep = random(0, min(cap, base * 2^attempt))`

The randomness breaks synchronization. Each client wakes up at a different time. The retry wave becomes a trickle.

Full jitter cut total retry call count by more than half compared to no-jitter backoff. This isn't a minor optimization — it's the difference between a system that recovers and one that stays down.

**One practical addition:** when a server returns a `Retry-After` header (common with `429 Too Many Requests` and `503 Service Unavailable`), that header value overrides your backoff calculation. Ignoring it and using your own interval adds load during the exact recovery window the server is protecting. This is one of the most common production retry bugs.

## Idempotency is a prerequisite, not a nice-to-have

Before you retry any non-GET operation, ask: *what happens if the server already processed this request?*

Stripe's Brandur Leach described three failure phases:

1. **Pre-server** — the connection fails before the request arrives. Safe to retry.
2. **Mid-execution** — the server starts processing, then crashes. Retry may re-execute partially completed work.
3. **Post-execution** — the operation succeeded, but the response never reached the client. Retry causes a second execution.

From the client's perspective, phases 2 and 3 are indistinguishable from phase 1. You don't know which phase you're in. That means **retrying without an idempotency key is a data consistency bug dressed up as a reliability feature**.

The fix: include a client-generated `Idempotency-Key` UUID in every mutation request. The server uses it to deduplicate — if it's seen this key, it returns the same result without re-executing. Stripe has done this since 2013. AWS EC2 has had the `ClientToken` parameter for over a decade.

**One gotcha:** idempotency is necessary, but not sufficient. An idempotent operation retried 243 times is still a load problem. Idempotency makes retries *safe*; it doesn't make them *cheap*.

## What to retry — and what to never retry

Not all errors are transient. Retrying a permanent failure wastes resources and delays the inevitable.

| HTTP status | Retry? | Notes |
|---|---|---|
| 408 Request Timeout | Yes | Classic transient |
| 429 Too Many Requests | Yes | Respect `Retry-After` |
| 500 Internal Server Error | Cautiously (2-3 attempts max) | May be non-transient |
| 502 Bad Gateway | Yes | Upstream proxy issue |
| 503 Service Unavailable | Yes | Respect `Retry-After` |
| 504 Gateway Timeout | Yes | Transient |
| 400 Bad Request | **Never** | Fix the request |
| 401 Unauthorized | **Never** | Fix credentials first |
| 403 Forbidden | **Never** | Retrying won't help |
| 404 Not Found | **Never** | (Exception: eventual consistency after creation) |

**500 deserves special caution.** Unlike 503, a 500 doesn't signal that the server is overloaded — it might indicate a bug that will produce the same error on every retry. Retry it 2-3 times, not indefinitely.

**Domain failures are not infrastructure failures.** A payment declined due to insufficient funds is not an error — it's an answer. Retrying it won't change the customer's balance. Shopify's payment systems make this distinction explicit. Retrying a business failure that will never resolve is pure wasted load.

## Keep retries in check: budget + circuit breaker

### Retry budget

Even with jitter and idempotency, concurrent requests can still amplify load. A retry budget caps aggregate retry volume.

Google SRE's hard rule: **retries must stay below 10% of total requests**. Per-request limit: **maximum 3 attempts**.

This limits aggregate retry load to roughly 1.1× normal traffic in the worst case — versus the 243× you get without a budget.

### Circuit breaker

A circuit breaker has three states:

- **Closed** — requests pass through normally
- **Open** — requests fail fast without hitting the downstream service
- **Half-Open** — one test request goes through to check if recovery happened

**The circuit breaker wraps the retry, not the other way around.** If retry runs outside the circuit breaker, retries execute even when the breaker is open — defeating the purpose entirely.

Resilience4j's recommended pipeline order: rate limiter → circuit breaker → retry → timeout → bulkhead.

Circuit breakers are powerful and dangerous. The DoorDash outage happened because a shared circuit breaker scope was too broad — a single slow endpoint opened the circuit for all endpoints sharing the same Envoy configuration. Tune thresholds carefully. Overly sensitive thresholds cause spurious opens; too-lenient thresholds fail to protect.

## Three signals your retry policy is failing

Most teams monitor error rates. Error rates hide retry problems.

**Signal 1: Retry rate above 1-2% consistently.** A retry rate of 1-2% is noise — network transients, brief overloads. Above that, consistently, means the errors are structural. You're not handling a glitch; you're masking a problem.

**Signal 2: Low success-after-retry rate.** If fewer than 30% of retried requests eventually succeed, the failure is likely not transient. Your retries are futile — they're adding load without adding reliability.

**Signal 3: P99 latency spikes that don't show up in error rates.** Retries mask errors while inflating tail latency. Your P50 looks fine. Your P99 is suffering. Users with already-slow connections pay the full cost. Track P99 and P95, not just error rates and averages.

**Bonus signal:** log transient faults as `WARN`, not `ERROR`. Logging retry attempts as errors floods on-call alerting with noise, or worse — desensitizes the team to real errors hiding in the logs.

## The checklist

Before shipping any retry logic:

- [ ] **Full jitter** on backoff, not bare exponential
- [ ] **Idempotency key** on every non-GET mutation you retry
- [ ] **Retry-After header** respected when present
- [ ] **Error classification** — 5xx retried cautiously; 4xx never retried
- [ ] **Max 3 attempts** per request
- [ ] **Circuit breaker wraps retry**, not the reverse
- [ ] **Retry rate metric** tracked and alerted above 2%
- [ ] **P99 latency** monitored alongside error rate
