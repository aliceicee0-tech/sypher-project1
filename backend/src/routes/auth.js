import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { config, isGoogleConfigured } from '../config.js';
import { User } from '../models/User.js';
import { signToken, setAuthCookie, clearAuthCookie } from '../auth/jwt.js';
import { dbReady } from './projects.js';

const router = Router();

const client = new OAuth2Client(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

// In-memory user fallback when MongoDB is unavailable.
const userMemory = new Map();

// GET /api/auth/google -> redirect the browser to Google's consent screen.
router.get('/google', (req, res) => {
  if (!isGoogleConfigured) {
    return res.status(503).json({ error: 'Google login is not configured on the server' });
  }
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });
  res.redirect(url);
});

// GET /api/auth/google/callback -> exchange code, upsert user, set cookie.
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing authorization code');

    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.google.clientId,
    });
    const p = ticket.getPayload(); // { sub, email, name, picture, ... }

    const profile = {
      google_id: p.sub,
      email: p.email,
      name: p.name || '',
      avatar_url: p.picture || '',
    };

    let user;
    if (dbReady()) {
      user = await User.findOneAndUpdate(
        { google_id: profile.google_id },
        { $set: profile },
        { new: true, upsert: true }
      ).lean();
    } else {
      user = { _id: profile.google_id, ...profile };
      userMemory.set(profile.google_id, user);
    }

    const token = signToken({
      uid: String(user._id),
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
    });
    setAuthCookie(res, token);

    // Back to the frontend.
    res.redirect(config.clientUrl);
  } catch (err) {
    res.status(500).send(`Google auth failed: ${err.message}`);
  }
});

// GET /api/auth/me -> current user (or null).
router.get('/me', (req, res) => {
  res.json({ user: req.user || null, googleConfigured: isGoogleConfigured });
});

// POST /api/auth/logout -> clear the cookie.
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

export default router;
