import OpenAI from 'openai';
import { BookType, Niche, PromptType, BookContext, BookOutline, ChapterOutlineNode, BOOK_TYPES } from '@ai-kindle/shared';
import { BookModel } from '../models/Book';
import { BookOutlineModel } from '../models/BookOutline';
import { ChapterContentModel } from '../models/ChapterContent';
import { GenerationJobModel } from '../models/GenerationJob';
import { TokenUsageModel } from '../models/TokenUsage';
import { getPromptVersion, generatePromptsForCombo } from './promptGenerator';

// Lazy initialization of OpenAI client to ensure env vars are loaded first
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

const openai = {
  chat: {
    completions: {
      create: (...args: Parameters<OpenAI['chat']['completions']['create']>) => 
        getOpenAIClient().chat.completions.create(...args)
    }
  },
  images: {
    generate: (...args: Parameters<OpenAI['images']['generate']>) => 
      getOpenAIClient().images.generate(...args)
  }
} as OpenAI;

// Model configuration
const OUTLINE_MODEL = process.env.OUTLINE_MODEL || 'gpt-4o'; // For outline generation
const CHAPTER_TEXT_MODEL = process.env.CHAPTER_TEXT_MODEL || 'gpt-4o-mini'; // For chapter text and image prompts
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'gpt-image-1'; // For image generation

/**
 * Generate outline for a book
 */
