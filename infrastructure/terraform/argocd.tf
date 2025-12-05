# ArgoCD Installation
resource "helm_release" "argocd" {
  count = var.enable_argocd ? 1 : 0

  name       = "argocd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  version    = "5.46.0"
  namespace  = "argocd"

  create_namespace = true

  values = [
    templatefile("${path.module}/templates/argocd-values.yaml", {
      environment = var.environment
      domain      = var.domain_name
    })
  ]

  depends_on = [module.eks]
}

# ArgoCD Applications
resource "helm_release" "fathuss" {
  name       = "fathuss"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argocd-apps"
  version    = "1.4.1"
  namespace  = "argocd"

  values = [
    templatefile("${path.module}/templates/fathuss-app.yaml", {
      environment = var.environment
      repo_url    = var.repo_url
      repo_branch = var.environment == "prod" ? "main" : "develop"
    })
  ]

  depends_on = [helm_release.argocd]
}

# Argo Rollouts for Canary Deployments
resource "helm_release" "argo_rollouts" {
  name       = "argo-rollouts"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-rollouts"
  version    = "2.32.0"
  namespace  = "argo-rollouts"

  create_namespace = true

  depends_on = [module.eks]
}

# Canary deployment for grader service
resource "kubernetes_manifest" "grader_canary" {
  manifest = {
    apiVersion = "argoproj.io/v1alpha1"
    kind       = "Rollout"

    metadata = {
      name      = "grader-orchestration-canary"
      namespace = "fathuss-${var.environment}"
    }

    spec = {
      replicas = 3
      strategy = {
        canary = {
          stableService = "grader-orchestration-stable"
          canaryService  = "grader-orchestration-canary"
          trafficRouting = {
            istio = {
              virtualService = {
                name   = "grader-orchestration"
                routes = ["primary"]
              }
            }
          }
          steps = [
            {
              setWeight = 5
            },
            {
              pause = {}
            },
            {
              setWeight = 20
            },
            {
              pause = {
                duration = "10m"
              }
            },
            {
              setWeight = 40
            },
            {
              pause = {
                duration = "10m"
              }
            },
            {
              setWeight = 60
            },
            {
              pause = {
                duration = "10m"
              }
            },
            {
              setWeight = 80
            },
            {
              pause = {
                duration = "10m"
              }
            }
          ]
        }
      }

      selector = {
        matchLabels = {
          app = "grader-orchestration"
        }
      }

      template = {
        metadata = {
          labels = {
            app = "grader-orchestration"
          }
        }

        spec = {
          containers = [
            {
              name  = "grader-orchestration"
              image = "ghcr.io/${var.github_org}/fathuss/grader-orchestration:latest"

              ports = [
                {
                  containerPort = 3000
                  name          = "http"
                }
              ]

              env = [
                {
                  name  = "NODE_ENV"
                  value = "production"
                }
              ]

              resources = {
                requests = {
                  cpu    = "100m"
                  memory = "256Mi"
                }
                limits = {
                  cpu    = "500m"
                  memory = "1Gi"
                }
              }

              livenessProbe = {
                httpGet = {
                  path = "/health"
                  port = "http"
                }
                initialDelaySeconds = 30
                periodSeconds       = 10
              }

              readinessProbe = {
                httpGet = {
                  path = "/ready"
                  port = "http"
                }
                initialDelaySeconds = 5
                periodSeconds       = 5
              }
            }
          ]

          affinity = {
            nodeAffinity = {
              requiredDuringSchedulingIgnoredDuringExecution = {
                nodeSelectorTerms = [
                  {
                    matchExpressions = [
                      {
                        key      = "dedicated"
                        operator = "In"
                        values   = ["grader"]
                      }
                    ]
                  }
                ]
              }
            }
          }
        }
      }
    }
  }

  depends_on = [helm_release.argo_rollouts]
}

# ArgoCD Application for canary rollout
resource "kubernetes_manifest" "grader_canary_app" {
  manifest = {
    apiVersion = "argoproj.io/v1alpha1"
    kind       = "Application"

    metadata = {
      name      = "grader-canary-${var.environment}"
      namespace = "argocd"
    }

    spec = {
      project = "default"

      source = {
        repoURL        = var.repo_url
        path           = "k8s/helm"
        targetRevision = var.environment == "prod" ? "main" : "develop"

        helm = {
          valueFiles = ["values-${var.environment}.yaml"]
        }
      }

      destination = {
        server    = "https://kubernetes.default.svc"
        namespace = "fathuss-${var.environment}"
      }

      syncPolicy = {
        automated = {
          prune    = true
          selfHeal = true
        }
      }
    }
  }

  depends_on = [helm_release.argocd]
}