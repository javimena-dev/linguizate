export interface User {
  id: number;
  name: string;
  email: string;
  role: 'estudiante' | 'profesor' | 'admin';
  emailVerified: boolean;
  avatar: string | null;
  authMethods: string[];
}

export interface SessionResponse {
  user: User;
  requiresVerification?: boolean;
  message?: string;
}

export interface ChatUsage {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;

  constructor(message: string, status = 0, code = 'REQUEST_FAILED', errors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

function cookie(name: string): string | null {
  const prefix = `${name}=`;
  const value = document.cookie.split('; ').find((item) => item.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

async function ensureCsrf(force = false): Promise<void> {
  if (!force && cookie('XSRF-TOKEN')) return;
  const response = await fetch('/sanctum/csrf-cookie', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok && response.status !== 204) {
    throw new ApiError('No se pudo iniciar la sesión segura.', response.status, 'CSRF_FAILED');
  }
}

function firstValidationMessage(errors?: Record<string, string[]>): string | undefined {
  if (!errors) return undefined;
  return Object.values(errors).flat().find(Boolean);
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const csrfProtected = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (csrfProtected) await ensureCsrf();

  let response: Response;
  const send = () => fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie('XSRF-TOKEN') ? { 'X-XSRF-TOKEN': cookie('XSRF-TOKEN')! } : {}),
      ...init.headers,
    },
  });

  try {
    response = await send();
    if (response.status === 419 && csrfProtected) {
      await ensureCsrf(true);
      response = await send();
    }
  } catch {
    throw new ApiError('No pudimos conectar con el servidor.', 0, 'CONNECTION');
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = firstValidationMessage(data.errors) || data.error || data.message || 'No se pudo completar la solicitud.';
    throw new ApiError(message, response.status, data.code, data.errors);
  }
  return data as T;
}

export const api = {
  session: () => request<SessionResponse>('/api/auth/session'),
  login: (email: string, password: string, remember: boolean) => request<SessionResponse>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password, remember }),
  }),
  register: (payload: Record<string, string>) => request<SessionResponse>('/api/auth/register', {
    method: 'POST', body: JSON.stringify(payload),
  }),
  logout: async () => {
    try {
      await request<void>('/api/auth/session', { method: 'DELETE' });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      throw error;
    }
  },
  forgotPassword: (email: string) => request<{ message: string }>('/api/auth/password/forgot', {
    method: 'POST', body: JSON.stringify({ email }),
  }),
  resetPassword: (payload: Record<string, string>) => request<{ message: string }>('/api/auth/password/reset', {
    method: 'POST', body: JSON.stringify(payload),
  }),
  resendVerification: () => request<{ message: string }>('/api/auth/email/resend', { method: 'POST' }),
  chatUsage: () => request<ChatUsage>('/api/chat/usage'),
};

export function showAlert(element: HTMLElement, message: string, kind: 'error' | 'success' | 'info' = 'error'): void {
  element.textContent = message;
  element.dataset.kind = kind;
  element.hidden = false;
}

export function setBusy(button: HTMLButtonElement, busy: boolean, busyLabel = 'Procesando…'): void {
  if (busy) button.dataset.label = button.textContent || '';
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.label || button.textContent;
}

export async function currentUser(): Promise<User | null> {
  try {
    return (await api.session()).user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function redirectAuthenticated(): Promise<void> {
  const user = await currentUser();
  if (user) location.replace(user.emailVerified ? '/chat/' : '/verificar-correo/');
}

export async function requireVerifiedUser(): Promise<User> {
  const user = await currentUser();
  if (!user) {
    location.replace(`/login/?next=${encodeURIComponent(location.pathname)}`);
    throw new ApiError('Sesión requerida.', 401, 'UNAUTHENTICATED');
  }
  if (!user.emailVerified) {
    location.replace('/verificar-correo/');
    throw new ApiError('Correo sin verificar.', 403, 'EMAIL_NOT_VERIFIED');
  }
  return user;
}

export async function streamChat(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  onDelta: (delta: string) => void,
  onUsage: (usage: ChatUsage) => void,
  signal?: AbortSignal,
): Promise<void> {
  await ensureCsrf(true);
  let response: Response;
  const send = () => fetch('/api/chat', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json, application/x-ndjson',
      'Content-Type': 'application/json',
      ...(cookie('XSRF-TOKEN') ? { 'X-XSRF-TOKEN': cookie('XSRF-TOKEN')! } : {}),
    },
    body: JSON.stringify({ message, history }),
    signal,
  });

  try {
    response = await send();
    if (response.status === 419) {
      await ensureCsrf(true);
      response = await send();
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('No pudimos conectar con el tutor.', 0, 'CONNECTION');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || 'El tutor no pudo responder.', response.status, data.code);
  }
  if (!response.body) throw new ApiError('El navegador no admite respuestas progresivas.', 0, 'STREAM_UNAVAILABLE');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processLine = (line: string): void => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'delta') onDelta(String(event.delta || ''));
    if (event.type === 'meta') onUsage(event as ChatUsage);
    if (event.type === 'error') throw new ApiError(event.error, 0, event.code);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) processLine(line);
    if (done) break;
  }
  if (buffer.trim()) processLine(buffer);
}
