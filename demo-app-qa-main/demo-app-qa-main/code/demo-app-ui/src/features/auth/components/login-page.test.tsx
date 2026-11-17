import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogin = vi.fn();

vi.mock('@/src/features/auth/stores/use-auth-store', () => ({
  useAuthStore: (selector: (state: any) => any) =>
    selector({
      login: mockLogin,
    }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import LoginPage from '@/app/(auth)/login/page';

describe('LoginPage', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    window.history.pushState({}, '', '/login');
  });

  it('renders the login form and validation messages for empty input', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    expect(await screen.findByText(/invalid email format/i)).toBeInTheDocument();
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
  });

  it('shows a server-side auth error for invalid credentials', async () => {
    const user = userEvent.setup();
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/^Email$/i), 'bad@example.com');
    await user.type(screen.getByLabelText(/^Password$/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it('stores the user and redirects on successful login', async () => {
    const user = userEvent.setup();
    const mockedFetch = vi.mocked(fetch);

    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        userId: 'user-123',
        email: 'holder@demo.com',
        name: 'Test Holder',
        role: 'CLAIMANT',
      }),
    } as Response);

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/^Email$/i), 'holder@demo.com');
    await user.type(screen.getByLabelText(/^Password$/i), 'Password123');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    expect(mockLogin).toHaveBeenCalledWith({
      userId: 'user-123',
      email: 'holder@demo.com',
      name: 'Test Holder',
      role: 'CLAIMANT',
    });
    expect(mockedFetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
  });

  it('shows a session-expired message and clears the query parameter', async () => {
    window.history.pushState({}, '', '/login?session_expired=true');

    render(<LoginPage />);

    expect(await screen.findByText(/your session has expired\. please log in again\./i)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe('');
  });
});
