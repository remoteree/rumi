import mongoose, { Schema, Document } from 'mongoose';

export interface BookVersionDocument extends Document {
  bookId: mongoose.Types.ObjectId;
  versionNumber: number;
  editedBy: mongoose.Types.ObjectId; // Reviewer or writer who made the edit
  editedByRole: 'writer' | 'reviewer';
  changes: {
    chapterNumber?: number;
    field: string; // 'text', 'title', 'description', etc.
    oldValue?: string;
    newValue: string;
    changeType: 'edit' | 'add' | 'delete';
  }[];
  notes?: string; // Notes from the reviewer
  createdAt?: Date;
}

const BookVersionSchema = new Schema<BookVersionDocument>({
  bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
  versionNumber: { type: Number, required: true },
  editedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  editedByRole: { type: String, enum: ['writer', 'reviewer'], required: true },
  changes: [{
    chapterNumber: { type: Number },
    field: { type: String, required: true },
    oldValue: { type: String },
    newValue: { type: String, required: true },
    changeType: { type: String, enum: ['edit', 'add', 'delete'], required: true }
  }],
  notes: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Index for efficient querying
BookVersionSchema.index({ bookId: 1, versionNumber: -1 });

export const BookVersionModel = mongoose.model<BookVersionDocument>('BookVersion', BookVersionSchema);

