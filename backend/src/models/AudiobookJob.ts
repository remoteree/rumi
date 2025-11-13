import mongoose, { Schema, Document } from 'mongoose';

export interface AudiobookJobDocument extends Document {
  bookId: mongoose.Types.ObjectId;
  voice: string; // OpenAI voice: alloy, echo, fable, onyx, nova, shimmer
  model: 'tts-1' | 'tts-1-hd'; // TTS model
  status: 'pending' | 'generating' | 'complete' | 'failed' | 'cancelled';
  currentChapter?: number;
  totalChapters?: number;
  progress: {
    [chapterNumber: number]: boolean; // true if chapter audio is complete
  };
  estimatedCost?: number; // in USD
  actualCost?: number; // in USD
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  processingLock?: Date; // Timestamp when job was claimed by a worker
  createdAt?: Date;
  updatedAt?: Date;
}

const AudiobookJobSchema = new Schema<AudiobookJobDocument>({
  bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
  voice: { 
    type: String, 
    enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
    required: true 
  },
  model: { 
    type: String, 
    enum: ['tts-1', 'tts-1-hd'],
    default: 'tts-1' 
  },
  status: {
    type: String,
    enum: ['pending', 'generating', 'complete', 'failed', 'cancelled'],
    default: 'pending'
  },
  currentChapter: { type: Number },
  totalChapters: { type: Number },
  progress: { 
    type: Map, 
    of: Boolean, 
    default: () => new Map()
  },
  estimatedCost: { type: Number },
  actualCost: { type: Number },
  error: { type: String },
  startedAt: { type: Date },
  completedAt: { type: Date },
  processingLock: { type: Date }
}, {
  timestamps: true
});

AudiobookJobSchema.index({ bookId: 1 });
AudiobookJobSchema.index({ status: 1, processingLock: 1 });

export const AudiobookJobModel = mongoose.model<AudiobookJobDocument>('AudiobookJob', AudiobookJobSchema);

