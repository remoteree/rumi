import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { ChapterContentModel } from '../models/ChapterContent';
import { GenerationJobModel } from '../models/GenerationJob';
import { BookModel } from '../models/Book';
import { BookOutlineModel } from '../models/BookOutline';
import { TokenUsageModel } from '../models/TokenUsage';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import { UserModel } from '../models/User';
import { PublisherModel } from '../models/Publisher';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireRole(UserRole.ADMIN));

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define uploads directory
const UPLOADS_DIR = path.resolve(__dirname, '../uploads/images');

// Ensure uploads directory exists
async function ensureUploadsDir(bookId: string): Promise<string> {
  const bookDir = path.join(UPLOADS_DIR, 'books', bookId);
  await fs.mkdir(bookDir, { recursive: true });
  return bookDir;
}

// Configure multer for file uploads (store on disk)
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        const { bookId } = req.params;
        const bookDir = await ensureUploadsDir(bookId);
        cb(null, bookDir);
      } catch (error: any) {
        cb(error, '');
      }
    },
    filename: (req, file, cb) => {
      const { chapterNumber } = req.params;
      // Extract extension from original filename or mimetype
      const ext = path.extname(file.originalname) || (file.mimetype.includes('png') ? '.png' : '.jpg');
      const filename = `chapter_${chapterNumber}${ext}`;
      cb(null, filename);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept image files only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Configure multer for cover image uploads
const uploadCover = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        const { bookId } = req.params;
        const bookDir = await ensureUploadsDir(bookId);
        cb(null, bookDir);
      } catch (error: any) {
        cb(error, '');
      }
    },
    filename: (req, file, cb) => {
      // Extract extension from original filename or mimetype
      const ext = path.extname(file.originalname) || (file.mimetype.includes('png') ? '.png' : file.mimetype.includes('webp') ? '.webp' : '.jpg');
      const filename = `cover${ext}`;
      cb(null, filename);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get all chapters for a book with full details
router.get('/books/:bookId/chapters', async (req, res) => {
  try {
    const { bookId } = req.params;

    const chapters = await ChapterContentModel.find({ bookId })
      .sort({ chapterNumber: 1 });

    // Get token usage for all chapters
    const tokenUsage = await TokenUsageModel.find({ bookId })
      .sort({ createdAt: 1 });

    // Group token usage by chapter
    const tokenUsageByChapter: Record<string, any[]> = {};
    tokenUsage.forEach(usage => {
      const chapterMatch = usage.step.match(/chapter_(\d+)_/);
      if (chapterMatch) {
        const chapterNum = chapterMatch[1];
        if (!tokenUsageByChapter[chapterNum]) {
          tokenUsageByChapter[chapterNum] = [];
        }
        tokenUsageByChapter[chapterNum].push(usage);
      }
    });

    const chaptersWithDetails = chapters.map(ch => ({
      chapterNumber: ch.chapterNumber,
      text: ch.text,
      textPrompt: ch.textPrompt, // Include text prompt
      imageUrl: ch.imageUrl,
      imagePrompt: ch.imagePrompt,
      status: ch.status,
      metadata: ch.metadata,
      imageMetadata: ch.imageMetadata,
      error: ch.error,
      createdAt: ch.createdAt,
      updatedAt: ch.updatedAt,
      tokenUsage: tokenUsageByChapter[ch.chapterNumber.toString()] || []
    }));

    res.json({
      success: true,
      data: chaptersWithDetails
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get single chapter with full details
router.get('/books/:bookId/chapters/:chapterNumber', async (req, res) => {
  try {
    const { bookId, chapterNumber } = req.params;
    const chapterNum = parseInt(chapterNumber);

    const chapter = await ChapterContentModel.findOne({ 
      bookId, 
      chapterNumber: chapterNum 
    });

    if (!chapter) {
      return res.status(404).json({ 
        success: false, 
        error: 'Chapter not found' 
      });
    }

    // Get token usage for this chapter
    const tokenUsage = await TokenUsageModel.find({
      bookId,
      step: { $regex: `chapter_${chapterNum}_` }
    }).sort({ createdAt: 1 });

    const totalTokens = tokenUsage.reduce((sum, usage) => sum + usage.totalTokens, 0);

    res.json({
      success: true,
      data: {
        chapterNumber: chapter.chapterNumber,
        text: chapter.text,
        textPrompt: chapter.textPrompt, // Include text prompt
        imageUrl: chapter.imageUrl,
        imagePrompt: chapter.imagePrompt,
        status: chapter.status,
        metadata: chapter.metadata,
        imageMetadata: chapter.imageMetadata,
        error: chapter.error,
        createdAt: chapter.createdAt,
        updatedAt: chapter.updatedAt,
        tokenUsage: tokenUsage,
        totalTokens: totalTokens
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update chapter text
router.put('/books/:bookId/chapters/:chapterNumber/text', async (req, res) => {
  try {
    const { bookId, chapterNumber } = req.params;
    const { text } = req.body;
    const chapterNum = parseInt(chapterNumber);

    if (!text) {
      return res.status(400).json({ 
        success: false, 
        error: 'Text is required' 
      });
    }

    const chapter = await ChapterContentModel.findOne({ 
      bookId, 
      chapterNumber: chapterNum 
    });

    if (!chapter) {
      return res.status(404).json({ 
        success: false, 
        error: 'Chapter not found' 
      });
    }

    // Update text and recalculate metadata
    const wordCount = text.split(/\s+/).length;
    const keywords = extractKeywords(text);

    chapter.text = text;
    if (!chapter.metadata) {
      chapter.metadata = {};
    }
    chapter.metadata.wordCount = wordCount;
    chapter.metadata.keywords = keywords;
    await chapter.save();

    res.json({ 
      success: true, 
      message: 'Chapter text updated',
      data: {
        chapterNumber: chapterNum,
        wordCount,
        keywords
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update text prompt
router.put('/books/:bookId/chapters/:chapterNumber/text-prompt', async (req, res) => {
  try {
    const { bookId, chapterNumber } = req.params;
    const { textPrompt } = req.body;
    const chapterNum = parseInt(chapterNumber);

    if (!textPrompt) {
      return res.status(400).json({ 
        success: false, 
        error: 'Text prompt is required' 
      });
    }

    const chapter = await ChapterContentModel.findOne({ 
      bookId, 
      chapterNumber: chapterNum 
    });

    if (!chapter) {
      return res.status(404).json({ 
        success: false, 
        error: 'Chapter not found' 
      });
    }

    chapter.textPrompt = textPrompt;
    await chapter.save();

    res.json({ 
      success: true, 
      message: 'Text prompt updated',
      data: {
        chapterNumber: chapterNum,
        textPrompt
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update image prompt
router.put('/books/:bookId/chapters/:chapterNumber/image-prompt', async (req, res) => {
  try {
    const { bookId, chapterNumber } = req.params;
    const { imagePrompt } = req.body;
    const chapterNum = parseInt(chapterNumber);

    if (!imagePrompt) {
      return res.status(400).json({ 
        success: false, 
        error: 'Image prompt is required' 
      });
    }

    const chapter = await ChapterContentModel.findOne({ 
      bookId, 
      chapterNumber: chapterNum 
    });

    if (!chapter) {
      return res.status(404).json({ 
        success: false, 
        error: 'Chapter not found' 
      });
    }

    chapter.imagePrompt = imagePrompt;
    if (chapter.status === 'complete' && !chapter.imageUrl) {
      chapter.status = 'image_prompt_ready';
    }
    await chapter.save();

    res.json({ 
      success: true, 
      message: 'Image prompt updated',
      data: {
        chapterNumber: chapterNum,
        imagePrompt
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Upload image for a chapter
router.post('/books/:bookId/chapters/:chapterNumber/image', upload.single('image'), async (req, res) => {
  try {
    const { bookId, chapterNumber } = req.params;
    const chapterNum = parseInt(chapterNumber);

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No image file provided' 
      });
    }

    // Verify chapter exists
    const chapter = await ChapterContentModel.findOne({ 
      bookId, 
      chapterNumber: chapterNum 
    });

    if (!chapter) {
      return res.status(404).json({ 
        success: false, 
        error: 'Chapter not found' 
      });
    }

    // Store relative path that can be served via static route
    // Path format: /api/images/books/{bookId}/chapter_{chapterNumber}.{ext}
    const imageUrl = `/api/images/books/${bookId}/${req.file.filename}`;

    // Update chapter with image (chapter already fetched above)
    chapter.imageUrl = imageUrl;
    chapter.status = 'complete';
    if (!chapter.imageMetadata) {
      chapter.imageMetadata = {};
    }
    chapter.imageMetadata.uploadedAt = new Date();
    chapter.imageMetadata.fileName = req.file.originalname;
    chapter.imageMetadata.fileSize = req.file.size;
    chapter.imageMetadata.mimeType = req.file.mimetype;
    await chapter.save();

    // Update job progress
    const job = await GenerationJobModel.findOne({ bookId });
    if (job) {
      const progress = job.progress || { chapters: {} };
      if (!progress.chapters[chapterNum]) {
        progress.chapters[chapterNum] = { text: true, image: false };
      }
      progress.chapters[chapterNum].image = true;

      await GenerationJobModel.updateOne(
        { _id: job._id },
        { progress }
      );
    }

    res.json({ 
      success: true, 
      message: 'Image uploaded successfully',
      data: {
        chapterNumber: chapterNum,
        imageUrl: imageUrl
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Upload cover image for a book
router.post('/books/:bookId/cover-image', uploadCover.single('image'), async (req, res) => {
  try {
    const { bookId } = req.params;

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No image file provided' 
      });
    }

    const book = await BookModel.findById(bookId);
    if (!book) {
      return res.status(404).json({ 
        success: false, 
        error: 'Book not found' 
      });
    }

    // Store relative path that can be served via static route
    // Path format: /api/images/books/{bookId}/cover.{ext}
    const imageUrl = `/api/images/books/${bookId}/${req.file.filename}`;

    // Update book with cover image
    await BookModel.updateOne(
      { _id: bookId },
      { coverImageUrl: imageUrl }
    );

    res.json({ 
      success: true, 
      message: 'Cover image uploaded successfully',
      data: {
        coverImageUrl: imageUrl
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update cover image prompt
router.put('/books/:bookId/cover-image-prompt', async (req, res) => {
  try {
    const { bookId } = req.params;
    const { coverImagePrompt } = req.body;

    const book = await BookModel.findById(bookId);
    if (!book) {
      return res.status(404).json({ 
        success: false, 
        error: 'Book not found' 
      });
    }

    await BookModel.updateOne(
      { _id: bookId },
      { coverImagePrompt }
    );

    res.json({ 
      success: true, 
      message: 'Cover image prompt updated successfully'
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update publish without chapter images setting
router.put('/books/:bookId/publish-without-chapter-images', async (req, res) => {
  try {
    const { bookId } = req.params;
    const { publishWithoutChapterImages } = req.body;

    const book = await BookModel.findById(bookId);
    if (!book) {
      return res.status(404).json({ 
        success: false, 
        error: 'Book not found' 
      });
    }

    await BookModel.updateOne(
      { _id: bookId },
      { publishWithoutChapterImages: publishWithoutChapterImages === true }
    );

    res.json({ 
      success: true, 
      message: 'Publish without chapter images setting updated successfully',
      data: {
        publishWithoutChapterImages: publishWithoutChapterImages === true
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get chapter with image prompt (for admin to see what prompt to use)
router.get('/books/:bookId/chapters/:chapterNumber/prompt', async (req, res) => {
  try {
    const { bookId, chapterNumber } = req.params;
    const chapterNum = parseInt(chapterNumber);

    const chapter = await ChapterContentModel.findOne({ 
      bookId, 
      chapterNumber: chapterNum 
    });

    if (!chapter) {
      return res.status(404).json({ 
        success: false, 
        error: 'Chapter not found' 
      });
    }

    res.json({
      success: true,
      data: {
        chapterNumber: chapterNum,
        imagePrompt: chapter.imagePrompt,
        status: chapter.status,
        hasImage: !!chapter.imageUrl,
        visualMotifs: chapter.metadata?.keywords || []
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all chapters needing image upload
router.get('/books/:bookId/chapters/pending-images', async (req, res) => {
  try {
    const { bookId } = req.params;

    const chapters = await ChapterContentModel.find({
      bookId,
      status: { $in: ['image_prompt_ready', 'text_complete'] },
      imageUrl: { $exists: false }
    }).sort({ chapterNumber: 1 });

    res.json({
      success: true,
      data: chapters.map(ch => ({
        chapterNumber: ch.chapterNumber,
        imagePrompt: ch.imagePrompt,
        status: ch.status,
        title: ch.metadata?.keywords?.[0] || `Chapter ${ch.chapterNumber}`
      }))
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get book summary with all stats
router.get('/books/:bookId/summary', async (req, res) => {
  try {
    const { bookId } = req.params;

    const book = await BookModel.findById(bookId)
      .populate('outlineId')
      .populate('jobId');

    if (!book) {
      return res.status(404).json({ 
        success: false, 
        error: 'Book not found' 
      });
    }

    const chapters = await ChapterContentModel.find({ bookId })
      .sort({ chapterNumber: 1 });

    const tokenUsage = await TokenUsageModel.find({ bookId });

    const totalTokens = tokenUsage.reduce((sum, usage) => sum + usage.totalTokens, 0);
    const totalCost = tokenUsage.reduce((sum, usage) => sum + (usage.cost || 0), 0);

    res.json({
      success: true,
      data: {
        book: {
          _id: book._id,
          title: book.title,
          bookType: book.bookType,
          niche: book.niche,
          status: book.status,
          createdAt: book.createdAt
        },
        outline: book.outlineId,
        job: book.jobId,
        stats: {
          totalChapters: chapters.length,
          chaptersWithText: chapters.filter(c => c.text).length,
          chaptersWithImage: chapters.filter(c => c.imageUrl).length,
          chaptersComplete: chapters.filter(c => c.status === 'complete').length,
          totalTokens,
          totalCost,
          tokenUsageBreakdown: tokenUsage.reduce((acc, usage) => {
            const stepType = usage.step.split('_')[0];
            if (!acc[stepType]) {
              acc[stepType] = { tokens: 0, cost: 0, count: 0 };
            }
            acc[stepType].tokens += usage.totalTokens;
            acc[stepType].cost += usage.cost || 0;
            acc[stepType].count += 1;
            return acc;
          }, {} as Record<string, any>)
        },
        chapters: chapters.map(ch => ({
          chapterNumber: ch.chapterNumber,
          status: ch.status,
          hasText: !!ch.text,
          hasImage: !!ch.imageUrl,
          wordCount: ch.metadata?.wordCount,
          createdAt: ch.createdAt,
          updatedAt: ch.updatedAt
        }))
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all jobs with details
router.get('/jobs', async (req, res) => {
  try {
    const jobs = await GenerationJobModel.find()
      .populate('bookId')
      .sort({ createdAt: -1 });

    // Get token usage for all jobs
    const jobIds = jobs.map(job => job._id!.toString());
    const allTokenUsage = await TokenUsageModel.find({
      jobId: { $in: jobIds }
    });

    // Group token usage by job
    const tokenUsageByJob: Record<string, any[]> = {};
    allTokenUsage.forEach(usage => {
      const jobId = usage.jobId?.toString();
      if (jobId) {
        if (!tokenUsageByJob[jobId]) {
          tokenUsageByJob[jobId] = [];
        }
        tokenUsageByJob[jobId].push(usage);
      }
    });

    const jobsWithDetails = await Promise.all(
      jobs.map(async (job) => {
        const book = await BookModel.findById(job.bookId);
        const chapters = await ChapterContentModel.find({ bookId: job.bookId })
          .sort({ chapterNumber: 1 });

        const jobTokenUsage = tokenUsageByJob[job._id!.toString()] || [];
        const totalTokens = jobTokenUsage.reduce((sum, usage) => sum + usage.totalTokens, 0);
        const totalCost = jobTokenUsage.reduce((sum, usage) => sum + (usage.cost || 0), 0);

        return {
          _id: job._id?.toString(),
          bookId: job.bookId?.toString() || job.bookId, // Ensure bookId is a string
          bookTitle: book?.title || 'Unknown',
          bookType: book?.bookType,
          niche: book?.niche,
          status: job.status,
          currentChapter: job.currentChapter,
          totalChapters: job.totalChapters,
          progress: job.progress,
          error: job.error,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          createdAt: job.createdAt,
          tokenUsage: {
            total: totalTokens,
            cost: totalCost,
            breakdown: jobTokenUsage.length,
            details: jobTokenUsage
          },
          chapters: {
            total: chapters.length,
            withText: chapters.filter(c => c.text).length,
            withImage: chapters.filter(c => c.imageUrl).length,
            complete: chapters.filter(c => c.status === 'complete').length
          }
        };
      })
    );

    res.json({
      success: true,
      data: jobsWithDetails
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Requeue a failed/paused job
router.post('/jobs/:jobId/requeue', async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await GenerationJobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({ 
        success: false, 
        error: 'Job not found' 
      });
    }

    // Only allow requeueing of failed or paused jobs
    if (job.status !== 'failed' && job.status !== 'paused') {
      return res.status(400).json({ 
        success: false, 
        error: `Cannot requeue job with status: ${job.status}. Only failed or paused jobs can be requeued.` 
      });
    }

    // Determine the appropriate status based on progress
    let newStatus = 'pending';
    if (job.progress?.outline) {
      // Outline is done, so we should resume from chapters
      newStatus = 'generating_chapters';
    } else {
      // No outline, start from beginning
      newStatus = 'pending';
    }

    // Clear error and update status
    await GenerationJobModel.updateOne(
      { _id: job._id },
      {
        status: newStatus,
        error: undefined,
        startedAt: newStatus === 'pending' ? new Date() : job.startedAt
      }
    );

    // Update book status
    await BookModel.updateOne(
      { _id: job.bookId },
      { status: 'generating' }
    );

    res.json({
      success: true,
      message: 'Job requeued successfully',
      data: {
        jobId: job._id,
        newStatus,
        willResumeFrom: job.progress?.outline ? 'chapters' : 'outline'
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all books (admin view)
router.get('/books', async (req: AuthRequest, res) => {
  try {
    const books = await BookModel.find()
      .populate('userId', 'name email')
      .populate('publisherId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: books
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all users
router.get('/users', async (req: AuthRequest, res) => {
  try {
    const users = await UserModel.find()
      .select('-password')
      .populate('publisherId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: users
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all publishers
router.get('/publishers', async (req: AuthRequest, res) => {
  try {
    const publishers = await PublisherModel.find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: publishers
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get admin dashboard stats
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const [
      totalBooks,
      totalUsers,
      totalPublishers,
      totalJobs,
      activeJobs,
      completedBooks,
      totalWriters,
      totalReviewers
    ] = await Promise.all([
      BookModel.countDocuments(),
      UserModel.countDocuments(),
      PublisherModel.countDocuments(),
      GenerationJobModel.countDocuments(),
      GenerationJobModel.countDocuments({ status: { $in: ['pending', 'generating_outline', 'generating_chapters'] } }),
      BookModel.countDocuments({ status: 'complete' }),
      UserModel.countDocuments({ role: UserRole.WRITER }),
      UserModel.countDocuments({ role: UserRole.REVIEWER })
    ]);

    // Get subscription stats
    const subscriptionStats = await UserModel.aggregate([
      {
        $group: {
          _id: '$subscriptionTier',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get books by status
    const booksByStatus = await BookModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get jobs by status
    const jobsByStatus = await GenerationJobModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalBooks,
          totalUsers,
          totalPublishers,
          totalJobs,
          activeJobs,
          completedBooks,
          totalWriters,
          totalReviewers
        },
        subscriptions: subscriptionStats,
        booksByStatus: booksByStatus.reduce((acc, item) => {
          acc[item._id || 'unknown'] = item.count;
          return acc;
        }, {} as Record<string, number>),
        jobsByStatus: jobsByStatus.reduce((acc, item) => {
          acc[item._id || 'unknown'] = item.count;
          return acc;
        }, {} as Record<string, number>)
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Helper function
function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const frequency: Record<string, number> = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

export default router;
