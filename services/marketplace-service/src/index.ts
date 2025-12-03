import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4004;

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'marketplace-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Marketplace Service running on port ${PORT}`);
});