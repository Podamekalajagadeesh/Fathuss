import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import WebSocket from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from 'redis';
import { LogootCRDT, CrdtOperation, CollaborativeMessage, createSyncMessage, createFullSyncMessage } from './crdt';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4009;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Redis for session and presence management
const redis = createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379')
});

redis.on('error', (err) => console.log('Redis Client Error', err));
redis.connect().catch(console.error);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Interfaces
interface CollaborativeSession {
  id: string;
  challengeId: string;
  users: Set<string>;
  crdt: LogootCRDT;
  language: string;
  createdAt: Date;
  lastModified: Date;
  history: CrdtOperation[];
}

interface UserPresence {
  userId: string;
  username: string;
  cursor: { line: number; column: number };
  color: string;
  lastActive: Date;
}

// In-memory session storage (use Redis for production)
const sessions = new Map<string, CollaborativeSession>();
const presenceData = new Map<string, Map<string, UserPresence>>();
const wsConnections = new Map<WebSocket, { sessionId: string; userId: string }>();

// Color palette for user cursors
const COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA07A',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E2'
];

// Auth middleware
const authenticateToken = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  (req as any).user = { id: 'user-123', username: 'user-123' };
  next();
};

// REST ENDPOINTS

/**
 * Create a new collaborative session
 */
app.post('/sessions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { challengeId, language = 'javascript', initialCode = '' } = req.body;

    if (!challengeId) {
      return res.status(400).json({ error: 'Challenge ID is required' });
    }

    const sessionId = uuidv4();
    const crdt = new LogootCRDT(sessionId);
    
    // Initialize CRDT with code
    if (initialCode) {
      for (let i = 0; i < initialCode.length; i++) {
        crdt.insert(initialCode[i], i);
      }
    }

    const session: CollaborativeSession = {
      id: sessionId,
      challengeId,
      users: new Set([(req as any).user.id]),
      crdt,
      language,
      createdAt: new Date(),
      lastModified: new Date(),
      history: crdt.getOperationHistory()
    };

    sessions.set(sessionId, session);
    presenceData.set(sessionId, new Map());

    // Store in Redis for persistence
    await redis.set(
      `session:${sessionId}`,
      JSON.stringify({
        id: sessionId,
        challengeId,
        code: initialCode,
        language,
        crdt: crdt.toJSON(),
        createdAt: session.createdAt.toISOString()
      }),
      { EX: 86400 } // 24 hour expiry
    );

    res.status(201).json({
      sessionId,
      challengeId,
      language,
      initialCode,
      joinUrl: `/sessions/${sessionId}/join`,
      wsUrl: `ws://localhost:${PORT}/ws?sessionId=${sessionId}`
    });
  } catch (error: any) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * Get session details
 */
app.get('/sessions/:sessionId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const presence = presenceData.get(sessionId);
    const users = Array.from(presence?.values() || []);

    res.json({
      sessionId,
      challengeId: session.challengeId,
      language: session.language,
      code: session.code,
      users: Array.from(session.users),
      presence: users,
      lastModified: session.lastModified,
      historyLength: session.history.length
    });
  } catch (error: any) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

/**
 * Join an existing session
 */
app.post('/sessions/:sessionId/join', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user.id;

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.users.add(userId);

    // Store join in Redis
    await redis.lpush(`session:${sessionId}:events`, JSON.stringify({
      type: 'user_joined',
      userId,
      timestamp: new Date().toISOString()
    }));

    res.json({
      success: true,
      sessionId,
      code: session.code,
      users: Array.from(session.users),
      joinedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error joining session:', error);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

/**
 * Leave a session
 */
app.post('/sessions/:sessionId/leave', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user.id;

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.users.delete(userId);
    presenceData.get(sessionId)?.delete(userId);

    // Broadcast user left event
    broadcastToSession(sessionId, {
      type: 'user_left',
      userId,
      remainingUsers: Array.from(session.users)
    });

    // Delete session if empty
    if (session.users.size === 0) {
      sessions.delete(sessionId);
      presenceData.delete(sessionId);
    }

    res.json({ success: true, message: 'Left session' });
  } catch (error: any) {
    console.error('Error leaving session:', error);
    res.status(500).json({ error: 'Failed to leave session' });
  }
});

/**
 * Get collaboration history
 */
app.get('/sessions/:sessionId/history', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { limit = '100', offset = '0' } = req.query;

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const limitNum = Math.min(parseInt(limit as string) || 100, 1000);
    const offsetNum = parseInt(offset as string) || 0;

    const history = session.history.slice(offsetNum, offsetNum + limitNum);

    res.json({
      sessionId,
      total: session.history.length,
      offset: offsetNum,
      limit: limitNum,
      changes: history
    });
  } catch (error: any) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * Get active sessions
 */
app.get('/sessions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { challengeId } = req.query;

    let activeSessions = Array.from(sessions.values()).map(session => ({
      sessionId: session.id,
      challengeId: session.challengeId,
      userCount: session.users.size,
      createdAt: session.createdAt,
      lastModified: session.lastModified
    }));

    if (challengeId) {
      activeSessions = activeSessions.filter(s => s.challengeId === challengeId);
    }

    res.json({
      activeSessions,
      total: activeSessions.length
    });
  } catch (error: any) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * Get CRDT state of a session
 */
app.get('/sessions/:id/crdt', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = sessions.get(id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      sessionId: session.id,
      text: session.crdt.getText(),
      operationCount: session.crdt.getOperationHistory().length,
      characterCount: session.crdt.getCharacters().length,
      crdt: session.crdt.toJSON(),
      participants: Array.from(session.users),
      lastModified: session.lastModified
    });
  } catch (error: any) {
    console.error('Error fetching CRDT state:', error);
    res.status(500).json({ error: 'Failed to fetch CRDT state' });
  }
});

