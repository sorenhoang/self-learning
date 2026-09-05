---
title: "Makefile: Turn Long Commands Into Short Ones"
description: "Makefile lets you turn long commands (docker, curl, k6...) into short, memorable, repeatable ones — no C compiler knowledge required."
tags: ["makefile", "docker", "tooling", "devops", "ci-cd"]
date: "2026-09-05"
draft: false
lang: "en"
---

A Makefile is just a file that turns long commands into short, memorable
ones you can run over and over.

For example, instead of typing:

```bash
docker compose up -d
docker compose ps
curl -s localhost:8080/health | jq
```

you create a file named exactly `Makefile` (no extension) at the root of
your project, and write:

```make
up:
	docker compose up -d

ps:
	docker compose ps

health:
	curl -s localhost:8080/health | jq
```

Then run:

```bash
make up
make ps
make health
```

## The basic structure

```make
target:
	command
```

The simplest possible example:

```make
hello:
	echo "Hello"
```

Run:

```bash
make hello
```

and `make` simply runs the line underneath:

```bash
echo "Hello"
```

**The single most important rule of a Makefile:** the command line under a
target must start with a **TAB**, not spaces. If your editor auto-converts
tabs to spaces, turn that off for this file specifically — otherwise you'll
hit a confusing `*** missing separator` error.

## One target, multiple commands

```make
check:
	curl -s localhost:8080/health | jq
	docker compose ps
```

Run:

```bash
make check
```

and both lines run one after another.

## A realistic Makefile for a Docker-based service

```make
.PHONY: up down restart logs ps health check

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose down
	docker compose up -d

logs:
	docker compose logs -f

ps:
	docker compose ps

health:
	curl -s localhost:8080/health | jq

check: health
	docker compose ps
```

`.PHONY` tells `make`: "`up`, `down`, `health`... are **command targets**,
not filenames." By default, `make` assumes a target is the name of a file
it needs to produce — if a file happened to exist with the same name as a
target (say, a file literally called `up`), `make` would think "that file
already exists" and skip the command entirely. For a Makefile like this one
— running Docker, tests, and curl calls — pretty much every target should
be listed in `.PHONY`.

## Using variables to avoid repetition

```make
BASE_URL = http://localhost:8080

health:
	curl -s $(BASE_URL)/health | jq

version:
	curl -s $(BASE_URL)/version | jq
```

Change the port later by editing one line:

```make
BASE_URL = http://localhost:9090
```

## Making one target depend on another

Makefiles support declaring dependencies between targets. For example, you
want `check` to make sure the container is already running before it
curls anything:

```make
check: up
	curl -s localhost:8080/health | jq
```

When you run:

```bash
make check
```

`make` runs `up` first, then runs `check`'s own commands. You no longer
have to remember "start the container, *then* run the check" — the
Makefile remembers it for you.

## A self-describing `help` target

```make
help:
	@echo "make up      - Start containers"
	@echo "make down    - Stop containers"
	@echo "make health  - Check service health"
	@echo "make logs    - Tail logs"
```

The `@` in front of a command tells Make **not to print the command
itself** before running it. For example:

```make
hello:
	@echo "Hello"
```

Running `make hello` only shows:

```text
Hello
```

instead of showing both the command and its output:

```text
echo "Hello"
Hello
```

## Bundling load tests in too

If you're working with Docker + k6, a Makefile is a convenient place to
tuck away that long load-test command:

```make
k6:
	docker run --rm -i grafana/k6 run - < k6/script.js
```

so you just run:

```bash
make k6
```

## A couple of things worth knowing

- Running `make` with no target runs the **first target in the file** — so
  if you have a `help` target, put it first. That way plain `make` shows
  the list of commands instead of accidentally triggering `up` or `down`.
- If a command inside a target fails (non-zero exit code), `make` stops
  right there and doesn't run the remaining lines — which is usually what
  you want.

## The short version

```text
Makefile = shortcuts + automation for your project's commands
```

You type the long version once, while writing the Makefile. After that,
everyone on the team only needs to remember a few short words: `make up`,
`make check`, `make k6`.

Swap `health` and `version` for whatever endpoints or scripts your own
project actually has — the pattern stays the same no matter what's behind
the curl.
