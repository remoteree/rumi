import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { BookModel } from '../models/Book';
import { BookOutlineModel } from '../models/BookOutline';
import { ChapterContentModel } from '../models/ChapterContent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create output directory for published books
// Resolve to backend/published (works in both dev and production)
const PUBLISH_DIR = path.resolve(__dirname, '../../published');

/**
 * Check if book is ready for publishing
 * - All chapters must have text
 * - All chapters must have images uploaded (unless publishWithoutChapterImages is enabled)
 */
export async function isBookReadyForPublishing(bookId: string): Promise<{ ready: boolean; issues: string[] }> {
  const book = await BookModel.findById(bookId);
  const publishWithoutChapterImages = book?.publishWithoutChapterImages || false;
  
  const chapters = await ChapterContentModel.find({ bookId }).sort({ chapterNumber: 1 });
  
  const issues: string[] = [];
  
  if (chapters.length === 0) {
    issues.push('No chapters found');
    return { ready: false, issues };
  }

  for (const chapter of chapters) {
    if (!chapter.text) {
      issues.push(`Chapter ${chapter.chapterNumber}: Missing text`);
    }
    // Skip image check if publishWithoutChapterImages is enabled
    if (!publishWithoutChapterImages && !chapter.imageUrl) {
      issues.push(`Chapter ${chapter.chapterNumber}: Missing image`);
    }
    // Status check: allow 'text_complete' if images are disabled, otherwise require 'complete'
    const requiredStatus = publishWithoutChapterImages ? 'text_complete' : 'complete';
    if (chapter.status !== requiredStatus && chapter.status !== 'complete') {
      issues.push(`Chapter ${chapter.chapterNumber}: Status is ${chapter.status} (should be ${requiredStatus} or complete)`);
    }
  }

  return {
    ready: issues.length === 0,
    issues
  };
}

/**
 * Generate EPUB file for a book
 */
