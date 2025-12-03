import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { SiweMessage } from 'siwe';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Auth middleware
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    (req as any).user = user;
    next();
  });
};

// SIWE Verify endpoint
app.post('/auth/verify', async (req, res) => {
  try {
    const { message, signature } = req.body;

    const siweMessage = new SiweMessage(message);
    const verified = await siweMessage.verify({ signature });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Create JWT token
    const token = jwt.sign(
      {
        address: siweMessage.address,
        chainId: siweMessage.chainId,
        domain: siweMessage.domain
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { address: siweMessage.address } });
  } catch (error) {
    console.error('SIWE verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Protected route example
app.get('/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is a protected route', user: (req as any).user });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Placeholder for GraphQL endpoint
app.post('/graphql', authenticateToken, (req, res) => {
  // TODO: Implement GraphQL server
  res.json({ error: 'GraphQL not implemented yet' });
});

// User service routes
app.get('/users/:address', authenticateToken, async (req, res) => {
  try {
    const response = await fetch(`http://localhost:4001/users/${req.params.address}`, {
      headers: { 'Authorization': req.headers.authorization! }
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'User service unavailable' });
  }
});

app.put('/users/:address', authenticateToken, async (req, res) => {
  try {
    const response = await fetch(`http://localhost:4001/users/${req.params.address}`, {
      method: 'PUT',
      headers: {
        'Authorization': req.headers.authorization!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'User service unavailable' });
  }
});

// Leaderboard routes
app.get('/leaderboard/global', async (req, res) => {
  try {
    const response = await fetch('http://localhost:4003/leaderboard/global');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Leaderboard service unavailable' });
  }
});

// Marketplace routes
app.get('/marketplace/items', async (req, res) => {
  try {
    const response = await fetch('http://localhost:4004/marketplace/items');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Marketplace service unavailable' });
  }
});

// Hiring routes
app.get('/jobs', async (req, res) => {
  try {
    const response = await fetch('http://localhost:4005/jobs');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Hiring service unavailable' });
  }
});

// Grader routes
app.post('/grade', authenticateToken, async (req, res) => {
  try {
    const response = await fetch('http://localhost:4006/grade', {
      method: 'POST',
      headers: {
        'Authorization': req.headers.authorization!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Grader service unavailable' });
  }
});

// Placeholder for challenges endpoint
app.get('/challenges', authenticateToken, async (req, res) => {
  try {
    // Route to challenge service
    const response = await fetch('http://localhost:4002/challenges', {
      headers: {
        'Authorization': req.headers.authorization!,
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching challenges:', error);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

app.post('/submit', authenticateToken, async (req, res) => {
  try {
    // Route to challenge service
    const response = await fetch('http://localhost:4002/challenges/submit', {
      method: 'POST',
      headers: {
        'Authorization': req.headers.authorization!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error submitting solution:', error);
    res.status(500).json({ error: 'Failed to submit solution' });
  }
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});