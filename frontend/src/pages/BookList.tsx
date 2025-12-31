import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Book, BOOK_TYPES, NICHES } from '@ai-kindle/shared';
import { booksApi } from '../api/client';
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
  Chip,
  CircularProgress,
  Alert,
  IconButton,
} from '@mui/material';
import { Add, Delete, Settings, Visibility } from '@mui/icons-material';

export default function BookList() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    try {
      const result = await booksApi.getAll();
      if (result.success && result.data) {
        setBooks(result.data);
      }
    } catch (error) {
      console.error('Failed to load books:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
    const colors: Record<string, "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"> = {
      draft: 'default',
      generating: 'warning',
      complete: 'success',
      failed: 'error',
      published: 'info'
    };
    return colors[status] || 'default';
  };

  const handleDelete = async (bookId: string, bookTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!confirm(`Are you sure you want to delete "${bookTitle}"? This will permanently delete the book and all related data.`)) {
      return;
    }

    setDeleting(bookId);
    try {
      await booksApi.delete(bookId);
      await loadBooks();
    } catch (error) {
      console.error('Failed to delete book:', error);
      showToast.error('Failed to delete book. Please try again.');
    } finally {
      setDeleting(null);
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" component="h1" fontWeight={600}>
          My Books
        </Typography>
        <Button
          component={Link}
          to="/create"
          variant="contained"
          startIcon={<Add />}
          size="large"
        >
          Create New Book
        </Button>
      </Box>

      {books.length === 0 ? (
        <Card>
          <CardContent>
            <Alert severity="info">
              No books yet. <Button component={Link} to="/create" size="small">Create your first book</Button>
            </Alert>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {books.map((book) => (
            <Grid item xs={12} sm={6} md={4} key={book._id}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/books/${book._id}`)}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                    <Typography variant="h6" component="h2" fontWeight={600} sx={{ flexGrow: 1, mr: 1 }}>
                      {book.title}
                    </Typography>
                    <Chip
                      label={book.status}
                      color={getStatusColor(book.status)}
                      size="small"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    <strong>Type:</strong> {BOOK_TYPES.find(t => t.id === book.bookType)?.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    <strong>Niche:</strong> {NICHES.find(n => n.id === book.niche)?.name}
                  </Typography>
                  {book.createdAt && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      Created: {new Date(book.createdAt).toLocaleDateString()}
                    </Typography>
                  )}
                </CardContent>
                <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                  <Box>
                    <Button
                      size="small"
                      startIcon={<Visibility />}
                      component={Link}
                      to={`/books/${book._id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      View
                    </Button>
                    <Button
                      size="small"
                      startIcon={<Settings />}
                      component={Link}
                      to={`/books/${book._id}/admin`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Admin
                    </Button>
                  </Box>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(e) => handleDelete(book._id!, book.title, e)}
                    disabled={deleting === book._id}
                  >
                    {deleting === book._id ? <CircularProgress size={20} /> : <Delete />}
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
}
