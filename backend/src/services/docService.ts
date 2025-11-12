import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Document, Packer, Paragraph, HeadingLevel, ImageRun, AlignmentType } from 'docx';
import { BookModel } from '../models/Book';
import { BookOutlineModel } from '../models/BookOutline';
import { ChapterContentModel } from '../models/ChapterContent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create output directory for published books
const PUBLISH_DIR = path.resolve(__dirname, '../../published');

/**
 * Convert markdown text to docx paragraphs
 */
function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = markdown.split('\n');
  
  let currentParagraph: string[] = [];
  let inList = false;
  let listItems: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Empty line - end current paragraph/list
    if (!line) {
      if (currentParagraph.length > 0) {
        paragraphs.push(new Paragraph({
          text: currentParagraph.join(' '),
          spacing: { after: 200 }
        }));
        currentParagraph = [];
      }
      if (listItems.length > 0) {
        listItems.forEach(item => {
          paragraphs.push(new Paragraph({
            text: item.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''),
            bullet: { level: 0 },
            spacing: { after: 100 }
          }));
        });
        listItems = [];
        inList = false;
      }
      continue;
    }
    
    // Headings
    if (line.startsWith('# ')) {
      if (currentParagraph.length > 0) {
        paragraphs.push(new Paragraph({
          text: currentParagraph.join(' '),
          spacing: { after: 200 }
        }));
        currentParagraph = [];
      }
      paragraphs.push(new Paragraph({
        text: line.substring(2).trim(),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }));
      continue;
    }
    
    if (line.startsWith('## ')) {
      if (currentParagraph.length > 0) {
        paragraphs.push(new Paragraph({
          text: currentParagraph.join(' '),
          spacing: { after: 200 }
        }));
        currentParagraph = [];
      }
      paragraphs.push(new Paragraph({
        text: line.substring(3).trim(),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 }
      }));
      continue;
    }
    
    if (line.startsWith('### ')) {
      if (currentParagraph.length > 0) {
        paragraphs.push(new Paragraph({
          text: currentParagraph.join(' '),
          spacing: { after: 200 }
        }));
        currentParagraph = [];
      }
      paragraphs.push(new Paragraph({
        text: line.substring(4).trim(),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 200 }
      }));
      continue;
    }
    
    // Lists
    if (line.match(/^[-*]\s+/) || line.match(/^\d+\.\s+/)) {
      if (currentParagraph.length > 0) {
        paragraphs.push(new Paragraph({
          text: currentParagraph.join(' '),
          spacing: { after: 200 }
        }));
        currentParagraph = [];
      }
      listItems.push(line);
      inList = true;
      continue;
    }
    
    // Regular paragraph text
    if (inList && listItems.length > 0) {
      // Flush list before starting new paragraph
      listItems.forEach(item => {
        paragraphs.push(new Paragraph({
          text: item.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''),
          bullet: { level: 0 },
          spacing: { after: 100 }
        }));
      });
      listItems = [];
      inList = false;
    }
    
    // Process inline formatting
    const formattedText = processInlineFormatting(line);
    currentParagraph.push(formattedText);
  }
  
  // Flush remaining content
  if (currentParagraph.length > 0) {
    paragraphs.push(new Paragraph({
      text: currentParagraph.join(' '),
      spacing: { after: 200 }
    }));
  }
  
  if (listItems.length > 0) {
    listItems.forEach(item => {
      paragraphs.push(new Paragraph({
        text: item.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''),
        bullet: { level: 0 },
        spacing: { after: 100 }
      }));
    });
  }
  
  return paragraphs;
}

/**
 * Process inline markdown formatting (bold, italic, etc.)
 */
function processInlineFormatting(text: string): string {
  // Remove markdown formatting for now - docx library handles styling
  // We can enhance this later to preserve bold/italic
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
    .replace(/\*(.*?)\*/g, '$1') // Italic
    .replace(/`(.*?)`/g, '$1'); // Code
}

/**
 * Generate DOCX file for a book
 */
