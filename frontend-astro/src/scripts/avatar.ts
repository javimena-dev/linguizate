/**
 * resolveAvatarUrl – convierte cualquier valor de avatar almacenado
 * en una URL utilizable por <img src="">.
 *
 * Formatos soportados:
 *  - 'default1' … 'default6'   → /assets/images/avatares/default1.png
 *  - 'assets/images/...'       → /assets/images/...  (ruta legacy sin slash inicial)
 *  - '/assets/images/...'      → igual, ya válida
 *  - 'data:...'                → imagen en base64 subida por el usuario
 *  - null / undefined / ''     → null (mostrar fallback por iniciales)
 */
export function resolveAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;

  // Datos base64 subidos por el usuario
  if (avatar.startsWith('data:')) return avatar;

  // Alias legacy default1…default6 -> avatar-01.png … avatar-06.png
  const defaultMatch = avatar.match(/^default([1-6])$/i);
  if (defaultMatch) {
    const num = defaultMatch[1].padStart(2, '0');
    return `/assets/images/avatares/avatar-${num}.png`;
  }

  // Nombre de archivo directo como avatar-01.png o avatar-1
  const avatarMatch = avatar.match(/^avatar-?0?([1-6])(\.png)?$/i);
  if (avatarMatch) {
    const num = avatarMatch[1].padStart(2, '0');
    return `/assets/images/avatares/avatar-${num}.png`;
  }

  // Ruta legacy sin slash inicial (ej: assets/images/avatares/avatar-01.png)
  if (avatar.startsWith('assets/')) return `/${avatar}`;

  // Ruta ya válida con slash
  if (avatar.startsWith('/assets/') || avatar.startsWith('/')) return avatar;

  // URL completa (https://…)
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;

  return null;
}

/**
 * Genera las iniciales de un nombre para el fallback de avatar.
 * Toma las dos primeras palabras.
 */
export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';
}

/**
 * Actualiza el elemento de avatar (componente <Avatar>) con
 * la URL resuelta o las iniciales como fallback.
 */
export function applyAvatar(root: HTMLElement | null, name: string, avatarValue: string | null | undefined): void {
  if (!root) return;
  const img = root.querySelector<HTMLImageElement>('[data-avatar-image]');
  const fallback = root.querySelector<HTMLElement>('[data-avatar-fallback]');
  const url = resolveAvatarUrl(avatarValue);

  if (img) {
    if (url) {
      img.src = url;
      img.alt = `Avatar de ${name}`;
      img.hidden = false;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
    }
  }
  if (fallback) {
    fallback.textContent = getInitials(name);
    fallback.hidden = Boolean(url);
  }
}