export async function generateEPUB(bookId: string): Promise<string> {
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

  const epubId = `book_${bookId}_${Date.now()}`;
  const epubDir = path.join(PUBLISH_DIR, epubId);
  await fs.mkdir(epubDir, { recursive: true });

  // Create META-INF directory
  const metaInfDir = path.join(epubDir, 'META-INF');
  await fs.mkdir(metaInfDir, { recursive: true });

  // Create OEBPS directory for content
  const oebpsDir = path.join(epubDir, 'OEBPS');
  await fs.mkdir(oebpsDir, { recursive: true });
  await fs.mkdir(path.join(oebpsDir, 'images'), { recursive: true });
  await fs.mkdir(path.join(oebpsDir, 'styles'), { recursive: true });

  // 1. Create mimetype file (must be first, uncompressed)
  await fs.writeFile(
    path.join(epubDir, 'mimetype'),
    'application/epub+zip',
    { flag: 'w' }
  );

  // 2. Create container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  await fs.writeFile(path.join(metaInfDir, 'container.xml'), containerXml);

  // 3. Copy cover image if available
  let coverImageRef: string | null = null;
  if (book.coverImageUrl) {
    try {
      let imageData: Buffer;
      let mimeType = 'image/jpeg';
      let ext = 'jpg';

      if (book.coverImageUrl.startsWith('data:')) {
        const matches = book.coverImageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          const base64Data = matches[2];
          imageData = Buffer.from(base64Data, 'base64');
          ext = mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : 'jpg';
        } else {
          throw new Error('Invalid data URL format');
        }
      } else if (book.coverImageUrl.startsWith('/api/images/')) {
        const relativePath = book.coverImageUrl.replace('/api/images/', '');
        const imageFilePath = path.resolve(__dirname, '../uploads/images', relativePath);
        imageData = await fs.readFile(imageFilePath);
        
        const fileExt = path.extname(imageFilePath).toLowerCase();
        if (fileExt === '.png') {
          mimeType = 'image/png';
          ext = 'png';
        } else if (fileExt === '.gif') {
          mimeType = 'image/gif';
          ext = 'gif';
        } else if (fileExt === '.webp') {
          mimeType = 'image/webp';
          ext = 'webp';
        } else {
          mimeType = 'image/jpeg';
          ext = 'jpg';
        }
      } else if (book.coverImageUrl.startsWith('http')) {
        const response = await fetch(book.coverImageUrl);
        imageData = Buffer.from(await response.arrayBuffer());
        mimeType = response.headers.get('content-type') || 'image/jpeg';
        ext = mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : 'jpg';
      } else {
        imageData = await fs.readFile(book.coverImageUrl);
        const fileExt = path.extname(book.coverImageUrl).toLowerCase();
        ext = fileExt.replace('.', '') || 'jpg';
        mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      }

      const coverFileName = `cover.${ext}`;
      const coverPath = path.join(oebpsDir, 'images', coverFileName);
      await fs.writeFile(coverPath, imageData);
      coverImageRef = `images/${coverFileName}`;
      console.log(`✅ Copied cover image to EPUB`);
    } catch (error: any) {
      console.error(`Failed to process cover image:`, error.message);
      // Continue without cover image
    }
  }

  // 4. Copy chapter images from local storage to EPUB (skip if publishWithoutChapterImages is enabled)
  const imageRefs: string[] = [];
  const publishWithoutChapterImages = book.publishWithoutChapterImages || false;
  
  if (!publishWithoutChapterImages) {
    for (const chapter of chapters) {
      if (chapter.imageUrl) {
      try {
        let imageData: Buffer;
        let mimeType = 'image/jpeg';
        let ext = 'jpg';

        if (chapter.imageUrl.startsWith('data:')) {
          // Handle legacy base64 data URLs (for backward compatibility)
          const matches = chapter.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            mimeType = matches[1];
            const base64Data = matches[2];
            imageData = Buffer.from(base64Data, 'base64');
            ext = mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : 'jpg';
          } else {
            throw new Error('Invalid data URL format');
          }
        } else if (chapter.imageUrl.startsWith('/api/images/')) {
          // Local file path - read from uploads directory
          const relativePath = chapter.imageUrl.replace('/api/images/', '');
          const imageFilePath = path.resolve(__dirname, '../uploads/images', relativePath);
          imageData = await fs.readFile(imageFilePath);
          
          // Determine mime type from file extension
          const fileExt = path.extname(imageFilePath).toLowerCase();
          if (fileExt === '.png') {
            mimeType = 'image/png';
            ext = 'png';
          } else if (fileExt === '.gif') {
            mimeType = 'image/gif';
            ext = 'gif';
          } else if (fileExt === '.webp') {
            mimeType = 'image/webp';
            ext = 'webp';
          } else {
            mimeType = 'image/jpeg';
            ext = 'jpg';
          }
        } else if (chapter.imageUrl.startsWith('http')) {
          // Download from external URL
          const response = await fetch(chapter.imageUrl);
          imageData = Buffer.from(await response.arrayBuffer());
          mimeType = response.headers.get('content-type') || 'image/jpeg';
          ext = mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : 'jpg';
        } else {
          // Assume it's an absolute file path
          imageData = await fs.readFile(chapter.imageUrl);
          const fileExt = path.extname(chapter.imageUrl).toLowerCase();
          ext = fileExt.replace('.', '') || 'jpg';
          mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
        }

        const imageFileName = `chapter_${chapter.chapterNumber}.${ext}`;
        const imagePath = path.join(oebpsDir, 'images', imageFileName);
        await fs.writeFile(imagePath, imageData);
        imageRefs.push(`images/${imageFileName}`);
        console.log(`✅ Copied image for chapter ${chapter.chapterNumber} to EPUB`);
      } catch (error: any) {
        console.error(`Failed to process image for chapter ${chapter.chapterNumber}:`, error.message);
        // Continue without image
      }
    }
    }
  } else {
    console.log(`ℹ️ Publishing without chapter images (publishWithoutChapterImages is enabled)`);
  }

  // 5. Create cover page and initialize contentFiles
  const contentFiles: string[] = [];
  if (coverImageRef) {
    const coverPageHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Cover</title>
  <link rel="stylesheet" type="text/css" href="styles/style.css"/>
</head>
<body>
  <div class="cover-page">
    <img src="${coverImageRef}" alt="${escapeXml(book.title)}" class="cover-image"/>
  </div>
</body>
</html>`;
    await fs.writeFile(path.join(oebpsDir, 'cover.xhtml'), coverPageHtml);
    contentFiles.push('cover.xhtml');
  }

  // 6. Create title page
  const titlePageHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(book.title)}</title>
  <link rel="stylesheet" type="text/css" href="styles/style.css"/>
</head>
<body>
  <div class="title-page">
    <h1>${escapeXml(book.title)}</h1>
    ${book.context.description ? `<div class="subtitle">${escapeXml(book.context.description)}</div>` : ''}
    <div class="author">Reshad Harun</div>
  </div>
</body>
</html>`;
  await fs.writeFile(path.join(oebpsDir, 'title.xhtml'), titlePageHtml);
  contentFiles.push('title.xhtml');

  // 7. Create table of contents page (after chapters are processed, we'll regenerate with correct file names)
  // We'll create a placeholder TOC here and update it after chapters are created

  // 8. Create prologue if exists
  if (book.prologue) {
    // Remove "Prologue" heading if content starts with it
    let prologueContent = book.prologue.trim();
    // Check if content starts with "Prologue" or "Prologue:" (case insensitive)
    const prologueMatch = prologueContent.match(/^#*\s*Prologue\s*:?\s*/i);
    if (prologueMatch) {
      prologueContent = prologueContent.substring(prologueMatch[0].length).trim();
    }
    
    const prologueHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Prologue</title>
  <link rel="stylesheet" type="text/css" href="styles/style.css"/>
</head>
<body>
  <div class="prologue">
    <h1>Prologue</h1>
    <div class="chapter-content">
      ${convertMarkdownToXHTML(prologueContent)}
    </div>
  </div>
</body>
</html>`;
    await fs.writeFile(path.join(oebpsDir, 'prologue.xhtml'), prologueHtml);
    contentFiles.push('prologue.xhtml');
  }

  // 9. Create chapter HTML files
  const chapterFiles: string[] = [];
  for (const chapter of chapters) {
    const chapterTitle = outline.structure.chapters.find(c => c.chapterNumber === chapter.chapterNumber)?.title || `Chapter ${chapter.chapterNumber}`;
    const imageExt = chapter.imageUrl?.includes('png') ? 'png' : 'jpg';
    const hasImage = !publishWithoutChapterImages && chapter.imageUrl && imageRefs.some(ref => ref.includes(`chapter_${chapter.chapterNumber}`));
    
    // Remove chapter title if content starts with it
    let chapterText = (chapter.text || '').trim();
    
    // Normalize chapter title for comparison (remove extra spaces, punctuation)
    const normalizedTitle = chapterTitle.replace(/\s+/g, ' ').trim();
    
    // Check if content starts with chapter title in various formats
    // Pattern 1: Markdown headers (# ## ### ####) followed by title
    // Pattern 2: Plain text title
    // Pattern 3: "Chapter X:" patterns
    const titlePatterns = [
      // Markdown headers with full title
      new RegExp(`^#{1,4}\\s*${escapeRegex(normalizedTitle)}\\s*:?\\s*`, 'i'),
      new RegExp(`^#{1,4}\\s*${escapeRegex(chapterTitle)}\\s*:?\\s*`, 'i'),
      // Plain text title at start
      new RegExp(`^${escapeRegex(normalizedTitle)}\\s*:?\\s*`, 'i'),
      new RegExp(`^${escapeRegex(chapterTitle)}\\s*:?\\s*`, 'i'),
      // Chapter number patterns
      new RegExp(`^#{1,4}\\s*Chapter\\s+${chapter.chapterNumber}\\s*:?\\s*`, 'i'),
      new RegExp(`^#{1,4}\\s*Chapter\\s+${chapter.chapterNumber}\\s*[-:]\\s*`, 'i'),
      new RegExp(`^Chapter\\s+${chapter.chapterNumber}\\s*:?\\s*`, 'i'),
      new RegExp(`^Chapter\\s+${chapter.chapterNumber}\\s*[-:]\\s*`, 'i'),
    ];
    
    for (const pattern of titlePatterns) {
      const match = chapterText.match(pattern);
      if (match) {
        chapterText = chapterText.substring(match[0].length).trim();
        // Also check if there's a blank line after the title and remove it
        if (chapterText.startsWith('\n')) {
          chapterText = chapterText.substring(1).trim();
        }
        break;
      }
    }
    
    // Also check if the first line or paragraph contains the title (after markdown conversion)
    // Strip any leading H1/H2 that matches the chapter title
    const firstLines = chapterText.split('\n').slice(0, 3);
    for (let i = 0; i < firstLines.length; i++) {
      const line = firstLines[i].trim();
      // Check if this line is a markdown header containing the title
      if (line.match(/^#{1,4}\s+/)) {
        const headerText = line.replace(/^#{1,4}\s+/, '').trim();
        if (headerText.toLowerCase() === normalizedTitle.toLowerCase() || 
            headerText.toLowerCase() === chapterTitle.toLowerCase() ||
            headerText.toLowerCase().includes(normalizedTitle.toLowerCase().substring(0, 20))) {
          // Remove this line and rejoin
          chapterText = chapterText.split('\n').slice(i + 1).join('\n').trim();
          break;
        }
      }
    }
    
    // Convert markdown to HTML first
    let convertedContent = convertMarkdownToXHTML(chapterText);
    
    // Remove any H1 or H2 tags that match the chapter title (after conversion)
    // This handles cases where the title appears as a markdown header in the content
    // We need to escape both the original title and the HTML-escaped version
    const escapedTitle = escapeXml(chapterTitle);
    const escapedNormalizedTitle = escapeXml(normalizedTitle);
    
    // Function to create flexible regex that handles whitespace variations
    const createTitleRegex = (title: string) => {
      // First escape regex special characters, then replace spaces with \\s+ to match any whitespace
      const escaped = escapeRegex(title);
      const flexibleTitle = escaped.replace(/\s+/g, '\\s+');
      return new RegExp(`<h[12][^>]*>\\s*${flexibleTitle}\\s*</h[12]>`, 'gi');
    };
    
    // Remove H1/H2 tags matching the title (try multiple variations)
    const patterns = [
      createTitleRegex(escapedTitle),
      createTitleRegex(escapedNormalizedTitle),
      createTitleRegex(chapterTitle),
      createTitleRegex(normalizedTitle),
    ];
    
    for (const pattern of patterns) {
      convertedContent = convertedContent.replace(pattern, '');
    }
    
    // Also check for partial matches (in case title is slightly different)
    // Remove H1/H2 that contains a significant portion of the title
    const titleWords = normalizedTitle.split(/\s+/).filter(w => w.length > 3);
    if (titleWords.length > 0) {
      const firstFewWords = titleWords.slice(0, Math.min(3, titleWords.length)).join('\\s+');
      convertedContent = convertedContent.replace(
        new RegExp(`<h[12][^>]*>\\s*[^<]*${firstFewWords}[^<]*\\s*</h[12]>`, 'gi'),
        ''
      );
    }
    
    // Clean up any double line breaks left after removal
    convertedContent = convertedContent.replace(/\n\n\n+/g, '\n\n').trim();
    
    const chapterHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(chapterTitle)}</title>
  <link rel="stylesheet" type="text/css" href="styles/style.css"/>
</head>
<body>
  <div class="page-break"></div>
  <h1 class="chapter-title">${escapeXml(chapterTitle)}</h1>
  ${hasImage ? `<div class="chapter-image">
    <img src="images/chapter_${chapter.chapterNumber}.${imageExt}" alt="${escapeXml(chapterTitle)}" />
  </div>` : ''}
  <div class="chapter-content">
    ${convertedContent}
  </div>
</body>
</html>`;

    const chapterFileName = `chapter_${chapter.chapterNumber}.xhtml`;
    await fs.writeFile(path.join(oebpsDir, chapterFileName), chapterHtml);
    chapterFiles.push(chapterFileName);
    contentFiles.push(chapterFileName);
  }

  // 10. Create table of contents page (now that we have chapter files)
  const tocItems: string[] = [];
  if (book.prologue) {
    tocItems.push('<li><a href="prologue.xhtml">Prologue</a></li>');
  }
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const chapterTitle = outline.structure.chapters.find(c => c.chapterNumber === chapter.chapterNumber)?.title || `Chapter ${chapter.chapterNumber}`;
    const chapterFileName = chapterFiles[i];
    tocItems.push(`<li><a href="${chapterFileName}">Chapter ${chapter.chapterNumber}: ${escapeXml(chapterTitle)}</a></li>`);
  }
  if (book.epilogue) {
    tocItems.push('<li><a href="epilogue.xhtml">Epilogue</a></li>');
  }

  const tocHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="styles/style.css"/>
</head>
<body>
  <div class="title-page">
    <h1>Table of Contents</h1>
    <nav class="toc">
      <ol>
        ${tocItems.join('\n        ')}
      </ol>
    </nav>
  </div>
</body>
</html>`;
  await fs.writeFile(path.join(oebpsDir, 'toc.xhtml'), tocHtml);
  contentFiles.push('toc.xhtml');

  // 11. Create epilogue if exists
  if (book.epilogue) {
    const epilogueHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Epilogue</title>
  <link rel="stylesheet" type="text/css" href="styles/style.css"/>
</head>
<body>
  <div class="page-break"></div>
  <div class="epilogue">
    <h1>Epilogue</h1>
    <div class="chapter-content">
      ${convertMarkdownToXHTML(book.epilogue)}
    </div>
  </div>
</body>
</html>`;
    await fs.writeFile(path.join(oebpsDir, 'epilogue.xhtml'), epilogueHtml);
    contentFiles.push('epilogue.xhtml');
  }

  // 12. Create CSS file with professional Kindle-optimized styling
  const cssContent = `/* Kindle-optimized EPUB Stylesheet */
@page {
  margin: 0;
}

body {
  font-family: "Palatino Linotype", "Book Antiqua", Palatino, "Times New Roman", serif;
  font-size: 1.1em;
  line-height: 1.8;
  margin: 0;
  padding: 1.2em 1em;
  color: #333;
  background-color: #fff;
  text-align: justify;
  orphans: 3;
  widows: 3;
  -epub-hyphens: auto;
  -webkit-hyphens: auto;
  hyphens: auto;
}

/* Headings - prevent orphaned headings at page breaks */
h1 {
  font-size: 2em;
  font-weight: bold;
  margin: 1.5em 0 1em 0;
  padding-bottom: 0.5em;
  border-bottom: 2px solid #ddd;
  text-align: center;
  page-break-after: avoid;
  page-break-inside: avoid;
  page-break-before: auto;
  break-after: avoid;
  break-inside: avoid;
  color: #1a1a1a;
  line-height: 1.3;
  orphans: 2;
  widows: 2;
}

/* Keep at least 2 lines with heading */
h1 + p,
h1 + div,
h1 + ul,
h1 + ol {
  page-break-before: avoid;
  break-before: avoid;
}

h2 {
  font-size: 1.6em;
  font-weight: bold;
  margin: 1.5em 0 0.8em 0;
  padding-top: 0.5em;
  page-break-after: avoid;
  page-break-inside: avoid;
  page-break-before: auto;
  break-after: avoid;
  break-inside: avoid;
  color: #2a2a2a;
  line-height: 1.4;
  orphans: 2;
  widows: 2;
}

/* Keep at least 2 lines with H2 heading */
h2 + p,
h2 + div,
h2 + ul,
h2 + ol {
  page-break-before: avoid;
  break-before: avoid;
}

h3 {
  font-size: 1.3em;
  font-weight: bold;
  margin: 1.2em 0 0.6em 0;
  page-break-after: avoid;
  page-break-inside: avoid;
  break-after: avoid;
  break-inside: avoid;
  color: #3a3a3a;
  line-height: 1.4;
  orphans: 2;
  widows: 2;
}

/* Keep at least 2 lines with H3 heading */
h3 + p,
h3 + div,
h3 + ul,
h3 + ol {
  page-break-before: avoid;
  break-before: avoid;
}

h4 {
  page-break-after: avoid;
  page-break-inside: avoid;
  break-after: avoid;
  break-inside: avoid;
  orphans: 2;
  widows: 2;
}

h4 + p,
h4 + div,
h4 + ul,
h4 + ol {
  page-break-before: avoid;
  break-before: avoid;
}

/* Paragraphs */
p {
  margin: 0.8em 0;
  text-indent: 1.5em;
  text-align: justify;
  line-height: 1.8;
  page-break-inside: avoid;
  orphans: 2;
  widows: 2;
}

p:first-of-type {
  text-indent: 0;
}

/* Lists - prevent awkward breaks */
ul, ol {
  margin: 1em 0;
  padding-left: 2em;
  page-break-inside: avoid;
  break-inside: avoid;
  orphans: 2;
  widows: 2;
}

/* Keep list with preceding heading */
h1 + ul, h1 + ol,
h2 + ul, h2 + ol,
h3 + ul, h3 + ol,
h4 + ul, h4 + ol {
  page-break-before: avoid;
  break-before: avoid;
}

li {
  margin: 0.5em 0;
  line-height: 1.8;
  page-break-inside: avoid;
  break-inside: avoid;
  orphans: 2;
  widows: 2;
}

/* Don't break between list items unless necessary */
li + li {
  page-break-before: auto;
}

/* Keep at least 2 list items together */
li:first-child {
  page-break-before: avoid;
}

li:last-child {
  page-break-after: avoid;
}

/* Blockquotes */
blockquote {
  margin: 1.5em 2em;
  padding: 0.8em 1em;
  border-left: 4px solid #ccc;
  background-color: #f9f9f9;
  font-style: italic;
  page-break-inside: avoid;
  break-inside: avoid;
  orphans: 2;
  widows: 2;
}

/* Code blocks */
pre, code {
  font-family: "Courier New", Courier, monospace;
  font-size: 0.9em;
}

pre {
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  padding: 1em;
  margin: 1em 0;
  overflow-x: auto;
  page-break-inside: avoid;
  break-inside: avoid;
  orphans: 2;
  widows: 2;
}

code {
  background-color: #f5f5f5;
  padding: 0.2em 0.4em;
  border-radius: 3px;
}

/* Images */
img {
  display: block;
  margin: 1.5em auto;
  max-width: 100%;
  height: auto;
  page-break-inside: avoid;
  page-break-after: avoid;
  break-inside: avoid;
  break-after: avoid;
}

.chapter-image {
  text-align: center;
  margin: 2em 0;
  page-break-inside: avoid;
  break-inside: avoid;
}

/* Keep image with preceding heading */
h1 + .chapter-image,
h2 + .chapter-image,
h3 + .chapter-image {
  page-break-before: avoid;
  break-before: avoid;
}

.chapter-image img {
  max-width: 90%;
  border: 1px solid #ddd;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* Table of Contents */
.toc {
  margin: 2em 0;
}

.toc ol {
  list-style: none;
  padding: 0;
  margin: 0;
}

.toc li {
  margin: 0.8em 0;
  padding-left: 0;
  page-break-inside: avoid;
  break-inside: avoid;
}

.toc a {
  color: #007bff;
  text-decoration: none;
  font-size: 1.1em;
  line-height: 1.6;
  display: block;
  padding: 0.3em 0;
}

.toc a:hover {
  text-decoration: underline;
}

/* Chapter content */
.chapter-content {
  text-align: justify;
  margin-top: 1em;
}

.chapter-title {
  text-align: center;
  font-size: 2.2em;
  margin: 2em 0 1em 0;
  font-weight: bold;
  color: #1a1a1a;
  page-break-after: avoid;
  break-after: avoid;
  orphans: 2;
  widows: 2;
}

/* Keep chapter content with title */
.chapter-title + .chapter-image,
.chapter-title + .chapter-content {
  page-break-before: avoid;
  break-before: avoid;
}

.chapter-content {
  orphans: 2;
  widows: 2;
}

.chapter-content > p:first-child {
  page-break-before: avoid;
}

/* Prologue and Epilogue */
.prologue, .epilogue {
  font-style: italic;
  margin: 2em 0;
  padding: 1em;
  border-top: 2px solid #ddd;
  border-bottom: 2px solid #ddd;
}

.prologue h1, .epilogue h1 {
  font-size: 1.8em;
  font-style: normal;
  border-bottom: none;
  margin-bottom: 0.5em;
}

/* Cover page */
.cover-page {
  text-align: center;
  margin: 0;
  padding: 0;
  page-break-after: always;
}

.cover-image {
  width: 100%;
  height: auto;
  max-width: 100%;
  display: block;
  margin: 0;
}

/* Title page */
.title-page {
  text-align: center;
  margin: 3em 0;
  page-break-after: always;
}

.title-page h1 {
  font-size: 2.5em;
  margin: 2em 0 1em 0;
  border-bottom: none;
  text-align: center;
}

.title-page .subtitle {
  font-size: 1.3em;
  color: #666;
  margin: 1em 0;
  font-style: italic;
}

.title-page .author {
  font-size: 1.2em;
  margin-top: 2em;
  color: #555;
}

/* Page breaks */
.page-break {
  page-break-before: always;
}

/* Emphasis */
strong {
  font-weight: bold;
  color: #222;
}

em {
  font-style: italic;
}

/* Links */
a {
  color: #0066cc;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

/* Horizontal rules */
hr {
  border: none;
  border-top: 1px solid #ddd;
  margin: 2em 0;
}

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  page-break-inside: avoid;
  break-inside: avoid;
  orphans: 2;
  widows: 2;
}

th, td {
  border: 1px solid #ddd;
  padding: 0.5em;
  text-align: left;
  page-break-inside: avoid;
  break-inside: avoid;
}

th {
  background-color: #f5f5f5;
  font-weight: bold;
}

/* Keep table with preceding heading */
h1 + table, h2 + table, h3 + table, h4 + table {
  page-break-before: avoid;
  break-before: avoid;
}

/* No indent for first paragraph after heading */
h1 + p, h2 + p, h3 + p {
  text-indent: 0;
}

/* Better spacing for lists after paragraphs */
p + ul, p + ol {
  margin-top: 1em;
}

/* Additional rules for better page breaks */
/* Ensure headings don't appear alone at page bottom */
h1, h2, h3, h4 {
  min-height: 2em;
}

/* Keep related content blocks together */
div + h2, div + h3, div + h4,
p + h2, p + h3, p + h4 {
  page-break-before: auto;
}

/* Prevent single lines at page top/bottom */
p, li {
  min-height: 1.5em;
}`;
  await fs.writeFile(path.join(oebpsDir, 'styles', 'style.css'), cssContent);

  // 13. Create content.opf (package document) with improved metadata
  const now = new Date().toISOString();
  const uuid = `urn:uuid:${bookId}-${Date.now()}`;
  const opfContent = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="book-id">${uuid}</dc:identifier>
    <dc:title>${escapeXml(book.title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator opf:role="aut">Reshad Harun</dc:creator>
    <dc:date opf:event="publication">${now}</dc:date>
    <dc:date opf:event="modification">${now}</dc:date>
    <dc:publisher>Reshad Harun</dc:publisher>
    <meta property="dcterms:modified">${now}</meta>
    <meta property="schema:accessibilityFeature">readingOrder</meta>
    <meta property="schema:accessibilityFeature">structuralNavigation</meta>
    <meta property="schema:accessibilityFeature">tableOfContents</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="styles/style.css" media-type="text/css"/>
    ${coverImageRef ? `<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml" properties="cover-image"/>
    <item id="cover-image" href="${coverImageRef}" media-type="${coverImageRef.endsWith('.png') ? 'image/png' : coverImageRef.endsWith('.gif') ? 'image/gif' : 'image/jpeg'}" properties="cover-image"/>` : ''}
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>
    ${book.prologue ? '<item id="prologue" href="prologue.xhtml" media-type="application/xhtml+xml"/>' : ''}
    ${chapterFiles.map((file, idx) => 
      `<item id="chapter${idx + 1}" href="${file}" media-type="application/xhtml+xml"/>`
    ).join('\n    ')}
    ${book.epilogue ? '<item id="epilogue" href="epilogue.xhtml" media-type="application/xhtml+xml"/>' : ''}
    ${imageRefs.map((ref, idx) => {
      const ext = ref.split('.').pop();
      const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      return `<item id="img${idx + 1}" href="${ref}" media-type="${mimeType}"/>`;
    }).join('\n    ')}
  </manifest>
  <spine toc="nav">
    ${coverImageRef ? '<itemref idref="cover"/>' : ''}
    <itemref idref="title"/>
    <itemref idref="toc"/>
    ${book.prologue ? '<itemref idref="prologue"/>' : ''}
    ${chapterFiles.map((_, idx) => `<itemref idref="chapter${idx + 1}"/>`).join('\n    ')}
    ${book.epilogue ? '<itemref idref="epilogue"/>' : ''}
  </spine>
</package>`;
  await fs.writeFile(path.join(oebpsDir, 'content.opf'), opfContent);

  // 14. Create nav.xhtml (navigation document) with improved formatting
  const navContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="styles/style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${book.prologue ? '<li><a href="prologue.xhtml">Prologue</a></li>' : ''}
      ${chapters.map((chapter, idx) => {
        const chapterTitle = outline.structure.chapters.find(c => c.chapterNumber === chapter.chapterNumber)?.title || `Chapter ${chapter.chapterNumber}`;
        return `<li><a href="${chapterFiles[idx]}">${escapeXml(chapterTitle)}</a></li>`;
      }).join('\n      ')}
      ${book.epilogue ? '<li><a href="epilogue.xhtml">Epilogue</a></li>' : ''}
    </ol>
  </nav>
</body>
</html>`;
  await fs.writeFile(path.join(oebpsDir, 'nav.xhtml'), navContent);

  // 15. Create EPUB file (ZIP archive)
  // Ensure publish directory exists
  await fs.mkdir(PUBLISH_DIR, { recursive: true });
  
  const epubFileName = `${book.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.epub`;
  const epubFilePath = path.join(PUBLISH_DIR, epubFileName);
  
  console.log(`📦 [EPUB] Creating EPUB file at: ${epubFilePath}`);

  const fsSync = await import('fs');
  return new Promise((resolve, reject) => {
    const output = fsSync.createWriteStream(epubFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', async () => {
      // Clean up temp directory
      try {
        await fs.rm(epubDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to clean up temp directory:', error);
      }
      console.log(`✅ [EPUB] EPUB file created successfully: ${epubFilePath}`);
      console.log(`📊 [EPUB] File size: ${(await fs.stat(epubFilePath)).size} bytes`);
      resolve(epubFilePath);
    });

    archive.on('error', (err: any) => {
      reject(err);
    });

    archive.pipe(output);

    // Add mimetype first (must be uncompressed)
    archive.file(path.join(epubDir, 'mimetype'), { name: 'mimetype', store: true });
    
    // Add all other files
    archive.directory(metaInfDir, 'META-INF');
    archive.directory(oebpsDir, 'OEBPS', { prefix: 'OEBPS/' });

    archive.finalize();
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function convertMarkdownToXHTML(markdown: string): string {
  if (!markdown) return '';
  
  let html = markdown;
  
  // Convert code blocks first (before escaping)
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    const escapedCode = escapeXml(code.trim());
    return `<pre><code>${escapedCode}</code></pre>`;
  });
  
  // Convert inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Convert blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
  
  // Convert horizontal rules
  html = html.replace(/^---$/gm, '<hr/>');
  
  // Convert unordered lists - process line by line to handle properly
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inUnorderedList = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const unorderedMatch = line.match(/^([\*\-\+]\s+)(.+)$/);
    
    if (unorderedMatch) {
      if (!inUnorderedList) {
        processedLines.push('<ul>');
        inUnorderedList = true;
      }
      processedLines.push(`<li>${unorderedMatch[2]}</li>`);
    } else {
      if (inUnorderedList) {
        processedLines.push('</ul>');
        inUnorderedList = false;
      }
      processedLines.push(line);
    }
  }
  
  if (inUnorderedList) {
    processedLines.push('</ul>');
  }
  
  html = processedLines.join('\n');
  
  // Convert ordered lists - process line by line to handle properly
  const lines2 = html.split('\n');
  const processedLines2: string[] = [];
  let inOrderedList = false;
  
  for (let i = 0; i < lines2.length; i++) {
    const line = lines2[i];
    const orderedMatch = line.match(/^(\d+\.\s+)(.+)$/);
    
    if (orderedMatch) {
      if (!inOrderedList) {
        processedLines2.push('<ol>');
        inOrderedList = true;
      }
      processedLines2.push(`<li>${orderedMatch[2]}</li>`);
    } else {
      if (inOrderedList) {
        processedLines2.push('</ol>');
        inOrderedList = false;
      }
      processedLines2.push(line);
    }
  }
  
  if (inOrderedList) {
    processedLines2.push('</ol>');
  }
  
  html = processedLines2.join('\n');
  
  // Convert markdown headers (order matters - h3 before h2 before h1)
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  
  // Convert bold and italic (order matters - triple before double before single)
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Convert underscore bold and italic
  html = html.replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Escape XML entities (but preserve HTML tags we just created)
  const tempPlaceholder = '___TEMP_PLACEHOLDER___';
  const htmlTags: string[] = [];
  let tagIndex = 0;
  
  // Replace HTML tags with placeholders before escaping
  html = html.replace(/<[^>]+>/g, (tag) => {
    htmlTags.push(tag);
    return `${tempPlaceholder}${tagIndex++}${tempPlaceholder}`;
  });
  
  // Escape XML
  html = escapeXml(html);
  
  // Restore HTML tags
  htmlTags.forEach((tag, idx) => {
    html = html.replace(`${tempPlaceholder}${idx}${tempPlaceholder}`, tag);
  });
  
  // Convert line breaks and paragraphs - but don't wrap list items in paragraphs
  const lines3 = html.split('\n');
  const result: string[] = [];
  let currentParagraph: string[] = [];
  
  for (let i = 0; i < lines3.length; i++) {
    const line = lines3[i].trim();
    
    if (!line) {
      if (currentParagraph.length > 0) {
        result.push(`<p>${currentParagraph.join(' ')}</p>`);
        currentParagraph = [];
      }
      continue;
    }
    
    // Don't wrap these elements in paragraphs - they're already properly formatted
    if (line.startsWith('<h') || line.startsWith('<li') || line.startsWith('<ul') || 
        line.startsWith('<ol') || line.startsWith('<blockquote') || line.startsWith('<pre') || 
        line.startsWith('<hr') || line.startsWith('</ul') || line.startsWith('</ol')) {
      // Close current paragraph if exists
      if (currentParagraph.length > 0) {
        result.push(`<p>${currentParagraph.join(' ')}</p>`);
        currentParagraph = [];
      }
      result.push(line);
      continue;
    }
    
    // Add to current paragraph
    if (line.includes('<br/>') || line.includes('<code>')) {
      // Line breaks within code or explicit breaks
      if (currentParagraph.length > 0) {
        result.push(`<p>${currentParagraph.join(' ')}</p>`);
        currentParagraph = [];
      }
      result.push(`<p>${line}</p>`);
    } else {
      currentParagraph.push(line);
    }
  }
  
  // Close any remaining paragraph
  if (currentParagraph.length > 0) {
    result.push(`<p>${currentParagraph.join(' ')}</p>`);
  }
  
  html = result.join('\n');
  
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  
  return html;
}

