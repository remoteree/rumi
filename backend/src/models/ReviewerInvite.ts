import mongoose, { Schema, Document } from 'mongoose';

export interface ReviewerInviteDocument extends Document {
  publisherId: mongoose.Types.ObjectId;
  token: string; // Unique token for the invite link
  email?: string; // Optional: specific email this invite is for
  used: boolean;
  usedBy?: mongoose.Types.ObjectId; // User who used this invite
  expiresAt?: Date;
  createdAt?: Date;
}

const ReviewerInviteSchema = new Schema<ReviewerInviteDocument>({
  publisherId: { type: Schema.Types.ObjectId, ref: 'Publisher', required: true },
  token: { type: String, required: true, unique: true },
  email: { type: String },
  used: { type: Boolean, default: false },
  usedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  expiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// Create index on token for faster lookups
ReviewerInviteSchema.index({ token: 1 });
ReviewerInviteSchema.index({ publisherId: 1, used: 1 });

export const ReviewerInviteModel = mongoose.model<ReviewerInviteDocument>('ReviewerInvite', ReviewerInviteSchema);

