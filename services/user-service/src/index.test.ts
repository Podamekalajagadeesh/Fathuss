import request from 'supertest';
import app from './index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('User Service', () => {
  beforeAll(async () => {
    // Clean up test data
    await prisma.reputationAudit.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should return health check', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(response.body.service).toBe('user-service');
    expect(response.body.database).toBe('connected');
  });

  it('should return 401 for protected route without token', async () => {
    const response = await request(app).get('/users/0x123');
    expect(response.status).toBe(401);
  });

  it('should create and retrieve user profile', async () => {
    const testAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
    
    // Create user
    const createResponse = await request(app)
      .put(`/users/${testAddress}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        username: 'testuser',
        email: 'test@example.com'
      });
    
    expect(createResponse.status).toBe(200);
    
    // Retrieve user (mock auth for testing)
    const getResponse = await request(app)
      .get(`/users/${testAddress}`)
      .set('Authorization', 'Bearer test-token');
    
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.address).toBe(testAddress.toLowerCase());
  });

  it('should update user reputation and log audit', async () => {
    const testAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44f';
    
    // Create test user
    await prisma.user.create({
      data: {
        address: testAddress.toLowerCase(),
        username: 'reputationtest'
      }
    });
    
    // Update reputation
    const response = await request(app)
      .post(`/users/${testAddress}/reputation`)
      .set('Authorization', 'Bearer test-token')
      .send({
        change: 10,
        reason: 'Test reputation increase'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.change).toBe(10);
    
    // Check audit log
    const audits = await prisma.reputationAudit.findMany({
      where: { user: { address: testAddress.toLowerCase() } }
    });
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0].change).toBe(10);
  });
});