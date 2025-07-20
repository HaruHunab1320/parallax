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
protoc \
    -I$PROTO_DIR \
    --go_out=$OUT_DIR \
    --go_opt=paths=source_relative \
    --go-grpc_out=$OUT_DIR \
    --go-grpc_opt=paths=source_relative \
    $PROTO_DIR/confidence.proto \
    $PROTO_DIR/coordinator.proto \
    $PROTO_DIR/patterns.proto \
    $PROTO_DIR/registry.proto

echo "Proto files generated successfully!"