// WEBSOCKET ENDPOINTS

wss.on('connection', (ws: WebSocket) => {
  console.log('New WebSocket connection');

  // Handle incoming messages
  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(ws, data);
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    handleWebSocketClose(ws);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function handleWebSocketMessage(ws: WebSocket, data: any) {
  const { type, sessionId, userId, username, ...payload } = data;

  switch (type) {
    case 'join':
      handleWebSocketJoin(ws, sessionId, userId, username);
      break;

    case 'code_change':
      handleCodeChange(ws, sessionId, userId, payload);
      break;

    case 'cursor_update':
      handleCursorUpdate(sessionId, userId, payload.cursor);
      break;

    case 'selection_update':
      handleSelectionUpdate(sessionId, userId, payload.selection);
      break;

    case 'disconnect':
      ws.close();
      break;

    default:
      console.warn('Unknown message type:', type);
  }
}

function handleWebSocketJoin(ws: WebSocket, sessionId: string, userId: string, username: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Session not found'
    }));
    return;
  }

  // Store connection info
  wsConnections.set(ws, { sessionId, userId });

  // Initialize presence for user
  if (!presenceData.has(sessionId)) {
    presenceData.set(sessionId, new Map());
  }

  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const presence: UserPresence = {
    userId,
    username: username || userId,
    cursor: { line: 0, column: 0 },
    color,
    lastActive: new Date()
  };

  presenceData.get(sessionId)!.set(userId, presence);

  // Send initial state
  ws.send(JSON.stringify({
    type: 'joined',
    sessionId,
    code: session.code,
    language: session.language,
    users: Array.from(session.users),
    userColor: color,
    presence: Array.from(presenceData.get(sessionId)!.values())
  }));

  // Broadcast user joined
  broadcastToSession(sessionId, {
    type: 'user_joined',
    userId,
    username,
    userColor: color,
    users: Array.from(session.users)
  });

  console.log(`User ${username} joined session ${sessionId}`);
}

function handleCodeChange(ws: WebSocket, sessionId: string, userId: string, payload: any) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const { operation, position, content } = payload;
  let crdtOperation: CrdtOperation | null = null;

  try {
    // Apply operation using CRDT
    if (operation === 'insert') {
      crdtOperation = session.crdt.insert(content, position);
    } else if (operation === 'delete') {
      crdtOperation = session.crdt.delete(position);
    }

    // Update history
    if (crdtOperation) {
      session.history.push(crdtOperation);
    }

    session.lastModified = new Date();

    // Prepare sync message
    const syncMessage: CollaborativeMessage = {
      type: 'sync',
      sessionId,
      clientId: userId,
      payload: { operations: [crdtOperation] },
      timestamp: Date.now()
    };

    // Broadcast to other users
    broadcastToSession(sessionId, {
      type: 'code_changed',
      userId,
      operation: crdtOperation,
      text: session.crdt.getText() // Include current text for consistency
    }, userId);

    console.log(`CRDT operation applied in session ${sessionId}: ${operation} at position ${position}`);
  } catch (error) {
    console.error('Error applying CRDT operation:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to apply code change'
    }));
  }
}

interface CodeChange {
  id: string;
  userId: string;
  operation: 'insert' | 'delete';
  position: number;
  content: string;
  timestamp: Date;
}
  const presence = presenceData.get(sessionId);
  if (presence && presence.has(userId)) {
    const userPresence = presence.get(userId)!;
    userPresence.cursor = cursor;
    userPresence.lastActive = new Date();

    // Broadcast cursor update
    broadcastToSession(sessionId, {
      type: 'cursor_update',
      userId,
      cursor,
      color: userPresence.color,
      username: userPresence.username
    });
  }
}

function handleSelectionUpdate(sessionId: string, userId: string, selection: any) {
  // Broadcast selection
  broadcastToSession(sessionId, {
    type: 'selection_update',
    userId,
    selection
  });
}

function handleWebSocketClose(ws: WebSocket) {
  const connection = wsConnections.get(ws);
  if (!connection) return;

  const { sessionId, userId } = connection;
  const session = sessions.get(sessionId);

  if (session) {
    // Remove from presence
    presenceData.get(sessionId)?.delete(userId);

    // Broadcast user left
    broadcastToSession(sessionId, {
      type: 'user_left',
      userId,
      users: Array.from(session.users)
    });
  }

  wsConnections.delete(ws);
  console.log(`User ${userId} disconnected from session ${sessionId}`);
}

function broadcastToSession(sessionId: string, message: any, excludeUserId?: string) {
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      const connection = wsConnections.get(client);
      if (connection && connection.sessionId === sessionId) {
        if (!excludeUserId || excludeUserId !== connection.userId) {
          client.send(JSON.stringify(message));
        }
      }
    }
  });
}

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    service: 'collaboration-service',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    activeSessions: sessions.size,
    activeConnections: wsConnections.size
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down collaboration service...');
  await redis.quit();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`Collaboration Service running on port ${PORT}`);
  console.log(`WebSocket server listening at ws://localhost:${PORT}`);
});
