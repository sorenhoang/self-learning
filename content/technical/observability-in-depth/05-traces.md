---
title: "Traces — Spans, Context, and the Goroutine Trap"
order: 5
tags: ["observability", "tracing", "opentelemetry", "golang"]
date: "2026-09-14"
draft: false
lang: "en"
---

## The question metrics and logs can't answer alone

`/orders`'s P95 spiked (metrics). The canonical log line for one slow request shows `duration_ms: 1800` (logs). But *where* did those 1800ms go — the database insert, the cache lookup, the Kafka publish? A **trace** answers that: one request, broken into a tree of timed spans, each attributable to a specific piece of code.

```
POST /orders                              (root span, app)
├── cache.get products                    (only on GET /products)
├── db.orders.insert                      (app, Postgres)
└── kafka.publish orders                  (app, async, ends when the write completes)
        │  traceparent header
        ▼
    consume orders                        (consumer service, a different process)
```

The root span and its synchronous children stay inside one process's call stack via `context.Context` — that part is "free" once a root span exists. The interesting part is the two places a trace has to survive crossing a boundary plain `context.Context` can't reach: a detached goroutine, and a message queue.

## The root span

```go
func TraceHTTP(routeFunc func(*http.Request) string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            ctx := otel.GetTextMapPropagator().Extract(r.Context(), propagation.HeaderCarrier(r.Header))
            ctx, span := Tracer().Start(ctx, routeFunc(r), trace.WithSpanKind(trace.SpanKindServer))
            defer span.End()

            span.SetAttributes(
                attribute.String("http.request.method", r.Method),
                attribute.String("http.route", routeFunc(r)),
            )

            sc := span.SpanContext()
            ctx = contextWithTraceIDs(ctx, sc.TraceID().String(), sc.SpanID().String())

            rec := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
            next.ServeHTTP(rec, r.WithContext(ctx))

            span.SetAttributes(attribute.Int("http.response.status_code", rec.status))
            if rec.status >= http.StatusInternalServerError {
                span.SetStatus(codes.Error, "")
            }
        })
    }
}
```

`otel.GetTextMapPropagator().Extract(...)` reads an incoming `traceparent` header if one exists (a request arriving from an already-traced caller); otherwise this starts a brand new root. The span's IDs get stashed on the context via `contextWithTraceIDs` — that's the same context Chapter 4's log handler reads `trace_id`/`span_id` from, which is how a canonical log line and a trace end up sharing an identifier with zero extra plumbing at the log call site.

## The goroutine-span-lifetime trap

`PublishOrder` fires the actual Kafka write in a `go func()` so the HTTP response doesn't wait on it. The tempting-but-wrong move is to start the `kafka.publish orders` span *inside* that goroutine:

```go
// WRONG — the span has no valid parent by the time this runs
go func() {
    _, span := obs.Tracer().Start(ctx, "kafka.publish orders")
    defer span.End()
    // ...
}()
```

By the time the goroutine actually runs, the HTTP handler may have already returned and the root span may have already ended. Starting a *new* span at that point either attaches to an already-closed parent (most SDKs disallow this and silently drop the relationship) or starts a disconnected orphan trace. Either way, Tempo shows `kafka.publish orders` as its own trace instead of nested under `POST /orders`.

The fix, straight from `internal/events/producer.go`: start the span **synchronously**, before the goroutine, while `ctx` still definitely has a live parent —

```go
// The span is created here, synchronously, on the request goroutine —
// never inside go func() below. By the time that goroutine runs, the
// request's own span may already have ended, so a span started there
// would have no valid parent (an orphan, disconnected from the trace).
// It ends inside the goroutine, once the actual publish completes.
ctx, span := obs.Tracer().Start(ctx, "kafka.publish orders", trace.WithSpanKind(trace.SpanKindProducer))
traceparent := obs.FormatTraceparent(span.SpanContext())

go func() {
    defer span.End()               // ends when the write actually finishes
    writeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)
    defer cancel()
    err := p.writer.WriteMessages(writeCtx, kafka.Message{
        Value: b,
        Headers: []kafka.Header{{Key: "traceparent", Value: []byte(traceparent)}},
    })
    if err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
        return
    }
    p.metrics.OrderPublished()
}()
```

