// Cliente API para Lingüízate – con timeout, clasificación de errores y AbortSignal
const BASE_URL = (typeof window !== 'undefined' && (window as any).LINGUIZATE_API_URL || '/api').replace(/\/$/, '');

const DEFAULT_TIMEOUT_MS = 15_000;

export type ApiErrorCode =
  | 'NETWORK'
  | 'CONNECTION'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | string;

export interface ApiError extends Error {
  code?: ApiErrorCode;
  status?: number;
  isConnection?: boolean;
}

export interface ChatUsage {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
}

export interface ChatStreamHandlers {
  onDelta: (delta: string) => void;
  onUsage?: (usage: ChatUsage) => void;
}

function csrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfCookie(force = false): Promise<void> {
  if (typeof document === 'undefined' || (!force && csrfToken())) return;
  const response = await fetch('/sanctum/csrf-cookie', {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok && response.status !== 204) {
    throw buildError('No se pudo iniciar la sesión segura.', response.status, 'CSRF_FAILED');
  }
}

function buildError(message: string, status?: number, code?: string): ApiError {
  const err: ApiError = new Error(message);
  err.status = status;
  err.code = code;
  err.isConnection = !status;
  return err;
}

function firstValidationMessage(errors?: Record<string, string[]>): string | undefined {
  if (!errors) return undefined;
  return Object.values(errors).flat().find(Boolean);
}

const catalogCache = new Map<string, { data: any; expiry: number }>();
const CATALOG_CACHE_TTL = 30_000;

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit & { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const method = (options.method || 'GET').toUpperCase();

  // Invalida caché de catálogo en mutaciones
  if (method !== 'GET') {
    if (normalizedPath.includes('categories') || normalizedPath.includes('questions')) {
      catalogCache.clear();
    }
  } else if (normalizedPath === '/catalog') {
    const cached = catalogCache.get('/catalog');
    if (cached && Date.now() < cached.expiry) {
      return cached.data as T;
    }
  }

  const url = `${BASE_URL}${normalizedPath}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Combinar signal externo con timeout
  const timeoutController = new AbortController();
  const timerId = setTimeout(() => timeoutController.abort(), timeoutMs);

  let combinedSignal = timeoutController.signal;
  if (options.signal) {
    const ext = options.signal;
    if (ext.aborted) { clearTimeout(timerId); throw buildError('Solicitud cancelada', undefined, 'ABORTED'); }
    // Abort combinado
    const merged = new AbortController();
    const onExtAbort = () => merged.abort();
    ext.addEventListener('abort', onExtAbort);
    timeoutController.signal.addEventListener('abort', () => merged.abort());
    combinedSignal = merged.signal;
    // Cleanup
    combinedSignal.addEventListener('abort', () => ext.removeEventListener('abort', onExtAbort));
  }

  const { timeoutMs: _t, ...fetchOptions } = options;

  const csrfProtected = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (csrfProtected) await ensureCsrfCookie();

  let response: Response;
  const send = () => fetch(url, {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken() ? { 'X-XSRF-TOKEN': csrfToken()! } : {}),
      ...(fetchOptions.headers || {})
    },
    signal: combinedSignal
  });
  try {
    response = await send();
    if (response.status === 419 && csrfProtected) {
      await ensureCsrfCookie(true);
      response = await send();
    }
  } catch (err: any) {
    clearTimeout(timerId);
    if (err?.name === 'AbortError') {
      const timedOut = timeoutController.signal.aborted;
      throw buildError(
        timedOut ? 'La solicitud tardó demasiado. Revisa tu conexión.' : 'Solicitud cancelada',
        undefined,
        timedOut ? 'TIMEOUT' : 'ABORTED'
      );
    }
    throw buildError(
      'No se pudo conectar al servidor. Verifica que el backend esté activo.',
      undefined,
      'CONNECTION'
    );
  } finally {
    clearTimeout(timerId);
  }

  if (response.status === 204) return null as T;

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = firstValidationMessage(data?.errors) || data?.error || data?.message || 'No se pudo completar la solicitud';
    const code: ApiErrorCode = data?.code
      || (response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'FORBIDDEN' : 'SERVER_ERROR');
    if (typeof window !== 'undefined' && normalizedPath !== '/auth/session') {
      if (response.status === 401) window.dispatchEvent(new CustomEvent('linguizate:unauthorized'));
      if (response.status === 403 && data?.code === 'EMAIL_NOT_VERIFIED') {
        window.dispatchEvent(new CustomEvent('linguizate:verification-required'));
      }
    }
    throw buildError(message, response.status, code);
  }

  if (normalizedPath === '/catalog' && method === 'GET') {
    catalogCache.set('/catalog', { data, expiry: Date.now() + CATALOG_CACHE_TTL });
  }

  return data as T;
}

export async function streamChat(
  body: Record<string, unknown>,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  // El chat progresivo excluye timeout fijo
  await ensureCsrfCookie();
  let response: Response;
  const send = () => {
    const token = csrfToken();
    return fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
      ...(token ? { 'X-XSRF-TOKEN': token } : {})
    },
    body: JSON.stringify(body),
    signal
    });
  };
  try {
    response = await send();
    if (response.status === 419) {
      await ensureCsrfCookie(true);
      response = await send();
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw buildError('Chat cancelado', undefined, 'ABORTED');
    throw buildError('No se pudo conectar al servidor de chat.', undefined, 'CONNECTION');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw buildError(data?.error || 'Error en el chat', response.status, data?.code);
  }

  if (!response.body) throw new Error('El navegador no pudo leer la respuesta progresiva.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'delta') handlers.onDelta(String(event.delta || ''));
    if (event.type === 'meta') handlers.onUsage?.(event as ChatUsage);
    if (event.type === 'error') {
      if (typeof event.remaining === 'number') handlers.onUsage?.(event as ChatUsage);
      const err: ApiError = new Error(event.error || 'La respuesta se interrumpió.');
      err.code = event.code;
      throw err;
    }
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

export const api = {
  get: <T = any>(path: string, signal?: AbortSignal) =>
    apiRequest<T>(path, { method: 'GET', signal }),
  post: <T = any>(path: string, body?: any, signal?: AbortSignal) =>
    apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body || {}), signal }),
  patch: <T = any>(path: string, body?: any, signal?: AbortSignal) =>
    apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body || {}), signal }),
  delete: <T = any>(path: string, body?: any, signal?: AbortSignal) =>
    apiRequest<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body), signal }),
  streamChat,
  endSession: <T = any>() => apiRequest<T>('/auth/session', { method: 'DELETE' })
};

if (typeof window !== 'undefined') {
  (window as any).LinguizateAPI = {
    request: apiRequest,
    get: api.get,
    post: api.post,
    patch: api.patch,
    delete: api.delete,
    streamChat: api.streamChat,
    endSession: api.endSession
  };
}

export default api;
