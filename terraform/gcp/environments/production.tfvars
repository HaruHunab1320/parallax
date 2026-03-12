# Production Environment Configuration
# Non-sensitive infrastructure settings only.
# Network CIDRs are passed via GitHub Secrets (TF_AUTHORIZED_NETWORKS, TF_MASTER_AUTHORIZED_NETWORKS).

environment = "production"

# GKE
gke_node_count   = 3
gke_machine_type = "e2-medium"
gke_disk_size_gb = 50

# Database
db_tier                = "db-custom-2-4096"
db_disk_size           = 50
db_backup_enabled      = true
db_deletion_protection = true
