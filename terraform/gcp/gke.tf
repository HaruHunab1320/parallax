# Google Kubernetes Engine (GKE) Cluster

resource "google_container_cluster" "primary" {
  name     = var.cluster_name
  location = var.zone  # Use zone for free tier (not regional)

  # We manage the node pool separately
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.subnet.name

  # Workload Identity for secure pod access to GCP services
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Network configuration
  ip_allocation_policy {
    cluster_secondary_range_name  = "gke-pods"
    services_secondary_range_name = "gke-services"
  }

  # Security settings
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false  # Keep false for easier access
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  master_authorized_networks_config {
    dynamic "cidr_blocks" {
      for_each = var.master_authorized_networks
      content {
        cidr_block   = cidr_blocks.value.cidr_block
        display_name = cidr_blocks.value.display_name
      }
    }
  }

  # Cluster-level autoscaling
  cluster_autoscaling {
    enabled = true

    resource_limits {
      resource_type = "cpu"
      minimum       = 6
      maximum       = 24
    }

    resource_limits {
      resource_type = "memory"
      minimum       = 24
      maximum       = 96
    }
  }

  maintenance_policy {
    daily_maintenance_window {
      start_time = "03:00"
    }
  }

  # Monitoring and logging (free tier includes basic monitoring)
  monitoring_service = "monitoring.googleapis.com/kubernetes"
  logging_service    = "logging.googleapis.com/kubernetes"

  # Add-ons
  addons_config {
    horizontal_pod_autoscaling {
      disabled = false
    }
    network_policy_config {
      disabled = false
    }
    gce_persistent_disk_csi_driver_config {
      enabled = true
    }
  }

  # Labels
  resource_labels = {
    environment = var.environment
    project     = "parallax"
  }
}

# Node Pool
resource "google_container_node_pool" "primary_nodes" {
  name       = "${var.cluster_name}-node-pool"
  location   = var.zone
  cluster    = google_container_cluster.primary.name
  # Autoscaling replaces preempted Spot nodes automatically
  autoscaling {
    min_node_count = var.gke_node_count
    max_node_count = var.gke_node_count + 2
  }

  node_config {
    spot = false  # On-demand VMs for stability
    machine_type = var.gke_machine_type
    disk_size_gb = var.gke_disk_size_gb
    disk_type    = "pd-standard"

    # Google recommends custom service accounts with least privilege
    service_account = google_service_account.gke_nodes.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    # Workload Identity
    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    # Labels
    labels = {
      environment = var.environment
      node_pool   = "primary"
    }

    # Security
    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
  }
}

# Service Account for GKE nodes
resource "google_service_account" "gke_nodes" {
  account_id   = "${var.cluster_name}-gke-nodes"
  display_name = "GKE Nodes Service Account"
}

# Basic roles for GKE nodes
resource "google_project_iam_member" "gke_nodes_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_project_iam_member" "gke_nodes_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_project_iam_member" "gke_nodes_monitoring_viewer" {
  project = var.project_id
  role    = "roles/monitoring.viewer"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}