#!/bin/bash

# Fathuss Database Initialization Script
# This script sets up all databases and services

set -e

echo "🚀 Initializing Fathuss Storage Architecture..."

# Wait for services to be ready
echo "⏳ Waiting for database services to start..."
sleep 10

# Initialize Postgres schema
echo "📊 Setting up Postgres database..."
docker-compose exec -T postgres psql -U user -d fathuss -f /docker-entrypoint-initdb.d/schema.sql 2>/dev/null || \
docker-compose exec -T postgres psql -U user -d fathuss -c "$(cat database/schema.sql)"

# Initialize ClickHouse tables
echo "📈 Setting up ClickHouse analytics database..."
docker-compose exec -T clickhouse clickhouse-client --user default --password password --database fathuss_analytics --multiline --multiquery -q "$(cat clickhouse-init/init.sql)"

# Initialize IPFS
echo "🌐 Initializing IPFS node..."
docker-compose exec -T ipfs ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
docker-compose exec -T ipfs ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'

echo "✅ Database initialization complete!"
echo ""
echo "📋 Services Status:"
echo "  • Postgres:  localhost:5432"
echo "  • Redis:     localhost:6379"
echo "  • ClickHouse: localhost:8123 (HTTP), localhost:9000 (Native)"
echo "  • IPFS:      localhost:5001 (API), localhost:8080 (Gateway)"
echo "  • Storage Service: localhost:4007"
echo ""
echo "🔗 Useful Commands:"
echo "  • View Postgres data: docker-compose exec postgres psql -U user -d fathuss"
echo "  • View Redis data:    docker-compose exec redis redis-cli"
echo "  • View ClickHouse:    docker-compose exec clickhouse clickhouse-client --user default --password password --database fathuss_analytics"
echo "  • IPFS WebUI:         http://localhost:5001/webui"