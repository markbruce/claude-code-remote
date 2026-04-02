import { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY_PREFIX = 'cc-remote-panel-width-';

interface PanelResizeOptions {
  /** Unique key for localStorage persistence */
  storageKey: string;
  /** Default width in pixels */
  defaultWidth: number;
  /** Minimum width in pixels */
  minWidth: number;
  /** Maximum width in pixels */
  maxWidth: number;
  /** Direction of resize: 'left' means the panel is on the left side, handle on right */
  direction: 'left' | 'right';
}

interface PanelResizeResult {
  /** Current panel width */
  width: number;
  /** Whether the panel is currently being resized */
  isResizing: boolean;
  /** Props to spread on the panel container */
  panelProps: {
    style: React.CSSProperties;
    className: string;
  };
  /** Props for the resize handle element */
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    className: string;
  };
}

/**
 * Hook for managing resizable panel width with localStorage persistence.
 * Supports both left-side (handle on right) and right-side (handle on left) panels.
 */
export function usePanelResize(options: PanelResizeOptions): PanelResizeResult {
  const { storageKey, defaultWidth, minWidth, maxWidth, direction } = options;

  // Initialize width from localStorage or default
  const getStoredWidth = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PREFIX + storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          return parsed;
        }
      }
    } catch {
      // localStorage not available
    }
    return defaultWidth;
  }, [storageKey, defaultWidth, minWidth, maxWidth]);

  const [width, setWidth] = useState(getStoredWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Save width to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + storageKey, String(width));
    } catch {
      // localStorage not available
    }
  }, [width, storageKey]);

  // Handle mouse move during resize
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const deltaX = e.clientX - startXRef.current;
    // For left panel, moving right increases width
    // For right panel, moving left increases width
    const delta = direction === 'left' ? deltaX : -deltaX;
    const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
    setWidth(newWidth);
  }, [direction, minWidth, maxWidth]);

  // Handle mouse up to end resize
  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Add/remove event listeners for resize
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Handle mouse down to start resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    setIsResizing(true);
  }, [width]);

  return {
    width,
    isResizing,
    panelProps: {
      style: { width: `${width}px` },
      className: 'flex-shrink-0',
    },
    handleProps: {
      onMouseDown: handleMouseDown,
      className: 'panel-resize-handle',
    },
  };
}

/**
 * Get stored panel width from localStorage.
 * Useful for server-side rendering consistency.
 */
export function getStoredPanelWidth(storageKey: string, defaultWidth: number): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PREFIX + storageKey);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
  } catch {
    // localStorage not available
  }
  return defaultWidth;
}
