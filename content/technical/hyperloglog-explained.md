---
title: "HyperLogLog: Count Billions with 12 KB"
description: "How a single probabilistic trick lets you estimate 10⁹ unique elements using less memory than a thumbnail image."
tags: ["algorithms", "redis", "system-design", "probabilistic-data-structures", "databases"]
date: "2026-06-17"
draft: false
lang: "en"
---

Exact distinct counting requires memory proportional to cardinality.

```python
seen = set()
for item in stream:
    seen.add(item)
print(len(seen))  # exact — but `seen` can be gigabytes
```

HyperLogLog estimates the same count with **~12 KB of memory**, regardless of whether you have a million or a trillion distinct elements — with ~0.81% error.

---

## The Insight: Rare Patterns Reveal Crowd Size

You hash **each input element** — a user ID, an IP address, a URL, anything — using a hash function like MurmurHash3. The output is a fixed-size integer that looks uniformly random in binary, regardless of what the input was.

```python
import mmh3

mmh3.hash("user:1",    signed=False)  # → 2318604284  → 10001010001...
mmh3.hash("user:2",    signed=False)  # → 3715833618  → 11011101011...
mmh3.hash("user:1000", signed=False)  # → 0475209131  → 00011100010...
mmh3.hash("user:1001", signed=False)  # → 2089657174  → 01111100100...
```

Because the output is uniformly distributed, each bit is independently 0 or 1 with 50/50 probability. So the probability of a hash starting with `k` consecutive zeros is `1/2^k` — same as flipping `k` heads in a row.

```
hash binary output  → leading zeros (k) → probability
1...............    → 0                 → 1/2     (50%)
01..............    → 1                 → 1/4     (25%)
001.............    → 2                 → 1/8     (12.5%)
0000000001......    → 9                 → 1/512   (~0.2%)
00000000000001..    → 13               → 1/8192  (~0.01%)
```

**The rarest leading-zero pattern you've seen is a fingerprint of how large your input set is.** If your max `k` is 13, you've almost certainly seen around `2^13 = 8192` distinct elements — because you'd only encounter a hash with 13 leading zeros once in ~8192 tries.

One register, one observation:

```python
def naive_estimate(stream):
    max_lz = 0
    for item in stream:
        h = mmh3.hash(item, signed=False)   # hash the element → uniform int
        lz = count_leading_zeros(h)          # how many 0s before the first 1?
        max_lz = max(max_lz, lz)            # keep the rarest pattern seen
    return 2 ** max_lz                       # estimate = 2^(rarest pattern)
```

This works, but variance is too high — one lucky hash can skew the result 2× off. The fix is splitting into many registers and averaging.

---

## The Algorithm: Many Registers, Harmonic Mean

Split every hash into two parts: the first `b` bits select a register, the rest count leading zeros.

```
hash(item) = [ register index (b bits) | leading-zero counter (remaining bits) ]
```

Track the **max** leading zeros per register, then take the **harmonic mean** across all `m = 2^b` registers.

```python
m = 16384            # 2^14 registers → 0.81% error
registers = [0] * m
b = 14               # bits used for register index

def add(item):
    h = hash_64bit(item)
    j = h >> (64 - b)              # which register
    w = h & ((1 << (64 - b)) - 1) # remaining bits
    registers[j] = max(registers[j], leading_zeros(w) + 1)

def count():
    alpha = 0.7213 / (1 + 1.079 / m)   # empirical bias constant
    Z = sum(2.0 ** -r for r in registers)
    return int(alpha * m * m / Z)
```

Error formula: `±1.04 / √m`

```
m=256    → ±6.5%  error, ~192 B
m=1024   → ±3.2%  error, ~768 B
m=4096   → ±1.6%  error,   ~3 KB
m=16384  → ±0.81% error,  ~12 KB  ← Redis default
```

Halving the error costs **4× the memory**.

**Bonus: two sketches merge for free** — just take the element-wise max of both register arrays.

```python
merged = [max(a, b) for a, b in zip(registers_a, registers_b)]
```

This is why HLL is ideal for distributed systems — compute sketches independently, merge at query time.

---

## In Practice: Redis

You never implement this. Redis has shipped it since v2.8.

```bash
# Add elements
PFADD visitors:2026-06-17 user:1 user:2 user:3 user:2  # duplicate ignored
PFCOUNT visitors:2026-06-17
# (integer) 3

# Merge across multiple days
PFMERGE visitors:week \
  visitors:2026-06-11 \
  visitors:2026-06-12 \
  visitors:2026-06-17
PFCOUNT visitors:week
# (integer) ~41200   ← estimated, ±0.81%
```

Same idea in analytics databases:

```sql
-- BigQuery
SELECT APPROX_COUNT_DISTINCT(user_id) FROM events WHERE date = '2026-06-17';

-- Snowflake
SELECT APPROX_COUNT_DISTINCT(user_id) FROM events;

-- PostgreSQL (pg_hll extension)
SELECT hll_cardinality(hll_add_agg(hll_hash_text(user_id::text))) FROM events;
```

Elasticsearch `cardinality` aggregation, Apache Flink, Spark, Redshift, and Vertica all use HLL internally too.

---

## When NOT to Use It

| Situation | Why HLL fails | Use instead |
|---|---|---|
| Exact billing / compliance counts | Estimate only, no hard guarantee | Exact `COUNT(DISTINCT …)` |
| "Was element X ever added?" | Stores no elements, only sketch state | Bloom filter or a Set |
| Tiny sets (< ~100 items) | Relative error is high at small cardinalities | Exact set |
| Need to list/retrieve the elements | One-way sketch — no element retrieval possible | Set |
| Adversarial inputs (rate-limit, DDoS detection) | Attacker who knows your hash function can craft inputs that collapse the estimate | Randomized seed per instance |

---

## Summary

```
Problem:  COUNT(DISTINCT x) on billions of rows is slow and memory-hungry.

HLL idea: hash each element → track max leading zeros per register
          → harmonic mean → cardinality estimate.

Cost:     12 KB memory, O(1) add, O(1) count, free merges.
Error:    ~0.81% (Redis default).

Use when: approximate count is fine, scale is large, mergeability matters.
Skip when: you need exact results, element lookup, or the input is adversarial.
```
