# Multi-purpose worker image for grading and compilation
FROM rust:1.75-slim as rust-builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    nodejs \
    npm \
    python3 \
    python3-pip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Foundry (for Solidity)
RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="$PATH:/root/.foundry/bin"
RUN foundryup

# Install Hardhat
RUN npm install -g hardhat

# Install Move CLI (Aptos)
RUN wget -qO- https://aptos.dev/scripts/install_cli.py | python3

# Set working directory
WORKDIR /app

# Copy Cargo.toml and source
COPY Cargo.toml ./
COPY src ./src/

# Build the Rust worker
RUN cargo build --release

# Runtime image
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    nodejs \
    npm \
    python3 \
    python3-pip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy Foundry from builder
COPY --from=rust-builder /root/.foundry /root/.foundry
ENV PATH="$PATH:/root/.foundry/bin"

# Copy Hardhat from builder
COPY --from=rust-builder /usr/local/lib/node_modules/hardhat /usr/local/lib/node_modules/hardhat
ENV PATH="$PATH:/usr/local/lib/node_modules/hardhat/bin"

# Copy Move CLI from builder
COPY --from=rust-builder /usr/local/bin/aptos /usr/local/bin/aptos

# Copy built worker binary
COPY --from=rust-builder /app/target/release/fathuss-worker /app/worker

# Create app directory
WORKDIR /app

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run the worker
CMD ["./worker"]