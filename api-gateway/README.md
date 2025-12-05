# Fathuss API Gateway

Node.js/TypeScript API Gateway with SIWE Authentication

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env` and configure:
   ```bash
   cp .env .env.local
   ```

3. Run in development:
   ```bash
   npm run dev
   ```

4. Build and run:
   ```bash
   npm run build
   npm start
   ```

## Endpoints

- `POST /auth/verify` - Verify SIWE signature and get JWT
- `GET /protected` - Protected route example
- `GET /health` - Health check
- `POST /graphql` - GraphQL endpoint
- `GET /challenges` - Get challenges
- `POST /submit` - Submit challenge

## Authentication

Uses Sign-In with Ethereum (SIWE) for authentication. Clients must:
1. Create SIWE message
2. Get signature from wallet
3. Send to `/auth/verify` to get JWT
4. Include JWT in Authorization header for protected routes