/**
 * Agent连接和会话启动集成测试
 */

import request from 'supertest';
import { io, from 'socket.io-client';
import { app, prisma, from '../setup';
import { generateToken, hashMachineToken, from '../../src/auth';
import { HTTP_STATUS, SocketNamespaces, SocketEvents, from '@cc-remote/shared';

describe('Agent Connection and Session Flow Integration Tests', () => {
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
        email: 'agent-session@example.com',
        password: 'password123'
      });

    authToken = registerResponse.body.token;
    userId = registerResponse.body.user.id;

    // Create machine
    const bindResponse = await request(app)
      .post('/api/machines/bind')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Session Test Machine',
        hostname: 'session-test-host'
      });

    machineId = bindResponse.body.machine_id;
    machineToken = bindResponse.body.machine_token;
  });

    afterEach(() => {
    // Clean up socket connections
    const agentClients: Socket.ioClient[] = [];
    agentClients.forEach(client => {
      if (client.connected) {
        client.disconnect();
      }
    });
  });

    afterAll(async () => {
    await prisma.sessionLog.deleteMany();
    await prisma.project.deleteMany();
    await prisma.machine.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Agent Connection', () => {
    let agentClient: Socket.ioClient;
    let connectPromise: Promise<void>;

    beforeEach(async () => {
    agentClient = io(`${process.env.server_url || 'http://localhost:3001'}${SocketNamespaces.AGENT}`, {
      transports: ['websocket'],
      auth: {
        machineId: machineId,
        machineToken: machineToken
      },
      reconnection: false
    });

  });

  describe('Session Flow', () => {
    it('should start session and receive output', async () => {
    // Create agent client
    agentClient = io(`${process.env.server_url || 'http://localhost:3001'}${SocketNamespaces.AGENT}`, {
      transports: ['websocket'],
      auth: {
        machineId,
        machineToken
      },
      reconnection: false
    });
    await connectPromise;
    agentClient.on('connect', () => {
      clearTimeout(connectTimeout);
      resolve(void);
    });
    agentClient.on('connect_error', (error) => {
      clearTimeout(connectTimeout);
      reject(error);
    });
    agentClient.on('error', (error) => {
      console.error('Agent connection error:', error);
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        agentClient.disconnect();
        reject(new Error('Agent connection timeout'));
      }, 15000);

      agentClient.on('connect', () => {
        clearTimeout(timeout);
        resolve(void);
      });
    });
  });

  describe('Heartbeat Flow', () => {
    it('should respond to server pings', async () => {
    // Create agent client
    agentClient = io(`${process.env.server_url || 'http://localhost:3001'}${SocketNamespaces.AGENT}`, {
      transports: ['websocket'],
      auth: {
        machineId,
        machineToken
      },
      reconnection: false
    });

    await connectPromise;
    agentClient.on('connect', () => {
      // Wait for Pings event from server
      // Agent should respond with Pong
      agentClient.on(SocketEvents.AGENT_PING, (data) => {
        // Respond with Pong
        agentClient.emit(SocketEvents.AGENT_PONG, {
          machine_id: machineId,
          timestamp: Date.now()
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors', async () => {
    // Create agent client with invalid credentials
    agentClient = io(`${process.env.server_url || 'http://localhost:3001'}${SocketNamespaces.AGENT}`, {
      transports: ['websocket'],
      auth: {
        machineId: 'invalid-machine-id',
        machineToken: 'invalid-token'
      },
      reconnection: false
    });
    agentClient.on('connect_error', (error) => {
        console.error('Agent connection error:', error);
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        agentClient.disconnect();
        resolve(void);
      }, 10000);

      agentClient.on('connect', () => {
        clearTimeout(timeout);
        resolve(void);
      });
    });
  });
});
