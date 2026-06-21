import { Router } from 'express';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { config, isGoogleConfigured, adminEmails } from '../config.js';
import { isDbReady } from '../db.js';
import { User } from '../models/User.js';
import { signToken, setAuthCookie, clearAuthCookie } from '../auth/jwt.js';
import { checkSignupAllowed, recordSignup } from '../services/abuse.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// The OAuth callback performs outbound calls to Google (token + verifyIdToken),
// so it is expensive to flood. Cap it tightly per IP: well above what a real
// user would do in a minute, low enough to blunt an abusive script. Lives on
// top of the server-wide limiter already mounted at /api/auth.
const callbackLimiter = rateLimit({
  max: 20,
  windowMs: 60_000,
  message: 'Too many login attempts. Please wait a minute and try again.',
});

const client = new OAuth2Client(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

// In-memory user fallback when MongoDB is unavailable (demo only).
const userMemory = new Map();

const STATE_COOKIE = 'melodia_oauth_state';
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

// The anti-abuse device id lives in a cookie set by the frontend, so it
// survives the full-page OAuth redirect round-trip (frontend -> backend ->
// Google -> backend -> frontend). httpOnly=false so the frontend can read/set
// it; not sensitive — it's just a random UUID.
const DEVICE_COOKIE = config.abuse.deviceCookie;

function readDeviceId(req) {
  return (req.cookies?.[DEVICE_COOKIE] || '').trim() || null;
}

function setStateCookie(res, state) {
  // Cross-origin in prod (frontend on Vercel, callback hits the frontend origin
  // which proxies/redirects to the backend): SameSite=None + Secure so the
  // state cookie survives the Google redirect round-trip.
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: config.isProduction ? 'none' : 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: STATE_MAX_AGE_MS,
  });
}
function clearStateCookie(res) {
  res.clearCookie(STATE_COOKIE, { path: '/' });
}

/**
 * GET /api/auth/google -> redirect the browser to Google's consent screen.
 *
 * We generate a random `state` value, store it in a short-lived cookie, and
 * pass it to Google. The callback verifies the value matches before accepting
 * the authorization code — this defeats login-CSRF / forced-auth attacks.
 */
router.get('/google', (req, res) => {
  if (!isGoogleConfigured) {
    return res.status(503).json({ error: 'Google login is not configured on the server' });
  }
  const state = crypto.randomBytes(16).toString('hex');
  setStateCookie(res, state);

  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
    state,
  });
  res.redirect(url);
});

/**
 * GET /api/auth/google/callback -> exchange code, upsert user, set cookie.
 */
router.get('/google/callback', callbackLimiter, async (req, res) => {
  const { code, state } = req.query;

  // 1) Validate the OAuth state against the cookie to prevent login CSRF.
  const cookieState = req.cookies?.[STATE_COOKIE];
  if (!state || !cookieState || state !== cookieState) {
    return redirectToFrontend(res, { error: 'oauth_state_mismatch' });
  }
  if (!code) {
    return redirectToFrontend(res, { error: 'oauth_missing_code' });
  }
  clearStateCookie(res);

  try {
    const profile = await exchangeAndVerify(res, code);
    if (!profile) return; // exchangeAndVerify already redirected

    const deviceId = readDeviceId(req);
    const ip = req.ip || 'unknown';

    const existing = await findExistingUser(profile.google_id);

    // New account: run the anti-farming + capacity gates before creating.
    if (!existing) {
      const block = await signupBlockReason({ deviceId, ip });
      if (block) return redirectToFrontend(res, { error: block });
    }

    const user = await upsertUser(profile, existing, { ip, deviceId });

    // Log the signup only after the upsert succeeds, so a blocked attempt is
    // never counted. Brand-new accounts only.
    if (!existing) {
      await recordSignup({
        deviceId,
        ip,
        googleId: profile.google_id,
        email: profile.email,
      });
    }

    issueSession(res, user);
    return redirectToFrontend(res, config.isProduction ? { token: res.locals.token } : {});
  } catch (err) {
    console.error('[auth] Google callback failed:', err.message);
    // Never send the raw error to the browser — it can leak internal details.
    return redirectToFrontend(res, { error: 'oauth_failed' });
  }
});

// --- OAuth callback helpers (extracted to keep the route handler readable) ---

// Exchange the auth code for tokens and verify the id token; returns a clean
// profile or null (after redirecting on a verified rejection / failure).
async function exchangeAndVerify(res, code) {
  const { tokens } = await client.getToken(code);
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.google.clientId,
  });
  const p = ticket.getPayload(); // { sub, email, name, picture, email_verified, ... }

  // Require a verified Google account. Unverified accounts are the cheapest
  // farming vector; reject them outright.
  if (p.email_verified !== true) {
    redirectToFrontend(res, { error: 'oauth_email_not_verified' });
    return null;
  }
  return {
    google_id: p.sub,
    email: p.email,
    name: p.name || '',
    avatar_url: p.picture || '',
    email_verified: true,
  };
}

