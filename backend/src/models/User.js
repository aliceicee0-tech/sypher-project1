import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    google_id: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    name: { type: String, default: '' },
    avatar_url: { type: String, default: '' },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', UserSchema);
