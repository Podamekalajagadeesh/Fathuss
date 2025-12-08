import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import axios from 'axios';
import { create as createIPFS } from 'ipfs-http-client';
import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4007;
const prisma = new PrismaClient();

// IPFS configuration
const IPFS_URL = process.env.IPFS_URL || 'https://ipfs.infura.io:5001';
const IPFS_PROJECT_ID = process.env.IPFS_PROJECT_ID;
const IPFS_PROJECT_SECRET = process.env.IPFS_PROJECT_SECRET;

// Smart contract configuration
const PROVIDER_URL = process.env.PROVIDER_URL || 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID';
const CHALLENGE_CONTRACT_ADDRESS = process.env.CHALLENGE_CONTRACT_ADDRESS || '0x...';
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;

// Admin configuration
const ADMIN_ADDRESSES = (process.env.ADMIN_ADDRESSES || '').split(',');

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting - stricter for admin endpoints
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50 // Lower limit for admin actions
});
app.use(limiter);

// Auth middleware
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  (req as any).user = { id: 'admin-user', address: '0x...', isAdmin: true };
  next();
};

// Admin-only middleware
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Initialize IPFS client
let ipfsClient: any;
try {
  ipfsClient = createIPFS({
    url: IPFS_URL,
    headers: {
      authorization: `Basic ${Buffer.from(`${IPFS_PROJECT_ID}:${IPFS_PROJECT_SECRET}`).toString('base64')}`
    }
  });
} catch (error) {
  console.error('Failed to initialize IPFS client:', error);
}

// Initialize blockchain provider and signer
let provider: ethers.Provider;
let signer: ethers.Signer;

async function initBlockchain() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    if (ADMIN_PRIVATE_KEY) {
      const wallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
      signer = wallet;
    }
  }
}

// Challenge contract ABI (simplified)
const CHALLENGE_CONTRACT_ABI = [
  "function addChallenge(string memory ipfsHash, address author) external",
  "function updateChallengeStatus(uint256 challengeId, uint8 status) external"
];

// Function to pin challenge to IPFS and update smart contract
async function approveAndDeployChallenge(challengeId: string, challengeData: any) {
  try {
    // Pin challenge data to IPFS
    const challengeContent = JSON.stringify({
      id: challengeId,
      title: challengeData.title,
      description: challengeData.description,
      difficulty: challengeData.difficulty,
      author: challengeData.author,
      approvedAt: new Date().toISOString()
    });

    const ipfsResult = await ipfsClient.add(challengeContent);
    const ipfsHash = ipfsResult.cid.toString();

    // Pin the hash for permanence
    await ipfsClient.pin.add(ipfsHash);

    // Update smart contract
    await initBlockchain();
    if (!signer) {
      throw new Error('Blockchain signer not configured');
    }

    const contract = new ethers.Contract(CHALLENGE_CONTRACT_ADDRESS, CHALLENGE_CONTRACT_ABI, signer);
    
    // Add challenge to contract
    const tx = await contract.addChallenge(ipfsHash, challengeData.author);
    await tx.wait();

    return { ipfsHash, transactionHash: tx.hash };
  } catch (error) {
    console.error('Error deploying challenge:', error);
    throw error;
  }
}

// Challenge moderation endpoints
app.get('/challenges/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    // For now, return mock data - in production, fetch from challenge-service database
    const pendingChallenges = [
      {
        id: 'challenge_123',
        title: 'Advanced DeFi Protocol Audit',
        author: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        description: 'Comprehensive audit of a DeFi lending protocol',
        difficulty: 'expert',
        tags: ['defi', 'security', 'audit'],
        submittedAt: '2024-12-01T00:00:00Z',
        status: 'pending_review',
        code: 'pragma solidity ^0.8.0; contract DeFiProtocol { ... }'
      },
      {
        id: 'challenge_124',
        title: 'Smart Contract Optimization',
        author: '0x742d35Cc6634C0532925a3b844Bc454e4438f44f',
        description: 'Optimize gas usage in existing smart contracts',
        difficulty: 'medium',
        tags: ['optimization', 'gas', 'efficiency'],
        submittedAt: '2024-12-02T00:00:00Z',
        status: 'pending_review',
        code: 'pragma solidity ^0.8.0; contract OptimizedContract { ... }'
      }
    ];

    const total = pendingChallenges.length;
    const startIndex = (Number(page) - 1) * Number(limit);
    const paginatedChallenges = pendingChallenges.slice(startIndex, startIndex + Number(limit));

    res.json({
      challenges: paginatedChallenges,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching pending challenges:', error);
    res.status(500).json({ error: 'Failed to fetch pending challenges' });
  }
});
        contentHash: 'Qm...'
      },
      {
        id: 'challenge_124',
        title: 'Smart Contract Optimization',
        author: '0x8ba1f109551bD432803012645ac136ddd64DBA72',
        description: 'Optimize gas usage in existing smart contracts',
        difficulty: 'intermediate',
        tags: ['optimization', 'gas', 'solidity'],
        submittedAt: '2024-12-02T00:00:00Z',
        status: 'pending_review',
        contentHash: 'Qm...'
      }
    ];

    res.json({
      challenges: pendingChallenges,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: pendingChallenges.length
      }
    });
  } catch (error) {
    console.error('Error fetching pending challenges:', error);
    res.status(500).json({ error: 'Failed to fetch pending challenges' });
  }
});

