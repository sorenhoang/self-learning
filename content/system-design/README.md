---
title: "System Design"
description: "System design interview walkthroughs — each post designs one real system end to end using a single repeatable delivery framework."
---

Every post in this section follows the same structure, based on the [Hello Interview delivery framework](https://www.hellointerview.com/learn/system-design/in-a-hurry/delivery). Learn the shape once, then focus on the trade-offs.

## The framework (45-minute interview)

| # | Step | Time | Output |
|---|---|---|---|
| 1 | Requirements | ~5 min | Functional + non-functional requirements |
| 2 | Core Entities | ~2 min | List of nouns the system stores and moves |
| 3 | API / Interface | ~5 min | Endpoints that satisfy each functional requirement |
| 4 | Data Flow *(optional)* | ~5 min | Sequence of steps for pipeline-style systems |
| 5 | High-Level Design | ~10–15 min | Boxes and arrows that satisfy the functional requirements |
| 6 | Deep Dives | ~10 min | Changes that satisfy the non-functional requirements |

### 1. Requirements

- **Functional** — "Users should be able to…". Pick the top **3**, explicitly mark the rest out of scope.
- **Non-functional** — "The system should be…". Quantify in context: *"feed loads in < 200ms"*, not *"low latency"*. Check: CAP (consistency vs availability), scale, latency, durability, security, fault tolerance.
- **Capacity estimation** — skip by default. Only do math when the result changes a design decision (e.g. "does this fit on one machine?").

### 2. Core Entities

List the main entities (`User`, `Tweet`, `Follow`). No full schema yet — fields get added during high-level design when they're needed.

### 3. API / Interface

One endpoint per functional requirement. REST by default; reach for GraphQL, gRPC, or WebSocket only with a reason.

```text
POST /tweets            -> Tweet
GET  /tweets/:id        -> Tweet
POST /users/:id/follows
GET  /feed?cursor=...   -> Tweet[]
```

Never put `userId` in the body — derive it from the auth token.

### 4. Data Flow (optional)

Only for backend-heavy or pipeline systems (web crawler, ad-click aggregator). A numbered list of steps the data goes through.

### 5. High-Level Design

Walk through each API endpoint and draw the components that serve it — client, gateway, services, databases, caches, queues. Keep it **simple first**: satisfy functional requirements only, note the bottlenecks, and defer them.

### 6. Deep Dives

Go back to the non-functional requirements and harden the design: scaling hot paths, caching, sharding, consistency, failure handling. Senior+ candidates should drive this step proactively.

## Post template

Each post in this category uses these headings:

```markdown
## Requirements
### Functional
### Non-Functional
## Core Entities
## API
## Data Flow            <!-- optional -->
## High-Level Design
## Deep Dives
## What's Expected at Each Level   <!-- mid / senior / staff -->
```
