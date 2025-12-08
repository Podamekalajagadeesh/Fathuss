# Vault Agent Configuration for Kubernetes
# This configuration enables Vault Agent to inject secrets into pods

# Global Vault Agent Configuration
vault {
  address = "https://vault.fathuss.internal:8200"
  tls_skip_verify = false
  tls_ca_cert = "/vault/tls/ca.crt"
  retry {
    num_retries = 3
  }
}

# Auto-auth configuration for Kubernetes
auto_auth {
  method "kubernetes" {
    mount_path = "auth/kubernetes"
    config = {
      role = "fathuss"
      service_account_token_file = "/var/run/secrets/kubernetes.io/serviceaccount/token"
    }
  }

  sink "file" {
    config = {
      path = "/vault/secrets/token"
    }
  }
}

# Template configuration for secret injection
template {
  source = "/vault/config/secret-template.ctmpl"
  destination = "/vault/secrets/secrets.env"
  exec {
    command = ["/bin/sh", "-c", "source /vault/secrets/secrets.env && exec /app/main"]
  }
}

# Template for database credentials
template {
  source = "/vault/config/db-template.ctmpl"
  destination = "/vault/secrets/database.env"
}

# Template for API keys
template {
  source = "/vault/config/api-keys-template.ctmpl"
  destination = "/vault/secrets/api-keys.env"
}