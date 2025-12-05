# Monitoring Stack
resource "helm_release" "kube_prometheus_stack" {
  count = var.enable_monitoring ? 1 : 0

  name       = "kube-prometheus-stack"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  version    = "48.3.0"
  namespace  = "monitoring"

  create_namespace = true

  values = [
    templatefile("${path.module}/templates/kube-prometheus-stack-values.yaml", {
      environment = var.environment
      domain      = var.domain_name
    })
  ]

  depends_on = [module.eks]
}

# Loki Stack for Log Aggregation
resource "helm_release" "loki_stack" {
  count = var.enable_monitoring ? 1 : 0

  name       = "loki-stack"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "loki-stack"
  version    = "2.9.10"
  namespace  = "monitoring"

  values = [
    templatefile("${path.module}/templates/loki-stack-values.yaml", {
      environment = var.environment
    })
  ]

  depends_on = [module.eks]
}

# Sentry for Error Tracking
resource "helm_release" "sentry" {
  count = var.enable_monitoring ? 1 : 0

  name       = "sentry"
  repository = "https://sentry-kubernetes.github.io/charts"
  chart      = "sentry"
  version    = "20.8.0"
  namespace  = "monitoring"

  values = [
    templatefile("${path.module}/templates/sentry-values.yaml", {
      environment = var.environment
      domain      = var.domain_name
      postgresql_host = aws_db_instance.postgresql.address
      redis_host      = aws_elasticache_cluster.redis.cache_nodes[0].address
    })
  ]

  depends_on = [module.eks, aws_db_instance.postgresql, aws_elasticache_cluster.redis]
}

# Istio Service Mesh (for traffic management and canary deployments)
resource "helm_release" "istio_base" {
  name       = "istio-base"
  repository = "https://istio-release.storage.googleapis.com/charts"
  chart      = "base"
  version    = "1.19.3"
  namespace  = "istio-system"

  create_namespace = true

  depends_on = [module.eks]
}

resource "helm_release" "istiod" {
  name       = "istiod"
  repository = "https://istio-release.storage.googleapis.com/charts"
  chart      = "istiod"
  version    = "1.19.3"
  namespace  = "istio-system"

  depends_on = [helm_release.istio_base]
}

resource "helm_release" "istio_ingress" {
  name       = "istio-ingress"
  repository = "https://istio-release.storage.googleapis.com/charts"
  chart      = "gateway"
  version    = "1.19.3"
  namespace  = "istio-system"

  depends_on = [helm_release.istiod]
}

# External DNS
resource "helm_release" "external_dns" {
  name       = "external-dns"
  repository = "https://kubernetes-sigs.github.io/external-dns"
  chart      = "external-dns"
  version    = "1.13.1"
  namespace  = "kube-system"

  values = [
    templatefile("${path.module}/templates/external-dns-values.yaml", {
      environment = var.environment
      domain      = var.domain_name
    })
  ]

  depends_on = [module.eks]
}

# Cluster Autoscaler
resource "helm_release" "cluster_autoscaler" {
  name       = "cluster-autoscaler"
  repository = "https://kubernetes.github.io/autoscaler"
  chart      = "cluster-autoscaler"
  version    = "9.29.0"
  namespace  = "kube-system"

  values = [
    templatefile("${path.module}/templates/cluster-autoscaler-values.yaml", {
      environment   = var.environment
      cluster_name  = local.cluster_name
      aws_region    = var.aws_region
    })
  ]

  depends_on = [module.eks]
}