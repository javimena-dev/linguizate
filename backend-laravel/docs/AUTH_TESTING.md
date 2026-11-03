# Prueba local del proyecto integrado

## Inicio

1. Configura `.env` con MySQL, Titan, Google y Groq.
2. En `backend-laravel`, ejecuta `php artisan migrate`.
3. Para desarrollo, ejecuta `php artisan serve`.
4. En otra terminal, ejecuta `npm run frontend:dev`.
5. Abre `http://localhost:4321`; Astro enviará `/api` y `/sanctum` a Laravel.

Para probar exactamente el paquete cPanel:

```powershell
npm run frontend:release
php artisan serve
```

Abre `http://localhost:8000`. No inicies servidor Astro en esta prueba.

## Flujos obligatorios

- Invitado juega categorías públicas sin crear partidas en MySQL.
- Registro crea solamente un estudiante sin verificar.
- Enlace de correo verifica la cuenta y vuelve al frontend.
- Login común redirige estudiante, docente y admin a su inicio.
- Google acepta solamente estudiantes.
- Recuperación cambia contraseña e invalida sesiones anteriores.
- Admin invita un docente y puede reenviar una invitación pendiente.
- Docente activa la cuenta desde `/aceptar-invitacion/`.
- Chat permite solamente estudiantes verificados y muestra respuesta progresiva.
- Logout invalida la sesión Laravel.

## Automatización

```powershell
npm test --prefix frontend
npm run build --prefix frontend
php artisan test
```

Node solo se usa para desarrollo, build y tests. Producción ejecuta PHP y sirve archivos estáticos.
