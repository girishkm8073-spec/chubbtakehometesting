import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const safeStorage = () => {
  const storage = typeof window !== 'undefined' ? window.localStorage : undefined;

  return createJSONStorage(() => ({
    getItem: (key: string) => storage?.getItem(key) ?? null,
    setItem: (key: string, value: string) => storage?.setItem(key, value),
    removeItem: (key: string) => storage?.removeItem(key),
  }));
};

export type ThemeName = 'default' | 'corporate' | 'warm';

interface ThemeStore {
  theme: ThemeName;
  isDark: boolean;
  setTheme: (theme: ThemeName) => void;
  toggleDark: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'default',
      isDark: false,

      setTheme: (theme) => set({ theme }),

      toggleDark: () => set((state) => ({ isDark: !state.isDark })),
    }),
    {
      name: 'theme-storage',
      storage: safeStorage(),
    }
  )
);
