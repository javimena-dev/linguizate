# Lingüízate

Aplicación web de trivia lingüística con roles de estudiante, profesor y administrador.

## Arquitectura

El proyecto está separado en capas modernas:

- `frontend-astro/`: Frontend moderno desarrollado en **Astro 5** con enrutamiento por archivos, View Transitions para persistencia de audio de fondo y estado reactivo con Nano Stores.
- `backend/`: API Express, autenticación JWT en cookies HttpOnly, persistencia en SQLite, chat contextual con IA, migraciones y pruebas.
- `frontend/`: Versión frontend legacy para compatibilidad retroactiva.

Express sirve el frontend compilado (`frontend-astro/dist/` o `frontend/`) y la API desde el mismo origen. SQLite es la fuente de verdad para usuarios, preguntas, categorías, partidas, ranking y estadísticas.

## Ejecución

Requiere Node.js 18 o superior.

### Modo Producción (Servidor Único)

```powershell
# 1. Compilar frontend Astro
cd frontend-astro
npm install --legacy-peer-deps
npm run build

# 2. Iniciar backend Express
cd ../backend
npm install
npm start
```

Abre [http://localhost:3000](http://localhost:3000). El panel de administración está en [http://localhost:3000/administracion](http://localhost:3000/administracion).

### Modo Desarrollo (con Hot Reloading en Astro)

En dos terminales independientes:
```powershell
# Terminal 1 - Backend API (http://localhost:3000)
cd backend
npm start

# Terminal 2 - Frontend Astro con HMR (http://localhost:4321)
cd frontend-astro
npm run dev
```

Abre [http://localhost:4321](http://localhost:4321). Las llamadas a `/api/*` se redirigen automáticamente al backend. Para más detalles, consulta [MIGRACION-ASTRO.md](MIGRACION-ASTRO.md).

## Cuentas iniciales

| Rol | Identificador | Contraseña |
|---|---|---|
| Administrador | `admin` (en `/administracion`) | `admin123` |
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
