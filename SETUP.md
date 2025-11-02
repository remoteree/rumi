# Quick Setup Guide

## 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install shared package dependencies
cd shared && npm install && npm run build && cd ..

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

Or use the workspace command:
```bash
npm run install:all
```

## 2. Configure Environment

Create `backend/.env`:

```env
MONGODB_URI=mongodb://localhost:27017/ai-kindle
OPENAI_API_KEY=sk-your-key-here
PORT=3001
TEXT_MODEL=gpt-4-turbo-preview
IMAGE_MODEL=dall-e-3
```

## 3. Start MongoDB

Make sure MongoDB is running:
```bash
# Mac (if installed via Homebrew)
brew services start mongodb-community

# Or use MongoDB Atlas (cloud)
# Update MONGODB_URI in .env
```

## 4. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 3 - Worker (optional, for production):**
```bash
cd backend
npm run dev:worker
```

## 5. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Health Check: http://localhost:3001/health

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running
- Check MONGODB_URI in `.env`
- Try connecting with: `mongosh mongodb://localhost:27017/ai-kindle`

### Module Not Found Errors
- Run `npm run install:all` to ensure all packages are installed
- Build shared package: `cd shared && npm run build`

### Port Already in Use
- Change PORT in `.env` or kill the process using the port
- Frontend port can be changed in `frontend/vite.config.ts`

### OpenAI API Errors
- Verify your API key is correct
- Check you have credits/quota available
- Ensure model names are correct (gpt-4-turbo-preview, dall-e-3)

