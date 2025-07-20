#!/bin/bash

# Deploy Parallax to GCP
# This script automates the deployment process

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🚀 Parallax GCP Deployment Script"
echo "================================="

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}✗ $1 not found. Please install it first.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ $1 installed${NC}"
}

echo "Checking prerequisites..."
check_command gcloud
check_command terraform
check_command kubectl
check_command docker

# Get project ID
echo
read -p "Enter your GCP Project ID: " PROJECT_ID
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Project ID is required${NC}"
    exit 1
fi

# Set project
echo "Setting GCP project..."
gcloud config set project $PROJECT_ID

# Enable APIs
echo
echo "Enabling required GCP APIs..."
gcloud services enable compute.googleapis.com
gcloud services enable container.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable redis.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable monitoring.googleapis.com
gcloud services enable logging.googleapis.com

# Create Terraform state bucket
BUCKET_NAME="${PROJECT_ID}-terraform-state"
echo
echo "Creating Terraform state bucket..."
if ! gsutil ls gs://${BUCKET_NAME} &> /dev/null; then
    gsutil mb gs://${BUCKET_NAME}
    echo -e "${GREEN}✓ Created bucket gs://${BUCKET_NAME}${NC}"
else
    echo -e "${YELLOW}Bucket gs://${BUCKET_NAME} already exists${NC}"
fi

# Configure Docker
echo
echo "Configuring Docker for GCR..."
gcloud auth configure-docker --quiet

# Build and push Docker image
echo
echo "Building Docker image..."
cd packages/control-plane
docker build -t gcr.io/${PROJECT_ID}/parallax-control-plane:latest .
echo
echo "Pushing Docker image..."
docker push gcr.io/${PROJECT_ID}/parallax-control-plane:latest
cd ../..

# Prepare Terraform
echo
echo "Preparing Terraform configuration..."
cd terraform/gcp

# Update backend configuration
sed -i.bak "s/parallax-terraform-state/${BUCKET_NAME}/g" main.tf

# Create tfvars file
cat > terraform.tfvars <<EOF
project_id = "${PROJECT_ID}"
region     = "us-central1"
zone       = "us-central1-a"

environment = "production"

cluster_name     = "parallax-cluster"
gke_node_count   = 3
gke_machine_type = "e2-medium"
gke_disk_size_gb = 30

db_tier          = "db-f1-micro"
db_disk_size     = 10
db_backup_enabled = true

parallax_image = "gcr.io/${PROJECT_ID}/parallax-control-plane:latest"

domain_name = ""

authorized_networks = [
  {
    name  = "all"
    value = "0.0.0.0/0"
  }
]
EOF

echo -e "${GREEN}✓ Created terraform.tfvars${NC}"

# Initialize Terraform
echo
echo "Initializing Terraform..."
terraform init

# Plan deployment
echo
echo "Planning deployment..."
terraform plan -out=tfplan

# Confirm deployment
echo
echo -e "${YELLOW}Ready to deploy Parallax to GCP!${NC}"
echo "This will create:"
echo "  - GKE cluster (3 nodes)"
echo "  - Cloud SQL PostgreSQL database"
echo "  - Redis instance"
echo "  - Load balancer"
echo "  - Monitoring stack"
echo
echo -e "${YELLOW}Estimated cost: \$50-100/month${NC}"
echo
read -p "Deploy now? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Deployment cancelled"
    exit 0
fi

# Deploy
echo
echo "Deploying infrastructure (this will take 15-20 minutes)..."
terraform apply tfplan

# Get outputs
echo
echo "Getting deployment information..."
terraform output -json > outputs.json

# Configure kubectl
echo
echo "Configuring kubectl..."
gcloud container clusters get-credentials parallax-cluster --zone us-central1-a

# Wait for pods
echo
echo "Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod -l app=parallax-control-plane -n parallax --timeout=300s || true

# Get load balancer IP
LB_IP=$(terraform output -raw load_balancer_ip)

echo
echo "================================="
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "================================="
echo
echo "Access your services:"
echo "  API: http://${LB_IP}/health"
echo "  Grafana: http://${LB_IP}"
echo "  (Note: Load balancer may take 5-10 minutes to be ready)"
echo
echo "Commands:"
echo "  View pods: kubectl get pods -n parallax"
echo "  View logs: kubectl logs -f deployment/parallax-control-plane -n parallax"
echo "  Stop cluster: gcloud container clusters resize parallax-cluster --size=0 --zone=us-central1-a"
echo
echo "Next steps:"
echo "  1. Test API: curl http://${LB_IP}/health"
echo "  2. Run demo: kubectl exec -it deployment/parallax-control-plane -n parallax -- npm run demo:patterns"
echo "  3. Access Grafana dashboards"
echo
echo -e "${YELLOW}Remember to stop the cluster when not in use to save costs!${NC}"