export async function generateOutline(
  bookId: string,
  bookType: BookType,
  niche: Niche,
  context: BookContext,
  writingStyle?: string
): Promise<string> {
  const job = await GenerationJobModel.findOne({ bookId });
  if (!job) throw new Error('Job not found');

  console.log(`📝 [OUTLINE] Starting outline generation for book ${bookId}`);
  console.log(`   Book Type: ${bookType}, Niche: ${niche}${writingStyle ? `, Writing Style: ${writingStyle}` : ''}`);

  try {
    await GenerationJobModel.updateOne(
      { _id: job._id },
      { status: 'generating_outline' }
    );

    // Get prompts - auto-generate if they don't exist
    console.log(`📋 [OUTLINE] Loading prompts for ${bookType}/${niche}${writingStyle ? `/${writingStyle}` : ''}...`);
    let styleGuidePrompt = await getPromptVersion(bookType, niche, PromptType.STYLE_GUIDE, undefined, writingStyle);
    let artDirectionPrompt = await getPromptVersion(bookType, niche, PromptType.ART_DIRECTION, undefined, writingStyle);
    let outlinePrompt = await getPromptVersion(bookType, niche, PromptType.OUTLINE, undefined, writingStyle);

    // If any prompts are missing, generate them automatically
    if (!styleGuidePrompt || !artDirectionPrompt || !outlinePrompt) {
      console.log(`⚠️ [OUTLINE] Some prompts are missing. Auto-generating prompts for ${bookType}/${niche}${writingStyle ? `/${writingStyle}` : ''}...`);
      try {
        await generatePromptsForCombo(bookType, niche, writingStyle);
        console.log(`✅ [OUTLINE] Prompts auto-generated successfully`);
        
        // Reload prompts after generation
        styleGuidePrompt = await getPromptVersion(bookType, niche, PromptType.STYLE_GUIDE, undefined, writingStyle);
        artDirectionPrompt = await getPromptVersion(bookType, niche, PromptType.ART_DIRECTION, undefined, writingStyle);
        outlinePrompt = await getPromptVersion(bookType, niche, PromptType.OUTLINE, undefined, writingStyle);
        
        if (!styleGuidePrompt || !artDirectionPrompt || !outlinePrompt) {
          throw new Error('Failed to generate or load prompts');
        }
      } catch (error: any) {
        console.error(`❌ [OUTLINE] Failed to auto-generate prompts: ${error.message}`);
        throw new Error(`Failed to generate prompts: ${error.message}`);
      }
    }
    console.log(`✅ [OUTLINE] Prompts loaded (versions: ${styleGuidePrompt.version}, ${artDirectionPrompt.version}, ${outlinePrompt.version})`);

    // Generate style guide
    console.log(`🎨 [OUTLINE] Generating style guide using ${OUTLINE_MODEL}...`);
    const styleGuideText = await replaceVariables(styleGuidePrompt.prompt, {
      '{{BOOK_CONTEXT}}': JSON.stringify(context, null, 2)
    });

    const styleGuideResponse = await openai.chat.completions.create({
      model: OUTLINE_MODEL,
      messages: [{ role: 'user', content: styleGuideText }],
      response_format: { type: 'json_object' }
    });

    const styleGuide = JSON.parse(styleGuideResponse.choices[0].message.content || '{}');
    const styleGuideTokens = styleGuideResponse.usage?.total_tokens || 0;
    console.log(`✅ [OUTLINE] Style guide generated (${styleGuideTokens} tokens)`);
    await trackTokenUsage(bookId, job._id!.toString(), 'style_guide', styleGuideResponse.usage, OUTLINE_MODEL);

    // Generate art direction
    console.log(`🎨 [OUTLINE] Generating art direction using ${OUTLINE_MODEL}...`);
    const artDirectionText = await replaceVariables(artDirectionPrompt.prompt, {
      '{{BOOK_CONTEXT}}': JSON.stringify(context, null, 2)
    });

    const artDirectionResponse = await openai.chat.completions.create({
      model: OUTLINE_MODEL,
      messages: [{ role: 'user', content: artDirectionText }],
      response_format: { type: 'json_object' }
    });

    const artDirection = JSON.parse(artDirectionResponse.choices[0].message.content || '{}');
    const artDirectionTokens = artDirectionResponse.usage?.total_tokens || 0;
    console.log(`✅ [OUTLINE] Art direction generated (${artDirectionTokens} tokens)`);
    await trackTokenUsage(bookId, job._id!.toString(), 'art_direction', artDirectionResponse.usage, OUTLINE_MODEL);

    // Generate outline
    console.log(`📑 [OUTLINE] Generating book outline using ${OUTLINE_MODEL}...`);
    
    // Determine chapter count and size
    const bookTypeMeta = BOOK_TYPES.find(bt => bt.id === bookType);
    const targetChapterCount = context.chapterCount || bookTypeMeta?.defaultChapterCount || 10;
    const targetChapterSize = context.chapterSize || bookTypeMeta?.defaultChapterSize || 'medium';
    
    // Map chapter size to word count ranges
    const wordCountRanges: Record<string, { min: number; max: number }> = {
      small: { min: 300, max: 600 },
      medium: { min: 800, max: 1200 },
      large: { min: 1500, max: 2500 }
    };
    const wordCountRange = wordCountRanges[targetChapterSize] || wordCountRanges.medium;
    
    const chapterCountHint = `IMPORTANT: Create exactly ${targetChapterCount} chapters. Each chapter should target ${wordCountRange.min}-${wordCountRange.max} words (${targetChapterSize} size).`;
    console.log(`📊 [OUTLINE] Chapter count: ${targetChapterCount}, Size: ${targetChapterSize} (${wordCountRange.min}-${wordCountRange.max} words)`);
    
    const contextText = JSON.stringify(context, null, 2);
    
    // Fetch current trends from Perplexity if enabled (before generating outline)
    let currentTrends = '';
    let trendsInstructions = '';
    if (context.usePerplexity) {
      try {
        const book = await BookModel.findById(bookId);
        if (book) {
          const { fetchBookLevelTrends } = await import('./perplexityService');
          const trends = await fetchBookLevelTrends(
            book.title,
            context.description || '',
            niche,
            context.perplexityTopics
          );
          if (trends) {
            currentTrends = `\n\nCurrent Trends and Recent Developments (use to inform chapter topics and structure):\n${trends}\n`;
            trendsInstructions = `\nIMPORTANT: Use the current trends and recent developments provided above to inform your chapter topics and structure. Consider incorporating relevant current topics, recent examples, and trending themes that align with the book's focus.`;
            console.log(`📰 [OUTLINE] Current trends fetched from Perplexity to inform outline`);
          }
        }
      } catch (error: any) {
        console.warn(`⚠️ [OUTLINE] Failed to fetch Perplexity trends: ${error.message}`);
        // Continue without trends - not critical
      }
    }
    
    const outlineText = await replaceVariables(outlinePrompt.prompt, {
      '{{BOOK_CONTEXT}}': contextText,
      '{{STYLE_GUIDE}}': JSON.stringify(styleGuide, null, 2),
      '{{ART_DIRECTION}}': JSON.stringify(artDirection, null, 2),
      '{{CURRENT_TRENDS}}': currentTrends,
      '{{CURRENT_TRENDS_INSTRUCTIONS}}': trendsInstructions,
      '{{CHAPTER_COUNT_HINT}}': chapterCountHint
    });

    const outlineResponse = await openai.chat.completions.create({
      model: OUTLINE_MODEL,
      messages: [{ role: 'user', content: outlineText }],
      response_format: { type: 'json_object' }
    });

    const outlineData = JSON.parse(outlineResponse.choices[0].message.content || '{}');
    const outlineTokens = outlineResponse.usage?.total_tokens || 0;
    console.log(`✅ [OUTLINE] Outline generated: ${outlineData.totalChapters || 0} chapters (${outlineTokens} tokens)`);
    await trackTokenUsage(bookId, job._id!.toString(), 'outline', outlineResponse.usage, OUTLINE_MODEL);

    // Save outline
    console.log(`💾 [OUTLINE] Saving outline to database...`);
    const outline = new BookOutlineModel({
      bookId,
      structure: {
        totalChapters: outlineData.totalChapters,
        chapters: outlineData.chapters
      },
      styleGuide,
      artDirection
    });

    const savedOutline = await outline.save();
    console.log(`✅ [OUTLINE] Outline saved (ID: ${savedOutline._id})`);

    // Update book and job
    await BookModel.updateOne({ _id: bookId }, { outlineId: savedOutline._id });
    await GenerationJobModel.updateOne(
      { _id: job._id },
      {
        status: 'outline_complete',
        totalChapters: outlineData.totalChapters,
        'progress.outline': true
      }
    );

    console.log(`🎉 [OUTLINE] Outline generation complete! Total chapters: ${outlineData.totalChapters}`);
    
    // Generate cover image prompt, prologue, and epilogue after outline
    console.log(`\n📸 [OUTLINE] Generating cover image prompt, prologue, and epilogue...`);
    await generateCoverImagePrompt(bookId, bookType, niche, context, styleGuide, artDirection, outlineData, writingStyle);
    await generatePrologue(bookId, bookType, niche, context, styleGuide, outlineData, writingStyle);
    await generateEpilogue(bookId, bookType, niche, context, styleGuide, outlineData, writingStyle);
    
    return savedOutline._id!.toString();
  } catch (error: any) {
    console.error(`❌ [OUTLINE] Error generating outline: ${error.message}`);
    console.error(error.stack);
    await GenerationJobModel.updateOne(
      { _id: job._id },
      { status: 'failed', error: error.message }
    );
    throw error;
  }
}

