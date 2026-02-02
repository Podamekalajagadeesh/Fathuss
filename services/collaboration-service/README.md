# Real-Time Collaboration Service

WebSocket-based service for real-time collaborative code editing with presence awareness, live cursor tracking, and instant code synchronization.

## Port
4009

## Features

### Real-Time Code Synchronization
- **Instant Updates**: Changes propagate to all users in < 100ms
- **Conflict-Free**: Operational transformation handles simultaneous edits
- **Code History**: Complete change history with timestamps
- **Undo/Redo Compatible**: Full change tracking for client-side undo/redo

### Presence Awareness
- **User List**: See who's editing in real-time
- **Cursor Tracking**: See exact cursor position of each user
- **User Colors**: Each user has distinct color for identification
- **Selection Awareness**: See what code other users have selected
- **Activity Status**: Know who is actively typing vs idle

### Session Management
- **Auto-Cleanup**: Empty sessions automatically cleaned up
- **Session Persistence**: Sessions persisted to Redis (24 hour TTL)
- **Join History**: Track who joined/left when
- **Multi-Challenge**: Support concurrent sessions for different challenges

## REST API Endpoints

### POST /sessions
Create a new collaborative session.

**Request:**
```json
{
  "challengeId": "challenge-123",
  "language": "javascript",
  "initialCode": "function hello() {}"
}
```

**Response:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "challengeId": "challenge-123",
  "language": "javascript",
  "initialCode": "function hello() {}",
  "joinUrl": "/sessions/550e8400-e29b-41d4-a716-446655440000/join",
  "wsUrl": "ws://localhost:4009/ws?sessionId=550e8400-e29b-41d4-a716-446655440000"
}
```

### GET /sessions
List all active collaborative sessions.

**Query Parameters:**
- `challengeId` (optional): Filter by challenge

**Response:**
```json
{
  "activeSessions": [
    {
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "challengeId": "challenge-123",
      "userCount": 2,
      "createdAt": "2024-01-15T10:30:00Z",
      "lastModified": "2024-01-15T10:35:45Z"
    }
  ],
  "total": 1
}
```

### GET /sessions/:sessionId
Get details of a specific session.

**Response:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "challengeId": "challenge-123",
  "language": "javascript",
  "code": "function hello() { console.log('hi'); }",
  "users": ["user-1", "user-2"],
  "presence": [
    {
      "userId": "user-1",
      "username": "alice",
      "cursor": { "line": 1, "column": 15 },
      "color": "#FF6B6B",
      "lastActive": "2024-01-15T10:35:45Z"
    }
  ],
  "lastModified": "2024-01-15T10:35:45Z",
  "historyLength": 42
}
```

### POST /sessions/:sessionId/join
Join an existing collaborative session.

**Response:**
```json
{
  "success": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "code": "function hello() {}",
  "users": ["user-1", "user-2"],
  "joinedAt": "2024-01-15T10:35:45Z"
}
```

### POST /sessions/:sessionId/leave
Leave a collaborative session.

**Response:**
```json
{
  "success": true,
  "message": "Left session"
}
```

### GET /sessions/:sessionId/history
Get change history for a session.

**Query Parameters:**
- `limit`: Max changes to return (default: 100, max: 1000)
- `offset`: Pagination offset (default: 0)

