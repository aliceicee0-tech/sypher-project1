import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

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
    refresh();
  }, [refresh]);

  const login = useCallback(() => {
    // Full-page navigation to the backend, which redirects to Google.
    window.location.href = api.googleLoginUrl();
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
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
