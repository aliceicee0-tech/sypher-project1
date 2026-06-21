import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getAuthToken, setAuthToken } from '../api.js';

const AuthContext = createContext({
  user: null,
  loading: true,
  googleConfigured: false,
  isAdmin: false,
  login: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user, googleConfigured, isAdmin } = await api.me();
      setUser(user);
      setGoogleConfigured(googleConfigured);
      setIsAdmin(Boolean(isAdmin));
    } catch {
      setUser(null);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Capture the token passed via ?token=... after the OAuth redirect (prod).
    // The backend appends it when cross-origin cookies are unreliable. We store
    // it, then strip it from the URL so it doesn't linger in the address bar /
    // browser history.
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setAuthToken(token);
      params.delete('token');
      const clean = params.toString();
      const newUrl = window.location.pathname + (clean ? `?${clean}` : '');
      window.history.replaceState({}, '', newUrl);
    }
    refresh();
  }, [refresh]);

  const login = useCallback(() => {
    // Full-page navigation to the backend, which redirects to Google.
    window.location.href = api.googleLoginUrl();
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore — we clear locally anyway
    }
    setAuthToken(null);
    setUser(null);
    setIsAdmin(false);
    // With auth now required everywhere, send the user to the login screen.
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, googleConfigured, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
