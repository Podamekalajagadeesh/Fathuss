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
        achievements: true,
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
      level: user.level,
      experiencePoints: user.experiencePoints,
      reputation: user.reputation,
      achievementsCount: user.achievements.length,
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

// Update user XP and level
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      const xpGained = Math.floor(points / 10) + 10; // Base XP
      const newXP = user.experiencePoints + xpGained;
      const newLevel = Math.floor(newXP / 100) + 1; // 100 XP per level

      // Update streak
      const now = new Date();
      const lastActivity = user.lastActivityAt;
      let newStreak = user.currentStreak;

      if (lastActivity) {
        const lastDate = new Date(lastActivity);
        lastDate.setHours(0, 0, 0, 0);
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (lastDate.getTime() === yesterday.getTime()) {
          newStreak += 1;
        } else if (lastDate.getTime() !== today.getTime()) {
          newStreak = 1; // Reset if not consecutive
        }
      } else {
        newStreak = 1;
      }

      const longestStreak = Math.max(user.longestStreak, newStreak);

      await prisma.user.update({
        where: { id: userId },
        data: {
          experiencePoints: newXP,
          level: newLevel,
          totalScore: { increment: points },
          challengesCompleted: { increment: 1 },
          currentStreak: newStreak,
          longestStreak: longestStreak,
          lastActivityAt: now
        }
      });

      // Check for achievements
      await checkAndAwardAchievements(userId);
    }

    // Invalidate relevant caches
    const keys = await redis.keys('leaderboard:*');
    if (keys.length > 0) {
      await redis.del(keys);
    }

    res.json({ success: true, message: 'Leaderboard updated' });
  } catch (error) {
    console.error('Error updating leaderboard:', error);
    res.status(500).json({ error: 'Failed to update leaderboard' });
  }
});

// Achievement checking and awarding
async function checkAndAwardAchievements(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { 
      achievements: { select: { achievementId: true } },
      submissions: { where: { status: 'completed' }, select: { id: true } }
    }
  });

  if (!user) return;

  const achievements = await prisma.achievement.findMany({ where: { isActive: true } });
  const userAchievementIds = user.achievements.map(a => a.achievementId);

  for (const achievement of achievements) {
    if (userAchievementIds.includes(achievement.id)) continue;

    let shouldAward = false;

    switch (achievement.type) {
      case 'count':
        if (achievement.name.includes('Challenge')) {
          shouldAward = user.submissions.length >= achievement.threshold;
        }
        break;
      case 'streak':
        shouldAward = user.longestStreak >= achievement.threshold;
        break;
      case 'score':
        shouldAward = user.totalScore >= achievement.threshold;
        break;
      case 'level':
        shouldAward = user.level >= achievement.threshold;
        break;
    }

    if (shouldAward) {
      await prisma.userAchievement.create({
        data: {
          userId,
          achievementId: achievement.id
        }
      });

      // Award XP and points
      await prisma.user.update({
        where: { id: userId },
        data: {
          experiencePoints: { increment: achievement.xpReward },
          reputation: { increment: achievement.points }
        }
      });
    }
  }
}

