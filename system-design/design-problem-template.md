---
title: "Design Problem Template"
description: "The 7-step structure every design problem in this section follows: requirements, estimation, entities, API, high-level design, deep dives, wrap-up."
tags: ["system-design", "interview"]
date: "2026-11-10"
---

> **TL;DR**: Every problem in *Design Problems* follows the same 7 steps: **Requirements → Estimation → Core Entities → API → High-Level Design → Deep Dives → Wrap-up**. Learn the shape once, then spend your energy on the trade-offs.

This merges the most common interview frameworks: Alex Xu's 4 steps (*System Design Interview*, Vol. 1 & 2), the [Hello Interview delivery framework](https://www.hellointerview.com/learn/system-design/in-a-hurry/delivery), and Grokking / DesignGurus. They all agree on one rule: **scope first, simple design second, depth last.**

## The structure

| # | Step | Time (45 min) | Output |
|---|---|---|---|
| 1 | Requirements | ~5 min | Top 3 functional, quantified non-functional, out of scope |
| 2 | Estimation *(optional)* | ~2 min | Only the numbers that change a decision |
| 3 | Core Entities | ~2 min | The nouns the system stores and moves |
| 4 | API | ~5 min | One endpoint per functional requirement |
| 5 | High-Level Design | ~10–15 min | Boxes and arrows that satisfy the functional requirements |
| 6 | Deep Dives | ~10–15 min | Changes that satisfy the non-functional requirements |
| 7 | Wrap-up | ~3 min | Trade-offs, bottlenecks, next steps |

<figure class="diagram">
<svg viewBox="0 0 780 110" role="img" aria-label="45-minute timeline: requirements, estimation, entities and API take the first 14 minutes; high-level design about 15 minutes; deep dives about 13 minutes; wrap-up the last 3 minutes.">
  <text x="10" y="20" class="small">0 min</text><text x="770" y="20" text-anchor="end" class="small">45 min</text>
  <rect class="box" x="10" y="30" width="86" height="44" rx="4"/><text x="53" y="57" text-anchor="middle" class="small">Req · 5</text>
  <rect class="box muted" x="96" y="30" width="35" height="44" rx="4"/><text x="113" y="57" text-anchor="middle" class="small">Est</text>
  <rect class="box muted" x="131" y="30" width="35" height="44" rx="4"/><text x="148" y="57" text-anchor="middle" class="small">Ent</text>
  <rect class="box" x="166" y="30" width="86" height="44" rx="4"/><text x="209" y="57" text-anchor="middle" class="small">API · 5</text>
  <rect class="box accent" x="252" y="30" width="258" height="44" rx="4"/><text x="381" y="57" text-anchor="middle" class="title">High-Level Design · ~15</text>
  <rect class="box ok" x="510" y="30" width="208" height="44" rx="4"/><text x="614" y="57" text-anchor="middle" class="title">Deep Dives · ~12</text>
  <rect class="box muted" x="718" y="30" width="52" height="44" rx="4"/><text x="744" y="57" text-anchor="middle" class="small">Wrap</text>
  <text x="131" y="98" text-anchor="middle" class="small">~1/3: agree on WHAT</text>
  <text x="510" y="98" text-anchor="middle" class="small">~2/3: design + depth</text>
</svg>
<figcaption>Where the 45 minutes go. Most of the time goes to design and deep dives, but they only work if the first 15 minutes nailed the scope.</figcaption>
</figure>