// Review challenge
app.post('/challenges/:challengeId/review', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { challengeId } = req.params;
    const { action, feedback, reason } = req.body;
    const adminId = (req as any).user.id;

    // Validate action
    if (!['approve', 'reject', 'request_changes'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const review = {
      challengeId,
      adminId,
      action,
      feedback,
      reason,
      reviewedAt: new Date().toISOString()
    };

    // Store review in database
    await prisma.challengeReview.create({
      data: {
        challengeId,
        adminId,
        action,
        feedback,
        reason
      }
    });

    // TODO: Update challenge status in challenge-service database
    // TODO: Notify author of review result via email/notification service
    if (action === 'approve') {
      try {
        // For now, use mock data - in production, fetch from challenge-service
        const challengeData = {
          title: 'Challenge Title',
          description: 'Challenge Description',
          difficulty: 'medium',
          author: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
        };

        // Pin to IPFS and update smart contract
        const deployment = await approveAndDeployChallenge(challengeId, challengeData);
        console.log('Challenge deployed:', deployment);
      } catch (error) {
        console.error('Failed to deploy challenge:', error);
        return res.status(500).json({ error: 'Failed to deploy challenge to blockchain' });
      }
    }

    console.log('Challenge review submitted:', review);

    res.json({
      success: true,
      review,
      message: `Challenge ${action}d successfully`
    });
  } catch (error) {
    console.error('Error reviewing challenge:', error);
    res.status(500).json({ error: 'Failed to review challenge' });
  }
});

// IPFS pinning management
app.post('/ipfs/pin/:hash', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { hash } = req.params;
    const { name, metadata } = req.body;

    if (!ipfsClient) {
      return res.status(503).json({ error: 'IPFS client not available' });
    }

    // Pin the content
    const pinResult = await ipfsClient.pin.add(hash);

    // Record pinning in database
    const pinRecord = {
      hash,
      name: name || `pinned_${Date.now()}`,
      metadata,
      pinnedAt: new Date().toISOString(),
      pinnedBy: (req as any).user.id,
      pinResult
    };

    // Store pin record in database
    await prisma.iPFSPin.create({
      data: {
        hash,
        pinnedBy: (req as any).user.id
      }
    });

    console.log('Content pinned to IPFS:', pinRecord);

    res.json({
      success: true,
      pin: pinRecord,
      message: 'Content pinned successfully'
    });
  } catch (error) {
    console.error('Error pinning to IPFS:', error);
    res.status(500).json({ error: 'Failed to pin content to IPFS' });
  }
});

// Unpin from IPFS
app.delete('/ipfs/pin/:hash', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { hash } = req.params;

    if (!ipfsClient) {
      return res.status(503).json({ error: 'IPFS client not available' });
    }

    // Unpin the content
    await ipfsClient.pin.rm(hash);

    // Update database record
    const unpinRecord = {
      hash,
      unpinnedAt: new Date().toISOString(),
      unpinnedBy: (req as any).user.id
    };

    // TODO: Update pin record in database

    console.log('Content unpinned from IPFS:', unpinRecord);

    res.json({
      success: true,
      message: 'Content unpinned successfully'
    });
  } catch (error) {
    console.error('Error unpinning from IPFS:', error);
    res.status(500).json({ error: 'Failed to unpin content from IPFS' });
  }
});

// Get IPFS pin status
app.get('/ipfs/pin/:hash', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { hash } = req.params;

    if (!ipfsClient) {
      return res.status(503).json({ error: 'IPFS client not available' });
    }

    // Check pin status
    const pins = await ipfsClient.pin.ls({ paths: [hash] });
    const isPinned = pins.length > 0;

    res.json({
      hash,
      isPinned,
      pins: pins.map((pin: any) => ({
        type: pin.type,
        metadata: pin.metadata
      }))
    });
  } catch (error) {
    console.error('Error checking IPFS pin status:', error);
    res.status(500).json({ error: 'Failed to check pin status' });
  }
});

