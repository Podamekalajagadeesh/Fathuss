"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const siwe_1 = require("siwe");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const passport_1 = __importDefault(require("passport"));
const passport_github2_1 = require("passport-github2");
const express_session_1 = __importDefault(require("express-session"));
const express_graphql_1 = require("express-graphql");
const graphql_1 = require("graphql");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
// GraphQL Schema
const schema = (0, graphql_1.buildSchema)(`
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
    challenges: async (args, context) => {
        try {
            const response = await fetch('http://localhost:4002/challenges', {
                headers: { 'Authorization': context.authorization }
            });
            return await response.json();
        }
        catch (error) {
            throw new Error('Failed to fetch challenges');
        }
    },
    leaderboard: async () => {
        try {
            const response = await fetch('http://localhost:4003/leaderboard/global');
            return await response.json();
        }
        catch (error) {
            throw new Error('Failed to fetch leaderboard');
        }
    },
    user: async ({ address }, context) => {
        try {
            const response = await fetch(`http://localhost:4001/users/${address}`, {
                headers: { 'Authorization': context.authorization }
            });
            return await response.json();
        }
        catch (error) {
            throw new Error('Failed to fetch user');
        }
    },
    submitChallenge: async ({ challengeId, code }, context) => {
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
            return data.message || 'Submitted';
        }
        catch (error) {
            throw new Error('Failed to submit challenge');
        }
    }
};
// Passport configuration
passport_1.default.use(new passport_github2_1.Strategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL || "http://localhost:4000/auth/github/callback"
}, function (accessToken, refreshToken, profile, done) {
    // Here you would typically find or create a user in your database
    // For now, we'll just return the profile
    return done(null, profile);
}));
passport_1.default.serializeUser(function (user, done) {
    done(null, user);
});
passport_1.default.deserializeUser(function (user, done) {
    done(null, user);
});
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express_1.default.json());
// Session middleware for OAuth
app.use((0, express_session_1.default)({
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);
// Auth middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};
// RBAC middleware
const requireRole = (roles) => {
    return (req, res, next) => {
        const user = req.user;
        if (!user || !user.role || !roles.includes(user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};
// SIWE Verify endpoint
app.post('/auth/verify', async (req, res) => {
    try {
        const { message, signature } = req.body;
        const siweMessage = new siwe_1.SiweMessage(message);
        const verified = await siweMessage.verify({ signature });
        if (!verified) {
            return res.status(400).json({ error: 'Invalid signature' });
        }
        // Determine role (simple logic: admin if in list, else user)
        const adminAddresses = (process.env.ADMIN_ADDRESSES || '').split(',').map(addr => addr.toLowerCase());
        const role = adminAddresses.includes(siweMessage.address.toLowerCase()) ? 'admin' : 'user';
        // Create JWT token
        const token = jsonwebtoken_1.default.sign({
            address: siweMessage.address,
            chainId: siweMessage.chainId,
            domain: siweMessage.domain,
            role
        }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { address: siweMessage.address } });
    }
    catch (error) {
        console.error('SIWE verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});
// GitHub OAuth routes
app.get('/auth/github', passport_1.default.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', passport_1.default.authenticate('github', { failureRedirect: '/login' }), function (req, res) {
    // Successful authentication, create JWT
    const user = req.user;
    const adminGithubIds = (process.env.ADMIN_GITHUB_IDS || '').split(',').map(id => id.trim());
    const role = adminGithubIds.includes(user.id.toString()) ? 'admin' : 'user';
    const token = jsonwebtoken_1.default.sign({
        githubId: user.id,
        username: user.username,
        email: user.emails?.[0]?.value,
        role
    }, JWT_SECRET, { expiresIn: '24h' });
    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}`);
});
// Protected route example
app.get('/protected', authenticateToken, (req, res) => {
    res.json({ message: 'This is a protected route', user: req.user });
});
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
// GraphQL endpoint
app.use('/graphql', authenticateToken, (0, express_graphql_1.graphqlHTTP)({
    schema: schema,
    rootValue: root,
    graphiql: true, // Enable GraphiQL for development
    context: ({ req }) => ({ authorization: req.headers.authorization })
}));
// User service routes
app.get('/users/:address', authenticateToken, async (req, res) => {
    try {
        const response = await fetch(`http://localhost:4001/users/${req.params.address}`, {
            headers: { 'Authorization': req.headers.authorization }
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: 'User service unavailable' });
    }
});
app.put('/users/:address', authenticateToken, async (req, res) => {
    try {
        const response = await fetch(`http://localhost:4001/users/${req.params.address}`, {
            method: 'PUT',
            headers: {
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: 'User service unavailable' });
    }
});
// Leaderboard routes
app.get('/leaderboard/global', async (req, res) => {
    try {
        const response = await fetch('http://localhost:4003/leaderboard/global');
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: 'Leaderboard service unavailable' });
    }
});
// Marketplace routes
app.get('/marketplace/items', async (req, res) => {
    try {
        const response = await fetch('http://localhost:4004/marketplace/items');
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: 'Marketplace service unavailable' });
    }
});
// Hiring routes
app.get('/jobs', async (req, res) => {
    try {
        const response = await fetch('http://localhost:4005/jobs');
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: 'Hiring service unavailable' });
    }
});
// Grader routes
app.post('/grade', authenticateToken, async (req, res) => {
    try {
        const response = await fetch('http://localhost:4006/grade', {
            method: 'POST',
            headers: {
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: 'Grader service unavailable' });
    }
});
// Admin routes
app.post('/admin/challenges', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const response = await fetch('http://localhost:4002/admin/challenges', {
            method: 'POST',
            headers: {
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create challenge' });
    }
});
app.put('/admin/challenges/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const response = await fetch(`http://localhost:4002/admin/challenges/${req.params.id}`, {
            method: 'PUT',
            headers: {
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update challenge' });
    }
});
// Author routes (for creating content, perhaps challenges or marketplace items)
app.post('/author/challenges', authenticateToken, requireRole(['admin', 'author']), async (req, res) => {
    try {
        const response = await fetch('http://localhost:4002/challenges', {
            method: 'POST',
            headers: {
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create challenge' });
    }
});
// REST endpoints
app.get('/challenges', authenticateToken, async (req, res) => {
    try {
        // Route to challenge service
        const response = await fetch('http://localhost:4002/challenges', {
            headers: {
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
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
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        console.error('Error submitting solution:', error);
        res.status(500).json({ error: 'Failed to submit solution' });
    }
});
app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
});
exports.default = app;
