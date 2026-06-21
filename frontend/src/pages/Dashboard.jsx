import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useConfirm, useToast, Modal } from '../components/ui/Overlay.jsx';

/**
 * Collections — the user's named albums / playlists of saved tracks.
 *
 * Create / rename / delete use themed modals + toasts instead of native
 * browser prompts.
 */
export default function Dashboard() {
  const [cols, setCols] = useState(null);
  const [renaming, setRenaming] = useState(null); // { id, title } when open
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();

  async function refresh() {
    try {
      setCols(await api.listCollections());
    } catch {
      setCols([]);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function createNew() {
    try {
      const c = await api.createCollection({ title: 'Untitled collection' });
      navigate(`/collections/${c.collection_id}`);
    } catch (e) {
      toast('Could not create collection', { type: 'error' });
    }
  }

  function openRename(c) {
    setRenaming({ id: c.collection_id, title: c.title || 'Untitled collection' });
  }

  async function submitRename(e) {
    e.preventDefault();
    const title = renaming.title.trim();
    if (!title) return;
    try {
      await api.renameCollection(renaming.id, title);
      setRenaming(null);
      toast('Collection renamed', { type: 'success' });
      refresh();
    } catch {
      toast('Rename failed', { type: 'error' });
    }
  }

  async function remove(c) {
    const ok = await confirm({
      title: `Delete “${c.title || 'Untitled'}”?`,
      message: 'This collection and its saved tracks will be removed. This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteCollection(c.collection_id);
      toast('Collection deleted', { type: 'success' });
      refresh();
    } catch {
      toast('Could not delete', { type: 'error' });
    }
  }

  return (
    <div className="dashboard">
      <header
        className="page-head"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <h1>Collections</h1>
          <p className="muted">Your albums of saved tracks.</p>
        </div>
        <button className="btn" onClick={createNew}>New collection</button>
      </header>

      {cols === null && <p className="pulse" style={{ padding: '0 32px' }}>loading…</p>}
      {cols !== null && cols.length === 0 && (
        <p className="muted" style={{ padding: '0 32px' }}>
          No collections yet. Create your first one, then save tracks into it from the chat.
        </p>
      )}

      <ul className="project-grid" style={{ padding: '0 32px' }}>
        {cols?.map((c) => (
          <li
            key={c.collection_id}
            className="project-card fade-in"
            onClick={() => navigate(`/collections/${c.collection_id}`)}
          >
            <div className="collection-card__art">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <div className="project-card__title">{c.title || 'Untitled'}</div>
            <div className="project-card__meta">{(c.tracks || []).length} tracks</div>
            <div className="project-card__actions" onClick={(e) => e.stopPropagation()}>
              <button className="card-action" onClick={() => openRename(c)} title="Rename">
                Rename
              </button>
              <button
                className="card-action card-action--danger"
                onClick={() => remove(c)}
                title="Delete"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Rename modal */}
      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename collection">
        <form className="form" onSubmit={submitRename}>
          <label className="field">
            <span>Name</span>
            <input
              autoFocus
              value={renaming?.title || ''}
              onChange={(e) => setRenaming((r) => ({ ...r, title: e.target.value }))}
              placeholder="Collection name"
            />
          </label>
          <div className="form__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setRenaming(null)}>
              Cancel
            </button>
            <button type="submit" className="btn">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
