import mongoose, { Schema, Document } from 'mongoose';
import { PromptVersion as IPromptVersion, BookType, Niche, PromptType } from '@ai-kindle/shared';

export interface PromptVersionDocument extends Omit<IPromptVersion, '_id'>, Document {}

const PromptVersionSchema = new Schema<PromptVersionDocument>({
  bookType: { type: String, enum: Object.values(BookType), required: true },
  niche: { type: String, enum: Object.values(Niche), required: true },
  writingStyle: { type: String }, // Optional writing style
  promptType: { type: String, enum: Object.values(PromptType), required: true },
  version: { type: Number, required: true, default: 1 },
  prompt: { type: String, required: true },
  variables: [{ type: String }],
  metadata: {
    tokensUsed: { type: Number },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }
});

// Compound index for quick lookup - includes writingStyle to prevent duplicates
// Note: We normalize undefined/null writingStyle to null in the index
PromptVersionSchema.index({ bookType: 1, niche: 1, writingStyle: 1, promptType: 1, version: 1 }, { unique: true });

PromptVersionSchema.pre('save', function(next) {
  if (this.metadata) {
    this.metadata.updatedAt = new Date();
  }
  next();
});

export const PromptVersionModel = mongoose.model<PromptVersionDocument>('PromptVersion', PromptVersionSchema);






