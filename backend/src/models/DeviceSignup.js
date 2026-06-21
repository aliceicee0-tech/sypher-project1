import mongoose from 'mongoose';

/**
 * Signup-attribution log for anti-account-farming.
 *
 * Each row records one account creation, attributed to the (device_id, ip) of
 * the browser that performed the OAuth signup. The abuse service counts recent
 * rows for a given device+ip (and, as a fallback net, ip-only) to decide
 * whether a new signup is allowed.
 *
 * This collection is append-mostly. Old rows can be safely purged by a TTL
 * index or a periodic cleanup; we keep them for now so the cap is enforced on
 * a rolling window since server start (in-memory fallback) / since first row
 * (Mongo, until a TTL is added).
 */
const DeviceSignupSchema = new mongoose.Schema(
  {
    device_id: { type: String, required: true }, // UUID from the browser (localStorage)
    ip: { type: String, required: true }, // client IP at signup time
    google_id: { type: String, required: true }, // the Google account that signed up
    email: { type: String, default: '' },
  },
  { timestamps: true }
);

// Hot path: count recent signups by (device_id, ip) within a time window.
DeviceSignupSchema.index({ device_id: 1, ip: 1, createdAt: -1 });
// IP-only net (catches device-id reset via clearing localStorage).
DeviceSignupSchema.index({ ip: 1, createdAt: -1 });
// TTL: auto-delete rows older than 24h. The abuse window is only 10 min
// (config.abuse.signupWindowMs), so 24h keeps plenty of headroom for a
// post-incident audit while bounding the collection size automatically.
DeviceSignupSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const DeviceSignup = mongoose.model('DeviceSignup', DeviceSignupSchema);
