const express = require('express');
const OpenAI = require('openai');

const router = express.Router();
const requestTimes = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (requestTimes.get(ip) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 12) return true;
  recent.push(now);
  requestTimes.set(ip, recent);
  return false;
}

// Groq usa API compatible con OpenAI; prioridad: Groq si está la clave, si no OpenAI
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const useGroq = Boolean(GROQ_API_KEY);

const openai = useGroq
  ? new OpenAI({ apiKey: GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })
  : OPENAI_API_KEY
    ? new OpenAI({ apiKey: OPENAI_API_KEY })
    : null;

// POST /api/chat
router.post('/', async (req, res) => {
  try {
    if (isRateLimited(req.ip)) {
      return res.status(429).json({ error: 'Demasiadas solicitudes', reply: 'Espera un momento antes de volver a preguntar.' });
    }
    const { question, explanation, userMessage, history = [] } = req.body || {};
    if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
      return res.status(400).json({ error: 'Falta userMessage' });
    }
    if (userMessage.length > 2000 || String(question || '').length > 4000 || String(explanation || '').length > 6000) {
      return res.status(413).json({ error: 'El mensaje o el contexto es demasiado largo' });
    }

    if (!openai) {
      return res.status(503).json({
        error: 'Chat con IA no configurado',
        reply: 'Configura GROQ_API_KEY o OPENAI_API_KEY en el archivo .env del servidor para activar el chat con IA.'
      });
    }

    const systemContent = [
      'Eres un asistente experto en lingüística. Respondes en español, de forma clara y didáctica.',
      'El usuario está jugando una trivia lingüística. Contexto de la pregunta actual:',
      question ? `Pregunta: ${question}` : '',
      explanation ? `Explicación dada: ${explanation}` : ''
    ].filter(Boolean).join('\n');

    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-8).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 2000)
      })),
      { role: 'user', content: userMessage.trim() }
    ];

    const defaultModel = useGroq
      ? (process.env.GROQ_MODEL || 'openai/gpt-oss-120b')
      : (process.env.OPENAI_MODEL || 'gpt-4o-mini');
    const completion = await openai.chat.completions.create({
      model: defaultModel,
      messages,
      max_tokens: 500,
      temperature: 0.7
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || 'No pude generar una respuesta.';
    res.json({ reply });
  } catch (e) {
    console.error('Error en /api/chat:', e.message || e);
    const status = e.status === 401 ? 401 : e.status === 429 ? 429 : 500;
    res.status(status).json({
      error: 'Error al conectar con la IA',
      reply: e.message || (useGroq ? 'Comprueba GROQ_API_KEY y tu cuota.' : 'Comprueba OPENAI_API_KEY y tu cuota de uso.')
    });
  }
});

module.exports = router;