// User moderation endpoints
app.get('/users/reports', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;

    // TODO: Fetch user reports from database
    const reports = [
      {
        id: 'report_123',
        reportedUser: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        reportedBy: '0x8ba1f109551bD432803012645ac136ddd64DBA72',
        reason: 'plagiarism',
        description: 'User submitted plagiarized code',
        evidence: ['submission_456', 'original_source_789'],
        status: 'pending',
        createdAt: '2024-12-01T00:00:00Z'
      }
    ];

    res.json({
      reports,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: reports.length
      }
    });
  } catch (error) {
    console.error('Error fetching user reports:', error);
    res.status(500).json({ error: 'Failed to fetch user reports' });
  }
});

// Handle user report
app.post('/users/reports/:reportId/action', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action, penalty, duration, reason } = req.body;
    const adminId = (req as any).user.id;

    // Validate action
    if (!['dismiss', 'warn', 'suspend', 'ban'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const moderationAction = {
      reportId,
      adminId,
      action,
      penalty,
      duration, // in days for suspensions
      reason,
      executedAt: new Date().toISOString()
    };

    // TODO: Execute moderation action
    // TODO: Update user status in database
    // TODO: Notify user of action
    // TODO: Log moderation action

    console.log('Moderation action executed:', moderationAction);

    res.json({
      success: true,
      action: moderationAction,
      message: `Moderation action '${action}' executed successfully`
    });
  } catch (error) {
    console.error('Error executing moderation action:', error);
    res.status(500).json({ error: 'Failed to execute moderation action' });
  }
});

// Challenge statistics and analytics
app.get('/analytics/challenges', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    // TODO: Fetch analytics from database
    const analytics = {
      totalChallenges: 1250,
      pendingReview: 23,
      approved: 1187,
      rejected: 40,
      byDifficulty: {
        beginner: 320,
        intermediate: 450,
        advanced: 380,
        expert: 100
      },
      byCategory: {
        defi: 340,
        security: 280,
        gaming: 180,
        infrastructure: 250,
        other: 200
      },
      averageReviewTime: 2.3, // days
      topAuthors: [
        { address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', challenges: 45, rating: 4.8 },
        { address: '0x8ba1f109551bD432803012645ac136ddd64DBA72', challenges: 38, rating: 4.9 }
      ],
      period
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching challenge analytics:', error);
    res.status(500).json({ error: 'Failed to fetch challenge analytics' });
  }
});

// Platform health and metrics
app.get('/system/health', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // TODO: Gather actual system metrics
    const health = {
      services: {
        grader: { status: 'healthy', responseTime: 45 },
        marketplace: { status: 'healthy', responseTime: 32 },
        hiring: { status: 'healthy', responseTime: 28 },
        storage: { status: 'healthy', responseTime: 67 }
      },
      database: {
        status: 'healthy',
        connections: 12,
        queryTime: 23
      },
      blockchain: {
        status: 'healthy',
        blockNumber: 18500000,
        gasPrice: '20000000000'
      },
      ipfs: {
        status: ipfsClient ? 'healthy' : 'unavailable',
        peers: 25,
        pinnedItems: 1250
      },
      timestamp: new Date().toISOString()
    };

    res.json(health);
  } catch (error) {
    console.error('Error fetching system health:', error);
    res.status(500).json({ error: 'Failed to fetch system health' });
  }
});

// Bulk operations
app.post('/challenges/bulk-review', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { challengeIds, action, feedback } = req.body;
    const adminId = (req as any).user.id;

    if (!Array.isArray(challengeIds)) {
      return res.status(400).json({ error: 'challengeIds must be an array' });
    }

    const results = [];

    for (const challengeId of challengeIds) {
      try {
        // TODO: Apply review action to each challenge
        const review = {
          challengeId,
          adminId,
          action,
          feedback,
          reviewedAt: new Date().toISOString()
        };

        results.push({ challengeId, success: true, review });
      } catch (error) {
        results.push({ challengeId, success: false, error: (error as Error).message });
      }
    }

    res.json({
      success: true,
      results,
      summary: {
        total: challengeIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    });
  } catch (error) {
    console.error('Error performing bulk review:', error);
    res.status(500).json({ error: 'Failed to perform bulk review' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'admin-service',
    timestamp: new Date().toISOString(),
    ipfs: ipfsClient ? 'connected' : 'disconnected'
  });
});

app.listen(PORT, () => {
  console.log(`Admin Service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

export default app;