`context.WithoutCancel(ctx)` detaches the goroutine from the request's own cancellation — a client disconnect shouldn't abort an in-flight publish that already has the data — but the *span* object itself was captured by the closure, not looked up from context, so severing cancellation doesn't sever the trace relationship.

## Crossing the Kafka boundary

There's no HTTP request between producer and consumer, so the OTel HTTP propagator doesn't apply. `internal/obs/propagation.go` hand-rolls the same W3C `traceparent` format the propagator would have used:

```go
// "00-<32 hex trace id>-<16 hex span id>-<2 hex flags>"
func FormatTraceparent(sc trace.SpanContext) string {
    flags := byte(0)
    if sc.IsSampled() {
        flags = 1
    }
    return fmt.Sprintf("00-%s-%s-%02x", sc.TraceID(), sc.SpanID(), flags)
}
```

The consumer, a different process entirely, parses it back and reconstructs the parent:

```go
func consumeSpanContext(headers []kafka.Header) (trace.SpanContext, bool) {
    for _, h := range headers {
        if h.Key == "traceparent" {
            return obs.ParseTraceparent(string(h.Value))
        }
    }
    return trace.SpanContext{}, false
}

// in the consume loop:
msgCtx := context.Background()
if sc, ok := consumeSpanContext(msg.Headers); ok {
    msgCtx = trace.ContextWithRemoteSpanContext(msgCtx, sc)
}
_, span := obs.Tracer().Start(msgCtx, "consume orders", trace.WithSpanKind(trace.SpanKindConsumer))
```

If the header is missing or malformed, the consumer still processes the message — it just starts a fresh, disconnected trace instead of erroring. **Never fail a business operation because tracing plumbing was incomplete.**

## Sampling: ParentBased, not per-hop dice

```go
sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(ratio)))
```

`ParentBased` means: if a span already has a sampled parent, keep that decision consistent all the way down — k6 originates a trace, the app's root span honors it, the producer span honors the app's root, the consumer honors the producer's. Only a *new* root trace (no parent at all) actually rolls the `TraceIDRatioBased` dice. The consumer "honoring the sampled flag from the incoming traceparent" isn't extra code — it's just what `ParentBased` does once the remote span context (carrying that flag) becomes the parent.

`ratio = 1.0` samples everything — fine for a lab, prohibitively expensive at real traffic. Production typically drops to `0.05`–`0.1` and leans on span-metrics (Chapter 6) — computed from spans before sampling drops most of them — to keep accurate RED numbers even when full traces are sampled away.

## OTLP: the swappable wire format

```go
func InitTracer(ctx context.Context, service, endpoint string, ratio float64) (func(context.Context) error, error) {
    // ...
    exporter, err := otlptracegrpc.New(ctx,
        otlptracegrpc.WithEndpoint(endpoint),
        otlptracegrpc.WithInsecure(),
    )
    // ...
}
```

Nothing in this app is Tempo-specific — `InitTracer` speaks plain OTLP/gRPC. Swapping Tempo for Jaeger is one environment variable (`API_OTLP_ENDPOINT`), no code change, no new dependency — Jaeger has accepted OTLP natively for years. This is the same "the collector is swappable, the app doesn't know which one it's talking to" property Loki has via Alloy and Prometheus has via the pull model: OTLP does for traces what the exposition format does for metrics.

## Why hand-write every span

`go.opentelemetry.io/contrib/instrumentation/...` packages (`otelhttp`, `otelsql`, …) exist and would remove most of the code in this chapter — that's exactly why the lab hand-writes every span instead. Once you've wired one HTTP span, one DB span, and one Kafka producer/consumer span pair by hand, you understand what any auto-instrumentation library is actually doing under the hood — and you're equipped to judge whether it's doing the right thing for your service before you reach for it.

## What's next

Three pillars, three separate UIs — copy a `trace_id` out of a dashboard, paste it into Tempo, copy a timestamp into Loki. Chapter 6 removes the copy-pasting.
