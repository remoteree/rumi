import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookType, Niche, BOOK_TYPES, NICHES, BookContext } from '@ai-kindle/shared';
import { booksApi } from '../api/client';
import '../index.css';

export default function BookCreator() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [bookType, setBookType] = useState<BookType | ''>('');
  const [niche, setNiche] = useState<Niche | ''>('');
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
  const [error, setError] = useState('');

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

      const result = await booksApi.create({
        title,
        bookType,
        niche,
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
        {/* Step 1: Book Type & Niche */}
        {step === 1 && (
          <div className="card">
            <h2>Step 1: Select Book Type & Niche</h2>
            
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

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(2)}
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

