#!/bin/bash

# Proto generation script for Go SDK

set -e

PROTO_DIR="../../proto"
OUT_DIR="generated"

# Create output directory
mkdir -p $OUT_DIR

# Check if protoc is installed
if ! command -v protoc &> /dev/null; then
    echo "protoc is not installed. Please install protobuf compiler."
    echo "On macOS: brew install protobuf"
    echo "On Ubuntu: apt-get install protobuf-compiler"
    exit 1
fi

# Check if protoc-gen-go and protoc-gen-go-grpc are installed
if ! command -v protoc-gen-go &> /dev/null; then
    echo "Installing protoc-gen-go..."
    go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
fi

if ! command -v protoc-gen-go-grpc &> /dev/null; then
    echo "Installing protoc-gen-go-grpc..."
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
fi

# Add Go bin to PATH
export PATH="$PATH:$(go env GOPATH)/bin"

# Generate Go code
# Use M flags to map proto files to Go package without modifying proto files
protoc \
    -I$PROTO_DIR \
    --go_out=$OUT_DIR \
    --go_opt=paths=source_relative \
    --go_opt=Mconfidence.proto=. \
    --go_opt=Mcoordinator.proto=. \
    --go_opt=Mpatterns.proto=. \
    --go_opt=Mregistry.proto=. \
    --go-grpc_out=$OUT_DIR \
    --go-grpc_opt=paths=source_relative \
    --go-grpc_opt=require_unimplemented_servers=false \
    --go-grpc_opt=Mconfidence.proto=. \
    --go-grpc_opt=Mcoordinator.proto=. \
    --go-grpc_opt=Mpatterns.proto=. \
    --go-grpc_opt=Mregistry.proto=. \
    $PROTO_DIR/confidence.proto \
    $PROTO_DIR/coordinator.proto \
    $PROTO_DIR/patterns.proto \
    $PROTO_DIR/registry.proto

# The M flag with "." creates package "__", so we need to fix that
echo "Updating package declarations to 'generated'..."
for file in $OUT_DIR/*.go; do
    sed -i '' 's/^package __$/package generated/' "$file"
done

echo "Proto files generated successfully!"