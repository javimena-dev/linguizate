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
| Estudiante | Iniciar sesión | `estudiante@linguizate.com` | `estudiante123` |
| Profesor | Iniciar sesión | `profesor@linguizate.com` | `profesor123` |
| Administrador | Botón Administrador | `admin` | `admin123` |

## Formas de acceso

### Invitado

Puede jugar y consultar el ranking. La partida no se asocia a un perfil.

### Estudiante

Puede jugar, consultar el ranking y conservar en el servidor su puntuación, historial y progreso. También puede unirse a una categoría privada mediante el código entregado por un profesor.

### Profesor

Accede a su panel para crear, editar y eliminar categorías privadas y preguntas. Cada categoría genera un código de acceso para estudiantes y queda disponible inmediatamente para su propietario.

### Administrador

Accede desde el botón **Administrador**. Puede consultar métricas y usuarios, mantener las preguntas del sistema y aprobar, rechazar o eliminar categorías de profesores.

## Chat con IA

Después de responder se puede abrir el chat contextual. El frontend llama a `POST /api/chat`; la clave del proveedor nunca se expone al navegador. Sin `OPENAI_API_KEY`, el resto de la aplicación continúa funcionando y el chat informa que no está configurado.

## Datos anteriores

Los nuevos datos se guardan en `backend/linguizate.db`. Si existe un respaldo JSON exportado por la versión basada en `localStorage`, se puede importar una vez con:

```powershell
cd backend
npm run import:local -- "C:\\ruta\\respaldo-linguizate.json"
```

El importador crea una copia de seguridad previa de la base, fusiona el contenido y evita importar dos veces el mismo archivo.
