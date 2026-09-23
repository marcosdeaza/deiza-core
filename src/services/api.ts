const API_URL = import.meta.env.VITE_API_URL ?? '';

/** Error with a stable code the UI translates (see `apiErrorMessage`). */
export class ApiError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message?: string, status?: number) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** Maps a backend failure to a user-facing message in the active language. */
export function apiErrorMessage(err: unknown, t: (k: string) => string, fallback?: string): string {
  const e = err as any;
  if (e instanceof ApiError || (e && typeof e.code === 'string')) {
    const key = `api.err.${e.code}`;
    const msg = t(key);
    if (msg !== key) return msg;
  }
  const raw = (e && typeof e.message === 'string') ? e.message : '';
  return raw || fallback || t('api.err.generic');
}

function classifyHttpError(status: number, raw: string): string {
  const r = raw.toLowerCase();
  if (status === 401 || r.includes('authentication required')) return 'auth';
  if (status === 429 || r.includes('rate limit') || r.includes('too many')) return 'rate';
  if (status === 404 || r.includes('not found')) return 'notfound';
  if (status === 413 || r.includes('too large')) return 'toolarge';
  if (r.includes('too long')) return 'toolong';
  if (status >= 500 || r.includes('unavailable')) return 'unavailable';
  return 'generic';
}

/** Auth header for direct fetch() calls outside APIService — keeps token-auth users working when the cookie expires */
export const authHeaders = (): Record<string, string> => {
  const tok = localStorage.getItem('deiza:auth_token');
  return tok ? { 'X-Auth-Token': tok } : {};
};

/** Per-user chat preferences kept in localStorage and sent with every message. */
export const userChatPrefs = (): { chain_fallback: boolean; custom_instructions?: string } => {
  let chain = true;
  let custom = '';
  try {
    chain = localStorage.getItem('deiza-chain-fallback') !== 'false';
    custom = (localStorage.getItem('deiza-initial-prompt') || '').trim().slice(0, 2000);
  } catch { /* storage unavailable */ }
  return { chain_fallback: chain, ...(custom ? { custom_instructions: custom } : {}) };
};

export interface CustomSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
}

export interface User {
  id: number;
  email: string;
  name: string;
  picture: string;
  avatar_url?: string;
  plan?: string;
}

export interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  artifact?: {
    name: string;
    type: string;
    content?: string;
  };
  attachments?: Array<{ name: string; mime_type?: string; is_image?: boolean; raw_bytes?: string }>;
  created_at: string;
}

export interface Chat {
  id: number;
  title: string;
  project_id?: number | null;
  created_at: string;
  updated_at: string;
  pinned?: boolean;
  message_count: number;
}

export interface Project {
  id: number;
  name: string;
  instructions: string;
  created_at: string;
  updated_at: string;
  file_count: number;
  chat_count: number;
  files?: ProjectFile[];
}

export interface ProjectFile {
  id: number;
  name: string;
  mime_type: string;
  is_image: boolean;
  size_chars: number;
  created_at: string;
}

export interface CodeKey {
  id: number;
  name: string;
  key_prefix: string;
  last_used_at?: string | null;
  created_at: string;
}

