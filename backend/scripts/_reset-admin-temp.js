// Script de uso unico para restablecer la contrasena admin a admin123
'use strict';
const path = require('path');
const crypto = require('crypto');
function hashSecret(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(value), salt, 64).toString('hex');
  return ['scrypt', salt, hash].join('$');
}
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'linguizate.db'));
const admin = db.prepare("SELECT id, email FROM users WHERE role='admin' LIMIT 1").get();
console.log('Admin encontrado:', admin);
const result = db.prepare("UPDATE users SET password=?, updated_at=datetime('now') WHERE role='admin'").run(hashSecret('admin123'));
console.log('Filas actualizadas:', result.changes);
