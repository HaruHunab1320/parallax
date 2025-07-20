#!/bin/bash

# Proto generation script for Python SDK

set -e

PROTO_DIR="../../proto"
OUT_DIR="generated"

# Create output directory
mkdir -p $OUT_DIR
touch $OUT_DIR/__init__.py

# Find protobuf include path
PROTOBUF_INCLUDE=$(poetry run python -c "import pkg_resources; print(pkg_resources.get_distribution('grpcio-tools').location + '/grpc_tools/_proto')")

# Generate Python code
poetry run python -m grpc_tools.protoc \
    -I$PROTO_DIR \
    -I$PROTOBUF_INCLUDE \
    --python_out=$OUT_DIR \
    --grpc_python_out=$OUT_DIR \
    $PROTO_DIR/confidence.proto \
    $PROTO_DIR/coordinator.proto \
    $PROTO_DIR/patterns.proto \
    $PROTO_DIR/registry.proto

echo "Proto files generated successfully!"