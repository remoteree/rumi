import mongoose, { Schema, Document } from 'mongoose';
import { BookOutline as IBookOutline } from '@ai-kindle/shared';

export interface BookOutlineDocument extends Omit<IBookOutline, '_id'>, Document {}

const ChapterOutlineNodeSchema = new Schema({
  chapterNumber: { type: Number, required: true },
  title: { type: String, required: true },
  summary: { type: String, required: true },
  visualMotifs: [{ type: String }],
  emotionalTone: { type: String, required: true },
  wordCountTarget: { type: Number },
  sectionHeadings: [{ type: String }]
}, { _id: false });

const StyleGuideSchema = new Schema({
  tone: { type: String, required: true },
  voice: { type: String, required: true },
  lexicalPreferences: [{ type: String }],
  lexicalBans: [{ type: String }],
  preferredMetaphors: [{ type: String }]
}, { _id: false });

const ArtDirectionSchema = new Schema({
  style: { type: String, required: true },
  palette: [{ type: String }],
  lighting: { type: String, required: true },
  medium: { type: String, required: true },
  compositionTemplate: { type: String },
  recurringSymbols: [{ type: String }]
}, { _id: false });

const BookOutlineSchema = new Schema<BookOutlineDocument>({
  bookId: { type: Schema.Types.ObjectId as any, ref: 'Book', required: true },
  structure: {
    totalChapters: { type: Number, required: true },
    chapters: [ChapterOutlineNodeSchema]
  },
  styleGuide: { type: StyleGuideSchema, required: true },
  artDirection: { type: ArtDirectionSchema, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const BookOutlineModel = mongoose.model<BookOutlineDocument>('BookOutline', BookOutlineSchema);









