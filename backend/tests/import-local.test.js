const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

test('importa un respaldo local una sola vez', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linguizate-import-'));
  const dbPath = path.join(tempDir, 'import.db');
  const backupPath = path.join(tempDir, 'backup.json');
  const scriptPath = path.join(__dirname, '..', 'scripts', 'import-local.js');

  const payload = {
    users: [{
      email: 'profesor.importado@example.com',
      password: 'clave-segura',
      name: 'Profesor Importado',
      isProfesor: true,
      score: 25,
      gamesPlayed: 1,
      achievements: [],
      personalCategories: [{
        id: 'cat_importada',
        name: 'Categoría importada',
        description: 'Contenido anterior',
        accessCode: 'IMP123',
        approved: true,
        questions: [{
          id: 'pregunta_importada',
          question: '¿Qué se está comprobando?',
          options: ['La importación', 'El diseño', 'El tema', 'El sonido'],
          correct: 0,
          difficulty: 'facil',
          explanation: 'La importación controlada.'
        }]
      }],
      gameHistory: [{
        date: '2026-01-01T00:00:00.000Z',
        categoryName: 'Lingüística General',
        subcategoryName: 'Introducción a la Lingüística',
        score: 25,
        correctAnswers: 1,
        incorrectAnswers: 0,
        avgResponseTimeSeconds: 5
      }]
    }],
    categories: [],
    questions: {}
  };

  fs.writeFileSync(backupPath, JSON.stringify(payload), 'utf8');

  try {
    const env = { ...process.env, DB_PATH: dbPath };
    const first = spawnSync(process.execPath, [scriptPath, backupPath], { env, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr || first.stdout);
    assert.match(first.stdout, /Importación completada/);

    const second = spawnSync(process.execPath, [scriptPath, backupPath], { env, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /ya fue importado/);

    const db = new Database(dbPath, { readonly: true });
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM users WHERE email='profesor.importado@example.com'").get().total, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM categories WHERE id='cat_importada'").get().total, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM questions WHERE id='pregunta_importada'").get().total, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM games WHERE client_game_id LIKE 'legacy-%'").get().total, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM data_imports').get().total, 1);
    db.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
