import mongoose from 'mongoose';

/**
 * A generation record: a Treblo job owned by a user, from the moment it's
 * submitted (status 'generating') until it resolves (status 'ready'/'error').
 *
 * Persisted to MongoDB so a user's history survives backend restarts (Render's
 * free tier recycles the process every ~15 min of idle). The store layer
 * (store/generations.js) falls back to in-memory when the DB is unavailable,
 * mirroring the quota / collections persistence story.
 *
 * Field naming matches the in-memory record shape that the frontend already
 * consumes (jobId, audioUrl, style_tags, owner, …) so no client changes are
 * needed.
 */
const GenerationSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    owner: { type: String, required: true, index: true },
    prompt: { type: String, default: '' },
    style_tags: { type: [String], default: [] },
    duration: { type: Number, default: 0 },
    instrumental: { type: Boolean, default: false },
    model: { type: String, default: 'v3' },
    // 'generating' | 'streaming' | 'ready' | 'error'
    status: { type: String, default: 'generating', index: true },
    audioUrl: { type: String, default: '' },
    // Live stream URL for v3 generations, populated once Treblo confirms the
    // stream is serving audio (status 'streaming'). Superseded by audioUrl once
    // the final file is ready (status 'ready'). Stored so a reloaded history
    // page can resume early playback for an in-flight job.
    streamUrl: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Generation = mongoose.model('Generation', GenerationSchema);
