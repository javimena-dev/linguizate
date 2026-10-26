# API de Lingüízate

Backend Node.js + Express con SQLite. Sirve el directorio `../frontend` y expone la API bajo `/api`.

## Comandos

```powershell
npm install
npm start
npm test
npm run import:local -- "C:\ruta\respaldo.json"
```

## Variables de entorno

- `PORT`: puerto HTTP, por defecto `3000`.
- `JWT_SECRET`: secreto de sesión; es obligatorio cambiarlo en producción.
- `FRONTEND_ORIGIN`: origen permitido solamente cuando el frontend se ejecuta separado durante desarrollo.
- `DB_PATH`: ruta alternativa de SQLite, utilizada principalmente por pruebas.
- `GROQ_API_KEY` / `GROQ_MODEL`: proveedor preferido para el chat.
- `OPENAI_API_KEY` / `OPENAI_MODEL`: proveedor alternativo.

La sesión se guarda en una cookie `HttpOnly`, `SameSite=Lax`; en producción también usa `Secure`.

## API principal

- Sesión: `/api/auth/login`, `/api/auth/register`, `/api/auth/session`, `/api/auth/password-reset`.
- Catálogo: `/api/catalog`, `/api/subcategories/:id/questions`.
- Juego: `/api/games`, `/api/ranking`, `/api/users/me/games`.
- Clase privada: `/api/classes/join`.
- Profesor: `/api/professor/categories`, preguntas y estadísticas.
- Administrador: `/api/admin/users`, categorías y preguntas.
- IA: `/api/chat`.

Los endpoints de escritura verifican sesión, rol y propiedad del recurso. `clientGameId` hace idempotente el registro de una partida.
