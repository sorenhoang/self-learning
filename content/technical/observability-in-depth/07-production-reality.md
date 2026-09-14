---
title: "What Changes in Production"
order: 7
tags: ["observability", "prometheus", "distributed-systems"]
date: "2026-09-14"
draft: false
lang: "en"
---

## The lab covers all three pillars, correlated — here's what changes at scale

Everything in this series runs against one Prometheus, single-binary Loki and Tempo, and 100% trace sampling. None of that is wrong for a lab; none of it survives real traffic unchanged. What follows is what actually changes — and, just as important, what doesn't.

## Cardinality governance stops being "by hand"

Chapters 2 and 4 taught the same lesson twice: an unbounded label — a raw path, a `request_id` promoted to a stream label — turns a handful of time series into a number that scales with traffic. At lab scale you catch this by discipline and a before/after `loki_ingester_memory_streams` check. At production scale you need it enforced, not remembered:

- A **cardinality budget** — a hard ceiling on active series per service, checked in code review or CI, not discovered from a paging alert
- Series-count limits and alerting on all three backends (Prometheus, Loki, Tempo), not just careful label design
- The failure mode doesn't change with scale, only the blast radius: one bad label or span attribute can still take down a production Prometheus the same way it would in this lab — [it's a documented, recurring incident pattern](https://openobserve.ai/blog/prometheus-data-cardinality/), not lab-specific paranoia. A production instance holding a million active series typically needs several gigabytes of RAM for the head block alone — cardinality is a capacity-planning number, not just a correctness one.

## Sampling stops being 100%

`API_TRACE_SAMPLE_RATIO=1.0` (Chapter 5) is fine when traffic is tiny. At real volume, tracing every request is prohibitively expensive to store — production typically samples 1–10% and leans harder on **span-metrics** (Chapter 6) for the RED numbers, since those are computed from spans *before* sampling drops most of them. You lose the ability to pull up an arbitrary historical request's full trace; you keep an accurate rate/error/duration picture regardless of sampling rate. That trade only works because Chapter 6 already cross-checked that span-metrics and hand-written metrics agree — if they'd diverged, you couldn't trust the sampled signal to stand in for the full one.

## What else changes

| Area | Lab | Production |
|---|---|---|
| Service discovery | Static Docker Compose targets | Kubernetes/Consul discovery; Pushgateway for short-lived jobs |
| Scale & retention | Single Prometheus; Loki/Tempo single-binary, local disk, 72h/24h retention | Thanos/Cortex/Mimir for HA + long-term storage; Loki/Tempo distributed against object storage, weeks of retention |
| Security | `/metrics` and every UI open, on purpose, for frictionless poking | TLS + auth + network policy on every metrics endpoint and UI |
| On-call | A webhook sink logging payloads | PagerDuty/Opsgenie, escalation policies, silences, runbooks |
| Identifier consistency | A one-time reconciliation table (Chapter 6) | An ongoing operational concern across dozens of services owned by different teams — often automated, not just documented |

Same shapes, same correlation config, same `job`/`service.name` labels doing the same job — just one binary instead of a fleet, and a much shorter memory. [Cloudflare's public account of running Prometheus at scale](https://blog.cloudflare.com/how-cloudflare-runs-prometheus-at-scale/) is worth reading precisely because none of their fixes are exotic — sharding, federation, careful cardinality control — they're this lab's rules, applied at a fleet the lab was never meant to simulate.

## The debate this series didn't resolve on purpose

Everything here teaches "three pillars" as the mental model: metrics, logs, traces, each a separate system, correlated after the fact. That model is genuinely being challenged. In 2025, Honeycomb's Charity Majors argued the three-pillars framing itself is a marketing artifact — "the pillar is a lie" — pointing out that newer observability platforms are converging on a single wide-structured-event store (OTel-native, usually columnar) rather than three separate backends stitched together with exemplars and derived fields.

That's a real architectural direction, not a strawman — and it's not actually in conflict with this series. The three-pillar model is still the right *learning* path: you cannot appreciate why a wide event subsumes a metric, a log line, and a span until you've hand-built all three separately and felt exactly where the seams are — the cardinality rule that recurs three times, the identifier table that has to be pinned by hand, the copy-pasting that correlation exists to remove. Chapter 6's exemplars and derived fields are, functionally, a patch over the fact that these are three different storage systems. Whether your next system is three correlated backends or one wide-event store, the underlying questions — what happened, how much, where did the time go — don't change. Only the storage does.

## Closing

Every number, every bug, and every fix in this series came from actually running [`go-observability-lab`](https://github.com/sorenhoang/go-observability-lab) — the cardinality demo's stream counts, the `span_kind` filtering bug, the goroutine-span trap, all caught live while building the phases this series is structured around. Clone it, run `docker compose up`, break it on purpose, and watch the dashboards react. That's the only way any of Chapters 2 through 6 actually stick.
