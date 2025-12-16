// Book Types
export enum BookType {
  GUIDED_JOURNAL = 'guided_journal',
  PROMPT_BOOK = 'prompt_book',
  COLORING_BOOK = 'coloring_book',
  CHILDRENS_PICTURE_BOOK = 'childrens_picture_book',
  SHORT_ILLUSTRATED_NON_FICTION = 'short_illustrated_non_fiction',
  ACTIVITY_PUZZLE_BOOK = 'activity_puzzle_book',
  INSPIRATIONAL_QUOTE_BOOK = 'inspirational_quote_book',
  VISUAL_STORY_ANTHOLOGY = 'visual_story_anthology',
  FIELD_GUIDE = 'field_guide',
  RECIPE_DIY_BOOK = 'recipe_diy_book',
  PLAIN_NON_FICTION = 'plain_non_fiction',
  FICTION_NOVEL = 'fiction_novel'
}

// Niches
export enum Niche {
  WELLNESS_MINDFULNESS = 'wellness_mindfulness',
  ENTREPRENEURSHIP_TECH = 'entrepreneurship_tech',
  COMEDY_CREATIVITY = 'comedy_creativity',
  PRODUCTIVITY_FOCUS = 'productivity_focus',
  FITNESS_NUTRITION = 'fitness_nutrition',
  TRAVEL_CULTURE = 'travel_culture',
  PHILOSOPHY_SELF_REFLECTION = 'philosophy_self_reflection',
  EDUCATION_CAREER = 'education_career',
  PETS_ANIMALS = 'pets_animals',
  SCI_FI_FUTURISM = 'sci_fi_futurism',
  STORY_TELLING_FICTION = 'story_telling_fiction',
  SELF_HELP = 'self_help',
  INVESTIGATIVE_BIOGRAPHY = 'investigative_biography',
  INVESTIGATIVE_CURRENT_AFFAIRS = 'investigative_current_affairs'
}

// Book Type Metadata
export interface BookTypeMetadata {
  id: BookType;
  name: string;
  description: string;
  coreFormat: string;
  idealUseCase: string;
  defaultChapterCount?: number;
  defaultChapterSize?: 'small' | 'medium' | 'large';
}

// Niche Metadata
export interface NicheMetadata {
  id: Niche;
  name: string;
  focus: string;
}

// Writing Style (persisted entity)
export interface WritingStyle {
  _id?: string;
  name: string;
  description: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Prompt Types for different generation steps
export enum PromptType {
  OUTLINE = 'outline',
  CHAPTER_TEXT = 'chapter_text',
  CHAPTER_IMAGE = 'chapter_image',
  STYLE_GUIDE = 'style_guide',
  ART_DIRECTION = 'art_direction',
  COVER_IMAGE = 'cover_image',
  PROLOGUE = 'prologue',
  EPILOGUE = 'epilogue'
}

// Prompt Version
export interface PromptVersion {
  _id?: string;
  bookType: BookType;
  niche: Niche;
  writingStyle?: string; // Optional writing style name
  promptType: PromptType;
  version: number;
  prompt: string;
  variables: string[]; // e.g., ['{{CHAPTER_SUMMARY}}', '{{SERIES_STYLE_GUIDE}}']
  metadata?: {
    tokensUsed?: number;
    createdAt?: Date;
    updatedAt?: Date;
  };
}

// Book Context
export interface BookContext {
  title?: string;
  description?: string;
  targetAudience?: string;
  tone?: string;
  additionalNotes?: string;
  customStyleGuide?: string;
  customArtDirection?: string;
  chapterCount?: number; // User-specified chapter count (overrides default)
  chapterSize?: 'small' | 'medium' | 'large'; // User-specified chapter size (overrides default)
  usePerplexity?: boolean; // Enable Perplexity API for current news integration
  perplexityTopics?: string; // Topics to include in Perplexity searches (comma-separated or newline-separated)
  skipImagePrompts?: boolean; // Skip generating image prompts for chapters
}

// Chapter Outline Node
export interface ChapterOutlineNode {
  chapterNumber: number;
  title: string;
  summary: string;
  visualMotifs: string[];
  emotionalTone: string;
  wordCountTarget?: number;
  sectionHeadings?: string[];
}

// Book Outline
export interface BookOutline {
  _id?: string;
  bookId: string;
  structure: {
    totalChapters: number;
    chapters: ChapterOutlineNode[];
  };
  styleGuide: {
    tone: string;
    voice: string;
    lexicalPreferences: string[];
    lexicalBans: string[];
    preferredMetaphors?: string[];
  };
  artDirection: {
    style: string;
    palette: string[];
    lighting: string;
    medium: string;
    compositionTemplate: string;
    recurringSymbols: string[];
  };
  createdAt?: Date;
}

// Chapter Content
export interface ChapterContent {
  _id?: string;
  bookId: string;
  chapterNumber: number;
  text: string;
  textPrompt?: string; // The actual prompt used to generate the text
  generatedSummary?: string; // Summary generated from the actual chapter content (after text is written)
  imageUrl?: string;
  imagePrompt?: string;
  imageMetadata?: {
    seed?: number;
    model?: string;
    cfg?: number;
    negativePrompt?: string;
  };
  metadata?: {
    wordCount?: number;
    tone?: string;
    keywords?: string[];
    sentiment?: number;
  };
  status: 'pending' | 'generating_text' | 'text_complete' | 'generating_image_prompt' | 'image_prompt_ready' | 'complete' | 'failed';
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Generation Job
export interface GenerationJob {
  _id?: string;
  bookId: string;
  status: 'pending' | 'generating_outline' | 'outline_complete' | 'generating_chapters' | 'complete' | 'failed' | 'paused';
  currentChapter?: number;
  totalChapters?: number;
  progress: {
    outline?: boolean;
    chapters: {
      [chapterNumber: number]: {
        text?: boolean;
        image?: boolean;
      };
    };
  };
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  processingLock?: Date; // Timestamp when job was claimed by a worker (acts as distributed lock)
  createdAt?: Date;
}

// Token Usage
export interface TokenUsage {
  _id?: string;
  bookId: string;
  jobId?: string;
  step: string; // 'outline', 'chapter_1_text', 'chapter_1_image', etc.
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model?: string;
  cost?: number; // in USD
  createdAt?: Date;
}

// Book Model
export interface Book {
  _id?: string;
  title: string;
  bookType: BookType;
  niche: Niche;
  writingStyle?: string; // Writing style name (references persisted WritingStyle)
  context: BookContext;
  outlineId?: string;
  jobId?: string;
  status: 'draft' | 'generating' | 'complete' | 'failed' | 'published';
  publishedAt?: Date;
  publishArtifactUrl?: string;
  coverImageUrl?: string;
  coverImagePrompt?: string;
  publishWithoutChapterImages?: boolean; // If true, skip chapter images when publishing
  prologue?: string;
  prologuePrompt?: string;
  epilogue?: string;
  epiloguePrompt?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Consistency Metrics
export interface ConsistencyMetrics {
  vocabularyOverlap: number;
  readabilityVariance: number;
  sentimentDrift: number;
  toneConsistency: number;
  imageHistogramSimilarity?: number;
}

