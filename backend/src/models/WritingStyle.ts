import mongoose, { Schema, Document } from 'mongoose';

export interface WritingStyleDocument extends Document {
  name: string;
  description: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const WritingStyleSchema = new Schema<WritingStyleDocument>({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

WritingStyleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const WritingStyleModel = mongoose.model<WritingStyleDocument>('WritingStyle', WritingStyleSchema);

