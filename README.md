# Fathuss 🚀

**Web3-Native, Multi-Chain Challenge Platform**  
*CTF + Learning + Hiring + Grader*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8+-blue.svg)](https://soliditylang.org/)

Fathuss is a cutting-edge platform designed for Web3 enthusiasts, developers, and organizations to engage in Capture The Flag (CTF) challenges, continuous learning, talent hiring, and automated grading across multiple blockchain networks.

## 🏗️ Architecture

Fathuss is a distributed platform with three main user-facing surfaces and several backend subsystems:

### Component Diagram

```
Component diagram (textual)[Browser/Client]
  ├─ Next.js (Monaco IDE + UI)
    ├─ Wallet (MetaMask/WalletConnect) => SIWE
      └─ GraphQL/REST -> API Gateway

      [API Gateway / Auth]
        └─ Node.js / TypeScript (Next.js API or standalone)

        [Services]
          ├─ User Service (TS)
            ├─ Challenge Service (TS)
              ├─ Leaderboard Service (TS)
                ├─ Marketplace Service (TS)
                  ├─ Hiring Service (TS)
                    └─ Grader Orchestration (Rust/Go controller + TS orchestration)

                    [Message Bus]
                      └─ Kafka/RabbitMQ

                      [Worker Pool]
                        ├─ Grader Workers (Rust) -> docker / Firecracker
                          └─ Compiler Workers (Foundry/Anvil, Hardhat, cargo, move-cli)

                          [Storage]
                            ├─ Postgres (metadata)
                              ├─ Redis (sessions, rate limits)
                                ├─ ClickHouse (analytics)
                                  └─ IPFS (fixtures, testcases, challenge binaries)

                                  [Orchestration]
                                    └─ Kubernetes + Helm

                                    [Observability]
                                      ├─ Prometheus / Grafana
                                        ├─ Loki / ELK
                                          └─ Sentry
```

### User-Facing Surfaces
- **User Web App (Frontend)**: Challenge browsing, in-browser IDE, user profiles, leaderboards, and community features
- **Author/Admin Dashboard**: Create and manage challenges, tests, hints, versions, and moderation tools
- **Judge/Grader Platform**: Secure sandboxed execution environment for compiling, running, and grading submissions across multiple chains (EVM, Solana, Move)

### Supporting Systems
- **Authentication & Identity**: SIWE (Sign-In with Ethereum) + OAuth integration
- **Persistence**: Postgres + Redis + ClickHouse for data storage and analytics
- **Storage**: IPFS for decentralized and scalable file storage
- **Messaging & Queue**: RabbitMQ for asynchronous processing
- **Orchestration**: Docker + optional Firecracker microVMs for containerization and scaling
- **Observability & Security**: Comprehensive monitoring, logging, and security measures

## 🗄️ Storage Architecture

Fathuss implements a comprehensive multi-tier storage architecture designed for scalability, performance, and reliability:

### Storage Layer Components

#### PostgreSQL (Port 5432) - Primary Database
**Purpose**: Structured data storage and relationships
- User profiles, challenges, submissions, marketplace items
- ACID compliance for transactional data
- Complex queries and full-text search

#### Redis (Port 6379) - Caching & Sessions
**Purpose**: High-performance caching and session management
- User sessions with automatic expiration
- API rate limiting counters
- Frequently accessed data caching

#### ClickHouse (Port 8123) - Analytics Database
**Purpose**: Real-time analytics and metrics aggregation
- User activity events and challenge completion metrics
- API usage statistics and file operation analytics
- Column-oriented storage for analytical queries

#### IPFS (Port 5001) - Decentralized File Storage
**Purpose**: Permanent, distributed file storage
- Challenge test cases, fixtures, and binaries
- User-uploaded content and static assets
- Content-addressed storage with global distribution

### Storage Service (Port 4007)
Central coordination service managing all storage operations:
- IPFS file upload/download orchestration
- Analytics data aggregation
- Cache management and session handling
- File metadata management

## 🌟 Features

- **Multi-Chain Support**: Deploy and run challenges on Ethereum, Polygon, Arbitrum, and more
- **CTF Challenges**: Interactive cybersecurity and smart contract vulnerability challenges
- **Learning Modules**: Structured courses and tutorials for Web3 development
- **Hiring Platform**: Connect talent with opportunities through skill-based assessments
- **Automated Grader**: Real-time evaluation of submissions with detailed feedback
- **Web3-Native**: Built for decentralized technologies with wallet integration

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- MetaMask or compatible Web3 wallet

### Installation

```bash
git clone https://github.com/Podamekalajagadeesh/Fathuss.git
cd Fathuss
npm install
npm run api:install  # Install API Gateway dependencies
```

### Environment Setup

Create a `.env.local` file in the root directory and add the following:

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_API_GATEWAY_URL=http://localhost:4000
```

Get your WalletConnect Project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/).

### Running the Platform

1. Install all dependencies:
```bash
npm install
npm run api:install
npm run services:install
```

2. Start the API Gateway:
```bash
npm run api:dev
```

3. In another terminal, start all services:
```bash
npm run services:dev
```

4. In a third terminal, start the frontend:
```bash
npm run dev
```

### Running with Docker

For a complete development environment with all services:

```bash
docker-compose up --build
```

This will start all services with their dependencies (PostgreSQL, Redis, ClickHouse, IPFS).

After starting the services, initialize the databases:

```bash
./init-databases.sh
```

## ☸️ Kubernetes Orchestration

Fathuss provides complete Kubernetes orchestration using Helm charts for production deployment.

### Prerequisites
- Kubernetes cluster (1.19+)
- Helm 3.0+
- kubectl configured to access your cluster

### Quick Deployment

1. Clone and navigate to the repository:
```bash
git clone https://github.com/Podamekalajagadeesh/Fathuss.git
cd Fathuss
```

2. Deploy using the provided script:
```bash
chmod +x deploy-k8s.sh
./deploy-k8s.sh
```

Or deploy manually:
```bash
# Add required Helm repositories
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Create namespace
kubectl create namespace fathuss

# Install Fathuss
helm install fathuss ./k8s/helm -n fathuss
```

### Helm Chart Features

- **Complete Service Deployment**: All microservices with proper health checks and resource limits
- **Database Management**: PostgreSQL, Redis, ClickHouse with persistent volumes
- **IPFS Integration**: Decentralized file storage with cluster networking
- **Ingress Configuration**: NGINX ingress with SSL termination
- **Network Policies**: Security policies for service communication
- **Horizontal Pod Autoscaling**: Auto-scaling based on CPU/memory usage
- **Secrets Management**: Secure configuration using Kubernetes secrets

### Customizing Deployment

Override default values:

```bash
helm install fathuss ./k8s/helm -n fathuss \
  --set apiGateway.replicas=3 \
  --set postgresql.persistence.size=50Gi \
  --set ingress.hosts[0]=api.yourdomain.com
```

### Monitoring Deployment

```bash
# Check deployment status
kubectl get all -n fathuss

# View logs
kubectl logs -f deployment/fathuss-api-gateway -n fathuss

# Port forward for local access
kubectl port-forward svc/fathuss-api-gateway 4000:4000 -n fathuss
```

### Service Ports (Kubernetes)
- **API Gateway**: 80/443 (via Ingress)
- **Frontend**: 80/443 (via Ingress)
- **IPFS Gateway**: ClusterIP service
- **Databases**: Internal cluster access only

### Production Considerations

- Configure external DNS for ingress hosts
- Set up SSL certificates (cert-manager recommended)
- Configure persistent volume storage classes
- Set up monitoring stack (Prometheus/Grafana)
- Configure backup strategies for databases
- Implement proper RBAC and network policies

### Service Ports
- **API Gateway**: 4000
- **User Service**: 4001
- **Challenge Service**: 4002
- **Leaderboard Service**: 4003
- **Marketplace Service**: 4004
- **Hiring Service**: 4005
- **Grader Orchestration**: 4006
- **Storage Service**: 4007
- **PostgreSQL**: 5432
- **Redis**: 6379
- **ClickHouse HTTP**: 8123
- **IPFS API**: 5001, **Gateway**: 8080

## 📚 Documentation

- [Getting Started Guide](./docs/getting-started.md)
- [Challenge Creation](./docs/challenge-creation.md)
- [API Reference](./docs/api.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🌐 Connect

- [Website](https://fathuss.com)
- [Discord](https://discord.gg/fathuss)
- [Twitter](https://twitter.com/fathuss)

---

*Empowering the next generation of Web3 developers through challenges and innovation.*