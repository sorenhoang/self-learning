---
title: "Metrics — Counters, Histograms, and the Cardinality Trap"
order: 2
tags: ["observability", "prometheus", "golang"]
date: "2026-09-14"
draft: false
lang: "en"
---

## The four metric types

Prometheus has exactly four. Everything you'll ever expose is one of these:

| Type | Direction | Read it via | Example |
|---|---|---|---|
| **Counter** | Only goes up (resets to 0 on restart) | `rate()` — never the raw value | `http_requests_total` |
| **Gauge** | Goes up and down | Directly | `http_requests_in_progress` |
| **Histogram** | Buckets observations | `histogram_quantile()` on `_bucket` | `http_request_duration_seconds` |
| **Summary** | Client-side quantiles | Directly — but see below | rarely; kept here as a teaching contrast |

Here's how `go-observability-lab` registers all four for one HTTP service:

```go
requestsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
    Name: "http_requests_total",
    Help: "Total HTTP requests, by method, route, and status.",
}, []string{"method", "route", "status"}),

requestDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
    Name:    "http_request_duration_seconds",
    Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2, 3},
}, []string{"method", "route"}),

requestDurationSummary: prometheus.NewSummaryVec(prometheus.SummaryOpts{
    Name:       "http_request_duration_summary_seconds",
    Objectives: map[float64]float64{0.5: 0.05, 0.95: 0.01, 0.99: 0.001},
}, []string{"method", "route"}),

requestsInProgress: prometheus.NewGaugeVec(prometheus.GaugeOpts{
    Name: "http_requests_in_progress",
}, []string{"route"}),
```

Naming rules baked in above, worth copying verbatim into your own services:
- `snake_case`, prefixed by subsystem (`http_`, `db_`, `orders_`)
- counters end in `_total`
- base units only — `_seconds`, not `_ms`; the suffix **is** the unit
- the name says *what*, labels say *which* — never `http_requests_get_total`, always `http_requests_total{method="GET"}`

## Why the Summary is a trap

`Objectives: {0.5: ..., 0.95: ..., 0.99: ...}` computes those quantiles **inside your process**, at observation time, before Prometheus ever scrapes anything. That's the trap: if you run 3 replicas, each one bakes its own local P95 into the exposition format. Averaging three P95s across instances is not the fleet's real P95 — it's a number with no defined meaning.

A Histogram exports raw bucket counts (`_bucket`), `_sum`, and `_count` instead. Prometheus aggregates the *buckets* across every instance first, then computes one quantile from the combined data with `histogram_quantile()`. This is the only mathematically valid way to get a fleet-wide percentile — which is why the lab keeps the Summary only as a side-by-side contrast, never as the metric you'd actually alert on.

## Recording RED without missing a panic

The middleware that populates all three RED metrics, unmodified from the lab:

```go
func (m *Metrics) Instrument(routeFunc func(*http.Request) string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            route := routeFunc(r)
            m.requestsInProgress.WithLabelValues(route).Inc()
            defer m.requestsInProgress.WithLabelValues(route).Dec()

            rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
            start := time.Now()

            defer func() {
                status := rec.status
                rp := recover()
                if rp != nil {
                    status = http.StatusInternalServerError
                }

                elapsed := time.Since(start).Seconds()
                m.requestsTotal.WithLabelValues(r.Method, route, strconv.Itoa(status)).Inc()
                m.requestDuration.WithLabelValues(r.Method, route).Observe(elapsed)

                if rp != nil {
                    panic(rp) // re-throw after recording — never swallow
                }
            }()

            next.ServeHTTP(rec, r)
        })
    }
}
```

Three details worth stealing for your own middleware:

1. **The in-progress gauge brackets the whole handler** with `Inc()`/`defer Dec()` — this is the *saturation* signal a counter alone can't give you: a pile of slow requests shows up here before the error rate ever moves.
2. **The recording `defer` runs `recover()` first.** A handler panic still gets counted as `status=500` and the in-progress gauge still decrements — then the panic is re-thrown for `PanicGuard` (Chapter 4) to turn into a clean response. Nothing about instrumentation should ever swallow an error.
3. **`/metrics` itself is never wrapped in this middleware.** Scrape traffic isn't user traffic; counting it would pollute the very RED numbers you're trying to read.

## The cardinality trap: route template vs raw path

This is the mistake that recurs — in a different disguise — in every chapter from here on. A label's cardinality is the number of *distinct values* it can take. Multiply every label's cardinality together and that's how many time series one metric produces.

`route="/users/1"`, `route="/users/2"`, `route="/users/3"` … looks harmless in a demo and is fatal in production: every unique ID mints a brand new time series, forever. The fix is a route **template**, resolved once per request:

```go
// routePattern returns the matched route template, or "other" when nothing
// matched. Phase 2 uses this to keep metric labels bounded.
func routePattern(r *http.Request) string {
    if r.Pattern == "" {
        return "other"
    }
    _, path, ok := strings.Cut(r.Pattern, " ")
    if !ok {
        return "other"
    }
    return path
}
```

`r.Pattern` here is Go 1.22+'s `ServeMux` giving you the matched pattern (`"GET /users/{id}"`) instead of the raw request path — `routePattern` strips the method, leaving `/users/{id}`. Every request to that route, regardless of which ID, becomes the same label value. Bounded cardinality, by construction, not by discipline.

**Never label with:** `user_id`, `order_id`, raw path, email, session id, IP, timestamp, or an unbounded error string. If a value is unique per request, it belongs in a log line (Chapter 4) or a span attribute (Chapter 5) — never a metric label.

## PromQL you'll actually write

| Question | Query |
|---|---|
| Requests/sec | `sum(rate(http_requests_total[5m]))` |
| Requests/sec by route | `sum by (route) (rate(http_requests_total[5m]))` |
| Error ratio | `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))` |
| P95 latency, global | `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))` |
| P95 latency, per route | `histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))` |
| Availability | `avg_over_time(up{job="api"}[5m])` |

The one mistake almost everyone makes once: **`sum(rate(x))`, never `rate(sum(x))`.** A counter's `rate()` needs the raw per-series values to detect resets (a restarted process resets its counter to 0 — `rate()` knows to treat that as a continuation, not a massive negative spike). Sum first and you've thrown that information away before `rate()` ever sees it.

Two more that bite in production, not in a demo:
- **Rate window vs scrape interval.** `[5m]` needs at least ~4x your scrape interval worth of samples, or you get gaps and `NaN`. At a 5s scrape interval, `[5m]` is comfortably safe; don't shrink the window without checking the scrape interval too.
- **Averaging an average.** `avg(http_request_duration_seconds_sum) / avg(http_request_duration_seconds_count)` is not your P95 and isn't even your mean latency in any meaningful sense once traffic isn't uniform across instances. Percentiles come from `histogram_quantile()` on buckets — full stop.

## What's next

Metrics tell you *something* is wrong. Chapter 3 turns a PromQL expression into something that pages a human — recording rules, alert states, and the routing chain in Alertmanager.
