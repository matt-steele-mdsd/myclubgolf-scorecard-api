#!/bin/bash
# Deploy script for remote server
# Usage: ./deploy-remote.sh

echo "🚀 phoneAI Server Remote Deploy"
echo "================================"
echo ""

# Check if dist.zip exists
if [ ! -f dist.zip ]; then
    echo "❌ dist.zip not found!"
    exit 1
fi

echo "1️⃣  Extracting dist.zip..."
unzip -q dist.zip -d .
echo "   ✓ Files extracted"

echo "2️⃣  Removing dist.zip..."
rm dist.zip
echo "   ✓ Cleaned up"

echo ""
echo "✅ Deploy complete!"
echo ""
echo "🚀 Start the server:"
echo "   node dist/server.js"
echo ""
echo "   Or with beta flag:"
echo "   BETA=true node dist/server.js"
echo ""
echo "🧪 Test:"
echo "   curl http://localhost:3000/api/health"
