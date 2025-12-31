import express from 'express';
import { UserModel } from '../models/User';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = express.Router();

// Subscription tiers configuration
const SUBSCRIPTION_TIERS = {
  starter: {
    name: 'Starter Author',
    price: 19,
    priceType: 'monthly' as const,
    bookCredits: 1,
    rolloverCredits: true,
    rolloverMaxMonths: 1,
    features: [
      'Drafting workspace',
      'Rewrites & chapter edits',
      '1 full book generation credit / month',
      '(e.g. up to ~40–50k words)',
      'Roll-over unused credits (1 month max)'
    ]
  },
  pro: {
    name: 'Pro Author',
    price: 39,
    priceType: 'monthly' as const,
    bookCredits: 3,
    rolloverCredits: true,
    rolloverMaxMonths: 1,
    features: [
      'Everything in Starter',
      '3 book credits / month',
      'Priority queue',
      'Style memory',
      'Long-form coherence mode'
    ]
  },
  one_off: {
    name: 'One-Off Book Draft',
    price: 29,
    priceType: 'one_time' as const,
    bookCredits: 1,
    rolloverCredits: false,
    features: [
      '1 full book draft',
      'No subscription required'
    ]
  }
};

// Get subscription tiers
router.get('/tiers', async (req, res) => {
  res.json({
    success: true,
    data: SUBSCRIPTION_TIERS
  });
});

// Subscribe to a tier (for writers)
router.post('/subscribe', authenticate, requireRole(UserRole.WRITER), async (req: AuthRequest, res) => {
  try {
    const { tier, paymentMethodId } = req.body; // paymentMethodId from Stripe

    if (!tier || !['starter', 'pro', 'one_off'].includes(tier)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid subscription tier' 
      });
    }

    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const tierConfig = SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS];

    // TODO: Integrate with Stripe for payment processing
    // For now, we'll simulate successful payment
    // In production, you would:
    // 1. Create/update Stripe subscription
    // 2. Handle webhook for subscription confirmation
    // 3. Update user subscription status

    if (tier === 'one_off') {
      // One-time purchase
      user.subscriptionTier = 'one_off';
      user.subscriptionStatus = 'active';
      user.bookCredits = (user.bookCredits || 0) + tierConfig.bookCredits;
      // One-off doesn't expire, but credits are one-time use
    } else {
      // Monthly subscription
      user.subscriptionTier = tier;
      user.subscriptionStatus = 'active';
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      user.subscriptionExpiresAt = expiresAt;
      
      // Add credits for the month
      user.bookCredits = (user.bookCredits || 0) + tierConfig.bookCredits;
    }

    await user.save();

    res.json({
      success: true,
      data: {
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        bookCredits: user.bookCredits
      },
      message: 'Subscription activated successfully. Payment processing integration needed.'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cancel subscription
router.post('/cancel', authenticate, requireRole(UserRole.WRITER), async (req: AuthRequest, res) => {
  try {
    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.subscriptionTier || user.subscriptionTier === 'one_off') {
      return res.status(400).json({ 
        success: false, 
        error: 'No active subscription to cancel' 
      });
    }

    // TODO: Cancel Stripe subscription
    user.subscriptionStatus = 'cancelled';
    await user.save();

    res.json({
      success: true,
      message: 'Subscription cancelled. Access continues until end of billing period.'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current subscription status
router.get('/status', authenticate, requireRole(UserRole.WRITER), async (req: AuthRequest, res) => {
  try {
    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const tierConfig = user.subscriptionTier 
      ? SUBSCRIPTION_TIERS[user.subscriptionTier as keyof typeof SUBSCRIPTION_TIERS]
      : null;

    res.json({
      success: true,
      data: {
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        bookCredits: user.bookCredits,
        tierConfig
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;



