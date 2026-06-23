import { Role } from 'cc-remote-shared';

export interface JoinDecision {
  role: Role;
  requiresParticipantRow: boolean; // collaborator → true (upsert SessionParticipant)
}

/**
 * Pure decision: given the invite's role and whether the socket is JWT-authenticated,
 * decide the granted role (or null = reject).
 * Viewers are anonymous; collaborators must be authenticated.
 */
export function decideJoin(input: { inviteRole: 'viewer' | 'collaborator'; hasJwt: boolean }): JoinDecision | null {
  if (input.inviteRole === 'viewer') return { role: 'viewer', requiresParticipantRow: false };
  if (input.inviteRole === 'collaborator' && input.hasJwt) return { role: 'collaborator', requiresParticipantRow: true };
  return null;
}