/**
 * Generate cover image prompt
 */
export async function generateCoverImagePrompt(
  bookId: string,
  bookType: BookType,
  niche: Niche,
  context: BookContext,
  styleGuide: any,
  artDirection: any,
  outline?: any,
  writingStyle?: string
): Promise<string | null> {
  const job = await GenerationJobModel.findOne({ bookId });
  if (!job) throw new Error('Job not found');

  console.log(`📸 [COVER] Generating cover image prompt...`);

  try {
    // Get book (needed for title and potentially outline)
    const book = await BookModel.findById(bookId);
    if (!book) {
      throw new Error('Book not found');
    }
    const bookTitle = book.title;

    // Get outline if not provided
    let outlineData = outline;
    if (!outlineData && book.outlineId) {
      const outlineDoc = await BookOutlineModel.findById(book.outlineId);
      if (outlineDoc) {
        outlineData = outlineDoc;
      }
    }

    let coverPromptTemplate = await getPromptVersion(bookType, niche, PromptType.COVER_IMAGE, undefined, writingStyle);
    if (!coverPromptTemplate) {
      console.log(`⚠️ [COVER] Cover image prompt not found. Auto-generating...`);
      await generatePromptsForCombo(bookType, niche, writingStyle);
      coverPromptTemplate = await getPromptVersion(bookType, niche, PromptType.COVER_IMAGE, undefined, writingStyle);
    }
    if (!coverPromptTemplate) {
      console.warn(`⚠️ [COVER] Cover image prompt still not found after generation, skipping...`);
      return null;
    }

    // Build outline summary and visual motifs
    let outlineSummary = '';
    let visualMotifs: string[] = [];
    
    if (outlineData) {
      // Create a summary from chapter summaries
      const chapters = outlineData.structure?.chapters || [];
      if (chapters.length > 0) {
        const chapterSummaries = chapters
          .slice(0, Math.min(5, chapters.length)) // Use first 5 chapters for summary
          .map((ch: any) => `Chapter ${ch.chapterNumber}: ${ch.title} - ${ch.summary}`)
          .join('\n');
        outlineSummary = `Book Structure: ${chapters.length} chapters\n\n${chapterSummaries}`;
      }

      // Collect visual motifs from all chapters
      const allMotifs = new Set<string>();
      chapters.forEach((ch: any) => {
        if (ch.visualMotifs && Array.isArray(ch.visualMotifs)) {
          ch.visualMotifs.forEach((motif: string) => allMotifs.add(motif));
        }
      });
      visualMotifs = Array.from(allMotifs);
    }

    const promptText = await replaceVariables(coverPromptTemplate.prompt, {
      '{{BOOK_TITLE}}': bookTitle,
      '{{BOOK_CONTEXT}}': JSON.stringify(context, null, 2),
      '{{STYLE_GUIDE}}': JSON.stringify(styleGuide, null, 2),
      '{{ART_DIRECTION}}': JSON.stringify(artDirection, null, 2),
      '{{OUTLINE_SUMMARY}}': outlineSummary || 'No outline available yet',
      '{{VISUAL_MOTIFS}}': visualMotifs.length > 0 ? visualMotifs.join(', ') : 'General themes from the book'
    });

    const response = await openai.chat.completions.create({
      model: CHAPTER_TEXT_MODEL,
      messages: [{ role: 'user', content: promptText }]
    });

    const coverImagePrompt = response.choices[0].message.content || '';
    const tokens = response.usage?.total_tokens || 0;
    console.log(`✅ [COVER] Cover image prompt generated (${tokens} tokens)`);
    
    await trackTokenUsage(bookId, job._id!.toString(), 'cover_image_prompt', response.usage, CHAPTER_TEXT_MODEL);

    await BookModel.updateOne(
      { _id: bookId },
      { coverImagePrompt }
    );

    console.log(`💾 [COVER] Cover image prompt saved`);
    return coverImagePrompt;
  } catch (error: any) {
    console.error(`❌ [COVER] Error generating cover image prompt: ${error.message}`);
    // Don't throw - cover is optional
    return null;
  }
}

