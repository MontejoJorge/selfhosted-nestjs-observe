import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ThemeContext,
  type Theme,
  type ThemeContextValue,
} from './theme-context';

/** Must match the inline script in index.html that applies the theme before first paint. */
const STORAGE_KEY = 'observe-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') {
      return value;
    }
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return 'system';
}

/** Owns the theme state; components read it through `useTheme()`. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia(DARK_QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) =>
      setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      state: { theme, resolved },
      actions: {
        setTheme: (next) => {
          setThemeState(next);
          try {
            localStorage.setItem(STORAGE_KEY, next);
          } catch {
            // Ignore: the choice just won't persist.
          }
        },
      },
    }),
    [theme, resolved],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
