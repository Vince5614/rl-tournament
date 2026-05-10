import { useState, useEffect, useCallback } from 'react';

/**
 * Reads / writes the 'rl-theme' key in localStorage and sets
 * document.documentElement.dataset.theme so CSS variable overrides apply globally.
 * The attribute is applied synchronously during initialisation to avoid a flash.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('rl-theme') || 'dark';
    // Apply immediately (before first paint) to avoid a theme flash
    document.documentElement.dataset.theme = stored;
    return stored;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('rl-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);

  return { theme, toggle };
}
