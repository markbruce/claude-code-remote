import React from 'react';
import { useTranslation } from 'react-i18next';
import { TabId } from './WorkspaceTabs';

interface NavItem {
  id: 'menu' | 'chat' | 'shell' | 'files' | TabId;
  labelKey: string;
  icon: React.ReactNode;
  action: 'tab' | 'sidebar' | 'editor';
}

const navItems: NavItem[] = [
  {
    id: 'menu',
    labelKey: 'nav.menu',
    action: 'sidebar',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    id: 'chat',
    labelKey: 'nav.chat',
    action: 'tab',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    id: 'shell',
    labelKey: 'nav.terminal',
    action: 'tab',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'files',
    labelKey: 'nav.files',
    action: 'editor',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
];

interface MobileNavProps {
  /** Currently active tab */
  activeTab: TabId;
  /** Callback when a tab is changed */
  onTabChange: (tab: TabId) => void;
  /** Callback to open sidebar drawer */
  onOpenSidebar: () => void;
  /** Callback to open editor overlay */
  onOpenEditor: () => void;
  /** Whether editor is available (file selected) */
  isEditorAvailable: boolean;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  onTabChange,
  onOpenSidebar,
  onOpenEditor,
  isEditorAvailable,
}) => {
  const { t } = useTranslation();

  const handleNavClick = (item: NavItem) => {
    switch (item.action) {
      case 'sidebar':
        onOpenSidebar();
        break;
      case 'tab':
        if (item.id === 'chat' || item.id === 'shell') {
          onTabChange(item.id);
        }
        break;
      case 'editor':
        if (isEditorAvailable) {
          onOpenEditor();
        }
        break;
    }
  };

  const getIsActive = (item: NavItem): boolean => {
    if (item.action === 'tab' && (item.id === 'chat' || item.id === 'shell')) {
      return activeTab === item.id;
    }
    return false;
  };

  const getIsDisabled = (item: NavItem): boolean => {
    return item.action === 'editor' && !isEditorAvailable;
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-around items-center safe-area-inset-bottom z-50"
      aria-label="Mobile navigation"
    >
      {navItems.map((item) => {
        const isActive = getIsActive(item);
        const isDisabled = getIsDisabled(item);

        return (
          <button
            key={item.id}
            onClick={() => handleNavClick(item)}
            disabled={isDisabled}
            className={`
              flex flex-col items-center justify-center gap-1 py-2 px-3 min-w-0 flex-1
              transition-colors duration-150 ease-in-out
              ${isActive
                ? 'text-blue-500 dark:text-blue-400'
                : isDisabled
                  ? 'text-gray-300 dark:text-gray-600'
                  : 'text-gray-600 dark:text-gray-400'
              }
              ${!isDisabled ? 'active:text-gray-900 dark:active:text-gray-200' : ''}
            `}
            aria-label={t(item.labelKey)}
            aria-current={isActive ? 'page' : undefined}
          >
            <div className={`transition-transform duration-150 ${isActive ? 'scale-110' : ''}`}>
              {item.icon}
            </div>
            <span className="text-xs font-medium truncate w-full text-center">
              {t(item.labelKey)}
            </span>
          </button>
        );
      })}

      {/* Safe area inset styles for iOS */}
      <style>{`
        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .safe-area-inset-bottom {
            padding-bottom: calc(env(safe-area-inset-bottom) + 0.5rem);
          }
        }
      `}</style>
    </nav>
  );
};
