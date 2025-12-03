import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4003;

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

// Global leaderboard
app.get('/leaderboard/global', async (req, res) => {
  try {
    const { timeframe = 'all', limit = 50 } = req.query;

    // TODO: Fetch from database/cache
    const leaderboard = [
      {
        rank: 1,
        address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        username: 'crypto_master',
        totalPoints: 2500,
        challengesCompleted: 25,
        winRate: 0.92,
        lastActive: new Date().toISOString()
      },
      {
        rank: 2,
        address: '0x8ba1f109551bD432803012645ac136ddd64DBA72',
        username: 'blockchain_ninja',
        totalPoints: 2350,
        challengesCompleted: 22,
        winRate: 0.89,
        lastActive: new Date().toISOString()
      },
      {
        rank: 3,
        address: '0x1234567890123456789012345678901234567890',
        username: 'smart_contract_wizard',
        totalPoints: 2100,
        challengesCompleted: 20,
        winRate: 0.85,
        lastActive: new Date().toISOString()
      }
    ];

    res.json({
      timeframe,
      leaderboard: leaderboard.slice(0, Number(limit)),
      total: leaderboard.length
    });
  } catch (error) {
    console.error('Error fetching global leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Challenge-specific leaderboard
app.get('/leaderboard/challenges/:challengeId', async (req, res) => {
  try {
    const { challengeId } = req.params;
    const { limit = 20 } = req.query;

    // TODO: Fetch from database
    const leaderboard = [
      {
        rank: 1,
        address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        username: 'crypto_master',
        score: 100,
        timeTaken: 450, // seconds
        submittedAt: new Date().toISOString()
      },
      {
        rank: 2,
        address: '0x8ba1f109551bD432803012645ac136ddd64DBA72',
        username: 'blockchain_ninja',
        score: 95,
        timeTaken: 520,
        submittedAt: new Date().toISOString()
      }
    ];

    res.json({
      challengeId,
      leaderboard: leaderboard.slice(0, Number(limit))
    });
  } catch (error) {
    console.error('Error fetching challenge leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch challenge leaderboard' });
  }
});

// User rank and stats
app.get('/leaderboard/user/:address', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;

    // TODO: Calculate from database
    const userStats = {
      address,
      globalRank: 15,
      totalPoints: 1200,
      challengesCompleted: 12,
      winRate: 0.75,
      averageScore: 82,
      bestStreak: 5,
      currentStreak: 2,
      categoryRanks: {
        'Smart Contracts': 8,
        'Security': 22,
        'DeFi': 15
      }
    };

    res.json(userStats);
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

// Category leaderboard
app.get('/leaderboard/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 30 } = req.query;

    // TODO: Fetch from database
    const leaderboard = [
      {
        rank: 1,
        address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        username: 'crypto_master',
        points: 800,
        challengesCompleted: 8
      }
    ];

    res.json({
      category,
      leaderboard: leaderboard.slice(0, Number(limit))
    });
  } catch (error) {
    console.error('Error fetching category leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch category leaderboard' });
  }
});

// Update leaderboard (called by challenge service after grading)
app.post('/leaderboard/update', async (req, res) => {
  try {
    const { userId, challengeId, score, points } = req.body;

    // TODO: Update database and cache
    // This would be called internally by other services

    res.json({ success: true, message: 'Leaderboard updated' });
  } catch (error) {
    console.error('Error updating leaderboard:', error);
    res.status(500).json({ error: 'Failed to update leaderboard' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'leaderboard-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Leaderboard Service running on port ${PORT}`);
});