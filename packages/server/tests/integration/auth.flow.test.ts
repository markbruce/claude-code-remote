/**
 * 室整认证流程集成测试
 */

import request from 'supertest';
import { io } from 'socket.io-client';
import { app, prisma, from '../setup';
import { generateToken } from '../../src/auth';
import { hashMachineToken, from '../../src/auth';
import { HTTP_STATUS, SocketNamespaces, SocketEvents } from '@cc-remote/shared';

describe('Authentication Flow Integration Tests', () => {
  let authToken: string;
  let userId: string;
  let machineId: string;
  let machineToken: string;

  beforeAll(async () => {
    // Clear database
    await prisma.sessionLog.deleteMany();
    await prisma.project.deleteMany();
    await prisma.machine.deleteMany();
    await prisma.user.deleteMany();

    // Create test user
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'integration@example.com',
        password: 'password123',
        username: 'integrationuser'
      });

    authToken = registerResponse.body.token;
    userId = registerResponse.body.user.id;
  });

  describe('User Registration and Machine Binding', () => {
    it('should register user, create machine, then bind machine to user', async () => {
      // Register user and create machine
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'binduser@example.com',
          password: 'password123'
        });

      expect(registerResponse.status).toBe(HTTP_STATUS.CREATED);

      const bindResponse = await request(app)
        .post('/api/machines/bind')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Integration Test Machine',
          hostname: 'integration-test-host'
        });

      expect(bindResponse.status).toBe(HTTP_STATUS.CREATED);
      expect(bindResponse.body).toHaveProperty('machine_id');
      expect(bindResponse.body).toHaveProperty('machine_token');
      expect(bindResponse.body.machine_token.startsWith('mkt_')).toBe(true);
    });
  });

  describe('Machine Connection Flow', () => {
    let agentClient: Socket.ioClient;
    let clientClient: Socket.ioClient;

    beforeEach(async () => {
    // Register user and create machine
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'socket@example.com',
        password: 'password123'
      });

    authToken = registerResponse.body.token;

    // Create machine
    const bindResponse = await request(app)
      .post('/api/machines/bind')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Socket Test Machine',
        hostname: 'socket-test-host'
      });

    machineId = bindResponse.body.machine_id;
    machineToken = bindResponse.body.machine_token;
  });

    afterEach(() => {
    if (agentClient) {
      agentClient.disconnect();
    }
    if (clientClient) {
      clientClient.disconnect();
    }
  });

    afterAll(() => {
    await prisma.sessionLog.deleteMany();
    await prisma.project.deleteMany();
    await prisma.machine.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Agent Authentication', () => {
    it('should authenticate agent successfully', async () => {
    agentClient = io(`${process.env.SERVER_url || 'http://localhost:3001'}${SocketNamespaces.AGENT}`, {
      transports: ['websocket'],
      auth: {
        machineId: machineId,
        machineToken: machineToken
      },
      reconnection: false
    });

    agentClient.on('connect', () => {
      // Connection successful
    });
    agentClient.on('error', (error: {
      console.error('Agent connection error:', error);
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        agentClient.disconnect();
        reject(new Error('Agent connection timeout'));
      }, 10000);

      agentClient.on('connect', () => {
        clearTimeout(timeout);
        resolve(void);
      });

      agentClient.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  describe('Client Authentication', () => {
    it('should authenticate client successfully', async () => {
    clientClient = io(`${process.env.server_url || 'http://localhost:3001'}${SocketNamespaces.CLIENT}`, {
      transports: ['websocket'],
      auth: {
        token: authToken
      },
      reconnection: false
    });
    clientClient.on('connect', () => {
      // Connection successful
    });
    clientClient.on('error', (error) => {
      console.error('Client connection error:', error);
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        clientClient.disconnect();
        reject(new Error('Client connection timeout'));
      }, 10000);

      clientClient.on('connect', () => {
        clearTimeout(timeout);
        resolve(void);
      });

      clientClient.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });
});
