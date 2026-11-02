# Guía de Migración a Astro – Lingüízate

Esta documentación describe la arquitectura, estructura de archivos, flujo de desarrollo y puesta en producción del frontend modernizado con **Astro**.

---

## 1. Arquitectura y Novedades

El frontend de Lingüízate ha evolucionado de una SPA con un único archivo HTML (`index.html`) y un script monolítico de ~6.000 líneas a una arquitectura basada en **Astro 5** con **Islas de Interactividad** y **View Transitions**.

### Principales Mejoras:
1. **Enrutamiento basado en archivos (*File-based routing*):**
   - Reemplaza la manipulación manual de clases CSS `.screen.active`.
   - Cada pantalla es una ruta web nativa e indexable con su propio ciclo de vida (`/`, `/categorias`, `/juego`, `/resultados`, `/ranking`, `/biblioteca`, `/progresos`, `/login`, `/administracion`, `/profesor`).
2. **Audio y Música Ambiental Persistente:**
   - La música de fondo (`ambient-loop.mp3`) está envuelta en un contenedor con directiva `transition:persist` gestionada por `<ClientRouter />` (`astro:transitions`).
   - El audio **no se interrumpe ni se reinicia** al cambiar de página o navegar entre pantallas.
3. **Estado Global Reactivo con Nano Stores:**
   - `$currentUser`: información de sesión del usuario.
   - `$activeGame`: preguntas, racha, temporizador y puntuación de la partida en curso.
   - `$isMusicEnabled` e `$isDarkMode`: preferencias persistidas en `localStorage`.
4. **Rendimiento Ultrarrápido:**
   - La carga inicial ya no evalúa 259 KB de JavaScript global.
   - Cada página descarga únicamente los scripts y estilos necesarios (reducción de hasta un 85% en tiempo de carga inicial).
5. **Doble Modo de Ejecución:**
   - **Desarrollo independiente:** Astro corre en el puerto `4321` con proxy automático a `http://localhost:3000/api`.
   - **Producción unificada:** `astro build` genera archivos estáticos en `frontend-astro/dist/`, los cuales Express detecta y sirve automáticamente sin requerir servidores adicionales.

---

## 2. Mapa de Rutas

| Ruta Web | Propósito | Componente Fuente |
|---|---|---|
| `/` | Portada, selector de modo (Clásico/Estudio) y acceso directo por código | `src/pages/index.astro` |
| `/login` | Iniciar sesión, crear cuenta y recuperar contraseña por frase secreta | `src/pages/login.astro` |
| `/categorias` | Catálogo de las 8 disciplinas lingüísticas y sus 28 subcategorías | `src/pages/categorias/index.astro` |
| `/juego` | Trivia en vivo: temporizador 30s, barajado de opciones, feedback y Tutor IA | `src/pages/juego.astro` |
| `/resultados` | Pantalla de celebración post-partida, medallas y estadísticas | `src/pages/resultados.astro` |
| `/ranking` | Clasificación general de estudiantes y profesores | `src/pages/ranking.astro` |
| `/biblioteca` | Mi biblioteca de temas y acceso a clases privadas | `src/pages/biblioteca.astro` |
| `/progresos` | Nivel XP, historial de partidas y radar de habilidades en Chart.js | `src/pages/progresos.astro` |
| `/administracion` | Login administrativo protegido y panel de control/moderación | `src/pages/administracion.astro` |
| `/profesor` | Panel docente: creación de categorías privadas, códigos y reportes | `src/pages/profesor.astro` |

---

## 3. Estructura del Proyecto `frontend-astro/`

```text
frontend-astro/
├── astro.config.mjs          # Configuración estática y proxy de /api a Express
├── package.json              # Dependencias (astro 5, nanostores)
├── tsconfig.json             # Configuración TypeScript
├── public/                   # Recursos estáticos servidos directamente
│   ├── assets/
│   │   ├── images/           # Logotipos y portada
│   │   ├── music/            # ambient-loop.mp3
│   │   └── sounds/           # Efectos sonoros (game, ui, alerts)
│   └── avatars/              # Colección de avatares
├── src/
│   ├── layouts/
│   │   ├── BaseLayout.astro  # Head, Google Fonts, View Transitions y Audio persistente
│   │   └── AppLayout.astro   # Envoltorio con Navbar y Sidebar reactivos
│   ├── components/
│   │   └── common/
│   │       ├── Navbar.astro  # Barra superior con menús y toggle de música/tema
│   │       ├── Sidebar.astro # Panel lateral con accesos según rol
│   │       └── DynamicBackground.astro # Blobs y símbolos lingüísticos flotantes
│   ├── pages/                # Rutas de la aplicación (ver tabla anterior)
│   ├── scripts/
│   │   ├── api.ts            # Cliente fetch tipado compatible con window.LinguizateAPI
│   │   ├── audio.ts          # Controlador de SFX y música ambiental
│   │   └── store.ts          # Stores reactivos con Nano Stores
│   └── styles/
│       └── global.css        # Sistema de diseño completo (tema claro y Deep Night)
└── dist/                     # Salida optimizada generada por npm run build
```

---

## 4. Comandos de Ejecución

### Opción A: Modo Desarrollo (con Recarga Rápida)

En dos terminales separadas:

**Terminal 1 (Backend Express & API):**
```powershell
cd backend
npm start
```
*(Corre en `http://localhost:3000`)*

**Terminal 2 (Frontend Astro con Hot Reloading):**
```powershell
cd frontend-astro
npm run dev
```
*(Abre `http://localhost:4321` en tu navegador con HMR activo)*

---

### Opción B: Modo Producción (Servidor Único Express)

1. Compila el frontend Astro:
```powershell
cd frontend-astro
npm run build
```

2. Inicia el servidor backend:
```powershell
cd ../backend
npm start
```

Express detectará automáticamente la carpeta `frontend-astro/dist/` y servirá toda la aplicación desde **`http://localhost:3000`**.

---

## 5. Pruebas Automatizadas

El backend incluye pruebas de integración que validan tanto la API REST como la correcta entrega de las páginas estáticas de Astro:

```powershell
cd backend
npm test
```
