---
title: "Docker in CI/CD — Automating Builds and Deployments"
order: 8
tags: ["docker", "ci-cd", "devops", "github-actions"]
date: "2026-05-06"
draft: false
lang: "en"
---

## Why Docker and CI/CD Belong Together

Docker solves the "it works on my machine" problem. CI/CD solves the "someone forgot to deploy" problem. Together, they solve the broader problem of shipping software reliably and repeatedly.

The pipeline goal is simple: every push to the repository should automatically build a Docker image, run tests, scan for vulnerabilities, push to a registry, and optionally deploy — with no manual steps.

This chapter walks through building that pipeline using GitHub Actions as the CI platform, but the concepts apply to any CI system (GitLab CI, CircleCI, Jenkins, etc.).

---

## The CI/CD Pipeline for Containerized Apps

A typical Docker CI/CD pipeline has these stages:

```
Push to git
    │
    ▼
1. Lint & static analysis
    │
    ▼
2. Build Docker image
    │
    ▼
3. Run tests inside container
    │
    ▼
4. Scan image for vulnerabilities
    │
    ▼
5. Push image to registry (on main branch)
    │
    ▼
6. Deploy to staging / production
```

Each stage gates the next. A failing test prevents an image from being pushed. A critical CVE prevents deployment. Nothing reaches production without passing every gate.

---

## Building with GitHub Actions

### Basic Build Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: false
          tags: my-app:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Run tests
        run: |
          docker run --rm my-app:${{ github.sha }} npm test
```

Key decisions here:

- **Docker Buildx** enables BuildKit features: multi-stage caching, secrets, multi-platform builds.
- **GitHub Actions cache** (`type=gha`) caches image layers between runs. A cold build of a Node.js app might take 3 minutes; a cached build with only app code changes takes 20 seconds.
- `push: false` on PRs — build and test, but don't push to the registry.

### Build Arguments and Metadata

```yaml
- name: Extract metadata
  id: meta
  uses: docker/metadata-action@v5
  with:
    images: ghcr.io/${{ github.repository }}
    tags: |
      type=sha
      type=ref,event=branch
      type=semver,pattern={{version}}

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    push: ${{ github.ref == 'refs/heads/main' }}
    tags: ${{ steps.meta.outputs.tags }}
    labels: ${{ steps.meta.outputs.labels }}
    build-args: |
      BUILD_DATE=${{ github.event.head_commit.timestamp }}
      GIT_SHA=${{ github.sha }}
```

`docker/metadata-action` automatically generates tags based on git context: `sha-abc1234` for commits, `main` for the branch, `v1.2.3` for semver tags. The `labels` output adds OCI standard labels to the image (build date, git URL, commit SHA) — useful for tracing a running container back to the exact commit it was built from.

---

## Running Tests Inside Docker

Testing inside the container is better than testing on the runner directly — it tests the actual artifact that will deploy.

### Single-Container Tests

```yaml
- name: Run unit tests
  run: docker run --rm my-app:${{ github.sha }} npm run test:unit

- name: Run integration tests
  run: docker run --rm my-app:${{ github.sha }} npm run test:integration
```

### Tests Requiring Dependencies

Use Compose for tests that need a database or cache:

```yaml
# docker-compose.test.yml
services:
  test:
    build: .
    command: npm test
    environment:
      DATABASE_URL: postgresql://postgres:test@postgres:5432/testdb
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: test
      POSTGRES_DB: testdb
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      retries: 10
```

```yaml
# in your workflow
- name: Run tests with database
  run: |
    docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test
    docker compose -f docker-compose.test.yml down -v
```

`--abort-on-container-exit` stops all services when any service exits. `--exit-code-from test` makes the command exit with the `test` service's exit code — so CI fails if tests fail.

---

## Vulnerability Scanning in CI

Scanning in CI catches CVEs before they reach production. Using Trivy with GitHub Actions:

```yaml
- name: Scan image for vulnerabilities
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: my-app:${{ github.sha }}
    format: sarif
    output: trivy-results.sarif
    severity: HIGH,CRITICAL
    exit-code: 1  # fail the build on HIGH/CRITICAL findings

- name: Upload scan results
  uses: github/codeql-action/upload-sarif@v3
  if: always()  # upload even if scan failed
  with:
    sarif_file: trivy-results.sarif
```

`exit-code: 1` makes the step fail when HIGH or CRITICAL vulnerabilities are found. `format: sarif` + `upload-sarif` publishes results to GitHub's Security tab — findings appear as code scanning alerts on the repository.

For a less strict policy during development, remove `exit-code: 1` and use the SARIF upload only — scan reports without blocking the pipeline.

---

## Pushing to a Registry

### GitHub Container Registry (GHCR)

```yaml
- name: Log in to GHCR
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

`GITHUB_TOKEN` is automatically available — no extra secret needed for GHCR.

### AWS ECR

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ap-southeast-1

- name: Log in to ECR
  id: login-ecr
  uses: aws-actions/amazon-ecr-login@v2

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: ${{ steps.login-ecr.outputs.registry }}/my-app:${{ github.sha }}
```

Store `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as GitHub repository secrets. For production pipelines, prefer OIDC (OpenID Connect) authentication instead of long-lived access keys — it avoids storing static credentials at all.

---

## A Complete Pipeline

Putting it all together — build, test, scan, push, and deploy on merge to main:

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  ci:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      security-events: write

    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Log in to registry
        if: github.ref == 'refs/heads/main'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}

      - name: Build image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: false
          load: true
          tags: my-app:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Run tests
        run: docker run --rm my-app:${{ github.sha }} npm test

      - name: Scan for vulnerabilities
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: my-app:${{ github.sha }}
          severity: HIGH,CRITICAL
          exit-code: 1

      - name: Push to registry
        if: github.ref == 'refs/heads/main'
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha

  deploy:
    needs: ci
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Deploy to production
        run: |
          # example: SSH into server and pull latest image
          ssh deploy@${{ secrets.PROD_HOST }} \
            "docker pull ghcr.io/${{ github.repository }}:main && \
             docker compose -f /app/docker-compose.prod.yml up -d --no-deps api"
```

The `deploy` job only runs if `ci` succeeds and only on the `main` branch. The `environment: production` flag enables GitHub's environment protection rules — you can require manual approval before deployment, restrict which branches can deploy, and see deployment history in the GitHub UI.

---

## Tagging Strategy

A consistent tagging strategy makes rollbacks and debugging tractable:

| Tag | When | Purpose |
|---|---|---|
| `sha-abc1234` | Every build | Immutable pointer to exact commit |
| `main` | Every main merge | "Latest on main" pointer |
| `v1.2.3` | Semantic version tag | Release pointer |
| `latest` | Avoid in production | Mutable, can cause drift |

Never deploy `latest` to production. Deploy by SHA or semver tag so you always know exactly which code is running and can roll back to a specific version by tag.

---

## What's Next

Your pipeline now builds, tests, scans, and deploys Docker images automatically. But a single host running `docker compose` has limits — no automatic failover, no horizontal scaling, no zero-downtime deployments. Chapter 6 covers container orchestration: how Docker Swarm and Kubernetes manage containers at scale.
