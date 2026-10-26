---
title: "Database Isolation Levels: The Standard Table Is Lying to You"
description: "The four SQL isolation levels look simple on paper. In Postgres and MySQL they behave differently, and the anomalies that actually break production — lost update and write skew — aren't even in the standard's table."
tags: ["databases", "concurrency", "transactions", "postgresql", "mysql"]
date: "2026-10-23"
draft: false
lang: "en"
---

Every database course shows the same table: four isolation levels and three anomalies, with checkmarks. It's a fine starting point, but it doesn't match what Postgres or MySQL actually do. It also leaves out the two anomalies most likely to corrupt your data: **lost update** and **write skew**.

This post covers what each level *really* guarantees in the two most common databases, and what to do about it.

## Why isolation exists

Two transactions, one row, no protection:

```text
balance = 100

T1: SELECT balance → 100
T2: SELECT balance → 100
T1: UPDATE balance = 100 - 30   → 70
T2: UPDATE balance = 100 - 50   → 50
T1: COMMIT
T2: COMMIT                      → final = 50, expected 20
```

Both commits succeed and there's no error, yet ₫30 has vanished. Isolation levels decide which of these interleavings the database is allowed to let happen.

## The six anomalies

The ANSI SQL-92 standard defines three. In 1995, [Berenson et al.](https://www.microsoft.com/en-us/research/publication/a-critique-of-ansi-sql-isolation-levels/) showed that wasn't enough and added three more.

| Anomaly | What happens | In ANSI table? |
|---|---|---|
| **Dirty read** | Read data another txn hasn't committed yet | ✅ |
| **Non-repeatable read** | Same row read twice, different values | ✅ |
| **Phantom read** | Same `WHERE` query twice, different set of rows | ✅ |
| **Lost update** | Two read-modify-write cycles, one overwrites the other | ❌ |
| **Read skew** | Read two related rows at different points in time | ❌ |
| **Write skew** | Two txns read the same data, write *different* rows, together break an invariant | ❌ |

### Read skew

Transfer ₫50 from A to B while someone sums the balances:

```text
A = 500, B = 500  (invariant: A + B = 1000)

T1 (report):   SELECT balance FROM accounts WHERE id = 'A'  → 500
T2 (transfer): UPDATE A = 450; UPDATE B = 550; COMMIT
T1 (report):   SELECT balance FROM accounts WHERE id = 'B'  → 550
               total = 1050  ← money created from nothing
```

This is possible under READ COMMITTED, because every statement takes a fresh snapshot.

### Write skew

The classic example comes from [DDIA](https://dataintensive.net/): a hospital where at least one doctor must stay on call.

```sql
-- Alice and Bob both on call. Both click "go off call" at the same time.

-- T1 (Alice)                                  -- T2 (Bob)
BEGIN;                                          BEGIN;
SELECT count(*) FROM doctors                    SELECT count(*) FROM doctors
 WHERE on_call AND shift_id = 1;  -- 2           WHERE on_call AND shift_id = 1;  -- 2
UPDATE doctors SET on_call = false              UPDATE doctors SET on_call = false
 WHERE name = 'alice';                           WHERE name = 'bob';
COMMIT;                                         COMMIT;

-- Result: 0 doctors on call. Each txn's check passed on its own snapshot.
```

The two transactions update **different rows**, so no row-level conflict ever happens. Snapshot isolation can't detect this. Only true serializability can.

## The standard's four levels

| Level | Dirty | Non-repeatable | Phantom |
|---|---|---|---|
| READ UNCOMMITTED | possible | possible | possible |
| READ COMMITTED | — | possible | possible |
| REPEATABLE READ | — | — | possible |
| SERIALIZABLE | — | — | — |

The standard defines each level as "these anomalies must not happen". It doesn't say how to prevent them, and it doesn't cover the three anomalies it never named. So each vendor gets to decide:

- Oracle's `SERIALIZABLE` is really snapshot isolation, so **write skew is allowed**.
- Postgres's `REPEATABLE READ` is stricter than the standard asks for, so **phantoms are prevented**.
- MySQL's `REPEATABLE READ` still allows **lost updates**.

The level *name* tells you very little. You have to read your database's docs.

## Postgres vs MySQL (InnoDB)

| | Postgres | MySQL InnoDB |
|---|---|---|
| Default level | READ COMMITTED | REPEATABLE READ |
| READ UNCOMMITTED | Behaves as READ COMMITTED | Real dirty reads |
| REPEATABLE READ | Snapshot isolation | Snapshot for plain reads, *latest* data for writes |
| Lost update at RR | Prevented (txn aborts) | **Possible** |
| Phantom at RR | Prevented (snapshot) | Prevented for locking reads (next-key locks) |
| Write skew at RR | Possible | Possible |
| SERIALIZABLE | SSI: optimistic, aborts on conflict | 2PL: plain `SELECT` becomes `FOR SHARE` |

### Postgres REPEATABLE READ: first updater wins

```sql
-- T1                                  -- T2
BEGIN ISOLATION LEVEL REPEATABLE READ;  BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts            SELECT balance FROM accounts
 WHERE id = 1;  -- 100                   WHERE id = 1;  -- 100
UPDATE accounts SET balance = 70
 WHERE id = 1;
                                        UPDATE accounts SET balance = 50
                                         WHERE id = 1;  -- blocks on T1's row lock
COMMIT;
                                        -- ERROR: could not serialize access
                                        --        due to concurrent update
```

T2 has to retry. That's safe, but your application **must handle `40001`**.

### MySQL REPEATABLE READ: snapshot reads, current writes

InnoDB reads come from a snapshot, but `UPDATE` / `DELETE` / `SELECT ... FOR UPDATE` operate on the **latest committed** row. Run the same script and T2 simply overwrites T1. **Lost update, no error.**

```sql
-- MySQL, both at REPEATABLE READ — T2's UPDATE succeeds after T1 commits:
UPDATE accounts SET balance = 50 WHERE id = 1;  -- T1's 70 is gone
```

There's another quirk: if your transaction updates a row that someone else just committed, that newer version becomes visible in *your* snapshot. "Repeatable" only holds as long as you don't write.

### SERIALIZABLE: two very different engines

- **Postgres (SSI):** reads don't block. The engine tracks read/write dependencies and aborts one transaction when a dangerous cycle appears, which catches write skew. Throughput is close to RR, but expect more `40001` retries.
- **MySQL (locking):** every plain `SELECT` becomes `SELECT ... FOR SHARE` (when autocommit is off). Write skew is blocked by locks, and you pay for it with contention and deadlocks.

## What to actually do

**1. Stay on the default level, and make writes atomic.** Most lost updates come from read-modify-write in application code:

```sql
-- ❌ read in app, compute, write back
SELECT balance FROM accounts WHERE id = 1;
UPDATE accounts SET balance = 70 WHERE id = 1;

-- ✅ let the database do the math
UPDATE accounts SET balance = balance - 30 WHERE id = 1;
```

This is safe at READ COMMITTED on both engines. The row lock makes the second writer re-read the latest value.

**2. Lock what you read when the decision depends on it.** This fixes both write skew and lost update:

```sql
BEGIN;
SELECT * FROM doctors
 WHERE on_call AND shift_id = 1
 FOR UPDATE;          -- both txns now serialize on these rows
-- check count >= 2, then update
COMMIT;
```

`FOR UPDATE` only locks rows that exist. If the invariant depends on rows that *don't* exist yet (e.g. "no overlapping booking"), use a unique or exclusion constraint, or lock a parent row. More on this trade-off in [Optimistic vs Pessimistic Locking](/technical/optimistic-vs-pessimistic-locking).

**3. Use SERIALIZABLE + retry when invariants span many rows.** On Postgres this is often simpler than reasoning about every lock:

```python
for attempt in range(MAX_RETRIES):
    try:
        with conn.transaction(isolation="serializable"):
            run_business_logic(conn)
        break
    except SerializationFailure:   # SQLSTATE 40001
        sleep(backoff(attempt))
else:
    raise TooMuchContention()
```

The whole transaction has to be retryable, so keep side effects (emails, HTTP calls) out of it.

### Cheat sheet

| Situation | Fix |
|---|---|
| Counter / balance update | Atomic `SET x = x + n` |
| Read row → decide → write same row | `FOR UPDATE` or version column |
| Read many rows → write a different row | `FOR UPDATE` on the read set, or SERIALIZABLE |
| Invariant over rows that may not exist | Constraint (unique / exclusion), or SERIALIZABLE |
| Consistent multi-query report | REPEATABLE READ (read-only snapshot) |

## Takeaway

Don't pick an isolation level by its name. Know which anomaly your code is vulnerable to, check what *your* database does at *your* level, and close the gap explicitly: atomic writes, locks, constraints, or SERIALIZABLE with retries.

**Sources:** [Berenson et al., *A Critique of ANSI SQL Isolation Levels* (1995)](https://www.microsoft.com/en-us/research/publication/a-critique-of-ansi-sql-isolation-levels/) · [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) · [MySQL: InnoDB Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-isolation-levels.html) · Kleppmann, *Designing Data-Intensive Applications*, ch. 7
