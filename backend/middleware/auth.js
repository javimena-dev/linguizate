const jwt = require('jsonwebtoken');
const { getUserById } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'linguizate-secret-cambiar-en-produccion';
const COOKIE_NAME = 'linguizate_session';

function signToken(user) {
  return jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((pair) => pair.length === 2));
}

function readToken(req) {
  const bearer = req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
    ? req.headers.authorization.slice(7) : null;
  return bearer || parseCookies(req.headers.cookie || '')[COOKIE_NAME] || null;
}

function optionalAuth(req, _res, next) {
  try {
    const token = readToken(req);
    if (token) {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = getUserById(payload.userId);
    }
  } catch (_error) {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión', code: 'AUTH_REQUIRED' });
    next();
  });
}

function requireRole(...roles) {
  return [requireAuth, (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'No tienes permiso para esta acción', code: 'FORBIDDEN' });
    next();
  }];
}

function sessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

module.exports = { signToken, optionalAuth, requireAuth, requireRole, sessionCookie, clearSessionCookie };
