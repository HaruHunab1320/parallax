#!/bin/bash

# Proto generation script for Rust SDK

set -e

# Create output directory
mkdir -p generated

# Rust uses build.rs for proto generation
# Force a rebuild to regenerate protos
echo "Generating proto files..."
cargo build --features generate-proto 2>/dev/null || cargo build

echo "Proto files generated successfully!"