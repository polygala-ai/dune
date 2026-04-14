// Theme sync hook.

import { useEffect, useState } from 'react';

import type { ThemePreference } from '@/renderer/features/settings/types';

/** Returns system theme preference. */
function getSystemThemePreference() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Theme sync hook. */
export function useThemeSync(themePreference: ThemePreference) {
  const [systemTheme, setSystemTheme] = useState(getSystemThemePreference);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    /** Handles change. */
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme =
      themePreference === 'system' ? systemTheme : themePreference;
  }, [systemTheme, themePreference]);
}
