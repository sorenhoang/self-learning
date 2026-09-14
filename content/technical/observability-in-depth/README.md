---
title: "Observability in Depth: Metrics, Logs, and Traces from First Principles"
description: "A 7-chapter series building production-grade observability by hand in Go — Prometheus metrics, alerting, structured logs, distributed tracing, and the correlation that ties all three into one incident workflow."
tags: ["observability", "prometheus", "grafana", "tracing", "opentelemetry", "golang"]
date: "2026-09-13"
draft: false
---

## Overview

"The service is slow" is not a diagnosis. Without instrumentation you're guessing — SSH and `top` can't tell you if it's one endpoint or all of them, one unlucky request or a trend, CPU or a downstream dependency.

**Observability in Depth** builds the answer from scratch, in Go, against a real running stack: Prometheus + Grafana for metrics, Loki for logs, Tempo for traces — each pillar hand-instrumented (no auto-instrumentation library doing the work for you), then wired together so one incident is a single click across all three. Every example, every number, and every bug in this series comes from [`go-observability-lab`](https://github.com/sorenhoang/go-observability-lab), a public lab repo built phase by phase for exactly this purpose.

The throughline: the same cardinality mistake — an unbounded label — breaks Prometheus, Loki, and your wallet in three different disguises. Once you've caused it on purpose and watched the numbers, you stop making it by accident.

---

## Series Structure

| # | Chapter |
| :-- | :--- |
| 1 | Why Observability — The Problem Three Pillars Solve |
| 2 | Metrics — Counters, Histograms, and the Cardinality Trap |
| 3 | Alerting — Recording Rules and the Chain to a Human |
| 4 | Logs — The Canonical Line and a Label Model You Already Know |
| 5 | Traces — Spans, Context, and the Goroutine Trap |
| 6 | Correlation — Three Pillars, One Click Apart |
| 7 | What Changes in Production |

---

## Who This Is For

Backend engineers who've already added a Prometheus client or a `logger.Info()` call to a service, but couldn't explain why `sum(rate(x))` and `rate(sum(x))` give different answers, why a `request_id` label would take down Loki, or why a trace span started inside a `go func()` silently loses its parent. This series answers those questions with real code, real PromQL/LogQL, and real before/after numbers — not definitions.

---

*Start with Chapter 1: Why Observability — the problem three pillars solve.*
