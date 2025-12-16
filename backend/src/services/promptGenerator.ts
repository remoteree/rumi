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
  niche: Niche,
  writingStyle?: string
): Promise<Record<PromptType, PromptTemplate>> {
  const bookTypeMeta = BOOK_TYPES.find(bt => bt.id === bookType);
  const nicheMeta = NICHES.find(n => n.id === niche);
  
  // Fetch writing style from database if provided
  let writingStyleMeta: { name: string; description: string } | undefined = undefined;
  if (writingStyle) {
    try {
      const { WritingStyleModel } = await import('../models/WritingStyle');
      const style = await WritingStyleModel.findOne({ name: writingStyle });
      if (style) {
        writingStyleMeta = { name: style.name, description: style.description };
      } else {
        // Fallback: use the name as-is if not found in database
        writingStyleMeta = { name: writingStyle, description: 'Custom writing style' };
      }
    } catch (error) {
      // Fallback if database lookup fails
      writingStyleMeta = { name: writingStyle, description: 'Custom writing style' };
    }
  }

  if (!bookTypeMeta || !nicheMeta) {
    throw new Error('Invalid book type or niche');
  }

  const prompts: Record<PromptType, PromptTemplate> = {
    [PromptType.STYLE_GUIDE]: generateStyleGuidePrompt(bookTypeMeta, nicheMeta, writingStyleMeta),
    [PromptType.ART_DIRECTION]: generateArtDirectionPrompt(bookTypeMeta, nicheMeta, writingStyleMeta),
    [PromptType.OUTLINE]: generateOutlinePrompt(bookTypeMeta, nicheMeta, writingStyleMeta),
    [PromptType.CHAPTER_TEXT]: generateChapterTextPrompt(bookTypeMeta, nicheMeta, writingStyleMeta),
    [PromptType.CHAPTER_IMAGE]: generateChapterImagePrompt(bookTypeMeta, nicheMeta, writingStyleMeta),
    [PromptType.COVER_IMAGE]: generateCoverImagePrompt(bookTypeMeta, nicheMeta, writingStyleMeta),
    [PromptType.PROLOGUE]: generateProloguePrompt(bookTypeMeta, nicheMeta, writingStyleMeta),
    [PromptType.EPILOGUE]: generateEpiloguePrompt(bookTypeMeta, nicheMeta, writingStyleMeta)
  };

  // Save all prompts as version 1
  // Normalize writingStyle: undefined/null/empty string all become null for consistency
  const normalizedWritingStyle = writingStyle && writingStyle.trim() ? writingStyle.trim() : null;
  
  for (const [promptType, template] of Object.entries(prompts)) {
    try {
      // First, check if there's an existing prompt with the exact writingStyle we want
      const exactMatch = await PromptVersionModel.findOne({
        bookType,
        niche,
        writingStyle: normalizedWritingStyle,
        promptType: promptType as PromptType,
        version: 1
      });
      
      if (exactMatch) {
        // Update existing prompt
        exactMatch.prompt = template.prompt;
        exactMatch.variables = template.variables;
        if (exactMatch.metadata) {
          exactMatch.metadata.updatedAt = new Date();
        } else {
          exactMatch.metadata = { updatedAt: new Date() };
        }
        await exactMatch.save();
        continue;
      }
      
      // If no exact match, check for any existing prompts with same bookType/niche/promptType/version
      // (might have different writingStyle - these would conflict with new index)
      const conflictingPrompts = await PromptVersionModel.find({
        bookType,
        niche,
        promptType: promptType as PromptType,
        version: 1
      });
      
      // Delete any conflicting prompts (they have different writingStyle)
      if (conflictingPrompts.length > 0) {
        for (const conflicting of conflictingPrompts) {
          const conflictingWritingStyle = conflicting.writingStyle || null;
          if (conflictingWritingStyle !== normalizedWritingStyle) {
            await PromptVersionModel.findByIdAndDelete(conflicting._id);
            console.log(`🔄 [PROMPTS] Removing conflicting prompt ${promptType} for ${bookType}/${niche} (writingStyle: ${conflictingWritingStyle})`);
          }
        }
      }
      
      // Now create the new prompt with correct writingStyle
      await PromptVersionModel.create({
        bookType,
        niche,
        writingStyle: normalizedWritingStyle,
        promptType: promptType as PromptType,
        version: 1,
        prompt: template.prompt,
        variables: template.variables,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
    } catch (error: any) {
      // If we still get a duplicate key error, try to find and update
      if (error.code === 11000) {
        const existing = await PromptVersionModel.findOne({
          bookType,
          niche,
          writingStyle: normalizedWritingStyle,
          promptType: promptType as PromptType,
          version: 1
        });
        
        if (existing) {
          existing.prompt = template.prompt;
          existing.variables = template.variables;
          if (existing.metadata) {
            existing.metadata.updatedAt = new Date();
          } else {
            existing.metadata = { updatedAt: new Date() };
          }
          await existing.save();
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  return prompts;
}

function generateStyleGuidePrompt(bookType: any, niche: any, writingStyle?: any): PromptTemplate {
  const writingStyleSection = writingStyle 
    ? `\nWriting Style: ${writingStyle.name}\nDescription: ${writingStyle.description}\n\nIMPORTANT: The writing style "${writingStyle.name}" should be strongly reflected in the tone, voice, and lexical choices.`
    : '';

  return {
    prompt: `Create a comprehensive style guide for a ${bookType.name} in the ${niche.name} niche.

Book Type: ${bookType.name}
Description: ${bookType.description}
Ideal Use Case: ${bookType.idealUseCase}

Niche: ${niche.name}
Focus: ${niche.focus}${writingStyleSection}

The style guide should include:
1. Tone: Describe the overall tone (e.g., empathetic, humorous, concise, formal, conversational)${writingStyle ? ` - MUST align with the "${writingStyle.name}" writing style` : ''}
2. Voice: Specify the voice perspective (first person, second person, third person, or combination)${writingStyle ? ` - MUST align with the "${writingStyle.name}" writing style` : ''}
3. Lexical Preferences: List preferred words and phrases that align with the niche${writingStyle ? ` and the "${writingStyle.name}" writing style` : ''}
4. Lexical Bans: List words and phrases to avoid (clichés, jargon that doesn't fit)${writingStyle ? ` - MUST avoid words/phrases that conflict with the "${writingStyle.name}" style` : ''}
5. Preferred Metaphors: Suggest metaphors that resonate with the niche (if applicable)${writingStyle ? ` and the "${writingStyle.name}" writing style` : ''}

Additional Context:
{{BOOK_CONTEXT}}

Output format: JSON with fields: tone, voice, lexicalPreferences (array), lexicalBans (array), preferredMetaphors (array).`,
    variables: ['{{BOOK_CONTEXT}}']
  };
}

function generateArtDirectionPrompt(bookType: any, niche: any, writingStyle?: any): PromptTemplate {
  const writingStyleSection = writingStyle 
    ? `\nWriting Style: ${writingStyle.name}\nDescription: ${writingStyle.description}\n\nIMPORTANT: The visual style should complement and enhance the "${writingStyle.name}" writing style.`
    : '';

  return {
    prompt: `Create an art direction guide for a ${bookType.name} in the ${niche.name} niche.

Book Type: ${bookType.name}
Niche: ${niche.name}${writingStyleSection}

The art direction should specify:
1. Style: Visual style description (e.g., "hand-inked sketch", "flat pastel", "watercolor illustration", "2D cel-shaded")${writingStyle ? ` - Should complement the "${writingStyle.name}" writing style` : ''}
2. Palette: Color palette as hex codes (e.g., ["#F8E9D4", "#2F2F2F"])${writingStyle ? ` - Colors should reflect the mood and tone of the "${writingStyle.name}" style` : ''}
3. Lighting: Lighting description (e.g., "soft morning light", "soft diffuse", "dramatic shadows")${writingStyle ? ` - Should match the emotional tone of the "${writingStyle.name}" style` : ''}
4. Medium: Art medium description (e.g., "watercolor paper texture", "digital illustration")
5. Composition Template: General composition guidelines (e.g., "Centered subject, rule of thirds, clean background")
6. Recurring Symbols: Symbols or motifs that should appear throughout (e.g., ["compass", "ladder", "key"])

Additional Context:
{{BOOK_CONTEXT}}

Output format: JSON with fields: style, palette (array of hex codes), lighting, medium, compositionTemplate, recurringSymbols (array).`,
    variables: ['{{BOOK_CONTEXT}}']
  };
}

function generateOutlinePrompt(bookType: any, niche: any, writingStyle?: any): PromptTemplate {
  const writingStyleSection = writingStyle 
    ? `\nWriting Style: ${writingStyle.name}\nDescription: ${writingStyle.description}\n\nIMPORTANT: The chapter structure, titles, and content should reflect the "${writingStyle.name}" writing style.`
    : '';

  return {
    prompt: `Create a detailed outline for a ${bookType.name} in the ${niche.name} niche.

Book Type: ${bookType.name}
Core Format: ${bookType.coreFormat}
Niche: ${niche.name}
Focus: ${niche.focus}${writingStyleSection}

Context:
{{BOOK_CONTEXT}}

Style Guide:
{{STYLE_GUIDE}}

Art Direction:
{{ART_DIRECTION}}

{{CURRENT_TRENDS}}

{{CHAPTER_COUNT_HINT}}

Create an outline with the appropriate number of chapters for this book. The context may specify a desired chapter count - if so, aim for that number. Otherwise, use 8-12 chapters (adjust based on book type). 

{{CURRENT_TRENDS_INSTRUCTIONS}}

${writingStyle ? `IMPORTANT: All chapter titles, summaries, and content should be written in a way that reflects the "${writingStyle.name}" writing style.` : ''}

For each chapter, provide:
- chapterNumber: Sequential number
- title: Engaging chapter title${writingStyle ? ` (should reflect the "${writingStyle.name}" style)` : ''}
- summary: 2-3 sentence summary of the chapter content${writingStyle ? ` (written in a way that reflects the "${writingStyle.name}" style)` : ''}
- visualMotifs: Array of visual elements/keywords for image generation (e.g., ["compass", "map", "flashlight"])
- emotionalTone: The emotional tone of this chapter (e.g., "determined optimism", "calm reflection")${writingStyle ? ` (should align with the "${writingStyle.name}" style)` : ''}
- wordCountTarget: Target word count for this chapter
- sectionHeadings: Array of main section headings within the chapter${writingStyle ? ` (should reflect the "${writingStyle.name}" style)` : ''}

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
    variables: ['{{BOOK_CONTEXT}}', '{{STYLE_GUIDE}}', '{{ART_DIRECTION}}', '{{CURRENT_TRENDS}}', '{{CURRENT_TRENDS_INSTRUCTIONS}}', '{{CHAPTER_COUNT_HINT}}']
  };
}

function generateChapterTextPrompt(bookType: any, niche: any, writingStyle?: any): PromptTemplate {
  const writingStyleSection = writingStyle 
    ? `\nWriting Style: ${writingStyle.name}\nDescription: ${writingStyle.description}\n\nCRITICAL: The entire chapter must be written in the "${writingStyle.name}" writing style. This is a fundamental requirement that overrides other style considerations.`
    : '';

  return {
    prompt: `You are creating content for a ${bookType.name} in the ${niche.name} niche.${writingStyleSection}

Chapter Information:
{{CHAPTER_SUMMARY}}

Book Context:
{{BOOK_CONTEXT}}

Style Guide:
{{SERIES_STYLE_GUIDE}}

Previous Chapters Summary (for thematic callbacks and to avoid repetition):
{{PREVIOUS_CHAPTER_SUMMARY}}

Write Chapter {{CHAPTER_NUMBER}}: "{{CHAPTER_TITLE}}"

{{CURRENT_NEWS}}

Requirements:
- Target word count: {{WORD_COUNT_TARGET}}
- Tone: {{EMOTIONAL_TONE}}
- Visual motifs to reference: {{VISUAL_MOTIFS}}
- Follow the style guide strictly (tone, voice, lexical preferences/bans)${writingStyle ? `\n- CRITICAL: Write the entire chapter in the "${writingStyle.name}" writing style. This is the primary writing style requirement.` : ''}
- Use structured Markdown format with H2 sections as specified in sectionHeadings
- Include {{CHAPTER_STRUCTURE}} if provided
- Add a hook in the introduction
- CRITICAL: Review the previous chapters summary above. Ensure this chapter does NOT repeat content, concepts, or examples that were already covered in previous chapters. Build upon previous chapters rather than rehashing them.
- Reference previous chapter concepts naturally if this is not chapter 1, but avoid repetition
- Include takeaways or exercises if appropriate for this book type
- If current news is provided above, naturally incorporate relevant recent examples, trends, or developments where appropriate, but maintain focus on explaining concepts using OpenAI's capabilities
- CRITICAL: Never claim first-hand experience. Avoid phrases like "I spoke to", "I met", "I interviewed", "I witnessed", "I saw", "I experienced", "I visited", "I talked with", or any other claims of direct personal experience. Write from a third-person perspective or use general observations and research-based information instead.

Output: Markdown formatted chapter text matching the target word count and following all style guidelines${writingStyle ? `, written in the "${writingStyle.name}" writing style` : ''}.`,
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
      '{{CHAPTER_STRUCTURE}}',
      '{{CURRENT_NEWS}}'
    ]
  };
}

function generateCoverImagePrompt(bookType: any, niche: any, writingStyle?: any): PromptTemplate {
  const writingStyleSection = writingStyle 
    ? `\nWriting Style: ${writingStyle.name}\nDescription: ${writingStyle.description}\n\nIMPORTANT: The cover image should visually represent the mood and tone of the "${writingStyle.name}" writing style.`
    : '';

  return {
    prompt: `Create a cover image prompt for a ${bookType.name} in the ${niche.name} niche.${writingStyleSection}

Book Title: {{BOOK_TITLE}}

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
- MUST include the book title "{{BOOK_TITLE}}" prominently displayed on the cover
- MUST specify exact dimensions: 1600x2560 pixels (portrait orientation)
- Captures the essence and theme of the book based on the outline and chapter summaries
- Reflects the art direction style, palette, and visual motifs
- Incorporates recurring visual motifs from the chapters
- Is appropriate for the target audience
- Specifies the mood and atmosphere${writingStyle ? ` that aligns with the "${writingStyle.name}" writing style` : ''}
- References key visual elements or symbols from the book content
- Creates a cohesive visual representation that ties together themes from multiple chapters
- Ensures the book title is clearly visible and readable when rendered at 1600x2560 pixels

Output a single, comprehensive image prompt that can be used with an image generation AI to create the book cover. The prompt must explicitly include the book title and specify 1600x2560 pixel dimensions.`,
    variables: ['{{BOOK_TITLE}}', '{{BOOK_CONTEXT}}', '{{STYLE_GUIDE}}', '{{ART_DIRECTION}}', '{{OUTLINE_SUMMARY}}', '{{VISUAL_MOTIFS}}']
  };
}

function generateProloguePrompt(bookType: any, niche: any, writingStyle?: any): PromptTemplate {
  const writingStyleSection = writingStyle 
    ? `\nWriting Style: ${writingStyle.name}\nDescription: ${writingStyle.description}\n\nCRITICAL: The prologue must be written in the "${writingStyle.name}" writing style. This is a fundamental requirement.`
    : '';

  return {
    prompt: `Write a prologue for a ${bookType.name} in the ${niche.name} niche.${writingStyleSection}

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
- Match the style guide (tone, voice, lexical preferences)${writingStyle ? `\n- CRITICAL: Be written in the "${writingStyle.name}" writing style. This is the primary writing style requirement.` : ''}
- Be appropriate length for the book type (typically 300-800 words)
- Provide context or background if needed
- CRITICAL: Never claim first-hand experience. Avoid phrases like "I spoke to", "I met", "I interviewed", "I witnessed", "I saw", "I experienced", "I visited", "I talked with", or any other claims of direct personal experience. Write from a third-person perspective or use general observations and research-based information instead.

Output the prologue text in the same format/style as the chapters${writingStyle ? `, written in the "${writingStyle.name}" writing style` : ''}.`,
    variables: ['{{BOOK_CONTEXT}}', '{{STYLE_GUIDE}}', '{{OUTLINE_SUMMARY}}']
  };
}

function generateEpiloguePrompt(bookType: any, niche: any, writingStyle?: any): PromptTemplate {
  const writingStyleSection = writingStyle 
    ? `\nWriting Style: ${writingStyle.name}\nDescription: ${writingStyle.description}\n\nCRITICAL: The epilogue must be written in the "${writingStyle.name}" writing style. This is a fundamental requirement.`
    : '';

  return {
    prompt: `Write an epilogue for a ${bookType.name} in the ${niche.name} niche.${writingStyleSection}

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
- Match the style guide (tone, voice, lexical preferences)${writingStyle ? `\n- CRITICAL: Be written in the "${writingStyle.name}" writing style. This is the primary writing style requirement.` : ''}
- Be appropriate length for the book type (typically 300-800 words)
- End on a positive, inspiring note when appropriate
- CRITICAL: Never claim first-hand experience. Avoid phrases like "I spoke to", "I met", "I interviewed", "I witnessed", "I saw", "I experienced", "I visited", "I talked with", or any other claims of direct personal experience. Write from a third-person perspective or use general observations and research-based information instead.

Output the epilogue text in the same format/style as the chapters${writingStyle ? `, written in the "${writingStyle.name}" writing style` : ''}.`,
    variables: ['{{BOOK_CONTEXT}}', '{{STYLE_GUIDE}}', '{{OUTLINE_SUMMARY}}']
  };
}

function generateChapterImagePrompt(bookType: any, niche: any, writingStyle?: any): PromptTemplate {
  const writingStyleSection = writingStyle 
    ? `\nWriting Style: ${writingStyle.name}\nDescription: ${writingStyle.description}\n\nIMPORTANT: The image should visually represent the mood and tone of the "${writingStyle.name}" writing style.`
    : '';

  return {
    prompt: `Generate an image prompt for Chapter {{CHAPTER_NUMBER}} of a ${bookType.name} in the ${niche.name} niche.${writingStyleSection}

Chapter Title: {{CHAPTER_TITLE}}
Visual Motifs: {{VISUAL_MOTIFS}}
Emotional Tone: {{EMOTIONAL_TONE}}

Art Direction:
{{ART_DIRECTION}}

Chapter Summary:
{{CHAPTER_SUMMARY}}

Create a detailed image generation prompt that:
- MUST specify exact dimensions: 1600x2560 pixels (portrait orientation)
- Incorporates the visual motifs
- Reflects the emotional tone${writingStyle ? ` and the "${writingStyle.name}" writing style mood` : ''}
- Follows the art direction (style, palette, lighting, medium, composition)
- Includes recurring symbols if applicable
- Uses negative prompting: "No watermark, no signature, no text on image, no deformed anatomy"
- Ensures the image is optimized for 1600x2560 pixel dimensions

Output: A single detailed image generation prompt string optimized for AI image generation (e.g., DALL-E, Midjourney, Stable Diffusion). The prompt must explicitly specify 1600x2560 pixel dimensions.`,
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
  version?: number,
  writingStyle?: string
) {
  // Normalize writingStyle: undefined/null/empty string all become null for consistency
  const normalizedWritingStyle = writingStyle && writingStyle.trim() ? writingStyle.trim() : null;
  
  const query: any = { 
    bookType, 
    niche, 
    promptType,
    writingStyle: normalizedWritingStyle
  };
  
  if (version) {
    query.version = version;
    const result = await PromptVersionModel.findOne(query);
    return result;
  } else {
    // Get latest version
    const latest = await PromptVersionModel.findOne(query).sort({ version: -1 });
    return latest;
  }
}

/**
 * Get all prompt versions for a combo (for admin view)
 */
export async function getAllPromptVersions(bookType: BookType, niche: Niche) {
  return await PromptVersionModel.find({ bookType, niche }).sort({ promptType: 1, version: -1 });
}

