import request from 'supertest';
import app from './index';

describe('User Service', () => {
  it('should return health check', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.service).toBe('user-service');
  });

  it('should return 401 for protected route without token', async () => {
    const response = await request(app).get('/users/0x123');
    expect(response.status).toBe(401);
  });

  // TODO: Add more comprehensive tests with database mocking
});