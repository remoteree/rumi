import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '@ai-kindle/shared';
import { publishersApi } from '../api/client';
import { Publisher } from '@ai-kindle/shared';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Link as MuiLink,
  CircularProgress,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Select,
  MenuItem,
  InputLabel,
} from '@mui/material';
import { PersonAdd } from '@mui/icons-material';

export default function Signup() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [publisherId, setPublisherId] = useState('');
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ publisherName: string; email?: string } | null>(null);
  const [verifyingInvite, setVerifyingInvite] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If there's an invite token, verify it and set role to reviewer
    if (inviteToken) {
      setVerifyingInvite(true);
      publishersApi.verifyInvite(inviteToken)
        .then((result) => {
          if (result.success && result.data) {
            setInviteInfo({
              publisherName: result.data.publisherName,
              email: result.data.email
            });
            setRole(UserRole.REVIEWER);
            if (result.data.email) {
              setEmail(result.data.email);
            }
          } else {
            setError(result.error || 'Invalid invite link');
          }
        })
        .catch((err: any) => {
          setError(err.response?.data?.error || 'Invalid or expired invite link');
        })
        .finally(() => {
          setVerifyingInvite(false);
        });
    } else if (role === UserRole.REVIEWER) {
      // Only load publishers if no invite token (old flow)
      publishersApi.getAll()
        .then((result) => {
          if (result.success && result.data) {
            setPublishers(result.data);
          }
        })
        .catch((err) => {
          console.error('Failed to load publishers:', err);
        });
    }
  }, [role, inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!role) {
      setError('Please select a role');
      setLoading(false);
      return;
    }

    // For reviewers with invite token, use the token instead of publisherId
    if (role === UserRole.REVIEWER) {
      if (inviteToken) {
        // Use invite token flow
        try {
          await signup(email, password, name, role, undefined, inviteToken);
          navigate('/');
        } catch (err: any) {
          setError(err.message || 'Signup failed');
        } finally {
          setLoading(false);
        }
        return;
      } else if (!publisherId) {
        setError('Please select a publisher or use an invite link');
        setLoading(false);
        return;
      }
    }

    try {
      await signup(email, password, name, role, publisherId || undefined);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <PersonAdd sx={{ mr: 1, fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" component="h1" fontWeight={600}>
            Sign Up
          </Typography>
        </Box>

        {verifyingInvite && (
          <Alert severity="info" sx={{ mb: 3 }}>
            Verifying invite...
          </Alert>
        )}

        {inviteInfo && (
          <Alert severity="success" sx={{ mb: 3 }}>
            <Typography variant="body1" fontWeight={600} gutterBottom>
              You've been invited to join as a reviewer!
            </Typography>
            <Typography variant="body2">
              Publisher: <strong>{inviteInfo.publisherName}</strong>
            </Typography>
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            margin="normal"
            autoFocus
          />

          <TextField
            fullWidth
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            margin="normal"
            autoComplete="email"
          />

          <TextField
            fullWidth
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            margin="normal"
            autoComplete="new-password"
            inputProps={{ minLength: 6 }}
            helperText="Minimum 6 characters"
          />

          {inviteToken ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                You're signing up as a <strong>Reviewer</strong> for {inviteInfo?.publisherName || 'a publisher'}.
              </Typography>
            </Alert>
          ) : (
            <>
              <FormControl component="fieldset" margin="normal" fullWidth>
                <FormLabel component="legend">Role *</FormLabel>
                <RadioGroup
                  row
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value as UserRole);
                    if (e.target.value !== UserRole.REVIEWER) {
                      setPublisherId('');
                    }
                  }}
                >
                  {Object.values(UserRole).filter(r => r !== UserRole.REVIEWER).map((r) => (
                    <FormControlLabel
                      key={r}
                      value={r}
                      control={<Radio />}
                      label={r.charAt(0).toUpperCase() + r.slice(1)}
                    />
                  ))}
                </RadioGroup>
                <Alert severity="info" sx={{ mt: 1 }}>
                  <Typography variant="caption">
                    Reviewers can only sign up using an invite link from a publisher.
                  </Typography>
                </Alert>
              </FormControl>
            </>
          )}

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={loading}
            sx={{ mt: 3, mb: 2 }}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <PersonAdd />}
          >
            {loading ? 'Signing up...' : 'Sign Up'}
          </Button>

          <Box sx={{ textAlign: 'center' }}>
            <MuiLink component={Link} to="/login" variant="body2">
              Already have an account? Login
            </MuiLink>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}
