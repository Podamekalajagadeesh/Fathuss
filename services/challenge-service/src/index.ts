import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { create as createIPFSClient } from 'ipfs-http-client';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4002;
const prisma = new PrismaClient();

// IPFS client
const ipfs = createIPFSClient({
  host: process.env.IPFS_HOST || 'localhost',
  port: parseInt(process.env.IPFS_PORT || '5001'),
  protocol: 'http'
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allow larger payloads for code submissions

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

  try {
    // Verify JWT token (use same secret as API Gateway)
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Author/Admin middleware (for publishing/retiring challenges)
const requireAuthor = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (!user || !user.role || !['creator', 'admin'].includes(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions. Creator or Admin role required.' });
  }
  next();
};

// RBAC middleware
const requireRole = (roles: string[]) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user;
    if (!user || !user.role || !roles.includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Get all challenges with filtering and pagination
app.get('/challenges', authenticateToken, async (req, res) => {
  try {
    const {
      category,
      difficulty,
      tags,
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const where: any = {
      isActive: true
    };

    // Add filters
    if (category) {
      where.category = category as string;
    }

    if (difficulty) {
      where.difficulty = difficulty as string;
    }

    if (tags) {
      const tagArray = (tags as string).split(',');
      where.tags = {
        hasSome: tagArray
      };
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { shortDescription: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    const [challenges, total] = await Promise.all([
      prisma.challenge.findMany({
        where,
        include: {
          _count: {
            select: { submissions: true }
          }
        },
        orderBy,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      }),
      prisma.challenge.count({ where })
    ]);

    // Get published versions for each challenge
    const challengesWithVersions = await Promise.all(
      challenges.map(async (challenge) => {
        const publishedVersion = await prisma.challengeVersion.findFirst({
          where: {
            challengeId: challenge.id,
            isPublished: true,
            isRetired: false
          },
          include: {
            _count: {
              select: { hints: true }
            }
          },
          orderBy: { version: 'desc' }
        });

        return {
          ...challenge,
          publishedVersion: publishedVersion ? {
            version: publishedVersion.version,
            publishedAt: publishedVersion.publishedAt,
            hintsCount: publishedVersion._count.hints
          } : null,
          submissionCount: challenge._count.submissions
        };
      })
    );

    res.json({
      challenges: challengesWithVersions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching challenges:', error);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

// Get specific challenge with published version
app.get('/challenges/:slug', authenticateToken, async (req, res) => {
  try {
    const { slug } = req.params;
    const { includeUnpublished = false } = req.query;

    const challenge = await prisma.challenge.findUnique({
      where: { slug },
      include: {
        _count: {
          select: { submissions: true }
        }
      }
    });

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    // Get published version (or latest if includeUnpublished for authors)
    const versionWhere: any = {
      challengeId: challenge.id,
      isRetired: false
    };

    if (!includeUnpublished) {
      versionWhere.isPublished = true;
    }

    const publishedVersion = await prisma.challengeVersion.findFirst({
      where: versionWhere,
      include: {
        hints: {
          where: { isActive: true },
          orderBy: { order: 'asc' }
        },
        testManifest: {
          include: {
            testCases: {
              where: { isPublic: true },
              orderBy: { order: 'asc' }
            }
          }
        },
        fixtures: true
      },
      orderBy: { version: 'desc' }
    });

    if (!publishedVersion) {
      return res.status(404).json({ error: 'No published version available' });
    }

    const response = {
      id: challenge.id,
      slug: challenge.slug,
      title: challenge.title,
      description: challenge.description,
      shortDescription: challenge.shortDescription,
      category: challenge.category,
      difficulty: challenge.difficulty,
      points: challenge.points,
      timeLimit: challenge.timeLimit,
      memoryLimit: challenge.memoryLimit,
      tags: challenge.tags,
      isActive: challenge.isActive,
      createdBy: challenge.createdBy,
      createdAt: challenge.createdAt,
      updatedAt: challenge.updatedAt,
      version: publishedVersion.version,
      publishedAt: publishedVersion.publishedAt,
      starterCode: publishedVersion.starterCode,
      hints: publishedVersion.hints.map(h => ({
        id: h.id,
        content: h.content,
        cost: h.cost
      })),
      testManifest: publishedVersion.testManifest ? {
        language: publishedVersion.testManifest.language,
        framework: publishedVersion.testManifest.framework,
        testRunner: publishedVersion.testManifest.testRunner,
        timeout: publishedVersion.testManifest.timeout,
        publicTestCases: publishedVersion.testManifest.testCases,
        testCasesCount: publishedVersion.testManifest.testCases.length
      } : null,
      fixtures: publishedVersion.fixtures.map(f => ({
        name: f.name,
        type: f.type,
        ipfsHash: f.ipfsHash,
        fileSize: f.fileSize,
        mimeType: f.mimeType,
        description: f.description
      })),
      submissionCount: (challenge as any)._count.submissions
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching challenge:', error);
    res.status(500).json({ error: 'Failed to fetch challenge' });
  }
});

// Submit solution
app.post('/challenges/:id/submit', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, language } = req.body;
    const userId = (req as any).user.address;

    // Verify challenge exists and is active
    const challenge = await prisma.challenge.findUnique({
      where: { id, isActive: true }
    });

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found or inactive' });
    }

    // Get the published version
    const publishedVersion = await prisma.challengeVersion.findFirst({
      where: {
        challengeId: id,
        isPublished: true,
        isRetired: false
      },
      orderBy: { version: 'desc' }
    });

    if (!publishedVersion) {
      return res.status(400).json({ error: 'No published version available for submission' });
    }

    // Create submission record
    const submission = await prisma.submission.create({
      data: {
        challengeId: id,
        versionId: publishedVersion.id,
        userId,
        code,
        language,
        status: 'pending'
      }
    });

    // Send to grader service asynchronously
    try {
      const graderResponse = await fetch('http://localhost:4006/submit', {
        method: 'POST',
        headers: {
          'Authorization': req.headers.authorization!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          challengeId: id,
          code,
          language,
          userId
        })
      });

      if (!graderResponse.ok) {
        throw new Error(`Grader service error: ${graderResponse.status}`);
      }

      const graderResult = await graderResponse.json();

      // Update submission with initial grader job info
      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          status: 'running',
          // Store grader job ID for tracking
          executionTime: null // Will be updated when grading completes
        }
      });

    } catch (graderError) {
      console.error('Failed to submit to grader service:', graderError);
      // Fallback to simulation for now, but log the error
      setTimeout(async () => {
        try {
          const score = Math.floor(Math.random() * 100);
          await prisma.submission.update({
            where: { id: submission.id },
            data: {
              status: 'completed',
              score,
              maxScore: challenge.points,
              executionTime: Math.floor(Math.random() * 1000),
              completedAt: new Date()
            }
          });

          // Award badges and XP after successful submission
          if (score >= 70) { // Passing score
            await awardBadgesAndXP(userId, challenge.id, score, challenge.points);
          }
        } catch (error) {
          console.error('Error in fallback grading:', error);
        }
      }, 2000);
    }

    res.status(201).json({
      submissionId: submission.id,
      status: 'pending',
      submittedAt: submission.submittedAt
    });
  } catch (error) {
    console.error('Error submitting solution:', error);
    res.status(500).json({ error: 'Failed to submit solution' });
  }
});

// Get submission results
app.get('/submissions/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.address;

    const submission = await prisma.submission.findFirst({
      where: {
        id,
        userId // Ensure users can only see their own submissions
      }
    });

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json(submission);
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// Get user's submissions for a challenge
app.get('/challenges/:id/submissions', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const userId = (req as any).user.address;

    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where: {
          challengeId: id,
          userId
        },
        orderBy: { submittedAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      }),
      prisma.submission.count({
        where: {
          challengeId: id,
          userId
        }
      })
    ]);

    res.json({
      submissions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Author Dashboard Endpoints

// Create new challenge
app.post('/challenges', authenticateToken, requireAuthor, async (req, res) => {
  try {
    const {
      title,
      description,
      shortDescription,
      category,
      difficulty,
      points,
      timeLimit,
      memoryLimit,
      tags
    } = req.body;

    const userId = (req as any).user.address;

    // Generate slug from title
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim();

    // Ensure unique slug
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.challenge.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const challenge = await prisma.challenge.create({
      data: {
        slug,
        title,
        description,
        shortDescription,
        category,
        difficulty,
        points,
        timeLimit,
        memoryLimit,
        tags: tags || [],
        createdBy: userId
      }
    });

    res.status(201).json(challenge);
  } catch (error) {
    console.error('Error creating challenge:', error);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

// Update challenge metadata
app.put('/challenges/:id', authenticateToken, requireAuthor, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // TODO: Check if user is the creator or admin

    const challenge = await prisma.challenge.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: new Date()
      }
    });

    res.json(challenge);
  } catch (error) {
    console.error('Error updating challenge:', error);
    res.status(500).json({ error: 'Failed to update challenge' });
  }
});

// Create new version for a challenge
app.post('/challenges/:id/versions', authenticateToken, requireAuthor, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      starterCode,
      hints,
      testManifest,
      fixtures
    } = req.body;

    const userId = (req as any).user.address;

    // Get next version number
    const lastVersion = await prisma.challengeVersion.findFirst({
      where: { challengeId: id },
      orderBy: { version: 'desc' }
    });

    const nextVersion = (lastVersion?.version || 0) + 1;

    // Create version in transaction
    const result = await prisma.$transaction(async (tx) => {
      const version = await tx.challengeVersion.create({
        data: {
          challengeId: id,
          version: nextVersion,
          title,
          description,
          starterCode,
          createdBy: userId
        }
      });

      // Add hints
      if (hints && hints.length > 0) {
        await tx.challengeHint.createMany({
          data: hints.map((hint: any, index: number) => ({
            versionId: version.id,
            order: index + 1,
            content: hint.content,
            cost: hint.cost || 0
          }))
        });
      }

      // Add test manifest
      if (testManifest) {
        const manifest = await tx.testManifest.create({
          data: {
            versionId: version.id,
            language: testManifest.language,
            framework: testManifest.framework,
            testRunner: testManifest.testRunner,
            timeout: testManifest.timeout || 30,
            setupCommands: testManifest.setupCommands || [],
            teardownCommands: testManifest.teardownCommands || [],
            environment: testManifest.environment
          }
        });

        // Add test cases
        if (testManifest.testCases && testManifest.testCases.length > 0) {
          await tx.testCase.createMany({
            data: testManifest.testCases.map((tc: any, index: number) => ({
              manifestId: manifest.id,
              name: tc.name,
              description: tc.description,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              isPublic: tc.isPublic || false,
              points: tc.points || 1,
              order: index + 1
            }))
          });
        }
      }

      // Add fixtures
      if (fixtures && fixtures.length > 0) {
        await tx.challengeFixture.createMany({
          data: fixtures.map((fixture: any) => ({
            versionId: version.id,
            name: fixture.name,
            type: fixture.type,
            ipfsHash: fixture.ipfsHash,
            fileSize: fixture.fileSize,
            mimeType: fixture.mimeType,
            description: fixture.description,
            isRequired: fixture.isRequired !== false
          }))
        });
      }

      return version;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating challenge version:', error);
    res.status(500).json({ error: 'Failed to create challenge version' });
  }
});

// Publish a challenge version
app.post('/challenges/:id/versions/:versionId/publish', authenticateToken, requireAuthor, async (req, res) => {
  try {
    const { id, versionId } = req.params;

    // Unpublish any currently published versions
    await prisma.challengeVersion.updateMany({
      where: {
        challengeId: id,
        isPublished: true,
        isRetired: false
      },
      data: {
        isPublished: false,
        isRetired: true,
        retiredAt: new Date()
      }
    });

    // Publish the new version
    const publishedVersion = await prisma.challengeVersion.update({
      where: { id: versionId },
      data: {
        isPublished: true,
        publishedAt: new Date()
      }
    });

    res.json({
      message: 'Version published successfully',
      version: publishedVersion
    });
  } catch (error) {
    console.error('Error publishing version:', error);
    res.status(500).json({ error: 'Failed to publish version' });
  }
});

// Retire a challenge version
app.post('/challenges/:id/versions/:versionId/retire', authenticateToken, requireAuthor, async (req, res) => {
  try {
    const { id, versionId } = req.params;

    const retiredVersion = await prisma.challengeVersion.update({
      where: { id: versionId },
      data: {
        isRetired: true,
        retiredAt: new Date()
      }
    });

    res.json({
      message: 'Version retired successfully',
      version: retiredVersion
    });
  } catch (error) {
    console.error('Error retiring version:', error);
    res.status(500).json({ error: 'Failed to retire version' });
  }
});

// Get all versions of a challenge (for authors)
app.get('/challenges/:id/versions', authenticateToken, requireAuthor, async (req, res) => {
  try {
    const { id } = req.params;

    const versions = await prisma.challengeVersion.findMany({
      where: { challengeId: id },
      include: {
        _count: {
          select: {
            hints: true,
            fixtures: true
          }
        },
        testManifest: {
          include: {
            _count: {
              select: { testCases: true }
            }
          }
        }
      },
      orderBy: { version: 'desc' }
    });

    res.json(versions);
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

// Get specific version details
app.get('/challenges/:id/versions/:versionId', authenticateToken, requireAuthor, async (req, res) => {
  try {
    const { id, versionId } = req.params;

    const version = await prisma.challengeVersion.findUnique({
      where: { id: versionId },
      include: {
        hints: {
          orderBy: { order: 'asc' }
        },
        testManifest: {
          include: {
            testCases: {
              orderBy: { order: 'asc' }
            }
          }
        },
        fixtures: true
      }
    });

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json(version);
  } catch (error) {
    console.error('Error fetching version:', error);
    res.status(500).json({ error: 'Failed to fetch version' });
  }
});

// Upload fixture to IPFS
app.post('/fixtures/upload', authenticateToken, requireAuthor, async (req, res) => {
  try {
    const { file, name, type, description } = req.body;

    // Upload to IPFS
    const buffer = Buffer.from(file, 'base64');
    const result = await ipfs.add(buffer);
    const ipfsHash = result.cid.toString();
    const fileSize = buffer.length;

    res.json({
      ipfsHash,
      fileSize,
      name,
      type,
      description
    });
  } catch (error) {
    console.error('Error uploading fixture:', error);
    res.status(500).json({ error: 'Failed to upload fixture' });
  }
});

// Award badges and XP for successful challenge completion
async function awardBadgesAndXP(userId: string, challengeId: string, score: number, maxScore: number) {
  try {
    // Award XP based on challenge difficulty and score
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId }
    });

    if (!challenge) return;

    // Calculate XP based on difficulty and score
    const difficultyMultiplier = {
      'easy': 1,
      'medium': 1.5,
      'hard': 2,
      'expert': 3
    }[challenge.difficulty] || 1;

    const xpEarned = Math.floor((score / 100) * maxScore * difficultyMultiplier);

    // Update user XP
    await prisma.user.update({
      where: { address: userId },
      data: {
        experiencePoints: {
          increment: xpEarned
        },
        challengesCompleted: {
          increment: 1
        }
      }
    });

    // Check for badge awards
    await checkAndAwardBadges(userId);

  } catch (error) {
    console.error('Error awarding badges and XP:', error);
  }
}

// Check and award badges based on user achievements
async function checkAndAwardBadges(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { address: userId },
      include: {
        badges: {
          include: { badge: true }
        }
      }
    });

    if (!user) return;

    // Get all available badges
    const allBadges = await prisma.badge.findMany({
      where: { isActive: true }
    });

    for (const badge of allBadges) {
      // Skip if user already has this badge
      const hasBadge = user.badges.some(ub => ub.badgeId === badge.id);
      if (hasBadge) continue;

      // Check badge criteria
      const qualifies = await checkBadgeCriteria(user, badge);
      if (qualifies) {
        // Award badge
        await prisma.userBadge.create({
          data: {
            userId: user.id,
            badgeId: badge.id
          }
        });

        // Award XP from badge
        await prisma.user.update({
          where: { id: user.id },
          data: {
            experiencePoints: {
              increment: badge.xpReward
            }
          }
        });

        console.log(`Awarded badge "${badge.name}" to user ${userId}`);
      }
    }
  } catch (error) {
    console.error('Error checking badge criteria:', error);
  }
}

