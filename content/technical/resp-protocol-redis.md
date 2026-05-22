---
title: "RESP: The Wire Protocol Behind Every Redis Command"
description: "A byte-level walkthrough of the Redis Serialization Protocol — how commands travel over the wire, why pipelining works, and what RESP3 changes for client-side caching."
tags: ["redis", "protocol", "networking", "databases", "backend"]
date: "2026-05-19"
draft: false
lang: "en"
---

Every time you call `GET foo` in a Redis client, your application doesn't send those four characters as-is. It translates them into a precisely formatted byte sequence, sends it over TCP, and interprets the response using an equally precise format.

That format is **RESP** — the Redis Serialization Protocol. Understanding it gives you a debuggable mental model of Redis, explains why pipelining is as fast as it is, and clarifies the design choices behind every Redis client library.

---

## RESP2: Five Types, One Byte of Dispatch

RESP2 (the original protocol, used by default through Redis 5) defines five data types. The entire parser branches on the **first byte** of each message — no lookahead required.

| First byte | Type | Used for |
|---|---|---|
| `+` | Simple String | Short success replies (`OK`, `PONG`) |
| `-` | Error | Error responses |
| `:` | Integer | Numeric replies (`INCR`, `LLEN`) |
| `$` | Bulk String | Binary-safe values |
| `*` | Array | Commands and multi-value replies |

Every token ends with `\r\n` (CRLF). Here's what each looks like on the wire:

```
+OK\r\n                        ← Simple String
-ERR unknown command\r\n       ← Error
:1000\r\n                      ← Integer
$5\r\nhello\r\n                ← Bulk String: "hello" (5 bytes)
$-1\r\n                        ← Null Bulk String (key does not exist)
*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n  ← Array: ["foo", "bar"]
```

**Bulk Strings are length-prefixed, not delimiter-scanned.** The `$5` tells the parser to read exactly 5 bytes — it never searches the payload for `\r\n`. This is why bulk strings are binary-safe: a value can contain any byte, including newlines, and the parser handles it correctly.

