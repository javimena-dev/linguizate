# Contexto técnico – Lingüízate

## Objetivo

Lingüízate es una aplicación web de trivia sobre lingüística. Incluye preguntas de opción múltiple por categorías, explicaciones, chat contextual con IA, ranking y los roles estudiante, profesor y administrador.

## Arquitectura actual

- `frontend/`: HTML5, CSS3 y JavaScript sin framework. Conserva las pantallas y la experiencia original.
- `backend/`: Express, API REST, autenticación JWT en cookie HttpOnly y SQLite.
- `backend/seeds/`: archivos JSON históricos usados únicamente para inicializar una base vacía.
- `backend/linguizate.db`: fuente de verdad para usuarios, catálogo, preguntas, clases privadas, partidas, intentos y logros.

Express sirve `frontend/` y la API bajo el mismo origen. En desarrollo todo se abre desde `http://localhost:3000`, por lo que no se requiere CORS. Si el frontend se despliega aparte, se configura `FRONTEND_ORIGIN`.

## Flujos funcionales

1. Un invitado puede elegir categoría y subcategoría, jugar y consultar el ranking.
2. Un estudiante puede registrarse o iniciar sesión; sus partidas y puntos se guardan en el servidor.
3. Un estudiante puede unirse a una categoría privada mediante un código de acceso.
4. Un profesor administra sus categorías y preguntas desde su panel. Cada categoría tiene un código privado.
5. Un administrador consulta usuarios y métricas, mantiene preguntas del sistema y modera categorías de profesores.
6. Tras responder una pregunta, el usuario ve la explicación y puede abrir un chat contextual con IA.

## Datos y permisos

Las tablas principales son `users`, `categories`, `subcategories`, `questions`, `games`, `question_attempts`, `user_achievements` y `data_imports`. Los permisos se comprueban en el backend:

- estudiante: perfil, partidas y acceso por código;
- profesor: CRUD solo sobre sus categorías y preguntas;
- administrador: métricas, usuarios, contenido del sistema y moderación.

El frontend puede conservar preferencias no críticas en el navegador, pero ya no usa `localStorage` como fuente de verdad para usuarios, preguntas ni puntuaciones.

## Lógica de juego preservada

- cuatro opciones barajadas por pregunta;
- respuesta correcta referida al índice original;
- temporizador de 30 segundos;
- puntos por acierto, tiempo restante y dificultad;
- explicación posterior y chat contextual;
- registro idempotente de partidas mediante `clientGameId` para evitar duplicados.

El backend vuelve a calcular el resultado recibido antes de actualizar la puntuación del usuario.

## Ejecución y pruebas

```powershell
cd backend
npm install
npm start
```

```powershell
cd backend
npm test
```

Consulta `README.md` para la estructura completa, variables de entorno, migración desde la versión anterior y rutas principales de la API.
