# Publicación completa en HostGator

Laravel contiene API y frontend Astro. Node solo compila en el equipo local.

## Preparar paquete local

1. En `backend-laravel`, ejecuta `npm run frontend:release`.
2. Confirma que `public` contiene las 18 rutas Astro, `index.php` y `.htaccess`.
3. Ejecuta `composer install --no-dev --optimize-autoloader`.
4. Ejecuta `php artisan test` antes de comprimir el proyecto.

`frontend:publish` usa un manifiesto. Solo reemplaza archivos creados por Astro y nunca sobrescribe `index.php`, `.htaccess` ni `web.config`.

## Estructura cPanel

1. Sube `backend-laravel` fuera de `public_html`, por ejemplo `~/linguizate-api`.
2. Copia `backend-laravel/public` a `public_html` del subdominio.
3. Ajusta `public_html/index.php` si Laravel está en `~/linguizate-api`.
4. Conserva `.htaccess`: sirve archivos Astro y envía `/api/*` y `/sanctum/*` a Laravel.
5. Importa la base MySQL o ejecuta migraciones.
6. Ejecuta `php artisan optimize` después de configurar `.env`.

## Variables mínimas

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://linguizate.jmenachop.com
FRONTEND_URL=https://linguizate.jmenachop.com
SESSION_DOMAIN=linguizate.jmenachop.com
SESSION_SECURE_COOKIE=true
SANCTUM_STATEFUL_DOMAINS=linguizate.jmenachop.com

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=...
DB_USERNAME=...
DB_PASSWORD=...

MAIL_MAILER=smtp
MAIL_SCHEME=smtps
MAIL_HOST=smtp.titan.email
MAIL_PORT=465
MAIL_USERNAME=administrador@jmenachop.com
MAIL_PASSWORD=...
MAIL_FROM_ADDRESS=administrador@jmenachop.com
MAIL_FROM_NAME="Lingüízate"

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://linguizate.jmenachop.com/api/auth/google/callback
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_CONNECT_TIMEOUT=5
GROQ_TIMEOUT=25
CHAT_DAILY_LIMIT=10
```

Google Cloud debe registrar exactamente el URI de redirección anterior. Activa HTTPS antes de probar sesiones.

## Validación de producción

- Registro estudiante, correo de verificación y cierre de sesión.
- Google solo para estudiantes.
- Recuperación de contraseña.
- Invitación y activación docente.
- Login y paneles por rol.
- Juego público y guardado autenticado.
- Chat Groq progresivo.

HostGator no necesita Node, `node_modules`, `frontend/src` ni `frontend/dist` para ejecutar la aplicación.
