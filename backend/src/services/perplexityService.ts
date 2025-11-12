/**
 * Perplexity API Service
 * Fetches current news and information using Perplexity API
 */

interface PerplexityResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role?: string;
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Fetch current news and information using Perplexity API
 * @param query - The search query/question
 * @param chapterTitle - Chapter title for context
 * @param chapterSummary - Chapter summary for context
 * @returns Current news and information relevant to the chapter
 */
export async function fetchCurrentNews(
  query: string,
  chapterTitle?: string,
  chapterSummary?: string
): Promise<string | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ [PERPLEXITY] PERPLEXITY_API_KEY not set, skipping Perplexity integration');
    return null;
  }

  try {
    // Build a comprehensive query for current news
    let searchQuery = query;
    if (chapterTitle && chapterSummary) {
      searchQuery = `What are the latest news, trends, and current developments related to: ${chapterTitle}? Specifically: ${chapterSummary}. Provide recent examples and current information from the past 6 months.`;
    } else if (chapterTitle) {
      searchQuery = `What are the latest news and current developments related to ${chapterTitle}? Provide recent examples from the past 6 months.`;
    }

    console.log(`🔍 [PERPLEXITY] Fetching current news for: "${searchQuery}"`);

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar', // Online model for real-time web search
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that provides current news and information. Focus on recent developments, trends, and news from the past 6 months. Cite sources when possible.'
          },
          {
            role: 'user',
            content: searchQuery
          }
        ],
        temperature: 0.2,
        max_tokens: 1000,
        return_citations: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [PERPLEXITY] API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json() as PerplexityResponse;
    
    if (data.choices && data.choices.length > 0) {
      const content = data.choices[0].message.content;
      const tokens = data.usage?.total_tokens || 0;
      console.log(`✅ [PERPLEXITY] Received ${tokens} tokens of current news`);
      return content;
    }

    return null;
  } catch (error: any) {
    console.error(`❌ [PERPLEXITY] Error fetching current news: ${error.message}`);
    return null;
  }
}

/**
 * Generate a search query from chapter information
 */
export function generateNewsQuery(
  chapterTitle: string,
  chapterSummary: string,
  visualMotifs: string[],
  niche?: string,
  topics?: string
): string {
  const motifs = visualMotifs.length > 0 ? visualMotifs.join(', ') : '';
  const nicheContext = niche ? ` in the context of ${niche}` : '';
  
  // Parse topics (can be comma-separated or newline-separated)
  let topicsList: string[] = [];
  if (topics) {
    topicsList = topics
      .split(/[,\n]/)
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }
  
  let query = `${chapterTitle}${nicheContext}. ${chapterSummary}`;
  
  if (motifs) {
    query += ` Related themes: ${motifs}`;
  }
  
  if (topicsList.length > 0) {
    query += ` Also search for current news related to: ${topicsList.join(', ')}`;
  }
  
  return query;
}

/**
 * Generate a search query for book-level information (for outline generation)
 */
export function generateBookLevelQuery(
  bookTitle: string,
  bookDescription: string,
  niche?: string,
  topics?: string
): string {
  const nicheContext = niche ? ` in the ${niche} niche` : '';
  
  // Parse topics (can be comma-separated or newline-separated)
  let topicsList: string[] = [];
  if (topics) {
    topicsList = topics
      .split(/[,\n]/)
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }
  
  let query = `What are the latest trends, current developments, and recent news related to "${bookTitle}"${nicheContext}?`;
  
  if (bookDescription) {
    query += ` The book is about: ${bookDescription}`;
  }
  
  if (topicsList.length > 0) {
    query += ` Also include information about: ${topicsList.join(', ')}`;
  }
  
  query += ` Provide comprehensive information about current trends, recent developments, and relevant news from the past 6-12 months that would be useful for structuring and planning this book.`;
  
  return query;
}

/**
 * Fetch current trends and information for book outline generation
 */
export async function fetchBookLevelTrends(
  bookTitle: string,
  bookDescription: string,
  niche?: string,
  topics?: string
): Promise<string | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ [PERPLEXITY] PERPLEXITY_API_KEY not set, skipping Perplexity integration');
    return null;
  }

  try {
    const searchQuery = generateBookLevelQuery(bookTitle, bookDescription, niche, topics);
    console.log(`🔍 [PERPLEXITY] Fetching book-level trends for: "${searchQuery}"`);

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar', // Online model for real-time web search
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that provides current trends, news, and information. Focus on recent developments, trends, and news from the past 6-12 months. Provide comprehensive information that would be useful for structuring a book outline. Cite sources when possible.'
          },
          {
            role: 'user',
            content: searchQuery
          }
        ],
        temperature: 0.2,
        max_tokens: 1500, // More tokens for book-level research
        return_citations: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [PERPLEXITY] API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json() as PerplexityResponse;
    
    if (data.choices && data.choices.length > 0) {
      const content = data.choices[0].message.content;
      const tokens = data.usage?.total_tokens || 0;
      console.log(`✅ [PERPLEXITY] Received ${tokens} tokens of book-level trends`);
      return content;
    }

    return null;
  } catch (error: any) {
    console.error(`❌ [PERPLEXITY] Error fetching book-level trends: ${error.message}`);
    return null;
  }
}


