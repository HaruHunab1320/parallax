# Ingress and Load Balancer Configuration
# NOTE: K8s ingress, services, and deployments are managed by Helm.
# Terraform only manages the GCP-side resources (static IP, SSL cert).

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
