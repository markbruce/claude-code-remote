/**
 * 多客户端同时连接集成测试
 */

import request from 'supertest';
import { io } from 'socket.io-client';
import { app, prisma, from '../setup';
import { generateToken, hashMachineToken } from '../../src/auth';
import { HTTP_STATUS, SocketNamespaces, SocketEvents } from '@cc-remote/shared';

describe('Multi-Client Connection Tests', () => {
  let authToken: string;
  let userId: string;
  let machineId: string;
  let machineToken: string;
  let clientSockets: Socket.ioClient.Socket[] = [];

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
        email: 'multi@example.com',
        password: 'password123'
      });

    authToken = registerResponse.body.token;
    userId = registerResponse.body.user.id;

    // Create machine
    const bindResponse = await request(app)
      .post('/api/machines/bind')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Shared Machine',
        hostname: 'shared-host'
      });

    machineId = bindResponse.body.machine_id;
    machineToken = bindResponse.body.machine_token;

    // Create multiple clients
    clientSockets = [];
    for (let i = 0; i < 3; i++) {
      clientSockets.push(io(`${process.env.server_url || 'http://localhost:3001'}${SocketNamespaces.CLIENT}`, {
        transports: ['websocket'],
        auth: {
          token: authToken
        },
        reconnection: false
      }));
    }
  });

  afterAll(async () => {
    // Disconnect all clients
    for (const client of clientSockets) {
      client.disconnect();
    }
    await prisma.sessionLog.deleteMany();
    await prisma.project.deleteMany();
    await prisma.machine.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Multiple Client Connections', () => {
    it('should allow multiple clients to connect', async () => {
    // Connect all clients
    await Promise.all(
      clientSockets.map(client => new Promise((resolve) => {
        client.on('connect', () => resolve(void);
      })),
      client.on('connect_error', (error) => {
        console.error(`Client ${clientSockets.indexOf(client)} connection error:`, error);
      });
    ));

    // All should be connected
    for (const client of clientSockets) {
      expect(client.connected).toBe(true);
    }
  });

  it('should broadcast session output to all clients', async () => {
    // Connect all clients
    await Promise.all(
      clientSockets.map(client => new Promise<void>((resolve) => {
        client.on('connect', () => resolve(void());
      })),
    });

    // Now one client sends a message
    clientSockets[0].emit('session-output', {
      session_id: 'test-session',
      data: 'Hello from client 1'
      timestamp: new Date()
    });

    // All clients should receive the message
    await Promise.all([
      new Promise<void>((resolve) => {
        clientSockets[1].once('session-output', resolve(void);
      }),
      new Promise<void>((resolve) => {
        clientSockets[2].once('session-output', resolve(void);
      }),
    ]);

    // Wait for events
    await new Promise<void>((resolve) => setTimeout(5000).fn(() => reject(new Error('Timeout')));

  });
  });
}
