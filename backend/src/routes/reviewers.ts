import express from 'express';
import { BookModel } from '../models/Book';
import { BookVersionModel } from '../models/BookVersion';
import { ChapterContentModel } from '../models/ChapterContent';
import { EditingRequestModel, EditingRequestStatus } from '../models/EditingRequest';
import { PublisherModel } from '../models/Publisher';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = express.Router();

// Get manuscripts assigned to reviewer's publisher
router.get('/manuscripts', authenticate, requireRole(UserRole.REVIEWER), async (req: AuthRequest, res) => {
  try {
    if (!req.user!.publisherId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Reviewer must be associated with a publisher' 
      });
    }

    // Find accepted editing requests for this publisher
    const acceptedRequests = await EditingRequestModel.find({
      publisherId: req.user!.publisherId,
      status: EditingRequestStatus.ACCEPTED
    }).select('bookId').lean();

    const bookIds = acceptedRequests.map(r => r.bookId);

    if (bookIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const books = await BookModel.find({ _id: { $in: bookIds } })
      .populate('userId', 'name email')
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      success: true,
      data: books
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get book details with chapters for editing
router.get('/manuscripts/:bookId', authenticate, requireRole(UserRole.REVIEWER), async (req: AuthRequest, res) => {
  try {
    const { bookId } = req.params;

    if (!req.user!.publisherId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Reviewer must be associated with a publisher' 
      });
    }

    // Verify book is assigned to reviewer's publisher
    const request = await EditingRequestModel.findOne({
      bookId,
      publisherId: req.user!.publisherId,
      status: EditingRequestStatus.ACCEPTED
    });

    if (!request) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to access this manuscript' 
      });
    }

    const book = await BookModel.findById(bookId)
      .populate('userId', 'name email')
      .lean();

    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const chapters = await ChapterContentModel.find({ bookId })
      .sort({ chapterNumber: 1 })
      .lean();

    res.json({
      success: true,
      data: {
        book,
        chapters
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save edits (create new version)
router.post('/manuscripts/:bookId/edit', authenticate, requireRole(UserRole.REVIEWER), async (req: AuthRequest, res) => {
  try {
    const { bookId } = req.params;
    const { changes, notes, chapterNumber, field, oldValue, newValue } = req.body;

    if (!req.user!.publisherId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Reviewer must be associated with a publisher' 
      });
    }

    // Verify book is assigned to reviewer's publisher
    const request = await EditingRequestModel.findOne({
      bookId,
      publisherId: req.user!.publisherId,
      status: EditingRequestStatus.ACCEPTED
    });

    if (!request) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to edit this manuscript' 
      });
    }

    // Get current version number
    const lastVersion = await BookVersionModel.findOne({ bookId })
      .sort({ versionNumber: -1 })
      .lean();

    const versionNumber = lastVersion ? lastVersion.versionNumber + 1 : 1;

    // If single change provided, wrap it in changes array
    const changesArray = changes || [{
      chapterNumber,
      field,
      oldValue,
      newValue,
      changeType: 'edit'
    }];

    // Create version record
    const version = new BookVersionModel({
      bookId,
      versionNumber,
      editedBy: req.user!._id,
      editedByRole: 'reviewer',
      changes: changesArray,
      notes
    });

    await version.save();

    // Apply changes to actual book/chapter data
    for (const change of changesArray) {
      if (change.field === 'text' && change.chapterNumber) {
        // Update chapter text
        const chapter = await ChapterContentModel.findOne({
          bookId,
          chapterNumber: change.chapterNumber
        });

        if (chapter) {
          chapter.text = change.newValue;
          await chapter.save();
        }
      } else if (change.field === 'title') {
        // Update book title
        await BookModel.findByIdAndUpdate(bookId, { title: change.newValue });
      }
      // Add more field updates as needed
    }

    res.json({
      success: true,
      data: version
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get version history for a book
router.get('/manuscripts/:bookId/versions', authenticate, requireRole(UserRole.REVIEWER), async (req: AuthRequest, res) => {
  try {
    const { bookId } = req.params;

    if (!req.user!.publisherId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Reviewer must be associated with a publisher' 
      });
    }

    // Verify book is assigned to reviewer's publisher
    const request = await EditingRequestModel.findOne({
      bookId,
      publisherId: req.user!.publisherId,
      status: EditingRequestStatus.ACCEPTED
    });

    if (!request) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to access this manuscript' 
      });
    }

    const versions = await BookVersionModel.find({ bookId })
      .populate('editedBy', 'name email')
      .sort({ versionNumber: -1 })
      .lean();

    res.json({
      success: true,
      data: versions
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;



