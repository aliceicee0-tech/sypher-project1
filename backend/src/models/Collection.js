import mongoose from 'mongoose';

/**
 * A track saved into a collection. It's a snapshot of a finished generation:
 * the prompt that produced it, its tags and the resulting audio URL.
 */
const TrackSchema = new mongoose.Schema(
  {
    track_id: { type: String, required: true },
    title: { type: String, default: '' },
    prompt: { type: String, default: '' },
    style_tags: { type: [String], default: [] },
    duration: { type: Number, default: 30 },
    audio_url: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * A Collection = a user-named album / playlist that groups saved tracks.
 * Replaces the old node-based "Project": same persistence story (MongoDB with
 * an in-memory fallback), but the data model is a flat list of tracks instead
 * of a graph of nodes/edges.
 */
const CollectionSchema = new mongoose.Schema(
  {
    collection_id: { type: String, required: true, unique: true, index: true },
    owner_id: { type: String, default: 'anonymous' },
    title: { type: String, default: 'Untitled collection' },
    tracks: { type: [TrackSchema], default: [] },
  },
  { timestamps: true }
);

export const Collection = mongoose.model('Collection', CollectionSchema);
