// Thin API client. All Treblo calls go through our backend proxy.
const BASE = '/api';

async function http(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || res.statusText);
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Generation
  startGeneration: (body) => http('/generate', { method: 'POST', body: JSON.stringify(body) }),
  getGeneration: (jobId) => http(`/generate/${jobId}`),

  // Projects
  listProjects: () => http('/projects'),
  createProject: (body) => http('/projects', { method: 'POST', body: JSON.stringify(body) }),
  getProject: (id) => http(`/projects/${id}`),
  saveProject: (id, body) => http(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteProject: (id) => http(`/projects/${id}`, { method: 'DELETE' }),

  // Public share
  getShared: (id) => http(`/share/${id}`),
};
