# Publicación inicial en HostGator

Este hito publica autenticación y el chat. Juego, ranking y paneles siguen en Node y no se deben publicar todavía como funcionales.

1. En tu equipo ejecuta `npm run build` dentro de `frontend-astro`.
2. En tu equipo ejecuta `composer install --no-dev --optimize-autoloader` dentro de `backend-laravel`. En HostGator compartido no habrá Composer ni Node.
3. Sube `backend-laravel` fuera de `public_html`, por ejemplo `~/linguizate-api`.
4. Copia el contenido de `backend-laravel/public` a `public_html` del subdominio `linguizate.jmenachop.com`.
5. Copia los archivos de `frontend-astro/dist` al mismo `public_html`. Conserva `index.php` y `.htaccess` de Laravel.
6. Haz que los archivos estáticos de Astro se sirvan directamente. Las rutas `/api/*` y `/sanctum/*` deben llegar a `index.php` de Laravel por el `.htaccess` de `public`.
7. En `~/linguizate-api/.env` configura base MySQL, `APP_URL`, `FRONTEND_URL`, Titan SMTP, Google OAuth y Groq. Nunca subas ese archivo a Git.
8. Desde cPanel ejecuta las migraciones con la herramienta disponible. Si tu plan no expone Terminal/SSH, importa el esquema desde una migración o pide a soporte acceso puntual; no uses una base de datos de producción sin crear las tablas de Laravel.
9. Apunta `public/index.php` a `~/linguizate-api/vendor/autoload.php` y `~/linguizate-api/bootstrap/app.php` si Laravel vive fuera de `public_html`.
10. Activa HTTPS y pon `SESSION_SECURE_COOKIE=true`.

Variables de producción mínimas:

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

Después de cambiar `.env`, limpia las cachés de Laravel. Verifica primero registro normal, verificación, recuperación, Google y una respuesta del chat en producción.
