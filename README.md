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
                                  └─ IPFS / S3 (fixtures, testcases, challenge binaries)

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
- **Storage**: IPFS / S3 for decentralized and scalable file storage
- **Messaging & Queue**: Kafka or RabbitMQ for asynchronous processing
- **Orchestration**: Kubernetes + Docker + optional Firecracker microVMs for containerization and scaling
- **Observability & Security**: Comprehensive monitoring, logging, and security measures

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
```

### Environment Setup

Create a `.env.local` file in the root directory and add the following:

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_API_GATEWAY_URL=http://localhost:4000
```

Get your WalletConnect Project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/).

### Running the Platform

```bash
npm run dev
```

Visit `http://localhost:3000` to access the platform.

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