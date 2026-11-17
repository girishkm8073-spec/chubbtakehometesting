import '@testing-library/jest-dom/vitest';

const createMemoryStorage = () => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
};

const storage = createMemoryStorage();

Object.defineProperty(window, 'localStorage', {
  value: storage,
  configurable: true,
});

Object.defineProperty(window, 'sessionStorage', {
  value: createMemoryStorage(),
  configurable: true,
});

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: window.sessionStorage,
  configurable: true,
});
