import { useState, useEffect, useCallback } from 'react';

/**
 * Reads / writes the 'rl-theme' key in localStorage and sets
 * document.documentElement.dataset.theme so CSS variable overrides apply globally.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('rl-theme') || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('rl-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);

  return { theme, toggle };
}