The difference between `$-1\r\n` (null — key doesn't exist) and `$0\r\n\r\n` (empty string — key exists with an empty value) is subtle but important.

---

## A Command on the Wire

Clients send commands as **RESP Arrays of Bulk Strings**. `SET foo bar` becomes:

```
*3\r\n         ← array of 3 elements
$3\r\n
SET\r\n
$3\r\n
foo\r\n
$3\r\n
bar\r\n
```

The server reads `*3`, expects exactly 3 bulk strings, dispatches to the `SET` handler, and replies:

```
+OK\r\n
```

A subsequent `GET foo`:

```
*2\r\n$3\r\nGET\r\n$3\r\nfoo\r\n
```

Reply:

```
$3\r\nbar\r\n
```

And `GET nonexistent`:

```
$-1\r\n
```

The parser knows a `$-1` means null before reading any payload. Reading a bulk string is a single `read(fd, buf, length + 2)` call — one system call for the entire value regardless of size.

You can see this yourself with netcat:

```bash
printf "*3\r\n\$3\r\nSET\r\n\$3\r\nfoo\r\n\$3\r\nbar\r\n" | nc 127.0.0.1 6379
# prints: +OK

# Or with telnet (inline command format — space-separated, not binary-safe)
telnet 127.0.0.1 6379
PING
+PONG
GET foo
$3
bar
```

---

## Pipelining: One RTT for a Hundred Commands

RESP's self-delimiting format makes pipelining trivial. Because every reply is independently parseable — the parser can determine exactly where one response ends and the next begins — the client doesn't need to wait for a reply before sending the next command.

**Without pipelining:** N commands = N round-trips. At 10 ms network latency, 100 commands take ~1 second.

**With pipelining:** the client buffers all commands, flushes once, then reads all responses in order.

```
Client sends (one TCP flush):
*1\r\n$4\r\nPING\r\n
*2\r\n$3\r\nGET\r\n$3\r\nfoo\r\n
*3\r\n$3\r\nSET\r\n$3\r\nbaz\r\n$5\r\nhello\r\n

Server replies (in order):
+PONG\r\n
$3\r\nbar\r\n
+OK\r\n
```

The throughput improvement comes from two places: reduced round-trips (1 RTT vs N), and collapsed system calls (1 `write()` + 1 `read()` vs N of each). Measured gains are typically 10–20x for write-heavy workloads.

**Pipelining vs. MULTI/EXEC:**

| | Pipelining | MULTI/EXEC |
|---|---|---|
| Atomicity | None — other clients can interleave | Yes — no other client runs between commands |
| Overhead | Near-zero | Extra `+QUEUED\r\n` per command |
| Use case | Throughput | Consistency |

You can combine both: send `MULTI`, your commands, and `EXEC` all in a single pipeline. One RTT, atomic execution.

Keep pipeline batches under ~1,000 commands — very large batches buffer responses server-side and can exhaust memory.

---

## RESP3: Richer Types and Push Messages

RESP3 shipped with Redis 6.0. It is a strict superset of RESP2 — existing clients continue working unchanged.

**The core problem with RESP2:** `LRANGE`, `SMEMBERS`, and `HGETALL` all return `*` (Array). A client receiving a reply cannot tell whether it's a list, a set, or a hash without remembering which command it sent. This forces every client library to maintain a command-type table.

RESP3 adds semantic types — including native Map and Set — so the reply carries its own meaning:

```
%2\r\n          ← Map with 2 pairs (%)
+field1\r\n
$6\r\nvalue1\r\n
+field2\r\n
$6\r\nvalue2\r\n
```

New type discriminators in RESP3:

| Byte | Type | Example |
|---|---|---|
| `_` | Null | `_\r\n` |
| `#` | Boolean | `#t\r\n` / `#f\r\n` |
| `,` | Double | `,1.23\r\n` |
| `%` | Map | `%2\r\n+key\r\n:1\r\n+k2\r\n:2\r\n` |
| `~` | Set | `~3\r\n:1\r\n:2\r\n:3\r\n` |
| `>` | Push | `>3\r\n+message\r\n+chan\r\n+txt\r\n` |

The `>` (Push) type is the headline feature.

---

## Client-Side Caching via Push Messages

In RESP2, a client that wants cache invalidation from Redis needs **two TCP connections** — one for data, one subscribed to a Pub/Sub invalidation channel. RESP3 collapses this to one connection because the server can push unsolicited messages between regular replies.

```
Client: CLIENT TRACKING ON\r\n
Server: +OK\r\n

Client: GET user:42\r\n
Server: $12\r\nJohn Doe 1984\r\n   ← client caches user:42 locally

... another client modifies user:42 ...

Server pushes (unsolicited, on the same connection):
>2\r\n
$10\r\ninvalidate\r\n
*1\r\n$7\r\nuser:42\r\n
```

The client reads the `>` byte, recognizes it as a push (not a reply), reads the push type (`invalidate`), and removes `user:42` from its local cache. The regular request/response flow continues uninterrupted on the same socket.

To enable RESP3, send the `HELLO` command at connection time:

```
HELLO 3\r\n
```

The server responds with a RESP3 Map describing the server info, and all subsequent replies on that connection use RESP3 encoding.

---

## Why Text Over Binary?

The Redis specification notes that "a simple human readable protocol is not the bottleneck in the client-server communication." Redis's real bottlenecks are I/O, memory operations, and command processing — not serialization overhead.

The text format pays off in ways that matter day-to-day:

- **Debuggable with `tcpdump`** — RESP is readable in a packet capture without a decoder
- **Testable with `nc` or `telnet`** — you can talk to Redis directly from a shell
- **Implementable in ~50 lines** — any language can write a RESP parser in an afternoon

```bash
# See all commands as they execute
redis-cli MONITOR

# Packet capture — RESP is readable directly
sudo tcpdump -i lo -A -s 0 'tcp port 6379'
```

The length-prefix design on bulk strings keeps the parser O(1) per token — one read of the length, one `read()` of exactly `length + 2` bytes. The first-byte type discriminator keeps branching O(1). For a protocol processing millions of operations per second, these constants matter more than saving a few bytes per message.

---

## The Mental Model

Reading RESP bottom-up — parser to protocol to command — makes Redis clients legible. When a Jedis or StackExchange.Redis connection "pipeline" method appears, you now know it's buffering RESP-formatted commands into a single TCP write. When a client sets a `TCP_NODELAY` socket option, it's preventing Nagle's algorithm from delaying the pipeline flush. When a library advertises "RESP3 support," it means it can handle push messages and use semantic types to skip the command-type lookup table.

The protocol is simple by design. That simplicity is what makes Redis fast, debuggable, and easy to implement clients for in any language.
