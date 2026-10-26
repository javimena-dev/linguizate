# Lingüízate

Aplicación web de trivia lingüística con roles de estudiante, profesor y administrador.

## Arquitectura

El proyecto está separado en dos capas:

- `frontend/`: HTML, CSS, JavaScript, imágenes, avatares y sonidos. No contiene credenciales ni archivos de datos.
- `backend/`: API Express, autenticación, SQLite, chat con IA, migraciones, semillas y pruebas.

Express sirve el frontend y la API desde el mismo origen. SQLite es la fuente de verdad para usuarios, preguntas, categorías, partidas, ranking y estadísticas. El navegador conserva únicamente preferencias visuales y una cola temporal de partidas pendientes.

## Ejecutar

Requiere Node.js 18 o superior.

```powershell
cd backend
npm install
npm start
```

Abre [http://localhost:3000](http://localhost:3000). No abras `frontend/index.html` directamente ni uses un servidor estático independiente, porque la aplicación necesita la API.

Para configurar el chat, copia `backend/.env.example` como `backend/.env` y añade `GROQ_API_KEY` u `OPENAI_API_KEY`.

## Cuentas iniciales

| Rol | Identificador | Contraseña |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Profesor | `profesor@linguizate.com` | `profesor123` |
| Estudiante | `estudiante@linguizate.com` | `estudiante123` |

Las contraseñas se convierten a hashes scrypt al inicializar la base.

## Pruebas

```powershell
cd backend
npm test
```

La prueba integrada cubre catálogo, autenticación, roles, creación de una clase privada, acceso mediante código, registro de una partida e idempotencia.

## Migrar datos de la versión local

Desde la versión anterior, exporta los datos con la opción de respaldo JSON. Después ejecuta:

```powershell
cd backend
npm run import:local -- "C:\ruta\linguizate_backup.json"
```

El importador valida el formato, crea una copia de SQLite antes de modificarla y registra el checksum para impedir una importación duplicada.

## Estructura

```text
frontend/
  index.html
  api.js
  script.js
  styles.css
  assets/
  avatars/
backend/
  middleware/
  routes/
  scripts/
  seeds/
  tests/
  db.js
  server.js
```
