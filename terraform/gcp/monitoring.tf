# Monitoring Resources

# Deploy etcd using Helm
resource "helm_release" "etcd" {
  name       = "etcd"
  repository = "https://charts.bitnami.com/bitnami"
  chart      = "etcd"
  namespace  = kubernetes_namespace.parallax.metadata[0].name
  version    = "9.7.0"

  values = [
    yamlencode({
      auth = {
        rbac = {
          create = false
        }
      }
      persistence = {
        enabled = true
        size    = "8Gi"
      }
      metrics = {
        enabled = true
        serviceMonitor = {
          enabled = true
        }
      }
    })
  ]
}

# Deploy Prometheus using Helm
resource "helm_release" "prometheus" {
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  namespace  = kubernetes_namespace.parallax.metadata[0].name
  version    = "55.5.0"

  values = [
    yamlencode({
      prometheus = {
        prometheusSpec = {
          storageSpec = {
            volumeClaimTemplate = {
              spec = {
                resources = {
                  requests = {
                    storage = "10Gi"
                  }
                }
              }
            }
          }
          resources = {
            requests = {
              memory = "400Mi"
              cpu    = "100m"
            }
            limits = {
              memory = "800Mi"
              cpu    = "200m"
            }
          }
        }
      }
      grafana = {
        enabled = true
        adminPassword = "changeme"  # Change in production!
        persistence = {
          enabled = true
          size    = "5Gi"
        }
        dashboardProviders = {
          dashboardproviders.yaml = {
            apiVersion = 1
            providers = [{
              name      = "parallax"
              orgId     = 1
              folder    = "Parallax"
              type      = "file"
              disableDeletion = false
              editable  = true
              options = {
                path = "/var/lib/grafana/dashboards/parallax"
              }
            }]
          }
        }
        dashboardsConfigMaps = {
          parallax = "parallax-dashboards"
        }
      }
      alertmanager = {
        enabled = false  # Disable to save resources
      }
    })
  ]
}

# ConfigMap for Grafana dashboards
resource "kubernetes_config_map" "grafana_dashboards" {
  metadata {
    name      = "parallax-dashboards"
    namespace = kubernetes_namespace.parallax.metadata[0].name
  }

  data = {
    "system-overview.json" = file("${path.module}/../../packages/monitoring/grafana/dashboards/system-overview.json")
    "pattern-execution.json" = file("${path.module}/../../packages/monitoring/grafana/dashboards/pattern-execution.json")
    "agent-performance.json" = file("${path.module}/../../packages/monitoring/grafana/dashboards/agent-performance.json")
    "confidence-analytics.json" = file("${path.module}/../../packages/monitoring/grafana/dashboards/confidence-analytics.json")
  }
}

# Service Monitor for Parallax metrics
resource "kubernetes_manifest" "parallax_service_monitor" {
  manifest = {
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "ServiceMonitor"
    metadata = {
      name      = "parallax-control-plane"
      namespace = kubernetes_namespace.parallax.metadata[0].name
      labels = {
        app = "parallax-control-plane"
      }
    }
    spec = {
      selector = {
        matchLabels = {
          app = "parallax-control-plane"
        }
      }
      endpoints = [{
        port = "http"
        path = "/metrics"
        interval = "30s"
      }]
    }
  }

  depends_on = [helm_release.prometheus]
}