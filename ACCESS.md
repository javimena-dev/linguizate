# Cómo acceder al sistema – Lingüízate

## Ejecutar la aplicación

Lingüízate ahora se ejecuta como una aplicación cliente-servidor: Express sirve el frontend y expone la API REST; SQLite conserva usuarios, contenido y partidas.

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm start
```

Abre **http://localhost:3000**. El servidor debe permanecer activo mientras se usa la aplicación.

La variable `OPENAI_API_KEY` de `backend/.env` es opcional y solo se necesita para activar el chat con IA.

## Credenciales de demostración

| Rol | Acceso | Usuario | Contraseña |
|---|---|---|---|
| Estudiante | `/login` o botón superior | `estudiante@linguizate.com` | `estudiante123` |
| Profesor | `/login` o botón superior | `profesor@linguizate.com` | `profesor123` |
| Administrador | `/administracion` | `admin` | `admin123` |

## Rutas principales de la aplicación

- **`/`**: Inicio y selector de modalidad (Clásico con tiempo vs Estudio).
- **`/categorias`**: Catálogo de las 8 disciplinas y 28 subcategorías.
- **`/juego`**: Motor de trivia interactivo y tutor con IA.
- **`/resultados`**: Estadísticas post-juego y medallas de partida.
- **`/ranking`**: Tabla de clasificación general.
- **`/biblioteca`**: Acceso a categorías y clases privadas mediante código.
- **`/progresos`**: Historial personal de partidas, nivel XP y radar de habilidades.
- **`/profesor`**: Panel de gestión docente para crear categorías, códigos y reportes.
- **`/administracion`**: Panel administrativo de moderación, preguntas y usuarios.

## Formas de acceso

### Invitado

Puede jugar libremente cualquiera de las categorías (`/categorias`) y consultar el ranking (`/ranking`). La partida se ejecuta localmente sin asociarse a un usuario registrado.

### Estudiante

Inicia sesión desde `/login`. Conserva en el servidor su puntuación, historial de partidas, nivel XP y radar de habilidades (`/progresos`). También puede unirse a categorías privadas introduciendo el código de 6 caracteres entregado por su docente (`/biblioteca`).

### Profesor

Inicia sesión desde `/login`. Accede a su panel docente en `/profesor` para crear categorías privadas, gestionar preguntas, generar códigos de acceso para sus clases e importar cuestionarios masivos desde Excel (`.xlsx`).

### Administrador

Accede desde **http://localhost:3000/administracion**. Puede consultar métricas globales, auditar usuarios y su historial de juego, mantener el banco maestro de preguntas y moderar categorías creadas por profesores.

## Chat con IA

Después de responder se puede abrir el chat contextual. El frontend llama a `POST /api/chat`; la clave del proveedor nunca se expone al navegador. Sin `OPENAI_API_KEY`, el resto de la aplicación continúa funcionando y el chat informa que no está configurado.

## Datos anteriores

Los nuevos datos se guardan en `backend/linguizate.db`. Si existe un respaldo JSON exportado por la versión basada en `localStorage`, se puede importar una vez con:

```powershell
cd backend
npm run import:local -- "C:\\ruta\\respaldo-linguizate.json"
```

El importador crea una copia de seguridad previa de la base, fusiona el contenido y evita importar dos veces el mismo archivo.
