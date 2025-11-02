import express from 'express';
import { GenerationJobModel } from '../models/GenerationJob';
import { ChapterContentModel } from '../models/ChapterContent';
import { TokenUsageModel } from '../models/TokenUsage';

const router = express.Router();

// Get all jobs
router.get('/', async (req, res) => {
  try {
    const jobs = await GenerationJobModel.find()
      .populate('bookId')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: jobs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get job by ID with details
router.get('/:id', async (req, res) => {
  try {
    const job = await GenerationJobModel.findById(req.params.id)
      .populate('bookId');
    
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    // Get chapters
    const chapters = await ChapterContentModel.find({ bookId: job.bookId })
      .sort({ chapterNumber: 1 });

    // Get token usage
    const tokenUsage = await TokenUsageModel.find({ jobId: job._id })
      .sort({ createdAt: 1 });

    const totalTokens = tokenUsage.reduce((sum, usage) => sum + usage.totalTokens, 0);

    res.json({
      success: true,
      data: {
        job,
        chapters,
        tokenUsage,
        totalTokens
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get progress for a book
router.get('/book/:bookId/progress', async (req, res) => {
  try {
    const job = await GenerationJobModel.findOne({ bookId: req.params.bookId });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const chapters = await ChapterContentModel.find({ bookId: req.params.bookId })
      .sort({ chapterNumber: 1 });

    res.json({
      success: true,
      data: {
        job,
        chapters: chapters.map(c => ({
          chapterNumber: c.chapterNumber,
          status: c.status,
          hasText: !!c.text,
          hasImage: !!c.imageUrl,
          wordCount: c.metadata?.wordCount
        }))
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

