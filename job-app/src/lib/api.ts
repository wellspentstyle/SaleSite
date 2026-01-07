const API_BASE = import.meta.env.VITE_API_URL || '';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return res.json();
}

// Resume API
export const resumeApi = {
  get: () => fetchApi<{ content: string; updated_at: string | null }>('/api/resume'),
  update: (content: string) => fetchApi<{ content: string; updated_at: string }>('/api/resume', {
    method: 'PUT',
    body: JSON.stringify({ content }),
  }),
};

// Applications API
export interface Application {
  id: number;
  company_name: string | null;
  company_url: string | null;
  role_title: string | null;
  job_description: string;
  tailored_resume: string | null;
  cover_letter: string | null;
  interview_questions: InterviewQuestion[] | null;
  status: 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn' | 'ghosted';
  notes: string | null;
  salary_range: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InterviewQuestion {
  question: string;
  why: string;
  talkingPoints: string[];
  framework: string;
}

export interface CreateApplicationInput {
  company_name?: string;
  company_url?: string;
  role_title?: string;
  job_description: string;
  notes?: string;
  salary_range?: string;
  generate?: boolean;
}

export const applicationsApi = {
  list: (status?: string) =>
    fetchApi<Application[]>(`/api/applications${status && status !== 'all' ? `?status=${status}` : ''}`),

  get: (id: number) => fetchApi<Application>(`/api/applications/${id}`),

  create: (data: CreateApplicationInput) =>
    fetchApi<Application>('/api/applications', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<Application>) =>
    fetchApi<Application>(`/api/applications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<{ success: boolean }>(`/api/applications/${id}`, { method: 'DELETE' }),

  generate: (id: number) =>
    fetchApi<Application>(`/api/applications/${id}/generate`, { method: 'POST' }),
};
