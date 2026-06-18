---
title: "Orchestration — From Docker Swarm to Kubernetes"
order: 9
tags: ["docker", "kubernetes", "orchestration", "devops"]
date: "2026-05-06"
draft: false
lang: "en"
---

## When Compose Is Not Enough

Docker Compose is excellent for local development and single-host deployments. But production requirements eventually push past what it can do:

- **High availability** — if the host goes down, your app goes down.
- **Horizontal scaling** — Compose can't distribute containers across multiple machines.
- **Zero-downtime deployments** — rolling updates require more than `docker compose up -d`.
- **Self-healing** — when a container crashes, something needs to restart it and route traffic away from it during recovery.
- **Service discovery at scale** — with dozens of services running multiple replicas, DNS-based discovery alone isn't sufficient.

Container orchestration solves these problems. Two options dominate: **Docker Swarm** (simpler, built into Docker) and **Kubernetes** (more complex, industry standard at scale).

---

## Docker Swarm

### What Swarm Is

Docker Swarm is Docker's native clustering and orchestration mode. A Swarm is a group of Docker hosts — one or more **manager nodes** that control the cluster, and zero or more **worker nodes** that run containers.

Swarm reuses the Compose file format, making it the lowest-friction path from a single-host Compose setup to a multi-host cluster.

### Initializing a Swarm

On the first manager node:

```bash
docker swarm init --advertise-addr <MANAGER_IP>
```

This outputs a join token. Run it on each worker:

```bash
docker swarm join --token SWMTKN-1-abc123... <MANAGER_IP>:2377
```

Check cluster status:

```bash
docker node ls
# ID          HOSTNAME    STATUS    AVAILABILITY  MANAGER STATUS
# abc123 *    manager-1   Ready     Active        Leader
# def456      worker-1    Ready     Active
# ghi789      worker-2    Ready     Active
```

### Deploying a Stack

In Swarm, you deploy **stacks** — a Compose file with Swarm-specific extensions:

```yaml
# docker-compose.swarm.yml
services:
  api:
    image: ghcr.io/myorg/my-api:v1.2.3
    ports:
      - "3000:3000"
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first   # start new before stopping old (zero-downtime)
      restart_policy:
        condition: on-failure
        max_attempts: 3
    networks:
      - backend

  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.labels.storage == true   # pin to node with SSD
    secrets:
      - db_password
    networks:
      - backend

secrets:
  db_password:
    external: true

volumes:
  pgdata:

networks:
  backend:
    driver: overlay
```

Deploy:

```bash
docker stack deploy -c docker-compose.swarm.yml myapp
```

Swarm distributes the 3 `api` replicas across available worker nodes. The `overlay` network driver allows containers on different hosts to communicate as if they're on the same network.

### Swarm Key Features

**Routing mesh** — Swarm automatically routes traffic to any running replica, regardless of which node it's on. Publishing port 3000 on the Swarm means you can hit port 3000 on any node and reach one of the 3 replicas.

**Rolling updates** — `update_config` controls how Swarm rolls out new images. `order: start-first` starts the new container before stopping the old one, ensuring zero downtime. `parallelism: 1` updates one replica at a time.

**Secrets** — Swarm encrypts secrets at rest and in transit, mounting them as files inside containers at `/run/secrets/<name>`. This is more secure than environment variables.

```bash
# create a secret
echo "supersecret" | docker secret create db_password -

# list secrets
docker secret ls

# remove a secret
docker secret rm db_password
```

### Swarm Limitations

Swarm is simple and production-capable for moderate scale. Its limitations become apparent at:
- Large clusters (100+ nodes) — management overhead grows
- Complex networking requirements
- Advanced scheduling (GPU, topology awareness)
- Rich ecosystem tooling (monitoring, service mesh, policy engines)

For those needs, Kubernetes is the answer.

---

## Kubernetes

### The Kubernetes Mental Model

Kubernetes (K8s) is a container orchestration platform originally from Google. It's more complex than Swarm but substantially more powerful and has a massive ecosystem.

The core mental model:

- **Cluster** — one or more machines (nodes) managed by a control plane.
- **Pod** — the smallest deployable unit. Usually one container, sometimes a tightly coupled pair (app + sidecar). Pods are ephemeral.
- **Deployment** — manages a desired number of identical Pod replicas. Handles rollouts and rollbacks.
- **Service** — a stable network endpoint (DNS name + IP) that routes to Pods. Pods come and go; Services are stable.
- **Ingress** — routes external HTTP traffic to Services based on hostnames and paths.

