# Google Sign-In setup

Melodia uses **Google OAuth 2.0** as its only authentication method. This guide
walks you through creating the credentials and wiring them into the backend.

You only need to do this once. After it, **all app features require a Google
login** (generation, history, collections, account).

---

## 1. Create a Google Cloud project & OAuth client

1. Open the Google Cloud Console → **APIs & Services → Credentials**
   https://console.cloud.google.com/apis/credentials
2. If you don't have a project, create one (e.g. `Melodia`).
3. Click **Configure Consent Screen** (External), fill the app name, your
   support email, and developer contact. You can leave scopes at the defaults
   (the app only requests `openid email profile`).
4. Back on **Credentials → Create Credentials → OAuth client ID**:
   - **Application type:** `Web application`
   - **Authorized JavaScript origins:**
     - `http://localhost:5173` (frontend dev server)
     - your production origin, e.g. `https://melodia.example.com`
   - **Authorized redirect URIs:**
     - `http://localhost:5173/api/auth/google/callback` (frontend origin in dev)
     - your production callback, e.g. `https://melodia.example.com/api/auth/google/callback`
5. Google shows you a **Client ID** and **Client Secret**. Copy both.

> ⚠️ **Why the frontend origin?** In development the browser app runs on
> `localhost:5173` and calls `/api/*`, which the Vite dev proxy forwards to the
> backend on `localhost:4000`. For the OAuth **state cookie** and the **JWT
> session cookie** to survive the round-trip, the redirect URI must land on the
> same origin the browser is on (`:5173`), **not** the backend port (`:4000`).
> Pointing it at `:4000` causes `oauth_state_mismatch` and a session cookie on
> the wrong origin, so `/auth/me` keeps returning `null`.
>
> The redirect URI must match `GOOGLE_REDIRECT_URI` exactly, including
> protocol, host, path and trailing slash.

## 2. Put them in `backend/.env`

```env
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
CLIENT_URL=http://localhost:5173
```

Restart the backend. On boot you should no longer see the "Google not
configured" state — `/api/auth/me` will return `googleConfigured: true`.

## 3. Try it

1. Start the backend (`npm run dev`) and frontend (`npm run dev`).
2. Open http://localhost:5173 — you'll be redirected to `/login`.
3. Click **Continue with Google** → pick an account → you're back, signed in.

If something fails during the OAuth flow, you'll land on `/login` with a short,
friendly error message (no internal details are leaked to the browser).

## Security notes

- The OAuth flow uses a random `state` value stored in a short-lived cookie to
  prevent login-CSRF / forced-auth attacks.
- The JWT session cookie is `httpOnly` + `sameSite=lax` + `secure` (HTTPS-only
  in production). It lives for 7 days.
- `JWT_SECRET` **must** be a long random string in production, or the server
  refuses to boot. Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Never commit real credentials. `backend/.env` is git-ignored.
