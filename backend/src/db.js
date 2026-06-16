import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDb() {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('[db] connected to MongoDB');
  } catch (err) {
    // Non-fatal: the API still boots so the frontend/mock flow can be demoed.
    console.warn('[db] MongoDB connection failed, persistence disabled:', err.message);
  }
}
