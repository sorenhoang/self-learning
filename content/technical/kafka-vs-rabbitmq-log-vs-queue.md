---
title: "Kafka vs RabbitMQ: Two Models That Are Converging"
description: "Kafka is a log and RabbitMQ is a queue, until Kafka Share Groups and RabbitMQ Streams started borrowing each other's model. Choose by consumption model, not by product name."
tags: ["kafka", "rabbitmq", "messaging", "system-design", "event-streaming"]
date: "2026-10-13"
draft: false
lang: "en"
---

![Push model (RabbitMQ) vs pull model (Kafka)](https://res.cloudinary.com/dmwr6giop/image/upload/f_auto,q_auto/REPLACE_VERSION/kafka-vs-rabbitmq-push-pull.png)

The textbook answer is "RabbitMQ is a queue, Kafka is a log." It was accurate for years. It is now only accurate *by default*: Kafka 4.2 shipped **Share Groups** (queue semantics), and RabbitMQ has had **Streams** (log semantics) since 3.9. This post compares all four consumption models, because that is the real choice.

## Two philosophies

|  | RabbitMQ (queue) | Kafka (log) |
|---|---|---|
| Broker | Smart: routes, tracks every message | Dumb: appends bytes to a log |
| Consumer | Dumb: receives what it is pushed | Smart: tracks its own offset, pulls batches |
| Delivery | **Push** (flow-controlled by `prefetch`) | **Pull** |
| After consumption | Message is acked, then **deleted** | Record **stays** until retention expires |
| Optimized for | Low latency, flexible routing | Throughput, replay, many independent readers |

The push/pull split explains most downstream differences. A pushing broker must know who is ready, what is unacked and what to redeliver. A pulling consumer only asks "give me records from offset N."

## Classic models: queue vs consumer group

**RabbitMQ queue.** Producers publish to an *exchange*, which routes to queues by binding (`direct`, `topic`, `fanout`, `headers`). Consumers on one queue compete: each message goes to exactly one of them.

```
producer → exchange ──(routing key)──► queue ──push──► consumer A
                                             └─push──► consumer B   (competing)
```

Scaling is easy: add consumers. Ordering is only roughly preserved, and breaks as soon as a message is requeued or processed concurrently.

**Kafka consumer group.** A topic is split into partitions. Within one group, **each partition is read by at most one consumer**.

```
topic (3 partitions) ──► group "billing": c1←p0, c2←p1, c3←p2
                    └──► group "search":  s1←p0,p1,p2          (independent offsets)
```

Two consequences:

- **Ordering per partition** is guaranteed, so a partition key gives per-entity ordering (all events for `order-42` stay in order).
- **Parallelism is capped by partition count.** 3 partitions means at most 3 useful consumers. A slow record blocks everything behind it in that partition (head-of-line blocking).

Also, a second group gets its own full copy of the stream for free, and any group can rewind its offset to replay history. A RabbitMQ queue cannot do either; you would need one queue per subscriber and a republish for replay.

## Kafka borrows the queue: Share Groups

Head-of-line blocking and the partition cap pushed many teams to run RabbitMQ or SQS next to Kafka just for task queues. [KIP-932](https://kafka.apache.org/blog/2026/02/17/apache-kafka-4.2.0-release-announcement/) ("Queues for Kafka") adds a second kind of group. It was Early Access in 4.0, Preview in 4.1 and is production-ready in **Kafka 4.2**.

In a **share group**, the broker hands records to any member that asks. Partitions are no longer owned by one consumer, so **members can outnumber partitions**.

```java
props.put("group.id", "image-resize");
try (var consumer = new KafkaShareConsumer<String, byte[]>(props)) {
  consumer.subscribe(List.of("uploads"));
  while (true) {
    for (var record : consumer.poll(Duration.ofSeconds(1))) {
      try {
        resize(record.value());
        consumer.acknowledge(record, AcknowledgeType.ACCEPT);
      } catch (TransientException e) {
        consumer.acknowledge(record, AcknowledgeType.RELEASE); // redeliver
      } catch (Exception e) {
        consumer.acknowledge(record, AcknowledgeType.REJECT);  // poison, give up
      }
    }
    consumer.commitSync();
  }
}
```

Mechanics that matter:

- **Per-record ack** (`ACCEPT`, `RELEASE`, `REJECT`, and `RENEW` to extend the lock for slow work).
- **Acquisition lock**: a fetched record is locked for 30s by default. If you do not ack in time, it becomes available to others.
- **Delivery attempts are capped** (5 by default), after which the record is archived instead of retried forever.
- **No ordering guarantee.** That is the price of sharing a partition between consumers.

Share Groups vs a RabbitMQ queue:

| | RabbitMQ queue | Kafka Share Group |
|---|---|---|
| Delivery | Push, `prefetch` limits in-flight | Pull, fetched batch is locked |
| Ack | Per message (`ack`/`nack`/`reject`) | Per record (`ACCEPT`/`RELEASE`/`REJECT`/`RENEW`) |
| Redelivery limit | Quorum queues: `delivery-limit` | Delivery-attempt cap (default 5) |
| Dead lettering | Built in: dead-letter exchange | Not a built-in route in what I found, verify for your version |
| Routing | Exchanges, bindings, topic patterns | None, you choose a topic |
| Message after ack | Deleted | Still in the log until retention |
| Per-message TTL, priorities | Yes | No |
| Maturity | Over a decade | GA in 2026, expect rough edges |

Share Groups remove the *capacity* reason to add RabbitMQ. They do not replace its **routing** (one publish fanning out by pattern to many queues), dead-lettering workflow, or per-message TTL and priority.

## RabbitMQ borrows the log: Streams

[RabbitMQ Streams](https://www.rabbitmq.com/docs/3.13/streams) (3.9+) are an append-only, replicated, disk-based log with **non-destructive reads**, offsets and retention, served over a dedicated binary protocol. **Super Streams** (3.11+) partition a stream across several streams, and **Single Active Consumer** ensures one consumer per partition at a time. RabbitMQ's own [comparison page](https://rabbitmq.com/docs/compare/kafka) maps it directly:

| Kafka | RabbitMQ Streams |
|---|---|
| Topic | Super stream |
| Partition | Stream |
| Consumer group (one consumer per partition) | Single Active Consumer per stream |
| Committed offset | Server-side offset tracking by consumer name |
| Retention (time/size) | Retention (age/size) |

```java
Consumer consumer = environment.consumerBuilder()
    .stream("orders")
    .name("billing")                       // enables server-side offset tracking
    .offset(OffsetSpecification.first())   // replay from the start
    .messageHandler((ctx, msg) -> handle(msg))
    .build();
```

Differences that remain:

- A Kafka partition is just a number inside a topic. A RabbitMQ stream is a **first-class named object**, which you can bind, publish to and manage individually.
- Streams give you replay without leaving RabbitMQ, so one broker can serve both a task queue and an event history.
- Kafka's ecosystem (Connect, Kafka Streams, Schema Registry, Flink and Spark connectors) has no real RabbitMQ equivalent.
- Throughput claims in vendor blogs vary widely. Benchmark with your own message size and replication settings.

## All four models side by side

| Need | RabbitMQ queue | RabbitMQ Stream | Kafka consumer group | Kafka Share Group |
|---|---|---|---|---|
| Replay old data | No | Yes | Yes | Limited, records stay but acked ones are not redelivered |
| Many independent readers | One queue each | Yes | Yes (groups) | Not the point |
| Ordering | Weak | Per stream | Per partition | None |
| Parallelism limit | None | Streams count | Partitions | None |
| Per-message retry | Yes | No (offset based) | No (offset based) | Yes |
| Rich routing | Yes | Via super stream key | Key only | Key only |

## When to use which

- **Background jobs, RPC-style work, task distribution** with retries, TTLs and routing: **RabbitMQ queue**.
- **Event backbone**: many teams read the same events, you need replay, audits, stream processing: **Kafka consumer group**.
- **Work-queue load on data that already lives in Kafka**, and you would otherwise add a second broker: **Share Group**, if you accept no ordering and a young feature.
- **You run RabbitMQ and need replay or fan-out to many readers** without a Kafka cluster: **Streams**.

If you already operate one of them, check whether its newer model covers your case before adding the other. Two brokers is a real operational cost. If you need strict per-entity ordering *and* high parallelism, neither share groups nor plain queues give it to you; partitioned logs (Kafka partitions or Super Streams) do.
