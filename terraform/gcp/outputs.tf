# Terraform Outputs

output "cluster_endpoint" {
  description = "GKE cluster endpoint"
  value       = google_container_cluster.primary.endpoint
  sensitive   = true
}

output "cluster_name" {
  description = "GKE cluster name"
  value       = google_container_cluster.primary.name
}

output "load_balancer_ip" {
  description = "Load balancer IP address"
  value       = google_compute_global_address.parallax_ip.address
}

output "database_connection_name" {
  description = "Cloud SQL connection name"
  value       = google_sql_database_instance.postgres.connection_name
}

output "redis_host" {
  description = "Redis instance host"
  value       = google_redis_instance.cache.host
}

output "patterns_bucket" {
  description = "GCS bucket for patterns"
  value       = google_storage_bucket.patterns.url
}

output "grafana_url" {
  description = "Grafana dashboard URL"
  value       = var.domain_name != "" ? "https://grafana.${var.domain_name}" : "http://${google_compute_global_address.parallax_ip.address}"
}

output "api_url" {
  description = "API endpoint URL"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "http://${google_compute_global_address.parallax_ip.address}"
}

output "connection_command" {
  description = "Command to configure kubectl"
  value       = "gcloud container clusters get-credentials ${google_container_cluster.primary.name} --zone ${var.zone} --project ${var.project_id}"
}

output "next_steps" {
  description = "Next steps after deployment"
  value = <<-EOT
    1. Configure kubectl:
       gcloud container clusters get-credentials ${google_container_cluster.primary.name} --zone ${var.zone} --project ${var.project_id}

    2. Check deployment status:
       kubectl get pods -n parallax

    3. Access the API:
       curl http://${google_compute_global_address.parallax_ip.address}/health

    4. Access Grafana:
       URL: ${var.domain_name != "" ? "https://grafana.${var.domain_name}" : "http://${google_compute_global_address.parallax_ip.address}"}
       Username: admin
       Password: (set via grafana_admin_password variable)

    5. Push Docker image:
       docker build -t gcr.io/${var.project_id}/parallax-control-plane:latest packages/control-plane
       docker push gcr.io/${var.project_id}/parallax-control-plane:latest

    6. Update deployment:
       kubectl rollout restart deployment/parallax-control-plane -n parallax
  EOT
}