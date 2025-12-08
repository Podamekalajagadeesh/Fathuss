import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4004;
const prisma = new PrismaClient();

// Blockchain configuration
const PROVIDER_URL = process.env.PROVIDER_URL || 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID';
const MARKETPLACE_CONTRACT = process.env.MARKETPLACE_CONTRACT || '0x...';
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || '0x...';

// Revenue split configuration
const PLATFORM_FEE = 0.05; // 5% platform fee
const AUTHOR_SPLIT = 0.95; // 95% to author

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use(limiter);

// Auth middleware (simplified)
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  (req as any).user = { id: 'user-123', address: '0x...' };
  next();
};

// Revenue distribution functions
async function distributeRevenue(challengeId: string, paymentAmount: number, authorAddress: string) {
  try {
    const platformFee = paymentAmount * PLATFORM_FEE;
    const authorShare = paymentAmount * AUTHOR_SPLIT;

    // Store in database
    const revenueRecord = await prisma.revenueDistribution.create({
      data: {
        challengeId,
        totalPayment: paymentAmount,
        platformFee,
        authorShare,
        authorAddress,
        status: 'pending'
      }
    });

    // TODO: Trigger blockchain transaction for distribution
    // This would involve calling smart contract functions to transfer funds

    return { platformFee, authorShare, recordId: revenueRecord.id };
  } catch (error) {
    console.error('Error distributing revenue:', error);
    throw error;
  }
}

// Challenge access control
async function checkChallengeAccess(userId: string, challengeId: string) {
  // TODO: Check if user has purchased access to this challenge
  // This would involve checking purchase records in database
  return true; // Simplified for now
}

// Purchase challenge access
async function purchaseChallengeAccess(userId: string, challengeId: string, paymentTx: string) {
  try {
    // Verify payment transaction
    const paymentVerified = await verifyPayment(paymentTx);

    if (!paymentVerified) {
      throw new Error('Payment verification failed');
    }

    // Record purchase
    const purchaseRecord = {
      userId,
      challengeId,
      paymentTx,
      purchaseDate: new Date().toISOString(),
      accessGranted: true
    };

    // TODO: Store in database
    console.log('Challenge access purchased:', purchaseRecord);

    return purchaseRecord;
  } catch (error) {
    console.error('Error purchasing challenge access:', error);
    throw error;
  }
}

// Verify payment transaction
async function verifyPayment(txHash: string) {
  try {
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);

    // Get transaction details
    const tx = await provider.getTransaction(txHash);

    if (!tx) {
      return false;
    }

    // Verify transaction was sent to marketplace contract
    if (tx.to?.toLowerCase() !== MARKETPLACE_CONTRACT.toLowerCase()) {
      return false;
    }

    // Verify transaction was successful
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error verifying payment:', error);
    return false;
  }
}

// Get marketplace items
app.get('/marketplace/items', async (req, res) => {
  try {
    const { category, type, page = 1, limit = 20 } = req.query;

    // TODO: Fetch from database
    const items = [
      {
        id: '1',
        title: 'Premium Challenge Pack',
        description: 'Access to exclusive advanced challenges',
        type: 'subscription',
        category: 'challenges',
        price: 0.1, // ETH
        currency: 'ETH',
        seller: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        createdAt: new Date().toISOString(),
        expiresAt: null,
        isActive: true
      },
      {
        id: '2',
        title: 'Custom Challenge Creation',
        description: 'Commission a custom challenge for your needs',
        type: 'service',
        category: 'custom',
        price: 1.0,
        currency: 'ETH',
        seller: 'platform',
        createdAt: new Date().toISOString(),
        expiresAt: null,
        isActive: true
      },
      {
        id: '3',
        title: 'Mentorship Session',
        description: '1-on-1 mentoring with blockchain expert',
        type: 'service',
        category: 'mentoring',
        price: 0.5,
        currency: 'ETH',
        seller: '0x8ba1f109551bD432803012645ac136ddd64DBA72',
        createdAt: new Date().toISOString(),
        expiresAt: null,
        isActive: true
      }
    ];

    res.json({
      items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: items.length
      }
    });
  } catch (error) {
    console.error('Error fetching marketplace items:', error);
    res.status(500).json({ error: 'Failed to fetch marketplace items' });
  }
});

// Get specific item
app.get('/marketplace/items/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // TODO: Fetch from database
    const item = {
      id,
      title: 'Premium Challenge Pack',
      description: 'Access to exclusive advanced challenges for 30 days',
      type: 'subscription',
      category: 'challenges',
      price: 0.1,
      currency: 'ETH',
      seller: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      details: {
        duration: 30, // days
        challenges: ['Advanced DeFi', 'Security Audits', 'Layer 2 Solutions'],
        features: ['Priority support', 'Detailed solutions', 'Community access']
      },
      createdAt: new Date().toISOString(),
      isActive: true
    };

    res.json(item);
  } catch (error) {
    console.error('Error fetching marketplace item:', error);
    res.status(500).json({ error: 'Failed to fetch marketplace item' });
  }
});

// Purchase item
app.post('/marketplace/purchase/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod, transactionHash } = req.body;

    // TODO: Process payment and create purchase record
    const purchase = {
      id: 'purchase_' + Date.now(),
      itemId: id,
      buyer: (req as any).user.address,
      seller: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      price: 0.1,
      currency: 'ETH',
      transactionHash,
      status: 'completed',
      purchasedAt: new Date().toISOString()
    };

    res.json(purchase);
  } catch (error) {
    console.error('Error processing purchase:', error);
    res.status(500).json({ error: 'Failed to process purchase' });
  }
});

