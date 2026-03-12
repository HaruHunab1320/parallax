# Resources removed from Terraform management.
# These are now managed by the Helm chart (k8s/helm/parallax/).
# The `removed` blocks tell Terraform to drop them from state WITHOUT destroying them.
# These blocks can be deleted after a successful `terraform apply`.

# --- kubernetes.tf workloads (now in Helm) ---

removed {
  from = kubernetes_deployment.parallax_control_plane
  lifecycle {
    destroy = false
  }
}

removed {
  from = kubernetes_service.parallax_control_plane
  lifecycle {
    destroy = false
  }
}

removed {
  from = kubernetes_horizontal_pod_autoscaler_v2.parallax_control_plane
  lifecycle {
    destroy = false
  }
}

# --- ingress.tf workloads (now in Helm) ---

removed {
  from = kubernetes_deployment.parallax_web_dashboard
  lifecycle {
    destroy = false
  }
}

removed {
  from = kubernetes_service.parallax_web_dashboard
  lifecycle {
    destroy = false
  }
}

removed {
  from = kubernetes_service.parallax_control_plane_with_backend
  lifecycle {
    destroy = false
  }
}

removed {
  from = kubernetes_manifest.backend_config
  lifecycle {
    destroy = false
  }
}

removed {
  from = kubernetes_ingress_v1.parallax_ingress
  lifecycle {
    destroy = false
  }
}

# --- monitoring.tf workloads (now in Helm) ---

removed {
  from = helm_release.etcd
  lifecycle {
    destroy = false
  }
}

removed {
  from = kubernetes_config_map.grafana_dashboards
  lifecycle {
    destroy = false
  }
}
