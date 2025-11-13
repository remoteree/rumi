import cron from 'node-cron';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDatabase } from './config/database';
import { GenerationJobModel } from './models/GenerationJob';
import { AudiobookJobModel } from './models/AudiobookJob';
import { processGenerationJob } from './services/generationService';
import { processAudiobookJob } from './services/audiobookService';

// Get the directory name in ESM (needed for path resolution)
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
    // Check for OpenAI API key
    if (keys.some(k => k.includes('OPENAI'))) {
      console.log('✅ OPENAI_API_KEY found in environment');
    } else {
      console.warn('⚠️  OPENAI_API_KEY not found in loaded environment variables');
    }
  }
} else {
  console.warn(`⚠️  Could not load root .env: ${rootResult.error.message}`);
}

// Verify OpenAI API key is loaded
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is missing after loading .env files!');
  console.error(`   Checked path: ${rootEnvPath}`);
  process.exit(1);
}

// Process generation jobs every minute
cron.schedule('* * * * *', async () => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] 🔍 Worker checking for pending generation jobs...`);
    
    // Atomically claim a job using findOneAndUpdate with processingLock
    // This acts as a distributed lock to prevent concurrent processing
    const now = new Date();
    const lockTimeout = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes timeout (stale lock)
    
    const job = await GenerationJobModel.findOneAndUpdate(
      {
        status: { $in: ['pending', 'generating_outline', 'generating_chapters', 'paused'] },
        // Only claim jobs that either:
        // 1. Don't have a lock (processingLock is null/undefined)
        // 2. Have a stale lock (older than 5 minutes - worker probably crashed)
        $or: [
          { processingLock: { $exists: false } },
          { processingLock: null },
          { processingLock: { $lt: lockTimeout } }
        ]
      },
      {
        // Set processing lock to current time (atomically claims the job)
        $set: {
          processingLock: now,
          startedAt: now // Update startedAt when we claim it
        }
      },
      {
        sort: { createdAt: 1 }, // Process oldest first
        new: true // Return the updated document
      }
    );

    if (!job) {
      console.log(`[${timestamp}] ✅ No pending generation jobs found (or all jobs are locked)`);
      return;
    }

    console.log(`[${timestamp}] 🔄 Found generation job ${job._id} for book ${job.bookId}`);
    console.log(`[${timestamp}] 📊 Job status: ${job.status}`);

    try {
      await processGenerationJob(job._id!.toString());
      const endTime = new Date().toISOString();
      console.log(`[${endTime}] ✅ Generation job ${job._id} completed successfully`);
    } catch (error: any) {
      const endTime = new Date().toISOString();
      console.error(`[${endTime}] ❌ Generation job ${job._id} failed:`, error.message);
      // Job status is updated in processGenerationJob on error
    }
  } catch (error: any) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ Worker error:`, error.message);
    console.error(error.stack);
  }
});

// Process audiobook jobs every minute (separate cron job)
cron.schedule('* * * * *', async () => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] 🎙️  Worker checking for pending audiobook jobs...`);
    
    const now = new Date();
    const lockTimeout = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes timeout (stale lock)
    
    const audiobookJob = await AudiobookJobModel.findOneAndUpdate(
      {
        status: { $in: ['pending', 'generating', 'failed'] }, // Allow retrying failed jobs
        $or: [
          { processingLock: { $exists: false } },
          { processingLock: null },
          { processingLock: { $lt: lockTimeout } }
        ]
      },
      {
        $set: {
          processingLock: now,
          startedAt: now
        }
      },
      {
        sort: { createdAt: 1 },
        new: true
      }
    );

    if (!audiobookJob) {
      console.log(`[${timestamp}] ✅ No pending audiobook jobs found (or all jobs are locked)`);
      return;
    }

    console.log(`[${timestamp}] 🎙️  Found audiobook job ${audiobookJob._id} for book ${audiobookJob.bookId}`);
    console.log(`[${timestamp}] 📊 Job status: ${audiobookJob.status}`);
    console.log(`[${timestamp}] 🎤 Voice: ${audiobookJob.voice}, Model: ${audiobookJob.model}`);

    try {
      await processAudiobookJob(audiobookJob._id!.toString());
      const endTime = new Date().toISOString();
      console.log(`[${endTime}] ✅ Audiobook job ${audiobookJob._id} completed successfully`);
    } catch (error: any) {
      const endTime = new Date().toISOString();
      console.error(`[${endTime}] ❌ Audiobook job ${audiobookJob._id} failed:`, error.message);
      // Job status is updated in processAudiobookJob on error
    }
  } catch (error: any) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ Audiobook worker error:`, error.message);
    console.error(error.stack);
  }
});

async function startWorker() {
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
    
    console.log('👷 Worker started. Processing jobs every minute...');
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

startWorker();

