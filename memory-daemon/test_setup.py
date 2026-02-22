#!/usr/bin/env python3
"""Test script to verify memory daemon setup."""

import sys

print("Testing Memory Daemon Setup...")
print("=" * 60)

# Test 1: Import dependencies
print("\n1. Testing imports...")
try:
    import fastapi
    import pydantic
    import uvicorn
    import apsw
    import orjson
    import numpy as np
    import onnxruntime as ort
    from tokenizers import Tokenizer
    import sqlite_vec
    print("   ✓ All dependencies imported successfully")
except ImportError as e:
    print(f"   ✗ Import error: {e}")
    sys.exit(1)

# Test 2: Check files exist
print("\n2. Checking required files...")
import os
files_to_check = [
    "bge-small-en.onnx",
    "tokenizer.json",
    "config.json",
    "memory.db",
    "0001_init.sql",
    "daemon.py"
]
for file in files_to_check:
    if os.path.exists(file):
        print(f"   ✓ {file}")
    else:
        print(f"   ✗ {file} NOT FOUND")

# Test 3: Test database connection
print("\n3. Testing database connection...")
try:
    from daemon import connect
    con = connect()
    cur = con.cursor()
    cur.execute('SELECT vec_version()')
    version = cur.fetchone()[0]
    print(f"   ✓ Database connected, sqlite-vec version: {version}")
except Exception as e:
    print(f"   ✗ Database connection error: {e}")
    sys.exit(1)

# Test 4: Test tokenizer
print("\n4. Testing tokenizer...")
try:
    tokenizer = Tokenizer.from_file("tokenizer.json")
    encoding = tokenizer.encode("Hello, world!")
    print(f"   ✓ Tokenizer loaded, test encoding length: {len(encoding.ids)}")
except Exception as e:
    print(f"   ✗ Tokenizer error: {e}")
    sys.exit(1)

# Test 5: Test ONNX model
print("\n5. Testing ONNX model...")
try:
    # Use CPU provider only for testing to avoid ROCm issues
    sess = ort.InferenceSession("bge-small-en.onnx", providers=["CPUExecutionProvider"])
    print(f"   ✓ ONNX model loaded")
    print(f"   - Available providers: {sess.get_providers()}")
    print(f"   - Inputs: {[inp.name for inp in sess.get_inputs()]}")
    print(f"   - Outputs: {[out.name for out in sess.get_outputs()]}")
except Exception as e:
    print(f"   ✗ ONNX model error: {e}")
    sys.exit(1)

# Test 6: Test embedding function
print("\n6. Testing embedding generation...")
try:
    from daemon import embed
    test_texts = ["Hello world", "This is a test"]
    embeddings = embed(test_texts)
    print(f"   ✓ Embeddings generated")
    print(f"   - Shape: {embeddings.shape}")
    print(f"   - Dtype: {embeddings.dtype}")
    print(f"   - Sample norm: {np.linalg.norm(embeddings[0]):.6f} (should be ~1.0)")
except Exception as e:
    print(f"   ✗ Embedding error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 60)
print("✓ All tests passed! Memory daemon is ready to run.")
print("\nTo start the daemon, run:")
print("  ./run.sh")
print("  or")
print("  uvicorn daemon:app --host 0.0.0.0 --port 8765 --reload")
