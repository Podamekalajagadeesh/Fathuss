import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4003;
const prisma = new PrismaClient();
const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redis.connect().catch(console.error);

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
    const cacheKey = `leaderboard:global:${timeframe}:${limit}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Fetch users with submission stats
    const users = await prisma.user.findMany({
      include: {
        submissions: {
          where: {
            status: 'completed'
          }
        },
        _count: {
          select: {
            submissions: true
          }
        }
      },
      orderBy: {
        totalScore: 'desc'
      },
      take: Number(limit)
    });

    const leaderboard = await Promise.all(users.map(async (user, index) => {
      const completedSubmissions = user.submissions.filter(s => s.status === 'completed');
      const totalSubmissions = user._count.submissions;
      const winRate = totalSubmissions > 0 ? completedSubmissions.length / totalSubmissions : 0;

      return {
        rank: index + 1,
        address: user.address,
        username: user.username,
        totalPoints: user.totalScore,
        challengesCompleted: user.challengesCompleted,
        winRate: Math.round(winRate * 100) / 100,
        lastActive: user.lastActivityAt?.toISOString() || user.updatedAt.toISOString()
      };
    }));

    const result = {
      timeframe,
      leaderboard,
      total: users.length
    };

    // Cache for 5 minutes
    await redis.setEx(cacheKey, 300, JSON.stringify(result));

    res.json(result);
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
    const cacheKey = `leaderboard:challenge:${challengeId}:${limit}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get best submission per user for this challenge
    const submissions = await prisma.submission.findMany({
      where: {
        challengeId,
        status: 'completed',
        score: {
          not: null
        }
      },
      include: {
        user: true
      },
      orderBy: [
        { score: 'desc' },
        { executionTime: 'asc' }
      ],
      take: Number(limit) * 2 // Get more to handle duplicates
    });

    // Group by user and take best score
    const userBest = new Map();
    submissions.forEach(sub => {
      if (!userBest.has(sub.userId) || userBest.get(sub.userId).score < sub.score!) {
        userBest.set(sub.userId, sub);
      }
    });

    const leaderboard = Array.from(userBest.values()).map((sub, index) => ({
      rank: index + 1,
      address: sub.user.address,
      username: sub.user.username,
      score: sub.score,
      timeTaken: sub.executionTime,
      submittedAt: sub.submittedAt.toISOString()
    })).slice(0, Number(limit));

    const result = {
      challengeId,
      leaderboard
    };

    await redis.setEx(cacheKey, 300, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    console.error('Error fetching challenge leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch challenge leaderboard' });
  }
});

// User rank and stats
app.get('/leaderboard/user/:address', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const cacheKey = `leaderboard:user:${address}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const user = await prisma.user.findUnique({
      where: { address: address.toLowerCase() },
      include: {
        submissions: {
          where: {
            status: 'completed'
          }
        },
        _count: {
          select: {
            submissions: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate global rank
    const globalRank = await prisma.user.count({
      where: {
        totalScore: {
          gt: user.totalScore
        }
      }
    }) + 1;

    const completedSubmissions = user.submissions;
    const totalSubmissions = user._count.submissions;
    const winRate = totalSubmissions > 0 ? completedSubmissions.length / totalSubmissions : 0;
    const averageScore = completedSubmissions.length > 0
      ? completedSubmissions.reduce((sum, s) => sum + (s.score || 0), 0) / completedSubmissions.length
      : 0;

    // Category ranks (simplified - group by challenge category)
    const categoryStats = await prisma.submission.groupBy({
      by: ['challengeId'],
      where: {
        userId: user.id,
        status: 'completed'
      },
      _max: {
        score: true
      }
    });

    const categoryRanks: { [key: string]: number } = {};
    for (const stat of categoryStats) {
      const challenge = await prisma.challenge.findUnique({
        where: { id: stat.challengeId },
        select: { category: true }
      });
      if (challenge) {
        const category = challenge.category;
        if (!categoryRanks[category]) {
          // Count users with higher scores in this category
          const higherCount = await prisma.$queryRaw`
            SELECT COUNT(DISTINCT s."userId") as count
            FROM submissions s
            JOIN challenges c ON s."challengeId" = c.id
            WHERE c.category = ${category}
            AND s.status = 'completed'
            AND s.score > ${stat._max.score}
          `;
          categoryRanks[category] = (higherCount as any)[0].count + 1;
        }
      }
    }

    const userStats = {
      address: user.address,
      globalRank,
      totalPoints: user.totalScore,
      challengesCompleted: user.challengesCompleted,
      winRate: Math.round(winRate * 100) / 100,
      averageScore: Math.round(averageScore * 100) / 100,
      bestStreak: user.longestStreak,
      currentStreak: user.currentStreak,
      categoryRanks
    };

    await redis.setEx(cacheKey, 300, JSON.stringify(userStats));

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
    const cacheKey = `leaderboard:category:${category}:${limit}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get users with best scores in challenges of this category
    const result = await prisma.$queryRaw`
      SELECT u.address, u.username, SUM(s.score) as points, COUNT(DISTINCT s."challengeId") as challenges_completed
      FROM users u
      JOIN submissions s ON u.id = s."userId"
      JOIN challenges c ON s."challengeId" = c.id
      WHERE c.category = ${category} AND s.status = 'completed' AND s.score IS NOT NULL
      GROUP BY u.id, u.address, u.username
      ORDER BY points DESC
      LIMIT ${Number(limit)}
    `;

    const leaderboard = (result as any[]).map((row, index) => ({
      rank: index + 1,
      address: row.address,
      username: row.username,
      points: parseFloat(row.points),
      challengesCompleted: parseInt(row.challenges_completed)
    }));

    const response = {
      category,
      leaderboard
    };

    await redis.setEx(cacheKey, 300, JSON.stringify(response));

    res.json(response);
  } catch (error) {
    console.error('Error fetching category leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch category leaderboard' });
  }
});

// Update leaderboard (called by challenge service after grading)
app.post('/leaderboard/update', async (req, res) => {
  try {
    const { userId, challengeId, score, points } = req.body;

    // Invalidate relevant caches
    const keys = await redis.keys('leaderboard:*');
    if (keys.length > 0) {
      await redis.del(keys);
    }

    // Optionally update user stats if needed
    // For now, assume user service handles user updates

    res.json({ success: true, message: 'Leaderboard cache invalidated' });
  } catch (error) {
    console.error('Error updating leaderboard:', error);
    res.status(500).json({ error: 'Failed to update leaderboard' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'leaderboard-service', timestamp: new Date().toISOString() });
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  await redis.disconnect();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Leaderboard Service running on port ${PORT}`);
});