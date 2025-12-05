# Secrets Management for Fathuss Platform

This document describes the comprehensive secrets management implementation for the Fathuss platform using Kubernetes secrets, HashiCorp Vault, and Azure Key Vault.

## Overview

The Fathuss platform implements a multi-layered secrets management strategy:

1. **Kubernetes Secrets**: Basic secret storage with encryption at rest
2. **HashiCorp Vault**: Dynamic secret generation and centralized management
3. **Azure Key Vault**: Cloud-native secret management (alternative to Vault)
4. **Ephemeral Tokens**: Short-lived credentials for worker nodes
5. **Automatic Rotation**: Scheduled secret rotation for enhanced security

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Applications  │────│  Vault Agent    │────│  HashiCorp      │
│                 │    │  Sidecar        │    │  Vault / AKV    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Kubernetes     │
                    │  RBAC & PSP     │
                    └─────────────────┘
```

## Components

### 1. Kubernetes Secrets (`secret.yaml`)

Enhanced Kubernetes secrets with:
- Base64 encoded sensitive data
- TLS certificates
- Docker registry credentials
- Automatic rotation annotations

### 2. HashiCorp Vault Integration

#### Policies (`vault-policy.hcl`, `fathuss-worker-policy.hcl`)
- Granular access control for different components
- Minimal privilege principle
- Separate policies for applications vs. workers

#### Agent Injection
- Automatic secret injection into pods
- Template-based secret rendering
- Sidecar container pattern

#### Dynamic Secrets
- Database credentials with automatic rotation
- Short-lived tokens for worker nodes
- Encryption/decryption services

### 3. Azure Key Vault Integration

Alternative to HashiCorp Vault with:
- Native cloud integration
- Managed identity authentication
- Hardware Security Module (HSM) support

### 4. RBAC and Security (`rbac-secrets.yaml`)

- Service accounts with minimal permissions
- Pod Security Policies for secret access
- Network policies for secret traffic

### 5. Secret Rotation (`secret-rotation.yaml`)

- CronJob for automated secret rotation
- Ephemeral token generation for workers
- Configurable rotation intervals

## Setup Instructions

### Option 1: HashiCorp Vault

1. **Install Vault**:
   ```bash
   helm repo add hashicorp https://helm.releases.hashicorp.com
   helm install vault hashicorp/vault --set "server.dev.enabled=true"
   ```

2. **Initialize Vault**:
   ```bash
   chmod +x k8s/vault-init.sh
   ./k8s/vault-init.sh
   ```

3. **Deploy with Vault**:
   ```bash
   helm install fathuss ./k8s/helm \
     --set vault.enabled=true \
     --set vault.address="https://vault.fathuss.internal:8200"
   ```

### Option 2: Azure Key Vault

1. **Setup Azure Key Vault**:
   ```bash
   chmod +x k8s/setup-azure-keyvault.sh
   ./k8s/setup-azure-keyvault.sh
   ```

2. **Install CSI Driver**:
   ```bash
   helm repo add secrets-store-csi-driver https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts
   helm install csi-secrets-store secrets-store-csi-driver/secrets-store-csi-driver
   ```

3. **Deploy with AKV**:
   ```bash
   helm install fathuss ./k8s/helm \
     --set azureKeyVault.enabled=true \
     --set azureKeyVault.name="your-keyvault-name" \
     --set azureKeyVault.tenantId="your-tenant-id"
   ```

## Secret Types

### Application Secrets
- JWT signing secrets
- API keys (OpenAI, GitHub, Sentry)
- Encryption keys
- Database credentials

### Infrastructure Secrets
- TLS certificates
- Docker registry credentials
- Service account tokens
- SSH keys

### Worker Node Secrets
- Ephemeral database credentials
- Short-lived API tokens
- Temporary encryption keys

## Security Features

### 1. Ephemeral Tokens
- Worker nodes use short-lived tokens (1 hour TTL)
- Automatic renewal capability
- Minimal credential exposure

### 2. Secret Rotation
- JWT secrets: Daily rotation
- Encryption keys: Weekly rotation
- Database credentials: Daily rotation

### 3. Access Control
- Principle of least privilege
- Service account isolation
- Network policy restrictions

### 4. Encryption
- Secrets encrypted at rest in etcd
- TLS in transit
- Optional HSM integration

## Configuration

### Helm Values

```yaml
# Vault Configuration
vault:
  enabled: true
  address: "https://vault.fathuss.internal:8200"
  roleName: "fathuss"

# Azure Key Vault Configuration
azureKeyVault:
  enabled: false
  name: "fathuss-keyvault"
  tenantId: "your-tenant-id"

# Secret Management
secrets:
  ephemeralTokens:
    enabled: true
    ttl: "1h"
  rotation:
    enabled: true
    jwtSecretInterval: "24h"
```

## Monitoring and Auditing

### Vault Audit Logs
```bash
vault audit enable file file_path=/vault/logs/audit.log
```

### Kubernetes Events
```bash
kubectl get events --field-selector reason=SecretRotation
```

### Metrics
- Secret access patterns
- Rotation success/failure rates
- Token expiration monitoring

## Troubleshooting

### Common Issues

1. **Vault Connection Failed**
   ```bash
   # Check Vault status
   vault status

   # Verify Kubernetes auth
   vault read auth/kubernetes/role/fathuss
   ```

2. **Secret Injection Failed**
   ```bash
   # Check pod logs
   kubectl logs -c vault-agent <pod-name>

   # Verify service account
   kubectl get serviceaccount fathuss-vault-auth -o yaml
   ```

3. **Permission Denied**
   ```bash
   # Check RBAC
   kubectl auth can-i get secrets --as=system:serviceaccount:fathuss:fathuss-vault-auth
   ```

## Best Practices

1. **Never hardcode secrets** in application code
2. **Use different secrets per environment** (dev/staging/prod)
3. **Rotate secrets regularly** and after breaches
4. **Monitor secret access** patterns
5. **Use short-lived credentials** whenever possible
6. **Implement proper RBAC** for secret access
7. **Backup encryption keys** securely
8. **Audit secret usage** regularly

## Migration Guide

### From Plain Kubernetes Secrets

1. Deploy Vault or Azure Key Vault
2. Update Helm values to enable secret management
3. Migrate existing secrets to the new system
4. Update application code to use injected secrets
5. Test thoroughly before production deployment

### From Environment Variables

1. Move secrets to Vault/AKV
2. Configure agent injection
3. Remove secrets from environment variables
4. Update deployment configurations

## Security Considerations

- **Network Security**: Use network policies to restrict secret access
- **Access Logging**: Enable comprehensive audit logging
- **Backup Strategy**: Secure backup of encryption keys
- **Disaster Recovery**: Plan for secret recovery scenarios
- **Compliance**: Ensure compliance with relevant regulations (GDPR, HIPAA, etc.)

## Support

For issues with secrets management:
1. Check the troubleshooting section above
2. Review Vault/AKV documentation
3. Contact the platform security team
4. Create an issue in the Fathuss repository