import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Book, BookVersion } from '@ai-kindle/shared';
import { reviewersApi } from '../api/client';
import { useTheme } from '@mui/material/styles';
import { Alert, Box } from '@mui/material';
import '../index.css';

export default function ReviewerDashboard() {
  const [manuscripts, setManuscripts] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [versions, setVersions] = useState<BookVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingChapter, setEditingChapter] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [notes, setNotes] = useState('');
  const navigate = useNavigate();
  const theme = useTheme();

  useEffect(() => {
    loadManuscripts();
  }, []);

  const loadManuscripts = async () => {
    try {
      const result = await reviewersApi.getManuscripts();
      if (result.success && result.data) {
        setManuscripts(result.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load manuscripts');
    } finally {
      setLoading(false);
    }
  };

  const loadBookDetails = async (bookId: string) => {
    try {
      const [bookResult, versionsResult] = await Promise.all([
        reviewersApi.getManuscript(bookId),
        reviewersApi.getVersions(bookId)
      ]);

      if (bookResult.success && bookResult.data) {
        setSelectedBook(bookResult.data.book);
        setChapters(bookResult.data.chapters || []);
      }

      if (versionsResult.success && versionsResult.data) {
        setVersions(versionsResult.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load book details');
    }
  };

  const handleEditChapter = (chapter: any) => {
    setEditingChapter(chapter.chapterNumber);
    setEditText(chapter.text || '');
    setNotes('');
  };

  const saveEdit = async (bookId: string, chapterNumber: number) => {
    try {
      const chapter = chapters.find(c => c.chapterNumber === chapterNumber);
      const result = await reviewersApi.saveEdit(bookId, {
        chapterNumber,
        field: 'text',
        oldValue: chapter?.text,
        newValue: editText,
        notes
      });

      if (result.success) {
        await loadBookDetails(bookId);
        setEditingChapter(null);
        setEditText('');
        setNotes('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save edit');
    }
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <h1>Reviewer Dashboard</h1>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!selectedBook ? (
        <div>
          <h2>Assigned Manuscripts</h2>
          {manuscripts.length === 0 ? (
            <p>No manuscripts assigned yet.</p>
          ) : (
            <div className="grid grid-2">
              {manuscripts.map((book) => (
                <div
                  key={book._id}
                  className="card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    loadBookDetails(book._id!);
                  }}
                >
                  <h3>{book.title}</h3>
                  <p><strong>Status:</strong> {book.status}</p>
                  <p><strong>Writer:</strong> {(book as any).userId?.name || 'Unknown'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>{selectedBook.title}</h2>
            <button className="btn btn-secondary" onClick={() => {
              setSelectedBook(null);
              setChapters([]);
              setVersions([]);
            }}>
              Back to List
            </button>
          </div>

          <div className="grid grid-2" style={{ gap: '2rem' }}>
            {/* Chapters */}
            <div className="card">
              <h3>Chapters</h3>
              {chapters.length === 0 ? (
                <p>No chapters yet.</p>
              ) : (
                <div>
                  {chapters.map((chapter) => (
                    <Box
                      key={chapter._id}
                      sx={{
                        padding: '1rem',
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: '8px',
                        marginBottom: '1rem',
                        bgcolor: 'background.paper'
                      }}
                    >
                      <h4>Chapter {chapter.chapterNumber}: {chapter.title || 'Untitled'}</h4>
                      {editingChapter === chapter.chapterNumber ? (
                        <div>
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={10}
                            style={{ width: '100%', marginBottom: '0.5rem' }}
                          />
                          <div className="form-group">
                            <label>Notes</label>
                            <textarea
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              rows={3}
                              placeholder="Add notes about your edits..."
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              className="btn btn-success"
                              onClick={() => saveEdit(selectedBook._id!, chapter.chapterNumber)}
                            >
                              Save Edit
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => {
                                setEditingChapter(null);
                                setEditText('');
                                setNotes('');
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p style={{ whiteSpace: 'pre-wrap', maxHeight: '200px', overflow: 'auto' }}>
                            {chapter.text?.substring(0, 500)}...
                          </p>
                          <button
                            className="btn btn-primary"
                            style={{ marginTop: '0.5rem' }}
                            onClick={() => handleEditChapter(chapter)}
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </Box>
                  ))}
                </div>
              )}
            </div>

            {/* Version History */}
            <div className="card">
              <h3>Version History</h3>
              {versions.length === 0 ? (
                <p>No edits yet.</p>
              ) : (
                <div>
                  {versions.map((version) => (
                    <Box
                      key={version._id}
                      sx={{
                        padding: '1rem',
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: '8px',
                        marginBottom: '1rem',
                        bgcolor: 'background.paper'
                      }}
                    >
                      <h4>Version {version.versionNumber}</h4>
                      <p><strong>Edited by:</strong> {(version as any).editedBy?.name || 'Unknown'}</p>
                      <p><strong>Role:</strong> {version.editedByRole}</p>
                      <p><strong>Date:</strong> {new Date(version.createdAt!).toLocaleString()}</p>
                      {version.notes && (
                        <p><strong>Notes:</strong> {version.notes}</p>
                      )}
                      <details style={{ marginTop: '0.5rem' }}>
                        <summary>Changes ({version.changes.length})</summary>
                        <ul style={{ marginTop: '0.5rem' }}>
                          {version.changes.map((change, idx) => (
                            <li key={idx}>
                              <strong>{change.field}</strong>
                              {change.chapterNumber && ` (Chapter ${change.chapterNumber})`}
                              : {change.changeType}
                              {change.oldValue && (
                                <div style={{ paddingLeft: '1rem', fontSize: '0.875rem', color: '#666' }}>
                                  <div>Old: {change.oldValue.substring(0, 100)}...</div>
                                  <div>New: {change.newValue.substring(0, 100)}...</div>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </Box>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



