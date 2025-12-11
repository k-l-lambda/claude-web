#!/bin/bash
# Download sherpa-onnx WASM files for ASR (Speech-to-Text)
# Source: https://huggingface.co/spaces/k2-fsa/web-assembly-asr-sherpa-onnx-zh-en
# Model: Zipformer (Chinese + English, ~200MB)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="$SCRIPT_DIR/../public/sherpa-onnx"
BASE_URL="https://huggingface.co/spaces/k2-fsa/web-assembly-asr-sherpa-onnx-zh-en/resolve/main"

# Use proxy if set (for China users)
CURL_OPTS=""
if [ -n "$http_proxy" ] || [ -n "$HTTP_PROXY" ]; then
  CURL_OPTS="-x ${http_proxy:-$HTTP_PROXY}"
fi

# Files to download
FILES=(
  "sherpa-onnx-asr.js"
  "sherpa-onnx-wasm-main-asr.js"
  "sherpa-onnx-wasm-main-asr.wasm"
  "sherpa-onnx-wasm-main-asr.data"
)

mkdir -p "$TARGET_DIR"

echo "Downloading sherpa-onnx WASM files..."
echo "Target directory: $TARGET_DIR"
echo ""

for file in "${FILES[@]}"; do
  if [ -f "$TARGET_DIR/$file" ]; then
    echo "✓ $file (already exists)"
  else
    echo "Downloading $file..."
    curl $CURL_OPTS -L --progress-bar "$BASE_URL/$file" -o "$TARGET_DIR/$file"
    echo "✓ $file downloaded"
  fi
done

echo ""
echo "Done! sherpa-onnx WASM files are ready."
echo "Total size: $(du -sh "$TARGET_DIR" | cut -f1)"
