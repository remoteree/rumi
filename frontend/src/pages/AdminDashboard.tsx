import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookType, Niche, BOOK_TYPES, NICHES, PromptType } from '@ai-kindle/shared';
import { promptsApi, adminApi } from '../api/client';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'prompts' | 'jobs'>('prompts');
  
  // Prompts tab state
  const [selectedBookType, setSelectedBookType] = useState<BookType | ''>('');
  const [selectedNiche, setSelectedNiche] = useState<Niche | ''>('');
  const [prompts, setPrompts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

  // Jobs tab state
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [requeueing, setRequeueing] = useState<string | null>(null);

  useEffect(() => {
    if (selectedBookType && selectedNiche && activeTab === 'prompts') {
      loadPrompts();
    }
  }, [selectedBookType, selectedNiche, activeTab]);

  useEffect(() => {
    if (activeTab === 'jobs') {
      loadJobs();
      // Refresh jobs every 10 seconds
      const interval = setInterval(loadJobs, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

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
      alert('Job requeued successfully');
    } catch (error: any) {
      alert(`Failed to requeue job: ${error.message}`);
    } finally {
      setRequeueing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: 'badge-info',
      generating_outline: 'badge-warning',
      outline_complete: 'badge-info',
      generating_chapters: 'badge-warning',
      complete: 'badge-success',
      failed: 'badge-danger',
      paused: 'badge-info'
    };
    return badges[status] || 'badge-info';
  };

  const groupedPrompts = prompts.reduce((acc: any, prompt: any) => {
    if (!acc[prompt.promptType]) {
      acc[prompt.promptType] = [];
    }
    acc[prompt.promptType].push(prompt);
    return acc;
  }, {});

  return (
    <div className="container">
      <h1>Admin Dashboard</h1>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '2px solid #ddd' }}>
        <button
          onClick={() => setActiveTab('prompts')}
          className="btn"
          style={{
            background: activeTab === 'prompts' ? '#007bff' : 'transparent',
            color: activeTab === 'prompts' ? 'white' : '#007bff',
            border: '1px solid #007bff',
            borderRadius: '4px 4px 0 0',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer'
          }}
        >
          Prompt Management
        </button>
        <button
          onClick={() => setActiveTab('jobs')}
          className="btn"
          style={{
            background: activeTab === 'jobs' ? '#007bff' : 'transparent',
            color: activeTab === 'jobs' ? 'white' : '#007bff',
            border: '1px solid #007bff',
            borderRadius: '4px 4px 0 0',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer'
          }}
        >
          Generation Jobs
        </button>
      </div>

      {activeTab === 'jobs' ? (
        <div>
          <div className="card">
            <h2>All Generation Jobs</h2>
            {jobsLoading ? (
              <p>Loading jobs...</p>
            ) : jobs.length === 0 ? (
              <p>No jobs found</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd', background: '#f8f9fa' }}>
                      <th style={{ textAlign: 'left', padding: '0.75rem' }}>Book</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem' }}>Status</th>
                      <th style={{ textAlign: 'center', padding: '0.75rem' }}>Progress</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem' }}>Tokens</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem' }}>Cost</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem' }}>Chapters</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem' }}>Created</th>
                      <th style={{ textAlign: 'center', padding: '0.75rem' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job: any) => (
                      <tr key={job._id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '0.75rem' }}>
                          <Link
                            to={`/books/${job.bookId}/admin`}
                            style={{ textDecoration: 'none', color: '#007bff', fontWeight: '500' }}
                          >
                            {job.bookTitle}
                          </Link>
                          <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                            {BOOK_TYPES.find(t => t.id === job.bookType)?.name} • {NICHES.find(n => n.id === job.niche)?.name}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <span className={`badge ${getStatusBadge(job.status)}`}>
                            {job.status}
                          </span>
                          {job.error && (
                            <div style={{ fontSize: '0.75rem', color: '#dc3545', marginTop: '0.25rem', maxWidth: '200px' }}>
                              {job.error}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          {job.totalChapters ? (
                            <div>
                              <div>{job.currentChapter || 0} / {job.totalChapters}</div>
                              <div className="progress-bar" style={{ width: '100px', margin: '0.25rem auto 0' }}>
                                <div
                                  className="progress-bar-fill"
                                  style={{
                                    width: `${((job.currentChapter || 0) / job.totalChapters) * 100}%`
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#666' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          {job.tokenUsage.total.toLocaleString()}
                          {job.tokenUsage.breakdown > 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#666' }}>
                              {job.tokenUsage.breakdown} steps
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          {job.tokenUsage.cost > 0 ? `$${job.tokenUsage.cost.toFixed(4)}` : '-'}
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <div style={{ fontSize: '0.875rem' }}>
                            <div>Text: {job.chapters.withText}/{job.chapters.total}</div>
                            <div>Image: {job.chapters.withImage}/{job.chapters.total}</div>
                            <div>Complete: {job.chapters.complete}/{job.chapters.total}</div>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#666' }}>
                          {job.createdAt ? new Date(job.createdAt).toLocaleString() : '-'}
                          {job.completedAt && (
                            <div style={{ marginTop: '0.25rem' }}>
                              Completed: {new Date(job.completedAt).toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          {(job.status === 'failed' || job.status === 'paused') && (
                            <button
                              onClick={() => handleRequeue(job._id)}
                              className="btn btn-success"
                              disabled={requeueing === job._id}
                              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                            >
                              {requeueing === job._id ? 'Requeuing...' : 'Requeue'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <h2>Prompt Management</h2>

          <div className="card">
            <h2>Select Book Type & Niche</h2>
            <div className="grid grid-2" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label>Book Type</label>
                <select
                  value={selectedBookType}
                  onChange={(e) => setSelectedBookType(e.target.value as BookType)}
                >
                  <option value="">Select...</option>
                  {BOOK_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Niche</label>
                <select
                  value={selectedNiche}
                  onChange={(e) => setSelectedNiche(e.target.value as Niche)}
                >
                  <option value="">Select...</option>
                  {NICHES.map((niche) => (
                    <option key={niche.id} value={niche.id}>{niche.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleGeneratePrompts}
              className="btn btn-primary"
              disabled={!selectedBookType || !selectedNiche || loading}
            >
              {loading ? 'Generating...' : 'Generate/Refresh Prompts'}
            </button>
          </div>

          {selectedBookType && selectedNiche && (
            <div className="card">
              <h2>Prompt Versions</h2>
              {loading ? (
                <p>Loading...</p>
              ) : prompts.length === 0 ? (
                <p>No prompts found. Click "Generate/Refresh Prompts" to create them.</p>
              ) : (
                Object.entries(groupedPrompts).map(([promptType, versions]: [string, any]) => (
                  <div key={promptType} style={{ marginBottom: '2rem' }}>
                    <h3>{promptType}</h3>
                    {versions.map((prompt: any) => (
                      <div key={prompt._id} className="card" style={{ background: '#f8f9fa', marginTop: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>Version {prompt.version}</strong>
                            {prompt.metadata?.createdAt && (
                              <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                                Created: {new Date(prompt.metadata.createdAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                          <button
                            className="btn btn-secondary"
                            onClick={() => setExpandedPrompt(
                              expandedPrompt === prompt._id ? null : prompt._id
                            )}
                          >
                            {expandedPrompt === prompt._id ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        {expandedPrompt === prompt._id && (
                          <div style={{ marginTop: '1rem' }}>
                            <div style={{ marginBottom: '1rem' }}>
                              <strong>Variables:</strong>
                              <div style={{ marginTop: '0.5rem' }}>
                                {prompt.variables.map((v: string, i: number) => (
                                  <span key={i} className="badge badge-info" style={{ marginRight: '0.5rem' }}>
                                    {v}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <strong>Prompt:</strong>
                              <pre style={{
                                background: 'white',
                                padding: '1rem',
                                borderRadius: '4px',
                                overflow: 'auto',
                                marginTop: '0.5rem',
                                fontSize: '0.875rem',
                                whiteSpace: 'pre-wrap'
                              }}>
                                {prompt.prompt}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

