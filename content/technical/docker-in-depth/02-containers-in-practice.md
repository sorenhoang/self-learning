---
title: "Containers in Practice — The Docker CLI"
order: 2
tags: ["docker", "containers", "devops"]
date: "2026-06-18"
draft: false
lang: "en"
---

A container has a lifecycle. Understanding each state tells you which command to use and what happens to your data.

```
docker create    → Created (exists, not running)
docker start     → Running (process is alive)
docker stop      → Exited (graceful: SIGTERM → wait → SIGKILL)
docker kill      → Exited (immediate: SIGKILL)
docker rm        → Deleted (gone from docker ps -a)
```

`docker run` = `docker create` + `docker start` in one step. It's what you use 95% of the time.

---

## docker run — The Flags You'll Actually Use

```bash
docker run nginx
```

That's the minimum. But you almost always need flags:

```bash
docker run \
  -d \                        # detached: run in background
  -p 8080:80 \                # host_port:container_port
  --name my-nginx \           # human-readable name (instead of random)
  -e APP_ENV=production \     # environment variable
  --rm \                      # auto-delete when container stops
  nginx:1.27
```

| Flag | What it does |
|---|---|
| `-d` | Background. Container keeps running after the command exits. |
| `-p 8080:80` | Publish port. `localhost:8080` → container's port `80`. |
| `--name` | Name the container. Without it, Docker picks a random name (`suspicious_fermat`). |
| `-e KEY=VAL` | Set an environment variable inside the container. |
| `--rm` | Delete the container automatically when it exits. Great for one-off tasks. |
| `-it` | Interactive + pseudo-TTY. Opens a shell session. |

```bash
# open an interactive shell in Ubuntu — container deletes itself when you exit
docker run -it --rm ubuntu:22.04 bash
```

---

## Listing and Inspecting Containers

```bash
docker ps                  # running containers only
docker ps -a               # all containers (running + stopped)
docker ps -q               # quiet: IDs only (useful in scripts)
```

```bash
# docker ps output
CONTAINER ID   IMAGE          COMMAND                  STATUS         PORTS                  NAMES
a1b2c3d4e5f6   nginx:1.27     "/docker-entrypoint.…"  Up 3 minutes   0.0.0.0:8080->80/tcp   my-nginx
```

`docker inspect` gives you everything: IP address, mounts, env vars, restart count, exit codes:

```bash
docker inspect my-nginx                          # full JSON
docker inspect my-nginx | grep IPAddress         # grep for specific field
docker inspect --format '{{.State.Status}}' my-nginx   # extract one field
```

---

## Stopping and Removing

```bash
docker stop my-nginx        # SIGTERM → 10s grace → SIGKILL if still running
docker kill my-nginx        # immediate SIGKILL (no grace period)
docker rm my-nginx          # delete a stopped container
docker rm -f my-nginx       # force: stop + delete in one command
```

**Stopping vs killing:** Always prefer `stop`. It gives the process time to flush data, close connections, and clean up. Use `kill` only when the process is stuck.

Clean up everything at once:

```bash
docker rm $(docker ps -aq)         # remove all stopped containers
docker container prune             # same, with a confirmation prompt
```

---

## Logs

```bash
docker logs my-nginx               # all stdout/stderr since start
docker logs -f my-nginx            # follow (like tail -f)
docker logs --tail 50 my-nginx     # last 50 lines
docker logs --since 10m my-nginx   # logs from last 10 minutes
```

Logs are stored on the host by default (JSON file driver). They grow unbounded unless you configure log rotation:

```bash
docker run \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  nginx:1.27
```

Or globally in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

---

## Getting Inside a Running Container

```bash
docker exec -it my-nginx sh        # open a shell in a running container
docker exec my-nginx ls /etc/nginx # run a single command, no interactive session
docker exec -it my-nginx bash      # bash if available (not on Alpine)
```

`docker exec` creates a **new process** inside an already-running container. It does not restart the container or affect the main process.

Common debugging pattern:

```bash
# something is wrong with nginx config
docker exec -it my-nginx sh
cat /etc/nginx/nginx.conf          # check the config
nginx -t                           # test config syntax
```

---

## Resource Usage

```bash
docker stats                        # live CPU, memory, network, disk I/O for all containers
docker stats my-nginx               # same, for one container
docker stats --no-stream            # single snapshot (useful in scripts)
```

```
CONTAINER ID   NAME       CPU %   MEM USAGE / LIMIT   MEM %   NET I/O
a1b2c3d4e5f6   my-nginx   0.0%    5.6MiB / 7.7GiB    0.07%   1.2kB / 0B
```

---

## Managing Images

```bash
docker images                      # list local images
docker pull node:20-alpine         # download from registry
docker rmi nginx:1.27              # remove an image
docker image prune                 # remove dangling images (untagged, unreferenced)
docker system prune                # remove everything unused: containers, images, networks, volumes
```

**Disk bloat is real.** Docker accumulates stopped containers, old image versions, and dangling layers. Run `docker system prune` periodically, or set up automated cleanup.

---

## Summary

```
docker run -d -p 8080:80 --name app nginx:1.27   ← start
docker ps                                         ← list
docker logs -f app                                ← debug output
docker exec -it app sh                            ← debug inside
docker stop app && docker rm app                  ← clean up
```

Next: [Building Images](/technical/docker-in-depth/03-building-images) — how to write a Dockerfile and build your own images.
