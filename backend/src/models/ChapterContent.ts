import mongoose, { Schema, Document } from 'mongoose';
import { ChapterContent as IChapterContent } from '@ai-kindle/shared';

export interface ChapterContentDocument extends Omit<IChapterContent, '_id'>, Document {}

const ImageMetadataSchema = new Schema({
  seed: { type: Number },
  model: { type: String },
  cfg: { type: Number },
  negativePrompt: { type: String },
  quality: { type: String },
  // Manual upload metadata
  uploadedAt: { type: Date },
  fileName: { type: String },
  fileSize: { type: Number },
  mimeType: { type: String }
}, { _id: false });

const ChapterMetadataSchema = new Schema({
  wordCount: { type: Number },
  tone: { type: String },
  keywords: [{ type: String }],
  sentiment: { type: Number }
}, { _id: false });

const ChapterContentSchema = new Schema<ChapterContentDocument>({
  bookId: { type: Schema.Types.ObjectId as any, ref: 'Book', required: true },
  chapterNumber: { type: Number, required: true },
  text: { type: String },
  textPrompt: { type: String }, // The actual prompt used to generate the text
  generatedSummary: { type: String }, // Summary generated from the actual chapter content (after text is written)
  imageUrl: { type: String },
  imagePrompt: { type: String },
  imageMetadata: { type: ImageMetadataSchema },
  metadata: { type: ChapterMetadataSchema },
  status: {
    type: String,
    enum: ['pending', 'generating_text', 'text_complete', 'generating_image_prompt', 'image_prompt_ready', 'complete', 'failed'],
    default: 'pending'
  },
  error: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ChapterContentSchema.index({ bookId: 1, chapterNumber: 1 }, { unique: true });
ChapterContentSchema.pre('save', function(next) {
  (this as any).updatedAt = new Date();
  next();
});

export const ChapterContentModel = mongoose.model<ChapterContentDocument>('ChapterContent', ChapterContentSchema);

