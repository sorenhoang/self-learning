---
title: "PostHog's Architecture: What Kafka, ClickHouse, and Feature Flags Teach You"
description: "Skip the product pitch. PostHog is worth studying for its ingestion pipeline and its feature-flag latency fix — two patterns worth stealing whether or not you ever touch the product."
tags: ["system-design", "distributed-systems", "messaging", "feature-flags", "analytics"]
date: "2026-07-06"
draft: false
lang: "en"
---

PostHog is a platform teams embed in their product (a few lines of SDK code in the frontend and/or backend) to answer a question every product team eventually asks: what are our users actually doing, and can we change their experience without shipping a new release? It bundles several tools that used to be separate products into one:

- **Product analytics** — every click, page view, and custom event you send gets logged, so you can build funnels ("how many people who viewed the pricing page actually signed up?") and retention charts ("do users who invite a teammate stick around longer?") instead of guessing.
- **Session replay** — literal video-like playback of a real user's session (mouse movement, clicks, scrolling) reconstructed from recorded DOM events. Useful for the bug reports that say "it's broken" with no other detail — you watch what actually happened.
- **Feature flags** — a way to turn a feature on for a subset of users (5% of traffic, everyone on a certain plan, a specific list of user IDs) without redeploying code. Covered in depth below.
- **Experiments (A/B testing)** — built on top of feature flags: show variant A to half your users and variant B to the other half, then compare their behavior using the analytics data you're already collecting.
- **Surveys** — in-app popups to ask users direct questions, tied to the same user/event data as everything else.
- **A CDP (Customer Data Platform)** — routes the same event stream to other tools (email, ads, data warehouses) so you don't have to instrument your product separately for each destination.

That's the sales pitch, and it's a genuinely useful one: one SDK, one event schema, and all of the above come from the same data instead of five separate vendors each needing their own tracking snippet. But this post isn't about the product surface — it's about what's underneath it: how one pipeline stays fast and durable under load, and a specific latency fix in the feature-flag system that generalizes to any codebase using remote config.

Two things are worth stealing: the ingestion architecture, and the way PostHog moved feature flag evaluation off the network entirely.

## Durable ingestion: Kafka before ClickHouse

Every product event — a click, a page view, a flag check — has to survive a chain of services without getting lost, and has to be queryable in near-real time afterward. PostHog's answer is a familiar shape if you've seen the [outbox pattern](/technical/outbox-pattern): don't write directly into your query store, write into a durable log first.

Capture happens in Rust microservices, chosen for the high-throughput paths (event capture, flag evaluation) where every millisecond of overhead multiplies across millions of requests. From there, events don't land in [ClickHouse](https://posthog.com/docs/how-posthog-works/clickhouse) directly — they go through Kafka first.

**Kafka**, if you haven't used it, is a message queue with one twist that matters here: once a message is written, it isn't deleted when a consumer reads it. It stays on the log for a configured retention window, so if the consumer crashes or the downstream database is down, nothing is lost — the consumer just resumes reading from where it left off once it's back. That's the property PostHog is buying: a ClickHouse hiccup doesn't mean a lost event, it means a backlog sitting safely in Kafka that drains once ClickHouse recovers. It's the same instinct as the outbox table linked above — a durable buffer between the producer and the store.

**ClickHouse** is a column-oriented database, which is the detail that explains why it's the right tool here. A row-oriented database like Postgres stores each record together, which is fast for "fetch everything about user #42." A column-oriented database stores each *field* together across all records, which is fast for "average the `duration` field across 50 million events" — the exact shape of an analytics query, and a bad shape for one-off row lookups. [PostHog benchmarked ClickHouse](https://posthog.com/docs/how-posthog-works/clickhouse) against Pinot, Presto, and Druid — it won on compression (beating even serialization formats like Parquet and ORC on disk size) and query speed for wide, append-heavy event tables. Production runs it sharded (data split across machines so no single node holds it all) and replicated (each shard copied onto more than one machine) — the same tradeoff you'd make with any horizontally-scaled store: more moving parts, in exchange for surviving a node loss without losing write availability.

None of this is novel by itself. What's worth noticing is the shape: **producer → durable log → query store**, applied to analytics ingestion instead of database writes. If you've internalized the outbox pattern for one use case, you already understand why PostHog's pipeline looks the way it does.

## The feature-flag case study

