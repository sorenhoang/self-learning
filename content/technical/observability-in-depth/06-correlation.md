---
title: "Correlation — Three Pillars, One Click Apart"
order: 6
tags: ["observability", "grafana", "tracing", "prometheus"]
date: "2026-09-14"
draft: false
lang: "en"
---

## What "correlated" actually means

Chapters 2–5 built three pillars that each answer a different question, but live in three separate UIs — read a metric, manually copy a `trace_id`, paste it into Tempo, then copy a timestamp into Loki. Correlation removes the copy-pasting. Three pivots, zero manual tag edits:

1. **Metric → Trace.** Hover a point on the P95 latency line; a diamond (an **exemplar**) appears on sampled points. Click it → jump straight to that exact request's trace.
2. **Log → Trace.** A canonical request line's `trace_id` field becomes a clickable link (a **derived field**) → jumps to the same trace.
3. **Trace → Log.** Any span has a "Logs for this span" button → opens logs filtered to exactly that trace's lines.

## Exemplars: a metric observation carrying a trace pointer

```go
// exemplarFor is the only place the sampled-check lives — every histogram
// observe (HTTP duration, DB query duration) calls this instead of deciding
// on its own whether to attach an exemplar. An exemplar for an unsampled or
// absent span would link to a trace Tempo never actually recorded — an
// unresolvable link is worse than no link, so this returns nil rather than
// guess.
func exemplarFor(ctx context.Context) prometheus.Labels {
    sc := trace.SpanContextFromContext(ctx)
    if !sc.IsValid() || !sc.IsSampled() {
        return nil
    }
    return prometheus.Labels{"trace_id": sc.TraceID().String()}
}

func observeWithExemplar(obs prometheus.Observer, ctx context.Context, v float64) {
    if l := exemplarFor(ctx); l != nil {
        obs.(prometheus.ExemplarObserver).ObserveWithExemplar(v, l)
        return
    }
    obs.Observe(v)
}
```

Both histogram observations that matter — HTTP request duration and DB query duration — call this shared helper instead of duplicating the sampled-check. **No exemplar for an absent or unsampled span, ever.** A `trace_id` pointing at a trace Tempo never recorded just shows an empty search result with no explanation — worse than no link at all.

Exemplars only survive the scrape in **OpenMetrics** format; the plain Prometheus text exposition format has no syntax for them. `EnableOpenMetrics: true` on the `/metrics` handler is what actually lets a client asking for `Accept: application/openmetrics-text` receive them — the `--enable-feature=exemplar-storage` flag on Prometheus is necessary but not sufficient on its own.

## The Grafana-side wiring

Two datasource configs do the actual pivoting — no code, no dashboard-panel-level tag overrides:

```yaml
# Loki datasource: log line's trace_id -> clickable link to Tempo
jsonData:
  derivedFields:
    - name: TraceID
      matcherRegex: "\"trace_id\":\"(\\w+)\""
      url: "${__value.raw}"
      datasourceUid: tempo
```

```yaml
# Tempo datasource: span -> "Logs for this span", span -> span-metrics
jsonData:
  tracesToLogsV2:
    datasourceUid: loki
    filterByTraceID: true
    tags:
      - key: service.name
        value: service
  tracesToMetrics:
    datasourceUid: prometheus
    tags:
      - key: service.name
        value: service
    queries:
      - name: "Request rate (span metrics)"
        query: "sum(rate(traces_spanmetrics_calls_total{$$__tags,span_kind=\"SPAN_KIND_SERVER\"}[5m]))"
```

## The identifier-consistency table

None of this works if the same service is called something different in each pillar:

| Pillar | Where the identifier lives | App value |
|---|---|---|
| Metrics (Prometheus scrape) | `job` label | `api` |
| Traces (OTel resource attribute) | `service.name` | `app` |
| Logs (Alloy stream label) | `service` | `app` |

This lab has a real, pre-existing mismatch: Prometheus's scrape config names the job `api` (inherited from Chapter 1's earliest setup), while traces and logs both call the same service `app`. It doesn't break any of the three pivots above — metric→trace goes through the exemplar's own `trace_id`, not `job`; trace→log matches `service.name` against `service`, and those two *do* agree — but it's exactly the kind of drift that would matter the moment someone tried to correlate on `job` directly. **Pin this table down once, on day one of a real service** — renaming a label after dashboards and alerts already depend on it is far more expensive than naming it right before anything is built on top.

## Cross-checking your own instrumentation

Tempo's `metrics_generator` derives `traces_spanmetrics_calls_total`/`traces_spanmetrics_latency_bucket` straight from span data — the same information Chapter 2's hand-written `http_requests_total`/`http_request_duration_seconds` carry, computed by a completely independent pipeline (a Go middleware incrementing a counter vs. Tempo aggregating spans it already stored). When they agree, that's confirmation the hand-written instrumentation is measuring the same reality a different system also measures.

**A real bug this caught while building the lab:** `traces_spanmetrics_calls_total` isn't scoped to HTTP requests — Tempo derives a metric point for *every* span, so querying `{service="app"}` alone sums root HTTP spans together with `db.orders.insert`, `cache.get products`, and `kafka.publish orders` child spans. Without the `span_kind="SPAN_KIND_SERVER"` filter, the "request rate" panel read **6.8 req/s** against the hand-written metric's **4.1 req/s** at the same instant — not because either number was wrong, but because they were counting different things. Adding the filter brought them to **8.36 vs. 8.27 req/s** — the actual apples-to-apples comparison. Lesson: a cross-check is only valid once both sides are measuring the same thing, and "every span" vs. "HTTP requests" is an easy mismatch to miss.

## The incident walkthrough

```sh
make up
make load          # keep traffic flowing in another shell
make incident       # injects 800ms latency, waits for it to show up
```

1. Open the RED dashboard. The P95 latency panel climbs.
2. Hover the elevated P95 line — a diamond (exemplar) appears. Click it → "View trace in Tempo."
3. In the trace waterfall, the root span's duration matches the injected latency. Click it → **"Logs for this span."**
4. Logs open, scoped to that trace's `trace_id` — the canonical `WARN "chaos injected failure"` line is right there, sharing the exact same `trace_id` you started from on the metric.

Three clicks, zero copy-pasting, three independently-built pillars agreeing on one story.

## What's next

Everything so far runs at lab scale: one Prometheus, single-binary Loki and Tempo, 100% trace sampling. Chapter 7 covers what actually changes — and doesn't — when this moves to production traffic.
