import { BookType, Niche, PromptType, BOOK_TYPES, NICHES } from '@ai-kindle/shared';
import { PromptVersionModel } from '../models/PromptVersion';

interface PromptTemplate {
  prompt: string;
  variables: string[];
}

/**
 * Generates initial prompts for a book type + niche combination
 */
export async function generatePromptsForCombo(
  bookType: BookType,
  niche: Niche
): Promise<Record<PromptType, PromptTemplate>> {
  const bookTypeMeta = BOOK_TYPES.find(bt => bt.id === bookType);
  const nicheMeta = NICHES.find(n => n.id === niche);

  if (!bookTypeMeta || !nicheMeta) {
    throw new Error('Invalid book type or niche');
  }

  const prompts: Record<PromptType, PromptTemplate> = {
    [PromptType.STYLE_GUIDE]: generateStyleGuidePrompt(bookTypeMeta, nicheMeta),
    [PromptType.ART_DIRECTION]: generateArtDirectionPrompt(bookTypeMeta, nicheMeta),
    [PromptType.OUTLINE]: generateOutlinePrompt(bookTypeMeta, nicheMeta),
    [PromptType.CHAPTER_TEXT]: generateChapterTextPrompt(bookTypeMeta, nicheMeta),
    [PromptType.CHAPTER_IMAGE]: generateChapterImagePrompt(bookTypeMeta, nicheMeta),
    [PromptType.COVER_IMAGE]: generateCoverImagePrompt(bookTypeMeta, nicheMeta),
    [PromptType.PROLOGUE]: generateProloguePrompt(bookTypeMeta, nicheMeta),
    [PromptType.EPILOGUE]: generateEpiloguePrompt(bookTypeMeta, nicheMeta)
  };

  // Save all prompts as version 1
  for (const [promptType, template] of Object.entries(prompts)) {
    await PromptVersionModel.findOneAndUpdate(
      { bookType, niche, promptType: promptType as PromptType, version: 1 },
      {
        bookType,
        niche,
        promptType: promptType as PromptType,
        version: 1,
        prompt: template.prompt,
        variables: template.variables,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );
  }

  return prompts;
}

function generateStyleGuidePrompt(bookType: any, niche: any): PromptTemplate {
  return {
    prompt: `Create a comprehensive style guide for a ${bookType.name} in the ${niche.name} niche.

Book Type: ${bookType.name}
Description: ${bookType.description}
Ideal Use Case: ${bookType.idealUseCase}

Niche: ${niche.name}
Focus: ${niche.focus}

The style guide should include:
1. Tone: Describe the overall tone (e.g., empathetic, humorous, concise, formal, conversational)
2. Voice: Specify the voice perspective (first person, second person, third person, or combination)
3. Lexical Preferences: List preferred words and phrases that align with the niche
4. Lexical Bans: List words and phrases to avoid (clichés, jargon that doesn't fit)
5. Preferred Metaphors: Suggest metaphors that resonate with the niche (if applicable)

Additional Context:
{{BOOK_CONTEXT}}

Output format: JSON with fields: tone, voice, lexicalPreferences (array), lexicalBans (array), preferredMetaphors (array).`,
    variables: ['{{BOOK_CONTEXT}}']
  };
}

function generateArtDirectionPrompt(bookType: any, niche: any): PromptTemplate {
  return {
    prompt: `Create an art direction guide for a ${bookType.name} in the ${niche.name} niche.

Book Type: ${bookType.name}
Niche: ${niche.name}

The art direction should specify:
1. Style: Visual style description (e.g., "hand-inked sketch", "flat pastel", "watercolor illustration", "2D cel-shaded")
2. Palette: Color palette as hex codes (e.g., ["#F8E9D4", "#2F2F2F"])
3. Lighting: Lighting description (e.g., "soft morning light", "soft diffuse", "dramatic shadows")
4. Medium: Art medium description (e.g., "watercolor paper texture", "digital illustration")
5. Composition Template: General composition guidelines (e.g., "Centered subject, rule of thirds, clean background")
6. Recurring Symbols: Symbols or motifs that should appear throughout (e.g., ["compass", "ladder", "key"])

Additional Context:
{{BOOK_CONTEXT}}

Output format: JSON with fields: style, palette (array of hex codes), lighting, medium, compositionTemplate, recurringSymbols (array).`,
    variables: ['{{BOOK_CONTEXT}}']
  };
}

function generateOutlinePrompt(bookType: any, niche: any): PromptTemplate {
  return {
    prompt: `Create a detailed outline for a ${bookType.name} in the ${niche.name} niche.

Book Type: ${bookType.name}
Core Format: ${bookType.coreFormat}
Niche: ${niche.name}
Focus: ${niche.focus}

Context:
{{BOOK_CONTEXT}}

Style Guide:
{{STYLE_GUIDE}}

Art Direction:
{{ART_DIRECTION}}

{{CHAPTER_COUNT_HINT}}

Create an outline with the appropriate number of chapters for this book. The context may specify a desired chapter count - if so, aim for that number. Otherwise, use 8-12 chapters (adjust based on book type). For each chapter, provide:
- chapterNumber: Sequential number
- title: Engaging chapter title
- summary: 2-3 sentence summary of the chapter content
- visualMotifs: Array of visual elements/keywords for image generation (e.g., ["compass", "map", "flashlight"])
- emotionalTone: The emotional tone of this chapter (e.g., "determined optimism", "calm reflection")
- wordCountTarget: Target word count for this chapter
- sectionHeadings: Array of main section headings within the chapter

Output format: JSON with structure:
{
  "totalChapters": number,
  "chapters": [
    {
      "chapterNumber": number,
      "title": string,
      "summary": string,
      "visualMotifs": string[],
      "emotionalTone": string,
      "wordCountTarget": number,
      "sectionHeadings": string[]
    }
  ]
}`,
    variables: ['{{BOOK_CONTEXT}}', '{{STYLE_GUIDE}}', '{{ART_DIRECTION}}', '{{CHAPTER_COUNT_HINT}}']
  };
}

function generateChapterTextPrompt(bookType: any, niche: any): PromptTemplate {
  return {
    prompt: `You are creating content for a ${bookType.name} in the ${niche.name} niche.

Chapter Information:
{{CHAPTER_SUMMARY}}

Book Context:
{{BOOK_CONTEXT}}

Style Guide:
{{SERIES_STYLE_GUIDE}}

Previous Chapter Summary (for thematic callbacks):
{{PREVIOUS_CHAPTER_SUMMARY}}

Write Chapter {{CHAPTER_NUMBER}}: "{{CHAPTER_TITLE}}"

Requirements:
- Target word count: {{WORD_COUNT_TARGET}}
- Tone: {{EMOTIONAL_TONE}}
- Visual motifs to reference: {{VISUAL_MOTIFS}}
- Follow the style guide strictly (tone, voice, lexical preferences/bans)
- Use structured Markdown format with H2 sections as specified in sectionHeadings
- Include {{CHAPTER_STRUCTURE}} if provided
- Add a hook in the introduction
- Reference previous chapter concept if this is not chapter 1
- Include takeaways or exercises if appropriate for this book type

Output: Markdown formatted chapter text matching the target word count and following all style guidelines.`,
    variables: [
      '{{CHAPTER_SUMMARY}}',
      '{{BOOK_CONTEXT}}',
      '{{SERIES_STYLE_GUIDE}}',
      '{{PREVIOUS_CHAPTER_SUMMARY}}',
      '{{CHAPTER_NUMBER}}',
      '{{CHAPTER_TITLE}}',
      '{{WORD_COUNT_TARGET}}',
      '{{EMOTIONAL_TONE}}',
      '{{VISUAL_MOTIFS}}',
      '{{CHAPTER_STRUCTURE}}'
    ]
  };
}

function generateCoverImagePrompt(bookType: any, niche: any): PromptTemplate {
  return {
    prompt: `Create a cover image prompt for a ${bookType.name} in the ${niche.name} niche.

Book Context:
{{BOOK_CONTEXT}}

Style Guide:
{{STYLE_GUIDE}}

Art Direction:
{{ART_DIRECTION}}

Book Outline Summary:
{{OUTLINE_SUMMARY}}

Key Visual Motifs from Chapters:
{{VISUAL_MOTIFS}}

Generate a detailed image generation prompt for the book cover that:
- Captures the essence and theme of the book based on the outline and chapter summaries
- Reflects the art direction style, palette, and visual motifs
- Incorporates recurring visual motifs from the chapters
- Is appropriate for the target audience
- Includes composition guidelines (e.g., portrait orientation for Kindle covers, typically 1600x2560 pixels)
- Specifies the mood and atmosphere
- References key visual elements or symbols from the book content
- Creates a cohesive visual representation that ties together themes from multiple chapters

Output a single, comprehensive image prompt that can be used with an image generation AI to create the book cover.`,
    variables: ['{{BOOK_CONTEXT}}', '{{STYLE_GUIDE}}', '{{ART_DIRECTION}}', '{{OUTLINE_SUMMARY}}', '{{VISUAL_MOTIFS}}']
  };
}

function generateProloguePrompt(bookType: any, niche: any): PromptTemplate {
  return {
    prompt: `Write a prologue for a ${bookType.name} in the ${niche.name} niche.

Book Context:
{{BOOK_CONTEXT}}

Style Guide:
{{STYLE_GUIDE}}

Book Outline Summary:
{{OUTLINE_SUMMARY}}

The prologue should:
- Introduce the book's main theme or purpose
- Set the tone and expectations for readers
- Be engaging and hook the reader's interest
- Match the style guide (tone, voice, lexical preferences)
- Be appropriate length for the book type (typically 300-800 words)
- Provide context or background if needed

Output the prologue text in the same format/style as the chapters.`,
    variables: ['{{BOOK_CONTEXT}}', '{{STYLE_GUIDE}}', '{{OUTLINE_SUMMARY}}']
  };
}

function generateEpiloguePrompt(bookType: any, niche: any): PromptTemplate {
  return {
    prompt: `Write an epilogue for a ${bookType.name} in the ${niche.name} niche.

Book Context:
{{BOOK_CONTEXT}}

Style Guide:
{{STYLE_GUIDE}}

Book Outline Summary:
{{OUTLINE_SUMMARY}}

The epilogue should:
- Provide closure or reflection on the book's themes
- Summarize key takeaways or lessons
- Encourage the reader to apply what they've learned
- Match the style guide (tone, voice, lexical preferences)
- Be appropriate length for the book type (typically 300-800 words)
- End on a positive, inspiring note when appropriate

Output the epilogue text in the same format/style as the chapters.`,
    variables: ['{{BOOK_CONTEXT}}', '{{STYLE_GUIDE}}', '{{OUTLINE_SUMMARY}}']
  };
}

function generateChapterImagePrompt(bookType: any, niche: any): PromptTemplate {
  return {
    prompt: `Generate an image prompt for Chapter {{CHAPTER_NUMBER}} of a ${bookType.name} in the ${niche.name} niche.

Chapter Title: {{CHAPTER_TITLE}}
Visual Motifs: {{VISUAL_MOTIFS}}
Emotional Tone: {{EMOTIONAL_TONE}}

Art Direction:
{{ART_DIRECTION}}

Chapter Summary:
{{CHAPTER_SUMMARY}}

Create a detailed image generation prompt that:
- Incorporates the visual motifs
- Reflects the emotional tone
- Follows the art direction (style, palette, lighting, medium, composition)
- Includes recurring symbols if applicable
- Uses negative prompting: "No watermark, no signature, no text on image, no deformed anatomy"

Output: A single detailed image generation prompt string optimized for AI image generation (e.g., DALL-E, Midjourney, Stable Diffusion).`,
    variables: [
      '{{CHAPTER_NUMBER}}',
      '{{CHAPTER_TITLE}}',
      '{{VISUAL_MOTIFS}}',
      '{{EMOTIONAL_TONE}}',
      '{{ART_DIRECTION}}',
      '{{CHAPTER_SUMMARY}}'
    ]
  };
}

/**
 * Get the latest prompt version for a combo
 */
export async function getPromptVersion(
  bookType: BookType,
  niche: Niche,
  promptType: PromptType,
  version?: number
) {
  const query: any = { bookType, niche, promptType };
  if (version) {
    query.version = version;
  } else {
    // Get latest version
    const latest = await PromptVersionModel.findOne(query).sort({ version: -1 });
    return latest;
  }
  return await PromptVersionModel.findOne(query);
}

/**
 * Get all prompt versions for a combo (for admin view)
 */
export async function getAllPromptVersions(bookType: BookType, niche: Niche) {
  return await PromptVersionModel.find({ bookType, niche }).sort({ promptType: 1, version: -1 });
}

