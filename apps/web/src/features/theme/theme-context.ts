import { createContext, use } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  state: { theme: Theme; resolved: 'light' | 'dark' };
  actions: { setTheme: (theme: Theme) => void };
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