/**
 * Generate prologue
 */
export async function generatePrologue(
  bookId: string,
  bookType: BookType,
  niche: Niche,
  context: BookContext,
  styleGuide: any,
  outline: any,
  writingStyle?: string
): Promise<void> {
  const job = await GenerationJobModel.findOne({ bookId });
  if (!job) throw new Error('Job not found');

  console.log(`📖 [PROLOGUE] Generating prologue...`);

  try {
    let prologuePromptTemplate = await getPromptVersion(bookType, niche, PromptType.PROLOGUE, undefined, writingStyle);
    if (!prologuePromptTemplate) {
      console.log(`⚠️ [PROLOGUE] Prologue prompt not found. Auto-generating...`);
      await generatePromptsForCombo(bookType, niche, writingStyle);
      prologuePromptTemplate = await getPromptVersion(bookType, niche, PromptType.PROLOGUE, undefined, writingStyle);
    }
    if (!prologuePromptTemplate) {
      console.warn(`⚠️ [PROLOGUE] Prologue prompt still not found after generation, skipping...`);
      return;
    }

    const outlineSummary = `Total chapters: ${outline.totalChapters}. Themes: ${outline.chapters?.slice(0, 3).map((c: any) => c.title).join(', ')}...`;

    const promptText = await replaceVariables(prologuePromptTemplate.prompt, {
      '{{BOOK_CONTEXT}}': JSON.stringify(context, null, 2),
      '{{STYLE_GUIDE}}': JSON.stringify(styleGuide, null, 2),
      '{{OUTLINE_SUMMARY}}': outlineSummary
    });

    const response = await openai.chat.completions.create({
      model: CHAPTER_TEXT_MODEL,
      messages: [{ role: 'user', content: promptText }]
    });

    const prologue = response.choices[0].message.content || '';
    const tokens = response.usage?.total_tokens || 0;
    console.log(`✅ [PROLOGUE] Prologue generated: ${prologue.split(/\s+/).length} words (${tokens} tokens)`);
    
    await trackTokenUsage(bookId, job._id!.toString(), 'prologue', response.usage, CHAPTER_TEXT_MODEL);

    await BookModel.updateOne(
      { _id: bookId },
      { 
        prologue,
        prologuePrompt: promptText
      }
    );

    console.log(`💾 [PROLOGUE] Prologue saved`);
  } catch (error: any) {
    console.error(`❌ [PROLOGUE] Error generating prologue: ${error.message}`);
    // Don't throw - prologue is optional
  }
}

/**
 * Generate epilogue
 */
export async function generateEpilogue(
  bookId: string,
  bookType: BookType,
  niche: Niche,
  context: BookContext,
  styleGuide: any,
  outline: any,
  writingStyle?: string
): Promise<void> {
  const job = await GenerationJobModel.findOne({ bookId });
  if (!job) throw new Error('Job not found');

  console.log(`📖 [EPILOGUE] Generating epilogue...`);

  try {
    let epiloguePromptTemplate = await getPromptVersion(bookType, niche, PromptType.EPILOGUE, undefined, writingStyle);
    if (!epiloguePromptTemplate) {
      console.log(`⚠️ [EPILOGUE] Epilogue prompt not found. Auto-generating...`);
      await generatePromptsForCombo(bookType, niche, writingStyle);
      epiloguePromptTemplate = await getPromptVersion(bookType, niche, PromptType.EPILOGUE, undefined, writingStyle);
    }
    if (!epiloguePromptTemplate) {
      console.warn(`⚠️ [EPILOGUE] Epilogue prompt still not found after generation, skipping...`);
      return;
    }

    const outlineSummary = `Total chapters: ${outline.totalChapters}. Themes: ${outline.chapters?.map((c: any) => c.title).join(', ')}`;

    const promptText = await replaceVariables(epiloguePromptTemplate.prompt, {
      '{{BOOK_CONTEXT}}': JSON.stringify(context, null, 2),
      '{{STYLE_GUIDE}}': JSON.stringify(styleGuide, null, 2),
      '{{OUTLINE_SUMMARY}}': outlineSummary
    });

    const response = await openai.chat.completions.create({
      model: CHAPTER_TEXT_MODEL,
      messages: [{ role: 'user', content: promptText }]
    });

    const epilogue = response.choices[0].message.content || '';
    const tokens = response.usage?.total_tokens || 0;
    console.log(`✅ [EPILOGUE] Epilogue generated: ${epilogue.split(/\s+/).length} words (${tokens} tokens)`);
    
    await trackTokenUsage(bookId, job._id!.toString(), 'epilogue', response.usage, CHAPTER_TEXT_MODEL);

    await BookModel.updateOne(
      { _id: bookId },
      { 
        epilogue,
        epiloguePrompt: promptText
      }
    );

    console.log(`💾 [EPILOGUE] Epilogue saved`);
  } catch (error: any) {
    console.error(`❌ [EPILOGUE] Error generating epilogue: ${error.message}`);
    // Don't throw - epilogue is optional
  }
}

