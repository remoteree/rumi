import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Book, BOOK_TYPES, NICHES } from '@ai-kindle/shared';
import { booksApi, jobsApi, subscriptionsApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { showToast } from '../utils/toast';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  Chip,
  CircularProgress,
  Alert,
  LinearProgress,
  Grid,
  Card,
  CardContent,
  CardActions,
} from '@mui/material';
import {
  ArrowBack,
  Delete,
  Settings,
  CheckCircle,
  Pending,
  Publish,
  Download,
  Warning,
} from '@mui/icons-material';

export default function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{ ready: boolean; issues: string[] } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);

  useEffect(() => {
    if (id) {
      loadBook();
      loadProgress();
      loadPublishStatus();
      if (user?.role === 'writer') {
        loadSubscriptionStatus();
      }
      // Poll for progress updates
      const interval = setInterval(() => {
        loadProgress();
        loadPublishStatus();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [id, user]);

  const loadSubscriptionStatus = async () => {
    try {
      const result = await subscriptionsApi.getStatus();
      if (result.success && result.data) {
        setSubscriptionStatus(result.data);
      }
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    }
  };

  const loadBook = async () => {
    try {
      const result = await booksApi.getById(id!);
      if (result.success && result.data) {
        setBook(result.data);
      }
    } catch (error) {
      console.error('Failed to load book:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProgress = async () => {
    try {
      const result = await jobsApi.getProgress(id!);
      if (result.success && result.data) {
        setProgress(result.data);
      }
    } catch (error) {
      console.error('Failed to load progress:', error);
    }
  };

  const handleStartGeneration = async () => {
    // Check credits for writers (admins bypass credit check)
    if (user?.role === 'writer') {
      if (!subscriptionStatus) {
        await loadSubscriptionStatus();
      }
      
      if ((subscriptionStatus?.bookCredits || 0) < 1) {
        if (!confirm('You don\'t have enough credits. Would you like to subscribe to a plan?')) {
          return;
        }
        navigate('/subscriptions');
        return;
      }
    }

    setStarting(true);
    try {
      await booksApi.startGeneration(id!);
      await loadProgress();
      if (user?.role === 'writer') {
        await loadSubscriptionStatus(); // Refresh credits
      }
    } catch (error: any) {
      console.error('Failed to start generation:', error);
      if (error.response?.data?.error?.includes('credits')) {
        showToast.error(error.response.data.error);
        navigate('/subscriptions');
      }
    } finally {
      setStarting(false);
    }
  };

  const loadPublishStatus = async () => {
    try {
      const result = await booksApi.getPublishStatus(id!);
      if (result.success && result.data) {
        setPublishStatus(result.data);
      }
    } catch (error) {
      console.error('Failed to load publish status:', error);
    }
  };

  const handlePublish = async () => {
    if (!publishStatus?.ready) {
      showToast.warning('Book is not ready for publishing. Please check all chapters are complete with images uploaded.');
      return;
    }

    if (!confirm(`Publish "${book?.title}"? This will generate an EPUB file ready for Kindle publishing.`)) {
      return;
    }

    setPublishing(true);
    try {
      const result = await booksApi.publish(id!);
      if (result.success) {
        showToast.success('Book published successfully! Download will start automatically.');
        await booksApi.downloadPublished(id!);
        await loadBook(); // Reload to get updated status
      }
    } catch (error: any) {
      console.error('Failed to publish book:', error);
      showToast.error(`Failed to publish book: ${error.response?.data?.error || error.message}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!book) return;
    
    if (!confirm(`Are you sure you want to delete "${book.title}"? This will permanently delete the book and all related data (chapters, outline, job, token usage). This action cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    try {
      await booksApi.delete(id!);
      navigate('/books');
    } catch (error) {
      console.error('Failed to delete book:', error);
      showToast.error('Failed to delete book. Please try again.');
      setDeleting(false);
    }
  };

  const getStatusColor = (status: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
    const colors: Record<string, "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"> = {
      draft: 'default',
      generating: 'warning',
      complete: 'success',
      failed: 'error',
      published: 'info',
      generating_text: 'warning',
      generating_image: 'warning',
    };
    return colors[status] || 'default';
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

  if (!book) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">Book not found</Alert>
      </Container>
    );
  }

  const bookType = BOOK_TYPES.find(t => t.id === book.bookType);
  const niche = NICHES.find(n => n.id === book.niche);
  const progressPercent = progress?.job?.totalChapters
    ? ((progress.job.currentChapter || 0) / progress.job.totalChapters) * 100
    : 0;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button
        startIcon={<ArrowBack />}
        onClick={() => navigate('/books')}
        sx={{ mb: 3 }}
        variant="outlined"
      >
        Back to Books
      </Button>

      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: '300px' }}>
            <Typography variant="h4" component="h1" fontWeight={600} gutterBottom>
              {book.title}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
              <Chip label={bookType?.name || book.bookType} size="small" variant="outlined" />
              <Chip label={niche?.name || book.niche} size="small" variant="outlined" />
              <Chip
                label={book.status}
                color={getStatusColor(book.status)}
                size="small"
              />
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              component={Link}
              to={`/books/${book._id}/admin`}
              variant="outlined"
              startIcon={<Settings />}
            >
              Admin View
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={handleDelete}
              disabled={deleting}
              startIcon={deleting ? <CircularProgress size={20} /> : <Delete />}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </Box>
        </Box>

        {book.context.description && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom fontWeight={600}>
              Description
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {book.context.description}
            </Typography>
          </Box>
        )}
      </Paper>

      {(book.status === 'draft' || (book.status === 'generating' && progress?.job?.status === 'pending')) && (
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            Ready to Generate
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Start the generation process to create your book outline and chapters.
          </Typography>

          {user?.role === 'writer' && subscriptionStatus && (
            <Alert
              severity={subscriptionStatus.bookCredits >= 1 ? 'success' : 'error'}
              sx={{ mb: 2 }}
              action={
                subscriptionStatus.bookCredits < 1 && (
                  <Button
                    component={Link}
                    to="/subscriptions"
                    size="small"
                    variant="contained"
                  >
                    Subscribe Now
                  </Button>
                )
              }
            >
              <Typography variant="body2" fontWeight={600}>
                Credits: {subscriptionStatus.bookCredits || 0}
              </Typography>
            </Alert>
          )}

          {user?.role === 'admin' && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2" fontWeight={600}>
                Admin Mode: Credit checks bypassed
              </Typography>
            </Alert>
          )}

          {progress?.job?.status === 'pending' && (
            <Alert severity="warning" icon={<Warning />} sx={{ mb: 2 }}>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Worker Required
              </Typography>
              <Typography variant="body2">
                Make sure the worker is running. The generation will start automatically once the worker picks up the job.
              </Typography>
              <Box component="code" sx={{ display: 'block', mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                npm run dev:worker
              </Box>
            </Alert>
          )}

          <Button
            onClick={handleStartGeneration}
            variant="contained"
            color="success"
            size="large"
            disabled={starting || (user?.role === 'writer' && (subscriptionStatus?.bookCredits || 0) < 1)}
            startIcon={starting ? <CircularProgress size={20} color="inherit" /> : <CheckCircle />}
            sx={{ mt: 2 }}
          >
            {starting ? 'Starting...' : book.status === 'generating' ? 'Retry Generation' : 'Start Generation'}
          </Button>

          {user?.role === 'admin' && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              As an admin, you can generate books without credit restrictions.
            </Typography>
          )}
        </Paper>
      )}

      {progress && (
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            Generation Progress
          </Typography>

          {progress.job && (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="body1" fontWeight={600}>
                  Status: {progress.job.status}
                </Typography>
                {progress.job.totalChapters && (
                  <Typography variant="body2" color="text.secondary">
                    {progress.job.currentChapter || 0} / {progress.job.totalChapters} chapters
                  </Typography>
                )}
              </Box>
              {progress.job.totalChapters && (
                <Box sx={{ mt: 2 }}>
                  <LinearProgress
                    variant="determinate"
                    value={progressPercent}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {Math.round(progressPercent)}% complete
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {progress.chapters && progress.chapters.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom fontWeight={600}>
                Chapters
              </Typography>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                {progress.chapters.map((chapter: any) => (
                  <Grid item xs={12} sm={6} md={4} key={chapter.chapterNumber}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                          <Typography variant="h6" fontWeight={600}>
                            Chapter {chapter.chapterNumber}
                          </Typography>
                          <Chip
                            label={chapter.status}
                            color={getStatusColor(chapter.status)}
                            size="small"
                          />
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {chapter.hasText ? (
                              <CheckCircle color="success" sx={{ fontSize: 18 }} />
                            ) : (
                              <Pending color="warning" sx={{ fontSize: 18 }} />
                            )}
                            <Typography variant="body2">Text</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {chapter.hasImage ? (
                              <CheckCircle color="success" sx={{ fontSize: 18 }} />
                            ) : (
                              <Pending color="warning" sx={{ fontSize: 18 }} />
                            )}
                            <Typography variant="body2">Image</Typography>
                          </Box>
                          {chapter.wordCount && (
                            <Typography variant="body2" color="text.secondary">
                              Words: {chapter.wordCount}
                            </Typography>
                          )}
                        </Box>
                      </CardContent>
                      <CardActions>
                        <Button
                          component={Link}
                          to={`/books/${book._id}/admin`}
                          size="small"
                          variant="outlined"
                          startIcon={<Settings />}
                        >
                          Edit
                        </Button>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </Paper>
      )}

      {book && (book.status === 'complete' || publishStatus) && (
        <Paper elevation={2} sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            Publish Book
          </Typography>

          {publishStatus && (
            <Box sx={{ mb: 2 }}>
              {publishStatus.ready ? (
                <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2 }}>
                  <Typography variant="body1" fontWeight={600} gutterBottom>
                    Ready to Publish!
                  </Typography>
                  <Typography variant="body2">
                    All chapters are complete with text and images. You can publish this book to generate an EPUB file.
                  </Typography>
                </Alert>
              ) : (
                <Alert severity="warning" icon={<Warning />} sx={{ mb: 2 }}>
                  <Typography variant="body1" fontWeight={600} gutterBottom>
                    Not Ready for Publishing
                  </Typography>
                  <Typography variant="body2" gutterBottom>
                    The following issues must be resolved:
                  </Typography>
                  <Box component="ul" sx={{ mt: 1, mb: 0, pl: 3 }}>
                    {publishStatus.issues.map((issue, idx) => (
                      <li key={idx}>
                        <Typography variant="body2">{issue}</Typography>
                      </li>
                    ))}
                  </Box>
                </Alert>
              )}
            </Box>
          )}

          {book.status === 'published' && (
            <Alert severity="info" icon={<Publish />} sx={{ mb: 2 }}>
              <Typography variant="body1" fontWeight={600} gutterBottom>
                Book Published!
              </Typography>
              <Typography variant="body2" gutterBottom>
                This book has been published. You can download the EPUB file below.
              </Typography>
              <Button
                onClick={() => booksApi.downloadPublished(id!)}
                variant="contained"
                startIcon={<Download />}
                sx={{ mt: 1 }}
              >
                Download EPUB
              </Button>
            </Alert>
          )}

          {publishStatus?.ready && book.status !== 'published' && (
            <Button
              onClick={handlePublish}
              variant="contained"
              color="success"
              size="large"
              disabled={publishing}
              startIcon={publishing ? <CircularProgress size={20} color="inherit" /> : <Publish />}
            >
              {publishing ? 'Publishing...' : 'Publish Book'}
            </Button>
          )}
        </Paper>
      )}
    </Container>
  );
}
