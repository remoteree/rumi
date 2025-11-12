# AI Kindle Book Creator

A comprehensive tool for creating AI-generated books for Kindle publishing. Supports 10 book types and 10 niches with intelligent prompt management, sequential generation, and progress tracking.

## Features

- 🎨 **10 Book Types**: Guided Journals, Prompt Books, Coloring Books, Children's Books, and more
- 🎯 **10 Niches**: Wellness, Entrepreneurship, Comedy, Productivity, and more
- 🧠 **Smart Prompt Management**: Version-controlled prompts for each book type/niche combination
- 📊 **Progress Tracking**: Real-time progress monitoring with resumable generation
- 💰 **Token Usage Tracking**: Detailed token usage per step and project
- 🔄 **Sequential Generation**: Outline → Chapters (text + images) with consistency controls
- 👨‍💼 **Admin Dashboard**: View and manage prompt versions

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node.js + Express + TypeScript
- **Database**: MongoDB
- **AI**: OpenAI GPT-4 (text) + DALL-E 3 (images)
- **Worker**: Node-cron for sequential job processing

## Project Structure

```
.
├── frontend/          # React + Vite frontend
├── backend/           # Node.js + Express backend
├── shared/            # Shared TypeScript types and constants
└── package.json       # Root workspace configuration
```

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- MongoDB (local or cloud instance)
- OpenAI API key

### Installation

1. **Clone and install dependencies:**

```bash
npm run install:all
```

2. **Set up environment variables:**

Create `backend/.env`:

```env
MONGODB_URI=mongodb://localhost:27017/ai-kindle
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
TEXT_MODEL=gpt-4-turbo-preview
IMAGE_MODEL=dall-e-3
```

3. **Build shared package:**

```bash
cd shared && npm run build
```

### Running the Application

**Development mode (frontend + backend):**

```bash
npm run dev
```

**Run worker separately (for production):**

```bash
npm run dev:worker
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## Usage

### Creating a Book

1. Navigate to the home page and select a **Book Type** and **Niche**
2. Fill in book details (title, description, target audience, tone)
3. Review and create the book
4. Click "Start Generation" to begin the AI generation process

### Generation Process

The system follows this sequential workflow:

1. **Prompt Generation** (if first time for combo):
   - Generates prompts for: Style Guide, Art Direction, Outline, Chapter Text, Chapter Image
   - Stores as version 1

2. **Outline Generation**:
   - Creates style guide and art direction
   - Generates book outline with chapters, visual motifs, and emotional tones

3. **Chapter Generation** (sequential):
   - For each chapter:
     - Generate text using style guide and outline
     - Generate image using art direction and visual motifs
   - Progress is tracked and resumable

### Admin Dashboard

Access `/admin` to:
- View prompt versions for any book type/niche combination
- Generate or refresh prompts
- See prompt templates and variables

## Architecture

### Prompt System

Prompts are version-controlled and stored per book type/niche combination. Each prompt type has:
- Template with variables (e.g., `{{CHAPTER_SUMMARY}}`, `{{STYLE_GUIDE}}`)
- Version history
- Metadata (tokens used, created/updated dates)

### Generation Worker

The worker runs as a cron job (every minute) and:
- Processes pending jobs sequentially
- Handles failures gracefully
- Resumes from last completed step
- Tracks progress in database

### Consistency Features

- **Style Guide**: Enforces tone, voice, and lexical preferences
- **Art Direction**: Maintains visual consistency (palette, style, lighting)
- **Thematic Callbacks**: References previous chapters for narrative cohesion
- **Metadata Tracking**: Stores keywords, sentiment, word count per chapter

## API Endpoints

### Books
- `POST /api/books` - Create book
- `GET /api/books` - List all books
- `GET /api/books/:id` - Get book details
- `PUT /api/books/:id` - Update book
- `POST /api/books/:id/start-generation` - Start generation

### Jobs
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/:id` - Get job details with progress
- `GET /api/jobs/book/:bookId/progress` - Get book progress

### Prompts
- `GET /api/prompts/:bookType/:niche` - Get prompt versions
- `POST /api/prompts/generate/:bookType/:niche` - Generate prompts
- `PUT /api/prompts/:id` - Update prompt
- `POST /api/prompts/:id/version` - Create new version

## Database Models

- **Book**: Main book entity
- **PromptVersion**: Versioned prompts per combo
- **BookOutline**: Generated outline with style guide and art direction
- **ChapterContent**: Individual chapter text and images
- **GenerationJob**: Job tracking and progress
- **TokenUsage**: Token consumption tracking

## Production Deployment

### EC2 Setup

1. Install Node.js and MongoDB on EC2
2. Set up environment variables
3. Build all packages: `npm run build`
4. Start backend: `cd backend && npm start`
5. Start worker: `cd backend && npm run start:worker` (or use PM2/systemd)

### Recommended Setup

- Use PM2 or systemd to manage processes
- Set up MongoDB Atlas for production database
- Configure reverse proxy (nginx) for frontend
- Set up monitoring and logging

## Notes

- The worker processes one job at a time to avoid API rate limits
- Token usage is tracked per step for cost analysis
- Generation can be paused and resumed automatically
- All prompts are stored for future iterations

## License

MIT






