import React from 'react';
import { useTranslation } from 'react-i18next';

export type ShellConnectionState = 'loading' | 'connecting' | 'connected' | 'disconnected';

interface ShellConnectionOverlayProps {
  state: ShellConnectionState;
}

export const ShellConnectionOverlay: React.FC<ShellConnectionOverlayProps> = ({ state }) => {
  const { t } = useTranslation();

  if (state === 'connected') return null;

  const config = {
    loading: { text: t('shell.initializing'), color: 'text-gray-500' },
    connecting: { text: t('shell.connectingRemote'), color: 'text-yellow-500' },
    disconnected: { text: t('shell.disconnected'), color: 'text-red-500' },
  }[state];

  return (
    <div className="absolute inset-0 bg-white/90 flex items-center justify-center z-10">
      <div className="text-center">
        {state !== 'disconnected' && (
          <svg className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 5 5.373 5 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {state === 'disconnected' && (
          <svg className="w-8 h-8 mx-auto mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        )}
        <p className={`text-sm ${config.color}`}>{config.text}</p>
        {state === 'disconnected' && (
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded"
          >
            {t('shell.reconnect')}
          </button>
        )}
      </div>
    </div>
  );
};

export default ShellConnectionOverlay;
