import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4001;

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

// Auth middleware (simplified - would integrate with API Gateway JWT)
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // In production, verify JWT from API Gateway
  // For now, just check if token exists
  (req as any).user = { id: 'user-123', address: '0x...' };
  next();
};

// User profile endpoints
app.get('/users/:address', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;

    // TODO: Fetch from database
    const user = {
      address,
      username: `user_${address.slice(-6)}`,
      level: 1,
      xp: 150,
      challengesCompleted: 5,
      joinedAt: new Date().toISOString()
    };

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.put('/users/:address', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const updates = req.body;

    // TODO: Update user in database
    const updatedUser = {
      address,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// User stats
app.get('/users/:address/stats', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;

    // TODO: Calculate from database
    const stats = {
      totalChallenges: 25,
      completedChallenges: 5,
      successRate: 0.2,
      averageScore: 75,
      favoriteCategory: 'Smart Contracts',
      streak: 2
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'user-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
});