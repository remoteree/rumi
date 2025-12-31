import express from 'express';
import { EditingRequestModel, EditingRequestStatus } from '../models/EditingRequest.js';
import { BookModel } from '../models/Book.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { UserRole } from '../models/User.js';

const router = express.Router();

// Create editing request (writers and admins)
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { bookId, publisherId, message } = req.body;

    if (!bookId || !publisherId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Book ID and Publisher ID are required' 
      });
    }

    // Verify book belongs to user (writers must own the book, admins can access any book)
    const book = await BookModel.findById(bookId);
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    // Writers must own the book, admins can create requests for any book
    if (req.user!.role === UserRole.WRITER && book.userId?.toString() !== req.user!._id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Check if request already exists
    const existingRequest = await EditingRequestModel.findOne({
      bookId,
      publisherId,
      status: { $in: [EditingRequestStatus.PENDING, EditingRequestStatus.ACCEPTED] }
    });

    if (existingRequest) {
      return res.status(400).json({ 
        success: false, 
        error: 'A request already exists for this book and publisher' 
      });
    }

    const request = new EditingRequestModel({
      bookId,
      writerId: req.user!._id,
      publisherId,
      message,
      status: EditingRequestStatus.PENDING
    });

    await request.save();

    const populatedRequest = await EditingRequestModel.findById(request._id)
      .populate('bookId', 'title')
      .populate('publisherId', 'name')
      .lean();

    res.status(201).json({
      success: true,
      data: populatedRequest
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get editing requests for user (writers and admins see requests for their own books)
router.get('/my-requests', authenticate, async (req: AuthRequest, res) => {
  try {
    // Show requests where the user is the writer (applies to both writers and admins)
    const requests = await EditingRequestModel.find({ writerId: req.user!._id })
      .populate('bookId', 'title status')
      .populate('publisherId', 'name')
      .populate('writerId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: requests
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