This is the part worth reading closely, because PostHog wrote up their own numbers.

A **feature flag** is a runtime switch checked in application code — something like `if (flags.isEnabled("new-checkout", userId)) { ... }` — that decides whether a given user sees a feature, without a new deploy. The rule behind it can be as simple as "on for everyone" or as specific as "on for 10% of users in the EU who signed up after March." The check itself looks harmless: "is this user in the rollout cohort?" But if that check is a network call — hit an API, query a database, get an answer — you've quietly added a remote dependency to a code path that probably runs on every request. That's [remote evaluation](https://posthog.com/docs/feature-flags/local-evaluation), and it's the default mental model most people have for feature flags: ask a service, get a boolean back.

PostHog measured what that costs. When flag evaluation depended on Postgres and PgBouncer for every check, [p99 latency sat around 500ms](https://posthog.com/blog/how-we-improved-feature-flags-resiliency). Worse, a slow database — a deadlock, a stuck transaction, a saturated connection pool — was harder to handle than a database that was simply down, because a timeout has to actually elapse before you can fail over.

The fix is **local evaluation**: instead of asking "is this user in the cohort?" on every request, the SDK periodically pulls down the flag *definitions* — the rules, not the answers — and evaluates them in-process. [PostHog's SDKs default to a 30-second poll interval](https://posthog.com/docs/feature-flags/local-evaluation) for those definitions, which means a flag check becomes a plain function call over data you already have in memory. No network round-trip, no dependency on a downstream service being healthy.

There's a second wrinkle: local evaluation still needs the definitions to have loaded before you can use them. A server can bootstrap in-process, but a page load can't wait 30 seconds for the first poll. [Bootstrapping](https://posthog.com/docs/feature-flags/bootstrapping-and-local-evaluation) solves the cold start by having the backend compute flag values for the current user server-side, then handing those precomputed values to the frontend at render time — the client starts with correct answers instead of a default while it waits for its first fetch.

After shipping local evaluation, caching, and tighter database statement timeouts, PostHog's p99 dropped to somewhere in the 80–300ms range depending on scenario — and notably, p99 during an actual outage came in *lower* than the pre-fix baseline, because degraded-but-cached beats waiting on a dead connection pool.

The generalizable lesson isn't "use PostHog's SDK." It's this: **any remote flag or config check you add is a network dependency you've put on your hot path**, whether it's a feature flag service, a config server, or a database lookup gating a code branch. "Poll the rules periodically, evaluate them locally, precompute for the cold start" is a pattern you can apply to your own config system regardless of vendor.

## Where the architecture leaks into your bill

The same pipeline that makes flags fast has a side effect on the analytics side: [autocapture](https://posthog.com/docs/product-analytics/autocapture) captures first and lets you filter later. It's on by default, and it will happily record clicks on your navbar, your footer, every low-value interaction on the page — because the ingestion layer doesn't know which click matters, it just knows a click happened.

That's why `ph-no-capture` exists as an opt-out class rather than autocapture being opt-in per element — [PostHog's own guidance on capturing fewer unwanted events](https://posthog.com/tutorials/fewer-unwanted-events) is essentially "here's how to tell the pipeline what to ignore," after the fact. It's a direct consequence of the architecture: capture is cheap and generic, so the pipeline defaults to capturing everything and pushes the judgment call to you.

## The one real decision: self-host or Cloud

Everything above — Kafka, sharded ClickHouse, the flag evaluation path — is infrastructure you either rent or run. [PostHog's self-host docs](https://posthog.com/docs/self-host) are honest about the tradeoff: self-hosting means you're operating that Kafka-and-ClickHouse pipeline yourself, on your own Kubernetes cluster, with your own on-call rotation for it. That's not a checkbox next to "use their SaaS instead" — it's adopting a distributed system as an operational responsibility.

That's the actual decision point, and it's worth making explicitly rather than defaulting into it: do you need the data control or cost profile badly enough to run this pipeline yourself, or would you rather have someone else own the Kafka consumer lag at 3am?

## Takeaway

You don't need to adopt PostHog to get value from how it's built. Durable-log-before-query-store is a pattern worth applying anywhere you ingest events you can't afford to lose. And the feature-flag fix is a concrete, measured argument for a rule that applies to any remote-config system: if a check runs on every request, it shouldn't require a network round-trip to answer.