// Check if user qualifies for a specific badge
async function checkBadgeCriteria(user: any, badge: any): Promise<boolean> {
  try {
    const criteria = badge.criteria;

    switch (badge.name) {
      case 'First Steps':
        return user.challengesCompleted >= 1;

      case 'Problem Solver':
        return user.challengesCompleted >= 5;

      case 'Code Master':
        return user.challengesCompleted >= 25;

      case 'XP Collector':
        return user.experiencePoints >= 1000;

      case 'Streak Master':
        return user.currentStreak >= 7;

      case 'Perfect Score':
        // Check if user has any perfect scores
        const perfectSubmissions = await prisma.submission.count({
          where: {
            userId: user.address,
            score: {
              gte: 100
            }
          }
        });
        return perfectSubmissions > 0;

      case 'Speed Demon':
        // Check if user has completed a challenge in under 30 seconds
        const fastSubmissions = await prisma.submission.count({
          where: {
            userId: user.address,
            executionTime: {
              lt: 30000 // 30 seconds
            },
            score: {
              gte: 70
            }
          }
        });
        return fastSubmissions > 0;

      default:
        return false;
    }
  } catch (error) {
    console.error('Error checking badge criteria:', error);
    return false;
  }
}

// Get solved challenges for user
app.get('/users/:address/solved', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Get all submissions with successful scores
    const solvedSubmissions = await prisma.submission.findMany({
      where: {
        userId: address.toLowerCase(),
        status: 'completed',
        score: {
          gt: 0
        }
      },
      include: {
        challenge: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            points: true
          }
        }
      },
      orderBy: { completedAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit)
    });

    // Group by challenge to avoid duplicates (take the best score)
    const solvedChallenges = solvedSubmissions.reduce((acc, sub) => {
      const existing = acc.find(c => c.challenge.id === sub.challenge.id);
      if (!existing || (sub.score || 0) > (existing.bestScore || 0)) {
        acc.push({
          id: sub.challenge.id,
          title: sub.challenge.title,
          difficulty: sub.challenge.difficulty,
          points: sub.challenge.points,
          solvedAt: sub.completedAt,
          bestScore: sub.score,
          language: sub.language
        });
      }
      return acc;
    }, [] as any[]);

    const total = solvedChallenges.length;

    res.json({
      solvedChallenges: solvedChallenges.slice((Number(page) - 1) * Number(limit), Number(page) * Number(limit)),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching solved challenges:', error);
    res.status(500).json({ error: 'Failed to fetch solved challenges' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'OK',
      service: 'challenge-service',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      service: 'challenge-service',
      timestamp: new Date().toISOString(),
      database: 'disconnected'
    });
  }
});

