import { useState, useEffect } from 'react';
import { EditingRequest, EditingRequestStatus } from '@ai-kindle/shared';
import { publishersApi, editingRequestsApi } from '../api/client';
import {
  Container,
  Typography,
  Box,
  Tabs,
  Tab,
  Paper,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Divider,
} from '@mui/material';
import {
  People,
  Book as BookIcon,
  EditNote,
  Settings,
  Dashboard,
  PersonAdd,
  ContentCopy,
  CheckCircle,
  Warning,
} from '@mui/icons-material';

type TabType = 'overview' | 'users' | 'books' | 'requests' | 'profile' | 'invites';

export default function PublisherDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  
  // Overview state
  const [stats, setStats] = useState<{ totalUsers: number; totalBooks: number; pendingRequests: number } | null>(null);
  
  // Users tab state
  const [users, setUsers] = useState<Array<any & { bookCount: number }>>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  
  // Books tab state
  const [books, setBooks] = useState<Array<any & { chapterCount: number }>>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  
  // Requests tab state
  const [requests, setRequests] = useState<EditingRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  
  // Profile tab state
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<EditingRequest | null>(null);
  const [responseMessage, setResponseMessage] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [error, setError] = useState('');
  
  // Invites tab state
  const [invites, setInvites] = useState<any[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedInviteUrl, setCopiedInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'overview') {
      loadOverview();
    } else if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'books') {
      loadBooks();
    } else if (activeTab === 'requests') {
      loadRequests();
    } else if (activeTab === 'profile') {
      loadProfile();
    } else if (activeTab === 'invites') {
      loadInvites();
    }
  }, [activeTab]);
  
  // Load profile on mount to show banner if needed
  useEffect(() => {
    loadProfile();
  }, []);

  const loadOverview = async () => {
    try {
      const [usersResult, booksResult, requestsResult] = await Promise.all([
        publishersApi.getUsers(),
        publishersApi.getBooks(),
        publishersApi.getRequests()
      ]);

      setStats({
        totalUsers: usersResult.success && usersResult.data ? usersResult.data.length : 0,
        totalBooks: booksResult.success && booksResult.data ? booksResult.data.length : 0,
        pendingRequests: requestsResult.success && requestsResult.data
          ? requestsResult.data.filter((r: EditingRequest) => r.status === EditingRequestStatus.PENDING).length
          : 0
      });
    } catch (err: any) {
      console.error('Failed to load overview:', err);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const result = await publishersApi.getUsers();
      if (result.success && result.data) {
        setUsers(result.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  };

  const loadBooks = async () => {
    setBooksLoading(true);
    try {
      const result = await publishersApi.getBooks();
      if (result.success && result.data) {
        setBooks(result.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load books');
    } finally {
      setBooksLoading(false);
    }
  };

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const result = await publishersApi.getRequests();
      if (result.success && result.data) {
        setRequests(result.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load requests');
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadProfile = async () => {
    setProfileLoading(true);
    try {
      const result = await publishersApi.getProfile();
      if (result.success && result.data) {
        setProfile(result.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAccept = async (requestId: string) => {
    try {
      const result = await publishersApi.acceptRequest(requestId, {
        responseMessage,
        estimatedCost: estimatedCost ? parseFloat(estimatedCost) : undefined
      });

      if (result.success) {
        await loadRequests();
        await loadOverview();
        setSelectedRequest(null);
        setResponseMessage('');
        setEstimatedCost('');
        setError('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to accept request');
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      const result = await publishersApi.rejectRequest(requestId, { responseMessage });

      if (result.success) {
        await loadRequests();
        await loadOverview();
        setSelectedRequest(null);
        setResponseMessage('');
        setError('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reject request');
    }
  };

  const updateProfile = async () => {
    try {
      const result = await publishersApi.updateProfile({
        name: profile.name,
        description: profile.description,
        editorialFocus: profile.editorialFocus,
        language: profile.language,
        geographicPresence: profile.geographicPresence,
        rates: profile.rates
      });

      if (result.success) {
        setProfile(result.data);
        setError('');
        await loadOverview(); // Refresh stats
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    }
  };

  const loadInvites = async () => {
    setInvitesLoading(true);
    try {
      const result = await publishersApi.getInvites();
      if (result.success && result.data) {
        setInvites(result.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load invites');
    } finally {
      setInvitesLoading(false);
    }
  };

  const handleCreateInvite = async () => {
    setCreatingInvite(true);
    try {
      const result = await publishersApi.createInvite(inviteEmail || undefined);
      if (result.success && result.data) {
        await loadInvites();
        setInviteEmail('');
        setCopiedInviteUrl(result.data.inviteUrl);
        // Copy to clipboard
        navigator.clipboard.writeText(result.data.inviteUrl);
        setTimeout(() => setCopiedInviteUrl(null), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create invite');
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyInviteUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedInviteUrl(url);
    setTimeout(() => setCopiedInviteUrl(null), 3000);
  };

  const isProfileComplete = () => {
    if (!profile) return false;
    return !!(
      profile.name &&
      profile.description &&
      profile.editorialFocus &&
      profile.language &&
      profile.geographicPresence
    );
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Dashboard /> },
    { id: 'users', label: 'Users', icon: <People /> },
    { id: 'books', label: 'Books', icon: <BookIcon /> },
    { id: 'requests', label: 'Requests', icon: <EditNote /> },
    { id: 'profile', label: 'Profile', icon: <Settings /> },
    { id: 'invites', label: 'Invites', icon: <PersonAdd /> },
  ];

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" fontWeight={600} gutterBottom>
        Publisher Dashboard
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Profile Completion Banner */}
      {profile && !isProfileComplete() && (
        <Alert 
          severity="warning" 
          icon={<Warning />}
          sx={{ mb: 3 }}
        >
          <Typography variant="body1" fontWeight={600} gutterBottom>
            Complete your profile to appear in the publisher directory
          </Typography>
          <Typography variant="body2">
            Please fill in all required fields: Name, Description, Editorial Focus, Language, and Geographic Presence.
          </Typography>
        </Alert>
      )}

      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              value={tab.id}
              label={tab.label}
              icon={tab.icon}
              iconPosition="start"
            />
          ))}
        </Tabs>
      </Paper>

      {activeTab === 'overview' && (
        <Grid container spacing={3}>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Box sx={{ textAlign: 'center' }}>
                  <People sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
                  <Typography variant="h3" fontWeight={700} color="primary.main">
                    {stats?.totalUsers || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Users
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Box sx={{ textAlign: 'center' }}>
                  <BookIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                  <Typography variant="h3" fontWeight={700} color="success.main">
                    {stats?.totalBooks || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Books
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Box sx={{ textAlign: 'center' }}>
                  <EditNote sx={{ fontSize: 48, color: 'warning.main', mb: 1 }} />
                  <Typography variant="h3" fontWeight={700} color="warning.main">
                    {stats?.pendingRequests || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Pending Requests
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {activeTab === 'users' && (
        <Paper>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={600}>
              All Users
            </Typography>
          </Box>
          {usersLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : users.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">No users found</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell align="right">Books Published</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user: any) => (
                    <TableRow key={user._id} hover>
                      <TableCell>
                        <Typography fontWeight={500}>{user.name}</Typography>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Chip label={user.role} size="small" color="info" />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="h6" color="primary.main">
                          {user.bookCount || 0}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {activeTab === 'books' && (
        <Paper>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={600}>
              All Books
            </Typography>
          </Box>
          {booksLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : books.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">No books found</Typography>
            </Box>
          ) : (
            <Grid container spacing={2} sx={{ p: 2 }}>
              {books.map((book: any) => (
                <Grid item xs={12} md={6} lg={4} key={book._id}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                        <Typography variant="h6" fontWeight={600} sx={{ flex: 1, mr: 1 }}>
                          {book.title}
                        </Typography>
                        <Chip label={book.status} color={book.status === 'published' ? 'success' : 'default'} size="small" />
                      </Box>
                      
                      {book.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {book.description.length > 150
                            ? `${book.description.substring(0, 150)}...`
                            : book.description}
                        </Typography>
                      )}
                      
                      <Divider sx={{ my: 1 }} />
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Chapters:</strong> {book.chapterCount || 0}
                        </Typography>
                        {book.userId && (
                          <Typography variant="caption" color="text.secondary">
                            {book.userId.name}
                          </Typography>
                        )}
                      </Box>
                      
                      {book.createdAt && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          Created: {new Date(book.createdAt).toLocaleDateString()}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Paper>
      )}

      {activeTab === 'requests' && (
        <Paper>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={600}>
              Editing Requests
            </Typography>
          </Box>
          {requestsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : requests.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">No requests yet.</Typography>
            </Box>
          ) : (
            <Grid container spacing={2} sx={{ p: 2 }}>
              {requests.map((request) => (
                <Grid item xs={12} md={6} key={request._id}>
                  <Card
                    variant="outlined"
                    sx={{
                      bgcolor: request.status === EditingRequestStatus.PENDING ? 'warning.light' : 'background.paper',
                      border: request.status === EditingRequestStatus.PENDING ? 2 : 1,
                      borderColor: request.status === EditingRequestStatus.PENDING ? 'warning.main' : 'divider',
                    }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                        <Typography variant="h6" fontWeight={600}>
                          {(request as any).bookId?.title || 'Book'}
                        </Typography>
                        <Chip
                          label={request.status}
                          color={
                            request.status === EditingRequestStatus.PENDING
                              ? 'warning'
                              : request.status === EditingRequestStatus.ACCEPTED
                              ? 'success'
                              : 'error'
                          }
                          size="small"
                        />
                      </Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        <strong>Writer:</strong> {(request as any).writerId?.name || 'Unknown'}
                      </Typography>
                      {(request as any).writerId?.email && (
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          <strong>Email:</strong> {(request as any).writerId.email}
                        </Typography>
                      )}
                      {request.message && (
                        <Box sx={{ mt: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                          <Typography variant="body2">
                            <strong>Message:</strong> {request.message}
                          </Typography>
                        </Box>
                      )}
                      {request.status === EditingRequestStatus.PENDING && (
                        <Button
                          variant="contained"
                          fullWidth
                          sx={{ mt: 2 }}
                          onClick={() => setSelectedRequest(request)}
                        >
                          Respond
                        </Button>
                      )}
                      {request.status === EditingRequestStatus.ACCEPTED && request.responseMessage && (
                        <Box sx={{ mt: 2, p: 1, bgcolor: 'success.light', borderRadius: 1 }}>
                          <Typography variant="body2">
                            <strong>Response:</strong> {request.responseMessage}
                          </Typography>
                          {request.estimatedCost && (
                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                              <strong>Estimated Cost:</strong> ${request.estimatedCost}
                            </Typography>
                          )}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Paper>
      )}

      {activeTab === 'profile' && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Publisher Profile
          </Typography>
          {profileLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : profile ? (
            <Box sx={{ maxWidth: 800 }}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Name *"
                  value={profile.name || ''}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    margin="normal"
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Description *"
                  value={profile.description || ''}
                  onChange={(e) => setProfile({ ...profile, description: e.target.value })}
                    multiline
                  rows={4}
                    margin="normal"
                    required
                    helperText="Describe your publishing services and expertise"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Editorial Focus *"
                    value={profile.editorialFocus || ''}
                    onChange={(e) => setProfile({ ...profile, editorialFocus: e.target.value })}
                    margin="normal"
                    required
                    placeholder="e.g., Fiction, Non-fiction, Academic"
                    helperText="What types of content do you specialize in?"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Language *"
                    value={profile.language || ''}
                    onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                    margin="normal"
                    required
                    placeholder="e.g., English, Spanish, French"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Geographic Presence *"
                    value={profile.geographicPresence || ''}
                    onChange={(e) => setProfile({ ...profile, geographicPresence: e.target.value })}
                    margin="normal"
                    required
                    placeholder="e.g., North America, Europe, Global"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Editing Rate"
                    type="number"
                    step="0.01"
                    value={profile.rates?.editingRate || ''}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        rates: { ...profile.rates, editingRate: e.target.value ? parseFloat(e.target.value) : undefined }
                      })
                    }
                    margin="normal"
                    helperText="Optional: Rate per word or per hour"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    select
                    label="Rate Type"
                    value={profile.rates?.editingRateType || 'per_word'}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        rates: { ...profile.rates, editingRateType: e.target.value as 'per_word' | 'per_hour' }
                      })
                    }
                    margin="normal"
                    SelectProps={{ native: true }}
                  >
                    <option value="per_word">Per Word</option>
                    <option value="per_hour">Per Hour</option>
                  </TextField>
                </Grid>
              </Grid>
              
              {isProfileComplete() && profile.isActive && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    ✓ Your profile is complete and visible in the publisher directory
                  </Typography>
                </Alert>
              )}
              
              <Button variant="contained" onClick={updateProfile} sx={{ mt: 3 }} size="large">
                {isProfileComplete() ? 'Update Profile' : 'Save Profile'}
              </Button>
            </Box>
          ) : (
            <Box>
              <Typography color="text.secondary" gutterBottom>
                No profile found. Create one below:
              </Typography>
              <Button
                variant="contained"
                onClick={() => {
                  setProfile({ name: '', description: '', editorialFocus: '', language: '', geographicPresence: '', rates: {} });
                }}
                sx={{ mt: 2 }}
              >
                Create Profile
              </Button>
            </Box>
          )}
        </Paper>
      )}

      {activeTab === 'invites' && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Reviewer Invites
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Generate invite links to invite users to sign up as reviewers for your publishing house.
          </Typography>
          
          <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Create New Invite
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <TextField
                label="Email (optional)"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Leave empty for open invite"
                helperText="If specified, only this email can use the invite"
                sx={{ flex: 1 }}
              />
              <Button
                variant="contained"
                onClick={handleCreateInvite}
                disabled={creatingInvite}
                startIcon={creatingInvite ? <CircularProgress size={20} /> : <PersonAdd />}
                sx={{ mt: 1 }}
              >
                {creatingInvite ? 'Creating...' : 'Create Invite'}
              </Button>
            </Box>
          </Paper>

          {invitesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : invites.length === 0 ? (
            <Alert severity="info">
              No invites created yet. Create an invite above to get started.
            </Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Email</TableCell>
                    <TableCell>Invite Link</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Expires</TableCell>
                    <TableCell>Used By</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invites.map((invite: any) => {
                    const inviteUrl = `${window.location.origin}/signup?invite=${invite.token}`;
                    return (
                      <TableRow key={invite._id} hover>
                        <TableCell>{invite.email || 'Open invite'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {inviteUrl}
                            </Typography>
                            <Button
                              size="small"
                              onClick={() => copyInviteUrl(inviteUrl)}
                              startIcon={copiedInviteUrl === inviteUrl ? <CheckCircle /> : <ContentCopy />}
                            >
                              {copiedInviteUrl === inviteUrl ? 'Copied!' : 'Copy'}
                            </Button>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={invite.used ? 'Used' : 'Active'}
                            color={invite.used ? 'default' : 'success'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {invite.expiresAt
                            ? new Date(invite.expiresAt).toLocaleDateString()
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          {invite.usedBy ? (
                            <Typography variant="body2">
                              {invite.usedBy.name} ({invite.usedBy.email})
                            </Typography>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            onClick={() => copyInviteUrl(inviteUrl)}
                            startIcon={<ContentCopy />}
                          >
                            Copy Link
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* Response Dialog */}
      <Dialog
        open={!!selectedRequest}
        onClose={() => {
          setSelectedRequest(null);
          setResponseMessage('');
          setEstimatedCost('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Respond to Request</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Response Message"
                value={responseMessage}
                onChange={(e) => setResponseMessage(e.target.value)}
            multiline
                rows={4}
            margin="normal"
                placeholder="Your response to the writer..."
              />
          <TextField
            fullWidth
            label="Estimated Cost (optional)"
                type="number"
                step="0.01"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                placeholder="0.00"
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button
                onClick={() => {
                  setSelectedRequest(null);
                  setResponseMessage('');
                  setEstimatedCost('');
                }}
              >
                Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => selectedRequest && handleReject(selectedRequest._id!)}
          >
            Reject
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={() => selectedRequest && handleAccept(selectedRequest._id!)}
          >
            Accept
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
