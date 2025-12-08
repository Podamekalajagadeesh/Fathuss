import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4001;
const prisma = new PrismaClient();

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

// Get user profile with full details
app.get('/users/:address', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;

    const user = await prisma.user.findUnique({
      where: { address: address.toLowerCase() },
      include: {
        linkedWallets: true,
        badges: {
          include: { badge: true }
        },
        certifications: true,
        _count: {
          select: {
            submissions: true,
            marketplaceItems: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate level from XP (simple formula: level = floor(sqrt(xp/100)) + 1)
    const calculatedLevel = Math.floor(Math.sqrt(user.experiencePoints / 100)) + 1;

    const profile = {
      id: user.id,
      address: user.address,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      level: calculatedLevel,
      experiencePoints: user.experiencePoints,
      totalScore: user.totalScore,
      challengesCompleted: user.challengesCompleted,
      reputation: user.reputation,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      lastActivityAt: user.lastActivityAt,
      joinedAt: user.createdAt,
      linkedWallets: user.linkedWallets,
      badges: user.badges.map(ub => ({
        ...ub.badge,
        earnedAt: ub.earnedAt
      })),
      certifications: user.certifications,
      stats: {
        totalSubmissions: user._count.submissions,
        marketplaceItems: user._count.marketplaceItems
      }
    };

    res.json(profile);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Update user profile
app.put('/users/:address', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const updates = req.body;

    // Validate that the authenticated user owns this address
    // In production, check JWT claims

    const updatedUser = await prisma.user.upsert({
      where: { address: address.toLowerCase() },
      update: {
        username: updates.username,
        email: updates.email,
        avatarUrl: updates.avatarUrl,
        bio: updates.bio,
        updatedAt: new Date()
      },
      create: {
        address: address.toLowerCase(),
        username: updates.username,
        email: updates.email,
        avatarUrl: updates.avatarUrl,
        bio: updates.bio
      },
      include: {
        linkedWallets: true,
        badges: {
          include: { badge: true }
        },
        certifications: true
      }
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Get user statistics and solve history
app.get('/users/:address/stats', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;

    const user = await prisma.user.findUnique({
      where: { address: address.toLowerCase() },
      include: {
        submissions: {
          orderBy: { submittedAt: 'desc' },
          take: 10
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate statistics from submissions
    const submissions = user.submissions;
    const completedSubmissions = submissions.filter(s => s.status === 'completed');
    const successfulSubmissions = completedSubmissions.filter(s => (s.score || 0) > 0);

    const totalSubmissions = submissions.length;
    const successRate = totalSubmissions > 0 ? successfulSubmissions.length / totalSubmissions : 0;
    const averageScore = successfulSubmissions.length > 0
      ? successfulSubmissions.reduce((sum, s) => sum + (s.score || 0), 0) / successfulSubmissions.length
      : 0;

    // Language preferences
    const languageStats = submissions.reduce((acc, s) => {
      acc[s.language] = (acc[s.language] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const favoriteLanguage = Object.entries(languageStats)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';

    const stats = {
      totalSubmissions,
      completedChallenges: user.challengesCompleted,
      successRate: Math.round(successRate * 100) / 100,
      averageScore: Math.round(averageScore * 100) / 100,
      favoriteLanguage,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      reputation: user.reputation,
      experiencePoints: user.experiencePoints,
      level: Math.floor(Math.sqrt(user.experiencePoints / 100)) + 1,
      recentSubmissions: submissions.slice(0, 5).map(s => ({
        id: s.id,
        challengeId: s.challengeId,
        language: s.language,
        status: s.status,
        score: s.score,
        submittedAt: s.submittedAt
      }))
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

// Link additional wallet
app.post('/users/:address/wallets', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const { walletAddress, chainId, isPrimary = false } = req.body;

    const user = await prisma.user.findUnique({
      where: { address: address.toLowerCase() }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If setting as primary, unset other primary wallets
    if (isPrimary) {
      await prisma.linkedWallet.updateMany({
        where: { userId: user.id, isPrimary: true },
        data: { isPrimary: false }
      });
    }

    const linkedWallet = await prisma.linkedWallet.create({
      data: {
        userId: user.id,
        address: walletAddress.toLowerCase(),
        chainId,
        isPrimary
      }
    });

    res.status(201).json(linkedWallet);
  } catch (error) {
    console.error('Error linking wallet:', error);
    res.status(500).json({ error: 'Failed to link wallet' });
  }
});

// Get user badges
app.get('/users/:address/badges', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;

    const userBadges = await prisma.userBadge.findMany({
      where: {
        user: { address: address.toLowerCase() }
      },
      include: {
        badge: true
      },
      orderBy: { earnedAt: 'desc' }
    });

    res.json(userBadges.map(ub => ({
      ...ub.badge,
      earnedAt: ub.earnedAt
    })));
  } catch (error) {
    console.error('Error fetching user badges:', error);
    res.status(500).json({ error: 'Failed to fetch user badges' });
  }
});

// Award badge to user
app.post('/users/:address/badges', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const { badgeId } = req.body;

    const user = await prisma.user.findUnique({
      where: { address: address.toLowerCase() }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if badge already earned
    const existingBadge = await prisma.userBadge.findUnique({
      where: {
        userId_badgeId: {
          userId: user.id,
          badgeId
        }
      }
    });

    if (existingBadge) {
      return res.status(409).json({ error: 'Badge already earned' });
    }

    const userBadge = await prisma.userBadge.create({
      data: {
        userId: user.id,
        badgeId
      },
      include: {
        badge: true
      }
    });

    // Award XP for badge
    await prisma.user.update({
      where: { id: user.id },
      data: {
        experiencePoints: {
          increment: userBadge.badge.xpReward
        }
      }
    });

    res.status(201).json(userBadge);
  } catch (error) {
    console.error('Error awarding badge:', error);
    res.status(500).json({ error: 'Failed to award badge' });
  }
});

// Get user certifications
app.get('/users/:address/certifications', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;

    const certifications = await prisma.certification.findMany({
      where: {
        user: { address: address.toLowerCase() }
      },
      orderBy: { issuedAt: 'desc' }
    });

    res.json(certifications);
  } catch (error) {
    console.error('Error fetching certifications:', error);
    res.status(500).json({ error: 'Failed to fetch certifications' });
  }
});

// Add certification
app.post('/users/:address/certifications', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const { title, description, issuer, nftContract, tokenId, metadataUrl, issuedAt, expiresAt, verificationUrl } = req.body;

    const user = await prisma.user.findUnique({
      where: { address: address.toLowerCase() }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const certification = await prisma.certification.create({
      data: {
        userId: user.id,
        title,
        description,
        issuer,
        nftContract,
        tokenId,
        metadataUrl,
        issuedAt: new Date(issuedAt),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        verificationUrl
      }
    });

    res.status(201).json(certification);
  } catch (error) {
    console.error('Error adding certification:', error);
    res.status(500).json({ error: 'Failed to add certification' });
  }
});

// Update user progress (XP, streaks, etc.)
app.post('/users/:address/progress', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const { xpGained, challengeCompleted, streakUpdate } = req.body;

    const updateData: any = {
      lastActivityAt: new Date()
    };

    if (xpGained) {
      updateData.experiencePoints = { increment: xpGained };
    }

    if (challengeCompleted) {
      updateData.challengesCompleted = { increment: 1 };
      updateData.totalScore = { increment: challengeCompleted.score || 0 };
    }

    if (streakUpdate) {
      if (streakUpdate.reset) {
        updateData.currentStreak = 0;
      } else if (streakUpdate.extend) {
        updateData.currentStreak = { increment: 1 };
        // Update longest streak if current exceeds it
        updateData.longestStreak = {
          set: Math.max(streakUpdate.currentLongest || 0, (streakUpdate.currentStreak || 0) + 1)
        };
      }
    }

    const updatedUser = await prisma.user.update({
      where: { address: address.toLowerCase() },
      data: updateData
    });

    res.json({
      experiencePoints: updatedUser.experiencePoints,
      challengesCompleted: updatedUser.challengesCompleted,
      currentStreak: updatedUser.currentStreak,
      longestStreak: updatedUser.longestStreak,
      level: Math.floor(Math.sqrt(updatedUser.experiencePoints / 100)) + 1
    });
  } catch (error) {
    console.error('Error updating user progress:', error);
    res.status(500).json({ error: 'Failed to update user progress' });
  }
});

// Get solve history
app.get('/users/:address/solves', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const solves = await prisma.submission.findMany({
      where: {
        user: { address: address.toLowerCase() },
        status: 'completed',
        score: { gt: 0 }
      },
      orderBy: { submittedAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit)
    });

    const total = await prisma.submission.count({
      where: {
        user: { address: address.toLowerCase() },
        status: 'completed',
        score: { gt: 0 }
      }
    });

    res.json({
      solves,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching solve history:', error);
    res.status(500).json({ error: 'Failed to fetch solve history' });
  }
});

// Update user reputation
app.post('/users/:address/reputation', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const { change, reason } = req.body;

    const updatedUser = await prisma.user.update({
      where: { address: address.toLowerCase() },
      data: {
        reputation: { increment: change }
      }
    });

    // TODO: Log reputation change in audit table

    res.json({
      reputation: updatedUser.reputation,
      change,
      reason
    });
  } catch (error) {
    console.error('Error updating reputation:', error);
    res.status(500).json({ error: 'Failed to update reputation' });
  }
});

// Get user leaderboard position
app.get('/users/:address/rank', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const { timeframe = 'all_time' } = req.query;

    const user = await prisma.user.findUnique({
      where: { address: address.toLowerCase() }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get rank based on total score
    const rankQuery = await prisma.$queryRaw`
      SELECT rank FROM (
        SELECT id, RANK() OVER (ORDER BY total_score DESC) as rank
        FROM users
      ) ranked_users
      WHERE id = ${user.id}
    `;

    const rank = (rankQuery as any)[0]?.rank || null;

    // Get nearby users for context
    const nearbyUsers = await prisma.user.findMany({
      select: {
        address: true,
        username: true,
        totalScore: true,
        level: true
      },
      orderBy: { totalScore: 'desc' },
      skip: Math.max(0, (rank || 1) - 6),
      take: 11
    });

    res.json({
      userRank: rank,
      userScore: user.totalScore,
      nearbyUsers: nearbyUsers.map((u, index) => ({
        ...u,
        rank: (rank || 1) - 5 + index
      }))
    });
  } catch (error) {
    console.error('Error fetching user rank:', error);
    res.status(500).json({ error: 'Failed to fetch user rank' });
  }
});

// Create user (for email/password registration)
app.post('/users', async (req, res) => {
  try {
    const { email, passwordHash, username, role = 'user' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Generate a temporary address for email-based users (can be updated later if they connect wallet)
    const tempAddress = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const user = await prisma.user.create({
      data: {
        address: tempAddress,
        email,
        passwordHash,
        username,
        role
      }
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Error creating user:', error);
    if ((error as any).code === 'P2002') {
      res.status(409).json({ error: 'User already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
});

// Check if user exists by email
app.get('/users/check', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email as string }
    });

    if (user) {
      res.json({ exists: true });
    } else {
      res.status(404).json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking user:', error);
    res.status(500).json({ error: 'Failed to check user' });
  }
});

// Get user by email
app.get('/users/by-email/:email', async (req, res) => {
  try {
    const { email } = req.params;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      passwordHash: user.passwordHash,
      role: user.role,
      avatarUrl: user.avatarUrl,
      experiencePoints: user.experiencePoints,
      currentStreak: user.currentStreak,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error('Error fetching user by email:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Reset user password
app.post('/users/reset-password', async (req, res) => {
  try {
    const { email, passwordHash } = req.body;

    if (!email || !passwordHash) {
      return res.status(400).json({ error: 'Email and password hash are required' });
    }

    const updatedUser = await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { passwordHash, updatedAt: new Date() }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Update user password (for password reset)
app.post('/users/reset-password', async (req, res) => {
  try {
    const { email, passwordHash } = req.body;

    if (!email || !passwordHash) {
      return res.status(400).json({ error: 'Email and password hash are required' });
    }

    const updatedUser = await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { passwordHash },
      select: {
        id: true,
        email: true,
        username: true,
        updatedAt: true
      }
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error resetting password:', error);
    if ((error as any).code === 'P2025') {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }
});

// Admin User Management Endpoints
app.get('/admin/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        address: true,
        username: true,
        email: true,
        role: true,
        avatarUrl: true,
        experiencePoints: true,
        currentStreak: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.put('/admin/users/:userId/role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['user', 'creator', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be user, creator, or admin' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        address: true,
        username: true,
        email: true,
        role: true,
        updatedAt: true
      }
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user role:', error);
    if ((error as any).code === 'P2025') {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.status(500).json({ error: 'Failed to update user role' });
    }
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'user-service',
    timestamp: new Date().toISOString(),
    database: 'connected' // TODO: Add actual DB health check
  });
});

app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
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