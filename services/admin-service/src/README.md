# Admin Service

The Admin Service provides administrative functionality for the Fathuss platform, including moderation, challenge review, and IPFS content management.

## Features

### 🎯 Challenge Moderation
- **Review Pipeline**: Comprehensive challenge submission review process
- **Quality Control**: Ensure challenges meet platform standards
- **Content Moderation**: Review and approve/reject challenge submissions
- **Feedback System**: Provide detailed feedback to challenge authors

### 📦 IPFS Content Management
- **Content Pinning**: Pin approved challenges and assets to IPFS
- **Storage Management**: Monitor and manage IPFS storage usage
- **Content Verification**: Verify content integrity and availability
- **Bulk Operations**: Efficient bulk pinning/unpinning operations

### 👥 User Moderation
- **Report Management**: Handle user reports and complaints
- **Moderation Actions**: Warn, suspend, or ban problematic users
- **Audit Trail**: Complete logging of all moderation actions
- **Escalation Process**: Handle complex moderation cases

### 📊 Analytics & Monitoring
- **Platform Metrics**: Comprehensive platform health monitoring
- **Challenge Analytics**: Track challenge submission and approval rates
- **User Behavior**: Monitor user activity and engagement
- **System Health**: Real-time service status and performance

## API Endpoints

### Challenge Moderation

#### `GET /challenges/pending`
Fetch challenges awaiting review.
```json
{
  "challenges": [
    {
      "id": "challenge_123",
      "title": "Advanced DeFi Protocol Audit",
      "author": "0x742d...",
      "difficulty": "expert",
      "status": "pending_review",
      "submittedAt": "2024-12-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 23
  }
}
```

#### `POST /challenges/:challengeId/review`
Review and approve/reject a challenge.
```json
{
  "action": "approve",
  "feedback": "Excellent challenge with clear requirements",
  "reason": null
}
```

#### `POST /challenges/bulk-review`
Bulk review multiple challenges.
```json
{
  "challengeIds": ["challenge_123", "challenge_124"],
  "action": "approve",
  "feedback": "Batch approval for quality challenges"
}
```

### IPFS Management

#### `POST /ipfs/pin/:hash`
Pin content to IPFS.
```json
{
  "name": "challenge_assets",
  "metadata": {
    "challengeId": "challenge_123",
    "type": "test_cases"
  }
}
```

#### `DELETE /ipfs/pin/:hash`
Unpin content from IPFS.

#### `GET /ipfs/pin/:hash`
Check IPFS pin status.
```json
{
  "hash": "Qm...",
  "isPinned": true,
  "pins": [
    {
      "type": "recursive",
      "metadata": { "challengeId": "challenge_123" }
    }
  ]
}
```

### User Moderation

#### `GET /users/reports`
Fetch user reports for moderation.
```json
{
  "reports": [
    {
      "id": "report_123",
      "reportedUser": "0x742d...",
      "reason": "plagiarism",
      "status": "pending",
      "createdAt": "2024-12-01T00:00:00Z"
    }
  ]
}
```

#### `POST /users/reports/:reportId/action`
Execute moderation action on reported user.
```json
{
  "action": "suspend",
  "penalty": "temporary",
  "duration": 7,
  "reason": "Violation of plagiarism policy"
}
```

### Analytics & Monitoring

#### `GET /analytics/challenges`
Get challenge analytics and statistics.
```json
{
  "totalChallenges": 1250,
  "pendingReview": 23,
  "approved": 1187,
  "byDifficulty": {
    "beginner": 320,
    "intermediate": 450,
    "advanced": 380,
    "expert": 100
  },
  "averageReviewTime": 2.3
}
```

#### `GET /system/health`
Get comprehensive system health status.
```json
{
  "services": {
    "grader": { "status": "healthy", "responseTime": 45 },
    "marketplace": { "status": "healthy", "responseTime": 32 }
  },
  "database": {
    "status": "healthy",
    "connections": 12
  },
  "ipfs": {
    "status": "healthy",
    "peers": 25,
    "pinnedItems": 1250
  }
}
```

## Security & Access Control

### Authentication
- JWT-based authentication required for all endpoints
- Admin-only access with role verification
- Request logging and audit trails

### Authorization
- Admin role verification for all operations
- Granular permissions for different admin actions
- Multi-admin approval for critical operations

### Data Protection
- Encrypted sensitive user data
- Secure IPFS authentication
- Rate limiting on admin endpoints

## Configuration

Environment variables:
- `PORT`: Service port (default: 4007)
- `IPFS_URL`: IPFS API endpoint
- `IPFS_PROJECT_ID`: IPFS project credentials
- `IPFS_PROJECT_SECRET`: IPFS project secret
- `ADMIN_ADDRESSES`: Comma-separated list of admin wallet addresses

## Moderation Workflow

### Challenge Review Process
1. **Submission**: Author submits challenge
2. **Initial Review**: Automated checks (plagiarism, quality)
3. **Admin Review**: Manual review by admin team
4. **Feedback**: Detailed feedback provided to author
5. **Revision**: Author can revise and resubmit
6. **Approval**: Challenge published and pinned to IPFS

### User Moderation Process
1. **Report**: User reports problematic behavior
2. **Investigation**: Admin reviews evidence
3. **Action**: Appropriate moderation action taken
4. **Notification**: User notified of action and reasoning
5. **Appeal**: Process for appealing moderation decisions

## IPFS Integration

### Content Pinning Strategy
- **Challenge Assets**: Test cases, solutions, metadata
- **User Content**: Profile images, certificates
- **Platform Assets**: Templates, documentation
- **Backup Strategy**: Multiple pinning services for redundancy

### Storage Optimization
- **Deduplication**: Avoid duplicate content pinning
- **Compression**: Compress content before pinning
- **Cleanup**: Regular cleanup of unused pinned content
- **Monitoring**: Track storage usage and costs

## Monitoring & Alerting

### Key Metrics
- Challenge approval/rejection rates
- Average review times
- IPFS storage utilization
- User report volume
- System uptime and performance

### Alerts
- High volume of pending reviews
- IPFS pinning failures
- System service degradation
- Security incidents

## Integration Points

### Service Dependencies
- **Challenge Service**: Challenge submission and management
- **User Service**: User profile and authentication
- **Storage Service**: File storage and CDN
- **Marketplace Service**: Challenge monetization

### External Services
- **IPFS Network**: Decentralized content storage
- **Blockchain**: Smart contract interactions
- **Email Service**: Notification delivery
- **Monitoring Tools**: System health tracking</content>
<parameter name="filePath">/workspaces/Fathuss/services/admin-service/README.md