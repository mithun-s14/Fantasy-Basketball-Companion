#!/usr/bin/env bash
# local-up.sh — Build images, create a kind cluster, and deploy the full stack locally.
# Run from the repo root: ./scripts/local-up.sh
set -euo pipefail

CLUSTER_NAME="fantasy-basketball"
NAMESPACE="fantasy-basketball"

# ── Colours for readable output ───────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
step()  { echo -e "\n${GREEN}==>${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }

# ── 1. Prerequisite checks ────────────────────────────────────────────────────
step "Checking prerequisites"

for cmd in kind kubectl docker; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' not found. Install it and re-run."
    echo "  kind:    https://kind.sigs.k8s.io/docs/user/quick-start/#installation"
    echo "  kubectl: https://kubernetes.io/docs/tasks/tools/"
    echo "  docker:  https://docs.docker.com/desktop/"
    exit 1
  fi
done

if ! docker info &>/dev/null; then
  echo "Error: Docker daemon is not running. Start Docker Desktop and retry."
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "Error: .env file not found."
  echo "  cp .env.example .env  — then fill in your real values."
  exit 1
fi

# Load env vars from .env so we can pass them as build args and secret values.
# 'set -a' exports every variable that gets assigned; 'set +a' stops that.
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "Prerequisites OK"

# ── 2. Create kind cluster ────────────────────────────────────────────────────
step "Creating kind cluster '${CLUSTER_NAME}'"

if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  warn "Cluster '${CLUSTER_NAME}' already exists — skipping creation"
else
  # kind-config.yaml sets up port mappings (80→80) and the ingress-ready label
  kind create cluster --config k8s/kind-config.yaml
  echo "Cluster created"
fi

# Point kubectl at the new cluster
kubectl cluster-info --context "kind-${CLUSTER_NAME}" >/dev/null

# ── 3. Install nginx-ingress controller ───────────────────────────────────────
step "Installing nginx-ingress controller"

# This is the kind-specific build of nginx-ingress — it includes the
# NodePort + hostNetwork config that kind needs to forward traffic from
# the host port we mapped in kind-config.yaml into the cluster.
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# kubectl wait fails immediately if no pods exist yet — the scheduler needs
# a few seconds to create the pod after the manifest is applied.
# Poll until at least one pod appears, then wait for it to be ready.
echo "Waiting for ingress-nginx controller pod to be scheduled..."
until kubectl get pods -n ingress-nginx -l app.kubernetes.io/component=controller \
      --no-headers 2>/dev/null | grep -q "."; do
  sleep 3
done

echo "Pod found — waiting for it to become ready (up to 120s)..."
kubectl wait \
  --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

echo "nginx-ingress ready"

# ── 4. Install metrics-server ─────────────────────────────────────────────────
# The HorizontalPodAutoscaler reads CPU metrics from the metrics-server.
# kind does not ship with it. The --kubelet-insecure-tls flag is required
# because kind's node certificates are self-signed.
step "Installing metrics-server"

kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Patch the deployment to allow insecure TLS (kind-specific requirement)
kubectl patch deployment metrics-server \
  -n kube-system \
  --type='json' \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

echo "metrics-server installed (may take a minute to start collecting data)"

# ── 5. Build Docker images ────────────────────────────────────────────────────
# NEXT_PUBLIC_* variables must be passed as build args — they get baked into
# the browser bundle by `next build` inside the Dockerfile builder stage.
step "Building web image"
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  -t fantasy-basketball/web:latest \
  .

step "Building ai-service image"
docker build \
  -t fantasy-basketball/ai-service:latest \
  ./ai-service

# ── 6. Load images into kind ──────────────────────────────────────────────────
# kind nodes are Docker containers with their own image store.
# 'kind load docker-image' copies images from your Docker daemon into the cluster.
# Without this step, pods would fail with ErrImagePull or ImagePullBackOff.
step "Loading images into kind cluster"
kind load docker-image fantasy-basketball/web:latest         --name "${CLUSTER_NAME}"
kind load docker-image fantasy-basketball/ai-service:latest  --name "${CLUSTER_NAME}"
echo "Images loaded"

# ── 7. Apply namespace and config ─────────────────────────────────────────────
step "Applying namespace and ConfigMap"
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml

# ── 8. Create Secret from .env (no real values written to any file) ───────────
# --dry-run=client -o yaml generates the Secret YAML without hitting the cluster,
# then we pipe it straight to kubectl apply. Idempotent: safe to re-run.
step "Creating Secret from .env values"
kubectl create secret generic fantasy-basketball-secrets \
  --namespace="${NAMESPACE}" \
  --from-literal=NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
  --from-literal=NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}" \
  --from-literal=GEMINI_API_KEY="${GEMINI_API_KEY}" \
  --dry-run=client -o yaml | kubectl apply -f -
echo "Secret created"

# ── 9. Apply all manifests ────────────────────────────────────────────────────
# Apply in dependency order: redis first (ai-service connects to it),
# then ai-service (web proxies to it), then web, then the Ingress.
# postgres/ is intentionally skipped — the app uses Supabase.
step "Applying manifests"
kubectl apply -f k8s/redis/
kubectl apply -f k8s/ai-service/
kubectl apply -f k8s/web/
kubectl apply -f k8s/ingress.yaml

# ── 10. Wait for pods to be ready ─────────────────────────────────────────────
# 'kubectl wait' blocks until the pod's readiness probe passes or timeout hits.
step "Waiting for pods to become ready"

echo "  → redis..."
kubectl wait --namespace="${NAMESPACE}" \
  --for=condition=ready pod --selector=app=redis \
  --timeout=60s

echo "  → ai-service..."
kubectl wait --namespace="${NAMESPACE}" \
  --for=condition=ready pod --selector=app=ai-service \
  --timeout=120s

echo "  → web (Next.js startup can take ~30s)..."
kubectl wait --namespace="${NAMESPACE}" \
  --for=condition=ready pod --selector=app=web \
  --timeout=180s

# ── 11. /etc/hosts reminder + verification commands ───────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Stack is up!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "1. Add this line to /etc/hosts (requires sudo):"
echo "     127.0.0.1   fantasy-basketball.local"
echo "   Run:  sudo sh -c 'echo \"127.0.0.1 fantasy-basketball.local\" >> /etc/hosts'"
echo ""
echo "2. Visit:  http://fantasy-basketball.local"
echo ""
echo "3. Or skip the hosts entry and use port-forward instead:"
echo "     kubectl port-forward -n ${NAMESPACE} svc/web 3000:3000"
echo "   Then visit:  http://localhost:3000"
echo ""
echo "4. Check pod status:"
echo "     kubectl get pods -n ${NAMESPACE}"
echo ""
echo "5. Tail logs for any service:"
echo "     kubectl logs -n ${NAMESPACE} -l app=web -f"
echo "     kubectl logs -n ${NAMESPACE} -l app=ai-service -f"
echo ""
echo "Tear down with:  ./scripts/local-down.sh"