/**
 * Generate chapter text
 */
export async function generateChapterText(
  bookId: string,
  chapterNumber: number,
  bookType: BookType,
  niche: Niche,
  context: BookContext,
  outline: BookOutline,
  writingStyle?: string
): Promise<void> {
  const chapter = outline.structure.chapters.find(c => c.chapterNumber === chapterNumber);
  if (!chapter) throw new Error(`Chapter ${chapterNumber} not found in outline`);

  const job = await GenerationJobModel.findOne({ bookId });
  if (!job) throw new Error('Job not found');

  console.log(`📖 [CHAPTER ${chapterNumber}] Starting text generation for "${chapter.title}"`);

  // Update chapter status
  await ChapterContentModel.findOneAndUpdate(
    { bookId, chapterNumber },
    { status: 'generating_text' },
    { upsert: true }
  );

  try {
    // Get previous chapter summary
    let previousChapterSummary = '';
    if (chapterNumber > 1) {
      const prevChapter = outline.structure.chapters.find(c => c.chapterNumber === chapterNumber - 1);
      if (prevChapter) {
        previousChapterSummary = `Previous chapter: ${prevChapter.title} - ${prevChapter.summary}`;
        console.log(`📖 [CHAPTER ${chapterNumber}] Including previous chapter context: "${prevChapter.title}"`);
      }
    }

    // Get prompt - auto-generate if missing
    console.log(`📋 [CHAPTER ${chapterNumber}] Loading chapter text prompt...`);
    let chapterTextPrompt = await getPromptVersion(bookType, niche, PromptType.CHAPTER_TEXT, undefined, writingStyle);
    if (!chapterTextPrompt) {
      console.log(`⚠️ [CHAPTER ${chapterNumber}] Chapter text prompt not found. Auto-generating...`);
      await generatePromptsForCombo(bookType, niche, writingStyle);
      chapterTextPrompt = await getPromptVersion(bookType, niche, PromptType.CHAPTER_TEXT, undefined, writingStyle);
    }
    if (!chapterTextPrompt) {
      throw new Error('Chapter text prompt not found after auto-generation');
    }
    console.log(`✅ [CHAPTER ${chapterNumber}] Using prompt version ${chapterTextPrompt.version}`);

    // Fetch current news from Perplexity if enabled
    let currentNews = '';
    if (context.usePerplexity) {
      try {
        const { fetchCurrentNews, generateNewsQuery } = await import('./perplexityService');
        const newsQuery = generateNewsQuery(
          chapter.title,
          chapter.summary,
          chapter.visualMotifs,
          niche,
          context.perplexityTopics
        );
        const news = await fetchCurrentNews(newsQuery, chapter.title, chapter.summary);
        if (news) {
          currentNews = `\n\nCurrent News and Recent Developments (use for context and examples, but focus on concept explanations):\n${news}\n`;
          console.log(`📰 [CHAPTER ${chapterNumber}] Current news fetched from Perplexity`);
        }
      } catch (error: any) {
        console.warn(`⚠️ [CHAPTER ${chapterNumber}] Failed to fetch Perplexity news: ${error.message}`);
        // Continue without news - not critical
      }
    }

    // Replace variables
    console.log(`🔧 [CHAPTER ${chapterNumber}] Preparing prompt with variables...`);
    const promptText = await replaceVariables(chapterTextPrompt.prompt, {
      '{{CHAPTER_SUMMARY}}': chapter.summary,
      '{{BOOK_CONTEXT}}': JSON.stringify(context, null, 2),
      '{{SERIES_STYLE_GUIDE}}': JSON.stringify(outline.styleGuide, null, 2),
      '{{PREVIOUS_CHAPTER_SUMMARY}}': previousChapterSummary,
      '{{CHAPTER_NUMBER}}': chapterNumber.toString(),
      '{{CHAPTER_TITLE}}': chapter.title,
      '{{WORD_COUNT_TARGET}}': (chapter.wordCountTarget || 1200).toString(),
      '{{EMOTIONAL_TONE}}': chapter.emotionalTone,
      '{{VISUAL_MOTIFS}}': chapter.visualMotifs.join(', '),
      '{{CHAPTER_STRUCTURE}}': chapter.sectionHeadings?.join(', ') || '',
      '{{CURRENT_NEWS}}': currentNews || ''
    });
    console.log(`📊 [CHAPTER ${chapterNumber}] Prompt length: ${promptText.length} characters`);
    console.log(`📊 [CHAPTER ${chapterNumber}] Target word count: ${chapter.wordCountTarget || 1200}`);

    // Generate text
    console.log(`🤖 [CHAPTER ${chapterNumber}] Calling ${CHAPTER_TEXT_MODEL} for text generation...`);
    const response = await openai.chat.completions.create({
      model: CHAPTER_TEXT_MODEL,
      messages: [{ role: 'user', content: promptText }]
    });

    const text = response.choices[0].message.content || '';
    const textTokens = response.usage?.total_tokens || 0;
    const wordCount = text.split(/\s+/).length;
    console.log(`✅ [CHAPTER ${chapterNumber}] Text generated: ${wordCount} words (${textTokens} tokens)`);
    await trackTokenUsage(
      bookId,
      job._id!.toString(),
      `chapter_${chapterNumber}_text`,
      response.usage,
      CHAPTER_TEXT_MODEL
    );

    // Calculate metadata
    const keywords = extractKeywords(text);
    console.log(`📊 [CHAPTER ${chapterNumber}] Extracted ${keywords.length} keywords: ${keywords.slice(0, 5).join(', ')}...`);

    // Save chapter with the prompt that was used
    console.log(`💾 [CHAPTER ${chapterNumber}] Saving chapter text to database...`);
    await ChapterContentModel.findOneAndUpdate(
      { bookId, chapterNumber },
      {
        text,
        textPrompt: promptText, // Save the actual prompt used
        status: 'text_complete',
        metadata: {
          wordCount,
          keywords,
          tone: chapter.emotionalTone
        }
      },
      { upsert: true }
    );

    // Update job progress
    const progress = job.progress || { chapters: {} };
    if (!progress.chapters[chapterNumber]) {
      progress.chapters[chapterNumber] = { text: false, image: false };
    }
    progress.chapters[chapterNumber].text = true;

    await GenerationJobModel.updateOne(
      { _id: job._id },
      { progress, currentChapter: chapterNumber }
    );

    console.log(`🎉 [CHAPTER ${chapterNumber}] Text generation complete!`);
  } catch (error: any) {
    console.error(`❌ [CHAPTER ${chapterNumber}] Error generating text: ${error.message}`);
    console.error(error.stack);
    await ChapterContentModel.findOneAndUpdate(
      { bookId, chapterNumber },
      { status: 'failed', error: error.message }
    );
    throw error;
  }
}

