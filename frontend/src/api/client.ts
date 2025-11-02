import axios from 'axios';
import { Book, BookContext, ApiResponse, GenerationJob, PromptVersion, TokenUsage } from '@ai-kindle/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const booksApi = {
  create: async (data: { title: string; bookType: string; niche: string; context: BookContext }) => {
    const res = await client.post<ApiResponse<{ book: Book; jobId: string }>>('/books', data);
    return res.data;
  },
  getAll: async () => {
    const res = await client.get<ApiResponse<Book[]>>('/books');
    return res.data;
  },
  getById: async (id: string) => {
    const res = await client.get<ApiResponse<Book>>(`/books/${id}`);
    return res.data;
  },
  update: async (id: string, data: Partial<Book>) => {
    const res = await client.put<ApiResponse<Book>>(`/books/${id}`, data);
    return res.data;
  },
  startGeneration: async (id: string) => {
    const res = await client.post<ApiResponse<{ message: string }>>(`/books/${id}/start-generation`);
    return res.data;
  },
  delete: async (id: string) => {
    const res = await client.delete<ApiResponse<{ message: string }>>(`/books/${id}`);
    return res.data;
  },
  getPublishStatus: async (id: string) => {
    const res = await client.get<ApiResponse<{ ready: boolean; issues: string[] }>>(`/books/${id}/publish-status`);
    return res.data;
  },
  publish: async (id: string) => {
    const res = await client.post<ApiResponse<{ epubFilePath: string; downloadUrl: string; publishedAt: Date }>>(`/books/${id}/publish`);
    return res.data;
  },
  downloadPublished: async (id: string) => {
    // Trigger download
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    window.open(`${API_BASE_URL}/books/${id}/download`, '_blank');
  },
  republish: async (id: string) => {
    const res = await client.post<ApiResponse<{ epubFilePath: string; downloadUrl: string; publishedAt: Date }>>(`/books/${id}/publish`);
    return res.data;
  },
  generateCoverPrompt: async (id: string) => {
    const res = await client.post<ApiResponse<{ coverImagePrompt: string }>>(`/books/${id}/generate-cover-prompt`);
    return res.data;
  }
};

export const jobsApi = {
  getAll: async () => {
    const res = await client.get<ApiResponse<GenerationJob[]>>('/jobs');
    return res.data;
  },
  getById: async (id: string) => {
    const res = await client.get<ApiResponse<{
      job: GenerationJob;
      chapters: any[];
      tokenUsage: TokenUsage[];
      totalTokens: number;
    }>>(`/jobs/${id}`);
    return res.data;
  },
  getProgress: async (bookId: string) => {
    const res = await client.get<ApiResponse<{
      job: GenerationJob;
      chapters: any[];
    }>>(`/jobs/book/${bookId}/progress`);
    return res.data;
  }
};

export const promptsApi = {
  getVersions: async (bookType: string, niche: string) => {
    const res = await client.get<ApiResponse<PromptVersion[]>>(`/prompts/${bookType}/${niche}`);
    return res.data;
  },
  generate: async (bookType: string, niche: string) => {
    const res = await client.post<ApiResponse<Record<string, any>>>(`/prompts/generate/${bookType}/${niche}`);
    return res.data;
  },
  update: async (id: string, data: { prompt: string; variables: string[] }) => {
    const res = await client.put<ApiResponse<PromptVersion>>(`/prompts/${id}`, data);
    return res.data;
  },
  createVersion: async (id: string, data: { prompt: string; variables: string[] }) => {
    const res = await client.post<ApiResponse<PromptVersion>>(`/prompts/${id}/version`, data);
    return res.data;
  }
};

export const adminApi = {
  getBookSummary: async (bookId: string) => {
    const res = await client.get<ApiResponse<any>>(`/admin/books/${bookId}/summary`);
    return res.data;
  },
  getChapters: async (bookId: string) => {
    const res = await client.get<ApiResponse<any[]>>(`/admin/books/${bookId}/chapters`);
    return res.data;
  },
  getChapter: async (bookId: string, chapterNumber: number) => {
    const res = await client.get<ApiResponse<any>>(`/admin/books/${bookId}/chapters/${chapterNumber}`);
    return res.data;
  },
  updateChapterText: async (bookId: string, chapterNumber: number, text: string) => {
    const res = await client.put<ApiResponse<any>>(`/admin/books/${bookId}/chapters/${chapterNumber}/text`, { text });
    return res.data;
  },
  updateImagePrompt: async (bookId: string, chapterNumber: number, imagePrompt: string) => {
    const res = await client.put<ApiResponse<any>>(`/admin/books/${bookId}/chapters/${chapterNumber}/image-prompt`, { imagePrompt });
    return res.data;
  },
  updateTextPrompt: async (bookId: string, chapterNumber: number, textPrompt: string) => {
    const res = await client.put<ApiResponse<any>>(`/admin/books/${bookId}/chapters/${chapterNumber}/text-prompt`, { textPrompt });
    return res.data;
  },
  uploadImage: async (bookId: string, chapterNumber: number, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await client.post<ApiResponse<any>>(`/admin/books/${bookId}/chapters/${chapterNumber}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },
  getAllJobs: async () => {
    const res = await client.get<ApiResponse<any[]>>(`/admin/jobs`);
    return res.data;
  },
  requeueJob: async (jobId: string) => {
    const res = await client.post<ApiResponse<any>>(`/admin/jobs/${jobId}/requeue`);
    return res.data;
  },
  uploadCoverImage: async (bookId: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await client.post<ApiResponse<any>>(`/admin/books/${bookId}/cover-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },
  updateCoverImagePrompt: async (bookId: string, coverImagePrompt: string) => {
    const res = await client.put<ApiResponse<any>>(`/admin/books/${bookId}/cover-image-prompt`, { coverImagePrompt });
    return res.data;
  }
};

export default client;

