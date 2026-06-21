import mongoose from 'mongoose';

/**
 * A Share = a public, read-only link to a single generated track.
 *
 * The frontend Player page reads these via GET /api/share/:id (public). Only
 * the owner can create one (POST /api/share). The id is an unguessable nanoid,
 * so a share link functions like a capability token.
 */
const ShareSchema = new mongoose.Schema(
  {
    share_id: { type: String, required: true, unique: true, index: true },
    owner_id: { type: String, required: true },
    title: { type: String, default: 'Untitled' },
    prompt: { type: String, default: '' },
    style_tags: { type: [String], default: [] },
    duration: { type: Number, default: 30 },
    audio_url: { type: String, required: true },
  },
  { timestamps: true }
);

export const Share = mongoose.model('Share', ShareSchema);
