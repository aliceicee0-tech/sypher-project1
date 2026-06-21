import { signToken } from '../auth/jwt.js';

// Shared helpers for route (supertest) tests. Named WITHOUT .test.js so Vitest
// doesn't try to run it as a test file (it has no test cases).

// A signed JWT for a normal authenticated user (dev JWT secret verifies it under
// authOptional). Different uids per helper avoid cross-test quota bleed.
export function authHeader(uid = 'route_user_1', email = 'user@melodia.local') {
  const token = signToken({ uid, email, status: 'active' });
  return { Authorization: `Bearer ${token}` };
}

export function adminAuthHeader(uid = 'route_admin', email = 'dev@melodia.local') {
  return authHeader(uid, email);
}
