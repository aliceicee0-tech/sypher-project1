import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// Mock api for any provider that needs it.
const apiMock = {
  me: vi.fn(async () => ({ user: { uid: 'u1', email: 'a@b.c', name: 'Al' }, googleConfigured: true, isAdmin: false })),
  logout: vi.fn(async () => ({})),
  getUsage: vi.fn(async () => ({ plan: 'free', month: '', count: 0, limit: 2, remaining: 2, canGenerate: true, credits: 0, resetsAt: null })),
  listCollections: vi.fn(async () => []),
  createCollection: vi.fn(),
  addTrackToCollection: vi.fn(),
  shareTrack: vi.fn(),
};
vi.mock('../api.js', () => ({ api: apiMock, getAuthToken: () => '', setAuthToken: () => {} }));

const { AuthProvider } = await import('../auth/AuthContext.jsx');
const { UsageProvider } = await import('../auth/UsageContext.jsx');
const { ConfirmProvider, ToastProvider } = await import('./ui/Overlay.jsx');
const { PlayerProvider } = await import('../audio/PlayerContext.jsx');
const MiniPlayer = (await import('./MiniPlayer.jsx')).default;
const Composer = (await import('./chat/Composer.jsx')).default;
const TrackMessage = (await import('./chat/TrackMessage.jsx')).default;
const Sidebar = (await import('./Sidebar.jsx')).default;

// Full provider tree so any consumer hook resolves.
function Tree({ children, route = '/' }) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <UsageProvider>
              <PlayerProvider>{children}</PlayerProvider>
            </UsageProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('MiniPlayer', () => {
  it('renders nothing when no track is loaded', () => {
    const { container } = render(<Tree><MiniPlayer /></Tree>);
    expect(container.querySelector('.miniplayer')).toBeNull();
  });
});

describe('Composer', () => {
  it('renders the prompt textarea + send button', () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <Tree><Composer onSend={() => {}} promptValue="" onPromptChange={() => {}} /></Tree>
    );
    expect(getByPlaceholderText(/Describe the music/)).toBeDefined();
    expect(getByLabelText('Generate')).toBeDefined();
  });

  it('disables the send button when there is no content', () => {
    const { getByLabelText } = render(
      <Tree><Composer onSend={() => {}} promptValue="" onPromptChange={() => {}} /></Tree>
    );
    expect(getByLabelText('Generate').disabled).toBe(true);
  });

  it('calls onSend with the composed payload on submit', () => {
    const onSend = vi.fn();
    const { getByLabelText } = render(
      <Tree><Composer onSend={onSend} promptValue="cinematic" onPromptChange={() => {}} /></Tree>
    );
    fireEvent.click(getByLabelText('Generate'));
    expect(onSend).toHaveBeenCalled();
    const payload = onSend.mock.calls[0][0];
    expect(payload.prompt).toBe('cinematic');
    expect(payload.model).toBe('v3');
    expect(payload.duration).toBe(30);
  });

  it('toggles the advanced panel open/closed', () => {
    const { getByLabelText, getByText } = render(
      <Tree><Composer onSend={() => {}} promptValue="" onPromptChange={() => {}} /></Tree>
    );
    fireEvent.click(getByLabelText('Advanced options'));
    expect(getByText('Lyrics')).toBeDefined();
  });
});

describe('TrackMessage', () => {
  it('renders the generating state', () => {
    const { getByText } = render(
      <Tree><TrackMessage message={{ id: 'm1', status: 'generating' }} /></Tree>
    );
    expect(getByText(/generating/)).toBeDefined();
  });

  it('renders the error state', () => {
    const { getByText } = render(
      <Tree><TrackMessage message={{ id: 'm2', status: 'error', error: 'boom' }} /></Tree>
    );
    expect(getByText(/Something went wrong/)).toBeDefined();
  });

  it('renders a ready track with a waveform slider', () => {
    const { getByRole } = render(
      <Tree><TrackMessage message={{ id: 'm3', status: 'ready', audioUrl: 'https://cdn/x.mp3', prompt: 'lofi' }} /></Tree>
    );
    expect(getByRole('slider')).toBeDefined();
  });
});

describe('Sidebar', () => {
  it('renders the brand + nav links', async () => {
    const { findByText } = render(<Tree><Sidebar /></Tree>);
    expect(await findByText('Create')).toBeDefined();
    expect(await findByText('History')).toBeDefined();
    expect(await findByText('Collections')).toBeDefined();
  });

  it('shows the admin link only for admins', async () => {
    apiMock.me.mockResolvedValueOnce({ user: { uid: 'u1' }, googleConfigured: true, isAdmin: true });
    const { findByText } = render(<Tree><Sidebar /></Tree>);
    expect(await findByText('Admin')).toBeDefined();
  });
});
