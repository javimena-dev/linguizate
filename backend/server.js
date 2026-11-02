require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const fs = require('fs');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat-v2');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

const ASTRO_DIST = path.join(__dirname, '..', 'frontend-astro', 'dist');
const FRONTEND = fs.existsSync(ASTRO_DIST) ? ASTRO_DIST : path.join(__dirname, '..', 'frontend');

const devOrigin = process.env.FRONTEND_ORIGIN || ['http://localhost:4321', 'http://127.0.0.1:4321', 'http://localhost:3000'];
app.use(cors({ origin: devOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// API
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api', apiRoutes);

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Lingüízate API' });
});

// Acceso de administración (SPA / Astro)
app.get('/administracion', (req, res) => {
  res.set('X-Robots-Tag', 'noindex');
  const astroAdmin = path.join(FRONTEND, 'administracion', 'index.html');
  if (fs.existsSync(astroAdmin)) return res.sendFile(astroAdmin);
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

// Frontend estático (index, CSS, JS, JSON)
app.use(express.static(FRONTEND));

// SPA / Rutas Astro
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No existe' });
  const directPath = path.join(FRONTEND, req.path.replace(/^\//, ''), 'index.html');
  if (fs.existsSync(directPath)) return res.sendFile(directPath);
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`\n  Lingüízate backend: http://localhost:${port}`);
    console.log(`  API: http://localhost:${port}/api/health`);
    console.log(`  → Abre la app en el navegador en: http://localhost:${port}`);
    if (process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY?.startsWith('gsk_')) {
      console.log('  ✅ Chat con IA activo (Groq).\n');
    } else if (process.env.OPENAI_API_KEY) {
      console.log('  ✅ Chat con IA activo (OpenAI).\n');
    } else {
      console.log('  ⚠️  Ninguna clave de IA configurada: el chat no responderá.');
      console.log('  → Añade GROQ_API_KEY o OPENAI_API_KEY en backend/.env\n');
    }
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`  El puerto ${port} ya está en uso. Detén el proceso anterior y vuelve a iniciar el backend.`);
      process.exitCode = 1;
    } else {
      throw err;
    }
  });
  return server;
}

if (require.main === module) startServer(PORT);

module.exports = { app, startServer };
