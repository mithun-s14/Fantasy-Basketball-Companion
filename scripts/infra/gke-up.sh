#!/usr/bin/env bash
# ████████████████████████████████████████████████████████████████████████████
# WARNING: This script creates GCP resources that COST MONEY.
# Run  ./scripts/gke-down.sh  the moment you are done to stop billing.
# Estimated cost: ~$0.50–1.00/hour while the cluster is running.
# ████████████████████████████████████████████████████████████████████████████
#
# gke-up.sh — Build images, push to Artifact Registry, create GKE Autopilot
#             cluster, deploy the full stack, and print the external URL.
# Run from the repo root: ./scripts/gke-up.sh
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step()  { echo -e "\n${GREEN}==>${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
fatal() { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ── Configuration ─────────────────────────────────────────────────────────────
# Load .env so GCP_PROJECT_ID and app secrets are available
if [ ! -f ".env" ]; then fatal ".env not found — cp .env.example .env and fill in values"; fi
set -a; source .env; set +a

PROJECT_ID="${GCP_PROJECT_ID:?'GCP_PROJECT_ID is not set in .env'}"
REGION="${GCP_REGION:-us-central1}"
CLUSTER_NAME="fantasy-basketball"
REGISTRY_REPO="fantasy-basketball"
NAMESPACE="fantasy-basketball"

# Use the git short hash as the image tag.
# This ensures every build gets a unique, traceable tag — never overwrite :latest.
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"

REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REGISTRY_REPO}"
WEB_IMAGE="${REGISTRY}/web:${IMAGE_TAG}"
AI_IMAGE="${REGISTRY}/ai-service:${IMAGE_TAG}"

echo ""
echo "Project:  ${PROJECT_ID}"
echo "Region:   ${REGION}"
echo "Cluster:  ${CLUSTER_NAME}"
echo "Tag:      ${IMAGE_TAG}"
echo "Registry: ${REGISTRY}"

# ── 1. Prerequisite checks ────────────────────────────────────────────────────
step "Checking prerequisites"

for cmd in gcloud kubectl docker; do
  command -v "$cmd" &>/dev/null || fatal "'$cmd' not found. Install it first."
done

if ! docker info &>/dev/null; then fatal "Docker daemon is not running."; fi

# Verify gcloud is authenticated
gcloud auth print-access-token &>/dev/null || \
  fatal "Not authenticated with gcloud. Run: gcloud auth login"

echo "Prerequisites OK"

# ── 2. Set GCP project and enable APIs ───────────────────────────────────────
step "Setting GCP project and enabling APIs"

gcloud config set project "$PROJECT_ID"

# These APIs must be enabled before you can create clusters or push images.
# Enabling them is idempotent — safe to re-run.
gcloud services enable \
  container.googleapis.com \
  artifactregistry.googleapis.com \
  --quiet

echo "APIs enabled"

# ── 3. Create Artifact Registry repository ───────────────────────────────────
step "Creating Artifact Registry repository"

# Artifact Registry is GCP's private image registry — like Docker Hub but
# private and within your GCP project. GKE nodes authenticate automatically
# to registries in the same project (no extra credentials needed).
if ! gcloud artifacts repositories describe "$REGISTRY_REPO" \
     --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  gcloud artifacts repositories create "$REGISTRY_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Fantasy Basketball container images" \
    --project="$PROJECT_ID"
  echo "Repository created"
else
  warn "Repository already exists — skipping"
fi

# Configure docker to authenticate with Artifact Registry using your gcloud credentials.
# This adds an entry to ~/.docker/config.json — no password to manage.
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ── 4. Create GKE Autopilot cluster ──────────────────────────────────────────
step "Creating GKE Autopilot cluster (this takes 4–6 minutes)"

# Autopilot: Google manages node pools, VM sizing, and OS patching.
# You pay per pod resource request, not per node.
# --release-channel=regular: stable, tested Kubernetes versions.
if ! gcloud container clusters describe "$CLUSTER_NAME" \
     --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  gcloud container clusters create-auto "$CLUSTER_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --release-channel=regular
  echo "Cluster created"
else
  warn "Cluster already exists — skipping creation"
fi

# Update local kubeconfig so kubectl talks to this GKE cluster
# (replaces the kind cluster context from Phase 4)
gcloud container clusters get-credentials "$CLUSTER_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID"

echo "kubectl context set to GKE cluster"

# ── 5. Build and push images ──────────────────────────────────────────────────
step "Building images for linux/amd64"

# CRITICAL: Mac Apple Silicon chips are arm64; GKE nodes are x86-64 (amd64).
# Without --platform linux/amd64 the image is built for arm64 and crashes on
# GKE nodes with "exec format error".
# --push: build and push to the registry in one step (no local image stored)

echo "  → web"
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  -t "$WEB_IMAGE" \
  --push \
  .

echo "  → ai-service"
docker buildx build \
  --platform linux/amd64 \
  -t "$AI_IMAGE" \
  --push \
  ./ai-service

echo "Images pushed to ${REGISTRY}"

# ── 6. Install nginx-ingress via Helm ─────────────────────────────────────────
step "Installing nginx-ingress on GKE"

# nginx-ingress on GKE creates a Google Cloud Load Balancer automatically.
# The external IP of that LB is where your app will be reachable.
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>/dev/null || true
helm repo update

helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer \
  --wait --timeout=5m

echo "nginx-ingress installed"

# ── 7. Apply Kubernetes manifests ─────────────────────────────────────────────
step "Applying manifests"

kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml

# Generate Secret from .env values — same pattern as local-up.sh
kubectl create secret generic fantasy-basketball-secrets \
  --namespace="$NAMESPACE" \
  --from-literal=NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
  --from-literal=NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}" \
  --from-literal=GEMINI_API_KEY="${GEMINI_API_KEY}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f k8s/redis/

