import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4002;

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

// Get all challenges
app.get('/challenges', authenticateToken, async (req, res) => {
  try {
    const { category, difficulty, page = 1, limit = 10 } = req.query;

    // TODO: Fetch from database with filters
    const challenges = [
      {
        id: '1',
        title: 'Simple Storage',
        description: 'Create a simple storage contract',
        category: 'Smart Contracts',
        difficulty: 'Beginner',
        points: 100,
        timeLimit: 30,
        hints: ['Use state variables', 'Implement getter/setter functions'],
        testCases: 5,
        createdAt: new Date().toISOString()
      },
      {
        id: '2',
        title: 'Reentrancy Attack',
        description: 'Fix a vulnerable contract',
        category: 'Security',
        difficulty: 'Advanced',
        points: 500,
        timeLimit: 60,
        hints: ['Check for reentrancy guards', 'Use mutex pattern'],
        testCases: 8,
        createdAt: new Date().toISOString()
      }
    ];

    res.json({
      challenges,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: challenges.length
      }
    });
  } catch (error) {
    console.error('Error fetching challenges:', error);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

// Get specific challenge
app.get('/challenges/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // TODO: Fetch from database
    const challenge = {
      id,
      title: 'Simple Storage',
      description: 'Create a simple storage contract that allows storing and retrieving a value.',
      category: 'Smart Contracts',
      difficulty: 'Beginner',
      points: 100,
      timeLimit: 30,
      starterCode: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleStorage {
    uint256 private storedValue;

    // TODO: Implement store and retrieve functions
}`,
      hints: [
        { id: '1', text: 'Use state variables to store data', cost: 10 },
        { id: '2', text: 'Implement getter and setter functions', cost: 20 }
      ],
      testCases: [
        { input: 'store(42)', expected: 'storedValue == 42' },
        { input: 'retrieve()', expected: 'returns 42' }
      ]
    };

    res.json(challenge);
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

    // TODO: Send to grader service
    const result = {
      challengeId: id,
      userId: (req as any).user.id,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      score: null,
      feedback: null
    };

    res.json(result);
  } catch (error) {
    console.error('Error submitting solution:', error);
    res.status(500).json({ error: 'Failed to submit solution' });
  }
});

// Get submission results
app.get('/submissions/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // TODO: Fetch from database
    const submission = {
      id,
      challengeId: '1',
      userId: (req as any).user.id,
      status: 'completed',
      score: 85,
      feedback: 'Good job! All tests passed.',
      submittedAt: new Date().toISOString(),
      gradedAt: new Date().toISOString()
    };

    res.json(submission);
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'challenge-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Challenge Service running on port ${PORT}`);
});