# HashiCorp Vault Configuration for Fathuss
# This file contains Vault policies and configurations for secure secret management

# Vault Policy for Fathuss Application
path "database/creds/fathuss-role" {
  capabilities = ["read"]
}

path "kv/fathuss/*" {
  capabilities = ["read"]
}

path "transit/encrypt/fathuss-key" {
  capabilities = ["update"]
}

path "transit/decrypt/fathuss-key" {
  capabilities = ["update"]
}

path "auth/token/create" {
  capabilities = ["update"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Policy for Worker Nodes (minimal access)
path "database/creds/fathuss-worker" {
  capabilities = ["read"]
}

path "kv/fathuss/worker/*" {
  capabilities = ["read"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Policy for API Gateway
path "kv/fathuss/jwt" {
  capabilities = ["read"]
}

path "kv/fathuss/api-keys" {
  capabilities = ["read"]
}

# Policy for Storage Service
path "kv/fathuss/encryption" {
  capabilities = ["read"]
}

path "kv/fathuss/anti-cheat" {
  capabilities = ["read"]
}

# Policy for Monitoring (read-only)
path "kv/fathuss/monitoring/*" {
  capabilities = ["read"]
}