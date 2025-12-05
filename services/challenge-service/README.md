# Fathuss Challenge Service

Manages canonical challenge metadata, versions, tags, difficulty levels, IPFS fixtures, and test manifests. Provides author dashboard functionality for publishing and retiring challenge versions.

## Features

- **Challenge Management**: Create, update, and manage coding challenges
- **Version Control**: Full version history with publishing/retirement workflow
- **IPFS Integration**: Store test fixtures and assets on IPFS
- **Test Manifests**: Comprehensive test case management with multiple languages
- **Author Dashboard**: Tools for content creators to manage challenges
- **Submission System**: Handle user code submissions and grading
- **Tagging System**: Categorize challenges by difficulty, language, concepts

## API Endpoints

### Public Endpoints

#### Get Challenges
```http
GET /challenges?category=smart-contracts&difficulty=beginner&page=1&limit=10&search=storage
```
Returns paginated list of published challenges with filtering options.

#### Get Challenge Details
```http
GET /challenges/:id
```
Returns complete challenge details including published version, hints, and test cases.

#### Submit Solution
```http
POST /challenges/:id/submit
Content-Type: application/json

{
  "code": "contract MyContract { ... }",
  "language": "solidity"
}
```

#### Get Submission Status
```http
GET /submissions/:submissionId
```

#### Get User Submissions for Challenge
```http
GET /challenges/:id/submissions?page=1&limit=10
```

### Author Dashboard Endpoints

#### Create Challenge
```http
POST /challenges
Content-Type: application/json

{
  "title": "Simple Storage Contract",
  "description": "Create a basic storage contract",
  "category": "Smart Contracts",
  "difficulty": "beginner",
  "points": 100,
  "timeLimit": 30,
  "tags": ["solidity", "storage", "basic"]
}
```

#### Update Challenge Metadata
```http
PUT /challenges/:id
Content-Type: application/json

{
  "title": "Updated Title",
  "points": 150
}
```

#### Create Challenge Version
```http
POST /challenges/:id/versions
Content-Type: application/json

{
  "title": "Version 1",
  "description": "Initial version",
  "starterCode": "// Write your contract here",
  "hints": [
    { "content": "Use state variables", "cost": 10 },
    { "content": "Implement getter/setter functions", "cost": 20 }
  ],
  "testManifest": {
    "language": "solidity",
    "framework": "hardhat",
    "testRunner": "mocha",
    "timeout": 30,
    "setupCommands": ["npm install"],
    "testCases": [
      {
        "name": "Store value",
        "input": { "method": "store", "args": [42] },
        "expectedOutput": { "storedValue": 42 },
        "isPublic": true,
        "points": 1
      }
    ]
  },
  "fixtures": [
    {
      "name": "test-helpers.js",
      "type": "fixture",
      "ipfsHash": "Qm...",
      "fileSize": 1024,
      "mimeType": "application/javascript"
    }
  ]
}
```

#### Publish Version
```http
POST /challenges/:id/versions/:versionId/publish
```
Makes a version live for users (unpublishes previous versions).

#### Retire Version
```http
POST /challenges/:id/versions/:versionId/retire
```
Retires a version (prevents new submissions).

#### Get Challenge Versions
```http
GET /challenges/:id/versions
```
Returns all versions of a challenge (author only).

#### Get Version Details
```http
GET /challenges/:id/versions/:versionId
```
Returns complete version details including test manifest and fixtures.

### IPFS Integration

#### Upload Fixture
```http
POST /fixtures/upload
Content-Type: application/json

{
  "file": "base64-encoded-file",
  "name": "test-file.js",
  "type": "fixture",
  "description": "Helper functions for testing"
}
```

#### Download Fixture
```http
GET /fixtures/:ipfsHash
```

## Database Schema

Uses Prisma ORM with PostgreSQL:

- **Challenge**: Core challenge metadata
- **ChallengeVersion**: Versioned challenge content
- **ChallengeHint**: Ordered hints with XP costs
- **TestManifest**: Test configuration and runner setup
- **TestCase**: Individual test cases with inputs/outputs
- **ChallengeFixture**: IPFS-stored test files and assets
- **Submission**: User code submissions and results

## Version Management

Challenges support full version control:

1. **Draft**: Unsaved changes during creation
2. **Unpublished**: Saved but not visible to users
3. **Published**: Live version (only one can be published at a time)
4. **Retired**: No longer accepting submissions

Authors can create multiple versions and promote them through the lifecycle.

## IPFS Storage

Test fixtures and assets are stored on IPFS:

- **Test Cases**: Input/output data files
- **Helper Libraries**: Reusable testing utilities
- **Sample Solutions**: Reference implementations
- **Documentation**: Additional challenge resources

## Test Manifest System

Comprehensive testing framework:

- **Multi-language Support**: Solidity, Rust, JavaScript, Python, etc.
- **Framework Integration**: Hardhat, Foundry, Cargo, Jest, etc.
- **Custom Test Runners**: Configurable execution environments
- **Setup/Teardown**: Pre/post-test commands
- **Environment Variables**: Configurable test contexts

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
- `IPFS_API_URL`: IPFS API endpoint (default: http://localhost:5001/api/v0)
- `PORT`: Service port (default: 4002)

## Authentication

Integrates with API Gateway JWT tokens. Author endpoints require appropriate permissions.

## Testing

```bash
npm test
```

Includes basic health checks and endpoint validation tests.</content>
<parameter name="filePath">/workspaces/Fathuss/services/challenge-service/README.md