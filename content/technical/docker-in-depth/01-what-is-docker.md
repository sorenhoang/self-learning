---
title: "What is Docker?"
order: 1
tags: ["docker", "containers", "devops"]
date: "2026-06-17"
draft: false
lang: "en"
---

Your app works on your machine. It crashes on your teammate's. It behaves differently in staging. The root cause is almost always the same: **the environment is different**.

```
Dev machine:   Node 18, libssl 1.1, Debian 11
Teammate:      Node 20, libssl 3.0, macOS
Staging:       Node 16, libssl 1.1, Ubuntu 22
```

Docker solves this by packaging your app **together with its entire environment** into a single unit that runs identically everywhere.

---

## The Core Idea: Package Everything

```
Without Docker:
  [Your code] → relies on → [OS libs, runtime, config on the host]
                                     ↑
                              differs per machine

With Docker:
  [Your code + libs + runtime + config] → ships as one unit → runs identically
```

That unit is called a **container**.

---

## VM vs Container

Both give you isolation. The mechanism is completely different.

```
Virtual Machine                     Container
────────────────────────────────    ────────────────────────────────
  ┌──────────┐  ┌──────────┐          ┌──────────┐  ┌──────────┐
  │  App A   │  │  App B   │          │  App A   │  │  App B   │
  ├──────────┤  ├──────────┤          ├──────────┤  ├──────────┤
  │Guest OS  │  │Guest OS  │          │  libs    │  │  libs    │
  ├──────────┴──┴──────────┤          └────┬─────┴──┴──────────┘
  │     Hypervisor         │               │ shared kernel
  ├────────────────────────┤          ┌────┴─────────────────────┐
  │      Host OS           │          │      Host OS (kernel)    │
  └────────────────────────┘          └──────────────────────────┘

Boots a full OS per VM.              Shares the host kernel.
Gigabytes of RAM.                    Megabytes of RAM.
Minutes to start.                    Milliseconds to start.
Strong hardware-level isolation.     Process-level isolation.
```

A container is not a mini-VM. It's a **regular Linux process** with restricted visibility — it can't see other processes, other filesystems, or other network interfaces unless you allow it.

---

## How the Isolation Works: Namespaces + cgroups

Linux gives Docker two kernel primitives:

**Namespaces** — control what a process *can see*:

```
pid namespace   → container has its own process tree (PID 1 is your app)
net namespace   → container has its own network interfaces, IP, ports
mnt namespace   → container has its own filesystem view
uts namespace   → container has its own hostname
```

**cgroups** (control groups) — control what a process *can use*:

```
memory cgroup   → limit RAM to 512MB
cpu cgroup      → limit to 0.5 CPU cores
blkio cgroup    → limit disk I/O
```

Docker is a user-friendly wrapper around these two kernel features. When you `docker run`, Linux creates a new set of namespaces and cgroups — your process runs inside them, isolated from everything else on the host.

---

## Image vs Container

This distinction confuses almost everyone starting out.

```
Image                               Container
────────────────────────────────    ────────────────────────────────
Read-only blueprint.                A running (or stopped) instance.
Stored on disk.                     Uses memory and CPU.
Built once, shared.                 Created from an image.
Like a class definition.            Like an object instance.
```

```bash
# An image sitting on disk — nothing is running
docker images
# REPOSITORY   TAG       IMAGE ID       SIZE
# nginx        latest    a6bd71f48f68   192MB

# Spin up a container FROM that image — now it's running
docker run nginx

# Two containers, one image — two instances of the same blueprint
docker run nginx
docker run nginx
```

Changing a running container does **not** change the image. The image is always the source of truth.

---

## Where Images Come From: The Registry

```
Docker Hub (hub.docker.com)         ← default public registry
  ├── nginx:1.27                    ← official image
  ├── postgres:16                   ← official image
  └── yourname/myapp:v1.2           ← your image

Private registries:
  ├── AWS ECR (Elastic Container Registry)
  ├── Google Artifact Registry
  └── GitHub Container Registry (ghcr.io)
```

When you run `docker run nginx`, Docker:
1. Checks if the `nginx` image exists locally
2. If not, pulls it from Docker Hub
3. Creates a container from that image and starts it

---

## The Three Things You Need to Know

```
Image     → the blueprint (read-only, built from a Dockerfile)
Container → a running instance of an image
Registry  → where images are stored and shared
```

Everything else in Docker is built on these three.

---

## Summary

```
Problem:   environment differences break apps across machines.

Docker:    packages app + dependencies into a container.
           containers share the host kernel (not a full OS).
           isolation via Linux namespaces + cgroups.

Key rule:  image ≠ container.
           image is the blueprint (read-only).
           container is the running instance.
           changing a container doesn't change the image.
```

Next: [Containers in Practice](/technical/docker-in-depth/02-containers-in-practice) — how to pull images, start/stop containers, and navigate the Docker CLI.
