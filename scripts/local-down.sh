#!/usr/bin/env bash
# local-down.sh — Delete the local kind cluster and all resources inside it.
# Run from the repo root: ./scripts/local-down.sh
set -euo pipefail

CLUSTER_NAME="fantasy-basketball"

echo "Deleting kind cluster '${CLUSTER_NAME}'..."
echo "(This removes all pods, services, volumes, and the cluster itself.)"
echo ""

if ! kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "Cluster '${CLUSTER_NAME}' does not exist — nothing to do."
  exit 0
fi

kind delete cluster --name "${CLUSTER_NAME}"
echo ""
echo "Cluster deleted. Docker images are still in your local daemon."
echo "To remove them: docker rmi fantasy-basketball/web:latest fantasy-basketball/ai-service:latest"