// Find an existing user by google_id in Mongo, or the in-memory fallback.
async function findExistingUser(googleId) {
  if (isDbReady()) {
    return User.findOne({ google_id: googleId }).lean();
  }
  return userMemory.get(googleId) || null;
}

// Returns a block reason string ('signup_blocked' | 'signup_closed') for a new
// signup, or null if the signup is allowed. Two independent gates:
//   - per (device_id, ip) + ip-only signup cap (anti-farming)
//   - global MAX_USERS capacity cap (closed beta)
async function signupBlockReason({ deviceId, ip }) {
  const decision = await checkSignupAllowed(deviceId, ip);
  if (!decision.allowed) {
    console.warn(
      `[auth] signup blocked (${decision.reason}): device=${deviceId}, ip=${ip}, deviceIp=${decision.deviceIp}, ipOnly=${decision.ipOnly}`
    );
    return 'signup_blocked';
  }
  if (config.maxUsers > 0) {
    const userCount = isDbReady() ? await User.countDocuments({}) : userMemory.size;
    if (userCount >= config.maxUsers) {
      console.warn(`[auth] signup closed: ${userCount}/${config.maxUsers} users reached`);
      return 'signup_closed';
    }
  }
  return null;
}

// Upsert the user. On first creation we set the attribution + profile; on a
// returning login we only refresh the mutable profile fields (the original
// signup attribution is historical and must not be overwritten).
async function upsertUser(profile, existing, { ip, deviceId }) {
  const signupAttribution = { signup_ip: ip, signup_device: deviceId || '' };
  if (isDbReady()) {
    return User.findOneAndUpdate(
      { google_id: profile.google_id },
      { $set: { ...profile, ...(existing ? {} : signupAttribution) } },
      { new: true, upsert: true }
    ).lean();
  }
  const user = { _id: profile.google_id, ...profile, ...(existing ? {} : signupAttribution) };
  userMemory.set(profile.google_id, user);
  return user;
}

// Sign the JWT, set the auth cookie, and stash the token so the route handler
// can decide whether to also expose it via the redirect URL (prod only).
function issueSession(res, user) {
  const token = signToken({
    uid: String(user._id),
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    status: user.status || 'active',
  });
  setAuthCookie(res, token);
  res.locals.token = token;
}

// Redirect back to the frontend, optionally surfacing a short error code.
function redirectToFrontend(res, query = {}) {
  const url = new URL(config.clientUrl);
  const entries = Object.entries(query).filter(([, v]) => v != null);
  if (entries.length) {
    for (const [k, v] of entries) url.searchParams.set(k, String(v));
    url.pathname = '/login';
  }
  res.redirect(url.toString());
}

// GET /api/auth/me -> current user (or null) + whether Google is configured +
// whether this account is an admin (email in ADMIN_EMAILS). The isAdmin flag
// lets the frontend show admin-only controls (order confirmation button, …)
// without hard-coding any email in the client.
router.get('/me', (req, res) => {
  const email = (req.user?.email || '').toLowerCase();
  res.json({
    user: req.user || null,
    googleConfigured: isGoogleConfigured,
    isAdmin: Boolean(email) && adminEmails.has(email),
  });
});

// POST /api/auth/logout -> clear the cookie.
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// POST /api/auth/bypass-login -> local DEV ONLY bypass to mock log in.
// Hard-gated on NODE_ENV !== 'production' so it can NEVER be reached once the
// app is deployed. In prod this route is not registered at all (404s).
if (!config.isProduction) {
  router.post('/bypass-login', async (req, res) => {
    const profile = {
      google_id: 'mock_dev_user_123',
      email: 'dev@melodia.local',
      name: 'Dev User',
      avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150',
      email_verified: true,
    };

    let user;
    if (isDbReady()) {
      try {
        user = await User.findOneAndUpdate(
          { google_id: profile.google_id },
          { $set: profile },
          { new: true, upsert: true }
        ).lean();
      } catch (err) {
        console.error('[auth] Dev bypass user findOrCreate failed:', err);
        user = { _id: profile.google_id, ...profile };
      }
    } else {
      user = { _id: profile.google_id, ...profile };
      userMemory.set(profile.google_id, user);
    }

    const token = signToken({
      uid: String(user._id),
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      status: user.status || 'active',
    });
    setAuthCookie(res, token);
    res.json({ user, googleConfigured: isGoogleConfigured, isAdmin: adminEmails.has(user.email) });
  });
}

export default router;
