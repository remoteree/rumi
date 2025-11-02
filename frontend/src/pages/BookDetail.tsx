import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Book, BOOK_TYPES, NICHES } from '@ai-kindle/shared';
import { booksApi, jobsApi } from '../api/client';

export default function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{ ready: boolean; issues: string[] } | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (id) {
      loadBook();
      loadProgress();
      loadPublishStatus();
      // Poll for progress updates
      const interval = setInterval(() => {
        loadProgress();
        loadPublishStatus();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [id]);

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
    setStarting(true);
    try {
      await booksApi.startGeneration(id!);
      await loadProgress();
    } catch (error) {
      console.error('Failed to start generation:', error);
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
      alert('Book is not ready for publishing. Please check all chapters are complete with images uploaded.');
      return;
    }

    if (!confirm(`Publish "${book?.title}"? This will generate an EPUB file ready for Kindle publishing.`)) {
      return;
    }

    setPublishing(true);
    try {
      const result = await booksApi.publish(id!);
      if (result.success) {
        alert('Book published successfully! Download will start automatically.');
        await booksApi.downloadPublished(id!);
        await loadBook(); // Reload to get updated status
      }
    } catch (error: any) {
      console.error('Failed to publish book:', error);
      alert(`Failed to publish book: ${error.response?.data?.error || error.message}`);
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
      alert('Failed to delete book. Please try again.');
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  if (!book) {
    return <div className="container">Book not found</div>;
  }

  const bookType = BOOK_TYPES.find(t => t.id === book.bookType);
  const niche = NICHES.find(n => n.id === book.niche);

  return (
    <div className="container">
      <button onClick={() => navigate('/books')} className="btn btn-secondary" style={{ marginBottom: '1rem' }}>
        ← Back to Books
      </button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h1>{book.title}</h1>
            <p style={{ color: '#666', marginTop: '0.5rem' }}>
              {bookType?.name} • {niche?.name}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to={`/books/${book._id}/admin`} className="btn btn-secondary">
              Admin View
            </Link>
            <button
              className="btn"
              style={{ 
                background: '#dc3545',
                color: 'white',
                border: 'none',
                cursor: deleting ? 'wait' : 'pointer',
                opacity: deleting ? 0.6 : 1
              }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Book'}
            </button>
            <span className={`badge ${book.status === 'complete' ? 'badge-success' : book.status === 'generating' ? 'badge-warning' : 'badge-info'}`}>
              {book.status}
            </span>
          </div>
        </div>

        {book.context.description && (
          <div style={{ marginTop: '1.5rem' }}>
            <h3>Description</h3>
            <p>{book.context.description}</p>
          </div>
        )}
      </div>

      {(book.status === 'draft' || (book.status === 'generating' && progress?.job?.status === 'pending')) && (
        <div className="card">
          <h2>Ready to Generate</h2>
          <p>Start the generation process to create your book outline and chapters.</p>
          {progress?.job?.status === 'pending' && (
            <div style={{ 
              padding: '1rem', 
              background: '#fff3cd', 
              border: '1px solid #ffc107', 
              borderRadius: '4px',
              marginBottom: '1rem'
            }}>
              <strong>⚠️ Worker Required:</strong> Make sure the worker is running. The generation will start automatically once the worker picks up the job.
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                Run: <code style={{ background: '#f0f0f0', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>npm run dev:worker</code>
              </div>
            </div>
          )}
          <button
            onClick={handleStartGeneration}
            className="btn btn-success"
            disabled={starting}
            style={{ marginTop: '1rem' }}
          >
            {starting ? 'Starting...' : book.status === 'generating' ? 'Retry Generation' : 'Start Generation'}
          </button>
        </div>
      )}

      {progress && (
        <div className="card">
          <h2>Generation Progress</h2>
          
          {progress.job && (
            <div style={{ marginBottom: '1.5rem' }}>
              <p><strong>Status:</strong> {progress.job.status}</p>
              {progress.job.totalChapters && (
                <div style={{ marginTop: '1rem' }}>
                  <p><strong>Chapters:</strong> {progress.job.currentChapter || 0} / {progress.job.totalChapters}</p>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${((progress.job.currentChapter || 0) / progress.job.totalChapters) * 100}%`
                      }}
                    >
                      {Math.round(((progress.job.currentChapter || 0) / progress.job.totalChapters) * 100)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {progress.chapters && progress.chapters.length > 0 && (
            <div>
              <h3>Chapters</h3>
              <div className="grid grid-2" style={{ marginTop: '1rem' }}>
                {progress.chapters.map((chapter: any) => (
                  <div key={chapter.chapterNumber} className="card" style={{ background: '#f8f9fa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <h4>Chapter {chapter.chapterNumber}</h4>
                      <span className={`badge ${
                        chapter.status === 'complete' ? 'badge-success' :
                        chapter.status === 'failed' ? 'badge-danger' :
                        chapter.status === 'generating_text' || chapter.status === 'generating_image' ? 'badge-warning' :
                        'badge-info'
                      }`}>
                        {chapter.status}
                      </span>
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                      <p>Text: {chapter.hasText ? '✅' : '⏳'}</p>
                      <p>Image: {chapter.hasImage ? '✅' : '⏳'}</p>
                      {chapter.wordCount && <p>Words: {chapter.wordCount}</p>}
                    </div>
                    <div style={{ marginTop: '0.5rem' }}>
                      <Link 
                        to={`/books/${book._id}/admin`}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', textDecoration: 'none' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Edit Chapter
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Publish Section */}
      {book && (book.status === 'complete' || publishStatus) && (
        <div className="card">
          <h2>Publish Book</h2>
          
          {publishStatus && (
            <div style={{ marginBottom: '1rem' }}>
              {publishStatus.ready ? (
                <div style={{ 
                  padding: '1rem', 
                  background: '#d4edda', 
                  border: '1px solid #c3e6cb', 
                  borderRadius: '4px',
                  color: '#155724'
                }}>
                  <strong>✅ Ready to Publish!</strong>
                  <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                    All chapters are complete with text and images. You can publish this book to generate an EPUB file.
                  </p>
                </div>
              ) : (
                <div style={{ 
                  padding: '1rem', 
                  background: '#fff3cd', 
                  border: '1px solid #ffc107', 
                  borderRadius: '4px',
                  color: '#856404'
                }}>
                  <strong>⚠️ Not Ready for Publishing</strong>
                  <p style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                    The following issues must be resolved:
                  </p>
                  <ul style={{ marginLeft: '1.5rem', marginBottom: 0 }}>
                    {publishStatus.issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {book.status === 'published' && (
            <div style={{ 
              padding: '1rem', 
              background: '#e7f3ff', 
              border: '1px solid #007bff', 
              borderRadius: '4px',
              marginBottom: '1rem'
            }}>
              <strong>📚 Book Published!</strong>
              <p style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                This book has been published. You can download the EPUB file below.
              </p>
              <button
                onClick={() => booksApi.downloadPublished(id!)}
                className="btn btn-primary"
              >
                Download EPUB
              </button>
            </div>
          )}

          {publishStatus?.ready && book.status !== 'published' && (
            <button
              onClick={handlePublish}
              className="btn btn-success"
              disabled={publishing}
              style={{ marginTop: '1rem' }}
            >
              {publishing ? 'Publishing...' : '📚 Publish Book'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

