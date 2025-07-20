# Storage Resources

# GCS Bucket for pattern storage
resource "google_storage_bucket" "patterns" {
  name          = "${var.project_id}-parallax-patterns"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }
}

# GCS Bucket for backups
resource "google_storage_bucket" "backups" {
  name          = "${var.project_id}-parallax-backups"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }
}

# Service account for GCS access
resource "google_service_account" "gcs_access" {
  account_id   = "${var.cluster_name}-gcs"
  display_name = "GCS Access Service Account"
}

# Grant permissions to patterns bucket
resource "google_storage_bucket_iam_member" "patterns_admin" {
  bucket = google_storage_bucket.patterns.name
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.gcs_access.email}"
}

# Grant permissions to backups bucket
resource "google_storage_bucket_iam_member" "backups_admin" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.gcs_access.email}"
}

# Allow GKE workloads to use the GCS service account
resource "google_service_account_iam_member" "gcs_workload_identity" {
  service_account_id = google_service_account.gcs_access.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[parallax/parallax-control-plane]"
}

# Memorystore (Redis) for caching
resource "google_redis_instance" "cache" {
  name               = "${var.cluster_name}-redis"
  tier               = "BASIC"  # No HA for free tier
  memory_size_gb     = 1        # Minimum size
  region             = var.region
  authorized_network = google_compute_network.vpc.id

  redis_version = "REDIS_7_0"
  display_name  = "Parallax Cache"

  # Basic tier doesn't support these, but leaving for upgrade path
  # maintenance_policy {
  #   weekly_maintenance_window {
  #     day = "SUNDAY"
  #     start_time {
  #       hours   = 3
  #       minutes = 0
  #     }
  #   }
  # }

  labels = {
    environment = var.environment
    component   = "cache"
  }
}