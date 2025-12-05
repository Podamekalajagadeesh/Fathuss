variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "fathuss"
}

variable "cluster_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.28"
}

variable "node_groups" {
  description = "EKS node groups configuration"
  type = map(object({
    instance_types = list(string)
    min_size       = number
    max_size       = number
    desired_size   = number
  }))
  default = {
    general = {
      instance_types = ["t3.medium"]
      min_size       = 1
      max_size       = 10
      desired_size   = 2
    }
    grader = {
      instance_types = ["t3.large"]
      min_size       = 1
      max_size       = 20
      desired_size   = 3
    }
  }
}

variable "database_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "clickhouse_instance_type" {
  description = "ClickHouse instance type"
  type        = string
  default     = "t3.medium"
}

variable "enable_monitoring" {
  description = "Enable monitoring stack"
  type        = bool
  default     = true
}

variable "enable_argocd" {
  description = "Enable ArgoCD"
  type        = bool
  default     = true
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "fathuss.com"
}

variable "enable_cloudfront_cache" {
  description = "Enable CloudFront distribution for cache access"
  type        = bool
  default     = false
}

variable "cache_retention_days" {
  description = "Number of days to retain cached artifacts"
  type        = number
  default     = 365
}

variable "spot_instance_max_price" {
  description = "Maximum price for spot instances (as percentage of on-demand)"
  type        = number
  default     = 80
}

variable "enable_cost_allocation_tags" {
  description = "Enable cost allocation tags for better cost tracking"
  type        = bool
  default     = true
}

variable "monthly_budget_limit" {
  description = "Monthly budget limit in USD"
  type        = number
  default     = 1000
}

variable "budget_alert_emails" {
  description = "Email addresses for budget alerts"
  type        = list(string)
  default     = []
}

variable "spot_price_threshold" {
  description = "Spot price threshold for scaling decisions"
  type        = number
  default     = 0.10
}