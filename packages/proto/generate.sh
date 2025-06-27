#!/bin/bash

# Proto generation script for Parallax

set -e

PROTO_DIR="proto"
OUT_DIR="generated"

# Create output directory
mkdir -p $OUT_DIR

# Generate JavaScript code
npx grpc_tools_node_protoc \
  --js_out=import_style=commonjs,binary:$OUT_DIR \
  --grpc_out=grpc_js:$OUT_DIR \
  --plugin=protoc-gen-grpc=./node_modules/.bin/grpc_tools_node_protoc_plugin \
  --proto_path=$PROTO_DIR \
  $PROTO_DIR/*.proto

# Generate TypeScript definitions
npx grpc_tools_node_protoc \
  --plugin=protoc-gen-ts=./node_modules/.bin/protoc-gen-ts \
  --ts_out=service=grpc-node,mode=grpc-js:$OUT_DIR \
  --proto_path=$PROTO_DIR \
  $PROTO_DIR/*.proto

echo "✅ Proto generation complete!"