# Apply deployments with the registry image names substituted in.
# The base manifests use 'fantasy-basketball/web:latest' as a placeholder;
# sed replaces that with the real registry path before applying.
sed "s|fantasy-basketball/web:latest|${WEB_IMAGE}|g; s|IfNotPresent|Always|g" \
  k8s/web/deployment.yaml | kubectl apply -f -

sed "s|fantasy-basketball/ai-service:latest|${AI_IMAGE}|g; s|IfNotPresent|Always|g" \
  k8s/ai-service/deployment.yaml | kubectl apply -f -

kubectl apply -f k8s/ai-service/service.yaml
kubectl apply -f k8s/ai-service/hpa.yaml
kubectl apply -f k8s/web/service.yaml
kubectl apply -f k8s/ingress.yaml

# ── 8. Wait for pods ──────────────────────────────────────────────────────────
step "Waiting for pods to become ready"

# GKE Autopilot provisions new nodes on demand — first-time pod scheduling
# can take 2–3 minutes while the node is provisioned.
echo "  → redis..."
kubectl wait --namespace="$NAMESPACE" \
  --for=condition=ready pod --selector=app=redis --timeout=300s

echo "  → ai-service..."
kubectl wait --namespace="$NAMESPACE" \
  --for=condition=ready pod --selector=app=ai-service --timeout=300s

echo "  → web..."
kubectl wait --namespace="$NAMESPACE" \
  --for=condition=ready pod --selector=app=web --timeout=300s

# ── 9. Get external IP ────────────────────────────────────────────────────────
step "Waiting for Load Balancer external IP (up to 3 minutes)"

# GCP provisions a Cloud Load Balancer for the nginx-ingress service.
# This takes 1–2 minutes — the IP starts as <pending>.
EXTERNAL_IP=""
for i in $(seq 1 18); do
  EXTERNAL_IP=$(kubectl get svc ingress-nginx-controller \
    -n ingress-nginx \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  [ -n "$EXTERNAL_IP" ] && break
  echo "  Waiting for IP... (${i}/18)"
  sleep 10
done

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Deployed to GKE!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ -n "$EXTERNAL_IP" ]; then
  echo ""
  echo "  External IP:  ${EXTERNAL_IP}"
  echo ""
  echo "  To use a custom domain, point an A record at that IP."
  echo "  To test immediately with the IP directly:"
  echo ""
  echo "  curl http://${EXTERNAL_IP}/api/healthz"
  echo ""
  echo "  Or add to /etc/hosts:"
  echo "  ${EXTERNAL_IP}   fantasy-basketball.local"
  echo "  Then visit: http://fantasy-basketball.local"
else
  warn "External IP not yet assigned. Check with:"
  echo "  kubectl get svc -n ingress-nginx ingress-nginx-controller"
fi

echo ""
echo -e "${RED}  !! REMEMBER TO RUN ./scripts/gke-down.sh WHEN DONE !!${NC}"
echo -e "${RED}  !! The cluster costs ~\$0.50–1.00/hour while running. !!${NC}"
echo ""
echo "Verify pods:  kubectl get pods -n ${NAMESPACE}"
echo "View logs:    kubectl logs -n ${NAMESPACE} -l app=web -f"
