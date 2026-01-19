#!/bin/bash

# Proto generation script for TypeScript SDK

set -e

PROTO_DIR="../../proto"
OUT_DIR="generated"

# Create output directory
mkdir -p $OUT_DIR

# Check if protoc is installed
if ! command -v protoc &> /dev/null; then
    echo "protoc is not installed. Please install protobuf:"
    echo "  brew install protobuf"
    exit 1
fi

# Generate TypeScript code with ts-proto
protoc \
  --plugin=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=$OUT_DIR \
  --ts_proto_opt=outputServices=grpc-js,esModuleInterop=true,outputJsonMethods=true \
  --proto_path=$PROTO_DIR \
  $PROTO_DIR/confidence.proto \
  $PROTO_DIR/coordinator.proto \
  $PROTO_DIR/patterns.proto \
  $PROTO_DIR/registry.proto \
  $PROTO_DIR/executions.proto

# ts-proto emits @bufbuild/protobuf/wire which is not exported; rewrite to @bufbuild/protobuf
rg -l "@bufbuild/protobuf/wire" $OUT_DIR | xargs sed -i '' 's@\\@bufbuild/protobuf/wire@\\@bufbuild/protobuf@g'

# Suppress tsc checks in generated files (ts-proto output can conflict with strict settings)
rg -L "@ts-nocheck" $OUT_DIR -g '*.ts' | xargs sed -i '' '1s@^@// @ts-nocheck\n@'

echo "✅ Proto generation complete!"