<figure class="diagram">
<svg viewBox="0 0 780 120" role="img" aria-label="Flow: Requirements, Entities and API define what to build. High-level design makes it work. Deep dives make it scale and survive failure. Wrap-up summarises trade-offs.">
  <defs><marker id="arr-tpl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L10,5 L0,10z"/></marker></defs>
  <rect class="box" x="10" y="30" width="220" height="56" rx="8"/>
  <text x="120" y="54" text-anchor="middle" class="title">1–4 · What</text>
  <text x="120" y="74" text-anchor="middle" class="small">requirements, entities, API</text>
  <rect class="box accent" x="280" y="30" width="160" height="56" rx="8"/>
  <text x="360" y="54" text-anchor="middle" class="title">5 · Make it work</text>
  <text x="360" y="74" text-anchor="middle" class="small">high-level design</text>
  <rect class="box ok" x="490" y="30" width="160" height="56" rx="8"/>
  <text x="570" y="54" text-anchor="middle" class="title">6 · Make it scale</text>
  <text x="570" y="74" text-anchor="middle" class="small">deep dives</text>
  <rect class="box muted" x="690" y="30" width="80" height="56" rx="8"/>
  <text x="730" y="62" text-anchor="middle" class="title">7</text>
  <path class="line" d="M230 58 H278" marker-end="url(#arr-tpl)"/>
  <path class="line" d="M440 58 H488" marker-end="url(#arr-tpl)"/>
  <path class="line" d="M650 58 H688" marker-end="url(#arr-tpl)"/>
</svg>
<figcaption>Define first, make it work second, harden it last.</figcaption>
</figure>

## Template

Copy this skeleton for every problem. Notes in *italics* say what goes there.

### 1. Requirements

- **Functional**: *"Users should be able to…"*. Pick the top 3 and list the rest as out of scope.
- **Non-functional**: *"The system should be…"*, always with numbers. Write *"feed loads in < 200 ms"*, not *"low latency"*. Check consistency vs availability (CAP), scale, latency, durability and security.

> Ask clarifying questions before drawing anything: who the users are, how many, read-heavy or write-heavy, and which features matter most. A wrong scope sinks the whole design.

### 2. Estimation *(optional)*

```text
DAU × actions/day ÷ 86,400   → average QPS (× 2–3 for peak)
objects/day × size × 365 × N → storage after N years
```

Only compute numbers that change a decision, e.g. *"does it fit in memory on one machine?"* Otherwise skip it and say so.

### 3. Core Entities

List the main nouns, e.g. `User`, `Post`, `Follow`. Don't write a full schema yet. Add fields during step 5 when you need them.

### 4. API

```text
POST /posts           -> Post
GET  /posts/:id       -> Post
GET  /feed?cursor=... -> Post[]
```

Use REST by default. Reach for WebSocket, gRPC or GraphQL only with a reason. Take `userId` from the auth token, never from the request body.

### 5. High-Level Design

Walk through each endpoint and draw what serves it: client → load balancer / gateway → services → DB / cache / queue. Make the functional requirements work with the **simplest** design, note the bottlenecks you see, and come back to them in step 6.

<figure class="diagram">
<svg viewBox="0 0 780 250" role="img" aria-label="Generic high-level design: client calls a load balancer or API gateway, which routes to stateless services. Services read from a cache, fall back to the database, and push slow work to a queue that workers consume. Blob storage plus CDN serve large files.">
  <defs><marker id="arr-tpl-2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L10,5 L0,10z"/></marker></defs>
  <rect class="box" x="10" y="100" width="100" height="50" rx="8"/><text x="60" y="130" text-anchor="middle">Client</text>
  <rect class="box" x="150" y="90" width="130" height="70" rx="8"/><text x="215" y="120" text-anchor="middle" class="title">LB / Gateway</text><text x="215" y="140" text-anchor="middle" class="small">auth, rate limit</text>
  <rect class="box accent" x="320" y="90" width="140" height="70" rx="8"/><text x="390" y="120" text-anchor="middle" class="title">Services</text><text x="390" y="140" text-anchor="middle" class="small">stateless, scale out</text>
  <rect class="box" x="510" y="20" width="120" height="44" rx="8"/><text x="570" y="47" text-anchor="middle">Cache</text>
  <rect class="box" x="510" y="103" width="120" height="44" rx="8"/><text x="570" y="130" text-anchor="middle">Database</text>
  <rect class="box" x="510" y="186" width="120" height="44" rx="8"/><text x="570" y="213" text-anchor="middle">Queue</text>
  <rect class="box ok" x="670" y="186" width="100" height="44" rx="8"/><text x="720" y="213" text-anchor="middle">Workers</text>
  <rect class="box muted" x="150" y="196" width="130" height="44" rx="8"/><text x="215" y="223" text-anchor="middle" class="small">Blob store + CDN</text>
  <path class="line" d="M110 125 H148" marker-end="url(#arr-tpl-2)"/>
  <path class="line" d="M280 125 H318" marker-end="url(#arr-tpl-2)"/>
  <path class="line" d="M460 110 L508 48" marker-end="url(#arr-tpl-2)"/><text x="488" y="98" class="small">1. read</text>
  <path class="line" d="M460 125 H508" marker-end="url(#arr-tpl-2)"/><text x="470" y="118" class="small">2. miss</text>
  <path class="line" d="M460 140 L508 202" marker-end="url(#arr-tpl-2)"/><text x="490" y="162" class="small">slow work</text>
  <path class="line" d="M630 208 H668" marker-end="url(#arr-tpl-2)"/>
  <path class="line dashed" d="M60 150 V218 H148" marker-end="url(#arr-tpl-2)"/><text x="66" y="236" class="small">large files</text>
