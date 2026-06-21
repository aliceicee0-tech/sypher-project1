import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';

// Mock api before importing the providers that depend on it.
const apiMock = {
  me: vi.fn(),
  logout: vi.fn(),
  getUsage: vi.fn(),
  googleLoginUrl: vi.fn(() => '/api/auth/google'),
};
vi.mock('../api.js', () => ({
  api: apiMock,
  getAuthToken: vi.fn(() => ''),
  setAuthToken: vi.fn(),
}));

const { AuthProvider, useAuth } = await import('./AuthContext.jsx');
const { UsageProvider, useUsage } = await import('./UsageContext.jsx');

const QUOTA = {
  plan: 'free', month: '2024-01', count: 1, limit: 2,
  remaining: 1, canGenerate: true, credits: 0, resetsAt: null,
};

// renderHook's wrapper is called with { children }; it must be a component that
// renders the children it receives (not a plain function of the props object).
const AuthWrapper = ({ children }) => React.createElement(AuthProvider, null, children);

describe('AuthContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes the user once api.me resolves', async () => {
    apiMock.me.mockResolvedValue({
      user: { uid: 'u1', email: 'a@b.c' },
      googleConfigured: true,
      isAdmin: false,
    });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user.email).toBe('a@b.c');
    expect(result.current.googleConfigured).toBe(true);
    expect(result.current.isAdmin).toBe(false);
  });

  it('clears the user when api.me rejects', async () => {
    apiMock.me.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('logout calls api.logout then clears the user', async () => {
    apiMock.me.mockResolvedValue({ user: { uid: 'u1' }, googleConfigured: false, isAdmin: false });
    apiMock.logout.mockResolvedValue({});
    const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.logout(); });
    expect(apiMock.logout).toHaveBeenCalled();
  });
});

describe('UsageContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes a default empty quota before the user is known', async () => {
    apiMock.me.mockResolvedValue({ user: null, googleConfigured: false, isAdmin: false });
    const wrapper = ({ children }) =>
      React.createElement(AuthProvider, null,
        React.createElement(UsageProvider, null, children));
    const { result } = renderHook(() => useUsage(), { wrapper });
    await waitFor(() => expect(result.current.quota.plan).toBe('free'));
    expect(result.current.quota.remaining).toBe(2);
    expect(result.current.limited).toBe(false);
  });

  it('fetches the real quota once the user is authenticated', async () => {
    apiMock.me.mockResolvedValue({ user: { uid: 'u1' }, googleConfigured: false, isAdmin: false });
    apiMock.getUsage.mockResolvedValue(QUOTA);
    const wrapper = ({ children }) =>
      React.createElement(AuthProvider, null,
        React.createElement(UsageProvider, null, children));
    const { result } = renderHook(() => useUsage(), { wrapper });
    await waitFor(() => expect(result.current.quota.count).toBe(1));
    expect(result.current.quota.remaining).toBe(1);
  });
});
