import express from 'express';
import { BookModel } from '../models/Book';
import { GenerationJobModel } from '../models/GenerationJob';
import { BookOutlineModel } from '../models/BookOutline';
import { ChapterContentModel } from '../models/ChapterContent';
import { TokenUsageModel } from '../models/TokenUsage';
import { generatePromptsForCombo } from '../services/promptGenerator';
import { BookType, Niche } from '@ai-kindle/shared';

const router = express.Router();

// Create a new book
router.post('/', async (req, res) => {
  try {
    const { title, bookType, niche, writingStyle, context } = req.body;

    const book = new BookModel({
      title,
      bookType,
      niche,
      writingStyle,
      context,
      status: 'draft'
    });

    await book.save();

    // Create generation job
    const job = new GenerationJobModel({
      bookId: book._id,
      status: 'pending'
    });
    await job.save();

    await BookModel.updateOne({ _id: book._id }, { jobId: job._id });

    res.json({ success: true, data: { book, jobId: job._id } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get all books
router.get('/', async (req, res) => {
  try {
    const books = await BookModel.find().sort({ createdAt: -1 });
    res.json({ success: true, data: books });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get book by ID
router.get('/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    
    // Validate ObjectId format (MongoDB ObjectIds are 24 hex characters)
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    const book = await BookModel.findById(bookId)
      .populate('outlineId')
      .populate('jobId')
      .lean(); // Convert to plain object to avoid serialization issues
    
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }
    
    res.json({ success: true, data: book });
  } catch (error: any) {
    console.error('Error fetching book:', error);
    console.error('Book ID attempted:', req.params.id);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update book
router.put('/:id', async (req, res) => {
  try {
    const book = await BookModel.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }
    res.json({ success: true, data: book });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Start generation (create prompts if needed, then queue job)
router.post('/:id/start-generation', async (req, res) => {
  try {
    const book = await BookModel.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    // Check if prompts exist, if not create them
    const { PromptVersionModel } = await import('../models/PromptVersion');
    const existingPrompts = await PromptVersionModel.findOne({
      bookType: book.bookType,
      niche: book.niche,
      writingStyle: (book as any).writingStyle || null
    });

    if (!existingPrompts) {
      await generatePromptsForCombo(book.bookType as BookType, book.niche as Niche, (book as any).writingStyle);
    }

    // Update book status
    await BookModel.updateOne({ _id: book._id }, { status: 'generating' });

    // Update job status to pending (worker will pick it up)
    const job = await GenerationJobModel.findOne({ bookId: book._id });
    if (job) {
      await GenerationJobModel.updateOne(
        { _id: job._id },
        { status: 'pending', startedAt: new Date() }
      );
    }

    res.json({ success: true, message: 'Generation started' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check if book is ready for publishing
router.get('/:id/publish-status', async (req, res) => {
  try {
    const bookId = req.params.id;
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    const { isBookReadyForPublishing } = await import('../services/publishService');
    const { ready, issues } = await isBookReadyForPublishing(bookId);

    res.json({
      success: true,
      data: {
        ready,
        issues
      }
    });
  } catch (error: any) {
    console.error('Error checking publish status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Publish book (generate EPUB)
router.post('/:id/publish', async (req, res) => {
  try {
    const bookId = req.params.id;
    const forcePublish = req.body.force === true; // Allow force publishing
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    const book = await BookModel.findById(bookId);
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    // Check if book is ready
    const { isBookReadyForPublishing, generateEPUB } = await import('../services/publishService');
    const { ready, issues } = await isBookReadyForPublishing(bookId);

    if (!ready && !forcePublish) {
      return res.status(400).json({
        success: false,
        error: 'Book is not ready for publishing',
        issues
      });
    }

    if (!ready && forcePublish) {
      console.log(`⚠️ [PUBLISH] Force publishing despite ${issues.length} issues:`, issues);
    }

    // Generate EPUB
    console.log(`📚 [PUBLISH] Generating EPUB for book ${bookId}...`);
    const epubFilePath = await generateEPUB(bookId);
    console.log(`✅ [PUBLISH] EPUB generated at: ${epubFilePath}`);

    // Verify file exists
    const fsLib = await import('fs/promises');
    try {
      const stats = await fsLib.stat(epubFilePath);
      console.log(`📊 [PUBLISH] EPUB file size: ${stats.size} bytes`);
    } catch (error: any) {
      console.error(`❌ [PUBLISH] EPUB file not found at ${epubFilePath}:`, error.message);
      return res.status(500).json({
        success: false,
        error: 'EPUB file was not created successfully'
      });
    }

    // Update book status
    const artifactUrl = `/api/books/${bookId}/download`;
    await BookModel.findByIdAndUpdate(bookId, {
      status: 'published',
      publishedAt: new Date(),
      publishArtifactUrl: artifactUrl
    });

    res.json({
      success: true,
      message: 'Book published successfully',
      data: {
        epubFilePath,
        downloadUrl: artifactUrl,
        publishedAt: new Date()
      }
    });
  } catch (error: any) {
    console.error('Error publishing book:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export book as DOCX
router.get('/:id/export-docx', async (req, res) => {
  try {
    const bookId = req.params.id;
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    const book = await BookModel.findById(bookId);
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    // Generate DOCX
    console.log(`📄 [DOCX] Generating DOCX for book ${bookId}...`);
    const { generateDOCX } = await import('../services/docService');
    const docxFilePath = await generateDOCX(bookId);
    console.log(`✅ [DOCX] DOCX generated at: ${docxFilePath}`);

    // Verify file exists
    const fsLib = await import('fs/promises');
    try {
      const stats = await fsLib.stat(docxFilePath);
      console.log(`📊 [DOCX] DOCX file size: ${stats.size} bytes`);
    } catch (error: any) {
      console.error(`❌ [DOCX] DOCX file not found at ${docxFilePath}:`, error.message);
      return res.status(500).json({
        success: false,
        error: 'DOCX file was not created successfully'
      });
    }

    // Send file for download
    const pathLib = await import('path');
    const fileName = `${(book as any).title.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    const fsSync = await import('fs');
    const fileStream = fsSync.createReadStream(docxFilePath);
    fileStream.pipe(res);

    fileStream.on('end', async () => {
      // Optionally clean up the file after sending (or keep it for later downloads)
      // await fsLib.unlink(docxFilePath);
    });

    fileStream.on('error', (error: any) => {
      console.error('Error streaming DOCX file:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error streaming file' });
      }
    });
  } catch (error: any) {
    console.error('Error exporting book as DOCX:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download published book
router.get('/:id/download', async (req, res) => {
  try {
    const bookId = req.params.id;
    
    const book = await BookModel.findById(bookId).lean();
    if (!book || !(book as any).publishArtifactUrl) {
      return res.status(404).json({ success: false, error: 'Published book not found' });
    }

    // Extract file path from URL or use stored path
    const pathLib = await import('path');
    const { fileURLToPath } = await import('url');
    const fsLib = await import('fs/promises');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = pathLib.dirname(__filename);
    // Resolve to backend/published (works in both dev and production)
    // Match the path used in publishService.ts: ../../published from backend/src/routes
    const PUBLISH_DIR = pathLib.resolve(__dirname, '../../published');
    
    // Ensure directory exists
    try {
      await fsLib.mkdir(PUBLISH_DIR, { recursive: true });
    } catch (error: any) {
      console.warn(`Could not create publish directory: ${error.message}`);
    }
    
    // Find the most recent EPUB file for this book
    // Since filename doesn't include bookId, we need to match by book title
    // The filename format is: ${book.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.epub
    try {
      const files = await fsLib.readdir(PUBLISH_DIR);
      const bookTitle = (book as any).title;
      const sanitizedTitle = bookTitle.replace(/[^a-zA-Z0-9]/g, '_');
      
      // Filter EPUB files that start with the sanitized book title
      const bookFiles = files
        .filter((f: string) => {
          if (!f.endsWith('.epub')) return false;
          // Match files that start with the sanitized title
          return f.startsWith(sanitizedTitle);
        })
        .map((f: string) => {
          // Extract timestamp from filename to sort properly
          const match = f.match(/_(\d+)\.epub$/);
          return {
            filename: f,
            timestamp: match ? parseInt(match[1]) : 0
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp descending (newest first)
      
      if (bookFiles.length === 0) {
        console.error(`No EPUB files found for book ${bookId} (title: "${bookTitle}") in ${PUBLISH_DIR}`);
        console.error(`Available files: ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}`);
        return res.status(404).json({ 
          success: false, 
          error: 'Published file not found. The book may not have been published yet, or the EPUB file was not generated successfully.' 
        });
      }

      const filePath = pathLib.join(PUBLISH_DIR, bookFiles[0].filename);
      
      // Verify file exists
      try {
        await fsLib.access(filePath);
      } catch (error: any) {
        console.error(`EPUB file does not exist at ${filePath}`);
        return res.status(404).json({ 
          success: false, 
          error: 'Published file not found on disk' 
        });
      }

      const fileName = `${(book as any).title.replace(/[^a-zA-Z0-9]/g, '_')}.epub`;

      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('Error downloading file:', err);
          res.status(500).json({ success: false, error: 'Failed to download file' });
        }
      });
    } catch (error: any) {
      console.error('Error reading publish directory:', error);
      console.error(`Looking in: ${PUBLISH_DIR}`);
      res.status(500).json({ 
        success: false, 
        error: `Failed to access publish directory: ${error.message}` 
      });
    }
  } catch (error: any) {
    console.error('Error downloading book:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate cover image prompt manually
router.post('/:id/generate-cover-prompt', async (req, res) => {
  try {
    const bookId = req.params.id;
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    const book = await BookModel.findById(bookId);
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    // Get outline if available
    let outline = null;
    if (book.outlineId) {
      outline = await BookOutlineModel.findById(book.outlineId);
    } else {
      // Try to find by bookId
      outline = await BookOutlineModel.findOne({ bookId });
    }

    // Get style guide and art direction from outline
    const styleGuide = outline?.styleGuide || {};
    const artDirection = outline?.artDirection || {};

    const { generateCoverImagePrompt } = await import('../services/generationService');
    const coverPrompt = await generateCoverImagePrompt(
      bookId,
      book.bookType as BookType,
      book.niche as Niche,
      book.context,
      styleGuide,
      artDirection,
      outline,
      (book as any).writingStyle
    );

    if (!coverPrompt) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate cover image prompt'
      });
    }

    res.json({
      success: true,
      data: {
        coverImagePrompt: coverPrompt
      }
    });
  } catch (error: any) {
    console.error('Error generating cover prompt:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a book and all related data
router.delete('/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    
    // Validate ObjectId format
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    const book = await BookModel.findById(bookId);
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    // Delete all related data
    // 1. Delete chapters
    await ChapterContentModel.deleteMany({ bookId });
    
    // 2. Delete outline if it exists
    if (book.outlineId) {
      await BookOutlineModel.findByIdAndDelete(book.outlineId);
    }
    
    // 3. Delete job and clear processing lock if exists
    const job = await GenerationJobModel.findOne({ bookId });
    if (job) {
      await GenerationJobModel.findByIdAndDelete(job._id);
    }
    
    // 4. Delete token usage records
    await TokenUsageModel.deleteMany({ bookId });

    // 5. Delete uploaded images for this book
    try {
      const fs = await import('fs/promises');
      const pathLib = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = pathLib.dirname(__filename);
      const bookImagesDir = pathLib.resolve(__dirname, '../uploads/images/books', bookId);
      
      try {
        await fs.rm(bookImagesDir, { recursive: true, force: true });
        console.log(`✅ Deleted images directory for book ${bookId}`);
      } catch (error: any) {
        // Directory might not exist, which is fine
        if (error.code !== 'ENOENT') {
          console.warn(`⚠️  Failed to delete images directory: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.warn(`⚠️  Error deleting images: ${error.message}`);
      // Continue with book deletion even if image deletion fails
    }

    // 6. Finally, delete the book itself
    await BookModel.findByIdAndDelete(bookId);

    res.json({ success: true, message: 'Book and all related data deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting book:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Estimate audiobook cost
router.get('/:id/audiobook/estimate', async (req, res) => {
  try {
    const bookId = req.params.id;
    const voice = req.query.voice as string || 'alloy';
    const model = (req.query.model as 'tts-1' | 'tts-1-hd') || 'tts-1';
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (!validVoices.includes(voice)) {
      return res.status(400).json({ success: false, error: 'Invalid voice. Must be one of: ' + validVoices.join(', ') });
    }

    const { estimateAudiobookCost } = await import('../services/audiobookService');
    const estimate = await estimateAudiobookCost(bookId, voice, model);

    res.json({
      success: true,
      data: estimate
    });
  } catch (error: any) {
    console.error('Error estimating audiobook cost:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate audiobook (queue job)
router.post('/:id/audiobook/generate', async (req, res) => {
  try {
    const bookId = req.params.id;
    const { voice, model, forceRegenerate } = req.body;
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    if (!voice) {
      return res.status(400).json({ success: false, error: 'Voice is required' });
    }

    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (!validVoices.includes(voice)) {
      return res.status(400).json({ success: false, error: 'Invalid voice. Must be one of: ' + validVoices.join(', ') });
    }

    const ttsModel = (model === 'tts-1-hd' ? 'tts-1-hd' : 'tts-1') as 'tts-1' | 'tts-1-hd';

    const book = await BookModel.findById(bookId);
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    // Check if book is complete
    if (book.status !== 'complete') {
      return res.status(400).json({ 
        success: false, 
        error: 'Book must be complete before generating audiobook' 
      });
    }

    // Check if audiobook job already exists (unless force regenerating)
    const { AudiobookJobModel } = await import('../models/AudiobookJob');
    if (!forceRegenerate) {
      const existingJob = await AudiobookJobModel.findOne({ 
        bookId, 
        status: { $in: ['pending', 'generating'] } 
      });

      if (existingJob) {
        return res.status(400).json({ 
          success: false, 
          error: 'Audiobook generation is already in progress for this book' 
        });
      }
    }

    // Estimate cost
    const { estimateAudiobookCost } = await import('../services/audiobookService');
    const estimate = await estimateAudiobookCost(bookId, voice, ttsModel);

    // Create audiobook job
    const audiobookJob = new AudiobookJobModel({
      bookId,
      voice,
      model: ttsModel,
      status: 'pending',
      estimatedCost: estimate.estimatedCost,
      totalChapters: estimate.chapterBreakdown.length
    });

    await audiobookJob.save();

    res.json({
      success: true,
      message: 'Audiobook generation queued',
      data: {
        jobId: audiobookJob._id,
        estimatedCost: estimate.estimatedCost,
        totalChapters: estimate.chapterBreakdown.length
      }
    });
  } catch (error: any) {
    console.error('Error queueing audiobook generation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate audio for a single chapter
router.post('/:id/audiobook/chapter/:chapterNumber/generate', async (req, res) => {
  try {
    const bookId = req.params.id;
    const chapterNumber = parseInt(req.params.chapterNumber);
    const { voice, model, forceRegenerate } = req.body;
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    if (isNaN(chapterNumber) || chapterNumber < 1) {
      return res.status(400).json({ success: false, error: 'Invalid chapter number' });
    }

    if (!voice) {
      return res.status(400).json({ success: false, error: 'Voice is required' });
    }

    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (!validVoices.includes(voice)) {
      return res.status(400).json({ success: false, error: 'Invalid voice. Must be one of: ' + validVoices.join(', ') });
    }

    const ttsModel = (model === 'tts-1-hd' ? 'tts-1-hd' : 'tts-1') as 'tts-1' | 'tts-1-hd';

    const book = await BookModel.findById(bookId);
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    // Check if chapter exists
    const { ChapterContentModel } = await import('../models/ChapterContent');
    const chapter = await ChapterContentModel.findOne({ bookId, chapterNumber });
    if (!chapter || !chapter.text) {
      return res.status(404).json({ success: false, error: `Chapter ${chapterNumber} not found or has no text` });
    }

    // Generate audio for the chapter
    const { generateChapterAudio } = await import('../services/audiobookService');
    const skipIfExists = !forceRegenerate;
    
    // Create a temporary job ID for tracking (or use existing job if available)
    const { AudiobookJobModel } = await import('../models/AudiobookJob');
    let job = await AudiobookJobModel.findOne({ bookId }).sort({ createdAt: -1 });
    
    if (!job) {
      // Create a minimal job for tracking
      job = new AudiobookJobModel({
        bookId,
        voice,
        model: ttsModel,
        status: 'generating'
      });
      await job.save();
    }

    try {
      const audioFilePath = await generateChapterAudio(
        bookId,
        chapterNumber,
        voice,
        ttsModel,
        job._id!.toString(),
        skipIfExists
      );

      res.json({
        success: true,
        message: `Chapter ${chapterNumber} audio generated successfully`,
        data: {
          chapterNumber,
          audioFilePath
        }
      });
    } catch (error: any) {
      console.error(`Error generating audio for chapter ${chapterNumber}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  } catch (error: any) {
    console.error('Error generating chapter audio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get audiobook job status
router.get('/:id/audiobook/status', async (req, res) => {
  try {
    const bookId = req.params.id;
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    const { AudiobookJobModel } = await import('../models/AudiobookJob');
    const job = await AudiobookJobModel.findOne({ bookId })
      .sort({ createdAt: -1 }); // Get most recent job

    if (!job) {
      return res.json({
        success: true,
        data: null
      });
    }

    res.json({
      success: true,
      data: {
        jobId: job._id,
        status: job.status,
        voice: job.voice,
        model: job.model,
        currentChapter: job.currentChapter,
        totalChapters: job.totalChapters,
        progress: job.progress ? Object.fromEntries(
          job.progress instanceof Map 
            ? Array.from(job.progress.entries()).map(([k, v]) => [parseInt(k.toString()) || k, v])
            : Object.entries(job.progress).map(([k, v]) => [parseInt(k) || k, v])
        ) : {},
        estimatedCost: job.estimatedCost,
        actualCost: job.actualCost,
        error: job.error,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt
      }
    });
  } catch (error: any) {
    console.error('Error getting audiobook status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Process all audio files with ffmpeg to fix quality issues
router.post('/:id/audiobook/process-audio', async (req, res) => {
  try {
    const bookId = req.params.id;
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    const { processBookAudioFiles } = await import('../services/audiobookService');
    const result = await processBookAudioFiles(bookId);

    res.json({
      success: true,
      message: `Processed ${result.processed.length} audio files${result.failed.length > 0 ? `, ${result.failed.length} failed` : ''}`,
      data: result
    });
  } catch (error: any) {
    console.error('Error processing audio files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cancel audiobook generation
router.post('/:id/audiobook/cancel', async (req, res) => {
  try {
    const bookId = req.params.id;
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    const { AudiobookJobModel } = await import('../models/AudiobookJob');
    const { cancelAudiobookJob } = await import('../services/audiobookService');
    
    const job = await AudiobookJobModel.findOne({ bookId })
      .sort({ createdAt: -1 }); // Get most recent job

    if (!job) {
      return res.status(404).json({ success: false, error: 'Audiobook job not found' });
    }

    await cancelAudiobookJob(job._id!.toString());

    res.json({
      success: true,
      message: 'Audiobook generation cancelled'
    });
  } catch (error: any) {
    console.error('Error cancelling audiobook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download chapter audio
router.get('/:id/audiobook/chapter/:chapterNumber', async (req, res) => {
  try {
    const bookId = req.params.id;
    const chapterNumber = parseInt(req.params.chapterNumber);
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    if (isNaN(chapterNumber)) {
      return res.status(400).json({ success: false, error: 'Invalid chapter number' });
    }

    const pathLib = await import('path');
    const { fileURLToPath } = await import('url');
    const fsLib = await import('fs/promises');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = pathLib.dirname(__filename);
    const audioFilePath = pathLib.resolve(__dirname, '../uploads/audio/books', bookId, `chapter_${chapterNumber}.mp3`);

    try {
      await fsLib.access(audioFilePath);
    } catch {
      return res.status(404).json({ 
        success: false, 
        error: 'Chapter audio not found' 
      });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="chapter_${chapterNumber}.mp3"`);
    
    const fsSync = await import('fs');
    const fileStream = fsSync.createReadStream(audioFilePath);
    fileStream.pipe(res);

    fileStream.on('error', (error: any) => {
      console.error('Error streaming audio file:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error streaming file' });
      }
    });
  } catch (error: any) {
    console.error('Error downloading chapter audio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download prologue audio
router.get('/:id/audiobook/prologue', async (req, res) => {
  try {
    const bookId = req.params.id;
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    const pathLib = await import('path');
    const { fileURLToPath } = await import('url');
    const fsLib = await import('fs/promises');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = pathLib.dirname(__filename);
    const audioFilePath = pathLib.resolve(__dirname, '../uploads/audio/books', bookId, 'prologue.mp3');

    try {
      await fsLib.access(audioFilePath);
    } catch {
      return res.status(404).json({ 
        success: false, 
        error: 'Prologue audio not found' 
      });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="prologue.mp3"');
    
    const fsSync = await import('fs');
    const fileStream = fsSync.createReadStream(audioFilePath);
    fileStream.pipe(res);

    fileStream.on('error', (error: any) => {
      console.error('Error streaming audio file:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error streaming file' });
      }
    });
  } catch (error: any) {
    console.error('Error downloading prologue audio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download epilogue audio
router.get('/:id/audiobook/epilogue', async (req, res) => {
  try {
    const bookId = req.params.id;
    
    if (!bookId || !/^[0-9a-fA-F]{24}$/.test(bookId)) {
      return res.status(400).json({ success: false, error: 'Invalid book ID format' });
    }

    const pathLib = await import('path');
    const { fileURLToPath } = await import('url');
    const fsLib = await import('fs/promises');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = pathLib.dirname(__filename);
    const audioFilePath = pathLib.resolve(__dirname, '../uploads/audio/books', bookId, 'epilogue.mp3');

    try {
      await fsLib.access(audioFilePath);
    } catch {
      return res.status(404).json({ 
        success: false, 
        error: 'Epilogue audio not found' 
      });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="epilogue.mp3"');
    
    const fsSync = await import('fs');
    const fileStream = fsSync.createReadStream(audioFilePath);
    fileStream.pipe(res);

    fileStream.on('error', (error: any) => {
      console.error('Error streaming audio file:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error streaming file' });
      }
    });
  } catch (error: any) {
    console.error('Error downloading epilogue audio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

