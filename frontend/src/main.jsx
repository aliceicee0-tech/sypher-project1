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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
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
  </React.StrictMode>
);
