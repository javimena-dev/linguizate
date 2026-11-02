# Prueba local de autenticación y chat

1. Copia `.env.example` a `.env`, configura una base de datos local, Google OAuth y Groq.
2. Ejecuta `php artisan key:generate`, `php artisan migrate` y `php artisan serve` dentro de `backend-laravel`.
3. Ejecuta `npm run dev` dentro de `frontend-astro`.
4. Registra un estudiante con correo y contraseña. Debe llegar el correo de verificación y `/chat` debe permanecer bloqueado antes de verificar.
5. Abre el enlace de verificación. Debe volver a `/chat`.
6. Cierra sesión e inicia con correo/contraseña.
7. Prueba **Continuar con Google**. Debe crear una cuenta o conectar una cuenta existente del mismo correo y abrir `/chat` sin verificación adicional.
8. Prueba **Olvidé mi contraseña**. El enlace debe abrir la pantalla de nueva contraseña. Después inicia con la nueva clave.
9. En `/chat`, envía una pregunta de lingüística. La respuesta debe aparecer por partes. Si Groq no responde en 25 segundos, el mensaje debe pedir reintentar y no consumir la pregunta diaria.

No se requiere Node en HostGator: Astro se compila localmente y el directorio generado se publica junto con Laravel. El juego, ranking y paneles se migrarán en el siguiente hito.
