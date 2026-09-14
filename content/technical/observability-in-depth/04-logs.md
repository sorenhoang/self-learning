---
title: "Logs — The Canonical Line and a Label Model You Already Know"
order: 4
tags: ["observability", "logging", "loki", "golang"]
date: "2026-09-14"
draft: false
lang: "en"
---

## What metrics and alerts can't tell you

`/orders` P95 spiked, `HighErrorRate` fired. Neither tells you *which* order failed, *why* (bad product ID? a DB timeout? chaos toggled on?), or lets you find every other line from that same request. That's what logs are for — and structured logging means every line is a JSON object with consistent keys, not a hand-written sentence, so it can be filtered and queried like a database.

## One canonical line per request

Every business, health, and admin request emits **exactly one** `"msg":"request"` JSON line, after the handler returns:

```json
{"time":"...","level":"INFO","msg":"request","method":"GET","route":"/users","request_id":"a1b2c3d4e5f6a7b8","status":200,"duration_ms":1,"bytes_out":142}
```

One wide line per unit of work, instead of a scattered trail of `log.Println` calls at different points in the handler — cheap to grep, cheap to parse, and gives you the request/response shape without reading the code. Here's the middleware that produces it:

```go
func RequestLogger(base *slog.Logger, routeFunc func(*http.Request) string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            logger := base.With(
                "method", r.Method,
                "route", routeFunc(r),
                "request_id", newRequestID(),
            )
            ctx := ContextWithLogger(r.Context(), logger)

            rec := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
            start := time.Now()

            next.ServeHTTP(rec, r.WithContext(ctx))

            level := slog.LevelInfo
            switch {
            case rec.status >= http.StatusInternalServerError:
                level = slog.LevelError
            case rec.status >= http.StatusBadRequest:
                level = slog.LevelWarn
            }

            logger.LogAttrs(ctx, level, "request",
                slog.Int("status", rec.status),
                slog.Int64("duration_ms", time.Since(start).Milliseconds()),
                slog.Int("bytes_out", int(rec.bytes)),
            )
        })
    }
}
```

Severity keys off the response status — `< 400` → INFO, `400–499` → WARN, `>= 500` → ERROR — so a grep for `level=ERROR` is a grep for real problems, not a judgment call made line-by-line at each call site.

## request_id: the correlation key

`newRequestID()` mints 8 random bytes per request; `base.With("request_id", ...)` attaches it to a *derived* logger stashed on the context. Every log line emitted while handling that request — the canonical line, a cache-miss warning, a chaos-injected failure — carries the same `request_id`, so grepping one ID surfaces everything that happened for that request:

```go
func ContextWithLogger(ctx context.Context, l *slog.Logger) context.Context {
    return context.WithValue(ctx, loggerCtxKey, l)
}

func LoggerFrom(ctx context.Context) *slog.Logger {
    if l, ok := ctx.Value(loggerCtxKey).(*slog.Logger); ok {
        return l
    }
    return slog.Default()
}
```

Any function that only has a `context.Context` — a cache layer, an events producer, three call frames deep — gets the exact same request-scoped logger via `obs.LoggerFrom(ctx)`. No logger threaded through function signatures, no global logger losing per-request context.

## What never gets logged

`RequestLogger` only ever reads `r.Method`, the route template, and the final status/byte count — never the request body, the `Authorization` header, or a `?token=` query value. This is redaction **by construction**: there's no regex scrubber to keep in sync with every new secret-shaped field, because the logging code physically never touches those fields in the first place.

## The middleware stack, in order

```
PanicGuard( TraceHTTP( RequestLogger( Instrument( Chaos( handler ) ) ) ) )
```

- **PanicGuard** (outermost) — recovers a panic, logs the stack at ERROR, writes a clean 500. Never re-panics, so nothing above it ever sees one escape.
- **TraceHTTP** — starts the root span (Chapter 5) and stashes `trace_id`/`span_id` on the context *before* `RequestLogger` runs, so the canonical line picks them up automatically.
- **RequestLogger** — the code above.
- **Instrument** — Chapter 2's RED metrics, unchanged.
- **Chaos** — fault injection, emitting its own WARN when it forces a failure.

