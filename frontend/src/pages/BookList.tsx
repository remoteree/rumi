import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Book, BOOK_TYPES, NICHES } from '@ai-kindle/shared';
import { booksApi } from '../api/client';

export default function BookList() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      draft: 'badge badge-info',
      generating: 'badge badge-warning',
      complete: 'badge badge-success',
      failed: 'badge badge-danger'
    };
    return badges[status] || 'badge';
  };

  const handleDelete = async (bookId: string, bookTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!confirm(`Are you sure you want to delete "${bookTitle}"? This will permanently delete the book and all related data (chapters, outline, job, token usage). This action cannot be undone.`)) {
      return;
    }

    setDeleting(bookId);
    try {
      await booksApi.delete(bookId);
      await loadBooks();
    } catch (error) {
      console.error('Failed to delete book:', error);
      alert('Failed to delete book. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>My Books</h1>
        <Link to="/" className="btn btn-primary">Create New Book</Link>
      </div>

      {books.length === 0 ? (
        <div className="card">
          <p>No books yet. <Link to="/">Create your first book</Link></p>
        </div>
      ) : (
        <div className="grid grid-2">
          {books.map((book) => (
            <div
              key={book._id}
              className="card"
              style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <Link
                to={`/books/${book._id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                  <h2>{book.title}</h2>
                  <span className={getStatusBadge(book.status)}>{book.status}</span>
                </div>
                <p style={{ color: '#666', marginBottom: '0.5rem' }}>
                  <strong>Type:</strong> {BOOK_TYPES.find(t => t.id === book.bookType)?.name}
                </p>
                <p style={{ color: '#666', marginBottom: '0.5rem' }}>
                  <strong>Niche:</strong> {NICHES.find(n => n.id === book.niche)?.name}
                </p>
              </Link>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Link
                  to={`/books/${book._id}/admin`}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', textDecoration: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Admin View
                </Link>
                <Link
                  to={`/books/${book._id}`}
                  className="btn btn-primary"
                  style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', textDecoration: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  View Details
                </Link>
                <button
                  className="btn"
                  style={{ 
                    fontSize: '0.875rem', 
                    padding: '0.5rem 1rem',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    cursor: deleting === book._id ? 'wait' : 'pointer',
                    opacity: deleting === book._id ? 0.6 : 1
                  }}
                  onClick={(e) => handleDelete(book._id!, book.title, e)}
                  disabled={deleting === book._id}
                >
                  {deleting === book._id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
              {book.createdAt && (
                <p style={{ color: '#999', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  Created: {new Date(book.createdAt).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

