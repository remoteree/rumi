import express from 'express';
import jwt from 'jsonwebtoken';
import { UserModel, UserRole } from '../models/User.js';
import { PublisherModel } from '../models/Publisher.js';
import { ReviewerInviteModel } from '../models/ReviewerInvite.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, role, inviteToken } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email, password, name, and role are required' 
      });
    }

    if (!Object.values(UserRole).includes(role)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid role. Must be one of: writer, publisher, reviewer, admin' 
      });
    }

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'User with this email already exists' 
      });
    }

    // If reviewer, require invite token
    let publisherId: string | undefined;
    let invite: any = null;
    if (role === UserRole.REVIEWER) {
      if (!inviteToken) {
        return res.status(400).json({ 
          success: false, 
          error: 'Reviewers must sign up using an invite link from a publisher' 
        });
      }
      
      invite = await ReviewerInviteModel.findOne({ token: inviteToken });
      if (!invite) {
        return res.status(404).json({ 
          success: false, 
          error: 'Invalid invite token' 
        });
      }

      if (invite.used) {
        return res.status(400).json({ 
          success: false, 
          error: 'This invite has already been used' 
        });
      }

      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ 
          success: false, 
          error: 'This invite has expired' 
        });
      }

      // If invite has a specific email, verify it matches
      if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ 
          success: false, 
          error: 'This invite is for a different email address' 
        });
      }

      publisherId = invite.publisherId.toString();
    }

    // Create user
    const user = new UserModel({
      email: email.toLowerCase(),
      password,
      name,
      role,
      publisherId: role === UserRole.REVIEWER ? publisherId : undefined,
      bookCredits: 0
    });

    await user.save();

    // Mark invite as used after user is created
    if (invite && !invite.used) {
      invite.used = true;
      invite.usedBy = user._id;
      await invite.save();
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    // Return user data (without password)
    const userData = {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      publisherId: user.publisherId,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      bookCredits: user.bookCredits
    };

    res.status(201).json({
      success: true,
      data: {
        user: userData,
        token
      }
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.error(`Login failed: User not found for email ${email.toLowerCase()}`);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.error(`Login failed: Password mismatch for user ${email.toLowerCase()}`);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    // Return user data (without password)
    const userData = {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      publisherId: user.publisherId,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      bookCredits: user.bookCredits
    };

    res.json({
      success: true,
      data: {
        user: userData,
        token
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await UserModel.findById(req.user!._id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const userData = {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      publisherId: user.publisherId,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      bookCredits: user.bookCredits
    };

    res.json({
      success: true,
      data: userData
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

