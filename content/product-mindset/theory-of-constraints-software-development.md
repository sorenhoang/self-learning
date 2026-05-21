---
title: "Theory of Constraints in Software Development"
description: "Your team is always busy but never fast. Theory of Constraints explains why — and gives you a five-step diagnostic that underlies Kanban, DevOps, and The Phoenix Project."
tags: ["theory-of-constraints", "productivity", "devops", "kanban", "engineering-management"]
date: "2026-05-19"
draft: false
lang: "en"
---

Your team is always busy. The sprint board is full. Everyone's heads-down. But features still take weeks longer than they should, and every retrospective surfaces the same complaints.

The problem probably isn't effort. It's that effort is distributed incorrectly across the pipeline.

Theory of Constraints — developed by physicist-turned-management-consultant Eliyahu Goldratt in his 1984 novel *The Goal* — gives this problem a name and a fix.

---

## The core insight

Goldratt's central claim: **the throughput of any system is determined entirely by its constraint** — the one bottleneck that limits the overall flow.

Everything upstream of the constraint will eventually pile up waiting for it. Everything downstream sits idle waiting for it. Adding capacity anywhere except the constraint does not improve throughput. It only creates inventory — work that's "done" but not moving.

He made this argument about manufacturing floors. It applies identically to software delivery pipelines.

A chain is only as fast as its slowest link. If code review is your constraint, hiring more engineers just produces more PRs waiting for review. If QA is the constraint, deploying faster CI just means more builds sitting in a testing queue.

The failure mode: everyone optimizes their own stage without asking where the actual bottleneck is.

---

## The Five Focusing Steps

Goldratt's framework for managing constraints is five steps, and they're meant to repeat continuously — fix one constraint, find the next:

**1. Identify the constraint.**
Where does work accumulate? Not where people are busy — where does finished work sit waiting? Map your pipeline from idea to production and look for the queue.

**2. Exploit the constraint.**
Don't waste the constraint on anything non-essential. If code review is the bottleneck, reviewers should not be doing anything else when PRs are waiting. Every hour the constraint sits idle is throughput you can never recover.

**3. Subordinate everything else to the constraint.**
All other stages exist to feed the constraint and absorb its output. If review is the constraint, developers should write smaller, easier-to-review PRs — even if that slows them down individually. QA should stay ready to pick up whatever clears review immediately. The goal is not to maximize every stage; it's to keep the constraint moving.

**4. Elevate the constraint.**
Once you've squeezed everything out of the current constraint through exploitation and subordination, invest in increasing its capacity. Hire more reviewers, improve tooling, restructure the process. This is the expensive step — which is why you don't do it first.

**5. Go back to step 1.**
Fixing one constraint reveals the next. Throughput improvement is a continuous cycle, not a one-time project.

---

## Where the constraint usually hides in dev pipelines

Goldratt's insight is that constraints are rarely where people think they are. Teams typically blame the stage they interact with most. The actual bottleneck tends to be:

**Code review.** The most common constraint in high-output teams. As a team scales, the ratio of PR authors to experienced reviewers gets worse. PRs sit for days. Developers context-switch to new work while waiting, increasing WIP and cognitive overhead.

Signs: PRs age more than 24 hours routinely, developers open multiple tickets in parallel to "stay productive" while waiting, the merge queue is long.

**QA / testing gates.** When testing is manual or partially manual, it can't keep pace with automated build frequency. Builds accumulate. The team works around it by shipping in batches, which creates bigger, riskier releases.

Signs: a dedicated "QA sprint" before each release, staging environment that's perpetually out of date, the phrase "we need to get QA to look at this."

**Deployment and release.**
The team ships to staging quickly but production deployments require a specific person, manual steps, or a scheduled window. The pipeline stalls at the last mile.

Signs: features "done" in staging for weeks before going live, deployment as a stressful event rather than a routine one, Brent.

**Product decisions and requirements clarity.**
Engineering isn't always the constraint. Sometimes the pipeline stalls because tickets enter development without clear acceptance criteria, and work bounces back to product for clarification repeatedly.

Signs: high rework rate, PRs that get reopened after review, "done" features that fail acceptance review by the PM.

---

## The intellectual lineage: Kanban, DevOps, The Phoenix Project

TOC didn't stay in manufacturing. Its influence on software delivery is direct and traceable.

**Kanban's WIP limits** are a direct application of steps 2 and 3. Limiting work-in-progress prevents teams from starting new work to escape a bottleneck — which only makes the bottleneck worse. WIP limits force the team to swarm on clearing the constraint before pulling new work. The discomfort of a developer sitting idle because the review queue is full is the system working correctly: it makes the constraint visible.

**The DevOps movement** is, at its core, a decades-long project to remove QA and deployment as constraints. Continuous integration, automated testing, one-click deploys, feature flags — these are all investments in elevating specific pipeline stages that repeatedly showed up as bottlenecks across the industry.

**The Phoenix Project** (Gene Kim, Kevin Behr, George Spafford, 2013) is *The Goal* retold for IT operations. The protagonist, Bill Palmer, inherits a failing IT department and — guided by an enigmatic mentor named Erik — discovers that the entire company's delivery depends on a single engineer named Brent. Brent is the constraint. Everything Erik teaches Bill maps directly to Goldratt's Five Steps: stop assigning Brent to new work (exploit), make other engineers capable of handling Brent's tasks (subordinate), and eventually restructure so Brent's knowledge is distributed (elevate).

If you haven't read it, it's worth reading as a narrative rather than a business book — the constraint-finding plot structure makes the concepts stick.

---

## What to do on Monday

You don't need to run a formal TOC analysis. Start with one question: **where does work wait?**

Pick a two-week window. Look at your issue tracker. Find tickets that were "in development" or "in review" for more than three days. Where did they accumulate? That stage is your constraint candidate.

Then apply the steps in order:
1. Stop starting new work upstream of the constraint until you understand it.
2. Protect the constraint's time — block it off for the work only it can do.
3. Change what happens upstream to feed the constraint better (smaller PRs, clearer tickets, automated pre-checks).
4. Only after you've done 1–3: invest in capacity.

The measure of success is not how busy everyone looks. It's how long it takes a working feature to travel from "ready to build" to "in production." That metric — cycle time — is what TOC is trying to minimize, and it's the one most teams don't track.

Busy is not the same as fast. TOC is the clearest framework I know for turning the first into the second.
