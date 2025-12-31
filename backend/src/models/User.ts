import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export enum UserRole {
  WRITER = 'writer',
  PUBLISHER = 'publisher',
  REVIEWER = 'reviewer',
  ADMIN = 'admin'
}

export interface UserDocument extends Document {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  publisherId?: mongoose.Types.ObjectId; // For reviewers, reference to their publisher
  subscriptionTier?: 'starter' | 'pro' | 'one_off' | null;
  subscriptionStatus?: 'active' | 'cancelled' | 'expired';
  subscriptionExpiresAt?: Date;
  bookCredits?: number; // Remaining credits for book generation
  oneOffBookId?: mongoose.Types.ObjectId; // For one-off purchases
  createdAt?: Date;
  updatedAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<UserDocument>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { 
    type: String, 
    enum: Object.values(UserRole), 
    required: true 
  },
  publisherId: { type: Schema.Types.ObjectId, ref: 'Publisher' }, // For reviewers
  subscriptionTier: { 
    type: String, 
    enum: ['starter', 'pro', 'one_off', null],
    default: null 
  },
  subscriptionStatus: { 
    type: String, 
    enum: ['active', 'cancelled', 'expired'],
    default: null 
  },
  subscriptionExpiresAt: { type: Date },
  bookCredits: { type: Number, default: 0 },
  oneOffBookId: { type: Schema.Types.ObjectId, ref: 'Book' }, // For one-off purchases
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const UserModel = mongoose.model<UserDocument>('User', UserSchema);



