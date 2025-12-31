import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BookModel } from '../models/Book.js';
import { ChapterContentModel } from '../models/ChapterContent.js';
import { BookOutlineModel } from '../models/BookOutline.js';
import { AudiobookJobModel } from '../models/AudiobookJob.js';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Audio storage directory
const AUDIO_DIR = path.resolve(__dirname, '../uploads/audio/books');

// TTS Pricing (per 1,000 characters)
const TTS_PRICING = {
  'tts-1': 0.015,
  'tts-1-hd': 0.030
};

// Max characters per TTS request (OpenAI limit is 4096, but we'll use 4000 to be safe)
const MAX_CHARS_PER_REQUEST = 4000;

// Lazy initialization of OpenAI client
let openaiInstance: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiInstance;
}

/**
 * Clean text for TTS (remove markdown, extra whitespace, etc.)
 */
function cleanTextForTTS(text: string): string {
  return text
    // Remove markdown headers
    .replace(/^#+\s+/gm, '')
    // Remove markdown bold/italic
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    // Remove markdown links but keep text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Split text into chunks that fit within TTS character limits
 */
function splitTextIntoChunks(text: string, maxChars: number = MAX_CHARS_PER_REQUEST): string[] {
  const chunks: string[] = [];
  const cleanedText = cleanTextForTTS(text);
  
  // If text is already within limit, return as single chunk
  if (cleanedText.length <= maxChars) {
    return [cleanedText];
  }
  
  // Split by paragraphs first (double newlines)
  const paragraphs = cleanedText.split(/\n\n+/);
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    const testChunk = currentChunk 
      ? currentChunk + '\n\n' + paragraph 
      : paragraph;
    
    if (testChunk.length <= maxChars) {
      currentChunk = testChunk;
    } else {
      // Current chunk is full, save it
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      // If paragraph is too long, split by sentences
      if (paragraph.length > maxChars) {
        const sentences = paragraph.split(/([.!?]+\s+)/);
        let sentenceChunk = '';
        
        for (let i = 0; i < sentences.length; i++) {
          const sentence = sentences[i];
          const testSentenceChunk = sentenceChunk 
            ? sentenceChunk + sentence 
            : sentence;
          
          if (testSentenceChunk.length <= maxChars) {
            sentenceChunk = testSentenceChunk;
          } else {
            // Sentence chunk is full, save it
            if (sentenceChunk.trim()) {
              chunks.push(sentenceChunk.trim());
            }
            
            // If single sentence is too long, split by words
            if (sentence.length > maxChars) {
              const words = sentence.split(/\s+/);
              let wordChunk = '';
              
              for (const word of words) {
                const testWordChunk = wordChunk 
                  ? wordChunk + ' ' + word 
                  : word;
                
                if (testWordChunk.length <= maxChars) {
                  wordChunk = testWordChunk;
                } else {
                  if (wordChunk) {
                    chunks.push(wordChunk);
                  }
                  wordChunk = word;
                }
              }
              
              sentenceChunk = wordChunk;
            } else {
              sentenceChunk = sentence;
            }
          }
        }
        
        currentChunk = sentenceChunk;
      } else {
        currentChunk = paragraph;
      }
    }
  }
  
  // Add remaining chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Map emotional tone to TTS delivery instructions
 * This helps guide the voice to match the chapter's emotional tone/vibe
 */
function getToneInstructions(emotionalTone: string): string {
  if (!emotionalTone) return '';
  
  const toneLower = emotionalTone.toLowerCase();
  
  // Map common emotional tones to delivery instructions
  const toneMappings: Record<string, string> = {
    'calm': 'Speak in a calm, measured, peaceful tone.',
    'reflection': 'Speak in a thoughtful, contemplative, reflective tone.',
    'calm reflection': 'Speak in a calm, thoughtful, contemplative tone with peaceful pacing.',
    'determined': 'Speak with determination, confidence, and resolve.',
    'optimism': 'Speak with an upbeat, positive, hopeful tone.',
    'determined optimism': 'Speak with confidence, positivity, and forward momentum.',
    'excitement': 'Speak with energy, enthusiasm, and excitement.',
    'urgency': 'Speak with urgency, intensity, and quick pacing.',
    'mystery': 'Speak in a mysterious, intriguing, slightly suspenseful tone.',
    'melancholy': 'Speak in a somber, reflective, slightly sad tone.',
    'joy': 'Speak with joy, happiness, and lightheartedness.',
    'serious': 'Speak in a serious, authoritative, professional tone.',
    'playful': 'Speak in a playful, light, fun tone.',
    'dramatic': 'Speak with drama, emphasis, and theatrical delivery.',
    'gentle': 'Speak gently, softly, with care and warmth.',
    'energetic': 'Speak with high energy, enthusiasm, and fast pacing.',
    'peaceful': 'Speak peacefully, calmly, with soothing delivery.',
    'intense': 'Speak with intensity, focus, and powerful delivery.',
    'hopeful': 'Speak with hope, optimism, and uplifting tone.',
    'somber': 'Speak in a somber, serious, reflective tone.',
    'inspiring': 'Speak with inspiration, motivation, and uplifting energy.',
    'contemplative': 'Speak thoughtfully, slowly, with deep reflection.',
    'confident': 'Speak with confidence, authority, and assurance.',
    'warm': 'Speak warmly, with friendliness and approachability.',
    'suspenseful': 'Speak with suspense, tension, and intrigue.',
    'triumphant': 'Speak with triumph, victory, and celebration.',
    'nostalgic': 'Speak with nostalgia, warmth, and reminiscence.',
    'adventurous': 'Speak with adventure, excitement, and boldness.',
    'romantic': 'Speak with romance, tenderness, and emotional connection.',
    'humorous': 'Speak with humor, lightness, and playfulness.',
    'philosophical': 'Speak thoughtfully, with depth and wisdom.',
    'urgent': 'Speak with urgency, quick pacing, and intensity.',
    'relaxed': 'Speak in a relaxed, easygoing, comfortable tone.',
    'passionate': 'Speak with passion, intensity, and emotional depth.',
    'analytical': 'Speak clearly, precisely, with logical structure.',
    'empathetic': 'Speak with empathy, understanding, and compassion.',
    'motivational': 'Speak with motivation, encouragement, and drive.',
    'mysterious': 'Speak mysteriously, with intrigue and suspense.',
    'celebratory': 'Speak with celebration, joy, and festivity.',
    'reassuring': 'Speak reassuringly, with comfort and confidence.',
    'challenging': 'Speak with challenge, provocation, and intensity.',
    'soothing': 'Speak soothingly, with calm and comfort.',
    'dynamic': 'Speak dynamically, with varied pacing and energy.',
    'focused': 'Speak with focus, clarity, and precision.',
    'expressive': 'Speak expressively, with emotion and variation.',
    'balanced': 'Speak in a balanced, measured, harmonious tone.',
    'vibrant': 'Speak vibrantly, with energy and liveliness.',
    'grounded': 'Speak in a grounded, stable, reliable tone.',
    'elevated': 'Speak with elevation, sophistication, and refinement.',
    'raw': 'Speak with raw emotion, authenticity, and intensity.',
    'polished': 'Speak with polish, refinement, and professionalism.',
    'intimate': 'Speak intimately, with closeness and personal connection.',
    'grand': 'Speak grandly, with scale and importance.',
    'subtle': 'Speak subtly, with nuance and understatement.',
    'bold': 'Speak boldly, with confidence and assertiveness.',
    'delicate': 'Speak delicately, with care and gentleness.',
    'powerful': 'Speak powerfully, with strength and impact.'
  };
  
  // Check for exact match first
  if (toneMappings[toneLower]) {
    return toneMappings[toneLower];
  }
  
  // Check for partial matches
  for (const [key, instruction] of Object.entries(toneMappings)) {
    if (toneLower.includes(key) || key.includes(toneLower)) {
      return instruction;
    }
  }
  
  // Default: analyze the tone and create a generic instruction
  if (toneLower.includes('calm') || toneLower.includes('peaceful') || toneLower.includes('serene')) {
    return 'Speak in a calm, peaceful, serene tone.';
  } else if (toneLower.includes('excit') || toneLower.includes('energetic') || toneLower.includes('vibrant')) {
    return 'Speak with energy, excitement, and vibrant delivery.';
  } else if (toneLower.includes('sad') || toneLower.includes('melancholy') || toneLower.includes('somber')) {
    return 'Speak in a somber, reflective, slightly melancholic tone.';
  } else if (toneLower.includes('happy') || toneLower.includes('joy') || toneLower.includes('cheerful')) {
    return 'Speak with joy, happiness, and cheerful delivery.';
  } else if (toneLower.includes('serious') || toneLower.includes('grave') || toneLower.includes('solemn')) {
    return 'Speak in a serious, authoritative, professional tone.';
  } else if (toneLower.includes('mysterious') || toneLower.includes('mystery') || toneLower.includes('intrigue')) {
    return 'Speak in a mysterious, intriguing, slightly suspenseful tone.';
  } else if (toneLower.includes('urgent') || toneLower.includes('urgent') || toneLower.includes('quick')) {
    return 'Speak with urgency, intensity, and quick pacing.';
  } else if (toneLower.includes('thoughtful') || toneLower.includes('reflective') || toneLower.includes('contemplative')) {
    return 'Speak thoughtfully, with reflection and contemplation.';
  } else if (toneLower.includes('confident') || toneLower.includes('determined') || toneLower.includes('resolute')) {
    return 'Speak with confidence, determination, and resolve.';
  } else if (toneLower.includes('gentle') || toneLower.includes('soft') || toneLower.includes('tender')) {
    return 'Speak gently, softly, with care and warmth.';
  } else if (toneLower.includes('dramatic') || toneLower.includes('theatrical') || toneLower.includes('intense')) {
    return 'Speak with drama, emphasis, and theatrical delivery.';
  } else if (toneLower.includes('playful') || toneLower.includes('light') || toneLower.includes('fun')) {
    return 'Speak in a playful, light, fun tone.';
  } else if (toneLower.includes('inspiring') || toneLower.includes('motivational') || toneLower.includes('uplifting')) {
    return 'Speak with inspiration, motivation, and uplifting energy.';
  } else if (toneLower.includes('warm') || toneLower.includes('friendly') || toneLower.includes('approachable')) {
    return 'Speak warmly, with friendliness and approachability.';
  } else if (toneLower.includes('hopeful') || toneLower.includes('optimistic') || toneLower.includes('positive')) {
    return 'Speak with hope, optimism, and positive energy.';
  } else if (toneLower.includes('suspenseful') || toneLower.includes('tension') || toneLower.includes('thrilling')) {
    return 'Speak with suspense, tension, and intrigue.';
  } else if (toneLower.includes('triumphant') || toneLower.includes('victory') || toneLower.includes('celebration')) {
    return 'Speak with triumph, victory, and celebration.';
  } else if (toneLower.includes('nostalgic') || toneLower.includes('reminiscent') || toneLower.includes('memory')) {
    return 'Speak with nostalgia, warmth, and reminiscence.';
  } else if (toneLower.includes('adventurous') || toneLower.includes('bold') || toneLower.includes('daring')) {
    return 'Speak with adventure, excitement, and boldness.';
  } else if (toneLower.includes('romantic') || toneLower.includes('tender') || toneLower.includes('loving')) {
    return 'Speak with romance, tenderness, and emotional connection.';
  } else if (toneLower.includes('humorous') || toneLower.includes('funny') || toneLower.includes('comic')) {
    return 'Speak with humor, lightness, and playfulness.';
  } else if (toneLower.includes('philosophical') || toneLower.includes('wise') || toneLower.includes('deep')) {
    return 'Speak thoughtfully, with depth and wisdom.';
  } else if (toneLower.includes('relaxed') || toneLower.includes('easygoing') || toneLower.includes('comfortable')) {
    return 'Speak in a relaxed, easygoing, comfortable tone.';
  } else if (toneLower.includes('passionate') || toneLower.includes('intense') || toneLower.includes('emotional')) {
    return 'Speak with passion, intensity, and emotional depth.';
  } else if (toneLower.includes('analytical') || toneLower.includes('logical') || toneLower.includes('precise')) {
    return 'Speak clearly, precisely, with logical structure.';
  } else if (toneLower.includes('empathetic') || toneLower.includes('understanding') || toneLower.includes('compassion')) {
    return 'Speak with empathy, understanding, and compassion.';
  } else if (toneLower.includes('reassuring') || toneLower.includes('comforting') || toneLower.includes('supportive')) {
    return 'Speak reassuringly, with comfort and confidence.';
  } else if (toneLower.includes('challenging') || toneLower.includes('provocative') || toneLower.includes('intense')) {
    return 'Speak with challenge, provocation, and intensity.';
  } else if (toneLower.includes('soothing') || toneLower.includes('calming') || toneLower.includes('comforting')) {
    return 'Speak soothingly, with calm and comfort.';
  } else if (toneLower.includes('dynamic') || toneLower.includes('varied') || toneLower.includes('changing')) {
    return 'Speak dynamically, with varied pacing and energy.';
  } else if (toneLower.includes('focused') || toneLower.includes('clear') || toneLower.includes('precise')) {
    return 'Speak with focus, clarity, and precision.';
  } else if (toneLower.includes('expressive') || toneLower.includes('emotional') || toneLower.includes('varied')) {
    return 'Speak expressively, with emotion and variation.';
  } else if (toneLower.includes('balanced') || toneLower.includes('measured') || toneLower.includes('harmonious')) {
    return 'Speak in a balanced, measured, harmonious tone.';
  } else if (toneLower.includes('vibrant') || toneLower.includes('lively') || toneLower.includes('energetic')) {
    return 'Speak vibrantly, with energy and liveliness.';
  } else if (toneLower.includes('grounded') || toneLower.includes('stable') || toneLower.includes('reliable')) {
    return 'Speak in a grounded, stable, reliable tone.';
  } else if (toneLower.includes('elevated') || toneLower.includes('sophisticated') || toneLower.includes('refined')) {
    return 'Speak with elevation, sophistication, and refinement.';
  } else if (toneLower.includes('raw') || toneLower.includes('authentic') || toneLower.includes('genuine')) {
    return 'Speak with raw emotion, authenticity, and intensity.';
  } else if (toneLower.includes('polished') || toneLower.includes('refined') || toneLower.includes('professional')) {
    return 'Speak with polish, refinement, and professionalism.';
  } else if (toneLower.includes('intimate') || toneLower.includes('close') || toneLower.includes('personal')) {
    return 'Speak intimately, with closeness and personal connection.';
  } else if (toneLower.includes('grand') || toneLower.includes('scale') || toneLower.includes('important')) {
    return 'Speak grandly, with scale and importance.';
  } else if (toneLower.includes('subtle') || toneLower.includes('nuanced') || toneLower.includes('understated')) {
    return 'Speak subtly, with nuance and understatement.';
  } else if (toneLower.includes('bold') || toneLower.includes('assertive') || toneLower.includes('confident')) {
    return 'Speak boldly, with confidence and assertiveness.';
  } else if (toneLower.includes('delicate') || toneLower.includes('careful') || toneLower.includes('gentle')) {
    return 'Speak delicately, with care and gentleness.';
  } else if (toneLower.includes('powerful') || toneLower.includes('strong') || toneLower.includes('impact')) {
    return 'Speak powerfully, with strength and impact.';
  }
  
  // Fallback: use the emotional tone as-is with a generic instruction
  return `Speak in a tone that reflects: ${emotionalTone}.`;
}

/**
 * Generate audio for a text chunk
 * Note: OpenAI TTS doesn't have a direct tone parameter, but the text content
 * itself influences delivery. The emotional tone is logged for reference.
 */
async function generateAudioChunk(
  text: string,
  voice: string,
  model: 'tts-1' | 'tts-1-hd',
  toneInstruction?: string
): Promise<Buffer> {
  const openai = getOpenAIClient();
  
  // Note: We log the tone instruction but don't prepend it to the text
  // because OpenAI TTS doesn't support tone parameters and prepending
  // instructions would be spoken. The text content itself should already
  // reflect the emotional tone, which will naturally influence delivery.
  if (toneInstruction) {
    // Log for debugging/reference
    // The text content itself should guide the voice delivery
  }
  
  const response = await openai.audio.speech.create({
    model,
    voice: voice as any,
    input: text
  });
  
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

/**
 * Concatenate multiple audio buffers into one
 * Note: This is a simple concatenation. For production, you might want to use a proper audio library
 * like ffmpeg to ensure proper audio stitching with silence between chunks.
 */
async function concatenateAudioBuffers(buffers: Buffer[]): Promise<Buffer> {
  // Simple concatenation - for MP3 files, this should work
  // For better quality, consider using ffmpeg to add silence between chunks
  return Buffer.concat(buffers);
}

/**
 * Estimate cost for converting a book to audiobook
 */
export async function estimateAudiobookCost(
  bookId: string,
  voice: string,
  model: 'tts-1' | 'tts-1-hd' = 'tts-1'
): Promise<{ totalCharacters: number; estimatedCost: number; chapterBreakdown: Array<{ chapterNumber: number; characters: number; cost: number }> }> {
  const book = await BookModel.findById(bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  const chapters = await ChapterContentModel.find({ bookId })
    .sort({ chapterNumber: 1 });

  if (chapters.length === 0) {
    throw new Error('No chapters found');
  }

  const pricePer1kChars = TTS_PRICING[model];
  let totalCharacters = 0;
  const chapterBreakdown: Array<{ chapterNumber: number; characters: number; cost: number }> = [];

  // Count prologue if exists
  if (book.prologue) {
    const prologueChars = cleanTextForTTS(book.prologue).length;
    totalCharacters += prologueChars;
  }

  // Count chapters
  for (const chapter of chapters) {
    if (!chapter.text) continue;
    
    const chapterChars = cleanTextForTTS(chapter.text).length;
    totalCharacters += chapterChars;
    chapterBreakdown.push({
      chapterNumber: chapter.chapterNumber,
      characters: chapterChars,
      cost: (chapterChars / 1000) * pricePer1kChars
    });
  }

  // Count epilogue if exists
  if (book.epilogue) {
    const epilogueChars = cleanTextForTTS(book.epilogue).length;
    totalCharacters += epilogueChars;
  }

  const estimatedCost = (totalCharacters / 1000) * pricePer1kChars;

  return {
    totalCharacters,
    estimatedCost,
    chapterBreakdown
  };
}

/**
 * Check if audio file exists for a chapter
 */
async function chapterAudioExists(bookId: string, chapterNumber: number): Promise<boolean> {
  const audioFilePath = path.join(AUDIO_DIR, bookId, `chapter_${chapterNumber}.mp3`);
  try {
    await fs.access(audioFilePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if prologue audio exists
 */
async function prologueAudioExists(bookId: string): Promise<boolean> {
  const audioFilePath = path.join(AUDIO_DIR, bookId, 'prologue.mp3');
  try {
    await fs.access(audioFilePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if epilogue audio exists
 */
async function epilogueAudioExists(bookId: string): Promise<boolean> {
  const audioFilePath = path.join(AUDIO_DIR, bookId, 'epilogue.mp3');
  try {
    await fs.access(audioFilePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate audio for a single chapter
 */
export async function generateChapterAudio(
  bookId: string,
  chapterNumber: number,
  voice: string,
  model: 'tts-1' | 'tts-1-hd',
  jobId: string,
  skipIfExists: boolean = true
): Promise<string> {
  const chapter = await ChapterContentModel.findOne({ bookId, chapterNumber });
  if (!chapter || !chapter.text) {
    throw new Error(`Chapter ${chapterNumber} not found or has no text`);
  }

  // Check if audio already exists
  const audioFilePath = path.join(AUDIO_DIR, bookId, `chapter_${chapterNumber}.mp3`);
  if (skipIfExists) {
    const exists = await chapterAudioExists(bookId, chapterNumber);
    if (exists) {
      console.log(`⏭️  [AUDIOBOOK] Chapter ${chapterNumber} audio already exists, skipping generation...`);
      
      // Update progress if not already set
      const job = await AudiobookJobModel.findById(jobId);
      if (job) {
        const progress = job.progress || new Map();
        const chapterKey = chapterNumber.toString();
        const progressMap = progress instanceof Map ? progress : new Map(Object.entries(progress));
        if (!progressMap.get(chapterKey)) {
          progressMap.set(chapterKey, true);
          await AudiobookJobModel.updateOne(
            { _id: jobId },
            { progress: progressMap, currentChapter: chapterNumber }
          );
        }
      }
      
      return audioFilePath;
    }
  }

  // Get the book outline to find the chapter's emotional tone
  const book = await BookModel.findById(bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  let emotionalTone: string | undefined;
  if (book.outlineId) {
    const { BookOutlineModel } = await import('../models/BookOutline');
    const outline = await BookOutlineModel.findById(book.outlineId);
    if (outline) {
      const chapterOutline = outline.structure.chapters.find(
        (c: any) => c.chapterNumber === chapterNumber
      );
      if (chapterOutline) {
        emotionalTone = chapterOutline.emotionalTone;
      }
    }
  }

  // Fallback to metadata if outline not available
  if (!emotionalTone && chapter.metadata?.tone) {
    emotionalTone = chapter.metadata.tone;
  }

  // Get tone instruction for this chapter
  const toneInstruction = emotionalTone ? getToneInstructions(emotionalTone) : undefined;

  console.log(`🎙️  [AUDIOBOOK] Generating audio for chapter ${chapterNumber}...`);
  if (emotionalTone) {
    console.log(`🎭 [AUDIOBOOK] Chapter ${chapterNumber} emotional tone: ${emotionalTone}`);
    if (toneInstruction) {
      console.log(`🎭 [AUDIOBOOK] Using tone instruction: ${toneInstruction}`);
    }
  }

  // Clean and split text
  const text = chapter.text;
  const chunks = splitTextIntoChunks(text);
  
  console.log(`📊 [AUDIOBOOK] Chapter ${chapterNumber}: ${chunks.length} chunks, ${text.length} characters`);

  // Generate audio for each chunk with tone instruction
  const audioBuffers: Buffer[] = [];
  let actualChars = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    // Check for cancellation before each chunk
    const chunkJob = await AudiobookJobModel.findById(jobId);
    if (chunkJob?.status === 'cancelled') {
      console.log(`⏹️  [AUDIOBOOK] Job cancelled during chapter ${chapterNumber}, chunk ${i + 1}`);
      throw new Error('Job cancelled');
    }

    console.log(`   Generating chunk ${i + 1}/${chunks.length}...`);
    const chunk = chunks[i];
    actualChars += chunk.length;
    
    try {
      // Apply tone instruction to all chunks for consistent delivery
      const audioBuffer = await generateAudioChunk(
        chunk, 
        voice, 
        model, 
        toneInstruction
      );
      audioBuffers.push(audioBuffer);
    } catch (error: any) {
      // Check if error is due to cancellation
      const errorJob = await AudiobookJobModel.findById(jobId);
      if (errorJob?.status === 'cancelled') {
        console.log(`⏹️  [AUDIOBOOK] Job cancelled during chunk generation`);
        throw new Error('Job cancelled');
      }
      console.error(`❌ [AUDIOBOOK] Error generating chunk ${i + 1} for chapter ${chapterNumber}:`, error.message);
      throw new Error(`Failed to generate audio chunk ${i + 1}: ${error.message}`);
    }
  }

  // Concatenate all chunks
  console.log(`🔗 [AUDIOBOOK] Concatenating ${audioBuffers.length} audio chunks...`);
  const finalAudio = await concatenateAudioBuffers(audioBuffers);

  // Save audio file
  const audioDir = path.join(AUDIO_DIR, bookId);
  await fs.mkdir(audioDir, { recursive: true });
  
  await fs.writeFile(audioFilePath, finalAudio);

  console.log(`✅ [AUDIOBOOK] Chapter ${chapterNumber} audio saved: ${audioFilePath} (${finalAudio.length} bytes)`);

  // Calculate actual cost for this chapter
  const pricePer1kChars = TTS_PRICING[model];
  const chapterCost = (actualChars / 1000) * pricePer1kChars;

  // Update job with progress and cost
  const job = await AudiobookJobModel.findById(jobId);
  if (job) {
    const progress = job.progress || new Map();
    const progressMap = progress instanceof Map ? progress : new Map(Object.entries(progress));
    // Mongoose Maps require string keys
    progressMap.set(chapterNumber.toString(), true);
    
    const currentCost = job.actualCost || 0;
    await AudiobookJobModel.updateOne(
      { _id: jobId },
      {
        progress: progressMap,
        currentChapter: chapterNumber,
        actualCost: currentCost + chapterCost
      }
    );
  }

  return audioFilePath;
}

/**
 * Generate audio for prologue
 */
export async function generatePrologueAudio(
  bookId: string,
  voice: string,
  model: 'tts-1' | 'tts-1-hd',
  jobId: string,
  skipIfExists: boolean = true
): Promise<string | null> {
  const book = await BookModel.findById(bookId);
  if (!book || !book.prologue) {
    return null;
  }

  // Check if audio already exists
  const audioFilePath = path.join(AUDIO_DIR, bookId, 'prologue.mp3');
  if (skipIfExists) {
    const exists = await prologueAudioExists(bookId);
    if (exists) {
      console.log(`⏭️  [AUDIOBOOK] Prologue audio already exists, skipping generation...`);
      return audioFilePath;
    }
  }

  console.log(`🎙️  [AUDIOBOOK] Generating audio for prologue...`);

  const chunks = splitTextIntoChunks(book.prologue);
  console.log(`📊 [AUDIOBOOK] Prologue: ${chunks.length} chunks, ${book.prologue.length} characters`);

  const audioBuffers: Buffer[] = [];
  let actualChars = 0;

  for (let i = 0; i < chunks.length; i++) {
    // Check for cancellation
    const chunkJob = await AudiobookJobModel.findById(jobId);
    if (chunkJob?.status === 'cancelled') {
      console.log(`⏹️  [AUDIOBOOK] Job cancelled during prologue, chunk ${i + 1}`);
      throw new Error('Job cancelled');
    }

    console.log(`   Generating chunk ${i + 1}/${chunks.length}...`);
    const chunk = chunks[i];
    actualChars += chunk.length;
    
    const audioBuffer = await generateAudioChunk(chunk, voice, model);
    audioBuffers.push(audioBuffer);
  }

  const finalAudio = await concatenateAudioBuffers(audioBuffers);

  const audioDir = path.join(AUDIO_DIR, bookId);
  await fs.mkdir(audioDir, { recursive: true });
  
  await fs.writeFile(audioFilePath, finalAudio);

  console.log(`✅ [AUDIOBOOK] Prologue audio saved: ${audioFilePath}`);

  // Update cost
  const job = await AudiobookJobModel.findById(jobId);
  if (job) {
    const pricePer1kChars = TTS_PRICING[model];
    const prologueCost = (actualChars / 1000) * pricePer1kChars;
    const currentCost = job.actualCost || 0;
    await AudiobookJobModel.updateOne(
      { _id: jobId },
      { actualCost: currentCost + prologueCost }
    );
  }

  return audioFilePath;
}

/**
 * Generate audio for epilogue
 */
export async function generateEpilogueAudio(
  bookId: string,
  voice: string,
  model: 'tts-1' | 'tts-1-hd',
  jobId: string,
  skipIfExists: boolean = true
): Promise<string | null> {
  const book = await BookModel.findById(bookId);
  if (!book || !book.epilogue) {
    return null;
  }

  // Check if audio already exists
  const audioFilePath = path.join(AUDIO_DIR, bookId, 'epilogue.mp3');
  if (skipIfExists) {
    const exists = await epilogueAudioExists(bookId);
    if (exists) {
      console.log(`⏭️  [AUDIOBOOK] Epilogue audio already exists, skipping generation...`);
      return audioFilePath;
    }
  }

  console.log(`🎙️  [AUDIOBOOK] Generating audio for epilogue...`);

  const chunks = splitTextIntoChunks(book.epilogue);
  console.log(`📊 [AUDIOBOOK] Epilogue: ${chunks.length} chunks, ${book.epilogue.length} characters`);

  const audioBuffers: Buffer[] = [];
  let actualChars = 0;

  for (let i = 0; i < chunks.length; i++) {
    // Check for cancellation
    const chunkJob = await AudiobookJobModel.findById(jobId);
    if (chunkJob?.status === 'cancelled') {
      console.log(`⏹️  [AUDIOBOOK] Job cancelled during epilogue, chunk ${i + 1}`);
      throw new Error('Job cancelled');
    }

    console.log(`   Generating chunk ${i + 1}/${chunks.length}...`);
    const chunk = chunks[i];
    actualChars += chunk.length;
    
    const audioBuffer = await generateAudioChunk(chunk, voice, model);
    audioBuffers.push(audioBuffer);
  }

  const finalAudio = await concatenateAudioBuffers(audioBuffers);

  const audioDir = path.join(AUDIO_DIR, bookId);
  await fs.mkdir(audioDir, { recursive: true });
  
  await fs.writeFile(audioFilePath, finalAudio);

  console.log(`✅ [AUDIOBOOK] Epilogue audio saved: ${audioFilePath}`);

  // Update cost
  const job = await AudiobookJobModel.findById(jobId);
  if (job) {
    const pricePer1kChars = TTS_PRICING[model];
    const epilogueCost = (actualChars / 1000) * pricePer1kChars;
    const currentCost = job.actualCost || 0;
    await AudiobookJobModel.updateOne(
      { _id: jobId },
      { actualCost: currentCost + epilogueCost }
    );
  }

  return audioFilePath;
}

/**
 * Process an audiobook job
 */
export async function processAudiobookJob(jobId: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎙️  [AUDIOBOOK JOB ${jobId}] Starting audiobook generation...`);
  console.log(`${'='.repeat(60)}`);

  const job = await AudiobookJobModel.findById(jobId).populate('bookId');
  if (!job) {
    throw new Error('Audiobook job not found');
  }

  const book = await BookModel.findById(job.bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  console.log(`📚 [AUDIOBOOK JOB ${jobId}] Book: "${book.title}"`);
  console.log(`🎤 [AUDIOBOOK JOB ${jobId}] Voice: ${job.voice}, Model: ${job.model}`);

  try {
    // Check if job was cancelled before starting
    const initialJob = await AudiobookJobModel.findById(jobId);
    if (initialJob?.status === 'cancelled') {
      console.log(`⏹️  [AUDIOBOOK JOB ${jobId}] Job was cancelled before processing started`);
      await AudiobookJobModel.updateOne(
        { _id: jobId },
        { processingLock: null }
      );
      return;
    }

    // Update status (clear error if retrying a failed job)
    await AudiobookJobModel.updateOne(
      { _id: jobId },
      { 
        status: 'generating', 
        startedAt: new Date(),
        ...(initialJob?.error ? { error: null } : {}) // Clear previous error when retrying
      }
    );

    // Get chapters
    const chapters = await ChapterContentModel.find({ bookId: book._id })
      .sort({ chapterNumber: 1 });

    if (chapters.length === 0) {
      throw new Error('No chapters found');
    }

    const totalChapters = chapters.length;
    await AudiobookJobModel.updateOne(
      { _id: jobId },
      { totalChapters }
    );

    console.log(`📊 [AUDIOBOOK JOB ${jobId}] Total chapters: ${totalChapters}`);

    // Check existing progress and audio files to determine what needs to be generated
    const currentJob = await AudiobookJobModel.findById(jobId);
    const existingProgress = currentJob?.progress || new Map();
    const bookIdStr = book._id!.toString();
    
    // Check if we should force regenerate (check job metadata or use default behavior)
    // For now, we'll skip existing files by default (idempotent behavior)
    // Force regeneration would need to be passed as a parameter or stored in job metadata
    
    // Check which chapters already have audio files
    const chaptersToProcess: number[] = [];
    for (const chapter of chapters) {
      if (!chapter.text) {
        console.log(`⏭️  [AUDIOBOOK JOB ${jobId}] Chapter ${chapter.chapterNumber}: No text, skipping...`);
        continue;
      }
      
      const chapterKey = chapter.chapterNumber.toString();
      const progressMap = existingProgress instanceof Map ? existingProgress : new Map(Object.entries(existingProgress));
      const inProgress = progressMap.get(chapterKey);
      const audioExists = await chapterAudioExists(bookIdStr, chapter.chapterNumber);
      
      if (audioExists && !inProgress) {
        // File exists but not in progress - update progress
        console.log(`✅ [AUDIOBOOK JOB ${jobId}] Chapter ${chapter.chapterNumber} audio exists, updating progress...`);
        progressMap.set(chapterKey, true);
        await AudiobookJobModel.updateOne(
          { _id: jobId },
          { progress: progressMap }
        );
      }
      
      // Always add to process list - the generateChapterAudio function will skip if exists
      // This allows the function to handle the skip logic internally
      chaptersToProcess.push(chapter.chapterNumber);
    }

    console.log(`📋 [AUDIOBOOK JOB ${jobId}] Chapters to process: ${chaptersToProcess.length} of ${totalChapters}`);

    // Generate prologue if exists and doesn't have audio
    if (book.prologue) {
      // Check for cancellation
      const prologueJob = await AudiobookJobModel.findById(jobId);
      if (prologueJob?.status === 'cancelled') {
        console.log(`⏹️  [AUDIOBOOK JOB ${jobId}] Job cancelled before prologue`);
        await AudiobookJobModel.updateOne(
          { _id: jobId },
          { processingLock: null }
        );
        return;
      }

      const prologueExists = await prologueAudioExists(bookIdStr);
      if (!prologueExists) {
        console.log(`\n📖 [AUDIOBOOK JOB ${jobId}] Processing prologue...`);
        try {
          await generatePrologueAudio(bookIdStr, job.voice, job.model, jobId, true);
        } catch (error: any) {
          // Check if error is due to cancellation
          const cancelCheck = await AudiobookJobModel.findById(jobId);
          if (cancelCheck?.status === 'cancelled') {
            console.log(`⏹️  [AUDIOBOOK JOB ${jobId}] Job cancelled during prologue`);
            await AudiobookJobModel.updateOne(
              { _id: jobId },
              { processingLock: null }
            );
            return;
          }
          throw error;
        }
      } else {
        console.log(`⏭️  [AUDIOBOOK JOB ${jobId}] Prologue audio already exists, skipping...`);
      }
    }

    // Generate audio for chapters that need it
    for (const chapterNumber of chaptersToProcess) {
      // Check for cancellation before each chapter
      const chapterJob = await AudiobookJobModel.findById(jobId);
      if (chapterJob?.status === 'cancelled') {
        console.log(`⏹️  [AUDIOBOOK JOB ${jobId}] Job cancelled before chapter ${chapterNumber}`);
        await AudiobookJobModel.updateOne(
          { _id: jobId },
          { processingLock: null }
        );
        return;
      }

      // Check if chapter already has audio
      // Note: We check here to skip early, but generateChapterAudio will also check
      // If we want to force regenerate, we'd need to pass that flag through
      // For now, we skip existing files (idempotent behavior)
      const audioExists = await chapterAudioExists(bookIdStr, chapterNumber);
      if (audioExists) {
        console.log(`⏭️  [AUDIOBOOK JOB ${jobId}] Chapter ${chapterNumber} already has audio, skipping...`);
        // Update progress
        const progress = chapterJob?.progress || new Map();
        const progressMap = progress instanceof Map ? progress : new Map(Object.entries(progress));
        progressMap.set(chapterNumber.toString(), true);
        await AudiobookJobModel.updateOne(
          { _id: jobId },
          { progress, currentChapter: chapterNumber }
        );
        continue;
      }

      console.log(`\n${'-'.repeat(60)}`);
      console.log(`📖 [AUDIOBOOK JOB ${jobId}] Processing Chapter ${chapterNumber}/${totalChapters}`);
      console.log(`${'-'.repeat(60)}`);

      try {
        await generateChapterAudio(
          bookIdStr,
          chapterNumber,
          job.voice,
          job.model,
          jobId,
          true // skipIfExists - will skip if file exists
        );
      } catch (error: any) {
        // Check if error is due to cancellation
        const cancelCheck = await AudiobookJobModel.findById(jobId);
        if (cancelCheck?.status === 'cancelled') {
          console.log(`⏹️  [AUDIOBOOK JOB ${jobId}] Job cancelled during chapter ${chapterNumber}`);
          await AudiobookJobModel.updateOne(
            { _id: jobId },
            { processingLock: null }
          );
          return;
        }
        // Re-throw if not cancellation
        throw error;
      }
    }

    // Check for cancellation before epilogue
    const epilogueJob = await AudiobookJobModel.findById(jobId);
    if (epilogueJob?.status === 'cancelled') {
      console.log(`⏹️  [AUDIOBOOK JOB ${jobId}] Job cancelled before epilogue`);
      await AudiobookJobModel.updateOne(
        { _id: jobId },
        { processingLock: null }
      );
      return;
    }

    // Generate epilogue if exists and doesn't have audio
    if (book.epilogue) {
      const epilogueExists = await epilogueAudioExists(bookIdStr);
      if (!epilogueExists) {
        console.log(`\n📖 [AUDIOBOOK JOB ${jobId}] Processing epilogue...`);
        try {
          await generateEpilogueAudio(bookIdStr, job.voice, job.model, jobId, true);
        } catch (error: any) {
          // Check if error is due to cancellation
          const cancelCheck = await AudiobookJobModel.findById(jobId);
          if (cancelCheck?.status === 'cancelled') {
            console.log(`⏹️  [AUDIOBOOK JOB ${jobId}] Job cancelled during epilogue`);
            await AudiobookJobModel.updateOne(
              { _id: jobId },
              { processingLock: null }
            );
            return;
          }
          throw error;
        }
      } else {
        console.log(`⏭️  [AUDIOBOOK JOB ${jobId}] Epilogue audio already exists, skipping...`);
      }
    }

    // Final check for cancellation before marking complete
    const finalCheckJob = await AudiobookJobModel.findById(jobId);
    if (finalCheckJob?.status === 'cancelled') {
      console.log(`⏹️  [AUDIOBOOK JOB ${jobId}] Job was cancelled, not marking as complete`);
      await AudiobookJobModel.updateOne(
        { _id: jobId },
        { processingLock: null }
      );
      return;
    }

    // Mark as complete
    await AudiobookJobModel.updateOne(
      { _id: jobId },
      {
        status: 'complete',
        completedAt: new Date(),
        processingLock: null
      }
    );

    const finalJob = await AudiobookJobModel.findById(jobId);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎉 [AUDIOBOOK JOB ${jobId}] Audiobook generation complete!`);
    console.log(`💰 Estimated cost: $${finalJob?.estimatedCost?.toFixed(4) || '0.0000'}`);
    console.log(`💰 Actual cost: $${finalJob?.actualCost?.toFixed(4) || '0.0000'}`);
    console.log(`${'='.repeat(60)}\n`);
  } catch (error: any) {
    // Check if error is due to cancellation
    const errorJob = await AudiobookJobModel.findById(jobId);
    if (errorJob?.status === 'cancelled') {
      console.log(`⏹️  [AUDIOBOOK JOB ${jobId}] Job was cancelled during processing`);
      await AudiobookJobModel.updateOne(
        { _id: jobId },
        { processingLock: null }
      );
      return;
    }

    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [AUDIOBOOK JOB ${jobId}] Audiobook generation failed!`);
    console.error(`   Error: ${error.message}`);
    console.error(`${'='.repeat(60)}\n`);

    await AudiobookJobModel.updateOne(
      { _id: jobId },
      {
        status: 'failed',
        error: error.message,
        processingLock: null
      }
    );
    throw error;
  }
}

/**
 * Cancel an audiobook job
 */
export async function cancelAudiobookJob(jobId: string): Promise<void> {
  const job = await AudiobookJobModel.findById(jobId);
  if (!job) {
    throw new Error('Audiobook job not found');
  }

  if (job.status === 'complete') {
    throw new Error('Cannot cancel a completed job');
  }

  if (job.status === 'cancelled') {
    throw new Error('Job is already cancelled');
  }

  await AudiobookJobModel.updateOne(
    { _id: jobId },
    {
      status: 'cancelled',
      processingLock: null,
      error: 'Job cancelled by user'
    }
  );

  console.log(`⏹️  [AUDIOBOOK JOB ${jobId}] Job cancelled`);
}

/**
 * Process a single audio file with ffmpeg to fix quality issues
 * - Sample rate: 44.1kHz
 * - Channels: Mono (1 channel)
 * - Bitrate: 192kbps
 * - Codec: libmp3lame
 * - RMS normalization: -20 LUFS (EBU R128 standard for audiobooks)
 */
async function processAudioFileWithFFmpeg(inputPath: string, outputPath: string): Promise<void> {
  // Check if input file exists
  try {
    await fs.access(inputPath);
  } catch {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Build ffmpeg command with RMS normalization
  // loudnorm filter normalizes to -20 LUFS (approximately -20 dB RMS for speech)
  // This meets audiobook production standards
  const command = `ffmpeg -i "${inputPath}" -af "loudnorm=I=-20:TP=-1.5:LRA=11" -ar 44100 -ac 1 -codec:a libmp3lame -b:a 192k -write_xing 0 "${outputPath}"`;

  console.log(`🎬 [FFMPEG] Processing: ${path.basename(inputPath)}`);
  console.log(`   Command: ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stderr.includes('Stream mapping') && !stderr.includes('Press [q]') && !stderr.includes('loudnorm')) {
      // FFmpeg outputs to stderr, but most messages are informational
      // Only log if it's not the usual info messages
      console.log(`   FFmpeg output: ${stderr}`);
    }
    console.log(`✅ [FFMPEG] Successfully processed: ${path.basename(outputPath)}`);
  } catch (error: any) {
    console.error(`❌ [FFMPEG] Error processing ${inputPath}:`, error.message);
    throw new Error(`FFmpeg processing failed: ${error.message}`);
  }
}

/**
 * Process all audio files for a book with ffmpeg to fix quality issues
 * This will:
 * - Normalize RMS levels to -20 LUFS (EBU R128 standard)
 * - Convert sample rate to 44.1kHz
 * - Convert to mono (1 channel)
 * - Set bitrate to 192kbps
 * - Use libmp3lame codec
 */
export async function processBookAudioFiles(bookId: string): Promise<{
  processed: string[];
  failed: Array<{ file: string; error: string }>;
}> {
  const book = await BookModel.findById(bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  const audioDir = path.join(AUDIO_DIR, bookId);
  
  // Check if audio directory exists
  try {
    await fs.access(audioDir);
  } catch {
    throw new Error(`Audio directory not found for book: ${bookId}`);
  }

  const processed: string[] = [];
  const failed: Array<{ file: string; error: string }> = [];

  // Get all chapters
  const chapters = await ChapterContentModel.find({ bookId })
    .sort({ chapterNumber: 1 });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎬 [FFMPEG] Processing audio files for book: "${book.title}"`);
  console.log(`📁 Audio directory: ${audioDir}`);
  console.log(`${'='.repeat(60)}\n`);

  // Process prologue if exists
  const prologuePath = path.join(audioDir, 'prologue.mp3');
  const prologueOutputPath = path.join(audioDir, 'prologue_processed.mp3');
  try {
    await fs.access(prologuePath);
    await processAudioFileWithFFmpeg(prologuePath, prologueOutputPath);
    // Replace original with processed version
    await fs.rename(prologueOutputPath, prologuePath);
    processed.push('prologue.mp3');
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      // Only log error if file exists but processing failed
      console.error(`❌ [FFMPEG] Failed to process prologue:`, error.message);
      failed.push({ file: 'prologue.mp3', error: error.message });
    }
  }

  // Process each chapter
  for (const chapter of chapters) {
    const chapterPath = path.join(audioDir, `chapter_${chapter.chapterNumber}.mp3`);
    const chapterOutputPath = path.join(audioDir, `chapter_${chapter.chapterNumber}_processed.mp3`);
    
    try {
      await fs.access(chapterPath);
      await processAudioFileWithFFmpeg(chapterPath, chapterOutputPath);
      // Replace original with processed version
      await fs.rename(chapterOutputPath, chapterPath);
      processed.push(`chapter_${chapter.chapterNumber}.mp3`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        // Only log error if file exists but processing failed
        console.error(`❌ [FFMPEG] Failed to process chapter ${chapter.chapterNumber}:`, error.message);
        failed.push({ file: `chapter_${chapter.chapterNumber}.mp3`, error: error.message });
      }
    }
  }

  // Process epilogue if exists
  const epiloguePath = path.join(audioDir, 'epilogue.mp3');
  const epilogueOutputPath = path.join(audioDir, 'epilogue_processed.mp3');
  try {
    await fs.access(epiloguePath);
    await processAudioFileWithFFmpeg(epiloguePath, epilogueOutputPath);
    // Replace original with processed version
    await fs.rename(epilogueOutputPath, epiloguePath);
    processed.push('epilogue.mp3');
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      // Only log error if file exists but processing failed
      console.error(`❌ [FFMPEG] Failed to process epilogue:`, error.message);
      failed.push({ file: 'epilogue.mp3', error: error.message });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ [FFMPEG] Processing complete!`);
  console.log(`   Processed: ${processed.length} files`);
  if (failed.length > 0) {
    console.log(`   Failed: ${failed.length} files`);
  }
  console.log(`${'='.repeat(60)}\n`);

  return { processed, failed };
}

/**
 * Generate opening credits audio
 * "This book is [title] narrated under direction of the author"
 */
export async function generateOpeningCredits(
  bookId: string,
  voice: string,
  model: 'tts-1' | 'tts-1-hd'
): Promise<string> {
  const book = await BookModel.findById(bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  const text = `This book is ${book.title}, narrated under direction of the author.`;
  
  console.log(`🎙️  [AUDIOBOOK] Generating opening credits...`);
  console.log(`   Text: "${text}"`);

  // Generate audio
  const audioBuffer = await generateAudioChunk(text, voice, model);
  
  // Save raw audio
  const audioDir = path.join(AUDIO_DIR, bookId);
  await fs.mkdir(audioDir, { recursive: true });
  
  const rawAudioPath = path.join(audioDir, 'opening_credits_raw.mp3');
  await fs.writeFile(rawAudioPath, audioBuffer);

  // Process with ffmpeg
  const finalAudioPath = path.join(audioDir, 'opening_credits.mp3');
  await processAudioFileWithFFmpeg(rawAudioPath, finalAudioPath);
  
  // Remove raw file
  await fs.unlink(rawAudioPath);

  console.log(`✅ [AUDIOBOOK] Opening credits saved: ${finalAudioPath}`);
  
  return finalAudioPath;
}

/**
 * Generate closing credits audio
 * "This has been [title]. Thank you for listening."
 */
export async function generateClosingCredits(
  bookId: string,
  voice: string,
  model: 'tts-1' | 'tts-1-hd'
): Promise<string> {
  const book = await BookModel.findById(bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  const text = `This has been ${book.title}. Thank you for listening.`;
  
  console.log(`🎙️  [AUDIOBOOK] Generating closing credits...`);
  console.log(`   Text: "${text}"`);

  // Generate audio
  const audioBuffer = await generateAudioChunk(text, voice, model);
  
  // Save raw audio
  const audioDir = path.join(AUDIO_DIR, bookId);
  await fs.mkdir(audioDir, { recursive: true });
  
  const rawAudioPath = path.join(audioDir, 'closing_credits_raw.mp3');
  await fs.writeFile(rawAudioPath, audioBuffer);

  // Process with ffmpeg
  const finalAudioPath = path.join(audioDir, 'closing_credits.mp3');
  await processAudioFileWithFFmpeg(rawAudioPath, finalAudioPath);
  
  // Remove raw file
  await fs.unlink(rawAudioPath);

  console.log(`✅ [AUDIOBOOK] Closing credits saved: ${finalAudioPath}`);
  
  return finalAudioPath;
}

/**
 * Generate retail sample (2-minute snippet from chapter 2)
 */
export async function generateRetailSample(
  bookId: string,
  voice: string,
  model: 'tts-1' | 'tts-1-hd'
): Promise<string> {
  const book = await BookModel.findById(bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  // Get chapter 2
  const chapter = await ChapterContentModel.findOne({ bookId, chapterNumber: 2 });
  if (!chapter || !chapter.text) {
    throw new Error('Chapter 2 not found or has no text');
  }

  console.log(`🎙️  [AUDIOBOOK] Generating retail sample from chapter 2...`);

  // Generate full chapter audio first (if not exists)
  const chapterAudioPath = path.join(AUDIO_DIR, bookId, 'chapter_2.mp3');
  const chapterExists = await chapterAudioExists(bookId, 2);
  
  if (!chapterExists) {
    console.log(`   Chapter 2 audio not found, generating...`);
    // Create a temporary job for tracking
    const { AudiobookJobModel } = await import('../models/AudiobookJob');
    let job = await AudiobookJobModel.findOne({ bookId }).sort({ createdAt: -1 });
    
    if (!job) {
      job = new AudiobookJobModel({
        bookId,
        voice,
        model,
        status: 'generating'
      });
      await job.save();
    }
    
    await generateChapterAudio(bookId, 2, voice, model, job._id!.toString(), false);
  }

  // Extract first 2 minutes (120 seconds) using ffmpeg
  const audioDir = path.join(AUDIO_DIR, bookId);
  const samplePath = path.join(audioDir, 'retail_sample_raw.mp3');
  const finalSamplePath = path.join(audioDir, 'retail_sample.mp3');

  // Extract 2 minutes - use proper re-encoding instead of copy to ensure clean cut
  const extractCommand = `ffmpeg -i "${chapterAudioPath}" -t 120 -codec:a libmp3lame "${samplePath}"`;
  
  console.log(`   Extracting first 2 minutes from chapter 2...`);
  try {
    const { stdout, stderr } = await execAsync(extractCommand);
    if (stderr && !stderr.includes('Stream mapping') && !stderr.includes('Press [q]')) {
      console.log(`   FFmpeg output: ${stderr}`);
    }
  } catch (error: any) {
    console.error(`❌ [AUDIOBOOK] Error extracting sample:`, error.message);
    throw new Error(`Failed to extract sample: ${error.message}`);
  }

  // Process with ffmpeg (normalize RMS, sample rate, etc.)
  await processAudioFileWithFFmpeg(samplePath, finalSamplePath);
  
  // Remove raw sample file
  await fs.unlink(samplePath);

  console.log(`✅ [AUDIOBOOK] Retail sample saved: ${finalSamplePath}`);
  
  return finalSamplePath;
}

