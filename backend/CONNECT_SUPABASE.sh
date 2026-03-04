#!/bin/bash

echo "🔗 SUPABASE CONNECTION HELPER"
echo "=============================="
echo ""
echo "This script will help you set up your Supabase connection."
echo ""

# Check if .env exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists!"
    echo ""
    read -p "Do you want to overwrite it? (y/n): " overwrite
    if [ "$overwrite" != "y" ]; then
        echo "Aborted. Please edit .env manually."
        exit 0
    fi
fi

echo "📝 Please provide your Supabase connection details:"
echo ""
echo "You can find these in Supabase Dashboard → Settings → Database"
echo ""

read -p "Enter your DATABASE_URL: " database_url
read -p "Enter JWT_SECRET (or press Enter for default): " jwt_secret

if [ -z "$jwt_secret" ]; then
    jwt_secret="dev-secret-change-in-production-$(openssl rand -hex 16)"
fi

# Create .env file
cat > .env <<EOF
# Supabase Database Connection
DATABASE_URL=$database_url

# Server Configuration
PORT=8080
GIN_MODE=debug

# JWT Secret
JWT_SECRET=$jwt_secret

# CORS Configuration
ALLOWED_ORIGINS=*
EOF

echo ""
echo "✅ .env file created successfully!"
echo ""
echo "Testing database connection..."
echo ""

# Test connection
go run cmd/main.go &
PID=$!
sleep 5

# Check if process is still running
if ps -p $PID > /dev/null; then
    echo "✅ Backend started successfully!"
    echo ""
    echo "Testing health endpoint..."
    response=$(curl -s http://localhost:8080/health)
    if [[ $response == *"running"* ]]; then
        echo "✅ Health check passed!"
        echo ""
        echo "Your backend is connected to Supabase! 🎉"
    else
        echo "⚠️  Health check failed"
    fi
    
    # Stop the server
    kill $PID 2>/dev/null
else
    echo "❌ Backend failed to start. Check the error messages above."
fi

echo ""
echo "Next steps:"
echo "1. Check tables in Supabase Dashboard → Table Editor"
echo "2. Test API endpoints"
echo "3. Deploy to production!"
