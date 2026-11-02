# Plan: acceso de administrador mediante `/administracion`

## Objetivo

Crear la ruta `/administracion` para ingresar como administrador y retirar el acceso
oculto actual (icono de llave en el footer y atajo `Ctrl+Shift+Alt+A`).

## Alcance

- Ruta SPA servida por Express usando `frontend/index.html`.
- Login de administrador mediante la API existente.
- Eliminación del icono secreto y del atajo de teclado.
- Sin cambios en el modelo de datos ni en los endpoints de administración.

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `backend/server.js` | Ruta explícita `GET /administracion` |
| `frontend/index.html` | Eliminar los dos `#footer-admin-secret` |
| `frontend/script.js` | Resolver ruta, centralizar apertura del panel, quitar accesos ocultos |
| `frontend/styles.css` | Eliminar reglas `.footer-admin-secret` |
| `backend/tests/api.test.js` | Test de la nueva ruta |
| `ACCESS.md` | Documentar el acceso por ruta |
| `README.md` | Mencionar `/administracion` |

## 1. Backend — `backend/server.js`

- [x] Añadir `GET /administracion` antes del catch-all, devolviendo
      `frontend/index.html`.
- [x] Enviar cabecera `X-Robots-Tag: noindex` en esa ruta.
- [x] Mantener el catch-all para el resto de rutas SPA.

No se requieren endpoints nuevos. La API ya valida `role: 'admin'` en
`POST /api/auth/login` y protege las rutas administrativas con
`requireRole('admin')`.

## 2. Frontend — `frontend/index.html`

- [x] Eliminar el icono de llave dentro de `.app-footer`.
- [x] Eliminar el icono fijo inferior derecho.
- [x] Conservar sin cambios `#admin-screen` y `#admin-panel`.

## 3. Frontend — `frontend/script.js`

- [x] Crear helper `openAdminPanel()` que:
      - marque `isAdmin = true` y `currentUserType = 'admin'`;
      - muestre `admin-panel`;
      - active `#admin-sidebar`;
      - ejecute `refreshAdminData()` y `loadAdminPanel()`.
- [x] Reutilizar ese helper en `handleAdminLogin()`.
- [x] En `handleAdminLogin()`, actualizar la URL a `/administracion`.
- [x] Resolver la ruta al iniciar la app, después de
      `restoreSessionFromStorage()`:
      - si `pathname === '/administracion'` y hay sesión admin → abrir panel;
      - si `pathname === '/administracion'` sin sesión admin → mostrar `admin-screen`;
      - en cualquier otra ruta → mostrar `inicio-screen` como ahora.
- [x] En `logoutAdmin()`, limpiar sesión y volver a `/`.
- [x] Eliminar el listener de `#footer-admin-secret`.
- [x] Eliminar el atajo `Ctrl+Shift+Alt+A`.
- [x] Eliminar la lógica de visibilidad de `#footer-admin-secret` dentro de
      `updateNavbarUser()`.
- [x] En `showScreen()`, añadir guarda:
      `admin-panel` solo si `currentUserType === 'admin'`.
- [x] Actualizar el listener `popstate` para reconocer `/administracion`
      igual que `/biblioteca` y `/progresos`.

## 4. Estilos — `frontend/styles.css`

- [x] Eliminar `.footer-admin-secret`.
- [x] Eliminar `.footer-admin-secret:hover`.

## 5. Documentación

- [x] `ACCESS.md`:
      - cambiar “Administrador | Botón Administrador” por
        “Administrador | `/administracion`”;
      - actualizar la sección “Administrador” con la nueva ruta.
- [x] `README.md`:
      - indicar que el panel admin se abre en
        `http://localhost:3000/administracion`.

## 6. Pruebas — `backend/tests/api.test.js`

- [x] Verificar que `GET /administracion` responde `200`.
- [x] Verificar que el HTML contiene `id="admin-screen"`.
- [x] Confirmar que la API administrativa sigue rechazando usuarios sin rol admin.

## 7. Verificación manual

- [ ] Reiniciar el servidor (cambia `server.js`).
- [ ] Abrir `http://localhost:3000/administracion` → debe mostrar el login admin.
- [ ] Ingresar con `admin` / `admin123` → debe abrir el panel.
- [ ] Recargar en `/administracion` → debe conservar la sesión y el panel.
- [ ] Cerrar sesión → debe volver a `/`.
- [ ] Abrir `/` → no debe existir la llave ni funcionar el atajo.
- [ ] Entrar como estudiante/profesor → el flujo normal no debe cambiar.

## Consideraciones

- La ruta es una mejora de navegación, no un límite de seguridad.
- La autorización real permanece en la API con `requireRole('admin')`.
- El prototipo `frontend/simple.html` conserva su botón `#btn-admin`, pero no es
  la aplicación servida por Express; se puede limpiar en una tarea aparte.
