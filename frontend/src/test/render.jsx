import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { AuthProvider } from '../auth/AuthContext.jsx';
import { UsageProvider } from '../auth/UsageContext.jsx';
import { ConfirmProvider, ToastProvider } from '../components/ui/Overlay.jsx';
import { PlayerProvider } from '../audio/PlayerContext.jsx';

// Shared test helpers. NOT a test file (no .test.jsx), so vitest ignores it.

// Render a component inside the full provider tree, with a MemoryRouter so
// route-dependent components don't need a real URL. `api` is auto-mocked by the
// caller via vi.mock('../api.js', ...) before importing this.
export function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <UsageProvider>
              <PlayerProvider>{ui}</PlayerProvider>
            </UsageProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}
