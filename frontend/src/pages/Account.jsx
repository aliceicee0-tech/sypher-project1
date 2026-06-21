import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useUsage } from '../auth/UsageContext.jsx';
import QuotaBadge from '../components/QuotaBadge.jsx';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

const displayPlan = (planName) => {
  if (planName === 'free') return 'Free Plan';
  if (planName === 'starter') return 'Starter Plan';
  if (planName === 'pro') return 'Pro Plan';
  if (planName === 'premium') return 'Premium Plan';
  return planName ? planName.charAt(0).toUpperCase() + planName.slice(1) : 'Free Plan';
};

const displayStatus = (status) => {
  if (status === 'pending') return 'En attente';
  if (status === 'paid') return 'Payé';
  if (status === 'cancelled') return 'Annulé';
  return status;
};

// Emoji-free SVG icons
const CheckIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-check">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TrashIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const VerifyIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const CloseIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function Account() {
  const { user, googleConfigured, isAdmin, login, logout } = useAuth();
  const { quota, refresh: refreshQuota } = useUsage();
  const [stats, setStats] = useState(null);

  // Billing and Orders States
  const [plansData, setPlansData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loadingBilling, setLoadingBilling] = useState(true);
  
  // Checkout modal states
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('mvola');
  const [payerPhone, setPayerPhone] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [copiedUssd, setCopiedUssd] = useState(false);
  
  // Custom toast notification
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const triggerToast = (msg, type = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage('');
    }, 4500);
  };

  // Build the Mvola USSD code for the selected item, with the Ariary amount
  // substituted in. Prices are stored in EUR; Mvola settles in MGA.
  const mvolaUssd = (priceEur) => {
    const rate = plansData?.payment?.eurToMga || 4800;
    const mga = Math.round(priceEur * rate);
    const tpl = plansData?.payment?.mvolaUssdTemplate || '#111*1*2*0384362216*{amount}#';
    return tpl.replace('{amount}', String(mga));
  };
  const mvolaAmountMga = (priceEur) => {
    const rate = plansData?.payment?.eurToMga || 4800;
    return Math.round(priceEur * rate);
  };

  const copyUssd = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUssd(true);
      setTimeout(() => setCopiedUssd(false), 2000);
    } catch {
      // clipboard may be blocked; ignore silently
    }
  };

  const fetchOrders = () => {
    api.listOrders()
      .then(setOrders)
      .catch((err) => console.error('Failed to load orders', err));
  };

  const fetchBillingData = async () => {
    if (!user) return;
    try {
      setLoadingBilling(true);
      const [plans, fetchedOrders] = await Promise.all([
        api.listPlans(),
        api.listOrders()
      ]);
      setPlansData(plans);
      setOrders(fetchedOrders);
    } catch (err) {
      console.error('Error fetching billing/plans data:', err);
    } finally {
      setLoadingBilling(false);
    }
  };

  useEffect(() => {
    api.listGenerations()
      .then((g) => {
        const ready = g.filter((t) => t.status === 'ready').length;
        const minutes = g.reduce((sum, t) => sum + (t.duration || 0), 0) / 60;
        setStats({ total: g.length, ready, minutes: Math.round(minutes * 10) / 10 });
      })
      .catch(() => setStats({ total: 0, ready: 0, minutes: 0 }));

    fetchBillingData();
  }, [user]);

  const handleSelectItem = (item) => {
    setSelectedItem(item);
    setPaymentMethod(plansData?.payment?.methods?.[0] || 'mvola');
    setPayerPhone('');
    setPaymentRef('');
    setCheckoutError('');
    setShowCheckout(true);
  };

  const handleSubmitOrder = async () => {
    if (paymentMethod === 'mvola' && !payerPhone.trim()) {
      setCheckoutError('Le numéro Mvola avec lequel vous avez payé est requis.');
      return;
    }
    if (!paymentRef.trim()) {
      setCheckoutError('La référence du paiement est requise.');
      return;
    }
    try {
      setSubmittingOrder(true);
      setCheckoutError('');
      const body = {
        kind: selectedItem.kind,
        method: paymentMethod,
        payment_ref: paymentRef,
        payer_phone: payerPhone,
      };
      if (selectedItem.kind === 'plan') {
        body.plan = selectedItem.plan;
      } else {
        body.packId = selectedItem.packId;
      }
      await api.createOrder(body);
      setShowCheckout(false);
      triggerToast('Commande créée avec succès, en attente de validation.');
      fetchOrders();
    } catch (err) {
      setCheckoutError(err.message || 'Erreur lors de la création de la commande.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Voulez-vous vraiment annuler cette commande ?')) return;
    try {
      await api.cancelOrder(orderId);
      triggerToast('Commande annulée.');
      fetchOrders();
      refreshQuota();
    } catch (err) {
      triggerToast(`Erreur d'annulation : ${err.message}`, 'error');
    }
  };

  const handleConfirmOrder = async (orderId) => {
    try {
      await api.confirmOrder(orderId);
      triggerToast('Commande confirmée avec succès (Simulé).');
      fetchOrders();
      refreshQuota();
    } catch (err) {
      triggerToast(`Erreur de confirmation : ${err.message}`, 'error');
    }
  };

  if (!user) {
    return (
      <div className="account">
        <header className="page-head">
          <h1>Account</h1>
        </header>
        <div className="account__card">
          <p className="muted">You're not signed in.</p>
          <p className="muted small">Sign in to keep your generations across devices.</p>
          {googleConfigured && (
            <button className="btn" onClick={login}>Sign in with Google</button>
          )}
        </div>
      </div>
    );
  }

  const paymentInfo = plansData?.payment || { methods: ['mvola', 'bank_transfer'], mvolaNumber: '034 00 000 00', bankIban: 'MG83...', bankHolder: 'Melodia Studio LLC' };

  return (
    <div className="account">
      <header className="page-head">
        <h1>Account & Billing</h1>
      </header>

      {/* Notifications toast */}
      {toastMessage && (
        <div className="toast-stack">
          <div className={`toast toast--${toastType}`} onClick={() => setToastMessage('')}>
            {toastMessage}
          </div>
        </div>
      )}

      <div className="account__layout">
        {/* Left column: Profile details and usage metrics */}
        <div className="account__col-left">
          <div className="account__card account__profile">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="account__avatar" />
            ) : (
              <span className="account__avatar account__avatar--fallback">
                {(user.name || user.email || '?').slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="account__who">
              <div className="account__name">{user.name || 'Melodia user'}</div>
              <div className="muted small">{user.email}</div>
            </div>
            <span className="account__plan-badge">{displayPlan(quota.plan)}</span>
          </div>

          <div className="account__card account__plan-card">
            <div className="account__plan-top">
              <h2>Your plan</h2>
              <QuotaBadge block />
            </div>
            <p className="muted small">
              {quota.canGenerate
                ? `Free includes ${quota.limit} generation${quota.limit === 1 ? '' : 's'} per month.`
                : `You've reached this month's limit. It resets on ${formatDate(quota.resetsAt)}.`}
            </p>
          </div>

          <div className="account__stats">
            <div className="account__stat">
              <div className="account__stat-value">{stats ? stats.total : '—'}</div>
              <div className="account__stat-label">Generations</div>
            </div>
            <div className="account__stat">
              <div className="account__stat-value">{stats ? stats.ready : '—'}</div>
              <div className="account__stat-label">Tracks ready</div>
            </div>
            <div className="account__stat">
              <div className="account__stat-value">{stats ? stats.minutes : '—'}</div>
              <div className="account__stat-label">Minutes requested</div>
            </div>
          </div>

          <button className="btn btn--ghost account__signout-btn" onClick={logout}>Sign out</button>
        </div>

        {/* Right column: Plans, credits and order history */}
        <div className="account__col-right">
          {loadingBilling ? (
            <div className="account__card text-center">
              <span className="pulse">Loading billing details...</span>
            </div>
          ) : (
            <>
              {/* Plans Section */}
              <div className="billing-section">
                <h3>Forfaits d'abonnement</h3>
                <p className="muted small">Augmentez vos quotas mensuels pour générer davantage de musiques.</p>
                
                <div className="plans-grid">
                  {plansData?.plans?.map((p) => {
                    const isCurrent = quota.plan === p.id;
                    return (
                      <div key={p.id} className={`plan-card ${isCurrent ? 'plan-card--active' : ''}`}>
                        <div className="plan-card__header">
                          <h4>{displayPlan(p.id)}</h4>
                          {isCurrent && <span className="current-badge">Actuel</span>}
                        </div>
                        <div className="plan-card__price">
                          <span className="price-val font-mono">{p.priceEur}</span>
                          <span className="price-curr"> € / mois</span>
                        </div>
                        <ul className="plan-card__features">
                          <li>
                            {CheckIcon}
                            <span><strong>{p.monthlyLimit}</strong> générations / mois</span>
                          </li>
                          <li>
                            {CheckIcon}
                            <span>Traitement haute priorité</span>
                          </li>
                        </ul>
                        {p.id !== 'free' && (
                          <button 
                            className={`btn ${isCurrent ? 'btn--ghost' : ''}`}
                            disabled={isCurrent}
                            onClick={() => handleSelectItem({ kind: 'plan', plan: p.id, priceEur: p.priceEur })}
                          >
                            {isCurrent ? 'Forfait Actuel' : 'S\'abonner'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Credit Packs Section */}
              <div className="billing-section">
                <h3>Crédits à la demande</h3>
                <p className="muted small">Des recharges de générations sans date de fin de validité.</p>
                
                <div className="packs-grid">
                  {plansData?.creditPacks?.map((pack) => (
                    <div key={pack.id} className="pack-card">
                      <div className="pack-card__header">
                        <h4>+{pack.generations} Crédits</h4>
                        <span className="pack-card__desc">Générations additionnelles</span>
                      </div>
                      <div className="pack-card__price font-mono">{pack.priceEur} €</div>
                      <button 
                        className="btn btn--ghost"
                        onClick={() => handleSelectItem({ kind: 'credits', packId: pack.id, generations: pack.generations, priceEur: pack.priceEur })}
                      >
                        Acheter
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order History Section */}
              <div className="billing-section">
                <h3>Historique des transactions</h3>
                {orders.length === 0 ? (
                  <div className="account__card text-center">
                    <p className="muted small">Aucune commande enregistrée pour le moment.</p>
                  </div>
                ) : (
                  <div className="orders-table-wrapper">
                    <table className="orders-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Article</th>
                          <th>Montant</th>
                          <th>Mode</th>
                          <th>N° / Référence</th>
                          <th>Statut</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => {
                          const isPending = o.status === 'pending';
                          return (
                            <tr key={o.order_id}>
                              <td className="font-mono text-xs">{o.order_id}</td>
                              <td>
                                {o.item?.type === 'plan' 
                                  ? `Forfait ${displayPlan(o.item?.plan)}` 
                                  : `Pack +${o.item?.generations} crédits`}
                              </td>
                              <td className="font-mono">{o.price_eur} €</td>
                              <td>{o.method === 'mvola' ? 'Mvola' : 'Banque'}</td>
                              <td className="font-mono text-xs text-muted">
                                {o.payer_phone && (
                                  <div title="Numéro Mvola utilisé">📞 {o.payer_phone}</div>
                                )}
                                <div title="Référence du paiement">{o.payment_ref || '—'}</div>
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
                                      className="btn-action btn-action--danger" 
                                      onClick={() => handleCancelOrder(o.order_id)}
                                      title="Annuler la commande"
                                    >
                                      {TrashIcon}
                                    </button>
                                  )}
                                  {isPending && isAdmin && (
                                    <button 
                                      className="btn-action btn-action--success" 
                                      onClick={() => handleConfirmOrder(o.order_id)}
                                      title="Valider (Admin)"
                                    >
                                      {VerifyIcon}
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
            </>
          )}
        </div>
      </div>

      {/* Checkout Modal Backdrop & Card */}
      {showCheckout && selectedItem && (
        <div className="overlay fade-in">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="checkout-modal__header">
              <h3 className="modal__title">Finaliser votre achat</h3>
              <button className="checkout-modal__close" onClick={() => setShowCheckout(false)}>
                {CloseIcon}
              </button>
            </div>
            
            <div className="modal__body">
              <div className="checkout-summary-box">
                <div className="checkout-summary-row">
                  <span className="muted">Article:</span>
                  <strong className="text-highlight">
                    {selectedItem.kind === 'plan' 
                      ? `Forfait ${displayPlan(selectedItem.plan)}` 
                      : `Pack +${selectedItem.generations} Crédits`}
                  </strong>
                </div>
                <div className="checkout-summary-row">
                  <span className="muted">Prix à payer:</span>
                  <strong className="font-mono text-highlight">{selectedItem.priceEur} €</strong>
                </div>
              </div>

              <div className="form field" style={{ marginBottom: '16px' }}>
                <span>Méthode de paiement</span>
                <div className="payment-method-selector">
                  {paymentInfo.methods.map((method) => (
                    <button
                      key={method}
                      type="button"
                      className={`payment-method-btn ${paymentMethod === method ? 'payment-method-btn--active' : ''}`}
                      onClick={() => setPaymentMethod(method)}
                    >
                      {method === 'mvola' ? 'Mvola' : 'Virement bancaire'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="checkout-instructions-card">
                {paymentMethod === 'mvola' ? (
                  <>
                    <p className="instruction-text">
                      1. Composez ce code sur votre téléphone pour payer{' '}
                      <strong>{mvolaAmountMga(selectedItem.priceEur).toLocaleString('fr-FR')} Ar</strong>{' '}
                      <span className="muted small">({selectedItem.priceEur} €)</span> :
                    </p>
                    <div className="ussd-box">
                      <code className="ussd-code font-mono">
                        {mvolaUssd(selectedItem.priceEur)}
                      </code>
                      <button
                        type="button"
                        className={`btn btn--ghost btn--sm ${copiedUssd ? 'btn--success' : ''}`}
                        onClick={() => copyUssd(mvolaUssd(selectedItem.priceEur))}
                      >
                        {copiedUssd ? 'Copié ✓' : 'Copier'}
                      </button>
                    </div>
                    <p className="instruction-note">
                      Marchand : <strong>{paymentInfo.mvolaNumber}</strong> ({paymentInfo.bankHolder}).
                      Confirmez le paiement sur votre téléphone.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="instruction-text">
                      Effectuez un virement de{' '}
                      <strong>{mvolaAmountMga(selectedItem.priceEur).toLocaleString('fr-FR')} Ar</strong>{' '}
                      <span className="muted small">({selectedItem.priceEur} €)</span> sur le compte :
                    </p>
                    <div className="ussd-box">
                      <code className="ussd-code font-mono">{paymentInfo.bankIban}</code>
                      <button
                        type="button"
                        className={`btn btn--ghost btn--sm ${copiedUssd ? 'btn--success' : ''}`}
                        onClick={() => copyUssd(paymentInfo.bankIban)}
                      >
                        {copiedUssd ? 'Copié ✓' : 'Copier'}
                      </button>
                    </div>
                    <p className="instruction-note">
                      Titulaire : <strong>{paymentInfo.bankHolder}</strong>.
                      Conservez le reçu du virement.
                    </p>
                  </>
                )}
              </div>

              {paymentMethod === 'mvola' && (
                <div className="form field">
                  <label htmlFor="phoneInput">2. Numéro Mvola utilisé pour payer</label>
                  <input
                    id="phoneInput"
                    type="tel"
                    placeholder="Ex: 034 12 345 67"
                    value={payerPhone}
                    onChange={(e) => setPayerPhone(e.target.value)}
                  />
                </div>
              )}

              <div className="form field">
                <label htmlFor="refInput">
                  {paymentMethod === 'mvola' ? '3. Référence du paiement' : 'Référence du virement'}
                </label>
                <input
                  id="refInput"
                  type="text"
                  placeholder={paymentMethod === 'mvola' ? 'Ex: MP240101.1234.A56789' : 'Ex: REF-123456'}
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                />
                <p className="muted small" style={{ marginTop: '4px' }}>
                  La référence figure dans le SMS de confirmation Mvola.
                </p>
              </div>

              {checkoutError && <div className="checkout-error-msg">{checkoutError}</div>}
            </div>

            <div className="form__actions" style={{ marginTop: '24px' }}>
              <button className="btn btn--ghost" onClick={() => setShowCheckout(false)}>
                Annuler
              </button>
              <button
                className="btn"
                disabled={submittingOrder || !paymentRef.trim() || (paymentMethod === 'mvola' && !payerPhone.trim())}
                onClick={handleSubmitOrder}
              >
                {submittingOrder ? 'Envoi en cours...' : 'Soumettre mon paiement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

