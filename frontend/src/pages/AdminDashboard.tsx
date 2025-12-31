import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookType, Niche, BOOK_TYPES, NICHES, Book, User, Publisher } from '@ai-kindle/shared';
import { promptsApi, adminApi } from '../api/client';
import { showToast } from '../utils/toast';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  TextField,
  MenuItem,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
} from '@mui/material';
import {
  ExpandMore,
  Refresh,
  Visibility,
  Dashboard,
  Book as BookIcon,
  Work,
  People,
  Business,
  Code,
} from '@mui/icons-material';

type TabType = 'overview' | 'books' | 'jobs' | 'users' | 'publishers' | 'prompts';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  
  // Overview/Stats state
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Books tab state
  const [books, setBooks] = useState<Book[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);

  // Users tab state
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Publishers tab state
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [publishersLoading, setPublishersLoading] = useState(false);

  // Prompts tab state
  const [selectedBookType, setSelectedBookType] = useState<BookType | ''>('');
  const [selectedNiche, setSelectedNiche] = useState<Niche | ''>('');
  const [prompts, setPrompts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

  // Jobs tab state
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [requeueing, setRequeueing] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'overview') {
      loadStats();
    } else if (activeTab === 'books') {
      loadBooks();
    } else if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'publishers') {
      loadPublishers();
    } else if (activeTab === 'jobs') {
      loadJobs();
      // Refresh jobs every 10 seconds
      const interval = setInterval(loadJobs, 10000);
      return () => clearInterval(interval);
    } else if (selectedBookType && selectedNiche && activeTab === 'prompts') {
      loadPrompts();
    }
  }, [activeTab, selectedBookType, selectedNiche]);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const result = await adminApi.getStats();
      if (result.success && result.data) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadBooks = async () => {
    setBooksLoading(true);
    try {
      const result = await adminApi.getAllBooks();
      if (result.success && result.data) {
        setBooks(result.data);
      }
    } catch (error) {
      console.error('Failed to load books:', error);
    } finally {
      setBooksLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const result = await adminApi.getAllUsers();
      if (result.success && result.data) {
        setUsers(result.data);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadPublishers = async () => {
    setPublishersLoading(true);
    try {
      const result = await adminApi.getAllPublishers();
      if (result.success && result.data) {
        setPublishers(result.data);
      }
    } catch (error) {
      console.error('Failed to load publishers:', error);
    } finally {
      setPublishersLoading(false);
    }
  };

  const loadPrompts = async () => {
    if (!selectedBookType || !selectedNiche) return;
    setLoading(true);
    try {
      const result = await promptsApi.getVersions(selectedBookType, selectedNiche);
      if (result.success && result.data) {
        setPrompts(result.data);
      }
    } catch (error) {
      console.error('Failed to load prompts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePrompts = async () => {
    if (!selectedBookType || !selectedNiche) return;
    setLoading(true);
    try {
      await promptsApi.generate(selectedBookType, selectedNiche);
      await loadPrompts();
    } catch (error) {
      console.error('Failed to generate prompts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadJobs = async () => {
    setJobsLoading(true);
    try {
      const result = await adminApi.getAllJobs();
      if (result.success && result.data) {
        setJobs(result.data);
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setJobsLoading(false);
    }
  };

  const handleRequeue = async (jobId: string) => {
    setRequeueing(jobId);
    try {
      await adminApi.requeueJob(jobId);
      await loadJobs();
      showToast.success('Job requeued successfully');
    } catch (error: any) {
      showToast.error(`Failed to requeue job: ${error.message}`);
    } finally {
      setRequeueing(null);
    }
  };

  const getStatusColor = (status: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
    const colors: Record<string, "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"> = {
      pending: 'info',
      generating_outline: 'warning',
      outline_complete: 'info',
      generating_chapters: 'warning',
      complete: 'success',
      failed: 'error',
      paused: 'info',
      draft: 'default',
      generating: 'warning',
      published: 'info',
    };
    return colors[status] || 'default';
  };

  const groupedPrompts = prompts.reduce((acc: any, prompt: any) => {
    if (!acc[prompt.promptType]) {
      acc[prompt.promptType] = [];
    }
    acc[prompt.promptType].push(prompt);
    return acc;
  }, {});

  const tabs: { id: TabType; label: string; icon: React.ReactElement }[] = [
    { id: 'overview', label: 'Overview', icon: <Dashboard /> },
    { id: 'books', label: 'All Books', icon: <BookIcon /> },
    { id: 'jobs', label: 'Jobs', icon: <Work /> },
    { id: 'users', label: 'Users', icon: <People /> },
    { id: 'publishers', label: 'Publishers', icon: <Business /> },
    { id: 'prompts', label: 'Prompts', icon: <Code /> },
  ];

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" fontWeight={600} gutterBottom>
        Admin Dashboard
      </Typography>

      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_e, newValue) => setActiveTab(newValue)}
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
        <Box>
          {statsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : stats ? (
            <>
              <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h3" color="primary.main" fontWeight={700}>
                  {stats.overview.totalBooks}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Total Books
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h3" color="success.main" fontWeight={700}>
                  {stats.overview.totalUsers}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Total Users
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h3" color="warning.main" fontWeight={700}>
                  {stats.overview.totalJobs}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Total Jobs
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h3" color="info.main" fontWeight={700}>
                  {stats.overview.totalPublishers}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Publishers
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom fontWeight={600}>
                        Books by Status
                      </Typography>
                      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                        {Object.entries(stats.booksByStatus).map(([status, count]: [string, any]) => (
                          <Box
                            component="li"
                            key={status}
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              py: 1,
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                            }}
                          >
                            <Typography variant="body2">{status}</Typography>
                            <Chip label={count} size="small" color={getStatusColor(status)} />
                          </Box>
                        ))}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom fontWeight={600}>
                        Jobs by Status
                      </Typography>
                      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                        {Object.entries(stats.jobsByStatus).map(([status, count]: [string, any]) => (
                          <Box
                            component="li"
                            key={status}
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              py: 1,
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                            }}
                          >
                            <Typography variant="body2">{status}</Typography>
                            <Chip label={count} size="small" color={getStatusColor(status)} />
                          </Box>
                        ))}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </>
          ) : null}
        </Box>
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
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Title</TableCell>
                    <TableCell>Writer</TableCell>
                    <TableCell>Publisher</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                    {books.map((book: any) => (
                    <TableRow key={book._id} hover>
                      <TableCell>
                        <Typography
                          component={Link}
                          to={`/books/${book._id}`}
                          sx={{ textDecoration: 'none', color: 'primary.main', fontWeight: 500 }}
                        >
                            {book.title}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{book.userId?.name || 'Unknown'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {book.userId?.email}
                        </Typography>
                      </TableCell>
                      <TableCell>{book.publisherId?.name || '-'}</TableCell>
                      <TableCell>
                        <Chip label={book.status} color={getStatusColor(book.status)} size="small" />
                      </TableCell>
                      <TableCell>
                          {BOOK_TYPES.find(t => t.id === book.bookType)?.name || book.bookType}
                      </TableCell>
                      <TableCell>
                          {book.createdAt ? new Date(book.createdAt).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          component={Link}
                          to={`/books/${book._id}/admin`}
                          size="small"
                          variant="outlined"
                          startIcon={<Visibility />}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
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
                    <TableCell>Subscription</TableCell>
                    <TableCell align="right">Credits</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                    {users.map((user: any) => (
                    <TableRow key={user._id} hover>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Chip label={user.role} size="small" color="info" />
                      </TableCell>
                      <TableCell>
                          {user.subscriptionTier ? (
                          <Box>
                            <Typography variant="body2" fontWeight={500}>
                              {user.subscriptionTier}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {user.subscriptionStatus || 'inactive'}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            None
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">{user.bookCredits || 0}</TableCell>
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

      {activeTab === 'publishers' && (
        <Paper>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={600}>
              All Publishers
            </Typography>
          </Box>
            {publishersLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
            ) : publishers.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">No publishers found</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Rates</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                    {publishers.map((publisher: any) => (
                    <TableRow key={publisher._id} hover>
                      <TableCell>
                        <Typography fontWeight={500}>{publisher.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{publisher.userId?.name || 'Unknown'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {publisher.userId?.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {publisher.description || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                          {publisher.rates?.editingRate ? (
                          <Typography variant="body2">
                            ${publisher.rates.editingRate}/{publisher.rates.editingRateType}
                          </Typography>
                          ) : (
                            '-'
                          )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={publisher.isActive ? 'Active' : 'Inactive'}
                          color={publisher.isActive ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                          {publisher.createdAt ? new Date(publisher.createdAt).toLocaleDateString() : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {activeTab === 'jobs' && (
        <Paper>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={600}>
              All Generation Jobs
            </Typography>
          </Box>
            {jobsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
            ) : jobs.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">No jobs found</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Book</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="center">Progress</TableCell>
                    <TableCell align="right">Tokens</TableCell>
                    <TableCell align="right">Cost</TableCell>
                    <TableCell>Chapters</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {jobs.map((job: any) => {
                    const progressPercent = job.totalChapters
                      ? ((job.currentChapter || 0) / job.totalChapters) * 100
                      : 0;
                    return (
                      <TableRow key={job._id} hover>
                        <TableCell>
                          <Typography
                            component={Link}
                            to={`/books/${job.bookId}/admin`}
                            sx={{ textDecoration: 'none', color: 'primary.main', fontWeight: 500 }}
                          >
                            {job.bookTitle}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {BOOK_TYPES.find(t => t.id === job.bookType)?.name} • {NICHES.find(n => n.id === job.niche)?.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={job.status} color={getStatusColor(job.status)} size="small" />
                          {job.error && (
                            <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5, maxWidth: 200 }}>
                              {job.error}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          {job.totalChapters ? (
                            <Box>
                              <Typography variant="body2">
                                {job.currentChapter || 0} / {job.totalChapters}
                              </Typography>
                              <LinearProgress
                                variant="determinate"
                                value={progressPercent}
                                sx={{ mt: 0.5, width: 100 }}
                              />
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                          {job.tokenUsage.total.toLocaleString()}
                          </Typography>
                          {job.tokenUsage.breakdown > 0 && (
                            <Typography variant="caption" color="text.secondary">
                              {job.tokenUsage.breakdown} steps
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {job.tokenUsage.cost > 0 ? `$${job.tokenUsage.cost.toFixed(4)}` : '-'}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            Text: {job.chapters.withText}/{job.chapters.total}
                          </Typography>
                          <Typography variant="body2">
                            Image: {job.chapters.withImage}/{job.chapters.total}
                          </Typography>
                          <Typography variant="body2">
                            Complete: {job.chapters.complete}/{job.chapters.total}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                          {job.createdAt ? new Date(job.createdAt).toLocaleString() : '-'}
                          </Typography>
                          {job.completedAt && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Completed: {new Date(job.completedAt).toLocaleString()}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          {(job.status === 'failed' || job.status === 'paused') && (
                            <Button
                              onClick={() => handleRequeue(job._id)}
                              variant="contained"
                              color="success"
                              size="small"
                              disabled={requeueing === job._id}
                              startIcon={requeueing === job._id ? <CircularProgress size={16} /> : <Refresh />}
                            >
                              {requeueing === job._id ? 'Requeuing...' : 'Requeue'}
                            </Button>
                          )}
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

      {activeTab === 'prompts' && (
        <Box>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom fontWeight={600}>
              Select Book Type & Niche
            </Typography>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label="Book Type"
                  value={selectedBookType}
                  onChange={(e) => setSelectedBookType(e.target.value as BookType)}
                >
                  <MenuItem value="">Select...</MenuItem>
                  {BOOK_TYPES.map((type) => (
                    <MenuItem key={type.id} value={type.id}>
                      {type.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label="Niche"
                  value={selectedNiche}
                  onChange={(e) => setSelectedNiche(e.target.value as Niche)}
                >
                  <MenuItem value="">Select...</MenuItem>
                  {NICHES.map((niche) => (
                    <MenuItem key={niche.id} value={niche.id}>
                      {niche.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
            <Button
              onClick={handleGeneratePrompts}
              variant="contained"
              disabled={!selectedBookType || !selectedNiche || loading}
              startIcon={loading ? <CircularProgress size={20} /> : <Refresh />}
            >
              {loading ? 'Generating...' : 'Generate/Refresh Prompts'}
            </Button>
          </Paper>

          {selectedBookType && selectedNiche && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom fontWeight={600}>
                Prompt Versions
              </Typography>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : prompts.length === 0 ? (
                <Alert severity="info">
                  No prompts found. Click "Generate/Refresh Prompts" to create them.
                </Alert>
              ) : (
                Object.entries(groupedPrompts).map(([promptType, versions]: [string, any]) => (
                  <Box key={promptType} sx={{ mb: 3 }}>
                    <Typography variant="h6" gutterBottom fontWeight={600}>
                      {promptType}
                    </Typography>
                    {versions.map((prompt: any) => (
                      <Accordion key={prompt._id} sx={{ mb: 1 }}>
                        <AccordionSummary expandIcon={<ExpandMore />}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', pr: 2 }}>
                            <Typography fontWeight={600}>Version {prompt.version}</Typography>
                            {prompt.metadata?.createdAt && (
                              <Typography variant="caption" color="text.secondary">
                                {new Date(prompt.metadata.createdAt).toLocaleString()}
                              </Typography>
                            )}
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                              Variables:
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                {prompt.variables.map((v: string, i: number) => (
                                <Chip key={i} label={v} size="small" color="info" />
                              ))}
                            </Box>
                          </Box>
                          <Box>
                            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                              Prompt:
                            </Typography>
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 2,
                                bgcolor: 'grey.50',
                                maxHeight: 400,
                                overflow: 'auto',
                              }}
                            >
                              <Typography
                                component="pre"
                                variant="body2"
                                sx={{
                                  fontFamily: 'monospace',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  m: 0,
                                }}
                              >
                                {prompt.prompt}
                              </Typography>
                            </Paper>
                          </Box>
                        </AccordionDetails>
                      </Accordion>
                    ))}
                  </Box>
                ))
              )}
            </Paper>
          )}
        </Box>
      )}
    </Container>
  );
}
