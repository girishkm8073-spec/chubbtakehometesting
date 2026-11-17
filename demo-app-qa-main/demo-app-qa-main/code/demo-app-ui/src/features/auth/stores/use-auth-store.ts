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

export interface User {
  userId: string;
  email: string;
  name: string;
  role: 'CLAIMANT' | 'ADMIN';
}

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      login: (user) => set({ user, isAuthenticated: true }),

      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
      storage: safeStorage(),
    }
  )
);