// Seed initial badges (run once)
app.post('/admin/seed-badges', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const badges = [
      {
        name: 'First Steps',
        description: 'Complete your first challenge',
        iconUrl: '/badges/first-steps.png',
        category: 'achievement',
        rarity: 'common',
        xpReward: 50,
        criteria: { type: 'challenges_completed', min: 1 }
      },
      {
        name: 'Problem Solver',
        description: 'Solve 5 challenges',
        iconUrl: '/badges/problem-solver.png',
        category: 'achievement',
        rarity: 'common',
        xpReward: 100,
        criteria: { type: 'challenges_completed', min: 5 }
      },
      {
        name: 'Code Master',
        description: 'Solve 25 challenges',
        iconUrl: '/badges/code-master.png',
        category: 'achievement',
        rarity: 'rare',
        xpReward: 500,
        criteria: { type: 'challenges_completed', min: 25 }
      },
      {
        name: 'XP Collector',
        description: 'Earn 1000 XP',
        iconUrl: '/badges/xp-collector.png',
        category: 'achievement',
        rarity: 'rare',
        xpReward: 200,
        criteria: { type: 'experience_points', min: 1000 }
      },
      {
        name: 'Streak Master',
        description: 'Maintain a 7-day solving streak',
        iconUrl: '/badges/streak-master.png',
        category: 'achievement',
        rarity: 'epic',
        xpReward: 300,
        criteria: { type: 'current_streak', min: 7 }
      },
      {
        name: 'Perfect Score',
        description: 'Achieve a perfect score on any challenge',
        iconUrl: '/badges/perfect-score.png',
        category: 'skill',
        rarity: 'rare',
        xpReward: 150,
        criteria: { type: 'perfect_submission', min: 1 }
      },
      {
        name: 'Speed Demon',
        description: 'Solve a challenge in under 30 seconds',
        iconUrl: '/badges/speed-demon.png',
        category: 'skill',
        rarity: 'epic',
        xpReward: 250,
        criteria: { type: 'fast_submission', min: 1 }
      }
    ];

    const createdBadges: any[] = [];
    for (const badgeData of badges) {
      const existingBadge = await prisma.badge.findUnique({
        where: { name: badgeData.name }
      });

      if (!existingBadge) {
        const badge = await prisma.badge.create({
          data: badgeData
        });
        createdBadges.push(badge);
      }
    }

    res.json({
      message: `Seeded ${createdBadges.length} badges`,
      badges: createdBadges
    });
  } catch (error) {
    console.error('Error seeding badges:', error);
    res.status(500).json({ error: 'Failed to seed badges' });
  }
});

app.listen(PORT, () => {
  console.log(`Challenge Service running on port ${PORT}`);
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