/**
 * Bot Binding Page (generic — Telegram & Feishu)
 * Flow: user opens deep link from bot → login if needed → confirm bind → success
 */

import React, { useState } from 'react';
import { useNavigate, useSearchParams, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores';
import { apiClient } from '../lib/api';
import { DarkModeToggle } from '../components/DarkModeToggle';
import i18n from '../i18n';

type BindState = 'confirming' | 'binding' | 'success' | 'error';

/** Platform-specific branding config */
interface PlatformConfig {
  name: string;
  apiEndpoint: string;
  accentBg: string;
  accentHoverBg: string;
  lightIconBg: string;
  darkIconBg: string;
}

const PLATFORMS: Record<string, PlatformConfig> = {
  telegram: {
    name: 'Telegram',
    apiEndpoint: '/api/auth/bind-telegram',
    accentBg: 'bg-sky-500',
    accentHoverBg: 'hover:bg-sky-600',
    lightIconBg: 'bg-sky-100 dark:bg-sky-900/30',
    darkIconBg: 'bg-sky-500',
  },
  feishu: {
    name: 'Feishu',
    apiEndpoint: '/api/auth/bind-feishu',
    accentBg: 'bg-indigo-500',
    accentHoverBg: 'hover:bg-indigo-600',
    lightIconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
    darkIconBg: 'bg-indigo-500',
  },
};

/** Telegram brand SVG icon */
const TelegramIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

/** Feishu (Lark) brand SVG icon — stylized bird */
const FeishuIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.3 3.28-2.52 5.52-4.64 7.12-2.12-1.6-4.34-3.84-4.64-7.12-.08-.88.56-1.6 1.36-1.6.72 0 1.28.56 1.36 1.28.16 1.52.88 2.72 1.92 3.76 1.04-1.04 1.76-2.24 1.92-3.76.08-.72.64-1.28 1.36-1.28.8 0 1.44.72 1.36 1.6z" />
  </svg>
);

export const BindBotPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { t } = useTranslation();
  const { isAuthenticated, token } = useAuthStore();

  const [bindState, setBindState] = useState<BindState>('confirming');
  const [errorMsg, setErrorMsg] = useState('');

  // Determine platform from URL path (/bind-telegram or /bind-feishu)
  const platform = location.pathname.endsWith('/bind-feishu') ? 'feishu' : 'telegram';
  const config = PLATFORMS[platform] || PLATFORMS.telegram;

  const bindToken = searchParams.get('token');
  const platformUserId = searchParams.get('platform_user_id');
  const chatId = searchParams.get('chat_id');

  // Missing params
  if (!bindToken || !platformUserId || !chatId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{t('bind.invalidLink')}</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{t('bind.invalidLinkDesc')}</p>
            <button
              onClick={() => navigate('/')}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer"
            >
              {t('bind.goHome')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in — redirect to login with return URL
  if (!isAuthenticated || !token) {
    const returnUrl = `/bind-${platform}?token=${encodeURIComponent(bindToken)}&platform_user_id=${encodeURIComponent(platformUserId)}&chat_id=${encodeURIComponent(chatId)}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(returnUrl)}`} replace />;
  }

  const handleBind = async () => {
    setBindState('binding');
    setErrorMsg('');

    try {
      const result = await apiClient.post<{ jwt: string; refresh_secret: string }>(config.apiEndpoint, {
        token: bindToken,
        platform_user_id: platformUserId,
        chat_id: chatId,
      });

      // Notify bot service (via server proxy) so it can establish Socket.IO connection
      try {
        await apiClient.post('/api/auth/bind-bot-callback', {
          platform_user_id: platformUserId,
          jwt: result.jwt,
          refresh_secret: result.refresh_secret,
        });
      } catch (e) {
        console.warn('[Bind] Failed to notify bot service:', e);
      }

      setBindState('success');
    } catch (err: any) {
      const msg = err?.message || err?.response?.data?.error || t('bind.failed');
      setErrorMsg(msg);
      setBindState('error');
    }
  };

  const PlatformIcon = platform === 'feishu' ? FeishuIcon : TelegramIcon;
  const iconColor = platform === 'feishu' ? 'text-indigo-500' : 'text-sky-500';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4 relative">
      {/* Theme & Language */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={() => i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en' : 'zh-CN')}
          className="p-2 rounded-lg bg-white/80 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 shadow-sm text-sm cursor-pointer"
          title={i18n.language === 'zh-CN' ? 'English' : '中文'}
        >
          {i18n.language === 'zh-CN' ? 'EN' : '中'}
        </button>
        <DarkModeToggle />
      </div>

      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">

          {/* === Confirming State === */}
          {bindState === 'confirming' && (
            <div className="text-center">
              {/* Platform icon */}
              <div className={`w-16 h-16 mx-auto mb-4 rounded-full ${config.lightIconBg} flex items-center justify-center`}>
                <PlatformIcon className={`w-9 h-9 ${iconColor}`} />
              </div>

              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('bind.title', { platform: config.name })}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{t('bind.description')}</p>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${config.darkIconBg} flex items-center justify-center flex-shrink-0`}>
                    <PlatformIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{config.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('bind.botAccount')}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors duration-200 cursor-pointer"
                >
                  {t('bind.cancel')}
                </button>
                <button
                  onClick={handleBind}
                  className={`flex-1 py-2.5 px-4 rounded-xl ${config.accentBg} ${config.accentHoverBg} text-white font-medium transition-colors duration-200 cursor-pointer`}
                >
                  {t('bind.confirm')}
                </button>
              </div>
            </div>
          )}

          {/* === Binding State (loading) === */}
          {bindState === 'binding' && (
            <div className="text-center py-4">
              <div className={`w-12 h-12 mx-auto mb-4 rounded-full border-4 ${platform === 'feishu' ? 'border-indigo-200 dark:border-indigo-800 border-t-indigo-500' : 'border-sky-200 dark:border-sky-800 border-t-sky-500'} animate-spin`} />
              <p className="text-gray-600 dark:text-gray-400">{t('bind.binding')}</p>
            </div>
          )}

          {/* === Success State === */}
          {bindState === 'success' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{t('bind.successTitle')}</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{t('bind.successDesc')}</p>
              <button
                onClick={() => navigate('/')}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors duration-200 cursor-pointer"
              >
                {t('bind.goToDashboard')}
              </button>
            </div>
          )}

          {/* === Error State === */}
          {bindState === 'error' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{t('bind.errorTitle')}</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-2">{errorMsg}</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">{t('bind.errorRetry')}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors duration-200 cursor-pointer"
                >
                  {t('bind.goHome')}
                </button>
                <button
                  onClick={handleBind}
                  className={`flex-1 py-2.5 px-4 rounded-xl ${config.accentBg} ${config.accentHoverBg} text-white font-medium transition-colors duration-200 cursor-pointer`}
                >
                  {t('bind.retry')}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('auth.footer')}
        </p>
      </div>
    </div>
  );
};
