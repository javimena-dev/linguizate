/**
 * Guardia de rutas del lado del cliente para Lingüízate.
 *
 * Uso en cada página:
 *   import { guardRoute } from '../scripts/guards';
 *   await guardRoute('estudiante'); // o 'profesor', 'admin', 'guest', null
 *
 * Roles:
 *   null           → pública (cualquiera puede ver)
 *   'guest'        → solo invitados (redirige autenticados)
 *   'estudiante'   → solo estudiantes
 *   'profesor'     → solo profesores
 *   'admin'        → solo administradores
 *   ['estudiante','profesor'] → varios roles permitidos
 */

import { navigate } from 'astro:transitions/client';
import { $currentUser, $sessionStatus, fetchCurrentSession, clearSession } from './store';
import { notify } from './feedback';

export type AllowedRole = 'estudiante' | 'profesor' | 'admin' | 'guest' | null;

const ROLE_HOME: Record<string, string> = {
  estudiante: '/',
  profesor: '/profesor',
  admin: '/administracion'
};

/**
 * Oculta el contenido de la página mientras se valida la sesión.
 * Devuelve una función para volver a mostrar el contenido.
 */
function hideContent(): () => void {
  const main = document.querySelector<HTMLElement>('.app-main-content');
  if (main) main.style.visibility = 'hidden';
  return () => { if (main) main.style.visibility = ''; };
}

/**
 * Evalúa si el usuario actual puede acceder a la ruta.
 * Redirige si no tiene permiso, muestra toast en caso de 403.
 *
 * @param allowed  Rol(es) permitidos, 'guest' para solo invitados, null para público
 */
export async function guardRoute(allowed: AllowedRole | AllowedRole[]): Promise<void> {
  if (typeof window === 'undefined') return;

  // Rutas públicas — sin guardia
  if (allowed === null) return;

  const reveal = hideContent();

  try {
    await fetchCurrentSession();
    const user = $currentUser.get();
    const status = $sessionStatus.get();

    // Error de conexión — mostrar mensaje pero no redirigir
    if (status === 'error') {
      reveal();
      notify({ message: 'No se pudo verificar tu sesión. El servidor no está disponible.', kind: 'warning' });
      return;
    }

    // Ruta solo para invitados (ej. /login)
    if (allowed === 'guest') {
      if (user) {
        if (!user.emailVerified) {
          await navigate('/verificar-correo');
          return;
        }
        // Redirigir al home del rol correspondiente
        const home = ROLE_HOME[user.role] || '/';
        const next = new URLSearchParams(window.location.search).get('next');
        const destination = next && /^\/[a-z]/.test(next) ? next : home;
        await navigate(destination);
        return;
      }
      reveal();
      return;
    }

    // Rutas protegidas — necesita sesión
    if (!user) {
      const params = new URLSearchParams({ next: window.location.pathname + window.location.search });
      await navigate(`/login?${params}`);
      return;
    }

    if (!user.emailVerified) {
      await navigate('/verificar-correo');
      return;
    }

    // Verificar rol
    const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
    if (!allowedRoles.includes(user.role as AllowedRole)) {
      notify({ message: 'No tienes permiso para acceder a esta sección.', kind: 'warning' });
      const home = ROLE_HOME[user.role] || '/';
      await navigate(home);
      return;
    }

    reveal();
  } catch {
    reveal();
  }
}

/**
 * Maneja respuestas 401 de la API: limpia la sesión y redirige al login.
 */
export function handle401(): void {
  clearSession();
  const params = new URLSearchParams({ next: window.location.pathname });
  void navigate(`/login?${params}`);
}

/**
 * Maneja respuestas 403 de la API: muestra toast y redirige al home del rol.
 */
export function handle403(user: { role: string } | null): void {
  notify({ message: 'No tienes permiso para realizar esa acción.', kind: 'warning' });
  const home = ROLE_HOME[user?.role || ''] || '/';
  void navigate(home);
}
