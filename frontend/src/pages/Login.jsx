import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Logo from '../components/Logo.jsx';
import { detectInAppBrowser, tryOpenInExternalBrowser } from '../utils/inAppBrowser.js';

/**
 * Login / Signup page.
 *
 * Authentication is Google-only. The backend performs the OAuth code-exchange
 * and redirects back here on completion. If something goes wrong during the
 * OAuth flow, the backend redirects to `/login?error=<code>`; we surface a
 * short, friendly message for each known code.
 *
 * Supports a `?mode=signup` hint used only for the headline wording — Google's
 * consent screen (prompt: 'select_account') is the same for both.
 */
const ERROR_MESSAGES = {
  oauth_state_mismatch:
    'The sign-in session expired or was opened in a different tab. Please try again.',
  oauth_missing_code: 'Google did not return an authorization code. Please try again.',
  oauth_failed: 'We could not complete the Google sign-in. Please try again.',
  oauth_email_not_verified: 'Your Google account email is not verified. Verify it and try again.',
  signup_blocked:
    'Too many accounts were created recently from this device or network. Please try again later.',
  signup_closed:
    'Our beta is full — we’ve reached the 100-user limit for this launch. We’ll reopen soon.',
};

export default function Login() {
  const { user, loading, googleConfigured, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isSignup = params.get('mode') === 'signup';
  const errorCode = params.get('error');
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] || 'Sign-in failed. Please try again.' : '';

  // In-app browsers (Facebook, TikTok, Instagram, …) are rejected by Google
  // OAuth with "access blocked". Detect once and warn the user to open the app
  // in a standalone browser (Chrome / Safari) instead.
  const [inApp] = useState(() => detectInAppBrowser());
  const [copied, setCopied] = useState(false);

  // After a successful Google OAuth round-trip the backend redirects here with
  // NO error query and a freshly set auth cookie. If we're now logged in, leave
  // the login screen and go to the app. Also covers a manual visit to /login
  // while already authenticated.
  useEffect(() => {
    if (!loading && user && !errorCode) navigate('/', { replace: true });
  }, [user, loading, errorCode, navigate]);

  async function copyLink() {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may be blocked in some webviews */ }
  }

  return (
    <div className="auth-page">
      <div className="auth-card fade-in">
        <div className="auth-card__logo">
          <Logo size={56} />
        </div>
        <h1 className="auth-card__title">
          {isSignup ? 'Create your account' : 'Welcome to Melodia'}
        </h1>
        <p className="auth-card__subtitle muted">
          {isSignup
            ? 'Start generating music in seconds — sign in with Google.'
            : 'Sign in with Google to create, save and share your music.'}
        </p>

        {errorMessage && (
          <div className="auth-card__error" role="alert">
            {errorMessage}
          </div>
        )}

        {inApp && (
          <div className="auth-card__warn" role="alert" style={{
            background: 'rgba(255, 180, 0, 0.08)',
            border: '1px solid rgba(255, 180, 0, 0.4)',
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '14px',
            textAlign: 'left',
          }}>
            <strong style={{ display: 'block', marginBottom: '6px' }}>
              Open in your browser to sign in
            </strong>
            <span className="muted small" style={{ display: 'block', marginBottom: '12px' }}>
              Google blocks sign-in from {inApp}&rsquo;s built-in browser. Tap below to open Melodia
              in your phone&rsquo;s browser (Chrome or Safari), then tap &ldquo;Continue with Google&rdquo;.
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn btn--ghost"
                style={{ flex: '1 1 auto', minWidth: '120px' }}
                onClick={() => tryOpenInExternalBrowser()}
              >
                Open in browser
              </button>
              <button
                className="btn btn--ghost"
                style={{ flex: '0 0 auto' }}
                onClick={copyLink}
                title="Copy the link so you can paste it in your browser"
              >
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        )}

        <div className="auth-card__methods">
          {loading ? (
            // The auth check (/api/auth/me) hasn't resolved yet. On Render's
            // free tier this can take ~30-50s (cold start), so the button MUST
            // not be replaced by the "isn't configured" message in the
            // meantime — that message is only truthful once we KNOW Google is
            // off (a definitive false), not while we merely haven't heard back.
            <div className="auth-card__loading" aria-live="polite">
              <span className="pulse small">Checking your session…</span>
            </div>
          ) : googleConfigured ? (
            <button className="btn auth-google" onClick={login}>
              <GoogleGlyph />
              Continue with Google
            </button>
          ) : (
            <div className="auth-card__hint muted small">
              Google sign-in isn’t configured on this server yet.
              <br />
              Add <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> to{' '}
              <code>backend/.env</code> to enable it. See <code>SETUP_GOOGLE.md</code>.
            </div>
          )}

          {/* DEV ONLY: never rendered in a production build (Vite sets
              import.meta.env.PROD=true at build time). The backend route is
              also hard-gated on NODE_ENV !== 'production', so even calling it
              in prod 404s. Double safety. */}
          {!import.meta.env.PROD && (
            <button
              className="btn btn--ghost"
              style={{ marginTop: '12px', width: '100%', borderColor: 'rgba(255, 255, 255, 0.15)' }}
              onClick={async () => {
                try {
                  const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/bypass-login`, { method: 'POST', credentials: 'include' });
                  if (res.ok) {
                    window.location.reload();
                  }
                } catch (e) {
                  console.error(e);
                }
              }}
            >
              Dev Mode: Bypass Login
            </button>
          )}
        </div>

        <div className="auth-card__foot">
          {isSignup ? (
            <span>
              Already have an account?{' '}
              <button className="auth-link" onClick={() => navigate('/login')}>
                Sign in
              </button>
            </span>
          ) : (
            <span>
              New here?{' '}
              <button className="auth-link" onClick={() => navigate('/login?mode=signup')}>
                Create an account
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
