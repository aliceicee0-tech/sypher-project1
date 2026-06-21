import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// QuotaBadge reads useUsage, which reads useAuth + api. Mock the api so the
// usage provider resolves a known quota.
const apiMock = { me: vi.fn(), logout: vi.fn(), getUsage: vi.fn() };
vi.mock('../api.js', () => ({ api: apiMock, getAuthToken: () => '', setAuthToken: () => {} }));

const { AuthProvider } = await import('../auth/AuthContext.jsx');
const { UsageProvider } = await import('../auth/UsageContext.jsx');
const QuotaBadge = (await import('./QuotaBadge.jsx')).default;

function renderWithQuota(quota, { user = { uid: 'u1' } } = {}) {
  apiMock.me.mockResolvedValue({ user, googleConfigured: false, isAdmin: false });
  apiMock.getUsage.mockResolvedValue(quota);
  return render(
    React.createElement(AuthProvider, null,
      React.createElement(UsageProvider, null, React.createElement(QuotaBadge, null)))
  );
}

describe('QuotaBadge', () => {
  it('shows the remaining count when under the limit', async () => {
    const { findByText } = renderWithQuota({
      plan: 'free', month: '2024-01', count: 1, limit: 10,
      remaining: 9, canGenerate: true, credits: 0, resetsAt: null,
    });
    expect(await findByText(/9 free generations left/)).toBeDefined();
  });

  it('uses the singular "generation" when exactly one remains', async () => {
    const { findByText } = renderWithQuota({
      plan: 'free', month: '2024-01', count: 9, limit: 10,
      remaining: 1, canGenerate: true, credits: 0, resetsAt: null,
    });
    expect(await findByText(/1 free generation left/)).toBeDefined();
  });

  it('shows the limit-reached state when canGenerate is false', async () => {
    const { findByText } = renderWithQuota({
      plan: 'free', month: '2024-01', count: 10, limit: 10,
      remaining: 0, canGenerate: false, credits: 0, resetsAt: '2024-02-01T00:00:00Z',
    });
    expect(await findByText(/Free limit reached/)).toBeDefined();
  });
});
