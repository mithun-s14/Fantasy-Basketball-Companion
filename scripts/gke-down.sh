#!/usr/bin/env bash
# ████████████████████████████████████████████████████████████████████████████
# RUN THIS WHEN YOU ARE DONE WITH THE DEMO.
#
# Deletes the GKE cluster and Artifact Registry repo.
# After this script completes, GCP billing for this project stops.
#
# What gets deleted:
#   - The GKE Autopilot cluster (all pods, services, volumes inside it)
#   - The Artifact Registry repository (all container images)
#   - The Cloud Load Balancer created by nginx-ingress
#
# What is NOT deleted:
#   - Your GCP project itself
#   - Supabase data (it lives in Supabase, not GCP)
#   - Local files in this repo
# ████████████████████████████████████████████████████████████████████████████
#
# Run from the repo root: ./scripts/gke-down.sh
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
step() { echo -e "\n${GREEN}==>${NC} $*"; }

if [ ! -f ".env" ]; then
  echo "No .env found — set GCP_PROJECT_ID and GCP_REGION manually or re-create .env"
  read -r -p "GCP_PROJECT_ID: " PROJECT_ID
  read -r -p "GCP_REGION [us-central1]: " REGION
  REGION="${REGION:-us-central1}"
else
  set -a; source .env; set +a
  PROJECT_ID="${GCP_PROJECT_ID:?'GCP_PROJECT_ID not set in .env'}"
  REGION="${GCP_REGION:-us-central1}"
fi

CLUSTER_NAME="fantasy-basketball"
REGISTRY_REPO="fantasy-basketball"

echo ""
echo -e "${RED}About to DELETE:${NC}"
echo "  GKE cluster:        ${CLUSTER_NAME} (region: ${REGION})"
echo "  Artifact Registry:  ${REGISTRY_REPO} (region: ${REGION})"
echo "  GCP project:        ${PROJECT_ID}"
echo ""
read -r -p "Type 'yes' to confirm: " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 0; }

gcloud config set project "$PROJECT_ID"

# ── Delete GKE cluster ────────────────────────────────────────────────────────
step "Deleting GKE cluster '${CLUSTER_NAME}'"

# --quiet skips the interactive confirmation (we already confirmed above).
# --async would return immediately but we want to see it complete.
if gcloud container clusters describe "$CLUSTER_NAME" \
   --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  gcloud container clusters delete "$CLUSTER_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --quiet
  echo "Cluster deleted"
else
  echo "Cluster not found — already deleted or never created"
fi

# ── Delete Artifact Registry repo ────────────────────────────────────────────
step "Deleting Artifact Registry repository '${REGISTRY_REPO}'"

if gcloud artifacts repositories describe "$REGISTRY_REPO" \
   --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  gcloud artifacts repositories delete "$REGISTRY_REPO" \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --quiet
  echo "Registry deleted"
else
  echo "Registry not found — already deleted or never created"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Teardown complete. GCP billing for this cluster has stopped.${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Verify at: https://console.cloud.google.com/kubernetes/list"
echo ""
echo "To restore your kubectl context to the local kind cluster:"
echo "  kubectl config use-context kind-fantasy-basketball"