class APIService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    // Abort fetch after 15s to prevent browser hangs when backend is down
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const tok = localStorage.getItem('deiza:auth_token');
    const config: RequestInit = {
      ...options,
      credentials: 'include',
      signal: options.signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(tok ? { 'X-Auth-Token': tok } : {}),
        ...options.headers,
      },
    };

    let response: Response;
    try {
      response = await fetch(url, config);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') throw new ApiError('timeout');
      throw new ApiError('network', err?.message);
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      const raw = String(error.error || '');
      // Backend keys like model_sublimit / plan_required / project_limit pass through verbatim
      const code = /^[a-z_]+$/.test(raw) ? raw : classifyHttpError(response.status, raw);
      throw new ApiError(code, raw, response.status);
    }

    return response.json();
  }

  // Extracts the backend error reason + reset countdown from a failed stream
  // response: "KEY" | "KEY|MODEL" | "KEY|SECONDS" | "KEY|MODEL|SECONDS"
  private async buildError(resp: Response): Promise<string> {
    try {
      const body = await resp.json();
      if (body?.error) {
        let msg = body.error;
        if (body.error === 'model_sublimit' && body.model) msg += '|' + body.model;
        if (body?.usage?.reset_in_seconds && body.usage.reset_in_seconds > 0) {
          msg += '|' + body.usage.reset_in_seconds;
        } else if (body?.usage?.next_reset) {
          const nr = body.usage.next_reset.endsWith('Z') ? body.usage.next_reset : (body.usage.next_reset + 'Z');
          const secs = Math.max(0, Math.ceil((new Date(nr).getTime() - Date.now()) / 1000));
          if (secs > 0) msg += '|' + secs;
        }
        return msg;
      }
    } catch { /* non-JSON body */ }
    return `HTTP ${resp.status}`;
  }

  // Auth endpoints
  async loginWithGoogle(credential: string): Promise<{ success: boolean; user: User; token?: string }> {
    const res = await this.request('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
    if (res.token) localStorage.setItem('deiza:auth_token', res.token);
    return res;
  }

  /** Sign in with Apple (native app): exchanges Apple's identity token for a Deiza session. */
  async loginWithApple(identityToken: string, fullName?: { givenName?: string | null; familyName?: string | null }): Promise<{ success: boolean; user: User; token?: string }> {
    const res = await this.request('/auth/apple', {
      method: 'POST',
      body: JSON.stringify({ identity_token: identityToken, name: [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ') }),
    });
    if (res.token) localStorage.setItem('deiza:auth_token', res.token);
    return res;
  }

  async checkAuthStatus(): Promise<{ authenticated: boolean; user?: User }> {
    return this.request('/auth/status');
  }

  async logout(): Promise<{ success: boolean }> {
    try {
      return await this.request('/auth/logout', { method: 'POST' });
    } finally {
      try { localStorage.removeItem('deiza:auth_token'); } catch { /* noop */ }
    }
  }

  async getCurrentUser(): Promise<User> {
    return this.request('/auth/me');
  }

  async updateProfile(name: string): Promise<{ success: boolean; name: string }> {
    return this.request('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  /** Update profile with optional avatar image. Uses FormData for file upload. */
  async updateProfileFull(data: { name?: string; avatarFile?: File; avatarBase64?: string }): Promise<{ name: string; avatar_url: string | null }> {
    const formData = new FormData();
    if (data.name) formData.append('name', data.name);
    if (data.avatarFile) formData.append('avatar', data.avatarFile);
    else if (data.avatarBase64) formData.append('avatar_base64', data.avatarBase64);

    const headers: Record<string, string> = { ...authHeaders() };
    // Don't set Content-Type — browser sets it with boundary for FormData
    delete headers['Content-Type'];

    const res = await fetch(`${this.baseUrl}/api/profile`, {
      method: 'PUT',
      credentials: 'include',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'profile_update_failed');
    }
    return res.json();
  }

  // Demo chat — no auth required, fast model only, stateless (memory in-browser only)
  async sendDemoMessage(
    message: string,
    files: any[] = [],
    history: { role: string; content: string }[] = [],
    language: string = 'en'
  ): Promise<{
    success: boolean;
    message: { id: number; role: string; content: string; artifact?: any };
  }> {
    return this.request('/api/chat/demo', {
      method: 'POST',
      body: JSON.stringify({ message, files, history, language }),
    });
  }

  // Auth — magic link
  async requestMagicLink(email: string): Promise<{ success: boolean; token?: string }> {
    const res = await this.request('/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    if (res.token) localStorage.setItem('deiza:auth_token', res.token);
    return res;
  }

  async verifyMagicLink(token: string, email: string): Promise<{ success: boolean; user: User; token?: string }> {
    const res = await this.request('/auth/magic-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token, email }),
    });
    if (res.token) localStorage.setItem('deiza:auth_token', res.token);
    return res;
  }

  // Chat endpoints
  async sendMessage(
    message: string,
    chatId?: number,
    model: 'gas' | 'liquid' | 'solid' | 'fast' | 'pro' | 'ultra' = 'liquid',
    files: any[] = [],
    language: string = 'en'
  ): Promise<{
    success: boolean;
    chat_id: number;
    message: Message;
    tokens_used: number;
  }> {
    return this.request('/api/chat/send', {
      method: 'POST',
      body: JSON.stringify({
        message,
        chat_id: chatId,
        model,
        files,
        language,
      }),
    });
  }

  // ── Projects ──
  async getProjects(): Promise<{ projects: Project[] }> {
    return this.request('/api/projects');
  }

  async createProject(name: string, instructions = ''): Promise<{ project: Project }> {
    return this.request('/api/projects', { method: 'POST', body: JSON.stringify({ name, instructions }) });
  }

  async getProject(id: number): Promise<{ project: Project; chats: Chat[] }> {
    return this.request(`/api/projects/${id}`);
  }

  async updateProject(id: number, patch: { name?: string; instructions?: string }): Promise<{ project: Project }> {
    return this.request(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  async deleteProject(id: number): Promise<{ success: boolean }> {
    return this.request(`/api/projects/${id}`, { method: 'DELETE' });
  }

  async addProjectFile(pid: number, file: { name: string; mime_type?: string; content?: string; raw_bytes?: string; is_image?: boolean }): Promise<{ file: ProjectFile }> {
    return this.request(`/api/projects/${pid}/files`, { method: 'POST', body: JSON.stringify(file) });
  }

  async deleteProjectFile(pid: number, fid: number): Promise<{ success: boolean }> {
    return this.request(`/api/projects/${pid}/files/${fid}`, { method: 'DELETE' });
  }

  async renameProjectFile(pid: number, fid: number, name: string): Promise<{ success: boolean; file?: ProjectFile }> {
    return this.request(`/api/projects/${pid}/files/${fid}/rename`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async pinProjectFile(pid: number, fid: number, pinned: boolean): Promise<{ success: boolean; pinned?: boolean; file?: ProjectFile }> {
    return this.request(`/api/projects/${pid}/files/${fid}/pin`, {
      method: "POST",
      body: JSON.stringify({ pinned }),
    });
  }

  async updateProjectFile(pid: number, fid: number, updates: { name?: string; pinned?: boolean }): Promise<{ success: boolean; file?: ProjectFile }> {
    return this.request(`/api/projects/${pid}/files/${fid}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async getChatHistory(): Promise<{ chats: Chat[] }> {
    return this.request('/api/chat/history');
  }

  async getChatMessages(chatId: number): Promise<{
    chat: Chat;
    messages: Message[];
  }> {
    return this.request(`/api/chat/${chatId}/messages`);
  }

  async deleteChat(chatId: number): Promise<{ success: boolean }> {
    return this.request(`/api/chat/${chatId}`, { method: 'DELETE' });
  }

  async renameChat(chatId: number, title: string): Promise<{ success: boolean }> {
    return this.request(`/api/chat/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  async pinChat(chatId: number, pinned: boolean): Promise<{ success: boolean }> {
    return this.request(`/api/chat/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned }),
    });
  }

  // Streaming chat — SSE with fallback to regular endpoint
  streamDemoMessage(
    message: string,
    history: { role: string; content: string }[] = [],
    language: string = 'en',
    onChunk: (chunk: string) => void,
    onDone: (artifact?: any) => void,
    onError: (err: string) => void,
    files: any[] = [],
    onImages?: (images: Array<{ url: string; alt: string; caption?: string }>) => void,
    onSources?: (sources: Array<{ title: string; url: string; domain: string }>) => void,
    model: string = 'liquid',
  ): () => void {
    const controller = new AbortController();
    let aborted = false;
    let completed = false;
    const watchdog = setTimeout(() => {
      if (!completed && !aborted) {
        aborted = true;
        controller.abort();
        onError('stream_timeout');
      }
    }, 120000);

    const tryStream = async () => {
      try {
        const resp = await fetch(`${this.baseUrl}/api/chat/demo/stream`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, history, language, model }),
          signal: controller.signal,
        });

        if (!resp.ok) throw new Error(await this.buildError(resp));

        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.chunk) onChunk(parsed.chunk);
              if (parsed.images && onImages) onImages(parsed.images);
              if (parsed.sources && onSources) onSources(parsed.sources);
              if (parsed.done) { completed = true; clearTimeout(watchdog); onDone(parsed.artifact); return; }
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
            }
          }
        }
        // The server closed the connection WITHOUT sending "done" — treat as an error
        // so the UI is never left stuck in the loading state (input permanently disabled).
        if (!completed) {
          onError('stream_interrupted');
        }
        clearTimeout(watchdog);
      } catch (e: any) {
        clearTimeout(watchdog);
        if (aborted || e.name === 'AbortError') return;
        const errMsg = e.message || '';
        if (/HTTP 5|502|503|504|upstream|DZ-8 error/.test(errMsg)) onError('stream_unavailable');
        else onError(errMsg || 'stream_unavailable');
      }
    };

    tryStream();
    return () => { aborted = true; controller.abort(); };
  }

  streamMessage(
    message: string,
    chatId: number | undefined,
    model: 'gas' | 'liquid' | 'solid' | 'liquid45' | 'vainilla' | 'fast' | 'pro' | 'ultra' = 'liquid',
    language: string = 'en',
    onChunk: (chunk: string) => void,
    onDone: (chatId: number, artifact?: any, msgId?: number) => void,
    onError: (err: string) => void,
    files: any[] = [],
    onThinking?: (thinking: string) => void,
    onImages?: (images: Array<{ url: string; alt: string; caption?: string }>) => void,
    mode: string = 'chat',
    agentType: string = 'coder',
    onSources?: (sources: Array<{ title: string; url: string; domain: string }>) => void,
    projectId?: number | null,
    /** Fired as soon as the server assigns a chat id to a brand-new conversation */
    onChatId?: (chatId: number) => void,
  ): () => void {
    const controller = new AbortController();
    let aborted = false;
    let completed = false;
    let connected = false; // the server accepted the request: from here on it keeps generating even if we drop
    // Inactivity watchdog: a long answer is fine as long as bytes keep arriving (the backend
    // sends ": ping" every 12 s while the model is silent). A real silence or a hard cap aborts.
    const SILENCE_MS = 150000;
    const HARD_CAP_MS = 20 * 60 * 1000;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const fail = () => {
      if (!completed && !aborted) {
        aborted = true;
        controller.abort();
        onError('stream_timeout');
      }
    };
    const kick = () => { if (watchdog) clearTimeout(watchdog); watchdog = setTimeout(fail, SILENCE_MS); };
    kick();
    const hardCap = setTimeout(fail, HARD_CAP_MS);
    const clearWatchdog = () => { if (watchdog) clearTimeout(watchdog); clearTimeout(hardCap); };

    const tryStream = async () => {
      try {
        const resp = await fetch(`${this.baseUrl}/api/chat/stream`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            message, chat_id: chatId, language, files, mode, agent_type: agentType, project_id: projectId ?? undefined,
            // Liquid 4.5 is a variant of the Liquid tier (same plan accounting)
            model: model === 'liquid45' ? 'liquid' : model,
            model_variant: model === 'liquid45' ? 'liquid45' : undefined,
            ...userChatPrefs(),
          }),
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error(await this.buildError(resp));
        connected = true; // stream-recovery v1

        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let resolvedChatId = chatId;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          kick();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.chat_id) {
                const isNew = !chatId && resolvedChatId !== parsed.chat_id;
                resolvedChatId = parsed.chat_id;
                if (isNew && onChatId) onChatId(parsed.chat_id);
              }
              if (parsed.thinking && onThinking) onThinking(parsed.thinking);
              if (parsed.sources && onSources) onSources(parsed.sources);
              if (parsed.chunk) onChunk(parsed.chunk);
              if (parsed.images && onImages) onImages(parsed.images);
              if (parsed.done) { completed = true; clearWatchdog(); onDone(resolvedChatId!, parsed.artifact, parsed.msg_id); return; }
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
            }
          }
        }
        // The server closed the connection WITHOUT sending "done" — treat as an error
        // so the UI is never left stuck in the loading state (input permanently disabled).
        if (!completed) {
          onError('stream_interrupted');
        }
        clearWatchdog();
      } catch (e: any) {
        clearWatchdog();
        if (aborted || e.name === 'AbortError') return;
        const rawMsg = e.message || '';
        // A network drop AFTER the server accepted the request is a recoverable interruption:
        // the answer is still being generated server-side and will be fetched by the caller.
        if (connected && /Failed to fetch|Load failed|network|NetworkError|aborted|reset/i.test(rawMsg)) {
          onError('stream_interrupted');
          return;
        }
        const isTechError = /upstream|credentials|ValidationException|ThrottlingException|InternalServerException|HTTP 5|Failed to fetch|Load failed/.test(rawMsg);
        onError(isTechError ? 'stream_unavailable' : (rawMsg || 'stream_unavailable'));
      }
    };

    tryStream();
    return () => { aborted = true; controller.abort(); };
  }

  // Read-only conversation sharing (snapshot frozen at share time)
  async createShare(body: { chat_id?: number; message_id?: number; title?: string; messages?: any[] }): Promise<{ success: boolean; slug: string; url: string }> {
    return this.request('/api/shares', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async fetchShared(slug: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/shared/${slug}`, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Share not found');
    return res.json();
  }

  // Background generations: the task keeps running server-side even if this
  // device closed the chat — these let any device resume watching/cancel.
  async getGenerations(): Promise<Record<string, { status: string; content: string; thinking: string; ts: number }>> {
    const res = await this.request('/api/chats/generations', { method: 'GET' });
    return (res as any)?.generations || {};
  }

  async getGeneration(chatId: number): Promise<{ status: string; content: string; thinking: string; ts: number } | null> {
    try {
      const res = await this.request(`/api/chats/${chatId}/gen`, { method: 'GET' });
      if (!res || (res as any).status === 'none' || (res as any).error) return null;
      return res as any;
    } catch {
      return null;
    }
  }

  async cancelGeneration(chatId: number): Promise<boolean> {
    try {
      const res = await this.request(`/api/chats/${chatId}/cancel`, { method: 'POST' });
      return !!(res as any)?.cancelled;
    } catch {
      return false;
    }
  }

  // ── Skills ──
  async getSkills(): Promise<{ custom: CustomSkill[]; limits?: { max_skills: number; max_chars: number } }> {
    return this.request('/api/skills');
  }

  async updateSkills(payload: { custom: CustomSkill[] }): Promise<{ ok: boolean; custom: CustomSkill[] }> {
    return this.request('/api/skills', { method: 'POST', body: JSON.stringify(payload) });
  }

  // ── Pragmathic Code API keys ──
  async getCodeKeys(): Promise<{ keys: CodeKey[] }> {
    return this.request('/api/code/keys');
  }

  async createCodeKey(name: string): Promise<{ key: CodeKey; raw_key: string }> {
    return this.request('/api/code/keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async revokeCodeKey(kid: number): Promise<{ ok: boolean }> {
    return this.request(`/api/code/keys/${kid}`, { method: 'DELETE' });
  }

  // File upload
  async uploadFile(file: File): Promise<{
    success: boolean;
    filename: string;
    content: string;
    mime_type?: string;
    raw_bytes?: string;
    is_image?: boolean;
  }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      const raw = String(error.error || '');
      throw new ApiError(classifyHttpError(response.status, raw), raw, response.status);
    }

    return response.json();
  }
}

export const api = new APIService();
