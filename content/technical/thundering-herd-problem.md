---
title: "The Thundering Herd Problem: A Practical Playbook"
description: "Every thundering herd is a synchronization bug. Here's how to spot the four common triggers and match each one to the right fix."
tags: ["system-design", "caching", "distributed-systems", "reliability", "scalability"]
date: "2026-08-31"
draft: false
lang: "en"
---

A single cache key expires. In the next 50 milliseconds, 8,000 requests miss the
cache, each fires the same expensive query, and the database that comfortably
handled steady traffic falls over. Nothing changed about total demand. What
changed is that 8,000 independent requests suddenly acted as one.

That is the thundering herd: work that should be spread out arrives as a spike
because something synchronized it. The fix is almost never "add capacity" — it's
"break the synchronization."

## Where herds come from

Four triggers cover most incidents:

**Cache expiry.** A hot key expires and every concurrent reader rebuilds it. The
more popular the key, the worse the stampede — popularity and blast radius scale
together.

**Retry storms.** A downstream service hiccups. Every caller retries. If they all
use the same fixed backoff (or none), the retries land in lockstep and turn a
100ms blip into a sustained outage. The retries become the load.

**Cron alignment.** Every job scheduled for `0 0 * * *` fires at exactly
midnight. Every daily report, cache warm, and cleanup task contends for the same
connections at the same second.

**Reconnect after restart.** You deploy, or a load balancer drops a node. Every
client that was connected reconnects — simultaneously — and the connection
handshake storm hits harder than the steady-state traffic ever did.

Different surfaces, same shape: things that were independent got a shared clock.

## Jitter: desynchronize everything

The cheapest fix, and the one you should apply by default: add randomness so
events that used to coincide now smear across a window.

- **TTL jitter.** Instead of a flat 3600s TTL, use `3600 + random(-300, 300)`.
  Keys written together stop expiring together.
- **Retry jitter.** Exponential backoff alone doesn't help if every client
  computes the same delays. Add full jitter: `sleep = random(0, min(cap, base * 2^attempt))`.
  AWS's [research on backoff](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
  showed full jitter minimizes both contention and completion time.
- **Cron jitter.** Offset each job by a random 0–600s, or hash the job name into
  an offset so it's stable but spread.
- **Reconnect jitter.** After a disconnect, wait `random(0, 30s)` before
  reconnecting instead of retrying immediately.

Jitter doesn't reduce work. It spreads the same work over time so the peak never
forms. For retry storms and cron alignment, it's often the entire fix.

## Coalesce: one worker does the work

Jitter helps when the herd is spread across time. It does nothing for the case
where N requests genuinely arrive at once and all need the same missing value.
There, the answer is to make N-1 of them wait for the one.

**In-process: single-flight.** When a request finds the key missing, it takes a
lock keyed by the cache key, does the rebuild, and every other request for that
same key blocks on the lock and gets the result the first one produced. Go's
`golang/x/sync/singleflight` is the canonical implementation; most languages have
an equivalent or it's ~20 lines.

```go
value, err, shared := group.Do(cacheKey, func() (any, error) {
    return expensiveRebuild(cacheKey)
})
```

One in-flight rebuild per key per process, no matter how many callers.

**Across nodes: a distributed lock.** Single-flight is per-process, so with 30
app servers you still get up to 30 concurrent rebuilds. If that's too many, guard
the rebuild path with a short-lived lock in Redis (`SET key value NX PX 5000`).
The winner rebuilds; the losers either wait briefly and re-read, or serve the
stale value. Keep the lock TTL short and always have a fallback for when the lock
holder dies mid-rebuild.

Don't reach for the distributed lock first. Per-process single-flight plus the
next section usually gets concurrency low enough that a 30x rebuild is fine.

## Keep the cache warm

The stampede needs a moment where the cache is empty. Remove that moment.

**Stale-while-revalidate.** Store the value with a logical expiry that's earlier
than the actual eviction. After the logical expiry, serve the stale value
immediately and kick off one background refresh. Readers never block on a
rebuild; they just occasionally get a value that's a few seconds old. HTTP has
this as a [`Cache-Control` directive](https://www.rfc-editor.org/rfc/rfc5861);
the same idea works in any cache layer.

**Probabilistic early expiration (XFetch).** Instead of a hard expiry, each
reader rolls the dice on every hit: recompute early with a probability that rises
as expiry approaches. From [Vattani et al.](https://cseweb.ucsd.edu/~avattani/papers/cache_stampede.pdf),
the check is:

```text
now - delta * beta * ln(random())  >=  expiry
```

where `delta` is how long the last recompute took, `beta` defaults to 1, and
`random()` is uniform in (0, 1). Because `delta` scales the window, expensive
values get refreshed further ahead of expiry. The key property: **no
coordination**. Each process decides independently, and statistically one reader
refreshes early while the rest keep hitting a valid cache. It never goes cold, and
there's no lock.

XFetch and stale-while-revalidate compose well: XFetch to trigger the refresh
early, stale-while-revalidate semantics so the triggering request doesn't pay for
it.

## When the stampede is legitimate

Sometimes the herd is real demand — a product launch, a celebrity tweet, a
flash sale. No amount of jitter or coalescing changes the fact that a million
people want the same thing in the same minute. Here you protect the system
instead of smoothing the input:

- **Load shedding.** Past a concurrency or queue-depth threshold, reject new work
  fast with a 503 and a `Retry-After` rather than accepting everything and
  collapsing. A served error beats a timeout.
- **Concurrency limits.** Cap in-flight requests to the slow dependency with a
  semaphore. Excess requests queue with a deadline or bounce immediately.
- **Circuit breakers.** When a downstream is failing, stop calling it for a
  cooldown window. This also breaks retry storms — the breaker opens before the
  retries pile up.

These don't make the herd go away. They make sure the herd degrades the system
gracefully instead of taking it down.

## Match the fix to the trigger

| Trigger | First reach for | Add if needed |
|---|---|---|
| Cache expiry | Single-flight + XFetch / stale-while-revalidate | Distributed lock on rebuild |
| Retry storms | Exponential backoff with full jitter | Circuit breaker |
| Cron alignment | Random or hashed schedule offsets | Concurrency limit on shared resources |
| Reconnect after restart | Randomized reconnect delay | Server-side connection rate limiting |
| Legitimate demand spike | Load shedding + concurrency limits | Pre-warmed cache, capacity planning |

The through-line: a thundering herd is independent actors that picked up a shared
clock. Find the clock — an expiry, a backoff constant, a cron string, a
reconnect loop — and add noise to it. Reach for locks and breakers only when the
demand is real and the noise isn't enough.
