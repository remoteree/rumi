import { useState, useEffect } from 'react';
import { subscriptionsApi } from '../api/client';
import { SubscriptionTier } from '@ai-kindle/shared';
import { showToast } from '../utils/toast';
import {
  Container,
  Typography,
  Button,
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  CircularProgress,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Divider,
} from '@mui/material';
import { CheckCircle, Info } from '@mui/icons-material';

export default function Subscriptions() {
  const [tiers, setTiers] = useState<Record<string, SubscriptionTier>>({});
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [_selectedTier, setSelectedTier] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tiersResult, statusResult] = await Promise.all([
        subscriptionsApi.getTiers(),
        subscriptionsApi.getStatus()
      ]);

      if (tiersResult.success && tiersResult.data) {
        setTiers(tiersResult.data);
      }

      if (statusResult.success && statusResult.data) {
        setStatus(statusResult.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (tier: string) => {
    try {
      setError('');
      const result = await subscriptionsApi.subscribe(tier);
      if (result.success) {
        await loadData();
        setSelectedTier(null);
        showToast.success('Subscription activated! (Note: Payment integration needed)');
      } else {
        setError(result.error || 'Failed to subscribe');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to subscribe');
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel your subscription?')) {
      return;
    }

    try {
      const result = await subscriptionsApi.cancel();
      if (result.success) {
        await loadData();
        showToast.success('Subscription cancelled');
      } else {
        setError(result.error || 'Failed to cancel subscription');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to cancel subscription');
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" fontWeight={600} gutterBottom>
        Subscription Plans
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {status && status.subscriptionTier && (
        <Paper elevation={2} sx={{ p: 3, mb: 4, bgcolor: 'success.light', color: 'success.contrastText' }}>
          <Typography variant="h5" fontWeight={600} gutterBottom>
            Current Subscription
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box>
              <Typography variant="body2" fontWeight={600}>Tier:</Typography>
              <Typography variant="body1">{status.tierConfig?.name || status.subscriptionTier}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600}>Status:</Typography>
              <Typography variant="body1">{status.subscriptionStatus}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600}>Book Credits:</Typography>
              <Typography variant="body1">{status.bookCredits || 0}</Typography>
            </Box>
            {status.subscriptionExpiresAt && (
              <Box>
                <Typography variant="body2" fontWeight={600}>Expires:</Typography>
                <Typography variant="body1">
                  {new Date(status.subscriptionExpiresAt).toLocaleDateString()}
                </Typography>
              </Box>
            )}
            {status.subscriptionStatus === 'active' && status.subscriptionTier !== 'one_off' && (
              <Button
                variant="contained"
                color="error"
                onClick={handleCancel}
                sx={{ mt: 2, alignSelf: 'flex-start' }}
              >
                Cancel Subscription
              </Button>
            )}
          </Box>
        </Paper>
      )}

      <Grid container spacing={3}>
        {Object.entries(tiers).map(([key, tier]) => {
          const isCurrent = status?.subscriptionTier === key;
          return (
            <Grid item xs={12} sm={6} md={4} key={key}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  border: isCurrent ? 2 : 1,
                  borderColor: isCurrent ? 'primary.main' : 'divider',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                }}
              >
                {isCurrent && (
                  <Chip
                    label="Current"
                    color="primary"
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: 16,
                      right: 16,
                    }}
                  />
                )}
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="h5" component="h2" fontWeight={600} gutterBottom>
                    {tier.name}
                  </Typography>
                  <Box sx={{ my: 2 }}>
                    <Typography
                      variant="h3"
                      component="span"
                      fontWeight={700}
                      color="primary.main"
                    >
                      ${tier.price}
                    </Typography>
                    <Typography variant="body1" component="span" color="text.secondary" sx={{ ml: 1 }}>
                      /{tier.priceType === 'monthly' ? 'month' : 'one-time'}
                    </Typography>
                  </Box>
                  <Divider sx={{ my: 2 }} />
                  <List dense>
                    {tier.features.map((feature, idx) => (
                      <ListItem key={idx} disableGutters>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <CheckCircle color="success" sx={{ fontSize: 20 }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={feature}
                          primaryTypographyProps={{ variant: 'body2' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
                <CardActions sx={{ p: 2, pt: 0 }}>
                  {!isCurrent && (
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => handleSubscribe(key)}
                      size="large"
                    >
                      Subscribe
                    </Button>
                  )}
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Alert severity="info" icon={<Info />} sx={{ mt: 4 }}>
        <Typography variant="body2">
          <strong>Note:</strong> Payment processing integration (Stripe) is needed for production use. Currently, subscriptions are activated without payment verification.
        </Typography>
      </Alert>
    </Container>
  );
}
