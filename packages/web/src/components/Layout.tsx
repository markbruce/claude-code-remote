/**
 * 布局组件
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores';
import { useNavigate, useLocation } from 'react-router-dom';
import { DarkModeToggle } from './DarkModeToggle';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/machines', label: t('nav.myMachines') },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* 导航栏 */}
      {isAuthenticated && (
        <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <div className="flex items-center gap-8">
                <h1
                  className="text-xl font-bold text-blue-600 dark:text-blue-400 cursor-pointer"
                  onClick={() => navigate('/machines')}
                >
                  CC Remote
                </h1>

                {/* 导航链接 */}
                <nav className="hidden sm:flex items-center gap-4">
                  {navItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        location.pathname.startsWith(item.path)
                          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              </div>

              {/* 用户信息 */}
              <div className="flex items-center gap-4">
                <DarkModeToggle />
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {user?.username || user?.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"
                >
                  {t('auth.logout')}
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
};
