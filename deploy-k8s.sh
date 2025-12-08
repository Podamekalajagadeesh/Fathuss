#!/bin/bash

# Fathuss Kubernetes Deployment Script
# This script deploys the complete Fathuss platform to Kubernetes

set -e

NAMESPACE="${NAMESPACE:-fathuss}"
RELEASE_NAME="${RELEASE_NAME:-fathuss}"
CHART_PATH="./k8s/helm"

echo "🚀 Deploying Fathuss to Kubernetes..."
echo "Namespace: $NAMESPACE"
echo "Release: $RELEASE_NAME"

# Create namespace if it doesn't exist
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Add Helm repositories
echo "📦 Adding Helm repositories..."
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Install or upgrade Fathuss
echo "⚙️ Installing/upgrading Fathuss with security features..."
if helm status "$RELEASE_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
    echo "Upgrading existing release..."
    helm upgrade "$RELEASE_NAME" "$CHART_PATH" -n "$NAMESPACE" \
        --set podSecurityStandards.enabled=true \
        --set networkPolicy.enabled=true \
        --set securityProfiles.enabled=true \
        --set namespaces.create=true \
        "$@"
else
    echo "Installing new release with security features..."
    helm install "$RELEASE_NAME" "$CHART_PATH" -n "$NAMESPACE" \
        --set podSecurityStandards.enabled=true \
        --set networkPolicy.enabled=true \
        --set securityProfiles.enabled=true \
        --set namespaces.create=true \
        "$@"
fi

# Wait for deployments to be ready
echo "⏳ Waiting for deployments to be ready..."
kubectl wait --for=condition=available --timeout=600s deployment --all -n "$NAMESPACE"

# Wait for database initialization job
echo "⏳ Waiting for database initialization..."
kubectl wait --for=condition=complete --timeout=300s job/"$RELEASE_NAME-db-init" -n "$NAMESPACE" || true

echo "✅ Deployment completed!"
echo ""
echo "📋 Service Status:"
kubectl get pods,svc,ingress -n "$NAMESPACE"
echo ""
echo "🔗 Access URLs:"
echo "  API Gateway: https://api.fathuss.com"
echo "  Frontend:    https://app.fathuss.com"
echo "  IPFS Gateway: http://$(kubectl get svc -n $NAMESPACE -l app.kubernetes.io/component=ipfs -o jsonpath='{.items[0].spec.clusterIP}'):8080"
echo ""
echo "📊 Monitoring:"
echo "  Check status: kubectl get all -n $NAMESPACE"
echo "  View logs:   kubectl logs -f deployment/$RELEASE_NAME-api-gateway -n $NAMESPACE"
echo "  Port forward: kubectl port-forward svc/$RELEASE_NAME-api-gateway 4000:4000 -n $NAMESPACE"