# Fathuss User Service

Manages user profiles, XP, badges, wallet linkages, certification NFTs, solve history, reputation, and streaks.

## Features

- **User Profiles**: Complete user management with profiles, avatars, bios
- **XP & Levels**: Experience points system with automatic level calculation
- **Badges**: Achievement system with unlockable badges
- **Wallet Linkages**: Support for multiple wallet addresses across chains
- **Certification NFTs**: NFT-based certifications with metadata
- **Solve History**: Complete submission tracking and statistics
- **Reputation System**: User reputation scoring
- **Streaks**: Current and longest solve streaks tracking

## API Endpoints

### User Profiles

#### Get User Profile
```http
GET /users/:address
```
Returns complete user profile with all associated data.

#### Update User Profile
```http
PUT /users/:address
Content-Type: application/json

{
  "username": "new_username",
  "email": "user@example.com",
  "avatarUrl": "https://...",
  "bio": "User bio"
}
```

### Statistics & Analytics

#### Get User Statistics
```http
GET /users/:address/stats
```
Returns comprehensive user statistics including:
- Total submissions and success rate
- Average score and favorite language
- Current/longest streaks
- Recent submission history

#### Get User Rank
```http
GET /users/:address/rank
```
Returns user's leaderboard position and nearby competitors.

#### Get Solve History
```http
GET /users/:address/solves?page=1&limit=20
```
Returns paginated list of successful challenge solves.

### Wallet Management

#### Link Additional Wallet
```http
POST /users/:address/wallets
Content-Type: application/json

{
  "walletAddress": "0x...",
  "chainId": 1,
  "isPrimary": false
}
```

### Badges & Achievements

#### Get User Badges
```http
GET /users/:address/badges
```
Returns all badges earned by the user.

#### Award Badge
```http
POST /users/:address/badges
Content-Type: application/json

{
  "badgeId": "badge-uuid"
}
```

### Certifications

#### Get User Certifications
```http
GET /users/:address/certifications
```
Returns all NFT certifications owned by the user.

#### Add Certification
```http
POST /users/:address/certifications
Content-Type: application/json

{
  "title": "Solidity Expert",
  "description": "Certified Solidity developer",
  "issuer": "Fathuss",
  "nftContract": "0x...",
  "tokenId": "123",
  "metadataUrl": "ipfs://...",
  "issuedAt": "2024-01-01T00:00:00Z",
  "expiresAt": "2025-01-01T00:00:00Z",
  "verificationUrl": "https://verify.fathuss.com/..."
}
```

### Progress Tracking

#### Update User Progress
```http
POST /users/:address/progress
Content-Type: application/json

{
  "xpGained": 100,
  "challengeCompleted": {
    "score": 95
  },
  "streakUpdate": {
    "extend": true,
    "currentStreak": 5,
    "currentLongest": 10
  }
}
```

#### Update User Reputation
```http
POST /users/:address/reputation
Content-Type: application/json

{
  "change": 10,
  "reason": "Helpful answer on forum"
}
```

### Health Check

#### Service Health
```http
GET /health
```
Returns service health status and database connectivity.

## Database Schema

Uses Prisma ORM with PostgreSQL. Key models:

- **User**: Core user data, XP, streaks, reputation
- **LinkedWallet**: Multiple wallet support
- **Badge/UserBadge**: Achievement system
- **Certification**: NFT certifications
- **Submission**: Solve history and statistics

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up database:
```bash
npm run db:push
```

3. Generate Prisma client:
```bash
npm run db:generate
```

4. Run in development:
```bash
npm run dev
```

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `PORT`: Service port (default: 4001)

## Authentication

Currently uses simplified JWT validation. In production, integrates with API Gateway JWT tokens.</content>
<parameter name="filePath">/workspaces/Fathuss/services/user-service/README.md