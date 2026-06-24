import { ApprovalMode, Role } from 'cc-remote-shared';

export function canSend(role: Role): boolean {
  return role === 'owner' || role === 'collaborator';
}

export function canApprove(role: Role, mode: ApprovalMode): boolean {
  if (role === 'owner') return true;
  if (role === 'collaborator') return mode === 'any';
  return false; // viewer
}

export function resolveDisplayName(user: { username: string | null; email: string }): string {
  if (user.username) return user.username;
  const at = user.email.indexOf('@');
  const local = at > 0 ? user.email.slice(0, at) : '';
  return local || 'Collaborator';
}

export type InviteValidation = 'ok' | 'expired' | 'exhausted';

export function validateInvite(
  invite: { role: string; expiresAt: Date | null; maxUses: number | null; usedCount: number },
  now: Date,
): InviteValidation {
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) return 'exhausted';
  return 'ok';
}
