import axios from 'axios';
import { Book, BookContext, ApiResponse, GenerationJob, PromptVersion, TokenUsage, WritingStyle, User, UserRole, Publisher, EditingRequest, BookVersion, SubscriptionTier } from '@ai-kindle/shared';

// Use environment variable if set, otherwise use relative URL (same origin)
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests if available
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isAuthMeCall = error.config?.url?.includes('/auth/me');
      const isLoginPage = window.location.pathname === '/login' || window.location.pathname === '/signup';
      
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Don't redirect if:
      // 1. We're already on login/signup pages
      // 2. It's the /auth/me call (initial auth check) - let AuthContext handle it
      if (!isLoginPage && !isAuthMeCall) {
        // Only redirect for actual API calls that fail auth, not during initial load
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const booksApi = {
  create: async (data: { title: string; bookType: string; niche: string; writingStyle?: string; context: BookContext }) => {
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
  publish: async (id: string, force?: boolean) => {
    const res = await client.post<ApiResponse<{ epubFilePath: string; downloadUrl: string; publishedAt: Date }>>(`/books/${id}/publish`, { force: force === true });
    return res.data;
  },
  downloadPublished: async (id: string) => {
    // Trigger download
    const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
    window.open(`${API_BASE_URL}/books/${id}/download`, '_blank');
  },
  republish: async (id: string) => {
    const res = await client.post<ApiResponse<{ epubFilePath: string; downloadUrl: string; publishedAt: Date }>>(`/books/${id}/publish`);
    return res.data;
  },
  generateCoverPrompt: async (id: string) => {
    const res = await client.post<ApiResponse<{ coverImagePrompt: string }>>(`/books/${id}/generate-cover-prompt`);
    return res.data;
  },
  exportDOCX: async (id: string) => {
    // Trigger download
    const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
    window.open(`${API_BASE_URL}/books/${id}/export-docx`, '_blank');
  },
  estimateAudiobook: async (id: string, voice: string, model: 'tts-1' | 'tts-1-hd' = 'tts-1') => {
    const res = await client.get<ApiResponse<{ totalCharacters: number; estimatedCost: number; chapterBreakdown: Array<{ chapterNumber: number; characters: number; cost: number }> }>>(`/books/${id}/audiobook/estimate`, {
      params: { voice, model }
    });
    return res.data;
  },
  generateAudiobook: async (id: string, voice: string, model: 'tts-1' | 'tts-1-hd' = 'tts-1', forceRegenerate?: boolean) => {
    const res = await client.post<ApiResponse<{ jobId: string; estimatedCost: number; totalChapters: number }>>(`/books/${id}/audiobook/generate`, { voice, model, forceRegenerate: forceRegenerate || false });
    return res.data;
  },
  getAudiobookStatus: async (id: string) => {
    const res = await client.get<ApiResponse<{
      jobId: string;
      status: string;
      voice: string;
      model: string;
      currentChapter?: number;
      totalChapters?: number;
      progress: Record<number, boolean>;
      estimatedCost?: number;
      actualCost?: number;
      error?: string;
      startedAt?: Date;
      completedAt?: Date;
      createdAt?: Date;
    } | null>>(`/books/${id}/audiobook/status`);
    return res.data;
  },
  downloadChapterAudio: async (id: string, chapterNumber: number) => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
    window.open(`${API_BASE_URL}/books/${id}/audiobook/chapter/${chapterNumber}`, '_blank');
  },
  downloadPrologueAudio: async (id: string) => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
    window.open(`${API_BASE_URL}/books/${id}/audiobook/prologue`, '_blank');
  },
  downloadEpilogueAudio: async (id: string) => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
    window.open(`${API_BASE_URL}/books/${id}/audiobook/epilogue`, '_blank');
  },
  cancelAudiobook: async (id: string) => {
    const res = await client.post<ApiResponse<{ message: string }>>(`/books/${id}/audiobook/cancel`);
    return res.data;
  },
  generateChapterAudio: async (id: string, chapterNumber: number, voice: string, model: 'tts-1' | 'tts-1-hd', forceRegenerate?: boolean) => {
    const res = await client.post<ApiResponse<{ chapterNumber: number; audioFilePath: string }>>(
      `/books/${id}/audiobook/chapter/${chapterNumber}/generate`,
      { voice, model, forceRegenerate: forceRegenerate || false }
    );
    return res.data;
  },
  processAudioFiles: async (id: string) => {
    const res = await client.post<ApiResponse<{ processed: string[]; failed: Array<{ file: string; error: string }> }>>(
      `/books/${id}/audiobook/process-audio`
    );
    return res.data;
  },
  generateOpeningCredits: async (id: string, voice: string, model: 'tts-1' | 'tts-1-hd') => {
    const res = await client.post<ApiResponse<{ audioPath: string }>>(
      `/books/${id}/audiobook/generate-opening-credits`,
      { voice, model }
    );
    return res.data;
  },
  generateClosingCredits: async (id: string, voice: string, model: 'tts-1' | 'tts-1-hd') => {
    const res = await client.post<ApiResponse<{ audioPath: string }>>(
      `/books/${id}/audiobook/generate-closing-credits`,
      { voice, model }
    );
    return res.data;
  },
  generateRetailSample: async (id: string, voice: string, model: 'tts-1' | 'tts-1-hd') => {
    const res = await client.post<ApiResponse<{ audioPath: string }>>(
      `/books/${id}/audiobook/generate-retail-sample`,
      { voice, model }
    );
    return res.data;
  },
  downloadOpeningCredits: async (id: string) => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
    window.open(`${API_BASE_URL}/books/${id}/audiobook/opening-credits`, '_blank');
  },
  downloadClosingCredits: async (id: string) => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
    window.open(`${API_BASE_URL}/books/${id}/audiobook/closing-credits`, '_blank');
  },
  downloadRetailSample: async (id: string) => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
    window.open(`${API_BASE_URL}/books/${id}/audiobook/retail-sample`, '_blank');
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

