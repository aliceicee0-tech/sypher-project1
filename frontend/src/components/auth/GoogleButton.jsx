import { useAuth } from '../../auth/AuthContext.jsx';

// Minimalist monochrome auth control: shows the user when signed in,
// otherwise a "Continue with Google" button.
export default function GoogleButton() {
  const { user, loading, googleConfigured, login, logout } = useAuth();

  if (loading) return <span className="pulse small">…</span>;

  if (user) {
    return (
      <div className="auth">
        {user.avatar_url && (
          <img className="auth__avatar" src={user.avatar_url} alt="" referrerPolicy="no-referrer" />
        )}
        <span className="auth__name">{user.name || user.email}</span>
        <button className="auth__logout" onClick={logout}>Sign out</button>
      </div>
    );
  }

  return (
    <button className="google-btn" onClick={login} disabled={!googleConfigured} title={googleConfigured ? '' : 'Google login not configured on the server'}>
      <svg className="google-btn__g" viewBox="0 0 18 18" width="15" height="15" aria-hidden="true">
        <path fill="#000" d="M17.6 9.2c0-.6-.05-1.18-.16-1.74H9v3.3h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.64-3.88 2.64-6.54z" opacity=".95"/>
        <path fill="#000" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.94v2.33A9 9 0 0 0 9 18z" opacity=".75"/>
        <path fill="#000" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.05l3.03-2.33z" opacity=".55"/>
        <path fill="#000" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.95l3.03 2.33C4.68 5.16 6.66 3.58 9 3.58z" opacity=".85"/>
      </svg>
      Continue with Google
    </button>
  );
}
