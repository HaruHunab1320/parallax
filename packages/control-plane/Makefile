# Makefile for Parallax Control Plane Docker operations

.PHONY: help build build-dev run run-dev stop clean push test logs shell

# Default values
VERSION ?= latest
REGISTRY ?= 
IMAGE_NAME := parallax/control-plane
DEV_IMAGE_NAME := parallax/control-plane-dev

# Help target
help:
	@echo "Parallax Control Plane Docker Commands:"
	@echo ""
	@echo "  make build          Build production Docker image"
	@echo "  make build-dev      Build development Docker image"
	@echo "  make run            Run production environment"
	@echo "  make run-dev        Run development environment"
	@echo "  make stop           Stop all containers"
	@echo "  make clean          Remove containers and volumes"
	@echo "  make push           Push image to registry"
	@echo "  make test           Run tests in Docker"
	@echo "  make logs           Show container logs"
	@echo "  make shell          Shell into control-plane container"
	@echo ""
	@echo "Options:"
	@echo "  VERSION=x.y.z       Set image version (default: latest)"
	@echo "  REGISTRY=reg.io     Set Docker registry"

# Build production image
build:
	@echo "Building production image..."
	@cd ../.. && docker build -f packages/control-plane/Dockerfile -t $(IMAGE_NAME):$(VERSION) .
	@echo "✅ Production image built: $(IMAGE_NAME):$(VERSION)"

# Build development image
build-dev:
	@echo "Building development image..."
	@cd ../.. && docker build -f packages/control-plane/Dockerfile.dev -t $(DEV_IMAGE_NAME):latest .
	@echo "✅ Development image built: $(DEV_IMAGE_NAME):latest"

# Run production environment
run: check-env
	@echo "Starting production environment..."
	@docker-compose up -d
	@echo "✅ Production environment started"
	@echo "API: http://localhost:8080"

# Run development environment
run-dev: build-dev
	@echo "Starting development environment..."
	@docker-compose -f docker-compose.dev.yml up -d
	@echo "✅ Development environment started with hot reload"
	@echo "API: http://localhost:8080"

# Stop all containers
stop:
	@echo "Stopping containers..."
	@docker-compose down
	@docker-compose -f docker-compose.dev.yml down
	@echo "✅ Containers stopped"

# Clean up everything
clean: stop
	@echo "Cleaning up..."
	@docker-compose down -v --remove-orphans
	@docker-compose -f docker-compose.dev.yml down -v --remove-orphans
	@docker rmi $(IMAGE_NAME):$(VERSION) $(DEV_IMAGE_NAME):latest 2>/dev/null || true
	@echo "✅ Cleanup complete"

# Push to registry
push: build
ifdef REGISTRY
	@echo "Tagging image for registry..."
	@docker tag $(IMAGE_NAME):$(VERSION) $(REGISTRY)/$(IMAGE_NAME):$(VERSION)
	@echo "Pushing to registry..."
	@docker push $(REGISTRY)/$(IMAGE_NAME):$(VERSION)
	@echo "✅ Image pushed to $(REGISTRY)/$(IMAGE_NAME):$(VERSION)"
else
	@echo "❌ Error: REGISTRY not specified"
	@echo "Usage: make push REGISTRY=docker.io/myorg"
	@exit 1
endif

# Run tests in Docker
test: build-dev
	@echo "Running tests in Docker..."
	@docker run --rm \
		-v $(PWD)/../../packages:/app/packages \
		-e DATABASE_URL=postgresql://test:test@localhost:5432/test \
		$(DEV_IMAGE_NAME):latest \
		pnpm test
	@echo "✅ Tests completed"

# Show logs
logs:
	@docker-compose logs -f control-plane

# Shell into container
shell:
	@docker-compose exec control-plane sh

# Check if .env file exists
check-env:
	@if [ ! -f .env ]; then \
		echo "❌ No .env file found. Creating from example..."; \
		cp env.example .env; \
		echo "⚠️  Please edit .env with your configuration"; \
		exit 1; \
	fi

# Database operations
db-migrate:
	@docker-compose exec control-plane pnpm db:migrate

db-seed:
	@docker-compose exec control-plane pnpm db:seed

db-studio:
	@docker-compose exec control-plane pnpm db:studio