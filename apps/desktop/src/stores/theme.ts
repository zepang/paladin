import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function resolveTheme(theme: Theme): boolean {
  return (
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
}

function applyTheme(theme: Theme) {
  const isDark = resolveTheme(theme);
  document.documentElement.classList.toggle('dark', isDark);
}

// Listen to system preference changes when theme is 'system'
if (typeof window !== 'undefined') {
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      const state = useThemeStore.getState();
      if (state.theme === 'system') {
        applyTheme('system');
      }
    });
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme: Theme) => {
        set({ theme });
        applyTheme(theme);
      },
      toggleTheme: () => {
        const { theme } = get();
        const order: Theme[] = ['system', 'light', 'dark'];
        const nextIndex = (order.indexOf(theme) + 1) % order.length;
        const next = order[nextIndex]!;
        set({ theme: next });
        applyTheme(next);
      },
    }),
    {
      name: 'paladin-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
        }
      },
    },
  ),
);
