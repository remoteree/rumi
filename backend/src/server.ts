import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDatabase } from './config/database';
import booksRouter from './routes/books';
import promptsRouter from './routes/prompts';
import jobsRouter from './routes/jobs';
import adminRouter from './routes/admin';
import writingStylesRouter from './routes/writingStyles';
import authRouter from './routes/auth';
import publishersRouter from './routes/publishers';
import editingRequestsRouter from './routes/editingRequests';
import reviewersRouter from './routes/reviewers';
import subscriptionsRouter from './routes/subscriptions';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env files: root takes precedence, backend is fallback
const rootEnvPath = path.resolve(__dirname, '../../.env');
const backendEnvPath = path.resolve(__dirname, '../.env');

// Debug: Log the paths being used
console.log('🔍 Looking for .env files:');
console.log(`   Root: ${rootEnvPath}`);
console.log(`   Backend: ${backendEnvPath}`);

// Load backend .env first (if it exists)
const backendResult = dotenv.config({ path: backendEnvPath });
if (!backendResult.error) {
  console.log('✅ Loaded backend/.env');
} else {
  console.log('ℹ️  No backend/.env found (this is okay)');
}

// Then load root .env, which will override backend values
const rootResult = dotenv.config({ path: rootEnvPath, override: true });
if (!rootResult.error) {
  console.log('✅ Loaded root .env');
  // Debug: Show what keys were loaded (without values for security)
  if (rootResult.parsed) {
    const keys = Object.keys(rootResult.parsed);
    console.log(`   Loaded ${keys.length} variables: ${keys.join(', ')}`);
    // Check for common MongoDB URI variable names
    const mongoKeys = keys.filter(k => k.toLowerCase().includes('mongo'));
    if (mongoKeys.length > 0) {
      console.log(`   MongoDB-related keys found: ${mongoKeys.join(', ')}`);
    }
  }
} else {
  console.warn(`⚠️  Could not load root .env: ${rootResult.error.message}`);
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve uploaded images statically
const UPLOADS_DIR = path.resolve(__dirname, 'uploads/images');
app.use('/api/images', express.static(UPLOADS_DIR, {
  setHeaders: (res, filePath) => {
    // Set appropriate content type for images
    if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    } else if (filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    }
  }
}));

// Serve uploaded audio files statically
const AUDIO_DIR = path.resolve(__dirname, 'uploads/audio');
app.use('/api/audio', express.static(AUDIO_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp3')) {
      res.setHeader('Content-Type', 'audio/mpeg');
    }
  }
}));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/publishers', publishersRouter);
app.use('/api/editing-requests', editingRequestsRouter);
app.use('/api/reviewers', reviewersRouter);
app.use('/api/books', booksRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/writing-styles', writingStylesRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
});

async function startServer() {
  try {
    // Check for MONGODB_URI with case-insensitive search
    const mongoUri = process.env.MONGODB_URI 
      || process.env.MONGODB_URL
      || process.env.mongodb_uri
      || process.env.mongodb_url
      || 'mongodb://localhost:27017/ai-kindle';
    
    if (!process.env.MONGODB_URI && !process.env.MONGODB_URL) {
      console.warn('⚠️  MONGODB_URI not found in environment variables, using default');
      console.warn('   Make sure your .env file contains: MONGODB_URI=your_connection_string');
      console.warn('   (No spaces around the = sign, no quotes needed)');
    } else {
      const foundKey = process.env.MONGODB_URI ? 'MONGODB_URI' : 'MONGODB_URL';
      console.log(`✅ ${foundKey} loaded from environment`);
    }
    await connectDatabase(mongoUri);
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

