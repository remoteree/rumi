import mongoose, { Schema, Document } from 'mongoose';
import { GenerationJob as IGenerationJob } from '@ai-kindle/shared';

export interface GenerationJobDocument extends Omit<IGenerationJob, '_id'>, Document {
  processingLock?: Date;
}

const ChapterProgressSchema = new Schema({
  text: { type: Boolean, default: false },
  image: { type: Boolean, default: false }
}, { _id: false });

const ProgressSchema = new Schema({
  outline: { type: Boolean, default: false },
  chapters: { type: Map, of: ChapterProgressSchema, default: {} }
}, { _id: false });

const GenerationJobSchema = new Schema<GenerationJobDocument>({
  bookId: { type: Schema.Types.ObjectId as any, ref: 'Book', required: true },
  status: {
    type: String,
    enum: ['pending', 'generating_outline', 'outline_complete', 'generating_chapters', 'complete', 'failed', 'paused'],
    default: 'pending'
  },
  currentChapter: { type: Number },
  totalChapters: { type: Number },
  progress: { type: ProgressSchema, default: {} },
  error: { type: String },
  startedAt: { type: Date },
  completedAt: { type: Date },
  processingLock: { type: Date }, // Timestamp when job was claimed by a worker (acts as distributed lock)
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

export const GenerationJobModel = mongoose.model<GenerationJobDocument>('GenerationJob', GenerationJobSchema);

