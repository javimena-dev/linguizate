const express = require('express');
const { db, getUserByIdentifier, createUser, verifySecret, hashSecret, mapUser } = require('../db');
const { signToken, requireAuth, sessionCookie, clearSessionCookie } = require('../middleware/auth');

const router = express.Router();
const attempts = new Map();

function limited(key) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
  attempts.set(key, recent);
  return recent.length >= 8;
}
function recordFailure(key) {
  const recent = attempts.get(key) || [];
  recent.push(Date.now());
  attempts.set(key, recent);
}
function openSession(res, user, status = 200) {
  res.setHeader('Set-Cookie', sessionCookie(signToken(user)));
  return res.status(status).json({ user });
}

router.post('/login', (req, res) => {
  const identifier = String(req.body.identifier || req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const key = `${req.ip}:${identifier}`;
  if (limited(key)) return res.status(429).json({ error: 'Demasiados intentos. Intenta más tarde.', code: 'RATE_LIMITED' });
  const privateUser = getUserByIdentifier(identifier, true);
  if (!privateUser || !verifySecret(password, privateUser.passwordHash)) {
    recordFailure(key);
    return res.status(401).json({ error: 'Credenciales incorrectas', code: 'INVALID_CREDENTIALS' });
  }
  if (req.body.role && req.body.role !== privateUser.role) {
    return res.status(403).json({ error: 'El tipo de usuario no coincide con la cuenta', code: 'ROLE_MISMATCH' });
  }
  attempts.delete(key);
  delete privateUser.passwordHash;
  delete privateUser.securityPhraseHash;
  return openSession(res, privateUser);
});

router.post('/register', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim() || email.split('@')[0];
  const role = req.body.role === 'profesor' ? 'profesor' : 'estudiante';
  const securityPhrase = String(req.body.securityPhrase || '').trim();
  if (!email || !email.includes('@') || !password || !securityPhrase) {
    return res.status(400).json({ error: 'Correo, contraseña y frase de seguridad son obligatorios', code: 'VALIDATION_ERROR' });
  }
  if (getUserByIdentifier(email)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo', code: 'EMAIL_EXISTS' });
  try {
    return openSession(res, createUser({ email, password, name, role, gender: req.body.gender, securityPhrase }), 201);
  } catch (error) {
    return res.status(400).json({ error: error.message, code: 'REGISTER_FAILED' });
  }
});

router.get('/session', requireAuth, (req, res) => res.json({ user: req.user }));
router.delete('/session', (_req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.status(204).end();
});

router.post('/password-reset', (req, res) => {
  const identifier = String(req.body.email || '').trim().toLowerCase();
  const key = `reset:${req.ip}:${identifier}`;
  if (limited(key)) return res.status(429).json({ error: 'Demasiados intentos. Intenta más tarde.', code: 'RATE_LIMITED' });
  const user = getUserByIdentifier(identifier, true);
  if (!user || user.role === 'admin' || !user.securityPhraseHash || !verifySecret(String(req.body.securityPhrase || ''), user.securityPhraseHash)) {
    recordFailure(key);
    return res.status(401).json({ error: 'El correo o la frase no coinciden', code: 'INVALID_RECOVERY' });
  }
  const newPassword = String(req.body.newPassword || '');
  if (!newPassword) return res.status(400).json({ error: 'La nueva contraseña es obligatoria', code: 'VALIDATION_ERROR' });
  db.prepare('UPDATE users SET password=?,updated_at=? WHERE id=?').run(hashSecret(newPassword), new Date().toISOString(), user.id);
  attempts.delete(key);
  return openSession(res, mapUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)));
});

module.exports = router;