`/health` skips `Chaos` (it must stay honest) and `TraceHTTP` (nothing worth tracing on a liveness probe). `/metrics` gets no middleware at all — scraping never pollutes application logs, same reasoning as Chapter 2's "don't instrument the instrumentation" rule.

Trace IDs ride into every log line through one decorating `slog.Handler`, not a manual field on each call:

```go
type handler struct{ slog.Handler }

func (h handler) Handle(ctx context.Context, rec slog.Record) error {
    if traceID := TraceIDFromContext(ctx); traceID != "" {
        rec.AddAttrs(
            slog.String("trace_id", traceID),
            slog.String("span_id", SpanIDFromContext(ctx)),
        )
    }
    return h.Handler.Handle(ctx, rec)
}
```

## Loki's label model == Prometheus's label model

A Loki **stream** is uniquely identified by its label set — exactly like a Prometheus time series. Chapter 2's rule carries over unchanged: **stream labels must be a small, bounded set.** `request_id` is exactly the kind of high-cardinality value that must never become a label — here it's a Loki stream label instead of a Prometheus metric label, but it's the same mistake.

Grafana Alloy is the collector that ships stdout to Loki (the push side of the push/pull split from Chapter 1), and it decides, in one place, exactly which fields become labels:

```
// Extract `level` from the app's JSON log line and promote it to a stream
// label; drop everything else that stage.json could have extracted. This is
// the one place cardinality is decided.
loki.process "containers" {
    stage.json {
        expressions = {level = "level"}
    }
    stage.labels {
        values = { level = "" }
    }
    stage.label_keep {
        values = ["service", "container", "level"]
    }
    forward_to = [loki.write.default.receiver]
}
```

Everything else — `route`, `request_id`, `status`, `duration_ms` — stays inside the log line's JSON body, parsed at *query* time with LogQL's `| json`, never promoted to a label at ingest time.

## LogQL

Modeled deliberately on PromQL — a label matcher, then pipeline stages, then an optional aggregation:

```logql
{service="app"}                          # every log line from the app container
{service="app"} | json                    # parse the JSON body into fields
{service="app"} | json | level="ERROR"    # filter by a parsed field

# metrics-from-logs — same shape as PromQL's rate()/sum by
sum by (route) (rate({service="app"} | json | __error__="" [5m]))
```

`__error__=""` filters out lines that failed to parse as JSON, so one malformed line doesn't become its own broken series. When this query's request-rate-by-route agrees with Chapter 2's `http_requests_total`-derived version, that's two completely independent pipelines — a Go middleware incrementing a counter vs. Alloy shipping JSON to Loki — answering the same question the same way.

## The cardinality demo — real numbers

What happens if `request_id` gets promoted to a stream label by mistake (add it to `stage.labels` and `stage.label_keep` above), captured live against this stack under constant load:

| Point in time | `loki_ingester_memory_streams` |
|---|---|
| Baseline (correct config, bounded labels) | **14** |
| +15s after promoting `request_id` to a label | **387** |
| +30s after promoting `request_id` (still climbing) | **770** |

Streams grew **~27x in the first 15 seconds** and kept climbing linearly for as long as traffic kept minting new `request_id`s — it never plateaus, unlike the bounded baseline. Reverting the config stops *new* high-cardinality streams from being created, but Loki doesn't instantly evict the ones already in memory; they age out on the ingester's normal idle/flush schedule. A cardinality mistake doesn't self-heal the moment you fix the config — it takes time to drain, in Loki exactly as it would in Prometheus.

## What's next

Metrics say something's wrong; logs say what happened for one request. Neither says *where the time went* across a multi-hop request. Chapter 5 adds spans — and the one mistake that orphans a trace the instant you fire off a goroutine.
