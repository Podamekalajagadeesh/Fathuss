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
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const passport_1 = __importDefault(require("passport"));
const passport_github2_1 = require("passport-github2");
const express_session_1 = __importDefault(require("express-session"));
const express_graphql_1 = require("express-graphql");
const graphql_1 = require("graphql");
const ws_1 = require("ws");
const ws_2 = __importDefault(require("ws"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
// In-memory store for password reset tokens (in production, use Redis or database)
const passwordResetTokens = new Map();
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
const rateLimitStore = new Map();
const advancedRateLimiter = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || '';
    const userId = req.user?.address || 'anonymous';
    // Get or create rate limit entry
    let entry = rateLimitStore.get(clientIP);
    const now = Date.now();
    if (!entry) {
        entry = {
            count: 0,
            firstRequest: now,
            lastRequest: now,
            suspiciousPatterns: {
                rapidRequests: false,
                unusualHours: false,
                multipleUsers: false,
                failedAuthAttempts: 0,
            }
        };
        rateLimitStore.set(clientIP, entry);
    }
    // Update entry
    entry.count++;
    entry.lastRequest = now;
    // Check for suspicious patterns
    const timeSinceFirstRequest = now - entry.firstRequest;
    const requestsPerMinute = (entry.count / timeSinceFirstRequest) * 60000;
    // Rapid requests pattern
    if (requestsPerMinute > 30) { // More than 30 requests per minute
        entry.suspiciousPatterns.rapidRequests = true;
    }
    // Unusual hours (assuming business hours are 6 AM - 10 PM UTC)
    const hour = new Date(now).getUTCHours();
    if (hour < 6 || hour > 22) {
        entry.suspiciousPatterns.unusualHours = true;
    }
    // Multiple users from same IP (potential account sharing)
    if (userId !== 'anonymous') {
        const usersFromIP = Array.from(rateLimitStore.entries())
            .filter(([ip, data]) => ip === clientIP && data !== entry)
            .length;
        if (usersFromIP > 3) {
            entry.suspiciousPatterns.multipleUsers = true;
        }
    }
    // Check if IP is currently blocked
    if (entry.blockedUntil && now < entry.blockedUntil) {
        return res.status(429).json({
            error: 'Too many requests - IP temporarily blocked',
            retryAfter: Math.ceil((entry.blockedUntil - now) / 1000)
        });
    }
    // Calculate risk score
    let riskScore = 0;
    if (entry.suspiciousPatterns.rapidRequests)
        riskScore += 30;
    if (entry.suspiciousPatterns.unusualHours)
        riskScore += 10;
    if (entry.suspiciousPatterns.multipleUsers)
        riskScore += 20;
    if (entry.suspiciousPatterns.failedAuthAttempts > 3)
        riskScore += 25;
    // Dynamic rate limiting based on risk score
    const baseLimit = 100;
    const adjustedLimit = Math.max(10, baseLimit - riskScore);
    if (entry.count > adjustedLimit) {
        // Block IP for increasing durations based on risk
        const blockDuration = riskScore > 50 ? 3600000 : 900000; // 1 hour or 15 minutes
        entry.blockedUntil = now + blockDuration;
        // Log suspicious activity
        console.warn(`Suspicious activity detected from IP ${clientIP}:`, {
            riskScore,
            patterns: entry.suspiciousPatterns,
            requestsPerMinute,
            userAgent: userAgent.substring(0, 100)
        });
        return res.status(429).json({
            error: 'Suspicious activity detected - IP blocked',
            retryAfter: Math.ceil(blockDuration / 1000)
        });
    }
    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance per request
        const cutoff = now - (24 * 60 * 60 * 1000); // 24 hours ago
        for (const [ip, data] of rateLimitStore.entries()) {
            if (data.lastRequest < cutoff) {
                rateLimitStore.delete(ip);
            }
        }
    }
    next();
};
// Apply advanced rate limiting to sensitive endpoints
app.use('/api/graphql', advancedRateLimiter);
app.use('/auth', advancedRateLimiter);
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
app.post('/api/auth/siwe', async (req, res) => {
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
// Email/Password Registration
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, username } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        // Check if user already exists
        const existingUserResponse = await fetch(`http://localhost:4001/users/check?email=${encodeURIComponent(email)}`);
        if (existingUserResponse.ok) {
            return res.status(409).json({ error: 'User already exists' });
        }
        // Hash password
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        // Create user in user service
        const createUserResponse = await fetch('http://localhost:4001/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                passwordHash,
                username,
                role: 'user' // Default role
            })
        });
        if (!createUserResponse.ok) {
            return res.status(500).json({ error: 'Failed to create user' });
        }
        const user = await createUserResponse.json();
        // Create JWT token
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role
        }, JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ token, user: { id: user.id, email: user.email, username: user.username } });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});
// Email/Password Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        // Get user from user service
        const userResponse = await fetch(`http://localhost:4001/users/by-email/${encodeURIComponent(email)}`);
        if (!userResponse.ok) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const user = await userResponse.json();
        // Verify password
        if (!user.passwordHash || !(await bcryptjs_1.default.compare(password, user.passwordHash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Create JWT token
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role
        }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, email: user.email, username: user.username } });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});