/**
 * Generate chapter image
 */
export async function generateChapterImage(
  bookId: string,
  chapterNumber: number,
  bookType: BookType,
  niche: Niche,
  outline: BookOutline,
  writingStyle?: string
): Promise<void> {
  const chapter = outline.structure.chapters.find(c => c.chapterNumber === chapterNumber);
  if (!chapter) throw new Error(`Chapter ${chapterNumber} not found in outline`);

  const chapterContent = await ChapterContentModel.findOne({ bookId, chapterNumber });
  if (!chapterContent || chapterContent.status !== 'text_complete') {
    throw new Error('Chapter text must be complete before generating image');
  }

  const job = await GenerationJobModel.findOne({ bookId });
  if (!job) throw new Error('Job not found');

  console.log(`🖼️  [CHAPTER ${chapterNumber}] Starting image prompt generation for "${chapter.title}"`);

  // Update chapter status
  await ChapterContentModel.findOneAndUpdate(
    { bookId, chapterNumber },
    { status: 'generating_image_prompt' }
  );

  try {
    // Get prompt - auto-generate if missing
    console.log(`📋 [CHAPTER ${chapterNumber}] Loading image prompt template...`);
    let chapterImagePrompt = await getPromptVersion(bookType, niche, PromptType.CHAPTER_IMAGE, undefined, writingStyle);
    if (!chapterImagePrompt) {
      console.log(`⚠️ [CHAPTER ${chapterNumber}] Image prompt not found. Auto-generating...`);
      await generatePromptsForCombo(bookType, niche, writingStyle);
      chapterImagePrompt = await getPromptVersion(bookType, niche, PromptType.CHAPTER_IMAGE, undefined, writingStyle);
    }
    if (!chapterImagePrompt) {
      throw new Error('Chapter image prompt not found after auto-generation');
    }
    console.log(`✅ [CHAPTER ${chapterNumber}] Using image prompt version ${chapterImagePrompt.version}`);

    // Generate the image prompt using AI
    console.log(`🔧 [CHAPTER ${chapterNumber}] Preparing image prompt with variables...`);
    const imagePromptText = await replaceVariables(chapterImagePrompt.prompt, {
      '{{CHAPTER_NUMBER}}': chapterNumber.toString(),
      '{{CHAPTER_TITLE}}': chapter.title,
      '{{VISUAL_MOTIFS}}': chapter.visualMotifs.join(', '),
      '{{EMOTIONAL_TONE}}': chapter.emotionalTone,
      '{{ART_DIRECTION}}': JSON.stringify(outline.artDirection, null, 2),
      '{{CHAPTER_SUMMARY}}': chapter.summary
    });
    console.log(`📊 [CHAPTER ${chapterNumber}] Visual motifs: ${chapter.visualMotifs.join(', ')}`);
    console.log(`📊 [CHAPTER ${chapterNumber}] Emotional tone: ${chapter.emotionalTone}`);

    console.log(`🤖 [CHAPTER ${chapterNumber}] Calling ${CHAPTER_TEXT_MODEL} to generate image prompt...`);
    const imagePromptResponse = await openai.chat.completions.create({
      model: CHAPTER_TEXT_MODEL,
      messages: [{ role: 'user', content: imagePromptText }]
    });

    const generatedImagePrompt = imagePromptResponse.choices[0].message.content || '';
    const promptTokens = imagePromptResponse.usage?.total_tokens || 0;
    console.log(`✅ [CHAPTER ${chapterNumber}] Image prompt generated (${promptTokens} tokens)`);
    console.log(`📝 [CHAPTER ${chapterNumber}] Generated prompt preview: ${generatedImagePrompt.substring(0, 100)}...`);
    await trackTokenUsage(
      bookId,
      job._id!.toString(),
      `chapter_${chapterNumber}_image_prompt`,
      imagePromptResponse.usage,
      CHAPTER_TEXT_MODEL
    );

    // Save chapter with image prompt (waiting for manual image upload)
    console.log(`💾 [CHAPTER ${chapterNumber}] Saving image prompt to database (waiting for manual upload)...`);
    await ChapterContentModel.findOneAndUpdate(
      { bookId, chapterNumber },
      {
        imagePrompt: generatedImagePrompt,
        status: 'image_prompt_ready' // Status indicates prompt is ready, waiting for image upload
      }
    );

    // Update job progress - mark image prompt as complete, but image upload as pending
    const progress = job.progress || { chapters: {} };
    if (!progress.chapters[chapterNumber]) {
      progress.chapters[chapterNumber] = { text: true, image: false };
    }
    // Note: image is still false until manually uploaded via admin API

    await GenerationJobModel.updateOne(
      { _id: job._id },
      { progress }
    );

    console.log(`🎉 [CHAPTER ${chapterNumber}] Image prompt generation complete! Ready for manual image upload.`);
  } catch (error: any) {
    console.error(`❌ [CHAPTER ${chapterNumber}] Error generating image prompt: ${error.message}`);
    console.error(error.stack);
    await ChapterContentModel.findOneAndUpdate(
      { bookId, chapterNumber },
      { status: 'failed', error: error.message }
    );
    throw error;
  }
}

