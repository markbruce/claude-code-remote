/**
 * useResponsive - A hook for responsive design
 *
 * Breakpoints:
 * - Mobile: < 768px
 * - Tablet: 768-1023px
 * - Desktop: >= 1024px
 */

import { useState, useEffect, useCallback } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export interface ResponsiveState {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
}

const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
};

function getBreakpoint(width: number): Breakpoint {
  if (width < BREAKPOINTS.mobile) return 'mobile';
  if (width < BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
}

function createResponsiveState(width: number): ResponsiveState {
  const breakpoint = getBreakpoint(width);
  return {
    breakpoint,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    width,
  };
}

export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() =>
    createResponsiveState(window.innerWidth)
  );

  const handleResize = useCallback(() => {
    setState(createResponsiveState(window.innerWidth));
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const onResize = () => {
      // Debounce resize events for performance
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 150);
    };

    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', onResize);
    };
  }, [handleResize]);

  return state;
}
