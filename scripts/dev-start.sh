#!/bin/bash

# Development startup script for Crate Guide
# This script starts Supabase local development environment and Nuxt dev server

set -e  # Exit on any error

echo "🚀 Starting Crate Guide development environment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "supabase/config.toml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Check if Supabase is already running
if docker ps | grep -q "supabase.*crate-guide"; then
    print_warning "Supabase is already running"
else
    print_status "Starting Supabase local development..."
    supabase start
fi

# Wait a moment for services to be ready
sleep 2

# Start Edge Functions runtime in the background
print_status "Starting Edge Functions runtime..."
supabase functions serve --no-verify-jwt &
FUNCTIONS_PID=$!

# Function to cleanup on exit
cleanup() {
    print_status "Shutting down services..."
    if [ ! -z "$FUNCTIONS_PID" ]; then
        kill $FUNCTIONS_PID 2>/dev/null || true
    fi
    if [ ! -z "$DEV_PID" ]; then
        kill $DEV_PID 2>/dev/null || true
    fi
}

# Set trap for cleanup on script exit
trap cleanup EXIT INT TERM

# Wait a moment for functions to start
sleep 3

print_status "Starting Nuxt development server..."
print_status "Development environment is ready!"
echo ""
echo "📱 Application: http://localhost:3000"
echo "🎛️  Supabase Studio: http://localhost:42823"
echo "📧 Email testing: http://localhost:42824"
echo "🔧 Functions: http://localhost:42821/functions/v1/"
echo ""
echo "Press Ctrl+C to stop all services"

# Start Nuxt dev server (this will block)
nuxt dev &
DEV_PID=$!

# Wait for the dev server to exit
wait $DEV_PID
