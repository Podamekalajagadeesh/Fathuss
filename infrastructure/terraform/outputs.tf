output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_ca_certificate" {
  description = "EKS cluster CA certificate"
  value       = module.eks.cluster_certificate_authority_data
}

output "oidc_provider_arn" {
  description = "EKS OIDC provider ARN"
  value       = module.eks.oidc_provider_arn
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnets" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnets
}

output "database_endpoint" {
  description = "PostgreSQL database endpoint"
  value       = aws_db_instance.postgresql.endpoint
  sensitive   = true
}

output "database_password" {
  description = "PostgreSQL database password"
  value       = random_password.postgresql.result
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "clickhouse_endpoint" {
  description = "ClickHouse instance public IP"
  value       = aws_instance.clickhouse.public_ip
}

output "argocd_admin_password" {
  description = "ArgoCD admin password"
  value       = var.enable_argocd ? "admin" : null
  sensitive   = true
}

output "kubeconfig" {
  description = "Kubeconfig for cluster access"
  value       = templatefile("${path.module}/templates/kubeconfig.tpl", {
    cluster_name       = module.eks.cluster_name
    cluster_endpoint   = module.eks.cluster_endpoint
    cluster_ca_cert    = module.eks.cluster_certificate_authority_data
    aws_region         = var.aws_region
  })
  sensitive = true
}