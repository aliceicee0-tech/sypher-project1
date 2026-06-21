import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Logo from './Logo.jsx';

/**
 * Resizable sidebar (monochrome).
 *
 * A full-height panel on the left, wide enough to show icon + label for each
 * nav entry. Its width is draggable via a grip on the right edge and
 * persisted to localStorage so it survives reloads. Clamped to [200, 420]px.
 *
 * Sections: brand header, primary nav (Create / History / Projects), and the
 * account / sign-in affordance pinned to the bottom.
 */

const MIN_PCT = 18; // % of viewport width
const MAX_PCT = 42;
const DEFAULT_PCT = 30; // sidebar occupies ~30% of the page by default
const STORAGE_KEY = 'melodia.sidebar.pct';

// Minimal stroke icons (24x24, currentColor) — no icon dependency.
const Icon = {
  spark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

function NavItem({ to, label, onClick, children }) {
  return (
    <NavLink to={to} end={to === '/'} className="side__nav-item" onClick={onClick}>
      <span className="side__nav-icon">{children}</span>
      <span className="side__nav-label">{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { user, googleConfigured, isAdmin, login, logout } = useAuth();
  const [pct, setPct] = useState(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return saved >= MIN_PCT && saved <= MAX_PCT ? saved : DEFAULT_PCT;
  });
  // Mobile drawer: hidden by default, opened via the top-left hamburger, and
  // closed by tapping a nav item, the backdrop, or navigating.
  const [open, setOpen] = useState(false);
  const dragging = useRef(false);
  // Keep a ref in sync so the pointerup handler always reads the latest value
  // without needing `pct` in its dependency array (which would re-register
  // listeners on every pixel of drag).
  const pctRef = useRef(pct);
  pctRef.current = pct;

  // Auto-close the drawer whenever the route changes (a nav link was tapped).
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Lock background scroll while the drawer is open on mobile.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const onPointerDown = useCallback((e) => {
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }, []);

  useEffect(() => {
    function onMove(e) {
      if (!dragging.current) return;
      const p = (e.clientX / window.innerWidth) * 100;
      setPct(Math.min(MAX_PCT, Math.max(MIN_PCT, p)));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(STORAGE_KEY, String(pctRef.current));
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {/* Mobile-only hamburger. Hidden on desktop via CSS (.side__toggle). */}
      <button
        type="button"
        className="side__toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="app-sidebar"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="side__toggle-bar" />
        <span className="side__toggle-bar" />
        <span className="side__toggle-bar" />
      </button>

      {/* Tap-to-close scrim behind the drawer on mobile. */}
      <div
        className={`side__scrim${open ? ' side__scrim--open' : ''}`}
        onClick={close}
        aria-hidden="true"
      />

      <aside id="app-sidebar" className={`side${open ? ' side--open' : ''}`} style={{ width: `${pct}%` }}>
      <div className="side__inner">
        {/* Brand */}
        <div className="side__brand">
          <Logo size={30} />
          <span className="side__brand-name">Melodia</span>
        </div>

        {/* Primary navigation */}
        <nav className="side__nav">
          <NavItem to="/" label="Create" onClick={close}>{Icon.spark}</NavItem>
          <NavItem to="/history" label="History" onClick={close}>{Icon.clock}</NavItem>
          <NavItem to="/collections" label="Collections" onClick={close}>{Icon.folder}</NavItem>
        </nav>

        {/* Account / sign-in pinned to bottom — ALWAYS visible. */}
        <div className="side__bottom">
          {isAdmin && (
            <NavItem to="/admin" label="Admin" onClick={close}>{Icon.shield}</NavItem>
          )}
          {user ? (
            <>
              <NavLink to="/account" className="side__account" onClick={close}>
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="side__avatar" />
                ) : (
                  <span className="side__avatar side__avatar--fallback">
                    {(user.name || user.email || '?').slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="side__account-meta">
                  <span className="side__account-name">{user.name || 'Account'}</span>
                  <span className="side__account-email">{user.email}</span>
                </span>
              </NavLink>
              <button className="side__logout" onClick={logout}>Sign out</button>
            </>
          ) : (
            // Always show a sign-in entry, regardless of whether Google is
            // configured on the server. The /login page handles the available
            // methods (and gracefully explains Google setup if needed).
            <NavLink to="/login" className="side__nav-item side__signin-link" onClick={close}>
              <span className="side__nav-icon">{Icon.user}</span>
              <span className="side__nav-label">Sign in</span>
            </NavLink>
          )}
        </div>
      </div>

      {/* Drag handle on the right edge */}
      <div
        className="side__resize"
        onPointerDown={onPointerDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />
    </aside>
    </>
  );
}
