# Ingress and Load Balancer Configuration

# Static IP Address
resource "google_compute_global_address" "parallax_ip" {
  name = "${var.cluster_name}-ip"
}

# Managed SSL Certificate (if domain provided)
resource "google_compute_managed_ssl_certificate" "parallax_cert" {
  count = var.domain_name != "" ? 1 : 0
  
  name = "${var.cluster_name}-cert"
  
  managed {
    domains = [var.domain_name]
  }
}

# Ingress
resource "kubernetes_ingress_v1" "parallax_ingress" {
  metadata {
    name      = "parallax-ingress"
    namespace = kubernetes_namespace.parallax.metadata[0].name
    annotations = {
      "kubernetes.io/ingress.global-static-ip-name" = google_compute_global_address.parallax_ip.name
      "networking.gke.io/managed-certificates"      = var.domain_name != "" ? google_compute_managed_ssl_certificate.parallax_cert[0].name : ""
      "kubernetes.io/ingress.class"                 = "gce"
      "kubernetes.io/ingress.allow-http"            = var.domain_name != "" ? "false" : "true"  # Force HTTPS if domain provided
    }
  }

  spec {
    rule {
      host = var.domain_name != "" ? var.domain_name : null
      
      http {
        path {
          path      = "/api/*"
          path_type = "ImplementationSpecific"
          
          backend {
            service {
              name = kubernetes_service.parallax_control_plane.metadata[0].name
              port {
                number = 80
              }
            }
          }
        }
        
        path {
          path      = "/health/*"
          path_type = "ImplementationSpecific"
          
          backend {
            service {
              name = kubernetes_service.parallax_control_plane.metadata[0].name
              port {
                number = 80
              }
            }
          }
        }
        
        path {
          path      = "/metrics"
          path_type = "Exact"
          
          backend {
            service {
              name = kubernetes_service.parallax_control_plane.metadata[0].name
              port {
                number = 80
              }
            }
          }
        }
      }
    }
    
    # Grafana ingress
    rule {
      host = var.domain_name != "" ? "grafana.${var.domain_name}" : null
      
      http {
        path {
          path      = "/*"
          path_type = "ImplementationSpecific"
          
          backend {
            service {
              name = "prometheus-grafana"
              port {
                number = 80
              }
            }
          }
        }
      }
    }
  }
}

# Backend Config for timeout settings
resource "kubernetes_manifest" "backend_config" {
  manifest = {
    apiVersion = "cloud.google.com/v1"
    kind       = "BackendConfig"
    metadata = {
      name      = "parallax-backend-config"
      namespace = kubernetes_namespace.parallax.metadata[0].name
    }
    spec = {
      timeoutSec = 300  # 5 minutes for long-running executions
      connectionDraining = {
        drainingTimeoutSec = 60
      }
      healthCheck = {
        checkIntervalSec   = 10
        timeoutSec         = 5
        healthyThreshold   = 2
        unhealthyThreshold = 3
        type               = "HTTP"
        requestPath        = "/health/live"
        port               = 8080
      }
    }
  }
}

# Update service to use backend config
resource "kubernetes_service" "parallax_control_plane_with_backend" {
  metadata {
    name      = "parallax-control-plane-lb"
    namespace = kubernetes_namespace.parallax.metadata[0].name
    annotations = {
      "cloud.google.com/backend-config" = "{\"default\": \"parallax-backend-config\"}"
      "cloud.google.com/neg" = "{\"ingress\": true}"
    }
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

    type = "NodePort"
  }
}