```
Internet
    │
    ▼
Ingress (nginx-ingress, Traefik...)
    │
    ├──▶ Service: api-svc       → Pod: api (x3 replicas)
    └──▶ Service: web-svc       → Pod: web (x2 replicas)
                                       │
                                       ▼
                              Service: postgres-svc → Pod: postgres
```

### Core Objects

**Deployment:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: ghcr.io/myorg/my-api:v1.2.3
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
```

Key callouts:
- `maxUnavailable: 0, maxSurge: 1` — zero-downtime rolling update. Always adds a new Pod before removing an old one.
- `resources.requests` — what Kubernetes uses for scheduling decisions. `resources.limits` — hard cap.
- `readinessProbe` — Kubernetes won't route traffic to a Pod until this passes. If an existing Pod fails it, traffic is removed.
- `livenessProbe` — if this fails, Kubernetes restarts the Pod.

**Service:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-svc
spec:
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP    # internal only; use LoadBalancer for external
```

**Ingress:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-svc
                port:
                  number: 80
```

**ConfigMaps and Secrets:**

```yaml
# ConfigMap for non-sensitive config
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-config
data:
  NODE_ENV: production
  LOG_LEVEL: info

---
# Secret for sensitive values (base64-encoded)
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
stringData:             # stringData auto-encodes; use data for pre-encoded values
  url: postgresql://user:pass@postgres:5432/myapp
```

### Deploying and Managing

```bash
kubectl apply -f deployment.yaml     # create or update resources
kubectl get pods                     # list pods
kubectl get pods -w                  # watch pods in real time
kubectl describe pod api-abc123      # detailed status, events
kubectl logs api-abc123 -f           # follow logs
kubectl exec -it api-abc123 -- sh    # shell into a pod

kubectl rollout status deployment/api        # watch rollout progress
kubectl rollout history deployment/api       # see revision history
kubectl rollout undo deployment/api          # rollback to previous version
kubectl rollout undo deployment/api --to-revision=3  # rollback to specific revision

kubectl scale deployment api --replicas=5   # manual scaling
kubectl autoscale deployment api --min=2 --max=10 --cpu-percent=70  # HPA
```

### Horizontal Pod Autoscaler

Kubernetes can scale replicas automatically based on CPU, memory, or custom metrics:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

When average CPU across all `api` Pods exceeds 70%, Kubernetes adds replicas up to `maxReplicas`. When it drops, replicas are removed down to `minReplicas`.

---

## Swarm vs. Kubernetes — When to Use Which

| | Docker Swarm | Kubernetes |
|---|---|---|
| **Setup complexity** | Low — built into Docker | High — many components |
| **Learning curve** | Gentle | Steep |
| **Compose compatibility** | Native | Requires conversion (Kompose) |
| **Ecosystem** | Limited | Very large |
| **Scaling** | Good for moderate scale | Excellent at any scale |
| **Managed options** | Docker EE | EKS, GKE, AKS, etc. |
| **Production use** | Reasonable for smaller ops | Industry standard |

**Use Swarm when:** You have a small team, already use Compose, and want the simplest path to multi-host deployment. Swarm covers 80% of production needs with 20% of the operational complexity.

**Use Kubernetes when:** You need advanced scheduling, a rich ecosystem (Istio, ArgoCD, Prometheus, Cert-Manager), large-scale horizontal scaling, or you're joining the broader cloud-native ecosystem. Use a managed service (EKS, GKE, AKS) — self-managing a K8s control plane is non-trivial.

---

## Local Kubernetes for Development

You don't need a cloud cluster to learn Kubernetes:

```bash
# Docker Desktop — enable Kubernetes in settings
kubectl config use-context docker-desktop

# minikube
minikube start
minikube dashboard

# k3d (k3s in Docker — lightweight)
k3d cluster create dev
```

These run a single-node K8s cluster locally. All `kubectl` commands work identically against them.

---

## The Full Picture

You've now covered the complete Docker journey:

1. **Basics** — images, containers, Dockerfiles, the build workflow.
2. **Networking & Volumes** — how containers communicate and persist data.
3. **Compose** — declarative multi-container stacks for development and simple production.
4. **Security** — hardening containers to reduce attack surface in production.
5. **CI/CD** — automating build, test, scan, and deploy on every push.
6. **Orchestration** — scaling and managing containers across multiple hosts with Swarm and Kubernetes.

The container ecosystem continues to evolve — service meshes (Istio, Linkerd), GitOps (ArgoCD, Flux), eBPF-based observability — but everything builds on the fundamentals covered in this series. The mental model holds.
