import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Publisher, EditingRequestStatus } from '@ai-kindle/shared';
import { publishersApi, editingRequestsApi, booksApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { showToast } from '../utils/toast';
import '../index.css';

export default function FindPublisher() {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [selectedPublisher, setSelectedPublisher] = useState<string>('');
  const [message, setMessage] = useState('');
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setError('');
    try {
      const [publishersResult, booksResult, requestsResult] = await Promise.allSettled([
        publishersApi.getAll(),
        booksApi.getAll(),
        editingRequestsApi.getMyRequests()
      ]);

      // Handle publishers
      if (publishersResult.status === 'fulfilled' && publishersResult.value.success && publishersResult.value.data) {
        setPublishers(publishersResult.value.data);
      } else if (publishersResult.status === 'rejected') {
        console.error('Failed to load publishers:', publishersResult.reason);
        const errorMsg = publishersResult.reason?.response?.data?.error || publishersResult.reason?.message || 'Failed to load publishers';
        setError(prev => prev ? `${prev}; ${errorMsg}` : errorMsg);
      }

      // Handle books
      if (booksResult.status === 'fulfilled' && booksResult.value.success && booksResult.value.data) {
        setBooks(booksResult.value.data);
      } else if (booksResult.status === 'rejected') {
        console.error('Failed to load books:', booksResult.reason);
        const errorMsg = booksResult.reason?.response?.data?.error || booksResult.reason?.message || 'Failed to load books';
        setError(prev => prev ? `${prev}; ${errorMsg}` : errorMsg);
      }

      // Handle requests (optional - don't fail if this fails)
      if (requestsResult.status === 'fulfilled' && requestsResult.value.success && requestsResult.value.data) {
        setMyRequests(requestsResult.value.data);
      } else if (requestsResult.status === 'rejected') {
        console.error('Failed to load requests:', requestsResult.reason);
        // Don't show error for requests if user doesn't have permission (403)
        // This is expected for admins who aren't writers
        if (requestsResult.reason?.response?.status !== 403) {
          const errorMsg = requestsResult.reason?.response?.data?.error || requestsResult.reason?.message || 'Failed to load requests';
          setError(prev => prev ? `${prev}; ${errorMsg}` : errorMsg);
        }
      }
    } catch (err: any) {
      console.error('Unexpected error loading data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async () => {
    if (!selectedBook || !selectedPublisher) {
      setError('Please select both a book and a publisher');
      return;
    }

    try {
      const result = await editingRequestsApi.create({
        bookId: selectedBook,
        publisherId: selectedPublisher,
        message
      });

      if (result.success) {
        await loadData();
        setSelectedBook('');
        setSelectedPublisher('');
        setMessage('');
        showToast.success('Request sent successfully!');
      } else {
        setError(result.error || 'Failed to send request');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send request');
    }
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <h1>Find a Publisher</h1>

      {error && (
        <div className="card" style={{ background: '#f8d7da', color: '#721c24', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div className="grid grid-2" style={{ gap: '2rem', marginTop: '2rem' }}>
        {/* Request Form */}
        <div className="card">
          <h2>Request Editing Services</h2>
          <div className="form-group">
            <label>Select Book</label>
            {books.length === 0 ? (
              <p>No books available. <Link to="/books">Create a book first</Link>.</p>
            ) : (
              <select
                value={selectedBook}
                onChange={(e) => setSelectedBook(e.target.value)}
                style={{ width: '100%', padding: '0.5rem' }}
              >
                <option value="">Select a book</option>
                {books.map((book) => (
                  <option key={book._id} value={book._id}>
                    {book.title} ({book.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group">
            <label>Select Publisher</label>
            {publishers.length === 0 ? (
              <p>No publishers available.</p>
            ) : (
              <select
                value={selectedPublisher}
                onChange={(e) => setSelectedPublisher(e.target.value)}
                style={{ width: '100%', padding: '0.5rem' }}
              >
                <option value="">Select a publisher</option>
                {publishers.map((pub) => (
                  <option key={pub._id} value={pub._id}>
                    {pub.name} {pub.rates?.editingRate && `($${pub.rates.editingRate}/${pub.rates.editingRateType})`}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group">
            <label>Message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Add any specific requirements or notes..."
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleRequest}
            disabled={!selectedBook || !selectedPublisher}
            style={{ width: '100%' }}
          >
            Send Request
          </button>
        </div>

        {/* Available Publishers */}
        <div className="card">
          <h2>Available Publishers</h2>
          {publishers.length === 0 ? (
            <p>No publishers available at the moment.</p>
          ) : (
            <div>
              {publishers.map((pub) => (
                <div
                  key={pub._id}
                  style={{
                    padding: '1rem',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    marginBottom: '1rem'
                  }}
                >
                  <h3>{pub.name}</h3>
                  {pub.description && <p>{pub.description}</p>}
                  {pub.rates?.editingRate && (
                    <p><strong>Editing Rate:</strong> ${pub.rates.editingRate} per {pub.rates.editingRateType}</p>
                  )}
                  {pub.rates?.proofreadingRate && (
                    <p><strong>Proofreading Rate:</strong> ${pub.rates.proofreadingRate} per {pub.rates.proofreadingRateType}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* My Requests */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <h2>My Requests</h2>
        {myRequests.length === 0 ? (
          <p>No requests yet.</p>
        ) : (
          <div>
            {myRequests.map((request) => (
              <div
                key={request._id}
                style={{
                  padding: '1rem',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  background: request.status === EditingRequestStatus.ACCEPTED ? '#d4edda' :
                    request.status === EditingRequestStatus.REJECTED ? '#f8d7da' : '#fff3cd'
                }}
              >
                <h3>{(request as any).bookId?.title || 'Book'}</h3>
                <p><strong>Publisher:</strong> {(request as any).publisherId?.name || 'Unknown'}</p>
                <p><strong>Status:</strong> {request.status}</p>
                {request.message && <p><strong>Your Message:</strong> {request.message}</p>}
                {request.responseMessage && <p><strong>Response:</strong> {request.responseMessage}</p>}
                {request.estimatedCost && <p><strong>Estimated Cost:</strong> ${request.estimatedCost}</p>}
                {request.status === EditingRequestStatus.ACCEPTED && (
                  <p style={{ color: '#155724', fontWeight: 'bold' }}>
                    ✓ Request accepted! The publisher can now edit your book.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

