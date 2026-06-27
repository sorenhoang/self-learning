---
title: "Volumes & Data — Persisting State Beyond the Container"
order: 5
tags: ["docker", "volumes", "devops"]
date: "2026-06-18"
draft: false
lang: "en"
---

Every container starts with a fresh copy of its image filesystem. Writes go into a thin **writable layer** on top. When the container is removed, that layer is gone.

```bash
docker run -d --name db postgres:16
# write some data to the database...
docker rm -f db
# all data is gone — the writable layer was deleted with the container
```

For stateless apps (most web servers), this is fine. For anything stateful — databases, file uploads, caches — you need storage that survives container restarts and deletions.

---

## Three Ways to Mount Storage

```
Host filesystem
      │
  ┌───┴────────────────────────────────────────────┐
  │  Named Volumes  (Docker-managed path)           │
  │  Bind Mounts    (specific host path)            │
  │  tmpfs Mounts   (in-memory only, never on disk) │
  └────────────────────────────────────────────────┘
```

---

## Named Volumes — Production Default

Docker manages the storage path. You don't need to know where it lives on the host.

```bash
docker volume create pgdata

docker run -d \
  --name postgres \
  -v pgdata:/var/lib/postgresql/data \
  postgres:16
```

The data lives at `/var/lib/docker/volumes/pgdata/_data` on the host. It persists across container restarts, `docker stop`, and even `docker rm`. Only `docker volume rm pgdata` or `docker volume prune` removes it.

```bash
docker volume ls                      # list all volumes
docker volume inspect pgdata          # mountpoint, creation date
docker volume rm pgdata               # delete the volume (fails if in use)
docker volume prune                   # delete all unused volumes (careful!)
```

---

## Bind Mounts — Local Development

Mount a specific host directory into the container. Changes on either side are reflected immediately — this is the standard local dev pattern.

```bash
docker run -d \
  -v $(pwd):/app \
  -p 3000:3000 \
  my-app:dev
```

The host's current directory is mounted at `/app` inside the container. Edit a file on your machine — the container sees it instantly. No rebuild needed.

**The `node_modules` trick:**

```bash
docker run -d \
  -v $(pwd):/app \          # mount source code
  -v /app/node_modules \    # anonymous volume: keeps container's node_modules intact
  my-app:dev
```

Without the second `-v`, the host's `node_modules` (or lack of it) would overwrite what was installed inside the container. The anonymous volume shadows `/app/node_modules` with the container's own version.

---

## tmpfs Mounts — Sensitive or Ephemeral Data

In-memory only. Not written to disk. Disappears when the container stops.

```bash
docker run -d \
  --tmpfs /tmp \
  my-app:latest
```

Use for:
- Sensitive data that should never touch disk (tokens, intermediate crypto material)
- High-speed temporary scratch space

---

## Named Volumes vs Bind Mounts — When to Use Which

| | Named Volume | Bind Mount |
|---|---|---|
| **Location** | Docker-managed | Specific host path |
| **Best for** | Production, databases | Local dev, config injection |
| **Portability** | High — works on any Docker host | Low — tied to host directory |
| **Performance** | Optimized for containers | Slower on Mac/Windows (fsevents overhead) |

Use named volumes in production. Use bind mounts for local development. Avoid anonymous volumes (no name) in production — they're hard to track and easy to accidentally prune.

---

## Practical Patterns

### Database with Persistent Storage + Custom Network

```bash
docker network create app-net

docker run -d \
  --name postgres \
  --network app-net \
  -v pgdata:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=myapp \
  postgres:16

docker run -d \
  --name api \
  --network app-net \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://postgres:secret@postgres:5432/myapp \
  my-api:latest
```

`api` reaches the database by name (`postgres:5432` via DNS). Data survives container restarts via the `pgdata` volume.

### Read-Only Mount

```bash
docker run -d \
  -v $(pwd)/config:/app/config:ro \
  my-app:latest
```

`:ro` = read-only. The container can read config files but cannot modify them.

### Sharing a Volume Between Containers

```bash
docker volume create shared-uploads

docker run -d --name app -v shared-uploads:/app/uploads my-app:latest
docker run -d --name nginx -v shared-uploads:/usr/share/nginx/html/uploads nginx:alpine
```

Both containers read and write the same volume. `nginx` can serve files that `app` wrote.

---

## Backing Up and Restoring Volumes

Docker volumes live on the host. Back them up with a temporary container:

```bash
# backup: tar the volume contents to the host
docker run --rm \
  -v pgdata:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/pgdata-backup.tar.gz -C /data .

# restore: extract into a new volume
docker volume create pgdata-restored
docker run --rm \
  -v pgdata-restored:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/pgdata-backup.tar.gz -C /data
```

---

## Summary

```
Named volume:  docker run -v myvolume:/data/path    ← production
Bind mount:    docker run -v $(pwd):/app             ← local dev
tmpfs:         docker run --tmpfs /tmp               ← sensitive/ephemeral

Volumes survive: container stop, restart, rm
Volumes die on:  docker volume rm, docker volume prune
```

Next: [Docker Compose](/technical/docker-in-depth/06-docker-compose) — replace all these docker run commands with a single YAML file.
