export type FeedbackKind = 'success' | 'error' | 'info' | 'warning';

type ToastOptions = {
  title?: string;
  message: string;
  kind?: FeedbackKind;
  timeout?: number;
};

let lastFocused: HTMLElement | null = null;

function root() {
  return document.getElementById('feedback-toasts');
}

export function notify({ title, message, kind = 'info', timeout = 4500 }: ToastOptions) {
  const host = root();
  if (!host) return;
  const toast = document.createElement('article');
  toast.className = `app-toast app-toast--${kind}`;
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const icon = { success: 'fa-check-circle', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' }[kind];
  const content = document.createElement('div');
  content.className = 'app-toast__content';
  content.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
  const text = document.createElement('div');
  if (title) {
    const strong = document.createElement('strong');
    strong.textContent = title;
    text.appendChild(strong);
  }
  const body = document.createElement('span');
  body.textContent = message;
  text.appendChild(body);
  content.appendChild(text);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'app-toast__close';
  close.setAttribute('aria-label', 'Cerrar aviso');
  close.innerHTML = '<i class="fas fa-xmark" aria-hidden="true"></i>';
  close.addEventListener('click', () => toast.remove());
  toast.append(content, close);
  host.appendChild(toast);
  window.setTimeout(() => toast.remove(), timeout);
}

export function setButtonLoading(button: HTMLButtonElement | null, loading: boolean, label?: string) {
  if (!button) return;
  if (loading) {
    if (!button.dataset.label) button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-loading');
    button.innerHTML = `<span class="wave-loader" aria-hidden="true"><i></i><i></i><i></i></span><span>${label || 'Procesando'}</span>`;
    return;
  }
  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.classList.remove('is-loading');
  if (button.dataset.label) button.innerHTML = button.dataset.label;
  delete button.dataset.label;
}

/**
 * runAsyncAction – Envuelve acciones asíncronas con:
 * - Bloqueo de botón ANTES del primer await (sin doble envío)
 * - Loader de olas (wave-loader)
 * - aria-busy
 * - Toast de éxito o error automático
 * - Mensaje exacto del backend cuando falla
 * - Toast específico de conexión cuando el backend no responde
 * - Restauración del botón al finalizar
 */
export async function runAsyncAction<T>(
  button: HTMLButtonElement | null,
  action: () => Promise<T>,
  opts: {
    loadingLabel?: string;
    successMessage?: string;
    errorPrefix?: string;
    /** Si true, no muestra toast de éxito automático */
    silent?: boolean;
  } = {}
): Promise<T | undefined> {
  // Bloquear antes del primer await para impedir doble envío
  if (button?.disabled) return undefined;
  if (button) setButtonLoading(button, true, opts.loadingLabel);

  try {
    const result = await action();
    if (!opts.silent && opts.successMessage) {
      notify({ message: opts.successMessage, kind: 'success' });
    }
    return result;
  } catch (err: any) {
    const isConnection = err?.isConnection || err?.code === 'CONNECTION' || err?.code === 'TIMEOUT';
    const message = isConnection
      ? 'No se pudo conectar al servidor. Verifica que el backend esté activo.'
      : err?.message || (opts.errorPrefix ? `${opts.errorPrefix}: error desconocido` : 'Ocurrió un error inesperado');
    notify({ message, kind: 'error' });
    return undefined;
  } finally {
    if (button) setButtonLoading(button, false);
  }
}

export function confirmAction({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' }: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}): Promise<boolean> {
  const dialog = document.getElementById('feedback-confirm') as HTMLDialogElement | null;
  if (!dialog) return Promise.resolve(false);
  const titleEl = dialog.querySelector('[data-confirm-title]');
  const messageEl = dialog.querySelector('[data-confirm-message]');
  const confirmButton = dialog.querySelector('[data-confirm-accept]') as HTMLButtonElement | null;
  const cancelButton = dialog.querySelector('[data-confirm-cancel]') as HTMLButtonElement | null;
  if (!confirmButton || !cancelButton) return Promise.resolve(false);
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  confirmButton.textContent = confirmLabel;
  cancelButton.textContent = cancelLabel;
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.showModal();
  return new Promise((resolve) => {
    const close = (accepted: boolean) => {
      dialog.close();
      lastFocused?.focus();
      confirmButton.removeEventListener('click', accept);
      cancelButton.removeEventListener('click', cancel);
      dialog.removeEventListener('cancel', cancelEvent);
      resolve(accepted);
    };
    const accept = () => close(true);
    const cancel = () => close(false);
    const cancelEvent = (event: Event) => { event.preventDefault(); close(false); };
    confirmButton.addEventListener('click', accept);
    cancelButton.addEventListener('click', cancel);
    dialog.addEventListener('cancel', cancelEvent);
  });
}

export function skeletonCards(count = 3) {
  return Array.from({ length: count }, () => '<div class="skeleton-card" aria-hidden="true"><span></span><span></span><span></span></div>').join('');
}
