#!/bin/bash

# Start Claude Code Web

cd "$(dirname "$0")"

# Check if .env exists
if [ ! -f backend/.env ]; then
    echo "Error: backend/.env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi

# Build frontend if dist doesn't exist
if [ ! -d frontend/dist ]; then
    echo "Building frontend..."
    cd frontend
    npm install
    npm run build
    cd ..
fi

# Build backend if dist doesn't exist
if [ ! -d backend/dist ]; then
    echo "Building backend..."
    cd backend
    npm install
    npm run build
    cd ..
fi

# Start the server
echo "Starting Claude Code Web..."
cd backend
node dist/server.js
