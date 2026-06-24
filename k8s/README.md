# Fantasy Basketball — Kubernetes Deployment

This document covers the multi-service Kubernetes architecture, how to run the
stack locally with `kind`, how to deploy to Google Kubernetes Engine, and how to
view live metrics in Grafana.

---

## Architecture

```
                        ┌─────────────────────────────────────────┐
                        │         Kubernetes Cluster               │
                        │         (kind locally / GKE Autopilot)  │
                        │                                          │
  Browser               │  ┌──────────────┐   ┌────────────────┐  │
    │                   │  │     web      │   │  ai-service    │  │
    │ HTTP :80           │  │  Next.js 15  │──▶│  Express +     │  │
    ▼                   │  │  port 3000   │   │  LangChain     │  │
┌──────────┐  :3000     │  │              │   │  port 3001     │  │
│ Ingress  │───────────▶│  │ /api/healthz │   │ /healthz       │  │
│ (nginx)  │            │  │ /api/readyz  │   │ /readyz        │  │
└──────────┘            │  │ /api/metrics │   │ /metrics       │  │
                        │  └──────┬───────┘   └───────┬────────┘  │
                        │         │                   │           │
                        │         │ proxy /api/chat   │           │
                        │         └──────────────────▶│           │
                        │                             │           │
                        │                    ┌────────▼───────┐   │
                        │                    │     redis      │   │
                        │                    │  rate limiting │   │
                        │                    │  port 6379     │   │
                        │                    └────────────────┘   │
                        └─────────────────────────────────────────┘
                                  │                  │
                                  ▼                  ▼
                           ┌──────────┐      ┌──────────────┐
                           │ Supabase │      │ Google Gemini│
                           │ Postgres │      │   API (AI)   │
                           │  + Auth  │      │              │
                           │(external)│      │  (external)  │
                           └──────────┘      └──────────────┘
```

### Services

| Service | Image | Port | Role |
|---|---|---|---|
| `web` | `fantasy-basketball/web` | 3000 | Next.js app — all pages, `/api/games`, `/api/players`, auth |
| `ai-service` | `fantasy-basketball/ai-service` | 3001 | Express — LangChain + Gemini chat, rate limiting |
| `redis` | `redis:7-alpine` | 6379 | In-cluster Redis for rate-limit sliding window |

### External dependencies (managed SaaS — not in-cluster)

| Service | What it provides |
|---|---|
| **Supabase** | Hosted PostgreSQL + Auth (JWT, cookies, RLS). Equivalent to Cloud SQL + a managed auth provider in a fully self-hosted setup. |
| **Google Gemini API** | LLM inference. Always external — called from `ai-service` on each chat request. |

### What's in `k8s/`

```
k8s/
├── namespace.yaml            Namespace: fantasy-basketball
├── configmap.yaml            Non-secret config: REDIS_URL, AI_SERVICE_URL, NODE_ENV
├── secret.yaml               Template only — real values generated at deploy time
├── ingress.yaml              nginx-ingress routing: all traffic → web:3000
├── redis/
│   ├── deployment.yaml       1 replica, liveness/readiness via redis-cli ping
│   └── service.yaml          ClusterIP on 6379, DNS name "redis"
├── ai-service/
│   ├── deployment.yaml       Probes on /healthz + /readyz, resource requests for HPA
│   ├── service.yaml          ClusterIP on 3001, DNS name "ai-service"
│   └── hpa.yaml              Scale 1→5 replicas when CPU > 70%
├── web/
│   ├── deployment.yaml       Probes on /api/healthz + /api/readyz
│   └── service.yaml          ClusterIP on 3000, DNS name "web"
├── postgres/                 PATTERN ONLY — app uses Supabase. Included to
│   ├── statefulset.yaml      demonstrate StatefulSet + PVC pattern for resume.
│   └── service.yaml
├── monitoring/
│   ├── prometheus-values.yaml   Helm values for kube-prometheus-stack
│   ├── service-monitor.yaml     Prometheus ServiceMonitors for web + ai-service
│   └── grafana-dashboard-configmap.yaml  Auto-provisioned dashboard
└── kind-config.yaml          Local kind cluster config with port mappings
```

---

## Running locally with kind

### Prerequisites

```bash
brew install kind kubectl helm
# Docker Desktop must be running
```

### Start the stack

```bash
# Copy and fill in your credentials
cp .env.example .env

# Build images, create cluster, deploy everything
./scripts/local-up.sh
```

