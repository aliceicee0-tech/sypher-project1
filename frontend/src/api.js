// Thin API client. All Treblo calls go through our backend proxy.
//
// In development, Vite proxies "/api/*" to the local backend on :4000, so BASE
// stays as "/api" (same-origin) and a httpOnly cookie carries the auth session.
// In production the frontend (Vercel) and backend (Render) live on different
// origins, so browsers block third-party cookies. We therefore store the JWT
// in localStorage (received via ?token= after the OAuth redirect) and send it
// as a Bearer Authorization header on every request.
const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'melodia_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function http(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    headers,
    credentials: 'include', // send the auth cookie with every request (dev)
    ...options,
  });
  // Session expired / missing — bounce to the login screen (but never interrupt
  // the /auth/me bootstrap or the login flow itself).
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
    throw new Error('authentication required');
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || res.statusText);
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Generation
  startGeneration: (body) => http('/generate', { method: 'POST', body: JSON.stringify(body) }),
  getGeneration: (jobId) => http(`/generate/${jobId}`),
  // Polling helper: resolves with the final audio URL (or rejects on error).
  pollUntilReady: (jobId, { interval = 1500, onTick } = {}) =>
    new Promise((resolve, reject) => {
      const tick = async () => {
        try {
          const r = await http(`/generate/${jobId}`);
          onTick?.(r);
          if (r.status === 'ready') return resolve(r.audioUrl);
          if (r.status === 'error') return reject(new Error('generation failed'));
          setTimeout(tick, interval);
        } catch (e) {
          reject(e);
        }
      };
      tick();
    }),

  // Generation history
  listGenerations: () => http('/generations'),

  // Projects (legacy node-editor — kept for backwards compat, unused by UI)
  listProjects: () => http('/projects'),
  createProject: (body) => http('/projects', { method: 'POST', body: JSON.stringify(body) }),
  getProject: (id) => http(`/projects/${id}`),
  saveProject: (id, body) => http(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteProject: (id) => http(`/projects/${id}`, { method: 'DELETE' }),

  // Collections (new: user-named albums grouping saved tracks)
  listCollections: () => http('/collections'),
  createCollection: (body) => http('/collections', { method: 'POST', body: JSON.stringify(body) }),
  getCollection: (id) => http(`/collections/${id}`),
  renameCollection: (id, title) => http(`/collections/${id}`, { method: 'PUT', body: JSON.stringify({ title }) }),
  addTrackToCollection: (id, track) =>
    http(`/collections/${id}/tracks`, { method: 'POST', body: JSON.stringify(track) }),
  removeTrackFromCollection: (id, trackId) =>
    http(`/collections/${id}/tracks/${trackId}`, { method: 'DELETE' }),
  deleteCollection: (id) => http(`/collections/${id}`, { method: 'DELETE' }),

  // Public share
  getShared: (id) => http(`/share/${id}`),
  shareTrack: (body) => http('/share', { method: 'POST', body: JSON.stringify(body) }),

  // Usage / quota
  getUsage: () => http('/usage'),

  // Plans & Orders (Payments)
  listPlans: () => http('/plans'),
  listOrders: () => http('/orders'),
  createOrder: (body) => http('/orders', { method: 'POST', body: JSON.stringify(body) }),
  cancelOrder: (id) => http(`/orders/${id}/cancel`, { method: 'POST' }),
  confirmOrder: (id) => http(`/orders/${id}/confirm`, { method: 'POST' }),

  // Admin (orders from ALL users + capacity/key-pool status)
  adminAllOrders: () => http('/orders/admin/all'),
  adminStatus: () => http('/admin/status'),

  // Auth
  me: () => http('/auth/me'),
  logout: () => http('/auth/logout', { method: 'POST' }),
  // Full-page redirect to Google's consent screen (handled by the backend).
  googleLoginUrl: () => `${BASE}/auth/google`,
};