// User purchases
app.get('/marketplace/purchases', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    // TODO: Fetch from database
    const purchases = [
      {
        id: 'purchase_123',
        itemId: '1',
        itemTitle: 'Premium Challenge Pack',
        price: 0.1,
        currency: 'ETH',
        purchasedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active'
      }
    ];

    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// Create marketplace item (for sellers)
app.post('/marketplace/items', authenticateToken, async (req, res) => {
  try {
    const itemData = req.body;

    // TODO: Validate and save to database
    const newItem = {
      id: 'item_' + Date.now(),
      ...itemData,
      seller: (req as any).user.address,
      createdAt: new Date().toISOString(),
      isActive: true
    };

    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating marketplace item:', error);
    res.status(500).json({ error: 'Failed to create marketplace item' });
  }
});

// NFT marketplace integration
app.get('/marketplace/nfts', async (req, res) => {
  try {
    // TODO: Integrate with NFT marketplace
    const nfts = [
      {
        id: 'nft_1',
        name: 'Challenge Master Badge',
        description: 'Awarded for completing 10 challenges',
        image: 'https://example.com/badge.png',
        contract: '0x123...',
        tokenId: '1',
        price: 0.05,
        currency: 'ETH'
      }
    ];

    res.json(nfts);
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    res.status(500).json({ error: 'Failed to fetch NFTs' });
  }
});

// Purchase challenge access
app.post('/challenges/:challengeId/purchase', authenticateToken, async (req, res) => {
  try {
    const { challengeId } = req.params;
    const { paymentTx } = req.body;
    const userId = (req as any).user.id;

    // Purchase challenge access
    const purchase = await purchaseChallengeAccess(userId, challengeId, paymentTx);

    // Get challenge details to distribute revenue
    const challenge = await getChallengeDetails(challengeId);
    if (challenge && challenge.price) {
      await distributeRevenue(challengeId, challenge.price, challenge.authorAddress);
    }

    res.json({
      success: true,
      purchase,
      message: 'Challenge access purchased successfully'
    });
  } catch (error) {
    console.error('Error purchasing challenge:', error);
    res.status(500).json({ error: 'Failed to purchase challenge access' });
  }
});

// Check challenge access
app.get('/challenges/:challengeId/access', authenticateToken, async (req, res) => {
  try {
    const { challengeId } = req.params;
    const userId = (req as any).user.id;

    const hasAccess = await checkChallengeAccess(userId, challengeId);

    res.json({
      challengeId,
      userId,
      hasAccess,
      accessType: hasAccess ? 'purchased' : 'none'
    });
  } catch (error) {
    console.error('Error checking challenge access:', error);
    res.status(500).json({ error: 'Failed to check challenge access' });
  }
});

// Get revenue analytics for authors
app.get('/revenue/analytics', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { period = 'month' } = req.query;

    // TODO: Fetch from database
    const analytics = {
      totalEarnings: 2.5,
      platformFees: 0.125,
      authorShare: 2.375,
      challengesSold: 15,
      averagePrice: 0.167,
      topChallenges: [
        { id: 'challenge-1', title: 'DeFi Security', earnings: 0.8 },
        { id: 'challenge-2', title: 'Smart Contract Audit', earnings: 0.6 }
      ],
      period
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching revenue analytics:', error);
    res.status(500).json({ error: 'Failed to fetch revenue analytics' });
  }
});

// Get author's challenges with sales data
app.get('/author/challenges', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    // TODO: Fetch from database
    const challenges = [
      {
        id: 'challenge-1',
        title: 'DeFi Security Challenge',
        description: 'Advanced DeFi security testing',
        price: 0.2,
        currency: 'ETH',
        sales: 8,
        revenue: 1.6,
        rating: 4.8,
        status: 'active',
        createdAt: '2024-01-15T00:00:00Z'
      },
      {
        id: 'challenge-2',
        title: 'Smart Contract Audit Prep',
        description: 'Prepare for smart contract audits',
        price: 0.15,
        currency: 'ETH',
        sales: 7,
        revenue: 1.05,
        rating: 4.9,
        status: 'active',
        createdAt: '2024-02-01T00:00:00Z'
      }
    ];

    res.json({ challenges });
  } catch (error) {
    console.error('Error fetching author challenges:', error);
    res.status(500).json({ error: 'Failed to fetch author challenges' });
  }
});

// Withdraw earnings
app.post('/revenue/withdraw', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { amount, currency = 'ETH', destinationAddress } = req.body;

    // TODO: Process withdrawal through smart contract
    const withdrawal = {
      id: 'withdrawal_' + Date.now(),
      userId,
      amount,
      currency,
      destinationAddress,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    // TODO: Store in database and trigger blockchain transaction

    res.json({
      success: true,
      withdrawal,
      message: 'Withdrawal request submitted successfully'
    });
  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

// Helper function to get challenge details
async function getChallengeDetails(challengeId: string) {
  // TODO: Fetch from database or challenge service
  return {
    id: challengeId,
    price: 0.2,
    authorAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
  };
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'marketplace-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Marketplace Service running on port ${PORT}`);
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