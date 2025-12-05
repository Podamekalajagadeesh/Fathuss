const request = require('supertest');
const app = require('./src/index');

describe('Audit Service', () => {
  describe('POST /audit', () => {
    it('should record a valid audit event', async () => {
      const auditEvent = {
        event_type: 'challenge_authorship_change',
        user_id: 'user123',
        resource_id: 'challenge456',
        action: 'update',
        details: {
          old_author: 'user789',
          new_author: 'user123'
        },
        severity: 'medium'
      };

      const response = await request(app)
        .post('/audit')
        .send(auditEvent)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('recorded');
    });

    it('should reject invalid audit event', async () => {
      const invalidEvent = {
        // Missing required event_type
        user_id: 'user123'
      };

      await request(app)
        .post('/audit')
        .send(invalidEvent)
        .expect(400);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /audit/events', () => {
    it('should return audit events', async () => {
      const response = await request(app)
        .get('/audit/events')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should filter events by type', async () => {
      const response = await request(app)
        .get('/audit/events?event_type=challenge_authorship_change')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});