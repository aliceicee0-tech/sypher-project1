import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

// main.jsx calls bootstrap() at import time, guarded by a #root element. We
// exercise the exported bootstrap() + renderTree() helpers directly.

const apiMock = {
  me: vi.fn(async () => ({ user: null, googleConfigured: false, isAdmin: false })),
  logout: vi.fn(),
  getUsage: vi.fn(async () => ({ plan: 'free', month: '', count: 0, limit: 2, remaining: 2, canGenerate: true, credits: 0, resetsAt: null })),
};
vi.mock('./api.js', () => ({ api: apiMock, getAuthToken: () => '', setAuthToken: () => {} }));

const { bootstrap, renderTree } = await import('./main.jsx');

describe('main', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    cleanup();
  });

  it('renderTree returns a React element wrapping App in the provider tree', () => {
    const tree = renderTree();
    expect(React.isValidElement(tree)).toBe(true);
  });

  it('bootstrap is a no-op when there is no #root element', () => {
    expect(() => bootstrap()).not.toThrow();
  });

  it('bootstrap renders into #root when present', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    expect(() => bootstrap()).not.toThrow();
    // React render is async; wait for the DOM to be populated.
    await waitFor(() => expect(root.innerHTML).not.toBe(''));
  });
});
