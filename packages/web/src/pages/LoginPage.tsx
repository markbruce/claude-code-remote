/**
 * 登录/注册页面
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useAuthStore } from '../stores';
import { Button, Input } from '../components';
import { DarkModeToggle } from '../components/DarkModeToggle';
import type { LoginRequest, RegisterRequest } from 'cc-remote-shared';

type AuthMode = 'login' | 'register';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { login, register, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>('login');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // 已登录则跳转
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/machines');
    }
  }, [isAuthenticated, navigate]);

  // 清除错误
  React.useEffect(() => {
    clearError();
  }, [mode, clearError]);

  // 表单验证
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.email) {
      errors.email = t('auth.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = t('auth.emailInvalid');
    }

    if (!formData.password) {
      errors.password = t('auth.passwordRequired');
    } else if (formData.password.length < 6) {
      errors.password = t('auth.passwordTooShort');
    }

    if (mode === 'register') {
      if (!formData.username) {
        errors.username = t('auth.usernameRequired');
      } else if (formData.username.length < 2) {
        errors.username = t('auth.usernameTooShort');
      }

      if (formData.password !== formData.confirmPassword) {
        errors.confirmPassword = t('auth.passwordMismatch');
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 处理输入变化
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // 清除对应字段错误
    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      if (mode === 'login') {
        const data: LoginRequest = {
          email: formData.email,
          password: formData.password,
        };
        await login(data);
      } else {
        const data: RegisterRequest = {
          email: formData.email,
          password: formData.password,
          username: formData.username,
        };
        await register(data);
      }
      navigate('/machines');
    } catch {
      // 错误已在store中处理
    }
  };

  // 切换模式
  const toggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setFormData({
      email: '',
      password: '',
      confirmPassword: '',
      username: '',
    });
    setFormErrors({});
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4 relative">
      {/* 主题切换 & 语言切换 */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={() => i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en' : 'zh-CN')}
          className="p-2 rounded-lg bg-white/80 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 shadow-sm text-sm"
          title={i18n.language === 'zh-CN' ? 'English' : '中文'}
        >
          {i18n.language === 'zh-CN' ? 'EN' : '中'}
        </button>
        <DarkModeToggle />
      </div>
      <div className="w-full max-w-md">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">CC Remote</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">{t('auth.appTagline')}</p>
        </div>

        {/* 表单卡片 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-gray-900/50 p-8">
          <h2 className="text-xl font-semibold text-center mb-6 text-gray-900 dark:text-white">
            {mode === 'login' ? t('auth.login') : t('auth.signUp')}
          </h2>

          {/* 错误提示 */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 用户名 - 仅注册 */}
            {mode === 'register' && (
              <Input
                label={t('auth.username')}
                name="username"
                type="text"
                value={formData.username}
                onChange={handleChange}
                error={formErrors.username}
                placeholder={t('auth.usernameRequired')}
                fullWidth
              />
            )}

            {/* 邮箱 */}
            <Input
              label={t('auth.email')}
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              error={formErrors.email}
              placeholder={t('auth.emailRequired')}
              fullWidth
            />

            {/* 密码 */}
            <Input
              label={t('auth.password')}
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              error={formErrors.password}
              placeholder={t('auth.passwordRequired')}
              fullWidth
            />

            {/* 确认密码 - 仅注册 */}
            {mode === 'register' && (
              <Input
                label={t('auth.confirmPassword')}
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                error={formErrors.confirmPassword}
                placeholder={t('auth.confirmPasswordPlaceholder')}
                fullWidth
              />
            )}

            {/* 提交按钮 */}
            <Button
              type="submit"
              loading={isLoading}
              fullWidth
              className="mt-6"
            >
              {mode === 'login' ? t('auth.login') : t('auth.register')}
            </Button>
          </form>

          {/* 切换模式 */}
          <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            {mode === 'login' ? (
              <>
                {t('auth.needAccount')}
                <button
                  onClick={toggleMode}
                  className="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  {t('auth.registerNow')}
                </button>
              </>
            ) : (
              <>
                {t('auth.alreadyHaveAccount')}
                <button
                  onClick={toggleMode}
                  className="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  {t('auth.loginNow')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* 底部信息 */}
        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('auth.footer')}
        </p>
      </div>
    </div>
  );
};