</svg>
<figcaption>The building blocks most designs start from. Use only the boxes your requirements need.</figcaption>
</figure>

### 6. Deep Dives

Go back to each non-functional requirement and harden the design:

- **Scale**: caching, sharding, read replicas, async processing with queues.
- **Consistency**: transactions, idempotency, ordering, race conditions.
- **Failure**: what happens when X goes down? Replication, retries, fallbacks.

<figure class="diagram">
<svg viewBox="0 0 780 170" role="img" aria-label="Deep dive loop: pick a non-functional requirement, find the bottleneck that breaks it, propose a fix, state the trade-off, then repeat with the next requirement.">
  <defs><marker id="arr-tpl-3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L10,5 L0,10z"/></marker></defs>
  <rect class="box" x="10" y="40" width="170" height="60" rx="8"/><text x="95" y="66" text-anchor="middle" class="title">Pick an NFR</text><text x="95" y="86" text-anchor="middle" class="small">"p99 &lt; 200 ms"</text>
  <rect class="box bad" x="210" y="40" width="170" height="60" rx="8"/><text x="295" y="66" text-anchor="middle" class="title">Find bottleneck</text><text x="295" y="86" text-anchor="middle" class="small">"DB read on every call"</text>
  <rect class="box ok" x="410" y="40" width="170" height="60" rx="8"/><text x="495" y="66" text-anchor="middle" class="title">Propose fix</text><text x="495" y="86" text-anchor="middle" class="small">"add a cache"</text>
  <rect class="box accent" x="610" y="40" width="160" height="60" rx="8"/><text x="690" y="66" text-anchor="middle" class="title">State trade-off</text><text x="690" y="86" text-anchor="middle" class="small">"stale reads ≤ 60 s"</text>
  <path class="line" d="M180 70 H208" marker-end="url(#arr-tpl-3)"/>
  <path class="line" d="M380 70 H408" marker-end="url(#arr-tpl-3)"/>
  <path class="line" d="M580 70 H608" marker-end="url(#arr-tpl-3)"/>
  <path class="line dashed" d="M690 100 V140 H95 V102" marker-end="url(#arr-tpl-3)"/>
  <text x="392" y="158" text-anchor="middle" class="small">repeat for the next non-functional requirement</text>
</svg>
<figcaption>Every deep dive is the same loop. It keeps you tied to the requirements instead of listing random tech.</figcaption>
</figure>

Name the trade-off with every choice: *"X, because…, at the cost of…"*. Senior candidates drive this step themselves.

### 7. Wrap-up

- Key trade-offs you made, and why.
- Remaining bottlenecks and how you'd monitor them (metrics, alerts).
- What you'd add next with more time or 10× scale.

## Common mistakes

- Jumping into boxes before agreeing on requirements.
- Over-designing up front: sharding and Kafka before a single working flow.
- Choosing tech without saying why, or without saying what you give up.
- Spending 20 minutes on estimation that doesn't change any decision.
