import { canSend, canApprove, resolveDisplayName, validateInvite } from '../../../src/session/policy';

describe('session policy', () => {
  describe('canSend', () => {
    it('allows owner and collaborator', () => {
      expect(canSend('owner')).toBe(true);
      expect(canSend('collaborator')).toBe(true);
    });
    it('denies viewer', () => {
      expect(canSend('viewer')).toBe(false);
    });
  });

  describe('canApprove', () => {
    it('owner can always approve', () => {
      expect(canApprove('owner', 'owner')).toBe(true);
      expect(canApprove('owner', 'any')).toBe(true);
    });
    it('collaborator can approve only in any mode', () => {
      expect(canApprove('collaborator', 'any')).toBe(true);
      expect(canApprove('collaborator', 'owner')).toBe(false);
    });
    it('viewer can never approve', () => {
      expect(canApprove('viewer', 'any')).toBe(false);
      expect(canApprove('viewer', 'owner')).toBe(false);
    });
  });

  describe('resolveDisplayName', () => {
    it('prefers username', () => {
      expect(resolveDisplayName({ username: 'alice', email: 'a@b.com' })).toBe('alice');
    });
    it('falls back to email local-part', () => {
      expect(resolveDisplayName({ username: null, email: 'bob.stark@example.com' })).toBe('bob.stark');
    });
    it('falls back to Collaborator when email empty', () => {
      expect(resolveDisplayName({ username: null, email: '' })).toBe('Collaborator');
    });
  });

  describe('validateInvite', () => {
    const base = { role: 'collaborator', expiresAt: null, maxUses: null, usedCount: 0 };
    it('ok when valid and unexpired', () => {
      expect(validateInvite(base, new Date('2026-01-01T00:00:01Z'))).toBe('ok');
    });
    it('expired when past expiresAt', () => {
      expect(validateInvite({ ...base, expiresAt: new Date('2026-01-01T00:00:00Z') }, new Date('2026-01-02T00:00:00Z'))).toBe('expired');
    });
    it('exhausted when usedCount >= maxUses', () => {
      expect(validateInvite({ ...base, maxUses: 1, usedCount: 1 }, new Date())).toBe('exhausted');
    });
  });
});
