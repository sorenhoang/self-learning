---
title: "Building Images — Dockerfile From Scratch"
order: 3
tags: ["docker", "dockerfile", "devops"]
date: "2026-06-18"
draft: false
lang: "en"
---

An image is a stack of read-only layers. Every instruction in a `Dockerfile` adds one layer on top of the previous.

```
Image: my-app:latest
├── Layer 1: node:20-alpine        (base OS + Node runtime)
├── Layer 2: RUN npm ci            (installed dependencies)
├── Layer 3: COPY . .              (your application code)
└── Layer 4: CMD ["node", "index"] (metadata only, no filesystem change)
```

Layers are cached. If a layer hasn't changed, Docker reuses it from cache — the build skips straight to the first changed layer and rebuilds from there. This is why **instruction order matters**.

---

## The Dockerfile Instructions

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
CMD ["node", "src/index.js"]
```

| Instruction | What it does |
|---|---|
| `FROM` | Sets the base image. Always the first instruction. |
| `WORKDIR` | Sets (and creates) the working directory. All subsequent paths are relative to it. |
| `COPY src dest` | Copies files from the build context into the image. |
| `RUN cmd` | Executes a shell command at **build time**. Result is committed as a new layer. |
| `EXPOSE port` | Documents which port the app uses. Does **not** publish it — that's `-p` at runtime. |
| `CMD ["exec", "args"]` | Default command at **runtime**. Can be overridden with `docker run <image> <cmd>`. |

---

## RUN vs CMD vs ENTRYPOINT

The most confused trio in Docker:

```dockerfile
# RUN → build time (modifies the image)
RUN apt-get update && apt-get install -y curl

# CMD → runtime (default process, overridable)
CMD ["node", "index.js"]
# docker run my-app          → runs: node index.js
# docker run my-app bash     → runs: bash (CMD overridden)

# ENTRYPOINT → runtime (fixed executable, not overridable without --entrypoint)
ENTRYPOINT ["npm", "run"]
CMD ["start"]
# docker run my-app          → runs: npm run start
# docker run my-app test     → runs: npm run test  (CMD overridden, ENTRYPOINT fixed)
```

**Rule of thumb:**
- Use `CMD` for apps where the command might vary (`node`, `python`, `sh`)
- Use `ENTRYPOINT` when the container is a tool with fixed behavior and varying args

---

## Layer Cache Optimization

The cache is invalidated at the **first changed layer** and everything below it rebuilds from scratch.

```dockerfile
# BAD — copying all code first invalidates npm cache on every code change
FROM node:20-alpine
WORKDIR /app
COPY . .                    ← any code change busts cache here
RUN npm ci                  ← reinstalls ALL packages every time
```

```dockerfile
# GOOD — copy package files first, code second
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./       ← only changes when dependencies change
RUN npm ci                  ← cached as long as package*.json is unchanged
COPY . .                    ← code changes only bust this layer
CMD ["node", "src/index.js"]
```

**The pattern:** put things that change infrequently (deps, config) before things that change often (source code).

---

## .dockerignore

`.dockerignore` controls what gets sent to the Docker daemon as the build context. Without it, `docker build .` sends your entire directory — including `node_modules`, `.git`, and `.env`.

```
# .dockerignore
node_modules
.git
.env
*.log
dist
coverage
.DS_Store
```

On a Node project, `node_modules` alone can be 200–500 MB. Adding `.dockerignore` drops build context from hundreds of MB to kilobytes. It also prevents accidentally baking secrets into images.

---

## Multi-Stage Builds

Build tools (TypeScript compiler, test frameworks, dev dependencies) should not exist in the final image. Multi-stage builds solve this:

```dockerfile
# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci                       # install ALL deps (including devDependencies)
COPY . .
RUN npm run build                # compile TypeScript → dist/

# Stage 2: production
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production     # production deps only
COPY --from=builder /app/dist ./dist   # only copy compiled output
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

The final image contains zero TypeScript source, zero dev tools. Only the compiled output and runtime dependencies. Typical size reduction: 50–80%.

```bash
# you can also target a specific stage
docker build --target builder -t my-app:debug .
```

---

## Building an Image

```bash
docker build -t my-app:latest .
```

- `-t my-app:latest` — name and tag (`name:tag`)
- `.` — build context (directory Docker reads files from)

```bash
docker build -t my-app:1.0.0 --no-cache .   # skip all caches, full rebuild
docker build -t my-app:latest -f Dockerfile.prod .   # use a different Dockerfile
```

---

## Pushing to a Registry

```bash
# Docker Hub
docker login
docker tag my-app:latest yourusername/my-app:latest
docker push yourusername/my-app:latest

# Pull on another machine
docker pull yourusername/my-app:latest
```

For private registries, the registry hostname is part of the tag:

```bash
# AWS ECR
docker tag my-app:latest 123456789.dkr.ecr.ap-southeast-1.amazonaws.com/my-app:1.0.0
docker push 123456789.dkr.ecr.ap-southeast-1.amazonaws.com/my-app:1.0.0

# GitHub Container Registry
docker tag my-app:latest ghcr.io/yourorg/my-app:1.0.0
docker push ghcr.io/yourorg/my-app:1.0.0
```

---

## Common Pitfalls

**Using `:latest` in FROM.** `FROM node:latest` changes silently when Node releases a new major version. Pin to a specific version: `FROM node:20-alpine`.

**Running as root.** By default the process inside the container is root. Add a non-root user:

```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser
```

Node images ship with a `node` user already:

```dockerfile
USER node
```

**Secrets in the Dockerfile.** `ENV DATABASE_PASSWORD=secret` bakes the secret into the image — visible via `docker history`. Pass secrets at runtime (`-e`) or use BuildKit secrets.

**One process per container.** If you need app + database, use Compose (Chapter 6) — not two processes in one container.

---

## Summary

```
Layer order matters — deps before code, stable before volatile.
.dockerignore — always include it, or you'll send 500MB build contexts.
Multi-stage — build tools stay in the builder stage; only the output ships.
Non-root — add USER before CMD in every production image.
Pin tags — FROM node:20.11.0-alpine, not FROM node:latest.
```

Next: [Networking](./04-networking.md) — how containers talk to each other.
