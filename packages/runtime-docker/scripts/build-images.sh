#!/bin/bash
#
# Build Parallax Agent Docker Images
#
# Usage:
#   ./scripts/build-images.sh           # Build all images
#   ./scripts/build-images.sh --push    # Build and push to registry
#   ./scripts/build-images.sh claude    # Build only claude image
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGES_DIR="$ROOT_DIR/images"

# Configuration
REGISTRY="${PARALLAX_REGISTRY:-parallax}"
VERSION="${VERSION:-latest}"
PLATFORM="${PLATFORM:-linux/amd64}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Build a single image
build_image() {
    local name=$1
    local tag="${REGISTRY}/agent-${name}:${VERSION}"
    local context="${IMAGES_DIR}/${name}"

    if [ ! -d "$context" ]; then
        log_error "Image directory not found: $context"
        return 1
    fi

    log_info "Building $tag..."
    docker build \
        --platform "$PLATFORM" \
        -t "$tag" \
        "$context"

    # Also tag as latest if building a specific version
    if [ "$VERSION" != "latest" ]; then
        docker tag "$tag" "${REGISTRY}/agent-${name}:latest"
    fi

    log_info "Successfully built $tag"
}

# Push a single image
push_image() {
    local name=$1
    local tag="${REGISTRY}/agent-${name}:${VERSION}"

    log_info "Pushing $tag..."
    docker push "$tag"

    if [ "$VERSION" != "latest" ]; then
        docker push "${REGISTRY}/agent-${name}:latest"
    fi

    log_info "Successfully pushed $tag"
}

# Build all images in order (base first)
build_all() {
    log_info "Building all Parallax agent images..."

    # Build base first
    build_image "base"

    # Build agent images
    for agent in claude codex gemini aider; do
        build_image "$agent"
    done

    log_info "All images built successfully!"
}

# Push all images
push_all() {
    log_info "Pushing all Parallax agent images..."

    for agent in base claude codex gemini aider; do
        push_image "$agent"
    done

    log_info "All images pushed successfully!"
}

# Print usage
usage() {
    cat << EOF
Parallax Agent Image Builder

Usage: $0 [OPTIONS] [IMAGE]

Options:
    --push          Push images to registry after building
    --version VER   Set image version tag (default: latest)
    --registry REG  Set registry prefix (default: parallax)
    --platform PLT  Set target platform (default: linux/amd64)
    -h, --help      Show this help message

Images:
    base    Base image with common dependencies
    claude  Claude Code CLI agent
    codex   OpenAI Codex CLI agent
    gemini  Google Gemini CLI agent
    aider   Aider coding assistant agent

Examples:
    $0                      # Build all images
    $0 --push               # Build and push all images
    $0 claude               # Build only Claude image
    $0 --push claude codex  # Build and push Claude and Codex images

Environment Variables:
    PARALLAX_REGISTRY   Registry prefix (default: parallax)
    VERSION             Image version tag (default: latest)
    PLATFORM            Target platform (default: linux/amd64)
EOF
}

# Parse arguments
PUSH=false
IMAGES=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH=true
            shift
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        -*)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
        *)
            IMAGES+=("$1")
            shift
            ;;
    esac
done

# Main
log_info "Parallax Agent Image Builder"
log_info "Registry: $REGISTRY"
log_info "Version: $VERSION"
log_info "Platform: $PLATFORM"
echo ""

if [ ${#IMAGES[@]} -eq 0 ]; then
    # Build all images
    build_all
    if [ "$PUSH" = true ]; then
        push_all
    fi
else
    # Build specific images
    # Always build base first if other images are requested
    if [[ ! " ${IMAGES[*]} " =~ " base " ]]; then
        log_info "Building base image first (required dependency)..."
        build_image "base"
    fi

    for image in "${IMAGES[@]}"; do
        build_image "$image"
        if [ "$PUSH" = true ]; then
            push_image "$image"
        fi
    done
fi

log_info "Done!"
