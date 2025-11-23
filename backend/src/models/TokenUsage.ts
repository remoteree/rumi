import mongoose, { Schema, Document } from 'mongoose';
import { TokenUsage as ITokenUsage } from '@ai-kindle/shared';

export interface TokenUsageDocument extends Omit<ITokenUsage, '_id'>, Document {}

const TokenUsageSchema = new Schema<TokenUsageDocument>({
  bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
  jobId: { type: Schema.Types.ObjectId, ref: 'GenerationJob' },
  step: { type: String, required: true },
  promptTokens: { type: Number, required: true },
  completionTokens: { type: Number, required: true },
  totalTokens: { type: Number, required: true },
  model: { type: String },
  cost: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

TokenUsageSchema.index({ bookId: 1, createdAt: -1 });
TokenUsageSchema.index({ jobId: 1 });

export const TokenUsageModel = mongoose.model<TokenUsageDocument>('TokenUsage', TokenUsageSchema);









