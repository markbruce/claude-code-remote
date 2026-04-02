/**
 * 机器管理路由API测试
 */

import request from 'supertest';
import { app, prisma } from '../setup';
import { HTTP_STATUS } from '@cc-remote/shared';

describe('Machines Routes', () => {
  let authToken: string;
  let userId: string;

  beforeEach(async () => {
    // Register a test user
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'machineuser@example.com',
        password: 'password123',
        username: 'machineuser'
      });
    authToken = response.body.token;
    userId = response.body.user.id;
  });

  describe('POST /api/machines/bind', () => {
    it('should bind a new machine successfully', async () => {
      const response = await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Office PC',
          hostname: 'office-pc'
        });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body).toHaveProperty('machine_id');
      expect(response.body).toHaveProperty('machine_token');
      expect(response.body.machine_token.startsWith('mkt_')).toBe(true);
    });

    it('should reject binding without auth token', async () => {
      const response = await request(app)
        .post('/api/machines/bind')
        .send({
          name: 'Office PC',
          hostname: 'office-pc'
        });

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('should reject binding with empty name', async () => {
      const response = await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: '',
          hostname: 'office-pc'
        });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    });

    it('should reject binding with empty hostname', async () => {
      const response = await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Office PC',
          hostname: ''
        });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    });

    it('should reject duplicate hostname for same user', async () => {
      // First binding
      await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Office PC 1',
          hostname: 'office-pc'
        });

      // Second binding with same hostname
      const response = await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Office PC 2',
          hostname: 'office-pc'
        });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.message).toContain('已被绑定');
    });

    it('should allow same hostname for different users', async () => {
      // First user binding
      await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Office PC',
          hostname: 'shared-pc'
        });

      // Register second user
      const response2 = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'machineuser2@example.com',
          password: 'password123'
        });
      const token2 = response2.body.token;

      // Second user binding with same hostname
      const response = await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${token2}`)
        .send({
          name: 'Office PC',
          hostname: 'shared-pc'
        });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
    });
  });

  describe('GET /api/machines', () => {
    beforeEach(async () => {
      // Create some machines
      await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Home PC',
          hostname: 'home-pc'
        });

      await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Office PC',
          hostname: 'office-pc'
        });
    });

    it('should list all machines for authenticated user', async () => {
      const response = await request(app)
        .get('/api/machines')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should reject listing without auth token', async () => {
      const response = await request(app)
        .get('/api/machines');

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('should return empty array for user with no machines', async () => {
      // Register a new user with no machines
      const response2 = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'nomachines@example.com',
          password: 'password123'
        });
      const token2 = response2.body.token;

      const response = await request(app)
        .get('/api/machines')
        .set('Authorization', `Bearer ${token2}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/machines/:id', () => {
    let machineId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test PC',
          hostname: 'test-pc'
        });
      machineId = response.body.machine_id;
    });

    it('should get machine by ID', async () => {
      const response = await request(app)
        .get(`/api/machines/${machineId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.id).toBe(machineId);
      expect(response.body.name).toBe('Test PC');
      expect(response.body.hostname).toBe('test-pc');
    });

    it('should return 404 for non-existent machine', async () => {
      const response = await request(app)
        .get('/api/machines/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it('should reject access to other user\'s machine', async () => {
      // Create another user
      const response2 = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'otheruser@example.com',
          password: 'password123'
        });
      const token2 = response2.body.token;

      // Try to access first user's machine
      const response = await request(app)
        .get(`/api/machines/${machineId}`)
        .set('Authorization', `Bearer ${token2}`);

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });
  });

  describe('DELETE /api/machines/:id', () => {
    let machineId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'To Delete PC',
          hostname: 'to-delete-pc'
        });
      machineId = response.body.machine_id;
    });

    it('should delete machine successfully', async () => {
      const response = await request(app)
        .delete(`/api/machines/${machineId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.message).toContain('已解绑');

      // Verify machine is deleted
      const response2 = await request(app)
        .get(`/api/machines/${machineId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response2.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it('should return 404 when deleting non-existent machine', async () => {
      const response = await request(app)
        .delete('/api/machines/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });
  });

  describe('POST /api/machines/:id/regenerate-token', () => {
    let machineId: string;
    let oldToken: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Regenerate PC',
          hostname: 'regenerate-pc'
        });
      machineId = response.body.machine_id;
      oldToken = response.body.machine_token;
    });

    it('should regenerate machine token successfully', async () => {
      const response = await request(app)
        .post(`/api/machines/${machineId}/regenerate-token`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toHaveProperty('machine_token');
      expect(response.body.machine_token).not.toBe(oldToken);
      expect(response.body.machine_token.startsWith('mkt_')).toBe(true);
    });

    it('should return 404 for non-existent machine', async () => {
      const response = await request(app)
        .post('/api/machines/non-existent-id/regenerate-token')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });
  });
});
