# Parallax GCP Deployment with Terraform

This Terraform configuration deploys Parallax to Google Cloud Platform (GCP) using:
- Google Kubernetes Engine (GKE)
- Cloud SQL (PostgreSQL)
- Memorystore (Redis)
- Cloud Storage (GCS)
- Cloud Load Balancing

## Prerequisites

1. **GCP Account with billing enabled** (free tier eligible)
2. **Tools installed**:
   ```bash
   # Install gcloud CLI
   # https://cloud.google.com/sdk/docs/install

   # Install terraform
   brew install terraform

   # Install kubectl
   brew install kubectl

   # Install helm
   brew install helm
   ```

3. **GCP Project Setup**:
   ```bash
   # Create project
   gcloud projects create YOUR_PROJECT_ID --name="Parallax"
   
   # Set project
   gcloud config set project YOUR_PROJECT_ID
   
   # Enable billing (required even for free tier)
   # Visit: https://console.cloud.google.com/billing
   
   # Enable required APIs
   gcloud services enable compute.googleapis.com
   gcloud services enable container.googleapis.com
   gcloud services enable sqladmin.googleapis.com
   gcloud services enable redis.googleapis.com
   gcloud services enable secretmanager.googleapis.com
   gcloud services enable monitoring.googleapis.com
   gcloud services enable logging.googleapis.com
   ```

## Deployment Steps

### 1. Build and Push Docker Image

```bash
# Configure Docker for GCR
gcloud auth configure-docker

# Build and push image
cd ../..  # Go to Parallax root
docker build -t gcr.io/YOUR_PROJECT_ID/parallax-control-plane:latest packages/control-plane
docker push gcr.io/YOUR_PROJECT_ID/parallax-control-plane:latest
```

### 2. Create Terraform State Bucket

```bash
# Create bucket for Terraform state
gsutil mb gs://YOUR_PROJECT_ID-terraform-state

# Update main.tf backend configuration with your bucket name
```

### 3. Configure Terraform

```bash
cd terraform/gcp

# Copy and edit variables
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars with your values:
# - project_id
# - authorized_networks (your IP address)
# - domain_name (optional)
```

### 4. Deploy Infrastructure

```bash
# Initialize Terraform
terraform init

# Review plan
terraform plan

# Deploy (this will take ~15-20 minutes)
terraform apply

# Save outputs
terraform output -json > outputs.json
```

### 5. Configure kubectl

```bash
# Get cluster credentials
gcloud container clusters get-credentials parallax-cluster --zone us-central1-a

# Verify connection
kubectl get nodes
kubectl get pods -n parallax
```

### 6. Wait for Services

```bash
# Watch pods come up
kubectl get pods -n parallax -w

# Check ingress (can take 5-10 minutes for Google LB)
kubectl get ingress -n parallax
```

### 7. Access Services

```bash
# Get load balancer IP
PARALLAX_IP=$(terraform output -raw load_balancer_ip)

# Test API
curl http://$PARALLAX_IP/health

# Access Grafana
open http://$PARALLAX_IP
# Login: admin / changeme
```

## Cost Optimization for Free Tier

This configuration is optimized for GCP free tier:

1. **GKE**: 
   - Zonal cluster (not regional)
   - Preemptible nodes
   - e2-medium instances

2. **Cloud SQL**:
   - db-f1-micro instance
   - 10GB storage
   - Point-in-time recovery enabled

3. **Redis**:
   - 1GB Basic tier (no HA)

4. **Storage**:
   - Standard storage class
   - Lifecycle policies for old data

**Estimated monthly cost**: ~$50-100 (mostly from GKE nodes)

To stay in free tier limits:
- Use only during development/testing
- Stop GKE cluster when not in use:
  ```bash
  gcloud container clusters resize parallax-cluster --size=0 --zone=us-central1-a
  ```

## Production Considerations

Before going to production:

1. **Security**:
   - Change all default passwords
   - Restrict authorized_networks
   - Enable private GKE cluster
   - Use Cloud Armor for DDoS protection

2. **High Availability**:
   - Use regional GKE cluster
   - Enable Cloud SQL HA
   - Use Redis Standard tier
   - Multi-region backups

3. **Monitoring**:
   - Set up alerting policies
   - Configure log exports
   - Enable Cloud Trace
   - Set up uptime checks

4. **Scaling**:
   - Enable cluster autoscaling
   - Configure HPA properly
   - Use larger node pools
   - Consider Autopilot GKE

## Maintenance

### Update Application

```bash
# Build and push new image
docker build -t gcr.io/YOUR_PROJECT_ID/parallax-control-plane:v1.2.3 packages/control-plane
docker push gcr.io/YOUR_PROJECT_ID/parallax-control-plane:v1.2.3

# Update deployment
kubectl set image deployment/parallax-control-plane parallax=gcr.io/YOUR_PROJECT_ID/parallax-control-plane:v1.2.3 -n parallax
```

### Backup Database

```bash
# Manual backup
gcloud sql backups create --instance=parallax-cluster-postgres

# List backups
gcloud sql backups list --instance=parallax-cluster-postgres
```

### Monitor Costs

```bash
# View current month costs
gcloud billing accounts list
gcloud alpha billing budgets list

# Set up budget alerts in Console
```

## Cleanup

To avoid charges:

```bash
# Destroy all resources
terraform destroy

# Confirm all resources deleted
gcloud compute addresses list
gcloud container clusters list
gcloud sql instances list
```

## Troubleshooting

### Pods not starting
```bash
kubectl describe pod POD_NAME -n parallax
kubectl logs POD_NAME -n parallax
```

### Database connection issues
```bash
# Check Cloud SQL Proxy
kubectl logs deployment/parallax-control-plane -c cloud-sql-proxy -n parallax
```

### Ingress not working
```bash
# Check ingress status
kubectl describe ingress parallax-ingress -n parallax

# Check backend services in GCP Console
# https://console.cloud.google.com/net-services/loadbalancing/loadBalancers/list
```

### High costs
```bash
# Check resource usage
kubectl top nodes
kubectl top pods -n parallax

# Reduce nodes
gcloud container clusters resize parallax-cluster --size=1 --zone=us-central1-a
```