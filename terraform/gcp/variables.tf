# Variables for GCP Deployment

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP Zone"
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "Environment name (staging/production)"
  type        = string
  default     = "production"
}

variable "cluster_name" {
  description = "GKE cluster name"
  type        = string
  default     = "parallax-cluster"
}

# Free tier configurations
variable "gke_node_count" {
  description = "Number of GKE nodes"
  type        = number
  default     = 3  # Minimum for high availability
}

variable "gke_machine_type" {
  description = "GKE node machine type"
  type        = string
  default     = "e2-medium"  # 2 vCPU, 4GB RAM - good for free tier
}

variable "gke_disk_size_gb" {
  description = "GKE node disk size"
  type        = number
  default     = 30  # Minimum recommended
}

# Database Configuration
variable "db_tier" {
  description = "Cloud SQL tier"
  type        = string
  default     = "db-f1-micro"  # Free tier eligible
}

variable "db_disk_size" {
  description = "Database disk size in GB"
  type        = number
  default     = 10
}

variable "db_backup_enabled" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

# Application Configuration
variable "parallax_image" {
  description = "Parallax control plane Docker image"
  type        = string
  default     = "gcr.io/PROJECT_ID/parallax-control-plane:latest"
}

variable "domain_name" {
  description = "Domain name for the application (optional)"
  type        = string
  default     = ""
}

# Security
variable "authorized_networks" {
  description = "Authorized networks for Cloud SQL. REQUIRED - no default for security."
  type = list(object({
    name  = string
    value = string
  }))
  # No default - must be explicitly set to prevent accidental 0.0.0.0/0 exposure

  validation {
    condition = length(var.authorized_networks) > 0
    error_message = "At least one authorized network must be specified."
  }

  validation {
    condition = !contains([for n in var.authorized_networks : n.value], "0.0.0.0/0")
    error_message = "0.0.0.0/0 is not allowed for production. Use specific IP ranges."
  }
}

variable "master_authorized_networks" {
  description = "CIDR blocks authorized to access the GKE master endpoint"
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  # No default - must be explicitly set

  validation {
    condition = length(var.master_authorized_networks) > 0
    error_message = "At least one authorized network must be specified for GKE master access."
  }
}

variable "db_deletion_protection" {
  description = "Enable deletion protection on Cloud SQL instance"
  type        = bool
  default     = true
}

variable "grafana_admin_password" {
  description = "Grafana admin password"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.grafana_admin_password) >= 12
    error_message = "Grafana admin password must be at least 12 characters."
  }
}