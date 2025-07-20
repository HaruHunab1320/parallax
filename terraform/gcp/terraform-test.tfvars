# Test Environment Configuration for Argos Project
# Optimized for testing with Google Cloud credits

project_id = "argos-434718"
region     = "us-central1"
zone       = "us-central1-a"

# Test environment
environment = "test"

# Smaller cluster for testing
cluster_name     = "parallax-test"
gke_node_count   = 1  # Start with just 1 node for testing
gke_machine_type = "e2-micro"  # Smallest instance (0.25-2 vCPU, 1GB RAM)
gke_disk_size_gb = 10  # Minimum disk size

# Smallest database for testing
db_tier          = "db-f1-micro"  # Free tier eligible
db_disk_size     = 10
db_backup_enabled = false  # Disable backups for testing to save costs

# Docker Image
parallax_image = "gcr.io/argos-434718/parallax-control-plane:latest"

# No domain for testing
domain_name = ""

# Open access for testing (restrict this later!)
authorized_networks = [
  {
    name  = "all-for-testing"
    value = "0.0.0.0/0"
  }
]