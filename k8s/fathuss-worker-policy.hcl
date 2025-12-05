# Vault Policy for Fathuss Worker Nodes
# Minimal access policy for worker nodes with ephemeral tokens

path "database/creds/fathuss-worker-role" {
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

# Read-only access to necessary configuration
path "kv/fathuss/database" {
  capabilities = ["read"]
}

path "kv/fathuss/redis" {
  capabilities = ["read"]
}

path "kv/fathuss/clickhouse" {
  capabilities = ["read"]
}

# Transit encryption for data processing
path "transit/encrypt/fathuss-key" {
  capabilities = ["update"]
}

path "transit/decrypt/fathuss-key" {
  capabilities = ["update"]
}