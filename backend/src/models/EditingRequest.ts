import mongoose, { Schema, Document } from 'mongoose';

export enum EditingRequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface EditingRequestDocument extends Document {
  bookId: mongoose.Types.ObjectId;
  writerId: mongoose.Types.ObjectId;
  publisherId: mongoose.Types.ObjectId;
  status: EditingRequestStatus;
  message?: string; // Message from writer
  responseMessage?: string; // Response from publisher
  estimatedCost?: number;
  createdAt?: Date;
  updatedAt?: Date;
  acceptedAt?: Date;
}

const EditingRequestSchema = new Schema<EditingRequestDocument>({
  bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
  writerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  publisherId: { type: Schema.Types.ObjectId, ref: 'Publisher', required: true },
  status: { 
    type: String, 
    enum: Object.values(EditingRequestStatus), 
    default: EditingRequestStatus.PENDING 
  },
  message: { type: String },
  responseMessage: { type: String },
  estimatedCost: { type: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date }
});

EditingRequestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.status === EditingRequestStatus.ACCEPTED && !this.acceptedAt) {
    this.acceptedAt = new Date();
  }
  next();
});

export const EditingRequestModel = mongoose.model<EditingRequestDocument>('EditingRequest', EditingRequestSchema);