**Response:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "total": 150,
  "offset": 0,
  "limit": 100,
  "changes": [
    {
      "id": "change-1",
      "userId": "user-1",
      "operation": "insert",
      "position": 15,
      "content": "console.log('hi');",
      "timestamp": "2024-01-15T10:35:45Z"
    }
  ]
}
```

## WebSocket API

### Connection
```javascript
const ws = new WebSocket('ws://localhost:4009');
```

### Message Types

#### Join Session
```json
{
  "type": "join",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-1",
  "username": "Alice"
}
```

**Response (from server):**
```json
{
  "type": "joined",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "code": "function hello() {}",
  "language": "javascript",
  "users": ["user-1", "user-2"],
  "userColor": "#FF6B6B",
  "presence": [
    {
      "userId": "user-1",
      "username": "alice",
      "cursor": { "line": 0, "column": 0 },
      "color": "#FF6B6B"
    }
  ]
}
```

#### Code Change
```json
{
  "type": "code_change",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-1",
  "username": "Alice",
  "operation": "insert",
  "position": 15,
  "content": "console.log('hi');"
}
```

**Server broadcasts to others:**
```json
{
  "type": "code_changed",
  "userId": "user-1",
  "change": {
    "id": "change-123",
    "userId": "user-1",
    "operation": "insert",
    "position": 15,
    "content": "console.log('hi');",
    "timestamp": "2024-01-15T10:35:45Z"
  }
}
```

#### Cursor Update
```json
{
  "type": "cursor_update",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-1",
  "username": "Alice",
  "cursor": { "line": 2, "column": 10 }
}
```

**Server broadcasts to others:**
```json
{
  "type": "cursor_update",
  "userId": "user-1",
  "cursor": { "line": 2, "column": 10 },
  "color": "#FF6B6B",
  "username": "alice"
}
```

#### Selection Update
```json
{
  "type": "selection_update",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-1",
  "username": "Alice",
  "selection": {
    "start": { "line": 2, "column": 5 },
    "end": { "line": 2, "column": 20 }
  }
}
```

#### User Joined Notification
```json
{
  "type": "user_joined",
  "userId": "user-2",
  "username": "bob",
  "userColor": "#4ECDC4",
  "users": ["user-1", "user-2"]
}
```

#### User Left Notification
```json
{
  "type": "user_left",
  "userId": "user-2",
  "users": ["user-1"]
}
```

#### Disconnect
```json
{
  "type": "disconnect"
}
```

## Client Integration Example

```javascript
class CollaborationClient {
  constructor(sessionId, userId, username) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.username = username;
    this.ws = null;
    this.userColor = null;
    this.remoteUsers = new Map();
  }

  connect() {
    this.ws = new WebSocket(
      `ws://localhost:4009?sessionId=${this.sessionId}`
    );

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onopen = () => {
      this.join();
    };
  }

  join() {
    this.send({
      type: 'join',
      sessionId: this.sessionId,
      userId: this.userId,
      username: this.username
    });
  }

  sendCodeChange(operation, position, content) {
    this.send({
      type: 'code_change',
      sessionId: this.sessionId,
      userId: this.userId,
      username: this.username,
      operation,
      position,
      content
    });
  }

  sendCursorUpdate(line, column) {
    this.send({
      type: 'cursor_update',
      sessionId: this.sessionId,
      userId: this.userId,
      username: this.username,
      cursor: { line, column }
    });
  }

  handleMessage(message) {
    switch (message.type) {
      case 'joined':
        this.userColor = message.userColor;
        this.handleJoined(message);
        break;
      case 'code_changed':
        this.handleCodeChanged(message.change);
        break;
      case 'cursor_update':
        this.updateRemoteCursor(message);
        break;
      case 'user_joined':
        this.handleUserJoined(message);
        break;
      case 'user_left':
        this.handleUserLeft(message);
        break;
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect() {
    this.send({ type: 'disconnect' });
    if (this.ws) {
      this.ws.close();
    }
  }

  // Override these in your implementation
  handleJoined(message) {}
  handleCodeChanged(change) {}
  updateRemoteCursor(message) {}
  handleUserJoined(message) {}
  handleUserLeft(message) {}
}
```

## Environment Variables

```env
PORT=4009
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Installation

```bash
npm install
```

## Running

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

## Performance

- **Latency**: Sub-100ms message delivery
- **Scalability**: Redis pub/sub for multi-instance support
- **Memory**: Efficient in-memory storage with Redis persistence
- **Bandwidth**: Minimal delta transmission (only changes)

## Features by Component

### Code Editor Integration
- Monaco Editor support
- Syntax highlighting preservation
- Cursor decorations
- Selection highlights

### Conflict Resolution
- Operational Transformation compatible
- Sequential change application
- Deterministic merging
- No data loss

### User Experience
- Smooth animations for remote cursors
- User color coding for identification
- Activity indicators
- Automatic reconnection

## Future Enhancements

- CRDT-based (Conflict-free Replicated Data Type) implementation
- Voice/video integration
- Code comments and annotations
- Collaborative debugging
- Pair programming statistics
- Session recording and playback
- WebRTC P2P signaling
- Offline support with sync
