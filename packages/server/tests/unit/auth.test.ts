/**
 * 认证模块单元测试
 */

import {
  generateToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  generateMachineToken,
  hashMachineToken,
  verifyMachineToken,
  JwtPayload
} from '../../src/auth';

describe('Auth Module', () => {
  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const payload: JwtPayload = {
        userId: 'test-user-id',
        email: 'test@example.com'
      };

      const token = generateToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });

    it('should generate different tokens for different payloads', () => {
      const payload1: JwtPayload = {
        userId: 'user-1',
        email: 'user1@example.com'
      };
      const payload2: JwtPayload = {
        userId: 'user-2',
        email: 'user2@example.com'
      };

      const token1 = generateToken(payload1);
      const token2 = generateToken(payload2);

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token and return payload', () => {
      const payload: JwtPayload = {
        userId: 'test-user-id',
        email: 'test@example.com'
      };

      const token = generateToken(payload);
      const decoded = verifyToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.email).toBe(payload.email);
    });

    it('should return null for invalid token', () => {
      const invalidToken = 'invalid.token.here';
      const decoded = verifyToken(invalidToken);

      expect(decoded).toBeNull();
    });

    it('should return null for empty token', () => {
      const decoded = verifyToken('');

      expect(decoded).toBeNull();
    });

    it('should return null for malformed token', () => {
      const decoded = verifyToken('not-a-jwt');

      expect(decoded).toBeNull();
    });
  });

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'test-password-123';
      const hashedPassword = await hashPassword(password);

      expect(hashedPassword).toBeDefined();
      expect(typeof hashedPassword).toBe('string');
      expect(hashedPassword).not.toBe(password);
    });

    it('should generate different hashes for same password (salt)', async () => {
      const password = 'test-password-123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate bcrypt hash format', async () => {
      const password = 'test-password';
      const hash = await hashPassword(password);

      expect(hash.startsWith('$2')).toBe(true);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'correct-password';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'correct-password';
      const wrongPassword = 'wrong-password';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(wrongPassword, hash);

      expect(isValid).toBe(false);
    });

    it('should reject empty password', async () => {
      const password = 'correct-password';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('', hash);

      expect(isValid).toBe(false);
    });
  });

  describe('generateMachineToken', () => {
    it('should generate machine token with correct prefix', () => {
      const token = generateMachineToken();

      expect(token).toBeDefined();
      expect(token.startsWith('mkt_')).toBe(true);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateMachineToken());
      }

      expect(tokens.size).toBe(100);
    });

    it('should have correct length', () => {
      const token = generateMachineToken();
      // mkt_ (4 chars) + 64 hex chars
      expect(token.length).toBe(68);
    });
  });

  describe('hashMachineToken and verifyMachineToken', () => {
    it('should hash and verify machine token correctly', async () => {
      const token = generateMachineToken();
      const hash = await hashMachineToken(token);
      const isValid = await verifyMachineToken(token, hash);

      expect(isValid).toBe(true);
    });

    it('should reject wrong machine token', async () => {
      const token1 = generateMachineToken();
      const token2 = generateMachineToken();
      const hash = await hashMachineToken(token1);
      const isValid = await verifyMachineToken(token2, hash);

      expect(isValid).toBe(false);
    });

    it('should reject invalid token format', async () => {
      const token = 'invalid-token';
      const hash = await hashMachineToken(generateMachineToken());
      const isValid = await verifyMachineToken(token, hash);

      expect(isValid).toBe(false);
    });
  });
});
