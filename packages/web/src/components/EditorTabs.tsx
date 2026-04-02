import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditorTab } from '../stores/sessionStore';

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabPath: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
  onCloseOthers: (path: string) => void;
  onCloseAll: () => void;
}

export const EditorTabs: React.FC<EditorTabsProps> = ({
  tabs,
  activeTabPath,
  onTabClick,
  onTabClose,
  onCloseOthers,
  onCloseAll,
}) => {
  const { t } = useTranslation();
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [contextMenuTab, setContextMenuTab] = useState<string | null>(null);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // 获取文件名
  const getFileName = (path: string): string => {
    return path.split(/[/\\]/).pop() || path;
  };

  // 检查滚动状态
  const checkScroll = () => {
    const container = tabsContainerRef.current;
    if (container) {
      const { scrollWidth, clientWidth, scrollLeft } = container;
      setShowScrollButtons(scrollWidth > clientWidth);
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  // 滚动到指定方向
  const scroll = (direction: 'left' | 'right') => {
    const container = tabsContainerRef.current;
    if (container) {
      const scrollAmount = 150;
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  // 将活动标签滚动到可见区域
  useEffect(() => {
    if (activeTabPath && tabsContainerRef.current) {
      const activeTab = tabsContainerRef.current.querySelector(`[data-tab-path="${activeTabPath}"]`);
      if (activeTab) {
        (activeTab as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeTabPath]);

  // 监听容器大小变化
  useEffect(() => {
    const container = tabsContainerRef.current;
    if (container) {
      const resizeObserver = new ResizeObserver(checkScroll);
      resizeObserver.observe(container);
      container.addEventListener('scroll', checkScroll);
      checkScroll();
      return () => {
        resizeObserver.disconnect();
        container.removeEventListener('scroll', checkScroll);
      };
    }
  }, [tabs]);

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuTab(path);
    setShowContextMenu(true);
  };

  // 关闭右键菜单
  useEffect(() => {
    const handleClickOutside = () => setShowContextMenu(false);
    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showContextMenu]);

  // 处理鼠标中键关闭
  const handleMouseDown = (e: React.MouseEvent, path: string) => {
    if (e.button === 1) { // 中键
      e.preventDefault();
      onTabClose(path);
    }
  };

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 h-9">
      {/* 左侧滚动按钮 */}
      {showScrollButtons && (
        <button
          onClick={() => scroll('left')}
          disabled={!canScrollLeft}
          className={`
            flex-shrink-0 w-6 h-full flex items-center justify-center
            text-gray-400 dark:text-gray-500
            hover:bg-gray-200 dark:hover:bg-gray-700
            disabled:opacity-30 disabled:cursor-default
          `}
          title={t('editor.scrollLeft')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* 标签页容器 - 可滚动 */}
      <div
        ref={tabsContainerRef}
        className="flex items-center flex-1 min-w-0 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabs.map((tab) => {
          const isActive = tab.path === activeTabPath;
          const fileName = getFileName(tab.path);

          return (
            <div
              key={tab.path}
              data-tab-path={tab.path}
              className={`
                group flex items-center gap-1 px-3 py-1.5 cursor-pointer border-r border-gray-200 dark:border-gray-700
                min-w-[80px] max-w-[140px] shrink-0
                ${isActive
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }
              `}
              onClick={() => onTabClick(tab.path)}
              onContextMenu={(e) => handleContextMenu(e, tab.path)}
              onMouseDown={(e) => handleMouseDown(e, tab.path)}
            >
              {/* 预览标签用斜体 */}
              <span
                className={`
                  truncate text-sm
                  ${tab.isPreview ? 'italic' : ''}
                  ${tab.isDirty ? 'font-medium' : ''}
                `}
                title={tab.path}
              >
                {fileName}
              </span>

              {/* 未保存标记 */}
              {tab.isDirty && (
                <span className="text-gray-900 dark:text-white text-sm shrink-0">*</span>
              )}

              {/* 关闭按钮 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.path);
                }}
                className={`
                  shrink-0 p-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600
                  opacity-0 group-hover:opacity-100 transition-opacity
                  ${isActive ? 'opacity-100' : ''}
                `}
                title={t('editor.close')}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* 右侧滚动按钮 */}
      {showScrollButtons && (
        <button
          onClick={() => scroll('right')}
          disabled={!canScrollRight}
          className={`
            flex-shrink-0 w-6 h-full flex items-center justify-center
            text-gray-400 dark:text-gray-500
            hover:bg-gray-200 dark:hover:bg-gray-700
            disabled:opacity-30 disabled:cursor-default
          `}
          title={t('editor.scrollRight')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* 分隔线 */}
      {tabs.length > 1 && (
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1 flex-shrink-0" />
      )}

      {/* 关闭所有按钮 - 固定在右侧 */}
      {tabs.length > 1 && (
        <button
          onClick={onCloseAll}
          className="
            flex-shrink-0 px-2 py-1 mr-1
            text-xs text-gray-500 dark:text-gray-400
            hover:text-gray-700 dark:hover:text-gray-200
            hover:bg-gray-200 dark:hover:bg-gray-700
            rounded
          "
          title={t('editor.closeAll')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* 右键菜单 */}
      {showContextMenu && contextMenuTab && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[120px]"
          style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onTabClose(contextMenuTab);
              setShowContextMenu(false);
            }}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t('editor.close')}
          </button>
          <button
            onClick={() => {
              onCloseOthers(contextMenuTab);
              setShowContextMenu(false);
            }}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t('editor.closeOthers')}
          </button>
          <button
            onClick={() => {
              onCloseAll();
              setShowContextMenu(false);
            }}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t('editor.closeAll')}
          </button>
        </div>
      )}
    </div>
  );
};
