# Google OAuth 2.0

No subas el ID ni el secreto del cliente a Git. Van solamente en el archivo `.env` del servidor.

1. Entra a [Google Cloud Console](https://console.cloud.google.com/), crea o selecciona el proyecto **Lingüízate**.
2. En **Google Auth Platform**, completa Branding. Tipo de audiencia: **Externa**. Agrega `administrador@jmenachop.com` como correo de soporte y desarrollador.
3. En **Data Access**, agrega únicamente `openid`, `email` y `profile`.
4. En **Clients**, crea un cliente OAuth de tipo **Web application**.
5. Durante desarrollo registra:
   - Origen JavaScript: `http://localhost:8000`
   - URI de redirección: `http://localhost:8000/api/auth/google/callback`
6. En producción registra:
   - Origen JavaScript: `https://linguizate.jmenachop.com`
   - URI de redirección: `https://linguizate.jmenachop.com/api/auth/google/callback`
7. Copia el Client ID y Client Secret en `.env`:

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://linguizate.jmenachop.com/api/auth/google/callback
```

El botón de Google abre `/api/auth/google/redirect`. El callback crea o conecta una cuenta de estudiante, verifica su correo de Google y vuelve a `/chat`.

Antes de publicar, agrega usuarios de prueba mientras la app OAuth permanezca en modo Testing. Después publica la pantalla de consentimiento para admitir estudiantes fuera de esa lista.
