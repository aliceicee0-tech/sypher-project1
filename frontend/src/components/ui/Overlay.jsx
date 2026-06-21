import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/* ============================================================
   Modal — a centered dialog over a dimmed backdrop.
   ============================================================ */
export function Modal({ open, onClose, children, title, width = 420 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && <div className="modal__title">{title}</div>}
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

/* ============================================================
   Confirm — a promise-based confirmation dialog.
   Replaces window.confirm() with a themed modal.
     const ok = await confirm({ title, message, danger })
   ============================================================ */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { opts, resolve }
  const [open, setOpen] = useState(false);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setState({ opts, resolve });
        setOpen(true);
      }),
    []
  );

  const close = (result) => {
    setOpen(false);
    state?.resolve?.(result);
    setTimeout(() => setState(null), 200);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={open} onClose={() => close(false)}>
        <div className="confirm">
          <h3 className="confirm__title">{state?.opts?.title || 'Are you sure?'}</h3>
          {state?.opts?.message && (
            <p className="confirm__message muted">{state?.opts.message}</p>
          )}
          <div className="confirm__actions">
            <button className="btn btn--ghost" onClick={() => close(false)}>
              {state?.opts?.cancelLabel || 'Cancel'}
            </button>
            <button
              className={`btn${state?.opts?.danger ? ' btn--danger' : ''}`}
              onClick={() => close(true)}
            >
              {state?.opts?.confirmLabel || 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

/* ============================================================
   Toast — transient notifications (top-right).
   Replaces alert() with a non-blocking, auto-dismissing notice.
     const toast = useToast()
     toast('Track saved', { type: 'success' })
   ============================================================ */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message, { type = 'info', duration = 3200 } = {}) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => remove(id), duration);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type} fade-in`} onClick={() => remove(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
