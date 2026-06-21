import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { UsageProvider } from './auth/UsageContext.jsx';
import { ConfirmProvider, ToastProvider } from './components/ui/Overlay.jsx';
import { PlayerProvider } from './audio/PlayerContext.jsx';
import './styles/theme.css';
import './styles/ui.css';
import './styles/effects.css';

// Build the full provider tree around <App/>. Exported so tests can render it
// (with a MemoryRouter if they want to control routing) without duplicating the
// wiring. Keep the providers in the SAME order as production.
export function renderTree() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}

// Mount the app into #root. Exported (and auto-invoked below) so it runs in prod
// but can be skipped / controlled in tests.
export function bootstrap() {
  const root = document.getElementById('root');
  if (!root) return null;
  return ReactDOM.createRoot(root).render(<React.StrictMode>{renderTree()}</React.StrictMode>);
}

// Auto-mount when this is the Vite entry. Guarded by #root presence so importing
// the module in a test (no #root) doesn't crash.
bootstrap();
