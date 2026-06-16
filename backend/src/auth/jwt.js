import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const COOKIE_NAME = 'mb_token';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
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
