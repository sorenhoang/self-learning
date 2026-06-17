---
title: "Bloom Filter: The Structure That Never Lies About Absence"
description: "How a bit array and k hash functions let you test set membership with zero false negatives, tunable false positives, and 1.14 MB for a million elements."
tags: ["algorithms", "redis", "databases", "system-design", "probabilistic-data-structures"]
date: "2026-06-17"
draft: false
lang: "en"
---

Exact membership testing costs memory proportional to the set size.

```python
seen = set()
for url in crawled_urls:
    seen.add(url)
if url in seen:  # exact — but `seen` grows with every URL added
    skip()
```

A Bloom Filter answers the same question with a **fixed-size bit array** — ~10 bits per element regardless of set size — at the cost of one guarantee: it can lie about presence, but **never about absence**.

---

## The Mechanism: Bit Array + k Hash Functions

```python
m = 3000   # bit array size
k = 3      # number of independent hash functions
bits = [0] * m

def add(item):
    for seed in range(k):
        pos = murmurhash(item, seed) % m
        bits[pos] = 1

def might_contain(item):
    return all(bits[murmurhash(item, seed) % m] == 1 for seed in range(k))
```

Adding `"user:1"` hashes to positions `[42, 891, 2103]` — those three bits flip to `1`.
Adding `"user:2"` hashes to `[17, 891, 1455]` — position `891` was already `1`, no problem.

---

## The Asymmetry: A `0` Is Proof; A `1` Is Suspicion

```python
# After adding "user:1" and "user:2":
# bits[42]=1, bits[891]=1, bits[2103]=1, bits[17]=1, bits[1455]=1

# Check "user:99" → hashes to [17, 891, 2103]
# All three bits are 1 — set by OTHER elements
# → returns True (FALSE POSITIVE — "user:99" was never added)

# Check "user:100" → hashes to [0, 500, 2103]
# bits[0] is 0
# → returns False (GUARANTEED CORRECT — definitely not in set)
```

This is the invariant: if any bit is `0`, the element was **never added**. If all bits are `1`, the element **might** have been added. False negatives are structurally impossible — once a bit is `1`, it stays `1`.

This makes Bloom Filter the ideal **pre-filter**: pay a cheap probabilistic check to avoid an expensive exact one.

```
[Bloom Filter: O(k) in memory]  →  miss? → done (0 disk reads)
                                →  hit?  → [Exact check: DB / disk / network]
```

Cassandra uses this per SSTable — skip reading files where the key definitely isn't there. Chrome Safe Browsing ships a Bloom Filter of malicious URLs to the client — false positive triggers a server lookup; false negative is impossible.

---

## The Math: Tunable False Positive Rate

False positive probability given `m` bits, `n` elements, `k` hash functions:

$$p \approx \left(1 - e^{-kn/m}\right)^k$$

Optimal `k` for a given space budget:

$$k = \frac{m}{n} \cdot \ln 2$$

Required bit array size for a target FPR `p`:

$$m = \frac{-n \cdot \ln p}{(\ln 2)^2}$$

```
FPR      bits/element   memory (1M elements)   optimal k
─────────────────────────────────────────────────────────
10%      4.8            ~572 KB                3
 1%      9.6            ~1.14 MB               7
 0.1%   14.4            ~1.72 MB              10
 0.01%  19.2            ~2.29 MB              13
```

1% FPR for 1 million elements fits in **1.14 MB**. Halving the FPR costs ~50% more memory (not 2×).

---

## In Practice: Redis

Redis Stack ships Bloom Filter support out of the box via the ReBloom module.

```bash
# Create a filter: 1% error rate, pre-sized for 1M elements
BF.RESERVE emails:seen 0.01 1000000

# Add elements
BF.ADD emails:seen "alice@example.com"   # → (integer) 1 (new)
BF.ADD emails:seen "bob@example.com"     # → (integer) 1 (new)
BF.ADD emails:seen "alice@example.com"   # → (integer) 0 (already present)

# Check membership
BF.EXISTS emails:seen "alice@example.com"     # → (integer) 1 (maybe)
BF.EXISTS emails:seen "unknown@example.com"   # → (integer) 0 (definitely not)

# Bulk operations
BF.MADD emails:seen "c@x.com" "d@x.com" "e@x.com"
BF.MEXISTS emails:seen "alice@example.com" "nobody@x.com"

# Inspect utilization and layers
BF.DEBUG emails:seen
# 1) "size:1228800"
# 2) "Number of filters:1"
# 3) "Number of items inserted:3"
# 4) "Current capacity:1000000"
# 5) "Current error rate:0.01"
```

Without `BF.RESERVE`, Redis auto-creates a filter and **doubles capacity in new layers** as it fills — convenient but adds query overhead across layers.

The equivalent in analytics: most databases have built-in support.

```sql
-- Cassandra reads SSTables using per-file Bloom Filters automatically
-- No user-facing API needed — it's internal optimization

-- For application-level checks, use the Redis module above
-- or a library like pybloom_live, java-bloomfilter, etc.
```

---

## When NOT to Use It

| Situation | Why Bloom fails | Use instead |
|---|---|---|
| Need exact membership | Returns "maybe", not "yes" | `Set` / exact DB lookup |
| Need to retrieve the element | One-way sketch — no storage | Hash map / DB |
| Need to delete elements | Bits can't be unset without breaking others | Counting BF or Cuckoo Filter |
| Small sets (< ~1,000) | Overhead exceeds a plain Set | `set()` |
| Adversarial inputs | Known hash seed → craft collisions on purpose | Randomize seed per instance |

If you need deletion: **Cuckoo Filter** supports it, uses less space at < 3% FPR, and has better lookup performance — at the cost of more complex insertion.

---

## Summary

```
Problem:  is X in this set? — exact answer costs memory proportional to set size.

Bloom idea: hash each element k times → set k bits.
            Check: all k bits are 1? → maybe. Any bit is 0? → definitely not.

Cost:     ~9.6 bits/element for 1% FPR. 1M elements ≈ 1.14 MB. O(k) add and check.
Guarantee: zero false negatives. False positive rate is tunable.

Use when: cheap pre-filter before expensive ops (disk, DB, network).
Skip when: you need exact answers, deletions, or element retrieval.
```
