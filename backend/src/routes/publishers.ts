import express from 'express';
import { PublisherModel } from '../models/Publisher.js';
import { EditingRequestModel, EditingRequestStatus } from '../models/EditingRequest.js';
import { BookModel } from '../models/Book.js';
import { BookOutlineModel } from '../models/BookOutline.js';
import { UserModel } from '../models/User.js';
import { ReviewerInviteModel } from '../models/ReviewerInvite.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { UserRole } from '../models/User.js';
import crypto from 'crypto';

const router = express.Router();

// Get all publishers (for writers to search)
router.get('/', async (req, res) => {
  try {
    const publishers = await PublisherModel.find({ isActive: true })
      .populate('userId', 'name email')
      .select('-__v')
      .lean();

    res.json({
      success: true,
      data: publishers
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create/Update publisher profile (for publishers)
router.post('/profile', authenticate, requireRole(UserRole.PUBLISHER), async (req: AuthRequest, res) => {
  try {
    // Only extract the fields we want to update - explicitly ignore isActive and other fields
    const { name, description, editorialFocus, language, geographicPresence, rates } = req.body;

    // Validate that we're not accidentally receiving isActive
    if ('isActive' in req.body) {
      delete req.body.isActive;
    }

    let publisher = await PublisherModel.findOne({ userId: req.user!._id });

    if (publisher) {
      // Build update object with only the fields we want to update
      const updateData: any = {};
      
      if (name !== undefined && typeof name === 'string') {
        updateData.name = name;
      }
      if (description !== undefined && typeof description === 'string') {
        updateData.description = description;
      }
      if (editorialFocus !== undefined && typeof editorialFocus === 'string') {
        updateData.editorialFocus = editorialFocus;
      }
      if (language !== undefined && typeof language === 'string') {
        updateData.language = language;
      }
      if (geographicPresence !== undefined && typeof geographicPresence === 'string') {
        updateData.geographicPresence = geographicPresence;
      }
      if (rates && typeof rates === 'object') {
        updateData.rates = { ...publisher.rates, ...rates };
      }
      
      // Apply updates
      Object.assign(publisher, updateData);
      
      // Auto-activate if profile is complete (editing rate is optional)
      // Only set isActive based on completion, never from request body
      const hasRequiredFields = publisher.name && 
        publisher.description && 
        publisher.editorialFocus && 
        publisher.language && 
        publisher.geographicPresence;
      
      if (hasRequiredFields && !publisher.isActive) {
        publisher.isActive = true;
      }
      
      await publisher.save();
    } else {
      // Create new (editing rate is optional)
      const hasRequiredFields = !!(name && description && editorialFocus && language && geographicPresence);
      publisher = new PublisherModel({
        userId: req.user!._id,
        name: name || req.user!.name,
        description: description || '',
        editorialFocus: editorialFocus || '',
        language: language || '',
        geographicPresence: geographicPresence || '',
        rates: rates || {},
        isActive: hasRequiredFields // Explicitly boolean
      });
      await publisher.save();
    }

    res.json({
      success: true,
      data: publisher
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get publisher profile
router.get('/profile', authenticate, requireRole(UserRole.PUBLISHER), async (req: AuthRequest, res) => {
  try {
    const publisher = await PublisherModel.findOne({ userId: req.user!._id })
      .populate('userId', 'name email')
      .lean();

    if (!publisher) {
      return res.status(404).json({ success: false, error: 'Publisher profile not found' });
    }

    res.json({
      success: true,
      data: publisher
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get editing requests for publisher
router.get('/requests', authenticate, requireRole(UserRole.PUBLISHER), async (req: AuthRequest, res) => {
  try {
    const publisher = await PublisherModel.findOne({ userId: req.user!._id });
    if (!publisher) {
      return res.status(404).json({ success: false, error: 'Publisher profile not found' });
    }

    const requests = await EditingRequestModel.find({ publisherId: publisher._id })
      .populate('bookId', 'title status')
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

// Accept editing request
router.post('/requests/:requestId/accept', authenticate, requireRole(UserRole.PUBLISHER), async (req: AuthRequest, res) => {
  try {
    const { requestId } = req.params;
    const { responseMessage, estimatedCost } = req.body;

    const publisher = await PublisherModel.findOne({ userId: req.user!._id });
    if (!publisher) {
      return res.status(404).json({ success: false, error: 'Publisher profile not found' });
    }

    const request = await EditingRequestModel.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    if (request.publisherId.toString() !== (publisher._id as any).toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    if (request.status !== EditingRequestStatus.PENDING) {
      return res.status(400).json({ success: false, error: 'Request is not pending' });
    }

    request.status = EditingRequestStatus.ACCEPTED;
    request.responseMessage = responseMessage;
    request.estimatedCost = estimatedCost;
    request.acceptedAt = new Date();
    await request.save();

    // Update book with publisher
    await BookModel.findByIdAndUpdate(request.bookId, {
      publisherId: publisher._id
    });

    res.json({
      success: true,
      data: request
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reject editing request
router.post('/requests/:requestId/reject', authenticate, requireRole(UserRole.PUBLISHER), async (req: AuthRequest, res) => {
  try {
    const { requestId } = req.params;
    const { responseMessage } = req.body;

    const publisher = await PublisherModel.findOne({ userId: req.user!._id });
    if (!publisher) {
      return res.status(404).json({ success: false, error: 'Publisher profile not found' });
    }

    const request = await EditingRequestModel.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    if (request.publisherId.toString() !== (publisher._id as any).toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    if (request.status !== EditingRequestStatus.PENDING) {
      return res.status(400).json({ success: false, error: 'Request is not pending' });
    }

    request.status = EditingRequestStatus.REJECTED;
    request.responseMessage = responseMessage;
    await request.save();

    res.json({
      success: true,
      data: request
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all users with their book counts (for publishers)
router.get('/users', authenticate, requireRole(UserRole.PUBLISHER), async (req: AuthRequest, res) => {
  try {
    const publisher = await PublisherModel.findOne({ userId: req.user!._id });
    if (!publisher) {
      return res.status(404).json({ success: false, error: 'Publisher profile not found' });
    }

    // Get all books assigned to this publisher
    const books = await BookModel.find({ publisherId: publisher._id })
      .select('userId')
      .lean();

    // Get unique user IDs
    const userIds = [...new Set(books.map(b => b.userId?.toString()).filter(Boolean))];

    // Get users with their book counts
    const users = await UserModel.find({ _id: { $in: userIds } })
      .select('name email role createdAt')
      .lean();

    // Count books per user
    const bookCounts = books.reduce((acc: Record<string, number>, book) => {
      const userId = book.userId?.toString();
      if (userId) {
        acc[userId] = (acc[userId] || 0) + 1;
      }
      return acc;
    }, {});

    const usersWithCounts = users.map(user => ({
      ...user,
      bookCount: bookCounts[user._id.toString()] || 0
    }));

    res.json({
      success: true,
      data: usersWithCounts
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get books overview (title, chapter count, description) for publisher
router.get('/books', authenticate, requireRole(UserRole.PUBLISHER), async (req: AuthRequest, res) => {
  try {
    const publisher = await PublisherModel.findOne({ userId: req.user!._id });
    if (!publisher) {
      return res.status(404).json({ success: false, error: 'Publisher profile not found' });
    }

    const books = await BookModel.find({ publisherId: publisher._id })
      .populate('userId', 'name email')
      .select('title context.description context.chapterCount outlineId status createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Get chapter counts from outlines
    const bookIds = books.map(b => b._id);
    const outlines = await BookOutlineModel.find({ bookId: { $in: bookIds } })
      .select('bookId structure.totalChapters')
      .lean();

    const outlineMap = new Map(
      outlines.map(o => [o.bookId.toString(), o.structure.totalChapters])
    );

    const booksWithChapters = books.map(book => ({
      _id: book._id,
      title: book.title,
      description: book.context?.description || '',
      chapterCount: outlineMap.get(book._id.toString()) || book.context?.chapterCount || 0,
      status: book.status,
      userId: book.userId,
      createdAt: book.createdAt
    }));

    res.json({
      success: true,
      data: booksWithChapters
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate reviewer invite (for publishers)
router.post('/invites', authenticate, requireRole(UserRole.PUBLISHER), async (req: AuthRequest, res) => {
  try {
    const publisher = await PublisherModel.findOne({ userId: req.user!._id });
    if (!publisher) {
      return res.status(404).json({ success: false, error: 'Publisher profile not found' });
    }

    const { email } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set expiration to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const invite = new ReviewerInviteModel({
      publisherId: publisher._id,
      token,
      email: email || undefined,
      expiresAt
    });

    await invite.save();

    // Generate invite URL
    const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/signup?invite=${token}`;

    res.json({
      success: true,
      data: {
        invite: {
          _id: invite._id,
          token: invite.token,
          email: invite.email,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt
        },
        inviteUrl
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all invites for a publisher
router.get('/invites', authenticate, requireRole(UserRole.PUBLISHER), async (req: AuthRequest, res) => {
  try {
    const publisher = await PublisherModel.findOne({ userId: req.user!._id });
    if (!publisher) {
      return res.status(404).json({ success: false, error: 'Publisher profile not found' });
    }

    const invites = await ReviewerInviteModel.find({ publisherId: publisher._id })
      .populate('usedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: invites
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify invite token (public endpoint for signup page)
router.get('/invites/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const invite = await ReviewerInviteModel.findOne({ token })
      .populate('publisherId', 'name')
      .lean();

    if (!invite) {
      return res.status(404).json({ success: false, error: 'Invalid invite token' });
    }

    if (invite.used) {
      return res.status(400).json({ success: false, error: 'This invite has already been used' });
    }

    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, error: 'This invite has expired' });
    }

    res.json({
      success: true,
      data: {
        publisherId: invite.publisherId,
        publisherName: (invite.publisherId as any).name,
        email: invite.email
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

