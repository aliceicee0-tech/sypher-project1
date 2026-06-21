import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { api } from '../api.js';

/**
 * UsageContext — the freemium quota, available app-wide.
 *
 *   const { quota, refresh, setQuota, limited } = useUsage()
 *
 * The quota is fetched once the user is authenticated, and can be refreshed
 * after a generation (the backend returns the updated quota in the generate
 * response, so callers can setQuota directly without an extra request).
 */
const UsageContext = createContext(null);

// Placeholder quota before the backend reports the real value. Mirrors the
// free-plan default (2 generations/month) so the badge isn't briefly wrong.
const emptyQuota = {
  plan: 'free',
  month: '',
  count: 0,
  limit: 2,
  remaining: 2,
  canGenerate: true,
  resetsAt: null,
};

export function UsageProvider({ children }) {
  const { user, loading } = useAuth();
  const [quota, setQuota] = useState(emptyQuota);

  const refresh = useCallback(async () => {
    try {
      const q = await api.getUsage();
      setQuota(q);
    } catch {
      // keep the last known quota on error
    }
  }, []);

  // Load the quota once the user is known.
  useEffect(() => {
    if (!loading && user) refresh();
    if (!loading && !user) setQuota(emptyQuota);
  }, [loading, user, refresh]);

  const value = {
    quota,
    refresh,
    setQuota,
    limited: !!user && !quota.canGenerate,
  };

  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
}

export const useUsage = () => useContext(UsageContext);
