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
rg -l "@bufbuild/protobuf/wire" $OUT_DIR | while read -r file; do
  sed -i '' 's#@bufbuild/protobuf/wire#@bufbuild/protobuf#g' "$file"
done

# Suppress tsc checks in generated files (ts-proto output can conflict with strict settings)
python - <<PY
from pathlib import Path

out_dir = Path("$OUT_DIR")
for path in out_dir.rglob("*.ts"):
    text = path.read_text()
    if "@ts-nocheck" in text.splitlines()[0:2]:
        continue
    path.write_text("// @ts-nocheck\\n" + text)
PY

echo "✅ Proto generation complete!"