The script (~3 minutes on first run):
1. Creates a `kind` cluster with nginx-ingress port mappings
2. Installs nginx-ingress and metrics-server
3. Builds Docker images for `web` and `ai-service`
4. Loads images into kind's internal image store
5. Applies all manifests and waits for pods to be ready

### Verify

```bash
kubectl get pods -n fantasy-basketball
# NAME                         READY   STATUS
# ai-service-xxx               1/1     Running
# redis-xxx                    1/1     Running
# web-xxx                      1/1     Running
```

### Access the app

```bash
# Port-forward (simplest)
kubectl port-forward -n fantasy-basketball svc/web 3000:3000
# Visit http://localhost:3000

# Or via Ingress (add to /etc/hosts first)
sudo sh -c 'echo "127.0.0.1 fantasy-basketball.local" >> /etc/hosts'
# Visit http://fantasy-basketball.local
```

### Tear down

```bash
./scripts/local-down.sh
```

---

## Installing observability (Prometheus + Grafana)

Run these after `local-up.sh`:

```bash
# Add the Helm chart repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install into the monitoring namespace (~2 minutes)
kubectl create namespace monitoring
helm install kube-prom-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values k8s/monitoring/prometheus-values.yaml \
  --wait

# Apply ServiceMonitors and dashboard
kubectl apply -f k8s/monitoring/service-monitor.yaml
kubectl apply -f k8s/monitoring/grafana-dashboard-configmap.yaml
```

### View Grafana

```bash
kubectl port-forward -n monitoring svc/kube-prom-stack-grafana 3001:80
```

Open `http://localhost:3001` — username `admin`, password `admin`.

Navigate to **Dashboards → Browse → Fantasy Basketball — AI Service** to see:
- Chat request rate by status (success / error / rate-limited)
- AI call latency P50 and P95 (milliseconds)
- Rate limit hit rate
- ai-service CPU usage

### View Prometheus directly

```bash
kubectl port-forward -n monitoring \
  svc/kube-prom-stack-kube-promethe-prometheus 9090:9090
```

Open `http://localhost:9090` and try querying `chat_requests_total`.

---

## Deploying to GKE

### Prerequisites

```bash
brew install --cask google-cloud-sdk
gcloud auth login
gcloud auth application-default login
```

You need a GCP project with billing enabled. Add to `.env`:

```
GCP_PROJECT_ID=your-project-id
GCP_REGION=us-central1
```

### Deploy

```bash
./scripts/gke-up.sh
```

The script (~8 minutes on first run):
1. Enables GCP APIs (`container`, `artifactregistry`)
2. Creates an Artifact Registry repository
3. Creates a GKE Autopilot cluster
4. Builds images for `linux/amd64` (required — GKE nodes are x86-64)
5. Pushes images to Artifact Registry
6. Installs nginx-ingress (creates a Cloud Load Balancer)
7. Applies all manifests with real registry image paths
8. Waits for pods and prints the external IP

### Access the app

Use the external IP printed by the script:

```bash
curl http://EXTERNAL_IP/api/healthz
# {"status":"ok"}
```

To use a domain name, point an A record at the external IP and update
`spec.rules[0].host` in `k8s/ingress.yaml`.

### !! Tear down when done !!

```bash
./scripts/gke-down.sh
```

This deletes the cluster and Artifact Registry repo. GCP billing stops within
a few minutes. The Cloud Load Balancer is also deleted as part of cluster teardown.

**Estimated cost: ~$0.50–1.00/hour while the cluster is running.**

---

## Autoscaling demo

The `ai-service` HPA scales between 1 and 5 replicas based on CPU:

```bash
# Watch the HPA in real time
kubectl get hpa -n fantasy-basketball -w

# In another terminal, send traffic to trigger scaling
# (requires the app to be running and port-forwarded)
for i in $(seq 1 50); do
  curl -s -X POST http://localhost:3000/api/chat \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"Who should I start this week?"}]}' \
    -o /dev/null &
done
```

---

## Summary bullets

> Containerized a Next.js / Node.js / Supabase application into a three-service
> Kubernetes architecture (Next.js frontend, Express AI microservice, Redis),
> deployed on GKE Autopilot with a Cloud Load Balancer, nginx-ingress, and a
> HorizontalPodAutoscaler on the AI service scaling 1–5 replicas based on CPU.

> Instrumented services with Prometheus metrics (`prom-client`) and structured
> JSON logging (`pino`), provisioned `kube-prometheus-stack` via Helm, and built
> a Grafana dashboard tracking chat request rate, P95 AI call latency, and
> rate-limit hit rate across the cluster.
