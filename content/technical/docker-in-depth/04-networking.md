---
title: "Networking — How Containers Talk to Each Other"
order: 4
tags: ["docker", "networking", "devops"]
date: "2026-06-18"
draft: false
lang: "en"
---

A container has its own network namespace — its own IP, its own interfaces, its own routing table. By default it's isolated from everything else. Networking is how you punch controlled holes in that isolation.

---

## The Default Bridge Network

When Docker starts, it creates a network called `bridge`. Every container you run without specifying a network lands on it.

```bash
docker network ls
# NETWORK ID     NAME      DRIVER    SCOPE
# abc123         bridge    bridge    local
# def456         host      host      local
# ghi789         none      null      local
```

**Critical limitation of the default bridge:** containers can reach each other by IP, but not by name. IPs change on restart. You'd have to look up IPs manually every time.

```bash
# on the default bridge — name resolution does NOT work
docker run -d --name db postgres:16
docker run -d --name api my-api:latest
# from inside api: curl http://db:5432  → connection refused
# from inside api: curl http://172.17.0.2:5432  → works, but brittle
```

---

## User-Defined Bridge Networks

Create your own network. Containers on a user-defined bridge **resolve each other by container name**. Docker's embedded DNS handles it.

```bash
docker network create app-net

docker run -d --name postgres --network app-net postgres:16
docker run -d --name api --network app-net my-api:latest
```

From inside `api`:

```bash
docker exec -it api sh
curl http://postgres:5432    # works — Docker resolves "postgres" to its IP
ping postgres                # also works
```

This is the pattern for every multi-container setup before Compose.

---

## Network Drivers

| Driver | Use case |
|---|---|
| `bridge` | Default. Containers on the same host. |
| `host` | Container shares the host's network namespace. No isolation, max performance. |
| `overlay` | Multi-host networking for Swarm or Kubernetes. |
| `none` | No networking. Fully isolated. |
| `macvlan` | Assigns a real MAC address — container appears as a physical device on the network. |

For most applications you'll use `bridge`. `host` is useful for monitoring agents that need to see host-level network stats. `overlay` comes into play in Chapter 9 (Orchestration).

---

## Port Publishing

A container's ports are **not accessible from the host** unless you publish them.

```bash
docker run -d -p 8080:3000 my-api:latest
#                 ↑     ↑
#            host port  container port
```

Traffic to `localhost:8080` on the host is forwarded to port `3000` inside the container.

```bash
# multiple ports
docker run -d \
  -p 8080:3000 \
  -p 9090:9090 \
  my-api:latest

# bind to a specific host interface (loopback only — not exposed publicly)
docker run -d \
  -p 127.0.0.1:9090:9090 \
  my-api:latest

# UDP
docker run -d \
  -p 5353:5353/udp \
  dns-server:latest
```

`-p 127.0.0.1:9090:9090` restricts the port to loopback — useful for admin or debug endpoints you don't want on a public interface.

---

## Connecting Containers to Multiple Networks

A container can join more than one network. This is how you segment traffic in production — a container sits on the `frontend` network (can reach the web) and the `backend` network (can reach the database), while the database only joins `backend`.

```bash
docker network create frontend
docker network create backend

docker run -d --name nginx --network frontend nginx:alpine
docker run -d --name api --network frontend my-api:latest
docker network connect backend api            # api joins backend too

docker run -d --name postgres --network backend postgres:16
# postgres is only on backend — nginx cannot reach it
```

---

## Inspecting Networks

```bash
docker network inspect app-net             # JSON: all containers, IPs, config
docker network connect app-net my-api      # attach a running container to a network
docker network disconnect app-net my-api   # detach
docker network rm app-net                  # delete (must have no active endpoints)
docker network prune                       # delete all unused networks
```

---

## Debugging Network Issues

When containers can't reach each other, work through this:

```bash
# 1. confirm both containers are on the same network
docker inspect api | grep -A 20 '"Networks"'
docker inspect postgres | grep -A 20 '"Networks"'

# 2. test from inside a container
docker exec -it api sh
ping postgres           # can we resolve the name?
nc -zv postgres 5432    # can we reach the port? (netcat)

# 3. check if the target port is actually listening
docker exec -it postgres sh
ss -tlnp | grep 5432

# 4. inspect the shared network
docker network inspect app-net
```

**Most common cause:** the containers are on different networks. The default `bridge` and any user-defined network are completely separate — a container on `bridge` cannot reach one on `app-net` by name, or at all without IP.

---

## Summary

```
Default bridge: containers see each other by IP only (brittle).
User-defined bridge: containers see each other by name (use this).

docker network create app-net
docker run --network app-net --name db postgres:16
docker run --network app-net --name api my-api:latest
# api can now reach db:5432
```

Next: [Volumes & Data](./05-volumes.md) — what happens to your data when a container stops.
