import request from 'supertest';
import app from '../src/index';

describe('API Gateway', () => {
  it('should return health check', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
  });

  it('should return 401 for protected route without token', async () => {
    const response = await request(app).get('/protected');
    expect(response.status).toBe(401);
  });
});