/**
 * Process a generation job sequentially
 */
export async function processGenerationJob(jobId: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 [JOB ${jobId}] Starting job processing...`);
  console.log(`${'='.repeat(60)}`);
  
  const job = await GenerationJobModel.findById(jobId).populate('bookId');
  if (!job) throw new Error('Job not found');

  const book = await BookModel.findById(job.bookId);
  if (!book) throw new Error('Book not found');

  console.log(`📚 [JOB ${jobId}] Book: "${book.title}" (${book.bookType}/${book.niche})`);
  console.log(`📊 [JOB ${jobId}] Current status: ${job.status}`);
  console.log(`📊 [JOB ${jobId}] Progress: outline=${job.progress?.outline ? '✅' : '❌'}, chapters=${Object.keys(job.progress?.chapters || {}).length}`);

  try {
    // Step 1: Generate outline if not done
    if (!job.progress?.outline) {
      console.log(`\n📝 [JOB ${jobId}] Step 1/3: Generating outline...`);
      await generateOutline(
        book._id!.toString(),
        book.bookType,
        book.niche,
        book.context,
        (book as any).writingStyle
      );
      // Reload job to get updated outlineId
      const updatedJob = await GenerationJobModel.findById(job._id);
      if (updatedJob) {
        Object.assign(job, updatedJob);
      }
      console.log(`✅ [JOB ${jobId}] Step 1/3: Outline generation complete\n`);
    } else {
      console.log(`⏭️  [JOB ${jobId}] Step 1/3: Outline already generated, skipping...\n`);
    }

    // Get outline (either from book or find it)
    let outlineDoc = null;
    if (book.outlineId) {
      outlineDoc = await BookOutlineModel.findById(book.outlineId);
    } else {
      outlineDoc = await BookOutlineModel.findOne({ bookId: book._id });
    }
    if (!outlineDoc) throw new Error('Outline not found');

    // Convert Mongoose document to plain object
    const outline = outlineDoc.toObject() as any;

    // Step 2: Generate chapters sequentially
    console.log(`\n📚 [JOB ${jobId}] Step 2/3: Generating chapters...`);
    await GenerationJobModel.updateOne(
      { _id: job._id },
      { status: 'generating_chapters' }
    );

    const totalChapters = outline.structure.totalChapters;
    console.log(`📊 [JOB ${jobId}] Total chapters to process: ${totalChapters}`);

    for (let i = 1; i <= totalChapters; i++) {
      console.log(`\n${'-'.repeat(60)}`);
      console.log(`📖 [JOB ${jobId}] Processing Chapter ${i}/${totalChapters}`);
      console.log(`${'-'.repeat(60)}`);
      
      // IMPORTANT: Reload job and chapter content from database BEFORE checking
      // This prevents race conditions when multiple workers might be processing
      const freshJob = await GenerationJobModel.findById(job._id);
      if (!freshJob) {
        throw new Error('Job not found');
      }
      const chapterProgress = freshJob.progress?.chapters?.[i];
      
      // Also check the actual chapter content in database (more reliable than progress flags)
      const chapterContent = await ChapterContentModel.findOne({ 
        bookId: book._id, 
        chapterNumber: i 
      });

      // Generate text if not done
      // Check both progress flag AND actual content existence
      const textExists = chapterProgress?.text || (chapterContent && chapterContent.text && chapterContent.status !== 'failed');
      
      if (!textExists) {
        console.log(`📝 [JOB ${jobId}] Chapter ${i}: Generating text...`);
        await generateChapterText(
          book._id!.toString(),
          i,
          book.bookType,
          book.niche,
          book.context,
          outline,
          (book as any).writingStyle
        );
      } else {
        console.log(`⏭️  [JOB ${jobId}] Chapter ${i}: Text already generated, skipping...`);
        // Still update progress if text exists but progress flag wasn't set
        if (!chapterProgress?.text && chapterContent?.text) {
          const progress = freshJob.progress || { chapters: {} };
          if (!progress.chapters[i]) {
            progress.chapters[i] = { text: false, image: false };
          }
          progress.chapters[i].text = true;
          await GenerationJobModel.updateOne(
            { _id: job._id },
            { progress, currentChapter: i }
          );
        }
      }

      // Reload job again after text generation (if it happened)
      const updatedJobAfterText = await GenerationJobModel.findById(job._id);
      const updatedChapterContent = await ChapterContentModel.findOne({ 
        bookId: book._id, 
        chapterNumber: i 
      });
      
      const finalChapterProgress = updatedJobAfterText?.progress?.chapters?.[i];
      const textIsDone = finalChapterProgress?.text || (updatedChapterContent && updatedChapterContent.text);

      // Generate image prompt if text is done but image prompt is not ready
      // Skip if skipImagePrompts is enabled
      const skipImagePrompts = book.context?.skipImagePrompts || false;
      if (!skipImagePrompts) {
        if (textIsDone && !finalChapterProgress?.image && !updatedChapterContent?.imagePrompt) {
          console.log(`🖼️  [JOB ${jobId}] Chapter ${i}: Generating image prompt...`);
          await generateChapterImage(
            book._id!.toString(),
            i,
            book.bookType,
            book.niche,
            outline,
            (book as any).writingStyle
          );
        } else if (updatedChapterContent?.imagePrompt) {
          console.log(`⏭️  [JOB ${jobId}] Chapter ${i}: Image prompt already exists, skipping...`);
        }
      } else {
        console.log(`⏭️  [JOB ${jobId}] Chapter ${i}: Skipping image prompt generation (skipImagePrompts enabled)`);
        // Mark chapter as text_complete if image prompts are skipped
        if (textIsDone && updatedChapterContent && updatedChapterContent.status === 'text_complete') {
          // Keep status as text_complete - no need to change it
        }
      }

      // Update job reference for next iteration
      const latestJob = await GenerationJobModel.findById(job._id);
      if (latestJob) {
        Object.assign(job, latestJob);
      }
    }

    // Step 3: Mark as complete
    console.log(`\n✅ [JOB ${jobId}] Step 3/3: Finalizing...`);
    await GenerationJobModel.updateOne(
      { _id: job._id },
      {
        status: 'complete',
        completedAt: new Date(),
        processingLock: null // Clear the lock
      }
    );

    await BookModel.updateOne(
      { _id: book._id },
      { status: 'complete' }
    );

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎉 [JOB ${jobId}] Job completed successfully!`);
    console.log(`📚 Book: "${book.title}"`);
    console.log(`📊 Total chapters processed: ${totalChapters}`);
    console.log(`${'='.repeat(60)}\n`);
  } catch (error: any) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [JOB ${jobId}] Job failed!`);
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    console.error(`${'='.repeat(60)}\n`);
    await GenerationJobModel.updateOne(
      { _id: job._id },
      { 
        status: 'failed', 
        error: error.message,
        processingLock: null // Clear the lock on failure
      }
    );
    await BookModel.updateOne(
      { _id: book._id },
      { status: 'failed' }
    );
    throw error;
  }
}

// Helper functions
async function replaceVariables(template: string, variables: Record<string, string>): Promise<string> {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
}

async function trackTokenUsage(
  bookId: string,
  jobId: string,
  step: string,
  usage: any,
  model: string
): Promise<void> {
  await TokenUsageModel.create({
    bookId,
    jobId,
    step,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    model
  });
}

function extractKeywords(text: string): string[] {
  // Simple keyword extraction - can be enhanced with NLP
  const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const frequency: Record<string, number> = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

