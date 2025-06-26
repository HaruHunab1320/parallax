#!/bin/bash

# Generate Python bindings from proto files
PROTO_DIR="../proto/proto"
OUT_DIR="src/parallax/proto"

# Create output directory
mkdir -p $OUT_DIR
touch $OUT_DIR/__init__.py

# Generate Python code
python -m grpc_tools.protoc \
    -I$PROTO_DIR \
    --python_out=$OUT_DIR \
    --grpc_python_out=$OUT_DIR \
    $PROTO_DIR/confidence.proto

echo "Proto files generated successfully!"