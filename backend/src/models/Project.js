import mongoose from 'mongoose';

const NodeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['treblo_generator', 'combiner', 'master'],
      required: true,
    },
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
    data: {
      prompt: { type: String, default: '' },
      style_tags: { type: [String], default: [] },
      duration: { type: Number, default: 30 },
      status: { type: String, default: 'idle' }, // idle | generating | ready | error
      audio_url: { type: String, default: '' },
      volume: { type: Number, default: 1.0 },
      bpm: { type: Number, default: 120 },
    },
  },
  { _id: false }
);

const EdgeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    type: { type: String, default: 'default' },
  },
  { _id: false }
);

const ProjectSchema = new mongoose.Schema(
  {
    project_id: { type: String, required: true, unique: true, index: true },
    owner_id: { type: String, default: 'anonymous' },
    title: { type: String, default: 'Untitled' },
    settings: {
      bpm: { type: Number, default: 120 },
      global_volume: { type: Number, default: 1.0 },
    },
    nodes: { type: [NodeSchema], default: [] },
    edges: { type: [EdgeSchema], default: [] },
  },
  { timestamps: true }
);

export const Project = mongoose.model('Project', ProjectSchema);
