# Frontend Astro de Lingüízate

Frontend estático para autenticación, verificación de correo y chatbot. Laravel mantiene sesiones, OAuth, correo y acceso a Groq.

## Desarrollo

Desde `backend-laravel`:

```powershell
php artisan serve
npm install --prefix frontend
npm run frontend:dev
```

La compilación local requiere Node.js `22.19.0` o superior. HostGator no necesita Node.js.

Abre `http://localhost:4321`. Astro envía `/api` y `/sanctum` a Laravel en `http://localhost:8000`. Usa `localhost`, no mezcles ese host con `127.0.0.1` durante una sesión.

Google debe usar este callback local exacto:

```text
http://localhost:8000/api/auth/google/callback
```

## Build unificado

```powershell
npm run frontend:release
```

El primer comando genera `frontend/dist`. El segundo copia esos archivos a `public/`, elimina archivos obsoletos del build anterior y nunca sobrescribe `public/index.php` ni `public/.htaccess`.

Sube Laravel a cPanel después de publicar el frontend. Node.js no se necesita en HostGator.

## Producción

Variables esenciales:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://linguizate.jmenachop.com
FRONTEND_URL=https://linguizate.jmenachop.com
SESSION_DOMAIN=linguizate.jmenachop.com
SESSION_SECURE_COOKIE=true
SANCTUM_STATEFUL_DOMAINS=linguizate.jmenachop.com
GOOGLE_REDIRECT_URI=https://linguizate.jmenachop.com/api/auth/google/callback
```

Configura la misma URL exacta en Google Cloud. Conserva `GROQ_API_KEY`, credenciales SMTP y `GOOGLE_CLIENT_SECRET` solo en el `.env` de Laravel.

Ejecuta después del despliegue:

```text
php artisan migrate --force
php artisan optimize
```
