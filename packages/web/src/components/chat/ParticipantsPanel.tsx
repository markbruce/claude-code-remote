/**
 * ParticipantsPanel — Owner UI for managing a shared session.
 * Shows the roster (owner + collaborators with online state + viewer count),
 * generates viewer/collaborator invite links, removes collaborators, switches
 * approval mode, and stops sharing.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SocketEvents, APPROVAL_MODE_OWNER, APPROVAL_MODE_ANY } from 'cc-remote-shared';
import type { ApprovalMode } from 'cc-remote-shared';
import { useSessionStore } from '../../stores/sessionStore';
import { socketManager } from '../../lib/socket';

interface ParticipantsPanelProps {
  sessionId: string;
  onClose?: () => void;
}

export const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({ sessionId, onClose }) => {
  const { t } = useTranslation();
  const participants = useSessionStore((s) => s.participants);
  const viewerCount = useSessionStore((s) => s.viewerCount);
  const approvalMode = useSessionStore((s) => s.approvalMode);

  // 最近生成的邀请链接（role -> link）
  const [links, setLinks] = useState<{ viewer?: string; collaborator?: string }>({});
  const [copied, setCopied] = useState<string | null>(null);

  // 打开时刷新参与者列表；订阅 INVITE_CREATED 以拿到生成的链接
  useEffect(() => {
    socketManager.emit(SocketEvents.PARTICIPANTS_LIST, { session_id: sessionId });

    const unsub = socketManager.on(SocketEvents.INVITE_CREATED, (data: unknown) => {
      const evt = data as { session_id: string; token: string; role: 'collaborator' | 'viewer'; link: string };
      if (evt.session_id !== sessionId) return;
      setLinks((prev) => ({ ...prev, [evt.role]: evt.link }));
    });

    return unsub;
  }, [sessionId]);

  const handleInvite = useCallback((role: 'viewer' | 'collaborator') => {
    socketManager.emit(SocketEvents.INVITE_CREATE, { session_id: sessionId, role });
  }, [sessionId]);

  const handleCopy = useCallback((link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(link);
      setTimeout(() => setCopied(null), 1500);
    });
  }, []);

  const handleRemove = useCallback((userId: string) => {
    if (!window.confirm(t('collab.removeConfirm'))) return;
    socketManager.emit(SocketEvents.PARTICIPANT_REMOVED, { session_id: sessionId, userId });
  }, [sessionId, t]);

  const handleMode = useCallback((mode: ApprovalMode) => {
    socketManager.emit(SocketEvents.APPROVAL_MODE_SET, { session_id: sessionId, mode });
  }, [sessionId]);

  const handleStopShare = useCallback(() => {
    socketManager.emit(SocketEvents.STOP_SHARE, { session_id: sessionId });
    onClose?.();
  }, [sessionId, onClose]);

  const roleLabel = (role: string) => {
    if (role === 'owner') return t('collab.roleOwner');
    if (role === 'collaborator') return t('collab.roleCollaborator');
    return t('collab.roleViewer');
  };

  return (
    <div className="border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 w-72 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('collab.participants')}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Roster */}
        <section>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            {t('collab.roster')}
          </div>
          <ul className="space-y-1.5">
            {participants.map((p) => (
              <li key={p.userId} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${p.online ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{p.displayName}</span>
                  <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {roleLabel(p.role)}
                  </span>
                </div>
                {p.role === 'collaborator' && (
                  <button
                    onClick={() => handleRemove(p.userId)}
                    className="text-[11px] text-red-500 hover:text-red-600 flex-shrink-0"
                  >
                    {t('collab.remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t('collab.viewersCount', { count: viewerCount })}
          </div>
        </section>

        {/* Invite links */}
        <section>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            {t('collab.inviteLinks')}
          </div>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => handleInvite('viewer')}
              className="flex-1 text-xs px-2 py-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {t('collab.inviteViewer')}
            </button>
            <button
              onClick={() => handleInvite('collaborator')}
              className="flex-1 text-xs px-2 py-1.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              {t('collab.inviteCollaborator')}
            </button>
          </div>
          {(['viewer', 'collaborator'] as const).map((r) =>
            links[r] ? (
              <div key={r} className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] text-gray-400 w-16 flex-shrink-0">{roleLabel(r)}</span>
                <input
                  readOnly
                  value={links[r]}
                  className="flex-1 min-w-0 text-[11px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 text-gray-600 dark:text-gray-400 truncate"
                />
                <button
                  onClick={() => handleCopy(links[r]!)}
                  className="text-[11px] px-1.5 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 flex-shrink-0"
                >
                  {copied === links[r] ? t('collab.copied') : t('collab.copyLink')}
                </button>
              </div>
            ) : null,
          )}
        </section>

        {/* Approval mode */}
        <section>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            {t('collab.approvalMode')}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleMode(APPROVAL_MODE_OWNER)}
              className={`flex-1 text-xs px-2 py-1.5 rounded transition-colors ${approvalMode === APPROVAL_MODE_OWNER ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              {t('collab.approvalOwnerOnly')}
            </button>
            <button
              onClick={() => handleMode(APPROVAL_MODE_ANY)}
              className={`flex-1 text-xs px-2 py-1.5 rounded transition-colors ${approvalMode === APPROVAL_MODE_ANY ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              {t('collab.approvalAny')}
            </button>
          </div>
        </section>
      </div>

      {/* Stop share */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={handleStopShare}
          className="w-full text-xs px-2 py-1.5 rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
        >
          {t('collab.stopShare')}
        </button>
      </div>
    </div>
  );
};
