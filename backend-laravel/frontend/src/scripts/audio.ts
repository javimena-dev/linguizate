import { $isMusicEnabled } from './store';

const SOUND_PATHS: Record<string, string> = {
  correct: '/assets/sounds/game/correct.mp3',
  wrong: '/assets/sounds/game/wrong.mp3',
  select: '/assets/sounds/game/select.mp3',
  start: '/assets/sounds/game/start.mp3'
};

const audioCache = new Map<string, HTMLAudioElement>();

export function playSFX(type: string): void {
  if (typeof window === 'undefined') return;

  const path = SOUND_PATHS[type];
  if (path) {
    let audio = audioCache.get(path);
    if (!audio) {
      audio = new Audio(path);
      audioCache.set(path, audio);
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }

  // Fallback con Web Audio API para sonidos simples (timer, click, etc.)
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'timer_low') {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'click') {
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    }
  } catch (_e) {}
}

export function initAmbientMusic(): void {
  if (typeof window === 'undefined') return;

  const audio = document.getElementById('ambient-audio') as HTMLAudioElement | null;
  if (!audio) return;

  audio.volume = 0.25;

  const tryPlay = () => {
    if ($isMusicEnabled.get()) {
      audio.play().catch(() => {
        // Bloqueo de autoplay por el navegador; iniciar en el primer clic de la página
        const startOnClick = () => {
          if ($isMusicEnabled.get()) audio.play().catch(() => {});
          window.removeEventListener('click', startOnClick);
        };
        window.addEventListener('click', startOnClick);
      });
    }
  };

  tryPlay();
}
