import mongoose, { Schema, Document } from 'mongoose';

export interface PublisherDocument extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  editorialFocus?: string; // e.g., "Fiction", "Non-fiction", "Academic", etc.
  language?: string; // e.g., "English", "Spanish", "French", etc.
  geographicPresence?: string; // e.g., "North America", "Europe", "Global", etc.
  rates: {
    editingRate?: number; // per word or per hour
    editingRateType?: 'per_word' | 'per_hour';
    proofreadingRate?: number;
    proofreadingRateType?: 'per_word' | 'per_hour';
  };
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const PublisherSchema = new Schema<PublisherDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  editorialFocus: { type: String },
  language: { type: String },
  geographicPresence: { type: String },
  rates: {
    editingRate: { type: Number },
    editingRateType: { type: String, enum: ['per_word', 'per_hour'], default: 'per_word' },
    proofreadingRate: { type: Number },
    proofreadingRateType: { type: String, enum: ['per_word', 'per_hour'], default: 'per_word' }
  },
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

PublisherSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const PublisherModel = mongoose.model<PublisherDocument>('Publisher', PublisherSchema);

