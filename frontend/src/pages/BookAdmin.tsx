import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { booksApi, adminApi } from '../api/client';

interface Chapter {
  chapterNumber: number;
  text?: string;
  textPrompt?: string;
  imageUrl?: string;
  imagePrompt?: string;
  status: string;
  metadata?: {
    wordCount?: number;
    keywords?: string[];
  };
  tokenUsage: any[];
}

export default function BookAdmin() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<any>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [editingText, setEditingText] = useState(false);
  const [editingTextPrompt, setEditingTextPrompt] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [textPromptValue, setTextPromptValue] = useState('');
  const [promptValue, setPromptValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [publishStatus, setPublishStatus] = useState<{ ready: boolean; issues: string[] } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [republishing, setRepublishing] = useState(false);
  const [editingCoverPrompt, setEditingCoverPrompt] = useState(false);
  const [coverPromptValue, setCoverPromptValue] = useState('');
  const [generatingCoverPrompt, setGeneratingCoverPrompt] = useState(false);
  const [publishWithoutChapterImages, setPublishWithoutChapterImages] = useState(false);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    // Ensure id is a string, not an object
    const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
    
    if (!bookId || typeof bookId !== 'string') {
      console.error('Invalid book ID:', id);
      alert('Invalid book ID. Please navigate from the book list.');
      return;
    }

    setLoading(true);
    try {
      const bookResult = await booksApi.getById(bookId);
      if (bookResult.success && bookResult.data) {
        setBook(bookResult.data);
        setCoverPromptValue(bookResult.data.coverImagePrompt || '');
        setPublishWithoutChapterImages(bookResult.data.publishWithoutChapterImages || false);
      }

      const chaptersResult = await adminApi.getChapters(bookId);
      if (chaptersResult.success && chaptersResult.data) {
        setChapters(chaptersResult.data);
      }

      // Load publish status
      const publishResult = await booksApi.getPublishStatus(bookId);
      if (publishResult.success && publishResult.data) {
        setPublishStatus(publishResult.data);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChapterClick = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    setTextValue(chapter.text || '');
    setTextPromptValue(chapter.textPrompt || '');
    setPromptValue(chapter.imagePrompt || '');
    setEditingText(false);
    setEditingTextPrompt(false);
    setEditingPrompt(false);
  };

  const handleSaveText = async () => {
    if (!selectedChapter || !id) return;
    const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
    if (!bookId) return;
    setSaving(true);
    try {
      await adminApi.updateChapterText(bookId, selectedChapter.chapterNumber, textValue);
      await loadData();
      setEditingText(false);
      // Update selected chapter
      const updated = chapters.find(c => c.chapterNumber === selectedChapter.chapterNumber);
      if (updated) {
        setSelectedChapter({ ...updated, text: textValue });
      }
    } catch (error) {
      console.error('Failed to save text:', error);
      alert('Failed to save text');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTextPrompt = async () => {
    if (!selectedChapter || !id) return;
    const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
    if (!bookId) return;
    setSaving(true);
    try {
      await adminApi.updateTextPrompt(bookId, selectedChapter.chapterNumber, textPromptValue);
      await loadData();
      setEditingTextPrompt(false);
      // Update selected chapter
      const updated = chapters.find(c => c.chapterNumber === selectedChapter.chapterNumber);
      if (updated) {
        setSelectedChapter({ ...updated, textPrompt: textPromptValue });
      }
    } catch (error) {
      console.error('Failed to save text prompt:', error);
      alert('Failed to save text prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrompt = async () => {
    if (!selectedChapter || !id) return;
    const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
    if (!bookId) return;
    setSaving(true);
    try {
      await adminApi.updateImagePrompt(bookId, selectedChapter.chapterNumber, promptValue);
      await loadData();
      setEditingPrompt(false);
      // Update selected chapter
      const updated = chapters.find(c => c.chapterNumber === selectedChapter.chapterNumber);
      if (updated) {
        setSelectedChapter({ ...updated, imagePrompt: promptValue });
      }
    } catch (error) {
      console.error('Failed to save prompt:', error);
      alert('Failed to save prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedChapter || !id || !e.target.files?.[0]) return;
    const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
    if (!bookId) return;
    setSaving(true);
    try {
      await adminApi.uploadImage(bookId, selectedChapter.chapterNumber, e.target.files[0]);
      await loadData();
      alert('Image uploaded successfully');
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('Failed to upload image');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      complete: 'badge-success',
      'text_complete': 'badge-info',
      'image_prompt_ready': 'badge-warning',
      'generating_text': 'badge-warning',
      'generating_image_prompt': 'badge-warning',
      failed: 'badge-danger',
      pending: 'badge-info'
    };
    return badges[status] || 'badge';
  };

  const getTotalTokens = (tokenUsage: any[]) => {
    return tokenUsage.reduce((sum, usage) => sum + (usage.totalTokens || 0), 0);
  };

  const handlePublish = async (force: boolean = false) => {
    if (!id) return;
    const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
    if (!bookId) return;

    if (!publishStatus?.ready && !force) {
      const shouldForce = confirm(
        `Book is not ready for publishing (${publishStatus?.issues.length || 0} issues).\n\n` +
        `Issues:\n${publishStatus?.issues.slice(0, 5).join('\n')}${publishStatus?.issues.length > 5 ? `\n...and ${publishStatus.issues.length - 5} more` : ''}\n\n` +
        `Do you want to publish anyway?`
      );
      if (shouldForce) {
        return handlePublish(true);
      }
      return;
    }

    const confirmMessage = force 
      ? `Publish "${book?.title}" despite ${publishStatus?.issues.length || 0} issues? This will generate an EPUB file, but some content may be missing.`
      : `Publish "${book?.title}"? This will generate an EPUB file ready for Kindle publishing.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setPublishing(true);
    try {
      const result = await booksApi.publish(bookId, force);
      if (result.success) {
        alert('Book published successfully! Download will start automatically.');
        await booksApi.downloadPublished(bookId);
        await loadData(); // Reload to get updated status
      }
    } catch (error: any) {
      console.error('Failed to publish book:', error);
      alert(`Failed to publish book: ${error.response?.data?.error || error.message}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleGenerateCoverPrompt = async () => {
    if (!id) return;
    const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
    if (!bookId) return;

    setGeneratingCoverPrompt(true);
    try {
      const result = await booksApi.generateCoverPrompt(bookId);
      if (result.success && result.data) {
        setCoverPromptValue(result.data.coverImagePrompt);
        await loadData(); // Reload to get updated book data
        alert('Cover image prompt generated successfully!');
      }
    } catch (error: any) {
      console.error('Failed to generate cover prompt:', error);
      alert(`Failed to generate cover prompt: ${error.response?.data?.error || error.message}`);
    } finally {
      setGeneratingCoverPrompt(false);
    }
  };

  const handleSaveCoverPrompt = async () => {
    if (!id) return;
    const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
    if (!bookId) return;
    setSaving(true);
    try {
      await adminApi.updateCoverImagePrompt(bookId, coverPromptValue);
      await loadData();
      setEditingCoverPrompt(false);
      alert('Cover image prompt saved successfully!');
    } catch (error: any) {
      console.error('Failed to save cover prompt:', error);
      alert('Failed to save cover image prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !e.target.files?.[0]) return;
    const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
    if (!bookId) return;
    setSaving(true);
    try {
      await adminApi.uploadCoverImage(bookId, e.target.files[0]);
      await loadData();
      alert('Cover image uploaded successfully!');
    } catch (error: any) {
      console.error('Failed to upload cover image:', error);
      alert('Failed to upload cover image');
    } finally {
      setSaving(false);
    }
  };

  const handleRepublish = async () => {
    if (!publishStatus?.ready || !id) {
      alert('Book is not ready for republishing. Please check all chapters are complete with images uploaded.');
      return;
    }

    const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
    if (!bookId) return;

    if (!confirm(`Republish "${book?.title}"? This will regenerate the EPUB file with the latest content.`)) {
      return;
    }

    setRepublishing(true);
    try {
      const result = await booksApi.republish(bookId);
      if (result.success) {
        alert('Book republished successfully! Download will start automatically.');
        await booksApi.downloadPublished(bookId);
        await loadData(); // Reload to get updated status
      }
    } catch (error: any) {
      console.error('Failed to republish book:', error);
      alert(`Failed to republish book: ${error.response?.data?.error || error.message}`);
    } finally {
      setRepublishing(false);
    }
  };

  const handleTogglePublishWithoutChapterImages = async (checked: boolean) => {
    if (!id) return;
    const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
    if (!bookId) return;
    
    setSaving(true);
    try {
      await adminApi.updatePublishWithoutChapterImages(bookId, checked);
      setPublishWithoutChapterImages(checked);
      await loadData(); // Reload to refresh publish status
      alert('Setting updated successfully!');
    } catch (error: any) {
      console.error('Failed to update setting:', error);
      alert('Failed to update setting');
      // Revert checkbox state on error
      setPublishWithoutChapterImages(!checked);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <button onClick={() => navigate('/books')} className="btn btn-secondary">
          ← Back to Books
        </button>
        <h1 style={{ margin: 0 }}>Book Admin: {book?.title || 'Loading...'}</h1>
        {book?.status === 'published' && (
          <>
            <button
              onClick={() => {
                const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
                if (bookId) booksApi.downloadPublished(bookId);
              }}
              className="btn btn-primary"
              style={{ marginRight: '0.5rem' }}
            >
              📥 Download EPUB
            </button>
            <button
              onClick={() => {
                const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
                if (bookId) booksApi.exportDOCX(bookId);
              }}
              className="btn btn-primary"
            >
              📄 Export as DOCX
            </button>
            {publishStatus?.ready && (
              <button
                onClick={handleRepublish}
                className="btn btn-success"
                disabled={republishing}
              >
                {republishing ? 'Republishing...' : '🔄 Republish Book'}
              </button>
            )}
          </>
        )}
        {book?.status !== 'published' && (
          <>
            {publishStatus?.ready ? (
              <button
                onClick={() => handlePublish(false)}
                className="btn btn-success"
                disabled={publishing}
                style={{ marginRight: '0.5rem' }}
              >
                {publishing ? 'Publishing...' : '📚 Publish Book'}
              </button>
            ) : (
              <>
                <span className="badge badge-warning" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', marginRight: '0.5rem' }}>
                  ⚠️ Not Ready ({publishStatus?.issues.length || 0} issues)
                </span>
                <button
                  onClick={() => handlePublish(true)}
                  className="btn btn-warning"
                  disabled={publishing}
                  title="Publish despite issues"
                  style={{ marginRight: '0.5rem' }}
                >
                  {publishing ? 'Publishing...' : '⚠️ Publish Anyway'}
                </button>
              </>
            )}
            <button
              onClick={() => {
                const bookId = typeof id === 'string' ? id : (id as any)?._id || (id as any)?.id;
                if (bookId) booksApi.exportDOCX(bookId);
              }}
              className="btn btn-primary"
              title="Export book as Word document"
            >
              📄 Export as DOCX
            </button>
          </>
        )}
      </div>

      {/* Table of Contents */}
      {book?.outlineId && (book.outlineId as any)?.structure?.chapters && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginTop: 0 }}>📑 Table of Contents</h2>
          <div style={{ marginTop: '1rem' }}>
            {book.prologue && (
              <div style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                <strong>Prologue</strong>
              </div>
            )}
            {(book.outlineId as any).structure.chapters.map((chapter: any) => (
              <div
                key={chapter.chapterNumber}
                style={{
                  padding: '0.75rem 0',
                  borderBottom: '1px solid #eee',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onClick={() => {
                  const chapterData = chapters.find(c => c.chapterNumber === chapter.chapterNumber);
                  if (chapterData) {
                    handleChapterClick(chapterData);
                  }
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '#f8f9fa';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }}
              >
                <div>
                  <strong>Chapter {chapter.chapterNumber}: {chapter.title}</strong>
                  {chapter.summary && (
                    <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                      {chapter.summary.length > 100 ? `${chapter.summary.substring(0, 100)}...` : chapter.summary}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#999' }}>
                  {chapters.find(c => c.chapterNumber === chapter.chapterNumber)?.text ? '✅' : '⏳'}
                </div>
              </div>
            ))}
            {book.epilogue && (
              <div style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                <strong>Epilogue</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Publish Settings */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>⚙️ Publish Settings</h2>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={publishWithoutChapterImages}
              onChange={(e) => handleTogglePublishWithoutChapterImages(e.target.checked)}
              disabled={saving}
              style={{ width: 'auto', cursor: 'pointer' }}
            />
            <span>
              <strong>Publish without chapter images</strong>
            </span>
          </label>
          <small style={{ color: '#666', fontSize: '0.875rem', display: 'block', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
            When enabled, the EPUB will be published without chapter images. Chapters only need text to be complete.
            Cover image will still be included if available.
          </small>
        </div>
      </div>

      {/* Cover Image Section */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>📸 Cover Image</h2>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Cover Image Prompt</h3>
            <div>
              {!editingCoverPrompt ? (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={handleGenerateCoverPrompt}
                    disabled={generatingCoverPrompt}
                    style={{ marginRight: '0.5rem' }}
                  >
                    {generatingCoverPrompt ? 'Generating...' : '🔄 Generate Prompt'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setEditingCoverPrompt(true)}
                  >
                    Edit
                  </button>
                </>
              ) : (
                <div>
                  <button
                    className="btn btn-success"
                    onClick={handleSaveCoverPrompt}
                    disabled={saving}
                    style={{ marginRight: '0.5rem' }}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditingCoverPrompt(false);
                      setCoverPromptValue(book?.coverImagePrompt || '');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
          {editingCoverPrompt ? (
            <textarea
              value={coverPromptValue}
              onChange={(e) => setCoverPromptValue(e.target.value)}
              style={{ width: '100%', minHeight: '200px', fontFamily: 'monospace', fontSize: '0.875rem' }}
              placeholder="Cover image prompt will be generated based on book outline and summary..."
            />
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: '1rem', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.875rem', minHeight: '100px' }}>
              {book?.coverImagePrompt || 'No cover image prompt generated yet. Click "Generate Prompt" to create one based on the book outline.'}
            </div>
          )}
        </div>
        <div>
          <label className="form-group">
            <strong>Upload Cover Image:</strong>
            <input
              type="file"
              accept="image/*"
              onChange={handleCoverImageUpload}
              disabled={saving}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
          {book?.coverImageUrl && (
            <div style={{ marginTop: '1rem' }}>
              <p><strong>Current Cover Image:</strong></p>
              <img
                src={book.coverImageUrl.startsWith('/api/images/') 
                  ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}${book.coverImageUrl}`
                  : book.coverImageUrl}
                alt="Book Cover"
                style={{ maxWidth: '300px', maxHeight: '400px', border: '1px solid #ddd', borderRadius: '4px' }}
                onError={(e) => {
                  console.error('Failed to load cover image:', book.coverImageUrl);
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Publish Status Alert */}
      {publishStatus && !publishStatus.ready && (
        <div className="card" style={{ marginBottom: '2rem', background: '#fff3cd', border: '1px solid #ffc107' }}>
          <h3 style={{ marginTop: 0 }}>⚠️ Publishing Requirements</h3>
          <p>The following issues must be resolved before publishing:</p>
          <ul>
            {publishStatus.issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
        {/* Chapter List */}
        <div className="card">
          <h2>Chapters ({chapters.length})</h2>
          <div style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            {chapters.map((chapter) => (
              <div
                key={chapter.chapterNumber}
                onClick={() => handleChapterClick(chapter)}
                style={{
                  padding: '1rem',
                  marginBottom: '0.5rem',
                  background: selectedChapter?.chapterNumber === chapter.chapterNumber ? '#e7f3ff' : '#f8f9fa',
                  border: selectedChapter?.chapterNumber === chapter.chapterNumber ? '2px solid #007bff' : '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <strong>Chapter {chapter.chapterNumber}</strong>
                    <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                      <span className={getStatusBadge(chapter.status)}>{chapter.status}</span>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
                  <div>Text: {chapter.text ? `✅ ${chapter.metadata?.wordCount || 0} words` : '❌'}</div>
                  <div>Image: {chapter.imageUrl ? '✅' : '❌'}</div>
                  <div>Prompt: {chapter.imagePrompt ? '✅' : '❌'}</div>
                  {chapter.tokenUsage.length > 0 && (
                    <div>Tokens: {getTotalTokens(chapter.tokenUsage).toLocaleString()}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chapter Details */}
        <div>
          {selectedChapter ? (
            <div>
              {/* Text Prompt */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2>Chapter {selectedChapter.chapterNumber} - Text Prompt</h2>
                  {!editingTextPrompt ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setEditingTextPrompt(true)}
                    >
                      Edit
                    </button>
                  ) : (
                    <div>
                      <button
                        className="btn btn-success"
                        onClick={handleSaveTextPrompt}
                        disabled={saving}
                        style={{ marginRight: '0.5rem' }}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditingTextPrompt(false);
                          setTextPromptValue(selectedChapter.textPrompt || '');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                {editingTextPrompt ? (
                  <textarea
                    value={textPromptValue}
                    onChange={(e) => setTextPromptValue(e.target.value)}
                    style={{ width: '100%', minHeight: '300px', fontFamily: 'monospace', fontSize: '0.875rem' }}
                  />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: '1rem', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {selectedChapter.textPrompt || 'No text prompt available'}
                  </div>
                )}
              </div>

              {/* Chapter Text */}
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2>Chapter {selectedChapter.chapterNumber} - Text</h2>
                  {!editingText ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setEditingText(true)}
                    >
                      Edit
                    </button>
                  ) : (
                    <div>
                      <button
                        className="btn btn-success"
                        onClick={handleSaveText}
                        disabled={saving}
                        style={{ marginRight: '0.5rem' }}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditingText(false);
                          setTextValue(selectedChapter.text || '');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                {editingText ? (
                  <textarea
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    style={{ width: '100%', minHeight: '400px', fontFamily: 'monospace', fontSize: '0.875rem' }}
                  />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                    {selectedChapter.text || 'No text available'}
                  </div>
                )}
                {selectedChapter.metadata && (
                  <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
                    <strong>Metadata:</strong>
                    <div>Word Count: {selectedChapter.metadata.wordCount || 0}</div>
                    {selectedChapter.metadata.keywords && (
                      <div>
                        Keywords: {selectedChapter.metadata.keywords.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Image Prompt */}
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2>Image Prompt</h2>
                  {!editingPrompt ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setEditingPrompt(true)}
                    >
                      Edit
                    </button>
                  ) : (
                    <div>
                      <button
                        className="btn btn-success"
                        onClick={handleSavePrompt}
                        disabled={saving}
                        style={{ marginRight: '0.5rem' }}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditingPrompt(false);
                          setPromptValue(selectedChapter.imagePrompt || '');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                {editingPrompt ? (
                  <textarea
                    value={promptValue}
                    onChange={(e) => setPromptValue(e.target.value)}
                    style={{ width: '100%', minHeight: '200px', fontFamily: 'monospace', fontSize: '0.875rem' }}
                  />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: '1rem', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {selectedChapter.imagePrompt || 'No prompt available'}
                  </div>
                )}
                <div style={{ marginTop: '1rem' }}>
                  <label className="form-group">
                    <strong>Upload Image:</strong>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={saving}
                      style={{ marginTop: '0.5rem' }}
                    />
                  </label>
                  {selectedChapter.imageUrl && (
                    <div style={{ marginTop: '1rem' }}>
                      <img
                        src={selectedChapter.imageUrl.startsWith('/api/images/') 
                          ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}${selectedChapter.imageUrl}`
                          : selectedChapter.imageUrl}
                        alt={`Chapter ${selectedChapter.chapterNumber}`}
                        style={{ maxWidth: '100%', maxHeight: '400px', border: '1px solid #ddd', borderRadius: '4px' }}
                        onError={(e) => {
                          console.error('Failed to load image:', selectedChapter.imageUrl);
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Token Usage */}
              {selectedChapter.tokenUsage.length > 0 && (
                <div className="card" style={{ marginTop: '1.5rem' }}>
                  <h2>Token Usage</h2>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #ddd' }}>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Step</th>
                        <th style={{ textAlign: 'right', padding: '0.5rem' }}>Prompt Tokens</th>
                        <th style={{ textAlign: 'right', padding: '0.5rem' }}>Completion Tokens</th>
                        <th style={{ textAlign: 'right', padding: '0.5rem' }}>Total Tokens</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Model</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedChapter.tokenUsage.map((usage: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '0.5rem' }}>{usage.step}</td>
                          <td style={{ textAlign: 'right', padding: '0.5rem' }}>{usage.promptTokens?.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', padding: '0.5rem' }}>{usage.completionTokens?.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', padding: '0.5rem', fontWeight: 'bold' }}>{usage.totalTokens?.toLocaleString()}</td>
                          <td style={{ padding: '0.5rem' }}>{usage.model || '-'}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid #ddd', fontWeight: 'bold' }}>
                        <td style={{ padding: '0.5rem' }}>Total</td>
                        <td style={{ textAlign: 'right', padding: '0.5rem' }}>
                          {selectedChapter.tokenUsage.reduce((sum: number, u: any) => sum + (u.promptTokens || 0), 0).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.5rem' }}>
                          {selectedChapter.tokenUsage.reduce((sum: number, u: any) => sum + (u.completionTokens || 0), 0).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.5rem' }}>
                          {getTotalTokens(selectedChapter.tokenUsage).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.5rem' }}>-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="card">
              <p>Select a chapter from the list to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