export const writingStylesApi = {
  getAll: async () => {
    const res = await client.get<ApiResponse<WritingStyle[]>>('/writing-styles');
    return res.data;
  },
  getById: async (id: string) => {
    const res = await client.get<ApiResponse<WritingStyle>>(`/writing-styles/${id}`);
    return res.data;
  },
  create: async (data: { name: string; description: string }) => {
    const res = await client.post<ApiResponse<WritingStyle>>('/writing-styles', data);
    return res.data;
  },
  update: async (id: string, data: { name?: string; description?: string }) => {
    const res = await client.put<ApiResponse<WritingStyle>>(`/writing-styles/${id}`, data);
    return res.data;
  },
  delete: async (id: string) => {
    const res = await client.delete<ApiResponse<{ message: string }>>(`/writing-styles/${id}`);
    return res.data;
  }
};

export const adminApi = {
  getAllBooks: async () => {
    const res = await client.get<ApiResponse<Book[]>>('/admin/books');
    return res.data;
  },
  getAllUsers: async () => {
    const res = await client.get<ApiResponse<User[]>>('/admin/users');
    return res.data;
  },
  getAllPublishers: async () => {
    const res = await client.get<ApiResponse<Publisher[]>>('/admin/publishers');
    return res.data;
  },
  getStats: async () => {
    const res = await client.get<ApiResponse<any>>('/admin/stats');
    return res.data;
  },
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
  },
  updatePublishWithoutChapterImages: async (bookId: string, publishWithoutChapterImages: boolean) => {
    const res = await client.put<ApiResponse<any>>(`/admin/books/${bookId}/publish-without-chapter-images`, { publishWithoutChapterImages });
    return res.data;
  }
};

export const authApi = {
  signup: async (data: { email: string; password: string; name: string; role: UserRole; publisherId?: string; inviteToken?: string }) => {
    const res = await client.post<ApiResponse<{ user: User; token: string }>>('/auth/signup', data);
    return res.data;
  },
  login: async (data: { email: string; password: string }) => {
    const res = await client.post<ApiResponse<{ user: User; token: string }>>('/auth/login', data);
    return res.data;
  },
  getMe: async () => {
    const res = await client.get<ApiResponse<User>>('/auth/me');
    return res.data;
  }
};

