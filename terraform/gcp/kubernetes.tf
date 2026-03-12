# Kubernetes Resources (GCP-specific config only — workloads are managed by Helm)

# Namespace
resource "kubernetes_namespace" "parallax" {
  metadata {
    name = "parallax"
    labels = {
      environment = var.environment
    }
  }
}

# ConfigMap for application configuration (contains GCP-derived values)
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

# Secret for sensitive data (contains GCP-derived values)
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
