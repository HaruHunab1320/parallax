# Parallax Terraform Infrastructure

Infrastructure as Code for deploying Parallax to Google Cloud Platform.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads) >= 1.0
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
- GCP Project with billing enabled
- Required APIs enabled:
  - Kubernetes Engine API
  - Cloud SQL Admin API
  - Cloud Resource Manager API
  - Secret Manager API
  - Container Registry API

## Quick Start

```bash
# 1. Authenticate with GCP
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID

# 2. Enable required APIs
gcloud services enable \
  container.googleapis.com \
  sqladmin.googleapis.com \
  cloudresourcemanager.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com \
  redis.googleapis.com

# 3. Create state bucket
gsutil mb -l us-central1 gs://YOUR_PROJECT_ID-parallax-tf-state

# 4. Configure variables
cd terraform/gcp
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# 5. Initialize and apply
terraform init -backend-config="bucket=YOUR_PROJECT_ID-parallax-tf-state"
terraform plan
terraform apply
```

## Directory Structure

```
terraform/
└── gcp/
    ├── main.tf           # Provider and backend configuration
    ├── variables.tf      # Input variables
    ├── outputs.tf        # Output values
    ├── network.tf        # VPC, subnets, firewall rules
    ├── gke.tf            # GKE cluster and node pools
    ├── database.tf       # Cloud SQL PostgreSQL
    ├── storage.tf        # GCS buckets and Memorystore Redis
    ├── kubernetes.tf     # K8s resources (namespace, deployments)
    ├── ingress.tf        # Load balancer and SSL
    ├── monitoring.tf     # Prometheus, Grafana, etcd
    └── terraform.tfvars.example
```

## Security Notes

1. **No default network access**: You must explicitly specify allowed IP ranges
2. **Secrets in Secret Manager**: Database passwords are auto-generated and stored securely
3. **Workload Identity**: GKE pods use Workload Identity instead of service account keys
4. **Private cluster**: GKE nodes have no public IPs
5. **Deletion protection**: Enabled by default on database

## Required Variables

| Variable | Description |
|----------|-------------|
| `project_id` | GCP project ID |
| `authorized_networks` | IP ranges allowed to access Cloud SQL |
| `master_authorized_networks` | IP ranges allowed to access GKE master |
| `grafana_admin_password` | Grafana admin password (min 12 chars) |

## Outputs

After applying, useful outputs include:
- `cluster_endpoint` - GKE cluster endpoint
- `load_balancer_ip` - External IP address
- `connection_command` - kubectl configuration command
- `api_url` - API endpoint URL
- `grafana_url` - Grafana dashboard URL

## Teardown

```bash
# Disable deletion protection first
terraform apply -var="db_deletion_protection=false"

# Destroy all resources
terraform destroy
```

## Cost Optimization

The default configuration uses cost-effective options:
- Preemptible GKE nodes
- db-f1-micro Cloud SQL (free tier eligible)
- Basic tier Memorystore Redis

For production, consider upgrading to:
- Regular (non-preemptible) nodes
- db-g1-small or higher for Cloud SQL
- Standard tier Redis with HA
