import { atom } from 'nanostores';
import { api } from './api';

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'estudiante' | 'profesor' | 'admin';
  isAdmin: boolean;
  isProfesor: boolean;
  isEstudiante: boolean;
  score: number;
  gamesPlayed: number;
  avatar: string | null;
  gender: string;
  achievements: string[];
  emailVerified?: boolean;
  authMethods?: string[];
}

export interface Question {
  id: string;
  question: string;
  options: string[];
  correct: number;
  difficulty: 'facil' | 'medio' | 'dificil';
  explanation: string;
}

export interface GameAttempt {
  questionId: string;
  selectedOriginalIndex: number;
  responseTimeSeconds: number;
}

export interface ActiveGame {
  clientGameId: string;
  category?: { id: string; name: string };
  subcategory?: { id: string; name: string };
  mode: 'clasico' | 'estudio';
  questions: Question[];
  currentQuestionIndex: number;
  score: number;
  streak: number;
  correctAnswers: number;
  incorrectAnswers: number;
  attempts: GameAttempt[];
  playedAt: string;
}

// Estado de sesión global
export type SessionStatus = 'loading' | 'authenticated' | 'guest' | 'error';

export const $currentUser = atom<User | null>(null);
export const $sessionStatus = atom<SessionStatus>('loading');
export const $currentMode = atom<'clasico' | 'estudio'>('clasico');
export const $activeGame = atom<ActiveGame | null>(null);
export const $isMusicEnabled = atom<boolean>(true);
export const $isDarkMode = atom<boolean>(false);

let sessionPromise: Promise<User | null> | null = null;

const ACTIVE_GAME_KEY = 'linguizate_active_game';

function saveActiveGame(game: ActiveGame | null) {
  if (typeof sessionStorage === 'undefined') return;
  if (game) sessionStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(game));
  else sessionStorage.removeItem(ACTIVE_GAME_KEY);
}

// Inicializar preferencias desde localStorage
if (typeof window !== 'undefined') {
  const savedTheme = localStorage.getItem('linguizate_theme');
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    $isDarkMode.set(true);
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  const musicPref = localStorage.getItem('linguizate_music_muted');
  $isMusicEnabled.set(musicPref !== 'true');
  try {
    const savedGame = sessionStorage.getItem(ACTIVE_GAME_KEY);
    if (savedGame) $activeGame.set(JSON.parse(savedGame));
  } catch (_error) {
    sessionStorage.removeItem(ACTIVE_GAME_KEY);
  }
  $activeGame.subscribe(saveActiveGame);
}

/**
 * Obtiene la sesión actual del servidor.
 * - 'loading' → mientras consulta
 * - 'authenticated' → sesión válida
 * - 'guest' → 401 (no hay sesión)
 * - 'error' → fallo de red/conexión (NO se trata como invitado)
 */
export async function fetchCurrentSession(): Promise<User | null> {
  // Si ya está autenticado, no repetir la consulta
  const currentUser = $currentUser.get();
  if (currentUser) {
    $sessionStatus.set('authenticated');
    return currentUser;
  }

  if (!sessionPromise) {
    $sessionStatus.set('loading');
    sessionPromise = (async () => {
      try {
        const res = await api.get<{ user: User }>('/auth/session');
        if (res?.user) {
          const latestUser = $currentUser.get();
          if (!latestUser) $currentUser.set(res.user);
          $sessionStatus.set('authenticated');
          void syncPendingGames();
          return latestUser || res.user;
        }
        $sessionStatus.set('guest');
        return null;
      } catch (err: any) {
        if (err?.code === 'UNAUTHORIZED' || err?.status === 401) {
          // No hay sesión activa — estado invitado
          $sessionStatus.set('guest');
          return null;
        }
        // Error de red/conexión — NO es invitado
        $sessionStatus.set('error');
        return null;
      }
    })();
  }

  return sessionPromise;
}

export async function logoutUser(): Promise<void> {
  try {
    await api.endSession();
  } catch (_e) {}
  sessionPromise = null;
  $currentUser.set(null);
  $sessionStatus.set('guest');
  $activeGame.set(null);
  if (typeof window !== 'undefined') {
    localStorage.removeItem('linguizate_user');
  }
}

export function updateCurrentUser(user: User): void {
  $currentUser.set(user);
  $sessionStatus.set('authenticated');
  sessionPromise = Promise.resolve(user);
}

export function clearSession(): void {
  sessionPromise = null;
  $currentUser.set(null);
  $sessionStatus.set('guest');
  $activeGame.set(null);
}

export async function syncPendingGames(): Promise<void> {
  const user = $currentUser.get();
  if (typeof localStorage === 'undefined' || !user?.isEstudiante || !user.emailVerified) return;
  try {
    const pending = JSON.parse(localStorage.getItem('linguizate_pending_games') || '[]');
    if (!Array.isArray(pending) || !pending.length) return;
    const unsynced: unknown[] = [];
    for (const game of pending) {
      try { await api.post('/games', game); } catch (_error) { unsynced.push(game); }
    }
    localStorage.setItem('linguizate_pending_games', JSON.stringify(unsynced));
  } catch (_error) {}
}

export function toggleTheme(): boolean {
  const current = $isDarkMode.get();
  const next = !current;
  $isDarkMode.set(next);
  if (typeof window !== 'undefined') {
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('linguizate_theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('linguizate_theme', 'light');
    }
  }
  return next;
}

export function toggleMusic(): boolean {
  const current = $isMusicEnabled.get();
  const next = !current;
  $isMusicEnabled.set(next);
  if (typeof window !== 'undefined') {
    localStorage.setItem('linguizate_music_muted', (!next).toString());
    const audio = document.getElementById('ambient-audio') as HTMLAudioElement | null;
    if (audio) {
      if (next) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    }
  }
  return next;
}
