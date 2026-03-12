# Monitoring Resources
# NOTE: etcd is managed by the Helm chart (k8s/helm/parallax/templates/etcd-statefulset.yaml).
# Grafana dashboards configmap is managed by the prometheus Helm release.

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
        adminPassword = var.grafana_admin_password
        persistence = {
          enabled = true
          size    = "5Gi"
        }
        dashboardProviders = {
          "dashboardproviders.yaml" = {
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
        enabled = false
      }
    })
  ]
}
