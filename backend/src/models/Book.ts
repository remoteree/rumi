import mongoose, { Schema, Document } from 'mongoose';
import { Book as IBook, BookType, Niche, BookContext } from '@ai-kindle/shared';

export interface BookDocument extends Omit<IBook, '_id'>, Document {}

const BookContextSchema = new Schema({
  title: { type: String },
  description: { type: String },
  targetAudience: { type: String },
  tone: { type: String },
  additionalNotes: { type: String },
  customStyleGuide: { type: String },
  customArtDirection: { type: String },
  chapterCount: { type: Number },
  chapterSize: { type: String, enum: ['small', 'medium', 'large'] },
  usePerplexity: { type: Boolean, default: false },
  perplexityTopics: { type: String },
  skipImagePrompts: { type: Boolean, default: false }
}, { _id: false });

const BookSchema = new Schema<BookDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User' }, // Writer who created the book
  publisherId: { type: Schema.Types.ObjectId, ref: 'Publisher' }, // Publisher currently editing (if accepted)
  title: { type: String, required: true },
  bookType: { type: String, enum: Object.values(BookType), required: true },
  niche: { type: String, enum: Object.values(Niche), required: true },
  writingStyle: { type: String }, // Can be enum value or custom string
  context: { type: BookContextSchema, required: true },
  outlineId: { type: Schema.Types.ObjectId, ref: 'BookOutline' },
  jobId: { type: Schema.Types.ObjectId, ref: 'GenerationJob' },
  status: { 
    type: String, 
    enum: ['draft', 'generating', 'complete', 'failed', 'published'],
    default: 'draft'
  },
  publishedAt: { type: Date },
  publishArtifactUrl: { type: String }, // URL or path to the generated EPUB/PDF
  coverImageUrl: { type: String },
  coverImagePrompt: { type: String },
  publishWithoutChapterImages: { type: Boolean, default: false }, // If true, skip chapter images when publishing
  prologue: { type: String },
  prologuePrompt: { type: String },
  epilogue: { type: String },
  epiloguePrompt: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

BookSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const BookModel = mongoose.model<BookDocument>('Book', BookSchema);

