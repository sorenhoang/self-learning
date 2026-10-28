---
title: "Thread Safety Is About Invariants, Not Locks"
description: "Thread-safe code keeps its invariants true under every interleaving. Before reaching for a mutex, climb the fix ladder: don't share, don't mutate, then atomics, then locks."
tags: ["concurrency", "go", "thread-safety", "race-conditions", "backend"]
date: "2026-10-27"
draft: false
lang: "en"
---

1000 goroutines, each increments once. What gets printed?

```go
var n int
var wg sync.WaitGroup
for i := 0; i < 1000; i++ {
    wg.Add(1)
    go func() { defer wg.Done(); n++ }()
}
wg.Wait()
fmt.Println(n) // 1000? 987? 941? — depends on the run
```

## What "thread-safe" actually means

A piece of code is **thread-safe** if it stays correct under *any* interleaving of goroutines, with no extra coordination from the caller.

"Correct" means its **invariants** hold. That's the whole game:

| Code | Invariant |
|---|---|
| counter | `n == number of increments` |
| bank transfer | `a.balance + b.balance` is constant |
| cache | at most one value per key, loaded once |
| range | `min <= max` |

Locks, atomics, and channels are just tools to protect invariants. Start from the invariant, then pick the tool — not the other way around.

## The three races you'll actually hit

### 1. Lost update (read-modify-write)

`n++` is three steps: load, add, store. Two goroutines can interleave:

```
G1: load n (5)
G2: load n (5)
G1: store 6
G2: store 6      ← one increment lost
```

### 2. Check-then-act

The check is stale by the time you act on it.

```go
if _, ok := cache[key]; !ok {   // G1 and G2 both see "missing"
    cache[key] = expensiveLoad(key) // both load, both write
}
```

With a plain Go map this is worse than a duplicate load — concurrent writes crash the process with `fatal error: concurrent map writes`, which `recover()` cannot catch.

### 3. Visibility

Without synchronization, one goroutine is not guaranteed to *ever* see another's write.

```go
var done bool

go func() { time.Sleep(time.Second); done = true }()

for !done {} // compiler may hoist the read — loops forever
```

The Go memory model only promises visibility across a **happens-before** edge: a channel op, a mutex unlock/lock, an atomic, `sync.Once`, `WaitGroup.Wait`.

### Catch them with the race detector

```bash
go test -race ./...
go run -race main.go
```

```
WARNING: DATA RACE
Write at 0x00c000014098 by goroutine 8:
  main.main.func1()  main.go:12
Previous read at 0x00c000014098 by goroutine 7:
  main.main.func1()  main.go:12
```

Run `-race` in CI. It only flags races that *execute* during the run, so it needs tests that actually exercise concurrent paths.

## The fix ladder — cheapest first

Each rung is cheaper to reason about than the one below it. Stop at the first one that works.

### Rung 1: Don't share

If only one goroutine touches the data, there's nothing to protect. Give each worker its own state and merge at the end.

```go
results := make([]int, workers) // each goroutine owns one slot
for w := 0; w < workers; w++ {
    wg.Add(1)
    go func(w int) {
        defer wg.Done()
        results[w] = count(chunks[w]) // no sharing
    }(w)
}
wg.Wait()
total := sum(results)
```

Or hand off ownership through a channel — *"share memory by communicating"*:

```go
jobs := make(chan Job)
go func() {
    for j := range jobs { process(j) } // only this goroutine touches j
}()
```

### Rung 2: Don't mutate

Immutable values are safe to share freely. To "update", build a new value and swap the pointer atomically (copy-on-write):

```go
type Config struct{ Timeout time.Duration; Hosts []string }

var cfg atomic.Pointer[Config]

func Reload(c *Config) { cfg.Store(c) } // writers replace the whole thing
func Current() *Config { return cfg.Load() } // readers never block
```

Great for read-heavy data (config, routing tables). Rule: never mutate a `*Config` after publishing it.

### Rung 3: Atomics — one variable, one invariant

```go
var n atomic.Int64
go func() { n.Add(1) }()

var done atomic.Bool
for !done.Load() {} // visible now
```

Atomics fix the counter and the flag. They do **not** compose — two atomics are not one atomic operation (see next section).

### Rung 4: Mutex — invariants spanning multiple fields

```go
type Account struct {
    mu      sync.Mutex
    balance int64
    history []Tx
}

func (a *Account) Withdraw(amt int64) error {
    a.mu.Lock()
    defer a.mu.Unlock()
    if a.balance < amt { // check
        return ErrInsufficient
    }
    a.balance -= amt                        // act
    a.history = append(a.history, Tx{-amt}) // keep in sync
    return nil
}
```

Check and act sit inside the same critical section, so nothing can slip between them. Use `sync.RWMutex` only when reads vastly outnumber writes *and* profiling shows contention — it's slower than `Mutex` under light load.

### Rung 5: Ready-made primitives

Don't hand-roll what the stdlib already ships:

```go
// load exactly once, every caller waits for the same result
var loadCfg = sync.OnceValue(func() *Config { return readConfig() })

// fan-out with first-error cancellation
g, ctx := errgroup.WithContext(ctx)
for _, u := range urls {
    g.Go(func() error { return fetch(ctx, u) })
}
err := g.Wait()
```

## Safe parts, unsafe whole

Composing thread-safe pieces does **not** give you thread-safe code. Each call is atomic; the sequence isn't.

```go
var m sync.Map

// ❌ check-then-act across two safe calls
if _, ok := m.Load(key); !ok {
    m.Store(key, newSession()) // another goroutine may have stored in between
}

// ✅ one operation
v, loaded := m.LoadOrStore(key, newSession())
```

Same trap with atomics:

```go
type Range struct{ min, max atomic.Int64 }

// ❌ each store is atomic; min <= max is not
func (r *Range) Set(lo, hi int64) {
    r.min.Store(lo)
    // reader here sees new min, old max → min > max possible
    r.max.Store(hi)
}
```

The invariant `min <= max` spans two fields, so it needs one lock around both:

```go
type Range struct {
    mu       sync.Mutex
    min, max int64
}

func (r *Range) Set(lo, hi int64) {
    r.mu.Lock(); defer r.mu.Unlock()
    r.min, r.max = lo, hi
}
```

**Lock the invariant, not the field.** Ask "which values must change together?" — that set is the scope of your lock.

## When to use which

| Situation | Tool | Cost |
|---|---|---|
| Work splits cleanly per goroutine | Confinement, merge at end | Free |
| Pipeline / ownership handoff | Channels | Low, adds coupling |
| Read-heavy, rarely replaced | `atomic.Pointer` + immutable value | Very low reads |
| Single counter or flag | `atomic.Int64` / `atomic.Bool` | Very low |
| Invariant across ≥2 fields | `sync.Mutex` | Low, watch hold time |
| Lazy init | `sync.Once` / `sync.OnceValue` | Free after first call |
| Disjoint-key map, write-once keys | `sync.Map` | OK; otherwise use `map` + `Mutex` |

The takeaway: write down the invariant first. If you can't name it, you can't protect it — and no amount of `sync.Mutex` sprinkled over individual fields will save you. Then climb the ladder, and run `-race` in CI to keep yourself honest.
