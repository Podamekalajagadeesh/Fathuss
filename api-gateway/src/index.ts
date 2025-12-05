import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { SiweMessage } from 'siwe';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import session from 'express-session';
import { graphqlHTTP } from 'express-graphql';
import { buildSchema } from 'graphql';
import WebSocket from 'ws';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// GraphQL Schema
const schema = buildSchema(`
  type User {
    address: String
    githubId: String
    username: String
    email: String
    role: String
  }

  type Challenge {
    id: String
    title: String
    description: String
  }

  type LeaderboardEntry {
    address: String
    score: Int
  }

  type Query {
    challenges: [Challenge]
    leaderboard: [LeaderboardEntry]
    user(address: String!): User
  }

  type Mutation {
    submitChallenge(challengeId: String!, code: String!): String
  }
`);

// GraphQL Resolvers
const root = {
  challenges: async (args: any, context: any) => {
    try {
      const response = await fetch('http://localhost:4002/challenges', {
        headers: { 'Authorization': context.authorization }
      });
      return await response.json();
    } catch (error) {
      throw new Error('Failed to fetch challenges');
    }
  },
  leaderboard: async () => {
    try {
      const response = await fetch('http://localhost:4003/leaderboard/global');
      return await response.json();
    } catch (error) {
      throw new Error('Failed to fetch leaderboard');
    }
  },
  user: async ({ address }: { address: string }, context: any) => {
    try {
      const response = await fetch(`http://localhost:4001/users/${address}`, {
        headers: { 'Authorization': context.authorization }
      });
      return await response.json();
    } catch (error) {
      throw new Error('Failed to fetch user');
    }
  },
  submitChallenge: async ({ challengeId, code }: { challengeId: string, code: string }, context: any) => {
    try {
      const response = await fetch('http://localhost:4002/challenges/submit', {
        method: 'POST',
        headers: {
          'Authorization': context.authorization,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ challengeId, code })
      });
      const data = await response.json();
      return (data as any).message || 'Submitted';
    } catch (error) {
      throw new Error('Failed to submit challenge');
    }
  }
};

// Passport configuration
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    callbackURL: process.env.GITHUB_CALLBACK_URL || "http://localhost:4000/auth/github/callback"
  },
  function(accessToken: string, refreshToken: string, profile: any, done: any) {
    // Here you would typically find or create a user in your database
    // For now, we'll just return the profile
    return done(null, profile);
  }
));

passport.serializeUser(function(user: any, done) {
  done(null, user);
});

passport.deserializeUser(function(user: any, done) {
  done(null, user);
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Session middleware for OAuth
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

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

// SIWE Verify endpoint
app.post('/api/auth/siwe', async (req, res) => {
  try {
    const { message, signature } = req.body;

    const siweMessage = new SiweMessage(message);
    const verified = await siweMessage.verify({ signature });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Determine role (simple logic: admin if in list, else user)
    const adminAddresses = (process.env.ADMIN_ADDRESSES || '').split(',').map(addr => addr.toLowerCase());
    const role = adminAddresses.includes(siweMessage.address.toLowerCase()) ? 'admin' : 'user';

    // Create JWT token
    const token = jwt.sign(
      {
        address: siweMessage.address,
        chainId: siweMessage.chainId,
        domain: siweMessage.domain,
        role
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

// GitHub OAuth routes
app.get('/auth/github',
  passport.authenticate('github', { scope: ['user:email'] })
);

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, create JWT
    const user = (req as any).user;
    const adminGithubIds = (process.env.ADMIN_GITHUB_IDS || '').split(',').map(id => id.trim());
    const role = adminGithubIds.includes(user.id.toString()) ? 'admin' : 'user';
    const token = jwt.sign(
      {
        githubId: user.id,
        username: user.username,
        email: user.emails?.[0]?.value,
        role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}`);
  }
);

// Protected route example
app.get('/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is a protected route', user: (req as any).user });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// GraphQL endpoint
app.use('/graphql', authenticateToken, graphqlHTTP({
  schema: schema,
  rootValue: root,
  graphiql: true, // Enable GraphiQL for development
  context: ({ req }: any) => ({ authorization: req.headers.authorization })
}));

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

// Admin routes
app.post('/admin/challenges', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const response = await fetch('http://localhost:4002/admin/challenges', {
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
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

app.put('/admin/challenges/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const response = await fetch(`http://localhost:4002/admin/challenges/${req.params.id}`, {
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
    res.status(500).json({ error: 'Failed to update challenge' });
  }
});

// Author routes (for creating content, perhaps challenges or marketplace items)
app.post('/author/challenges', authenticateToken, requireRole(['admin', 'author']), async (req, res) => {
  try {
    const response = await fetch('http://localhost:4002/challenges', {
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
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

// REST endpoints
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

// GET /api/challenges — list/search challenges
app.get('/api/challenges', authenticateToken, async (req, res) => {
  try {
    const response = await fetch(`http://localhost:4002/challenges?${new URLSearchParams(req.query as any)}`, {
      headers: { 'Authorization': req.headers.authorization! }
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching challenges:', error);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

// GET /api/challenges/:slug — challenge metadata
app.get('/api/challenges/:slug', authenticateToken, async (req, res) => {
  try {
    const response = await fetch(`http://localhost:4002/challenges/${req.params.slug}`, {
      headers: { 'Authorization': req.headers.authorization! }
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching challenge:', error);
    res.status(500).json({ error: 'Failed to fetch challenge' });
  }
});

// POST /api/submissions — submit code for grading
app.post('/api/submissions', authenticateToken, async (req, res) => {
  try {
    const response = await fetch('http://localhost:4006/submit', {
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
    console.error('Error submitting code:', error);
    res.status(500).json({ error: 'Failed to submit code' });
  }
});

// GET /api/submissions/:id — result & artifacts
app.get('/api/submissions/:id', authenticateToken, async (req, res) => {
  try {
    const response = await fetch(`http://localhost:4006/submit/${req.params.id}`, {
      headers: { 'Authorization': req.headers.authorization! }
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// POST /api/authors/challenges — create challenge (auth: author)
app.post('/api/authors/challenges', authenticateToken, async (req, res) => {
  try {
    const response = await fetch('http://localhost:4002/challenges', {
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
    console.error('Error creating challenge:', error);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

// POST /api/hire/rooms — create private hiring room
app.post('/api/hire/rooms', authenticateToken, async (req, res) => {
  try {
    const response = await fetch('http://localhost:4004/assessment/rooms', {
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
    console.error('Error creating hiring room:', error);
    res.status(500).json({ error: 'Failed to create hiring room' });
  }
});

});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});

// WebSocket server for real-time job updates
const wss = new WebSocket.Server({ port: 4008 }); // Use port 4008 for WS on gateway

wss.on('connection', (ws: WebSocket) => {
  console.log('WebSocket client connected to gateway');

  // Connect to grader WS
  const graderWs = new WebSocket('ws://localhost:4007');

  graderWs.on('open', () => {
    console.log('Connected to grader WS');
  });

  graderWs.on('message', (data) => {
    ws.send(data);
  });

  graderWs.on('close', () => {
    ws.close();
  });

  graderWs.on('error', (error) => {
    console.error('Grader WS error:', error);
    ws.close();
  });

  ws.on('message', (message) => {
    graderWs.send(message);
  });

  ws.on('close', () => {
    graderWs.close();
  });
});

export default app;