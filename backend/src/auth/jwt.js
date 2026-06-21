import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const COOKIE_NAME = 'melodia_token';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cookieOptions(maxAge = MAX_AGE_MS) {
  // In production the frontend (Vercel) and backend (Render) live on DIFFERENT
  // origins, so the auth cookie must be cross-origin: SameSite=None + Secure,
  // otherwise browsers silently drop it and the user can never stay logged in.
  // In dev everything is same-origin via the Vite proxy, so 'lax' is enough.
  const crossOrigin = config.isProduction;
  return {
    httpOnly: true,
    sameSite: crossOrigin ? 'none' : 'lax',
    secure: config.isProduction, // HTTPS-only in prod (required for SameSite=None)
    path: '/',
    maxAge,
  };
}

export function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

export function clearAuthCookie(res) {
  // Pass the same options (minus maxAge) so the cookie is actually cleared.
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(0), maxAge: undefined });
}

// Express middleware: attaches req.user when a valid token cookie is present.
export function authOptional(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret);
    } catch {
      req.user = null;
    }
  }
  next();
}

// Express middleware: rejects the request when not authenticated.
export function authRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'authentication required' });
  next();
}
