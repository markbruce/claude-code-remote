import { decideJoin } from '../../../src/session/join';

describe('decideJoin', () => {
  it('viewer invite + no JWT → viewer role, anonymous', () => {
    expect(decideJoin({ inviteRole: 'viewer', hasJwt: false })).toEqual({ role: 'viewer', requiresParticipantRow: false });
  });
  it('collaborator invite + JWT → collaborator role', () => {
    expect(decideJoin({ inviteRole: 'collaborator', hasJwt: true })).toEqual({ role: 'collaborator', requiresParticipantRow: true });
  });
  it('collaborator invite without JWT → rejected', () => {
    expect(decideJoin({ inviteRole: 'collaborator', hasJwt: false })).toBeNull();
  });
});
