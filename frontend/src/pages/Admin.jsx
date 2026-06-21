import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * Admin dashboard — order validation + capacity/key-pool health.
 *
 * Accessible only to accounts whose email is in ADMIN_EMAILS (the backend
 * enforces this on every /api/orders/admin/* and /api/admin/* call). The route
 * is also guarded client-side so non-admins never see the link.
 *
 * The page is the single place an operator goes to:
 *   - see every pending order across all users (with their Mvola number + ref)
 *   - confirm (✓) or cancel (✗) a payment after cross-checking the Mvola statement
 *   - glance at capacity (users vs MAX_USERS) and the Treblo key pool health
 */
const displayStatus = (status) =>
  status === 'pending' ? 'En attente' : status === 'paid' ? 'Payé' : status === 'cancelled' ? 'Annulé' : status;

const displayPlan = (planName) =>
  planName ? planName.charAt(0).toUpperCase() + planName.slice(1) : '';

const CheckIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const TrashIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export default function Admin() {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // 'pending' | 'all'
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [all, st] = await Promise.all([api.adminAllOrders(), api.adminStatus()]);
      setOrders(all);
      setStatus(st);
    } catch (err) {
      console.error('[admin] load failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin, refresh]);

  const handleConfirm = async (orderId) => {
    try {
      await api.confirmOrder(orderId);
      showToast('Commande validée — plan/crédits accordés.');
      refresh();
    } catch (err) {
      showToast(`Erreur: ${err.message}`);
    }
  };

  const handleCancel = async (orderId) => {
    if (!window.confirm('Annuler cette commande ?')) return;
    try {
      await api.cancelOrder(orderId);
      showToast('Commande annulée.');
      refresh();
    } catch (err) {
      showToast(`Erreur: ${err.message}`);
    }
  };

  if (!isAdmin) {
    return (
      <div className="account">
        <header className="page-head"><h1>Admin</h1></header>
        <div className="account__card">
          <p className="muted">Accès réservé aux administrateurs.</p>
        </div>
      </div>
    );
  }

  const visibleOrders = filter === 'pending' ? orders.filter((o) => o.status === 'pending') : orders;
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const cap = status?.capacity || {};
  const treblo = status?.treblo || {};

  return (
    <div className="account">
      <header className="page-head">
        <h1>Admin — Paiements</h1>
      </header>

      {toast && (
        <div className="toast-stack">
          <div className="toast toast--success" onClick={() => setToast('')}>{toast}</div>
        </div>
      )}

      {/* Status cards */}
      <div className="account__stats" style={{ marginBottom: '24px' }}>
        <div className="account__stat">
          <div className="account__stat-value">{pendingCount}</div>
          <div className="account__stat-label">Commandes en attente</div>
        </div>
        <div className="account__stat">
          <div className="account__stat-value">{cap.users ?? '—'}{cap.maxUsers ? `/${cap.maxUsers}` : ''}</div>
          <div className="account__stat-label">Utilisateurs inscrits</div>
        </div>
        <div className="account__stat">
          <div className="account__stat-value">{treblo.healthy ?? '—'}{treblo.total ? `/${treblo.total}` : ''}</div>
          <div className="account__stat-label">Clés Treblo saines</div>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          className={`btn btn--sm ${filter === 'pending' ? '' : 'btn--ghost'}`}
          onClick={() => setFilter('pending')}
        >
          En attente ({pendingCount})
        </button>
        <button
          className={`btn btn--sm ${filter === 'all' ? '' : 'btn--ghost'}`}
          onClick={() => setFilter('all')}
        >
          Toutes ({orders.length})
        </button>
      </div>

      {/* Orders table */}
      {loading ? (
        <div className="account__card text-center"><span className="pulse">Chargement…</span></div>
      ) : visibleOrders.length === 0 ? (
        <div className="account__card text-center">
          <p className="muted small">Aucune commande {filter === 'pending' ? 'en attente' : ''}.</p>
        </div>
      ) : (
        <div className="orders-table-wrapper">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Article</th>
                <th>Montant</th>
                <th>Mode</th>
                <th>N° / Référence</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((o) => {
                const isPending = o.status === 'pending';
                return (
                  <tr key={o.order_id}>
                    <td>
                      <div>{o.owner_email || '—'}</div>
                      <div className="font-mono text-xs text-muted">{o.order_id}</div>
                    </td>
                    <td>
                      {o.item?.type === 'plan'
                        ? `Forfait ${displayPlan(o.item?.plan)}`
                        : `Pack +${o.item?.generations} crédits`}
                    </td>
                    <td className="font-mono">{o.price_eur} €</td>
                    <td>{o.method === 'mvola' ? 'Mvola' : 'Banque'}</td>
                    <td className="font-mono text-xs text-muted">
                      {o.payer_phone && <div>📞 {o.payer_phone}</div>}
                      <div>{o.payment_ref || '—'}</div>
                    </td>
                    <td>
                      <span className={`status-badge status-badge--${o.status}`}>
                        {displayStatus(o.status)}
                      </span>
                    </td>
                    <td>
                      <div className="order-actions">
                        {isPending && (
                          <button
                            className="btn-action btn-action--success"
                            onClick={() => handleConfirm(o.order_id)}
                            title="Valider le paiement"
                          >
                            {CheckIcon}
                          </button>
                        )}
                        {isPending && (
                          <button
                            className="btn-action btn-action--danger"
                            onClick={() => handleCancel(o.order_id)}
                            title="Annuler la commande"
                          >
                            {TrashIcon}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
