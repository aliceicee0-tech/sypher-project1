import { describe, it, expect } from 'vitest';
import { isDbReady, connection } from './db.js';
import mongoose from 'mongoose';

describe('db', () => {
  it('isDbReady returns true only when the connection state is "connected" (1)', () => {
    // In the test process there is no live Mongo connection, so the state is
    // disconnected (0) and isDbReady() must be false.
    expect([0, 2, 3]).toContain(mongoose.connection.readyState);
    expect(isDbReady()).toBe(false);
  });

  it('exposes the mongoose connection object', () => {
    expect(connection).toBe(mongoose.connection);
  });
});
