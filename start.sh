#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=================================================="
echo "      🚀 Launching Outreach ENGINE 2.0           "
echo "=================================================="

# Check if venv exists, create if missing
if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
    .venv/bin/pip install --upgrade pip
    .venv/bin/pip install -r requirements.txt
fi

echo "Starting server on http://localhost:8000 ..."
echo "MCP Server available at: http://localhost:8000/api/mcp"
echo "=================================================="

exec .venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
