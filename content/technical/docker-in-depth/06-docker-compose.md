---
title: "Docker Compose — Multi-Container Apps Made Simple"
order: 6
tags: ["docker", "docker-compose", "devops"]
date: "2026-05-06"
draft: false
lang: "en"
---

## The Problem Compose Solves

By the end of Chapter 2, spinning up a two-container stack looked like this:

```bash
docker network create app-net
docker volume create pgdata

docker run -d \
  --name postgres \
  --network app-net \
  -v pgdata:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=secret \
  postgres:16

docker run -d \
  --name api \
  --network app-net \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://postgres:secret@postgres:5432/myapp \
  my-api:latest
```

That's already unwieldy for two services. Real applications have four, six, ten. Remembering which flags go where, what order to start services, which volumes to create first — that's cognitive overhead that compounds every time a new developer joins the project.

Docker Compose replaces all of that with a single YAML file and a single command: `docker compose up`.

---

## The `docker-compose.yml` File

Compose reads a `docker-compose.yml` (or `compose.yaml`) in your project root. Everything that was a `docker run` flag becomes a key in the file.

Here's the two-container stack from above, as Compose:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: myapp
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:secret@postgres:5432/myapp
    depends_on:
      - postgres

volumes:
  pgdata:
```

Compare this to the shell commands: same configuration, a fraction of the cognitive load. Every key maps directly to a `docker run` flag you already know.

Note: `build: .` tells Compose to build the image from the `Dockerfile` in the current directory, rather than pulling a pre-built image.

---

## Core Commands

```bash
docker compose up           # create and start all services
docker compose up -d        # same, in detached mode
docker compose up --build   # force rebuild images before starting

docker compose down         # stop and remove containers, networks
docker compose down -v      # also remove volumes (careful — deletes data)

docker compose ps           # show running services
docker compose logs         # view all service logs
docker compose logs -f api  # follow logs for the api service only

docker compose exec api sh  # open a shell in the running api container
docker compose run api bash # run a one-off command in a new container

docker compose stop         # stop services without removing them
docker compose start        # start stopped services
docker compose restart api  # restart a specific service
```

The key distinction: `docker compose down` removes containers and networks. `docker compose stop` just stops them — containers still exist and can be restarted. Add `-v` to `down` if you want to wipe volumes too.

---

## Service Configuration In Depth

### Building Images

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.prod
      args:
        NODE_ENV: production
```

`context` is the build context path. `dockerfile` lets you specify a non-default Dockerfile name. `args` passes `ARG` values to the Dockerfile at build time.

### Environment Variables

Three ways to pass environment variables, in order of preference:

```yaml
# 1. Inline (fine for non-sensitive config)
environment:
  NODE_ENV: production
  PORT: 3000

# 2. From a .env file (default: .env in the same directory)
env_file:
  - .env
  - .env.local

# 3. Pass through from host (no value = use host's env)
environment:
  - AWS_ACCESS_KEY_ID
  - AWS_SECRET_ACCESS_KEY
```

Compose automatically loads a `.env` file in the project root for variable interpolation in the YAML itself:

```yaml
# .env
POSTGRES_PASSWORD=supersecret
POSTGRES_VERSION=16
```

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:${POSTGRES_VERSION}
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

This is how you keep secrets out of version control while keeping the Compose file readable.

### Health Checks and `depends_on`

`depends_on` ensures service start order, but by default it only waits for the container to start — not for the service inside to be ready. A database container can be "started" while Postgres is still initializing.

Use health checks to wait for actual readiness:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: secret
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
```

With `condition: service_healthy`, Compose waits until the `healthcheck` command succeeds before starting `api`. No more race conditions where your API tries to connect before Postgres is accepting connections.

### Restart Policies

```yaml
services:
  api:
    restart: unless-stopped
```

| Policy | Behavior |
|---|---|
| `no` | Never restart (default) |
| `always` | Always restart, including on daemon start |
| `on-failure` | Restart only if exit code is non-zero |
| `unless-stopped` | Like `always`, but respects manual `docker compose stop` |

Use `unless-stopped` for long-running services in production-like environments. Use `no` or `on-failure` in development so crashes are visible.

### Resource Limits

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 256M
```

`limits` caps usage. `reservations` is a soft guarantee (the container prefers to get this much). On a shared machine, resource limits prevent one runaway container from starving the rest.

---

## A Real-World Stack

Here's a more complete example: a Node.js API, Postgres database, Redis cache, and an Nginx reverse proxy.

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - api

  api:
    build: .
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/myapp
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: myapp
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5

volumes:
  pgdata:
  redisdata:
```

This defines a complete local development environment that any developer can spin up with `docker compose up -d`. No "install Postgres", no "configure Redis", no environment setup documentation that's always out of date.

---

## Multiple Compose Files

Compose supports file overrides, which lets you keep a clean separation between dev and production config:

```bash
# base config
docker-compose.yml

# dev overrides (bind mounts, debug ports, nodemon)
docker-compose.override.yml   # automatically merged when you run docker compose up

# production overrides
docker-compose.prod.yml       # explicit: docker compose -f docker-compose.yml -f docker-compose.prod.yml up
```

`docker-compose.override.yml` is loaded automatically alongside the base file. Use it for dev-only settings:

```yaml
# docker-compose.override.yml
services:
  api:
    build:
      target: development
    volumes:
      - .:/app
      - /app/node_modules
    command: npm run dev
    environment:
      DEBUG: "true"
```

The production file tightens things up:

```yaml
# docker-compose.prod.yml
services:
  api:
    image: registry.example.com/my-api:${TAG}
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
```

---

## Common Pitfalls

**Using `links` instead of networks.** The `links` key is legacy. It creates `/etc/hosts` entries but doesn't isolate networks. Use user-defined networks (the default in Compose) instead.

**Relying on start order without health checks.** `depends_on` with no condition is a best-effort ordering hint, not a readiness guarantee. If your service crashes because the database isn't ready, add a health check.

**Committing `.env` to version control.** Use `.env.example` with placeholder values in git, and keep the real `.env` in `.gitignore`.

**Not specifying a volume name.** Anonymous volumes (`- /app/data`) are hard to identify and easy to accidentally prune. Always give volumes explicit names.

---

## What's Next

Compose gives you a convenient, reproducible local environment. But convenience can mask security problems. Next: [Docker Security](./07-security.md) — what the actual risks are, how containers can escape isolation, and the hardening steps that matter in production.
