---
title: "Alerting — Recording Rules and the Chain to a Human"
order: 3
tags: ["observability", "prometheus", "alerting"]
date: "2026-09-14"
draft: false
lang: "en"
---

## The chain

A PromQL expression doesn't page anyone by itself. Getting from "this query looks bad" to a human's phone buzzing is four hops:

```
raw metrics -> recording rules -> alert rules -> Alertmanager -> receiver
```

Prometheus owns the first three: scrape, evaluate, decide inactive/pending/firing. Alertmanager owns everything after a rule fires: grouping, deduplication, repeat timing, silences, inhibition, and dispatch. Splitting these is deliberate — Prometheus is disposable and stateless per-instance; Alertmanager is where routing logic that must survive a Prometheus restart lives.

## Recording rules: precompute, then alert on the short name

```yaml
groups:
  - name: http_red
    interval: 15s
    rules:
      - record: job:http_requests:rate5m
        expr: sum(rate(http_requests_total[5m]))

      - record: job:http_error_rate:ratio5m
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total[5m]))

      - record: job:http_request_duration_seconds:p95_5m
        expr: |
          histogram_quantile(
            0.95,
            sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
          )
```

Naming convention: `level:metric:operation` — `job:http_error_rate:ratio5m` reads as "job-level, http_error_rate, ratio over 5m." This isn't cosmetic. Two real benefits:

1. **The expensive query runs once per `interval` (15s here), not once per consumer.** Every dashboard panel and every alert rule that needs this ratio reads the precomputed series instead of re-running the nested `sum(rate())` division each time.
2. **The dashboard and the alert can't disagree.** Point the dashboard's "Error %" stat at `job:http_error_rate:ratio5m` and it shows *exactly* the number `HighErrorRate` alerts on — no risk of the dashboard's ad-hoc query and the alert's hardcoded expression drifting apart over time.

## Alert rules and the lifecycle

```yaml
groups:
  - name: api_alerts
    rules:
      - alert: ApiDown
        expr: up{job="api"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "API target is down"
          description: "Prometheus cannot scrape {{ $labels.instance }} for over 1m."

      - alert: HighErrorRate
        expr: job:http_error_rate:ratio5m > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "5xx error ratio above 5%"
          description: "Error ratio is {{ $value | humanizePercentage }} (threshold 5%) for 5m."

      - alert: HighLatencyP95
        expr: job:http_request_duration_seconds:p95_5m > 1
        for: 10m
        labels:
          severity: warning
```

`HighErrorRate` and `HighLatencyP95` alert on the recorded series, not the raw nested PromQL — same "single source of truth" reasoning as the dashboard panel above.

An alert has three states:

```
expr false ──────────────► inactive
expr true, < for: ───────► pending
expr true, ≥ for: ───────► firing
```

**`for:` exists to filter out noise, not to slow you down.** `ApiDown` uses `for: 1m` — a real outage is still very fast to detect. `HighErrorRate` uses `for: 5m` — one bad scrape, a brief deploy blip, or a single flaky test request shouldn't page anyone. An alert with no `for:` at all fires and resolves on every transient blip — the single most common cause of alert fatigue.

## Alertmanager: routing, grouping, inhibition

Prometheus pushes firing alerts to Alertmanager; Alertmanager decides *how* and *when* to actually notify someone.

```yaml
route:
  receiver: webhook
  group_by: ["alertname"]
  group_wait: 10s
  group_interval: 30s
  repeat_interval: 5m

receivers:
  - name: webhook
    webhook_configs:
      - url: http://webhook-sink:9000/webhook
        send_resolved: true
```

| Field | What it does |
|---|---|
| `group_by` | Alerts sharing these labels bundle into **one** notification instead of N separate pages — here, every `HighErrorRate` instance across routes becomes one grouped alert. |
| `group_wait` | After the first alert in a new group, wait this long for siblings before sending — catches a burst of related alerts as one notification. |
| `group_interval` | Wait this long before sending a notification about *new* alerts added to an already-notified group. |
| `repeat_interval` | How often to re-send a notification for a still-firing alert — prevents an incident from paging you every evaluation cycle, while making sure a long outage doesn't go silent. |

This lab's routing tree is intentionally flat — one receiver, no branching. A production Alertmanager config typically adds:

- **Route tree by `severity` or team label** — `critical` → PagerDuty, `warning` → Slack, routed via nested `routes:` blocks matching on labels.
- **Inhibition** — suppress a whole class of downstream alerts when a root-cause alert is already firing (e.g. `ApiDown` firing inhibits `HighErrorRate` and `HighLatencyP95` for the same job — of course the error rate looks bad, the API is *down*). Configured via `inhibit_rules:` matching a `source_match` against a `target_match` on a shared label.
- **Silences** — a temporary, time-boxed mute for known maintenance windows, applied via the Alertmanager API/UI rather than a config change.

None of these need Prometheus restarted or rules redeployed — that's the entire point of splitting evaluation (Prometheus) from notification policy (Alertmanager).

## Watching the full chain fire

```sh
make up && make load

# confirm the recorded series exists
curl -s 'localhost:9090/api/v1/query?query=job:http_error_rate:ratio5m' | jq '.data.result'

# push the error rate over the 5% threshold
curl -s -XPOST localhost:8080/admin/chaos -d '{"enabled":true,"error_ratio":0.3}'

# watch pending -> firing
watch -n5 'curl -s "localhost:9090/api/v1/query?query=ALERTS" \
  | jq -c ".data.result[] | {name: .metric.alertname, state: .metric.alertstate}"'
```

`HighErrorRate` shows `pending` immediately, then flips to `firing` once the condition has held for the full 5-minute `for:` window — and only then does Alertmanager's `group_wait` clock start, followed by a line in the webhook sink's log. Turning chaos back off produces a `send_resolved: true` notification through the same path — worth confirming explicitly, since a route that only ever tests the firing path can hide a broken resolve.

## What's next

Metrics and alerts tell you *something* crossed a threshold. Chapter 4 adds the pillar that tells you *which* request, *which* order ID, *what exactly* went wrong — structured logs, and a label model that will look very familiar after this chapter.
