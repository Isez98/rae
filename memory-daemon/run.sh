#!/bin/bash
# Memory Daemon Startup Script

# Activate virtual environment
source /storage/.venv/ocr_stable_py311/bin/activate

# Change to daemon directory
cd "$(dirname "$0")"

# Set environment variables (optional overrides)
export MEM_DB="${MEM_DB:-memory.db}"
export EMBED_DIM="${EMBED_DIM:-384}"
export EMBED_MODEL="${EMBED_MODEL:-bge-small-en-v1.5}"
export EMBED_ONNX_PATH="${EMBED_ONNX_PATH:-bge-small-en.onnx}"
export TOKENIZER_PATH="${TOKENIZER_PATH:-tokenizer.json}"
export VEC_EXT="${VEC_EXT:-sqlite-vec}"

# Start the daemon
echo "Starting Memory Daemon..."
echo "  Database: $MEM_DB"
echo "  Model: $EMBED_MODEL"
echo "  ONNX: $EMBED_ONNX_PATH"
echo "  Tokenizer: $TOKENIZER_PATH"
echo ""

uvicorn daemon:app --host 0.0.0.0 --port 8765 --reload
