---
title: "Why Observability — The Problem Three Pillars Solve"
order: 1
tags: ["observability", "monitoring"]
date: "2026-09-13"
draft: false
lang: "en"
---

## The problem

A service is running in production. A user says "it's slow." You have SSH access and `top`. Now what?

Without instrumentation, you're guessing:

- Requests/sec right now — is that normal?
- Slow for everyone, or just the unlucky P99?
- All endpoints, or one?
- Started 5 minutes ago, or degrading for a day?
- CPU, memory, a downstream dependency, or lock contention?

**Observability** is the property of a system that lets you answer these *from the outside*, without shipping a new build to add a `printf`. This series builds that property in Go, from zero, against [`go-observability-lab`](https://github.com/sorenhoang/go-observability-lab) — a lab stack you can run locally with `docker compose up`.

## Three pillars, three different questions

| Pillar | What it is | Answers | Tool in this series |
|---|---|---|---|
| **Metrics** | Numeric time series, cheap, aggregatable | "How much / how fast" — rates, percentiles, trends, alerts | Prometheus + Grafana |
| **Logs** | Timestamped structured events | "What exactly happened, for this one request" | Loki |
| **Traces** | One request's path across services, timed per hop | "Where did the 800ms go" | Tempo |

They're complementary, not redundant:

```
metric   → "P95 on /orders spiked at 14:32"        (something's wrong, roughly where)
log      → "order_id=4471 failed: product not found"  (what exactly happened)
trace    → db.orders.insert took 780ms of that 800ms  (which hop, exactly)
```

A metric alone tells you to look. A log or trace tells you what you'll find.

## RED and USE — what to actually watch

For anything request-driven (an HTTP API, a queue consumer), watch three signals — **RED**:

- **R**ate — requests/sec
- **E**rrors — failed requests/sec, or as a ratio
- **D**uration — the latency *distribution* (P50/P95/P99), never the average

For a resource (CPU, a connection pool, disk) — its sibling, **USE**:

- **U**tilization — % time busy
- **S**aturation — how much work is queued beyond capacity
- **E**rrors — resource-level errors (rejected connections, OOM kills)

RED is the "if you only build one dashboard" dashboard. USE is what you add once you're chasing a saturation problem RED can only hint at (Chapter 2 covers why an average latency hides exactly the request you care about).

## Pull vs push — same app, opposite collection model

Metrics, logs, and traces don't just answer different questions — they get collected in opposite directions, and your application code doesn't know either one exists beyond emitting its own output:

| Pillar | Model | Mechanism |
|---|---|---|
| Metrics (Prometheus) | **Pull** | Prometheus scrapes your app's `/metrics` on an interval. The app never pushes anywhere. |
| Logs (Loki) | **Push** | Your app writes plain JSON to stdout. A collector (Grafana Alloy) tails it and pushes to Loki. |
| Traces (Tempo) | **Push** | Your app's OpenTelemetry SDK batches spans and pushes them over OTLP. |

This distinction matters the first time a dashboard shows `up == 0` (Prometheus can't reach your app) versus an empty Loki panel (your app is fine, the collector isn't running) — same symptom, opposite side of the wire failed.

## What this series builds

Seven chapters, each grounded in a real phase of the lab repo, with real bugs and real before/after numbers instead of toy examples:

1. **Why observability** — this chapter
2. **Metrics** — Counter/Gauge/Histogram, PromQL correctness, the cardinality trap
3. **Alerting** — recording rules, `for:` windows, Alertmanager routing
4. **Logs** — the canonical log line, Loki's label model, a live cardinality blowup
5. **Traces** — spans, the goroutine trap, propagation across Kafka
6. **Correlation** — exemplars, derived fields, one incident click-through
7. **Production reality** — what changes at scale, and where the "three pillars" model is being challenged

Next: [Chapter 2](./02-metrics) — the four metric types, the one PromQL mistake almost everyone makes once, and the cardinality trap that recurs in every pillar from here on.