// Password Reset Request
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        // Check if user exists
        const userResponse = await fetch(`http://localhost:4001/users/by-email/${encodeURIComponent(email)}`);
        if (!userResponse.ok) {
            // Don't reveal if email exists or not for security
            return res.json({ message: 'If the email exists, a reset link has been sent' });
        }
        // Generate reset token
        const resetToken = crypto_1.default.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        // Store token (in production, save to database)
        passwordResetTokens.set(resetToken, { email, expiresAt });
        // In production, send email with reset link
        // For now, just return the token for testing
        console.log(`Password reset token for ${email}: ${resetToken}`);
        res.json({ message: 'If the email exists, a reset link has been sent' });
    }
    catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});
// Password Reset
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }
        // Verify token
        const tokenData = passwordResetTokens.get(token);
        if (!tokenData || tokenData.expiresAt < new Date()) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }
        // Hash new password
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 12);
        // Update user password
        const updateResponse = await fetch(`http://localhost:4001/users/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: tokenData.email,
                passwordHash
            })
        });
        if (!updateResponse.ok) {
            return res.status(500).json({ error: 'Failed to update password' });
        }
        // Remove used token
        passwordResetTokens.delete(token);
        res.json({ message: 'Password updated successfully' });
    }
    catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
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
app.get('/users/me', authenticateToken, async (req, res) => {
    try {
        const userAddress = req.user.address;
        const response = await fetch(`http://localhost:4001/users/${userAddress}`, {
            headers: { 'Authorization': req.headers.authorization }
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: 'User service unavailable' });
    }
});
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
app.get('/users/:address/badges', authenticateToken, async (req, res) => {
    try {
        const response = await fetch(`http://localhost:4001/users/${req.params.address}/badges`, {
            headers: { 'Authorization': req.headers.authorization }
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
// Admin User Management Endpoints
app.get('/admin/users', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const response = await fetch('http://localhost:4001/admin/users', {
            headers: { 'Authorization': req.headers.authorization }
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
app.put('/admin/users/:userId/role', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;
        if (!['user', 'creator', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be user, creator, or admin' });
        }
        const response = await fetch(`http://localhost:4001/admin/users/${userId}/role`, {
            method: 'PUT',
            headers: {
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role })
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({ error: 'Failed to update user role' });
    }
});
// Author routes (for creating content, perhaps challenges or marketplace items)
app.post('/author/challenges', authenticateToken, requireRole(['admin', 'creator']), async (req, res) => {
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
// GET /api/challenges — list/search challenges
app.get('/api/challenges', authenticateToken, async (req, res) => {
    try {
        const response = await fetch(`http://localhost:4002/challenges?${new URLSearchParams(req.query)}`, {
            headers: { 'Authorization': req.headers.authorization }
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        console.error('Error fetching challenges:', error);
        res.status(500).json({ error: 'Failed to fetch challenges' });
    }
});
// GET /api/challenges/:slug — challenge metadata
app.get('/api/challenges/:slug', authenticateToken, async (req, res) => {
    try {
        const response = await fetch(`http://localhost:4002/challenges/${req.params.slug}`, {
            headers: { 'Authorization': req.headers.authorization }
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        console.error('Error fetching challenge:', error);
        res.status(500).json({ error: 'Failed to fetch challenge' });
    }
});
// GET /challenges/users/:address/solved — user's solved challenges
app.get('/challenges/users/:address/solved', authenticateToken, async (req, res) => {
    try {
        const response = await fetch(`http://localhost:4002/users/${req.params.address}/solved?${new URLSearchParams(req.query)}`, {
            headers: { 'Authorization': req.headers.authorization }
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        console.error('Error fetching solved challenges:', error);
        res.status(500).json({ error: 'Failed to fetch solved challenges' });
    }
});
// POST /api/submissions — submit code for grading
app.post('/api/submissions', authenticateToken, async (req, res) => {
    try {
        const response = await fetch('http://localhost:4006/submit', {
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
        console.error('Error submitting code:', error);
        res.status(500).json({ error: 'Failed to submit code' });
    }
});
// GET /api/submissions/:id — result & artifacts
app.get('/api/submissions/:id', authenticateToken, async (req, res) => {
    try {
        const response = await fetch(`http://localhost:4006/submit/${req.params.id}`, {
            headers: { 'Authorization': req.headers.authorization }
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
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
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
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
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        console.error('Error creating hiring room:', error);
        res.status(500).json({ error: 'Failed to create hiring room' });
    }
});
app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
});
// WebSocket server for real-time job updates
const wss = new ws_1.WebSocketServer({ port: 4008 }); // Use port 4008 for WS on gateway
wss.on('connection', (ws) => {
    console.log('WebSocket client connected to gateway');
    // Connect to grader WS
    const graderWs = new ws_2.default('ws://localhost:4007');
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
exports.default = app;
