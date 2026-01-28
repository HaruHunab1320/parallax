# Parallax GCP Infrastructure - Main Configuration

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  # Backend for state storage
  # NOTE: Create bucket first: gsutil mb -l us-central1 gs://YOUR-BUCKET-NAME
  # Then initialize: terraform init -backend-config="bucket=YOUR-BUCKET-NAME"
  backend "gcs" {
    # bucket is configured via -backend-config during terraform init
    prefix = "terraform/state"
  }
}

# Provider Configuration
provider "google" {
  project = var.project_id
  region  = var.region
}

# Data source for GKE cluster credentials
data "google_client_config" "default" {}

provider "kubernetes" {
  host                   = google_container_cluster.primary.endpoint
  token                  = data.google_client_config.default.access_token
  cluster_ca_certificate = base64decode(google_container_cluster.primary.master_auth[0].cluster_ca_certificate)
}

provider "helm" {
  kubernetes {
    host                   = google_container_cluster.primary.endpoint
    token                  = data.google_client_config.default.access_token
    cluster_ca_certificate = base64decode(google_container_cluster.primary.master_auth[0].cluster_ca_certificate)
  }
}