# Staging Environment Configuration
# Non-sensitive infrastructure settings only.
# Network CIDRs are passed via GitHub Secrets (TF_AUTHORIZED_NETWORKS, TF_MASTER_AUTHORIZED_NETWORKS).

environment = "staging"

# GKE
gke_node_count   = 3
gke_machine_type = "e2-medium"
gke_disk_size_gb = 30

# Database
db_tier                = "db-f1-micro"
db_disk_size           = 10
db_backup_enabled      = false
db_deletion_protection = false
