import { BookTypeMetadata, NicheMetadata, BookType, Niche } from './types';

export const BOOK_TYPES: BookTypeMetadata[] = [
  {
    id: BookType.GUIDED_JOURNAL,
    name: 'Guided Journal / Workbook',
    description: 'Short lessons + reflection prompts + exercises',
    coreFormat: 'Short lessons + reflection prompts + exercises',
    idealUseCase: 'Self-improvement, wellness, career, productivity',
    defaultChapterCount: 30,
    defaultChapterSize: 'medium' // small, medium, large
  },
  {
    id: BookType.PROMPT_BOOK,
    name: 'Prompt Book',
    description: '200–500 creative or reflective prompts grouped by theme',
    coreFormat: '200–500 creative or reflective prompts grouped by theme',
    idealUseCase: 'Writing, comedy, journaling, art practice',
    defaultChapterCount: 25,
    defaultChapterSize: 'small'
  },
  {
    id: BookType.COLORING_BOOK,
    name: 'Coloring Book',
    description: 'Line-art pages + captions or mantras',
    coreFormat: 'Line-art pages + captions or mantras',
    idealUseCase: 'Mindfulness, kids, humor, animals, travel',
    defaultChapterCount: 30,
    defaultChapterSize: 'small'
  },
  {
    id: BookType.CHILDRENS_PICTURE_BOOK,
    name: "Children's Picture Book",
    description: 'Short story + illustration per page',
    coreFormat: 'Short story + illustration per page',
    idealUseCase: "Kids' moral stories, adventure, curiosity",
    defaultChapterCount: 20,
    defaultChapterSize: 'small'
  },
  {
    id: BookType.SHORT_ILLUSTRATED_NON_FICTION,
    name: 'Short Illustrated Non-Fiction',
    description: '8–12 concise chapters with visuals',
    coreFormat: '8–12 concise chapters with visuals',
    idealUseCase: 'Tech explainers, crash courses, philosophy',
    defaultChapterCount: 10,
    defaultChapterSize: 'medium'
  },
  {
    id: BookType.ACTIVITY_PUZZLE_BOOK,
    name: 'Activity / Puzzle Book',
    description: 'Puzzles, games, brainteasers + answer key',
    coreFormat: 'Puzzles, games, brainteasers + answer key',
    idealUseCase: 'Logic, language learning, trivia',
    defaultChapterCount: 20,
    defaultChapterSize: 'small'
  },
  {
    id: BookType.INSPIRATIONAL_QUOTE_BOOK,
    name: 'Inspirational Quote Book',
    description: 'Themed quotes + reflections or mini essays',
    coreFormat: 'Themed quotes + reflections or mini essays',
    idealUseCase: 'Motivation, philosophy, creativity',
    defaultChapterCount: 15,
    defaultChapterSize: 'small'
  },
  {
    id: BookType.VISUAL_STORY_ANTHOLOGY,
    name: 'Visual Story Anthology',
    description: 'Multiple short illustrated stories',
    coreFormat: 'Multiple short illustrated stories',
    idealUseCase: 'Sci-fi, humor, speculative fiction',
    defaultChapterCount: 12,
    defaultChapterSize: 'medium'
  },
  {
    id: BookType.FIELD_GUIDE,
    name: 'Field Guide / Companion Manual',
    description: 'Taxonomy tables + diagrams + notes',
    coreFormat: 'Taxonomy tables + diagrams + notes',
    idealUseCase: 'Nature, travel, architecture, animals',
    defaultChapterCount: 15,
    defaultChapterSize: 'medium'
  },
  {
    id: BookType.RECIPE_DIY_BOOK,
    name: 'Recipe / DIY Book',
    description: 'Structured entries (ingredients / steps / tips)',
    coreFormat: 'Structured entries (ingredients / steps / tips)',
    idealUseCase: 'Food, fitness, crafts, sustainability',
    defaultChapterCount: 25,
    defaultChapterSize: 'small'
  }
];

export const NICHES: NicheMetadata[] = [
  {
    id: Niche.WELLNESS_MINDFULNESS,
    name: 'Wellness & Mindfulness',
    focus: 'Gratitude journals, calm coloring, meditation workbooks'
  },
  {
    id: Niche.ENTREPRENEURSHIP_TECH,
    name: 'Entrepreneurship & Tech Careers',
    focus: 'Startup planners, AI guides, founder motivation'
  },
  {
    id: Niche.COMEDY_CREATIVITY,
    name: 'Comedy & Creativity',
    focus: 'Joke prompt books, improv workbooks, humorous anthologies'
  },
  {
    id: Niche.PRODUCTIVITY_FOCUS,
    name: 'Productivity & Focus',
    focus: 'Habit trackers, deep-work planners, ADHD journals'
  },
  {
    id: Niche.FITNESS_NUTRITION,
    name: 'Fitness & Nutrition',
    focus: 'Workout logs, seed-mix recipes, health planners'
  },
  {
    id: Niche.TRAVEL_CULTURE,
    name: 'Travel & Culture',
    focus: 'Illustrated travel guides, bucket-list journals'
  },
  {
    id: Niche.PHILOSOPHY_SELF_REFLECTION,
    name: 'Philosophy & Self-Reflection',
    focus: 'Stoic quote books, modern Rumi essays'
  },
  {
    id: Niche.EDUCATION_CAREER,
    name: 'Education & Career Paths',
    focus: 'Crash-course explainers, skill-learning companions'
  },
  {
    id: Niche.PETS_ANIMALS,
    name: 'Pets & Animals',
    focus: 'Animal coloring books, pet journals, fun facts'
  },
  {
    id: Niche.SCI_FI_FUTURISM,
    name: 'Sci-Fi & Futurism',
    focus: 'Illustrated short stories, AI-themed visual tales'
  },
  {
    id: Niche.STORY_TELLING_FICTION,
    name: 'Story-Telling (Fiction)',
    focus: 'Fictional narratives, character-driven stories, plot-driven adventures'
  }
];

