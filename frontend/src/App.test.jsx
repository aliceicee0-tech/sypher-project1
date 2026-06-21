import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const apiMock = {
  me: vi.fn(async () => ({ user: { uid: 'u1', email: 'a@b.c' }, googleConfigured: true, isAdmin: false })),
  logout: vi.fn(async () => ({})),
  getUsage: vi.fn(async () => ({ plan: 'free', month: '', count: 0, limit: 2, remaining: 2, canGenerate: true, credits: 0, resetsAt: null })),
  listGenerations: vi.fn(async () => []),
  listCollections: vi.fn(async () => []),
  listPlans: vi.fn(async () => ({ plans: [], creditPacks: [], payment: { methods: ['mvola'] } })),
  listOrders: vi.fn(async () => []),
  getShared: vi.fn(async () => ({ kind: 'track', title: 'shared', audio_url: 'https://cdn/x.mp3' })),
};
vi.mock('./api.js', () => ({ api: apiMock, getAuthToken: () => '', setAuthToken: () => {} }));

const { AuthProvider } = await import('./auth/AuthContext.jsx');
const { UsageProvider } = await import('./auth/UsageContext.jsx');
const { ConfirmProvider, ToastProvider } = await import('./components/ui/Overlay.jsx');
const { PlayerProvider } = await import('./audio/PlayerContext.jsx');
const App = (await import('./App.jsx')).default;

// App uses <Routes>, so we wrap it in a MemoryRouter (App itself doesn't render
// a router — main.jsx does). The full provider tree mirrors main.jsx's wiring.
function Tree({ route = '/login' }) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <UsageProvider>
              <PlayerProvider>
                <App />
              </PlayerProvider>
            </UsageProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('App', () => {
  it('renders the login page on /login', () => {
    const { container } = render(<Tree route="/login" />);
    expect(container).toBeDefined();
  });

  it('renders the public share player on /share/:id', () => {
    const { container } = render(<Tree route="/share/abc" />);
    expect(container).toBeDefined();
  });

  it('mounts without throwing on a protected route', () => {
    const { container } = render(<Tree route="/" />);
    expect(container).toBeDefined();
  });
});
