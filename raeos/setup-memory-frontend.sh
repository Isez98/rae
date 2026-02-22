#!/bin/bash
# Quick setup and test script for memory daemon frontend integration

set -e

echo "🚀 Memory Daemon Frontend Integration Setup"
echo "==========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this script from the raeos directory"
    exit 1
fi

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
npm install

# Check if memory daemon dependencies are installed
echo ""
echo "🔍 Checking memory daemon setup..."
cd ../memory-daemon

if [ ! -f "venv/bin/activate" ] && [ ! -f "venv/Scripts/activate" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv venv
fi

echo "📦 Installing memory daemon dependencies..."
source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null
pip install -r requirements.txt

cd ../raeos

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Start the memory daemon (in a separate terminal):"
echo "   cd ../memory-daemon"
echo "   source venv/bin/activate  # or venv/Scripts/activate on Windows"
echo "   uvicorn daemon:app --host 127.0.0.1 --port 8765"
echo ""
echo "2. Start the Qwen server (in another terminal):"
echo "   cd ../../raven-llm-lab"
echo "   ./llama.cpp/build/bin/llama-server \\"
echo "     --model ./models/qwen2.5-3b-instruct.gguf \\"
echo "     --port 5050 \\"
echo "     --ctx-size 8192"
echo ""
echo "3. Build and run the Tauri app (in this terminal):"
echo "   npm run tauri dev"
echo ""
echo "4. Test the features:"
echo "   - Send chat messages (auto-saved to memory)"
echo "   - Click 'Search Memory' to find past conversations"
echo "   - Click 'Daily Summary' to generate an AI summary"
echo ""
echo "🔗 Quick links:"
echo "   Memory Daemon: http://127.0.0.1:8765"
echo "   Qwen Server: http://127.0.0.1:5050"
echo ""
