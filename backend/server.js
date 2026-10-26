require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND = path.join(__dirname, '..', 'frontend');

const devOrigin = process.env.FRONTEND_ORIGIN;
if (devOrigin) app.use(cors({ origin: devOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// API
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api', apiRoutes);

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Lingüízate API' });
});

// Frontend estático (index, CSS, JS, JSON)
app.use(express.static(FRONTEND));

// SPA: cualquier ruta no API sirve index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No encontrado' });
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`\n  Lingüízate backend: http://localhost:${port}`);
    console.log(`  API: http://localhost:${port}/api/health`);
    console.log(`  → Abre la app en el navegador en: http://localhost:${port}`);
    if (process.env.GROQ_API_KEY) {
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
      console.warn(`  Puerto ${port} en uso. Probando ${port + 1}...`);
      startServer(port + 1);
    } else {
      throw err;
    }
  });
  return server;
}

if (require.main === module) startServer(PORT);

module.exports = { app, startServer };
