import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookType, Niche, WritingStyle, BOOK_TYPES, NICHES, BookContext } from '@ai-kindle/shared';
import { booksApi, writingStylesApi } from '../api/client';
import '../index.css';

export default function BookCreator() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [bookType, setBookType] = useState<BookType | ''>('');
  const [niche, setNiche] = useState<Niche | ''>('');
  const [writingStyles, setWritingStyles] = useState<WritingStyle[]>([]);
  const [selectedWritingStyleId, setSelectedWritingStyleId] = useState<string>('');
  const [customWritingStyle, setCustomWritingStyle] = useState({ name: '', description: '' });
  const [showCustomWritingStyle, setShowCustomWritingStyle] = useState(false);
  const [title, setTitle] = useState('');
  const [context, setContext] = useState<BookContext>({
    description: '',
    targetAudience: '',
    tone: '',
    additionalNotes: '',
    chapterCount: undefined,
    chapterSize: undefined
  });
  const [loading, setLoading] = useState(false);
  const [savingWritingStyle, setSavingWritingStyle] = useState(false);
  const [error, setError] = useState('');

  // Fetch writing styles on component mount
  useEffect(() => {
    const fetchWritingStyles = async () => {
      try {
        const result = await writingStylesApi.getAll();
        if (result.success && result.data) {
          setWritingStyles(result.data);
        }
      } catch (err) {
        console.error('Failed to fetch writing styles:', err);
      }
    };
    fetchWritingStyles();
  }, []);

  const handleSaveWritingStyle = async () => {
    if (!customWritingStyle.name.trim() || !customWritingStyle.description.trim()) {
      setError('Please fill in both name and description for the writing style');
      return;
    }

    setSavingWritingStyle(true);
    setError('');

    try {
      const result = await writingStylesApi.create({
        name: customWritingStyle.name.trim(),
        description: customWritingStyle.description.trim()
      });

      if (result.success && result.data) {
        // Refresh the writing styles list
        const refreshResult = await writingStylesApi.getAll();
        if (refreshResult.success && refreshResult.data) {
          setWritingStyles(refreshResult.data);
        }

        // Switch to selecting the newly saved style
        setSelectedWritingStyleId(result.data._id || '');
        setShowCustomWritingStyle(false);
        setCustomWritingStyle({ name: '', description: '' });
      } else {
        setError(result.error || 'Failed to save writing style');
      }
    } catch (err: any) {
      if (err.response?.status === 400) {
        setError('A writing style with this name already exists. Please choose a different name.');
      } else {
        setError('Failed to save writing style: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setSavingWritingStyle(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!bookType || !niche || !title) {
        setError('Please fill in all required fields');
        setLoading(false);
        return;
      }

      // Determine writing style: use selected style
      let finalWritingStyle: string | undefined = undefined;
      
      if (selectedWritingStyleId) {
        const selectedStyle = writingStyles.find(ws => ws._id === selectedWritingStyleId);
        if (selectedStyle) {
          finalWritingStyle = selectedStyle.name;
        }
      } else if (showCustomWritingStyle && customWritingStyle.name && customWritingStyle.description) {
        // If user hasn't saved the custom style yet, save it now
        try {
          const createResult = await writingStylesApi.create({
            name: customWritingStyle.name.trim(),
            description: customWritingStyle.description.trim()
          });
          if (createResult.success && createResult.data) {
            finalWritingStyle = createResult.data.name;
          } else {
            setError('Failed to save writing style: ' + (createResult.error || 'Unknown error'));
            setLoading(false);
            return;
          }
        } catch (err: any) {
          // If style already exists, use the name
          if (err.response?.status === 400) {
            finalWritingStyle = customWritingStyle.name.trim();
          } else {
            setError('Failed to save writing style: ' + (err.message || 'Unknown error'));
            setLoading(false);
            return;
          }
        }
      }

      const result = await booksApi.create({
        title,
        bookType,
        niche,
        writingStyle: finalWritingStyle,
        context
      });

      if (result.success && result.data) {
        navigate(`/books/${result.data.book._id}`);
      } else {
        setError(result.error || 'Failed to create book');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>Create New Book</h1>

      {error && (
        <div className="card" style={{ background: '#f8d7da', color: '#721c24', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Step 1: Book Type, Niche & Writing Style */}
        {step === 1 && (
          <div className="card">
            <h2>Step 1: Select Book Type, Niche & Writing Style</h2>
            
            <div className="form-group">
              <label>Book Type *</label>
              <div className="grid grid-3">
                {BOOK_TYPES.map((type) => (
                  <div
                    key={type.id}
                    onClick={() => setBookType(type.id)}
                    style={{
                      padding: '1rem',
                      border: bookType === type.id ? '2px solid #007bff' : '1px solid #ddd',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: bookType === type.id ? '#e7f3ff' : 'white'
                    }}
                  >
                    <h3>{type.name}</h3>
                    <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                      {type.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Niche *</label>
              <div className="grid grid-2">
                {NICHES.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => setNiche(n.id)}
                    style={{
                      padding: '1rem',
                      border: niche === n.id ? '2px solid #007bff' : '1px solid #ddd',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: niche === n.id ? '#e7f3ff' : 'white'
                    }}
                  >
                    <h3>{n.name}</h3>
                    <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                      {n.focus}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Writing Style</label>
              <div style={{ marginBottom: '1rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomWritingStyle(!showCustomWritingStyle);
                    if (!showCustomWritingStyle) {
                      setSelectedWritingStyleId('');
                    }
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    background: showCustomWritingStyle ? '#e7f3ff' : 'white',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  {showCustomWritingStyle ? '✓ Creating New Style' : '+ Add New Writing Style'}
                </button>
              </div>

              {showCustomWritingStyle ? (
                <div style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px', background: '#f8f9fa', marginBottom: '1rem' }}>
                  <div className="form-group">
                    <label>Style Name *</label>
                    <input
                      type="text"
                      value={customWritingStyle.name}
                      onChange={(e) => setCustomWritingStyle({ ...customWritingStyle, name: e.target.value })}
                      placeholder="e.g., Minimalist, Stream-of-Consciousness"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Description *</label>
                    <textarea
                      value={customWritingStyle.description}
                      onChange={(e) => setCustomWritingStyle({ ...customWritingStyle, description: e.target.value })}
                      placeholder="Describe the writing style characteristics..."
                      style={{ width: '100%', minHeight: '80px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button
                      type="button"
                      onClick={handleSaveWritingStyle}
                      disabled={savingWritingStyle || !customWritingStyle.name.trim() || !customWritingStyle.description.trim()}
                      className="btn btn-success"
                      style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                    >
                      {savingWritingStyle ? 'Saving...' : 'Save Writing Style'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCustomWritingStyle(false);
                        setCustomWritingStyle({ name: '', description: '' });
                      }}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                  <small style={{ color: '#666', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                    Save the writing style to use it for this book and future books.
                  </small>
                </div>
              ) : (
                <div>
                  {writingStyles.length === 0 ? (
                    <div style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px', background: '#f8f9fa', textAlign: 'center', color: '#666' }}>
                      <p>No writing styles yet. Click "+ Add New Writing Style" to create one.</p>
                    </div>
                  ) : (
                    <div className="grid grid-3">
                      {writingStyles.map((style) => (
                        <div
                          key={style._id}
                          onClick={() => setSelectedWritingStyleId(style._id || '')}
                          style={{
                            padding: '1rem',
                            border: selectedWritingStyleId === style._id ? '2px solid #007bff' : '1px solid #ddd',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            background: selectedWritingStyleId === style._id ? '#e7f3ff' : 'white'
                          }}
                        >
                          <h3>{style.name}</h3>
                          <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                            {style.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                // If user is creating a custom style but hasn't saved it, show error
                if (showCustomWritingStyle && (customWritingStyle.name || customWritingStyle.description)) {
                  setError('Please save the writing style before proceeding, or cancel to select an existing style.');
                  return;
                }
                setStep(2);
              }}
              disabled={!bookType || !niche}
            >
              Next: Book Details
            </button>
          </div>
        )}

        {/* Step 2: Book Details */}
        {step === 2 && (
          <div className="card">
            <h2>Step 2: Book Details & Context</h2>
            
            <div className="form-group">
              <label>Book Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter book title"
                required
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={context.description}
                onChange={(e) => setContext({ ...context, description: e.target.value })}
                placeholder="Describe what this book is about..."
              />
            </div>

            <div className="form-group">
              <label>Target Audience</label>
              <input
                type="text"
                value={context.targetAudience}
                onChange={(e) => setContext({ ...context, targetAudience: e.target.value })}
                placeholder="e.g., aspiring founders, mid-career engineers, children age 7-9"
              />
            </div>

            <div className="form-group">
              <label>Tone</label>
              <input
                type="text"
                value={context.tone}
                onChange={(e) => setContext({ ...context, tone: e.target.value })}
                placeholder="e.g., empathetic, humorous, concise"
              />
            </div>

            <div className="form-group">
              <label>Additional Notes</label>
              <textarea
                value={context.additionalNotes}
                onChange={(e) => setContext({ ...context, additionalNotes: e.target.value })}
                placeholder="Any additional context or requirements..."
              />
            </div>

            <div className="grid grid-2" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label>Chapter Count</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={context.chapterCount || BOOK_TYPES.find(t => t.id === bookType)?.defaultChapterCount || ''}
                  onChange={(e) => setContext({ 
                    ...context, 
                    chapterCount: e.target.value ? parseInt(e.target.value) : undefined 
                  })}
                  placeholder="Number of chapters"
                />
                <small style={{ color: '#666', fontSize: '0.875rem' }}>
                  Default: {BOOK_TYPES.find(t => t.id === bookType)?.defaultChapterCount || 'Not set'}
                </small>
              </div>

              <div className="form-group">
                <label>Chapter Size</label>
                <select
                  value={context.chapterSize || BOOK_TYPES.find(t => t.id === bookType)?.defaultChapterSize || ''}
                  onChange={(e) => setContext({ 
                    ...context, 
                    chapterSize: e.target.value ? e.target.value as 'small' | 'medium' | 'large' : undefined 
                  })}
                >
                  <option value="">Use default</option>
                  <option value="small">Small (300-600 words)</option>
                  <option value="medium">Medium (800-1200 words)</option>
                  <option value="large">Large (1500-2500 words)</option>
                </select>
                <small style={{ color: '#666', fontSize: '0.875rem' }}>
                  Default: {BOOK_TYPES.find(t => t.id === bookType)?.defaultChapterSize || 'Not set'}
                </small>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={context.usePerplexity || false}
                  onChange={(e) => setContext({ ...context, usePerplexity: e.target.checked })}
                  style={{ width: 'auto', cursor: 'pointer' }}
                />
                <span>
                  <strong>Include Current News (Perplexity API)</strong>
                </span>
              </label>
              <small style={{ color: '#666', fontSize: '0.875rem', display: 'block', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
                When enabled, Perplexity API will fetch current news and recent developments for each chapter.
                OpenAI will still be used for concept explanations and content generation.
                Requires PERPLEXITY_API_KEY to be configured.
              </small>
              {context.usePerplexity && (
                <div style={{ marginTop: '1rem', marginLeft: '1.5rem' }}>
                  <label>
                    <strong>Topics for Perplexity Search:</strong>
                    <textarea
                      value={context.perplexityTopics || ''}
                      onChange={(e) => setContext({ ...context, perplexityTopics: e.target.value })}
                      placeholder="Enter topics, keywords, or themes to search for (one per line or comma-separated).&#10;&#10;Examples:&#10;AI developments&#10;Health trends&#10;Business news&#10;Technology updates"
                      style={{ width: '100%', minHeight: '120px', marginTop: '0.5rem', fontFamily: 'inherit', fontSize: '0.875rem', padding: '0.5rem' }}
                    />
                  </label>
                  <small style={{ color: '#666', fontSize: '0.875rem', display: 'block', marginTop: '0.25rem' }}>
                    These topics will be included in Perplexity searches for each chapter to ensure relevant current news and developments are found.
                  </small>
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={context.skipImagePrompts || false}
                  onChange={(e) => setContext({ ...context, skipImagePrompts: e.target.checked })}
                  style={{ width: 'auto', cursor: 'pointer' }}
                />
                <span>
                  <strong>Skip Image Prompts</strong>
                </span>
              </label>
              <small style={{ color: '#666', fontSize: '0.875rem', display: 'block', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
                When enabled, no image prompts will be generated for chapters. This speeds up generation and reduces costs.
                You can still add images manually later if needed.
              </small>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep(3)}
                disabled={!title}
              >
                Next: Review
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Create */}
        {step === 3 && (
          <div className="card">
            <h2>Step 3: Review & Create</h2>
            
            <div className="card" style={{ background: '#f8f9fa' }}>
              <h3>Book Type</h3>
              <p>{BOOK_TYPES.find(t => t.id === bookType)?.name}</p>
            </div>

            <div className="card" style={{ background: '#f8f9fa' }}>
              <h3>Niche</h3>
              <p>{NICHES.find(n => n.id === niche)?.name}</p>
            </div>

            {(selectedWritingStyleId || (showCustomWritingStyle && customWritingStyle.name)) && (
              <div className="card" style={{ background: '#f8f9fa' }}>
                <h3>Writing Style</h3>
                {showCustomWritingStyle && customWritingStyle.name ? (
                  <div>
                    <p><strong>{customWritingStyle.name}</strong></p>
                    <p style={{ fontSize: '0.875rem', color: '#666' }}>{customWritingStyle.description}</p>
                  </div>
                ) : selectedWritingStyleId ? (
                  (() => {
                    const selectedStyle = writingStyles.find(ws => ws._id === selectedWritingStyleId);
                    return selectedStyle ? (
                      <div>
                        <p><strong>{selectedStyle.name}</strong></p>
                        <p style={{ fontSize: '0.875rem', color: '#666' }}>{selectedStyle.description}</p>
                      </div>
                    ) : null;
                  })()
                ) : null}
              </div>
            )}

            <div className="card" style={{ background: '#f8f9fa' }}>
              <h3>Title</h3>
              <p>{title}</p>
            </div>

            {context.description && (
              <div className="card" style={{ background: '#f8f9fa' }}>
                <h3>Description</h3>
                <p>{context.description}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep(2)}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn btn-success"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Book'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