// Get user achievements
app.get('/achievements/user/:address', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const cacheKey = `achievements:user:${address}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const user = await prisma.user.findUnique({
      where: { address: address.toLowerCase() },
      include: {
        achievements: {
          include: { achievement: true },
          orderBy: { unlockedAt: 'desc' }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = {
      user: user.address,
      achievements: user.achievements.map(ua => ({
        id: ua.achievement.id,
        name: ua.achievement.name,
        description: ua.achievement.description,
        icon: ua.achievement.icon,
        category: ua.achievement.category,
        rarity: ua.achievement.rarity,
        unlockedAt: ua.unlockedAt.toISOString()
      }))
    };

    await redis.setEx(cacheKey, 300, JSON.stringify(result));
    res.json(result);
  } catch (error) {
    console.error('Error fetching user achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Get all available achievements
app.get('/achievements', async (req, res) => {
  try {
    const cacheKey = 'achievements:all';

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const achievements = await prisma.achievement.findMany({
      where: { isActive: true },
      orderBy: { category: 'asc' }
    });

    const result = achievements.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      category: a.category,
      type: a.type,
      threshold: a.threshold,
      points: a.points,
      xpReward: a.xpReward,
      rarity: a.rarity
    }));

    await redis.setEx(cacheKey, 600, JSON.stringify(result)); // Cache for 10 minutes
    res.json(result);
  } catch (error) {
    console.error('Error fetching achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Get today's daily challenge
app.get('/daily-challenge', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dailyChallenge = await prisma.dailyChallenge.findUnique({
      where: { date: today }
    });

    if (!dailyChallenge) {
      // Create today's challenge if not exists
      const challengeTypes = [
        { type: 'solve_challenge', target: 1, title: 'First Solve', description: 'Solve your first challenge today' },
        { type: 'streak', target: 3, title: 'Keep it Going', description: 'Maintain a 3-day solving streak' },
        { type: 'score', target: 500, title: 'High Scorer', description: 'Earn 500 points today' }
      ];
      const randomType = challengeTypes[Math.floor(Math.random() * challengeTypes.length)];

      dailyChallenge = await prisma.dailyChallenge.create({
        data: {
          date: today,
          title: randomType.title,
          description: randomType.description,
          type: randomType.type,
          target: randomType.target
        }
      });
    }

    const userId = (req as any).user.id;
    const userChallenge = await prisma.userDailyChallenge.findUnique({
      where: {
        userId_dailyChallengeId: {
          userId,
          dailyChallengeId: dailyChallenge.id
        }
      }
    });

    const result = {
      id: dailyChallenge.id,
      title: dailyChallenge.title,
      description: dailyChallenge.description,
      type: dailyChallenge.type,
      target: dailyChallenge.target,
      rewardXP: dailyChallenge.rewardXP,
      rewardPoints: dailyChallenge.rewardPoints,
      progress: userChallenge?.progress || 0,
      completed: userChallenge?.completed || false,
      claimed: userChallenge?.claimed || false
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching daily challenge:', error);
    res.status(500).json({ error: 'Failed to fetch daily challenge' });
  }
});

// Update daily challenge progress
app.post('/daily-challenge/progress', authenticateToken, async (req, res) => {
  try {
    const { challengeId, progress } = req.body;
    const userId = (req as any).user.id;

    const userChallenge = await prisma.userDailyChallenge.upsert({
      where: {
        userId_dailyChallengeId: {
          userId,
          dailyChallengeId: challengeId
        }
      },
      update: {
        progress: { increment: progress }
      },
      create: {
        userId,
        dailyChallengeId: challengeId,
        progress
      }
    });

    const dailyChallenge = await prisma.dailyChallenge.findUnique({
      where: { id: challengeId }
    });

    if (dailyChallenge && userChallenge.progress >= dailyChallenge.target && !userChallenge.completed) {
      await prisma.userDailyChallenge.update({
        where: { id: userChallenge.id },
        data: {
          completed: true,
          completedAt: new Date()
        }
      });
    }

    res.json({ success: true, progress: userChallenge.progress + progress });
  } catch (error) {
    console.error('Error updating daily challenge progress:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// Claim daily challenge reward
app.post('/daily-challenge/claim', authenticateToken, async (req, res) => {
  try {
    const { challengeId } = req.body;
    const userId = (req as any).user.id;

    const userChallenge = await prisma.userDailyChallenge.findUnique({
      where: {
        userId_dailyChallengeId: {
          userId,
          dailyChallengeId: challengeId
        }
      }
    });

    if (!userChallenge || !userChallenge.completed || userChallenge.claimed) {
      return res.status(400).json({ error: 'Cannot claim reward' });
    }

    const dailyChallenge = await prisma.dailyChallenge.findUnique({
      where: { id: challengeId }
    });

    if (!dailyChallenge) {
      return res.status(404).json({ error: 'Daily challenge not found' });
    }

    // Award rewards
    await prisma.user.update({
      where: { id: userId },
      data: {
        experiencePoints: { increment: dailyChallenge.rewardXP },
        reputation: { increment: dailyChallenge.rewardPoints }
      }
    });

    await prisma.userDailyChallenge.update({
      where: { id: userChallenge.id },
      data: {
        claimed: true,
        claimedAt: new Date()
      }
    });

    res.json({
      success: true,
      rewards: {
        xp: dailyChallenge.rewardXP,
        points: dailyChallenge.rewardPoints
      }
    });
  } catch (error) {
    console.error('Error claiming daily challenge reward:', error);
    res.status(500).json({ error: 'Failed to claim reward' });
  }
});

// Get user level and XP info
app.get('/user/level/:address', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const cacheKey = `user:level:${address}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const user = await prisma.user.findUnique({
      where: { address: address.toLowerCase() },
      select: {
        level: true,
        experiencePoints: true,
        reputation: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentLevelXP = (user.level - 1) * 100;
    const nextLevelXP = user.level * 100;
    const xpToNext = nextLevelXP - user.experiencePoints;

    const result = {
      level: user.level,
      experiencePoints: user.experiencePoints,
      reputation: user.reputation,
      currentLevelXP,
      nextLevelXP,
      xpToNext: Math.max(0, xpToNext),
      progressPercent: Math.min(100, ((user.experiencePoints - currentLevelXP) / 100) * 100)
    };

    await redis.setEx(cacheKey, 300, JSON.stringify(result));
    res.json(result);
  } catch (error) {
    console.error('Error fetching user level:', error);
    res.status(500).json({ error: 'Failed to fetch level info' });
  }
});

// Seed achievements (development endpoint)
app.post('/seed-achievements', async (req, res) => {
  try {
    const achievements = [
      // Challenge count achievements
      { name: 'First Steps', description: 'Complete your first challenge', category: 'Challenges', type: 'count', threshold: 1, points: 10, xpReward: 50, rarity: 'common' },
      { name: 'Apprentice', description: 'Complete 10 challenges', category: 'Challenges', type: 'count', threshold: 10, points: 25, xpReward: 100, rarity: 'common' },
      { name: 'Skilled Solver', description: 'Complete 50 challenges', category: 'Challenges', type: 'count', threshold: 50, points: 50, xpReward: 200, rarity: 'rare' },
      { name: 'Master Solver', description: 'Complete 100 challenges', category: 'Challenges', type: 'count', threshold: 100, points: 100, xpReward: 500, rarity: 'epic' },
      { name: 'Legend', description: 'Complete 500 challenges', category: 'Challenges', type: 'count', threshold: 500, points: 500, xpReward: 1000, rarity: 'legendary' },

      // Streak achievements
      { name: 'Consistent', description: 'Maintain a 7-day solving streak', category: 'Streaks', type: 'streak', threshold: 7, points: 30, xpReward: 150, rarity: 'rare' },
      { name: 'Dedicated', description: 'Maintain a 30-day solving streak', category: 'Streaks', type: 'streak', threshold: 30, points: 100, xpReward: 500, rarity: 'epic' },
      { name: 'Unstoppable', description: 'Maintain a 100-day solving streak', category: 'Streaks', type: 'streak', threshold: 100, points: 500, xpReward: 2000, rarity: 'legendary' },

      // Score achievements
      { name: 'High Scorer', description: 'Earn 1000 total points', category: 'Scoring', type: 'score', threshold: 1000, points: 20, xpReward: 100, rarity: 'common' },
      { name: 'Elite Scorer', description: 'Earn 10000 total points', category: 'Scoring', type: 'score', threshold: 10000, points: 100, xpReward: 500, rarity: 'epic' },

      // Level achievements
      { name: 'Level Up', description: 'Reach level 5', category: 'Progression', type: 'level', threshold: 5, points: 25, xpReward: 125, rarity: 'common' },
      { name: 'Experienced', description: 'Reach level 10', category: 'Progression', type: 'level', threshold: 10, points: 50, xpReward: 250, rarity: 'rare' },
      { name: 'Expert', description: 'Reach level 25', category: 'Progression', type: 'level', threshold: 25, points: 150, xpReward: 750, rarity: 'epic' },
      { name: 'Grandmaster', description: 'Reach level 50', category: 'Progression', type: 'level', threshold: 50, points: 500, xpReward: 2500, rarity: 'legendary' }
    ];

    for (const ach of achievements) {
      await prisma.achievement.upsert({
        where: { name: ach.name },
        update: ach,
        create: ach
      });
    }

    res.json({ success: true, message: 'Achievements seeded' });
  } catch (error) {
    console.error('Error seeding achievements:', error);
    res.status(500).json({ error: 'Failed to seed achievements' });
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