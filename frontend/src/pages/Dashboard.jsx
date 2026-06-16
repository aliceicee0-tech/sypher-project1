import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.listProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  async function createNew() {
    const p = await api.createProject({ title: 'Untitled' });
    navigate(`/editor/${p.project_id}`);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">MusiBlock</div>
        <button className="btn" onClick={createNew}>New project</button>
      </header>

      <main className="dashboard">
        <h1 className="dashboard__title">Your projects</h1>
        {loading && <p className="pulse">loading…</p>}
        {!loading && projects.length === 0 && (
          <p className="muted">No projects yet. Create your first one.</p>
        )}
        <ul className="project-grid">
          {projects.map((p) => (
            <li
              key={p.project_id}
              className="project-card fade-in"
              onClick={() => navigate(`/editor/${p.project_id}`)}
            >
              <div className="project-card__title">{p.title || 'Untitled'}</div>
              <div className="project-card__meta">{(p.nodes || []).length} blocks</div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
