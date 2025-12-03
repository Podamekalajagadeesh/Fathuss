# Fathuss Kubernetes Orchestration

This directory contains the complete Kubernetes orchestration setup for the Fathuss platform using Helm charts.

## Architecture Overview

```
Kubernetes Cluster
├── Ingress Controller (nginx)
│   ├── api.fathuss.com → API Gateway
│   └── app.fathuss.com → Frontend
│
├── API Gateway (Service Mesh)
│   ├── Authentication & Routing
│   └── Rate Limiting
│
├── Microservices Layer
│   ├── User Service (4001)
│   ├── Challenge Service (4002)
│   ├── Leaderboard Service (4003)
│   ├── Marketplace Service (4004)
│   ├── Hiring Service (4005)
│   ├── Grader Orchestration (4006)
│   └── Storage Service (4007)
│
├── Data Layer
│   ├── PostgreSQL (5432) - Primary DB
│   ├── Redis (6379) - Cache & Sessions
│   ├── ClickHouse (8123) - Analytics
│   └── IPFS (5001) - File Storage
│
├── Worker Pool
│   ├── Grader Workers (Rust/Docker)
│   └── Compiler Workers (Foundry/Hardhat/Cargo/Move)
│
└── Observability
    ├── Prometheus (Metrics)
    ├── Grafana (Dashboards)
    ├── Loki (Logs)
    └── Sentry (Error Tracking)
```

## Prerequisites

- Kubernetes cluster (v1.19+)
- Helm 3.x
- kubectl configured
- Ingress controller (nginx recommended)
- Cert-manager (for TLS certificates)
- Storage class for persistent volumes

## Quick Start

### 1. Add Helm Repositories
```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```

### 2. Install Fathuss
```bash
# Create namespace
kubectl create namespace fathuss

# Install with default values
helm install fathuss ./k8s/helm -n fathuss

# Or with custom values
helm install fathuss ./k8s/helm -n fathuss -f values-production.yaml
```

### 3. Verify Installation
```bash
# Check all pods are running
kubectl get pods -n fathuss

# Check services
kubectl get svc -n fathuss

# Check ingress
kubectl get ingress -n fathuss
```

## Configuration

### Global Settings
```yaml
global:
  imageRegistry: ""          # Custom image registry
  imagePullSecrets: []       # Image pull secrets
  storageClass: "standard"   # Default storage class
  jwtSecret: "your-secret"   # JWT signing secret
  walletConnectProjectId: "" # WalletConnect project ID
```

### Service Configuration
Each service can be individually configured:

```yaml
apiGateway:
  enabled: true
  replicaCount: 3
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 100m
      memory: 128Mi
```

### Database Configuration
```yaml
postgresql:
  enabled: true
  auth:
    postgresPassword: "secure-password"
    username: "fathuss"
    password: "fathuss123"
    database: "fathuss"
  persistence:
    enabled: true
    size: 50Gi

redis:
  enabled: true
  auth:
    password: "redis-secure"
  persistence:
    enabled: true
    size: 10Gi
```

### Ingress Configuration
```yaml
ingress:
  enabled: true
  className: "nginx"
  hosts:
    - host: api.fathuss.com
      paths:
        - path: /
          pathType: Prefix
    - host: app.fathuss.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: fathuss-tls
      hosts:
        - api.fathuss.com
        - app.fathuss.com
```

## Component Details

### API Gateway
- **Purpose**: Central entry point for all API requests
- **Features**: Authentication, routing, rate limiting
- **Scaling**: Horizontal Pod Autoscaler based on CPU/memory

### Microservices
All microservices follow the same deployment pattern:
- Health checks (readiness/liveness probes)
- Resource limits and requests
- Service discovery via Kubernetes DNS
- Configurable replica counts

### Data Services
- **PostgreSQL**: Primary database with persistent storage
- **Redis**: In-memory cache with persistence
- **ClickHouse**: Analytics database with TTL policies
- **IPFS**: Decentralized file storage with persistent volumes

### Worker Pool
- **Grader Workers**: Containerized Rust workers for code execution
- **Compiler Workers**: Specialized containers for different blockchain tools
- **Scaling**: Dynamic worker creation based on load

## Security

### Network Policies
- Internal service communication only
- Database access restricted to authorized services
- Ingress traffic controlled

### Secrets Management
- Sensitive data stored in Kubernetes secrets
- Base64 encoded values
- Separate secrets for different environments

### TLS/SSL
- Automatic certificate provisioning via cert-manager
- Let's Encrypt integration
- HTTPS enforcement

## Monitoring & Observability

### Health Checks
- HTTP readiness/liveness probes for all services
- Database connectivity checks
- External dependency monitoring

### Metrics
- Prometheus metrics collection
- Custom application metrics
- Infrastructure monitoring

### Logging
- Centralized logging with Loki
- Structured JSON logging
- Log aggregation and analysis

## Scaling

### Horizontal Pod Autoscaler (HPA)
```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
```

### Vertical Scaling
- Resource requests/limits per service
- Node autoscaling for cluster-level scaling
- Database read replicas for analytics

## Backup & Recovery

### Database Backups
- PostgreSQL: Automated daily backups
- Redis: RDB snapshots
- ClickHouse: Table-level backups

### Disaster Recovery
- Multi-zone deployment
- Automated failover
- Point-in-time recovery

## Development Workflow

### Local Development
```bash
# Use Docker Compose for local development
docker-compose up -d

# For Kubernetes development
minikube start
helm install fathuss ./k8s/helm -n fathuss
```

### CI/CD Integration
```bash
# Build and push images
docker build -t fathuss/api-gateway:latest ./api-gateway
docker push fathuss/api-gateway:latest

# Update Helm chart
helm upgrade fathuss ./k8s/helm -n fathuss
```

## Troubleshooting

### Common Issues

1. **Pods not starting**
   ```bash
   kubectl describe pod <pod-name> -n fathuss
   kubectl logs <pod-name> -n fathuss
   ```

2. **Service connectivity**
   ```bash
   kubectl exec -it <pod-name> -n fathuss -- curl http://<service-name>:port/health
   ```

3. **Ingress not working**
   ```bash
   kubectl get ingress -n fathuss
   kubectl describe ingress <ingress-name> -n fathuss
   ```

### Debug Commands
```bash
# Check all resources
kubectl get all -n fathuss

# Check events
kubectl get events -n fathuss --sort-by=.metadata.creationTimestamp

# Port forward for debugging
kubectl port-forward svc/fathuss-api-gateway 4000:4000 -n fathuss

# Check persistent volumes
kubectl get pvc -n fathuss
```

## Production Considerations

### High Availability
- Multi-zone deployment
- Pod disruption budgets
- Anti-affinity rules

### Performance Tuning
- Resource optimization
- Database connection pooling
- CDN integration for static assets

### Security Hardening
- Network policies enforcement
- Security contexts
- Image vulnerability scanning
- RBAC implementation

## Contributing

1. Update Helm templates in `k8s/helm/templates/`
2. Test changes locally with `helm template`
3. Update documentation
4. Create pull request

## Support

For issues and questions:
- Check the troubleshooting section
- Review Kubernetes logs
- Open GitHub issues
- Join our Discord community