export async function generateDOCX(bookId: string): Promise<string> {
  const book = await BookModel.findById(bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  const outline = book.outlineId 
    ? await BookOutlineModel.findById(book.outlineId)
    : await BookOutlineModel.findOne({ bookId });

  if (!outline) {
    throw new Error('Book outline not found');
  }

  const chapters = await ChapterContentModel.find({ bookId })
    .sort({ chapterNumber: 1 });

  if (chapters.length === 0) {
    throw new Error('No chapters found');
  }

  // Ensure publish directory exists
  await fs.mkdir(PUBLISH_DIR, { recursive: true });

  const children: (Paragraph | ImageRun)[] = [];

  // Title page
  children.push(
    new Paragraph({
      text: book.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    })
  );

  if (book.context.description) {
    children.push(
      new Paragraph({
        text: book.context.description,
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 }
      })
    );
  }

  children.push(new Paragraph({ text: '', pageBreakBefore: true }));

  // Table of Contents
  children.push(
    new Paragraph({
      text: 'Table of Contents',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 }
    })
  );

  // Add Prologue to TOC if exists
  if (book.prologue) {
    children.push(
      new Paragraph({
        text: 'Prologue',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );
  }

  // Add all chapter headings to TOC
  for (const chapter of chapters) {
    if (!chapter.text) continue;
    const chapterTitle = outline.structure.chapters.find(c => c.chapterNumber === chapter.chapterNumber)?.title || `Chapter ${chapter.chapterNumber}`;
    children.push(
      new Paragraph({
        text: `Chapter ${chapter.chapterNumber}: ${chapterTitle}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );
  }

  // Add Epilogue to TOC if exists
  if (book.epilogue) {
    children.push(
      new Paragraph({
        text: 'Epilogue',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );
  }

  children.push(new Paragraph({ text: '', pageBreakBefore: true }));

  // Cover image if available
  if (book.coverImageUrl) {
    try {
      let imageData: Buffer;
      
      if (book.coverImageUrl.startsWith('/')) {
        // Local file path
        imageData = await fs.readFile(book.coverImageUrl);
      } else if (book.coverImageUrl.startsWith('http')) {
        // Download from external URL
        const response = await fetch(book.coverImageUrl);
        imageData = Buffer.from(await response.arrayBuffer());
      } else {
        // Try as relative path
        const imagePath = path.resolve(__dirname, '../../', book.coverImageUrl);
        imageData = await fs.readFile(imagePath);
      }

      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: imageData,
              transformation: {
                width: 400,
                height: 640
              }
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        })
      );
    } catch (error: any) {
      console.warn(`Failed to include cover image: ${error.message}`);
    }
  }

  // Prologue if exists
  if (book.prologue) {
    let prologueContent = book.prologue.trim();
    // Remove "Prologue" heading if content starts with it
    const prologueMatch = prologueContent.match(/^#*\s*Prologue\s*:?\s*/i);
    if (prologueMatch) {
      prologueContent = prologueContent.substring(prologueMatch[0].length).trim();
    }

    children.push(
      new Paragraph({
        text: 'Prologue',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 300 }
      })
    );

    const prologueParagraphs = markdownToDocxParagraphs(prologueContent);
    children.push(...prologueParagraphs);
    children.push(new Paragraph({ text: '', pageBreakBefore: true }));
  }

  // Chapters
  const publishWithoutChapterImages = book.publishWithoutChapterImages || false;

  for (const chapter of chapters) {
    if (!chapter.text) continue;

    // Chapter title
    const chapterTitle = outline.structure.chapters.find(c => c.chapterNumber === chapter.chapterNumber)?.title || `Chapter ${chapter.chapterNumber}`;
    
    // Remove duplicate chapter title if it appears in content
    let chapterText = chapter.text.trim();
    const titleMatch = chapterText.match(new RegExp(`^#*\\s*${chapterTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:?\\s*`, 'i'));
    if (titleMatch) {
      chapterText = chapterText.substring(titleMatch[0].length).trim();
    }

    // Remove "Chapter X" if present
    const chapterNumberMatch = chapterText.match(/^#*\s*Chapter\s+\d+\s*:?\s*/i);
    if (chapterNumberMatch) {
      chapterText = chapterText.substring(chapterNumberMatch[0].length).trim();
    }

    children.push(
      new Paragraph({
        text: chapterTitle,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 300 }
      })
    );

    // Chapter image if available and not disabled
    if (!publishWithoutChapterImages && chapter.imageUrl) {
      try {
        let imageData: Buffer;
        
        if (chapter.imageUrl.startsWith('/')) {
          // Local file path
          imageData = await fs.readFile(chapter.imageUrl);
        } else if (chapter.imageUrl.startsWith('http')) {
          // Download from external URL
          const response = await fetch(chapter.imageUrl);
          imageData = Buffer.from(await response.arrayBuffer());
        } else {
          // Try as relative path - check uploads directory
          const imagePath = path.resolve(__dirname, '../../src/uploads/images/books', bookId, `chapter_${chapter.chapterNumber}.png`);
          try {
            imageData = await fs.readFile(imagePath);
          } catch {
            // Try other extensions
            let found = false;
            for (const ext of ['jpg', 'jpeg', 'gif', 'webp']) {
              try {
                const altPath = imagePath.replace(/\.png$/, `.${ext}`);
                imageData = await fs.readFile(altPath);
                found = true;
                break;
              } catch {
                continue;
              }
            }
            if (!found) {
              throw new Error('Image not found');
            }
          }
        }

        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: imageData,
                transformation: {
                  width: 400,
                  height: 640
                }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 300 }
          })
        );
      } catch (error: any) {
        console.warn(`Failed to include image for chapter ${chapter.chapterNumber}: ${error.message}`);
      }
    }

    // Chapter content
    const chapterParagraphs = markdownToDocxParagraphs(chapterText);
    children.push(...chapterParagraphs);
    
    // Page break after chapter (except last)
    if (chapter.chapterNumber < chapters.length) {
      children.push(new Paragraph({ text: '', pageBreakBefore: true }));
    }
  }

  // Epilogue if exists
  if (book.epilogue) {
    let epilogueContent = book.epilogue.trim();
    // Remove "Epilogue" heading if content starts with it
    const epilogueMatch = epilogueContent.match(/^#*\s*Epilogue\s*:?\s*/i);
    if (epilogueMatch) {
      epilogueContent = epilogueContent.substring(epilogueMatch[0].length).trim();
    }

    children.push(
      new Paragraph({
        text: 'Epilogue',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 300 }
      })
    );

    const epilogueParagraphs = markdownToDocxParagraphs(epilogueContent);
    children.push(...epilogueParagraphs);
  }

  // Create document
  const doc = new Document({
    sections: [{
      properties: {},
      children: children as Paragraph[]
    }]
  });

  // Generate filename
  const sanitizedTitle = book.title.replace(/[^a-zA-Z0-9]/g, '_');
  const docxFileName = `${sanitizedTitle}_${Date.now()}.docx`;
  const docxFilePath = path.join(PUBLISH_DIR, docxFileName);

  // Save document
  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(docxFilePath, buffer);

  console.log(`✅ [DOCX] DOCX file created successfully: ${docxFilePath}`);
  console.log(`📊 [DOCX] File size: ${buffer.length} bytes`);

  return docxFilePath;
}