export const subscriptionsApi = {
  getTiers: async () => {
    const res = await client.get<ApiResponse<Record<string, SubscriptionTier>>>('/subscriptions/tiers');
    return res.data;
  },
  subscribe: async (tier: string, paymentMethodId?: string) => {
    const res = await client.post<ApiResponse<any>>('/subscriptions/subscribe', { tier, paymentMethodId });
    return res.data;
  },
  cancel: async () => {
    const res = await client.post<ApiResponse<any>>('/subscriptions/cancel');
    return res.data;
  },
  getStatus: async () => {
    const res = await client.get<ApiResponse<any>>('/subscriptions/status');
    return res.data;
  }
};

export const publishersApi = {
  getAll: async () => {
    const res = await client.get<ApiResponse<Publisher[]>>('/publishers');
    return res.data;
  },
  getProfile: async () => {
    const res = await client.get<ApiResponse<Publisher>>('/publishers/profile');
    return res.data;
  },
  updateProfile: async (data: { name?: string; description?: string; editorialFocus?: string; language?: string; geographicPresence?: string; rates?: any }) => {
    const res = await client.post<ApiResponse<Publisher>>('/publishers/profile', data);
    return res.data;
  },
  getRequests: async () => {
    const res = await client.get<ApiResponse<EditingRequest[]>>('/publishers/requests');
    return res.data;
  },
  acceptRequest: async (requestId: string, data: { responseMessage?: string; estimatedCost?: number }) => {
    const res = await client.post<ApiResponse<EditingRequest>>(`/publishers/requests/${requestId}/accept`, data);
    return res.data;
  },
  rejectRequest: async (requestId: string, data: { responseMessage?: string }) => {
    const res = await client.post<ApiResponse<EditingRequest>>(`/publishers/requests/${requestId}/reject`, data);
    return res.data;
  },
  getUsers: async () => {
    const res = await client.get<ApiResponse<Array<User & { bookCount: number }>>>(`/publishers/users`);
    return res.data;
  },
  getBooks: async () => {
    const res = await client.get<ApiResponse<Array<Book & { chapterCount: number }>>>(`/publishers/books`);
    return res.data;
  },
  createInvite: async (email?: string) => {
    const res = await client.post<ApiResponse<{ invite: any; inviteUrl: string }>>('/publishers/invites', { email });
    return res.data;
  },
  getInvites: async () => {
    const res = await client.get<ApiResponse<any[]>>('/publishers/invites');
    return res.data;
  },
  verifyInvite: async (token: string) => {
    const res = await client.get<ApiResponse<{ publisherId: string; publisherName: string; email?: string }>>(`/publishers/invites/verify/${token}`);
    return res.data;
  }
};

export const editingRequestsApi = {
  create: async (data: { bookId: string; publisherId: string; message?: string }) => {
    const res = await client.post<ApiResponse<EditingRequest>>('/editing-requests', data);
    return res.data;
  },
  getMyRequests: async () => {
    const res = await client.get<ApiResponse<EditingRequest[]>>('/editing-requests/my-requests');
    return res.data;
  }
};

export const reviewersApi = {
  getManuscripts: async () => {
    const res = await client.get<ApiResponse<Book[]>>('/reviewers/manuscripts');
    return res.data;
  },
  getManuscript: async (bookId: string) => {
    const res = await client.get<ApiResponse<{ book: Book; chapters: any[] }>>(`/reviewers/manuscripts/${bookId}`);
    return res.data;
  },
  saveEdit: async (bookId: string, data: { changes?: any[]; notes?: string; chapterNumber?: number; field?: string; oldValue?: string; newValue?: string }) => {
    const res = await client.post<ApiResponse<BookVersion>>(`/reviewers/manuscripts/${bookId}/edit`, data);
    return res.data;
  },
  getVersions: async (bookId: string) => {
    const res = await client.get<ApiResponse<BookVersion[]>>(`/reviewers/manuscripts/${bookId}/versions`);
    return res.data;
  }
};

export default client;

