import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookType, Niche, WritingStyle, BOOK_TYPES, NICHES, BookContext } from '@ai-kindle/shared';
import { booksApi, writingStylesApi } from '../api/client';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  Stepper,
  Step,
  StepLabel,
  Grid,
  Card,
  CardContent,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  FormControlLabel,
  Checkbox,
  Divider,
} from '@mui/material';
import { Add, ArrowBack, ArrowForward, CheckCircle } from '@mui/icons-material';

const steps = ['Book Type & Niche', 'Book Details', 'Review & Create'];

export default function BookCreator() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
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
        const refreshResult = await writingStylesApi.getAll();
        if (refreshResult.success && refreshResult.data) {
          setWritingStyles(refreshResult.data);
        }
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

  const handleNext = () => {
    if (activeStep === 0) {
      if (!bookType || !niche) {
        setError('Please select both book type and niche');
        return;
      }
      if (showCustomWritingStyle && (customWritingStyle.name || customWritingStyle.description)) {
        setError('Please save the writing style before proceeding, or cancel to select an existing style.');
        return;
      }
    } else if (activeStep === 1) {
      if (!title) {
        setError('Please enter a book title');
        return;
      }
    }
    setError('');
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setError('');
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
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

      let finalWritingStyle: string | undefined = undefined;
      
      if (selectedWritingStyleId) {
        const selectedStyle = writingStyles.find(ws => ws._id === selectedWritingStyleId);
        if (selectedStyle) {
          finalWritingStyle = selectedStyle.name;
        }
      } else if (showCustomWritingStyle && customWritingStyle.name && customWritingStyle.description) {
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
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" fontWeight={600} gutterBottom>
        Create New Book
      </Typography>

      <Paper elevation={2} sx={{ p: 3, mt: 3 }}>
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          {/* Step 1: Book Type, Niche & Writing Style */}
          {activeStep === 0 && (
            <Box>
              <Typography variant="h5" gutterBottom fontWeight={600}>
                Select Book Type, Niche & Writing Style
              </Typography>

              <Box sx={{ mt: 3, mb: 4 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Book Type *
                </Typography>
                <Grid container spacing={2}>
                  {BOOK_TYPES.map((type) => (
                    <Grid item xs={12} sm={6} md={4} key={type.id}>
                      <Card
                        sx={{
                          cursor: 'pointer',
                          border: bookType === type.id ? 2 : 1,
                          borderColor: bookType === type.id ? 'primary.main' : 'divider',
                          bgcolor: bookType === type.id ? 'primary.50' : 'background.paper',
                          transition: 'all 0.2s',
                          '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: 3,
                          },
                        }}
                        onClick={() => setBookType(type.id)}
                      >
                        <CardContent>
                          <Typography variant="h6" fontWeight={600} gutterBottom>
                            {type.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {type.description}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              <Box sx={{ mt: 4, mb: 4 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Niche *
                </Typography>
                <Grid container spacing={2}>
                  {NICHES.map((n) => (
                    <Grid item xs={12} sm={6} key={n.id}>
                      <Card
                        sx={{
                          cursor: 'pointer',
                          border: niche === n.id ? 2 : 1,
                          borderColor: niche === n.id ? 'primary.main' : 'divider',
                          bgcolor: niche === n.id ? 'primary.50' : 'background.paper',
                          transition: 'all 0.2s',
                          '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: 3,
                          },
                        }}
                        onClick={() => setNiche(n.id)}
                      >
                        <CardContent>
                          <Typography variant="h6" fontWeight={600} gutterBottom>
                            {n.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {n.focus}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              <Box sx={{ mt: 4 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Writing Style
                </Typography>
                <Button
                  variant={showCustomWritingStyle ? 'contained' : 'outlined'}
                  startIcon={<Add />}
                  onClick={() => {
                    setShowCustomWritingStyle(!showCustomWritingStyle);
                    if (!showCustomWritingStyle) {
                      setSelectedWritingStyleId('');
                    }
                  }}
                  sx={{ mb: 2 }}
                >
                  {showCustomWritingStyle ? 'Creating New Style' : 'Add New Writing Style'}
                </Button>

                {showCustomWritingStyle ? (
                  <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                    <TextField
                      fullWidth
                      label="Style Name *"
                      value={customWritingStyle.name}
                      onChange={(e) => setCustomWritingStyle({ ...customWritingStyle, name: e.target.value })}
                      placeholder="e.g., Minimalist, Stream-of-Consciousness"
                      margin="normal"
                    />
                    <TextField
                      fullWidth
                      label="Description *"
                      value={customWritingStyle.description}
                      onChange={(e) => setCustomWritingStyle({ ...customWritingStyle, description: e.target.value })}
                      placeholder="Describe the writing style characteristics..."
                      multiline
                      rows={3}
                      margin="normal"
                    />
                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                      <Button
                        variant="contained"
                        onClick={handleSaveWritingStyle}
                        disabled={savingWritingStyle || !customWritingStyle.name.trim() || !customWritingStyle.description.trim()}
                        startIcon={savingWritingStyle ? <CircularProgress size={20} /> : <CheckCircle />}
                      >
                        {savingWritingStyle ? 'Saving...' : 'Save Writing Style'}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setShowCustomWritingStyle(false);
                          setCustomWritingStyle({ name: '', description: '' });
                        }}
                      >
                        Cancel
                      </Button>
                    </Box>
                  </Paper>
                ) : (
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    {writingStyles.length === 0 ? (
                      <Grid item xs={12}>
                        <Alert severity="info">
                          No writing styles yet. Click "Add New Writing Style" to create one.
                        </Alert>
                      </Grid>
                    ) : (
                      writingStyles.map((style) => (
                        <Grid item xs={12} sm={6} md={4} key={style._id}>
                          <Card
                            sx={{
                              cursor: 'pointer',
                              border: selectedWritingStyleId === style._id ? 2 : 1,
                              borderColor: selectedWritingStyleId === style._id ? 'primary.main' : 'divider',
                              bgcolor: selectedWritingStyleId === style._id ? 'primary.50' : 'background.paper',
                            }}
                            onClick={() => setSelectedWritingStyleId(style._id || '')}
                          >
                            <CardContent>
                              <Typography variant="h6" fontWeight={600}>
                                {style.name}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                {style.description}
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                      ))
                    )}
                  </Grid>
                )}
              </Box>
            </Box>
          )}

          {/* Step 2: Book Details */}
          {activeStep === 1 && (
            <Box>
              <Typography variant="h5" gutterBottom fontWeight={600}>
                Book Details & Context
              </Typography>

              <TextField
                fullWidth
                label="Book Title *"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                margin="normal"
                autoFocus
              />

              <TextField
                fullWidth
                label="Description"
                value={context.description}
                onChange={(e) => setContext({ ...context, description: e.target.value })}
                multiline
                rows={4}
                margin="normal"
                placeholder="Describe what this book is about..."
              />

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Target Audience"
                    value={context.targetAudience}
                    onChange={(e) => setContext({ ...context, targetAudience: e.target.value })}
                    margin="normal"
                    placeholder="e.g., aspiring founders, mid-career engineers"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Tone"
                    value={context.tone}
                    onChange={(e) => setContext({ ...context, tone: e.target.value })}
                    margin="normal"
                    placeholder="e.g., empathetic, humorous, concise"
                  />
                </Grid>
              </Grid>

              <TextField
                fullWidth
                label="Additional Notes"
                value={context.additionalNotes}
                onChange={(e) => setContext({ ...context, additionalNotes: e.target.value })}
                multiline
                rows={3}
                margin="normal"
                placeholder="Any additional context or requirements..."
              />

              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Chapter Count"
                    type="number"
                    value={context.chapterCount || BOOK_TYPES.find(t => t.id === bookType)?.defaultChapterCount || ''}
                    onChange={(e) => setContext({ 
                      ...context, 
                      chapterCount: e.target.value ? parseInt(e.target.value) : undefined 
                    })}
                    margin="normal"
                    inputProps={{ min: 1, max: 100 }}
                    helperText={`Default: ${BOOK_TYPES.find(t => t.id === bookType)?.defaultChapterCount || 'Not set'}`}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    select
                    label="Chapter Size"
                    value={context.chapterSize || BOOK_TYPES.find(t => t.id === bookType)?.defaultChapterSize || ''}
                    onChange={(e) => setContext({ 
                      ...context, 
                      chapterSize: e.target.value ? e.target.value as 'small' | 'medium' | 'large' : undefined 
                    })}
                    margin="normal"
                    SelectProps={{ native: true }}
                  >
                    <option value="">Use default</option>
                    <option value="small">Small (300-600 words)</option>
                    <option value="medium">Medium (800-1200 words)</option>
                    <option value="large">Large (1500-2500 words)</option>
                  </TextField>
                </Grid>
              </Grid>

              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={context.usePerplexity || false}
                      onChange={(e) => setContext({ ...context, usePerplexity: e.target.checked })}
                    />
                  }
                  label="Include Current News (Perplexity API)"
                />
                {context.usePerplexity && (
                  <TextField
                    fullWidth
                    label="Topics for Perplexity Search"
                    value={context.perplexityTopics || ''}
                    onChange={(e) => setContext({ ...context, perplexityTopics: e.target.value })}
                    multiline
                    rows={4}
                    margin="normal"
                    placeholder="Enter topics, keywords, or themes to search for..."
                    helperText="These topics will be included in Perplexity searches for each chapter."
                  />
                )}
              </Box>

              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={context.skipImagePrompts || false}
                      onChange={(e) => setContext({ ...context, skipImagePrompts: e.target.checked })}
                    />
                  }
                  label="Skip Image Prompts"
                />
              </Box>
            </Box>
          )}

          {/* Step 3: Review & Create */}
          {activeStep === 2 && (
            <Box>
              <Typography variant="h5" gutterBottom fontWeight={600}>
                Review & Create
              </Typography>

              <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid item xs={12} md={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">Book Type</Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {BOOK_TYPES.find(t => t.id === bookType)?.name}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">Niche</Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {NICHES.find(n => n.id === niche)?.name}
                    </Typography>
                  </Paper>
                </Grid>
                {(selectedWritingStyleId || (showCustomWritingStyle && customWritingStyle.name)) && (
                  <Grid item xs={12}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary">Writing Style</Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {showCustomWritingStyle && customWritingStyle.name 
                          ? customWritingStyle.name 
                          : writingStyles.find(ws => ws._id === selectedWritingStyleId)?.name}
                      </Typography>
                    </Paper>
                  </Grid>
                )}
                <Grid item xs={12}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">Title</Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {title}
                    </Typography>
                  </Paper>
                </Grid>
                {context.description && (
                  <Grid item xs={12}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary">Description</Typography>
                      <Typography variant="body1">{context.description}</Typography>
                    </Paper>
                  </Grid>
                )}
              </Grid>
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
            <Button
              disabled={activeStep === 0}
              onClick={handleBack}
              startIcon={<ArrowBack />}
            >
              Back
            </Button>
            {activeStep === steps.length - 1 ? (
              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} /> : <CheckCircle />}
              >
                {loading ? 'Creating...' : 'Create Book'}
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={handleNext}
                endIcon={<ArrowForward />}
              >
                Next
              </Button>
            )}
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}
