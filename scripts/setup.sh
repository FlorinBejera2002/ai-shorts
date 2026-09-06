#!/bin/bash
set -e

echo "=== Sneepcut Setup ==="

if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "Edit .env with your API keys before starting."
fi

echo "Building and starting services..."
docker compose up --build -d

echo "Waiting for services to be healthy..."
sleep 10

echo "Checking health..."
curl -s http://localhost/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Backend: {d[\"status\"]}')" 2>/dev/null || echo "Backend not ready yet"
curl -s http://localhost > /dev/null && echo "Frontend: ok" || echo "Frontend not ready yet"

echo ""
echo "=== Setup complete ==="
echo "Frontend: http://localhost"
echo "Frontend (canonical local URL): http://localhost:3000"
echo "Backend API: http://localhost/api/health"
echo "Backend docs (dev overlay only): http://localhost:8000/api/docs"
echo "Dev overlay: docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build"
