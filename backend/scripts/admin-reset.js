#!/usr/bin/env node
/**
 * Restablece la contrasena del administrador local de forma segura.
 * Solo actua sobre linguizate.db local. NUNCA se usa en produccion.
 *
 * Uso: npm run admin:reset
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

function hashSecret(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(value), salt, 64).toString('hex');
  return ['scrypt', salt, hash].join('$');
}

let Database;
try {
  Database = require('better-sqlite3');
} catch {
  console.error('Error: better-sqlite3 no esta instalado. Ejecuta npm install en /backend.');
  process.exit(1);
}

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'linguizate.db');
const db = new Database(dbPath);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

async function main() {
  console.log('\n Restablecer contrasena de administrador (solo DB local)\n');

  const adminRow = db.prepare("SELECT id, email FROM users WHERE role='admin' LIMIT 1").get();
  if (!adminRow) {
    console.error('No se encontro ningun usuario admin en la base de datos.');
    rl.close();
    process.exit(1);
  }

  console.log('Cuenta admin: ' + (adminRow.email || 'ID ' + adminRow.id));

  const newPassword = (await ask('   Nueva contrasena (Enter para usar "admin123"): ')).trim() || 'admin123';

  if (newPassword.length < 6) {
    console.error('La contrasena debe tener al menos 6 caracteres.');
    rl.close();
    process.exit(1);
  }

  const confirm = (await ask('   Confirma escribir la nueva contrasena [s/N]: ')).trim().toLowerCase();
  rl.close();

  if (confirm !== 's' && confirm !== 'si') {
    console.log('Operacion cancelada.');
    process.exit(0);
  }

  const hashed = hashSecret(newPassword);
  const result = db.prepare("UPDATE users SET password=?, updated_at=datetime('now') WHERE role='admin'").run(hashed);

  if (result.changes > 0) {
    console.log('\nContrasena restablecida para ' + result.changes + ' cuenta(s) admin.\n');
  } else {
    console.log('\nNo se actualizo ningun registro.\n');
  }
}

main().catch(function(err) {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
