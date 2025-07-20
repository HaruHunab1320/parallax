# Kubernetes Resources

# Namespace
resource "kubernetes_namespace" "parallax" {
  metadata {
    name = "parallax"
    labels = {
      environment = var.environment
    }
  }
}

# ConfigMap for application configuration
resource "kubernetes_config_map" "parallax_config" {
  metadata {
    name      = "parallax-config"
    namespace = kubernetes_namespace.parallax.metadata[0].name
  }

  data = {
    NODE_ENV         = var.environment
    LOG_LEVEL        = "info"
    PORT             = "8080"
    ENABLE_METRICS   = "true"
    ENABLE_TRACING   = "true"
    REDIS_HOST       = google_redis_instance.cache.host
    REDIS_PORT       = google_redis_instance.cache.port
    DATABASE_NAME    = google_sql_database.parallax.name
    DATABASE_USER    = google_sql_user.parallax.name
    PATTERNS_BUCKET  = google_storage_bucket.patterns.name
  }
}

# Secret for sensitive data
resource "kubernetes_secret" "parallax_secrets" {
  metadata {
    name      = "parallax-secrets"
    namespace = kubernetes_namespace.parallax.metadata[0].name
  }

  data = {
    DATABASE_PASSWORD = random_password.db_password.result
    JWT_SECRET        = random_password.jwt_secret.result
    DATABASE_URL      = "postgresql://${google_sql_user.parallax.name}:${random_password.db_password.result}@127.0.0.1:5432/${google_sql_database.parallax.name}?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}"
  }
}

# JWT Secret
resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

# Service Account for workload identity
resource "kubernetes_service_account" "parallax" {
  metadata {
    name      = "parallax-control-plane"
    namespace = kubernetes_namespace.parallax.metadata[0].name
    annotations = {
      "iam.gke.io/gcp-service-account" = google_service_account.sql_proxy.email
    }
  }
}

# Cloud SQL Proxy Deployment (sidecar pattern in main deployment)
resource "kubernetes_deployment" "parallax_control_plane" {
  metadata {
    name      = "parallax-control-plane"
    namespace = kubernetes_namespace.parallax.metadata[0].name
    labels = {
      app       = "parallax-control-plane"
      component = "control-plane"
    }
  }

  spec {
    replicas = 2  # HA deployment

    selector {
      match_labels = {
        app = "parallax-control-plane"
      }
    }

    template {
      metadata {
        labels = {
          app       = "parallax-control-plane"
          component = "control-plane"
        }
      }

      spec {
        service_account_name = kubernetes_service_account.parallax.metadata[0].name

        # Cloud SQL Proxy sidecar
        container {
          name  = "cloud-sql-proxy"
          image = "gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.8.0"

          args = [
            "--structured-logs",
            "--port=5432",
            google_sql_database_instance.postgres.connection_name
          ]

          security_context {
            run_as_non_root = true
          }

          resources {
            requests = {
              memory = "256Mi"
              cpu    = "100m"
            }
            limits = {
              memory = "512Mi"
              cpu    = "200m"
            }
          }
        }

        # Main application container
        container {
          name  = "parallax"
          image = var.parallax_image

          port {
            container_port = 8080
            name           = "http"
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.parallax_config.metadata[0].name
            }
          }

          env_from {
            secret_ref {
              name = kubernetes_secret.parallax_secrets.metadata[0].name
            }
          }

          # Additional environment variables
          env {
            name  = "ETCD_ENDPOINTS"
            value = "etcd:2379"
          }

          # Health checks
          liveness_probe {
            http_get {
              path = "/health/live"
              port = 8080
            }
            initial_delay_seconds = 30
            period_seconds        = 10
          }

          readiness_probe {
            http_get {
              path = "/health/ready"
              port = 8080
            }
            initial_delay_seconds = 10
            period_seconds        = 5
          }

          resources {
            requests = {
              memory = "512Mi"
              cpu    = "250m"
            }
            limits = {
              memory = "1Gi"
              cpu    = "500m"
            }
          }
        }
      }
    }
  }
}

# Service
resource "kubernetes_service" "parallax_control_plane" {
  metadata {
    name      = "parallax-control-plane"
    namespace = kubernetes_namespace.parallax.metadata[0].name
    labels = {
      app       = "parallax-control-plane"
      component = "control-plane"
    }
  }

  spec {
    selector = {
      app = "parallax-control-plane"
    }

    port {
      port        = 80
      target_port = 8080
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}

# HorizontalPodAutoscaler
resource "kubernetes_horizontal_pod_autoscaler_v2" "parallax_control_plane" {
  metadata {
    name      = "parallax-control-plane"
    namespace = kubernetes_namespace.parallax.metadata[0].name
  }

  spec {
    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = kubernetes_deployment.parallax_control_plane.metadata[0].name
    }

    min_replicas = 2
    max_replicas = 5

    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = 70
        }
      }
    }

    metric {
      type = "Resource"
      resource {
        name = "memory"
        target {
          type                = "Utilization"
          average_utilization = 80
        }
      }
    }
  }
}