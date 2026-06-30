---
title: "The Outbox Pattern: Solving the Dual-Write Problem"
description: "Every microservice eventually hits the dual-write trap. The outbox pattern is the right fix — but it moves complexity from your application code into your infrastructure."
tags: ["system-design", "microservices", "distributed-systems", "messaging", "databases"]
date: "2026-06-30"
draft: false
lang: "en"
---

Imagine you're building an order service. When a user places an order, you need to:

1. Write the order to your database
2. Publish an `OrderPlaced` event so the inventory service can reserve stock

Two operations. Two separate systems. One guarantee you can't easily make: **that both succeed or neither does.**

This is the dual-write problem, and it's the reason the outbox pattern exists.

## The trap every team falls into

The naive implementation looks fine until it isn't:

```go
func (s *OrderService) PlaceOrder(ctx context.Context, order Order) error {
    if err := s.repo.Save(ctx, order); err != nil {
        return err
    }
    return s.eventBus.Publish(ctx, OrderPlaced{OrderID: order.ID}) // publishes to Kafka
}
```

This code has two failure windows. The DB write can succeed and the publish can fail — leaving a ghost order that never triggers downstream processing. Or the service crashes between the two lines. You'll ship it, it'll work in dev, and then at 2am on a Tuesday a network blip will eat an event and a customer's package won't ship.

Wrapping this in error checks doesn't help. The event is either not sent, or it's sent but the rollback fails silently. There's no distributed transaction that cleanly spans a relational database and a message broker without significant protocol overhead (2PC, anyone?).

## The outbox idea

The fix is conceptually simple: **make the event part of the database transaction**.

Instead of publishing to the broker directly, write the event to an `outbox` table in the same database — inside the same transaction as your business entity.

```sql
CREATE TABLE outbox_events (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_type TEXT NOT NULL,
    aggregate_id   TEXT NOT NULL,
    event_type     TEXT NOT NULL,
    payload        JSONB NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    published_at   TIMESTAMPTZ         -- NULL = unpublished
);
```

Now your service code becomes:

```go
func (s *OrderService) PlaceOrder(ctx context.Context, order Order) error {
    return s.db.WithTx(ctx, func(tx *sql.Tx) error {
        if err := s.repo.SaveTx(ctx, tx, order); err != nil {
            return err
        }
        return s.outbox.InsertTx(ctx, tx, OutboxEvent{
            AggregateType: "Order",
            AggregateID:   order.ID.String(),
            EventType:     "OrderPlaced",
            Payload:       mustMarshal(OrderPlaced{OrderID: order.ID}),
        })
    })
}
```

If the transaction commits, both the order row and the outbox row exist. If it rolls back, neither does. The database's ACID guarantees are doing the work — no broker involved at commit time.

## The relay: who actually publishes the event?

A separate process — the **relay** — reads unpublished rows and pushes them to the broker. You have two approaches.

**Polling** is the right starting point. A scheduler queries for rows where `published_at IS NULL`, publishes each one, then marks it done.

```go
func (r *Relay) Run(ctx context.Context) {
    ticker := time.NewTicker(time.Second)
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            events, _ := r.outbox.FindUnpublished(ctx, 100)
            for _, e := range events {
                r.broker.Publish(ctx, e)
                r.outbox.MarkPublished(ctx, e.ID)
            }
        }
    }
}
```

Works on any database. Easy to understand, easy to test. The tradeoff: you're burning DB queries in a loop, and there's inherent latency between commit and publish (typically 0.5–5 seconds).

**CDC (Change Data Capture)** is the approach for high-volume systems. Tools like [Debezium](https://debezium.io/) tail the database's write-ahead log (WAL), detect inserts into the outbox table, and stream them to Kafka in near real-time — with strong ordering and no polling overhead.

| | Polling | CDC (Debezium) |
|---|---|---|
| Latency | 0.5–5s | Near real-time |
| Throughput | Good | High |
| Setup | A cron job | Debezium + Kafka Connect |
| Ordering | Per-query | WAL-based, strong |
| Ops burden | Low | Higher |

Start with polling. Graduate to CDC when latency or throughput actually demand it.

## What you're actually signing up for

The outbox pattern doesn't eliminate complexity — it relocates it from your application code into your infrastructure. Before you adopt it, know the costs:

**At-least-once delivery, not exactly-once.** If the relay crashes after publishing but before marking the row as done, the event is sent again on restart. Every consumer must be idempotent — use the event's `id` to detect and skip duplicates.

**Table growth.** The outbox table accumulates rows. Published rows need cleanup: delete them after a retention window, or partition the table by date and drop old partitions. Neglect this and you'll eventually be doing emergency maintenance on a 50-million-row table.

**Poison messages.** A malformed event payload fails on every retry, blocking the relay from processing subsequent events. You need a dead-letter strategy: detect events that have failed N times, park them in a DLQ, alert on them, and continue.

**A new process to run.** The relay is infrastructure now. It needs deployment, health checks, alerting, and crash recovery. In a Kubernetes cluster, that's a Deployment, a PodDisruptionBudget, and log monitoring. Not enormous, but not free either.

## When to reach for it — and when not to

**Reach for it when:**
- A DB transaction must reliably trigger a downstream event
- You're already running a message broker
- Event loss causes real business problems — payments, inventory, notifications, billing

**Consider alternatives when:**
- You don't have async messaging yet and are tempted to add broker + relay + outbox table preemptively
- You can tolerate eventual consistency without strict ordering — a simple retry queue or idempotent HTTP callback may be enough
- You're using Event Sourcing — your event log already *is* the outbox; you don't need a separate table

The pattern is the right tool for a specific problem. If you've been bitten by silently dropped events in production, the outbox is worth every bit of operational cost. If you're adding it speculatively to a service that fires two events a day, you're building complexity ahead of the need.

## The one thing to hold onto

The outbox pattern gives you a precise guarantee: an event is published **if and only if the database transaction commits**. Nothing more, nothing less. It's at-least-once delivery. Consumers still need to be idempotent. The relay still needs to run. The table still needs cleanup.

But when you need that guarantee — and in distributed systems, you will — the outbox pattern is the cleanest way to get it without pulling in a distributed transaction protocol.
