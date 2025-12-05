#!/bin/bash
set -e

# Install ClickHouse
sudo yum update -y
sudo yum install -y yum-utils
sudo rpm --import https://repo.clickhouse.com/CLICKHOUSE-KEY.GPG
sudo yum-config-manager --add-repo https://repo.clickhouse.com/rpm/clickhouse.repo
sudo yum install -y clickhouse-server clickhouse-client

# Configure ClickHouse
sudo tee /etc/clickhouse-server/config.d/custom.xml > /dev/null <<EOF
<clickhouse>
    <listen_host>0.0.0.0</listen_host>
    <http_port>8123</http_port>
    <tcp_port>9000</tcp_port>
    <interserver_http_port>9009</interserver_http_port>
</clickhouse>
EOF

# Create databases
sudo tee /etc/clickhouse-server/users.d/fathuss.xml > /dev/null <<EOF
<clickhouse>
    <users>
        <fathuss>
            <password>password</password>
            <networks>
                <ip>10.0.0.0/8</ip>
                <ip>172.16.0.0/12</ip>
                <ip>192.168.0.0/16</ip>
            </networks>
            <profile>default</profile>
            <quota>default</quota>
        </fathuss>
    </users>
</clickhouse>
EOF

# Start ClickHouse
sudo systemctl enable clickhouse-server
sudo systemctl start clickhouse-server

# Wait for ClickHouse to start
sleep 10

# Create database
clickhouse-client --user fathuss --password password --query "CREATE DATABASE IF NOT EXISTS fathuss"