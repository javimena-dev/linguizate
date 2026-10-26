const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'linguizate.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function hashSecret(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(value), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifySecret(value, stored) {
  if (!stored) return false;
  if (!stored.startsWith('scrypt$')) return stored === value;
  const [, salt, expected] = stored.split('$');
  const actual = crypto.scryptSync(String(value), salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

function addColumnIfMissing(table, definition) {
  const name = definition.trim().split(/\s+/)[0];
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((column) => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'estudiante',
      score INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      achievements TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  addColumnIfMissing('users', 'username TEXT');
  addColumnIfMissing('users', "gender TEXT NOT NULL DEFAULT 'neutro'");
  addColumnIfMissing('users', 'avatar TEXT');
  addColumnIfMissing('users', 'security_phrase TEXT');
  addColumnIfMissing('users', 'updated_at TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'fas fa-book',
      kind TEXT NOT NULL DEFAULT 'system' CHECK(kind IN ('system','professor')),
      is_private INTEGER NOT NULL DEFAULT 0,
      approved INTEGER NOT NULL DEFAULT 1,
      access_code TEXT UNIQUE,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS subcategories (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'fas fa-book-open',
      display_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      subcategory_id TEXT NOT NULL REFERENCES subcategories(id) ON DELETE CASCADE,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_index INTEGER NOT NULL CHECK(correct_index BETWEEN 0 AND 3),
      difficulty TEXT NOT NULL CHECK(difficulty IN ('facil','medio','dificil')),
      explanation TEXT NOT NULL DEFAULT '',
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_game_id TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      subcategory_id TEXT REFERENCES subcategories(id) ON DELETE SET NULL,
      category_name TEXT NOT NULL,
      subcategory_name TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('clasico','estudio')),
      score INTEGER NOT NULL,
      correct_answers INTEGER NOT NULL,
      incorrect_answers INTEGER NOT NULL,
      avg_response_seconds REAL NOT NULL DEFAULT 0,
      played_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS question_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
      is_correct INTEGER NOT NULL,
      response_time_seconds REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS user_achievements (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement TEXT NOT NULL,
      unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(user_id, achievement)
    );
    CREATE TABLE IF NOT EXISTS data_imports (
      checksum TEXT PRIMARY KEY,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      summary TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_questions_subcategory ON questions(subcategory_id);
    CREATE INDEX IF NOT EXISTS idx_games_user ON games(user_id, played_at DESC);
    CREATE INDEX IF NOT EXISTS idx_categories_owner ON categories(owner_user_id);
  `);

  seedUsers();
  seedCatalog();
  migrateLegacyPasswords();
  db.prepare("UPDATE users SET username='admin' WHERE role='admin' AND (username IS NULL OR username='')").run();
}

function readSeed(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'seeds', name), 'utf8'));
}

function seedUsers() {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n) return;
  const raw = readSeed('users.json');
  const users = raw.users || raw;
  const insert = db.prepare(`INSERT INTO users
    (id,email,username,password,name,role,score,games_played,achievements,gender,created_at)
    VALUES (@id,@email,@username,@password,@name,@role,@score,@gamesPlayed,@achievements,@gender,@createdAt)`);
  for (const user of users) {
    const role = user.isAdmin ? 'admin' : (user.email.includes('profesor') ? 'profesor' : 'estudiante');
    insert.run({
      id: user.id, email: user.email.toLowerCase(), username: role === 'admin' ? 'admin' : null,
      password: hashSecret(user.password), name: user.name, role, score: user.score || 0,
      gamesPlayed: user.gamesPlayed || 0, achievements: JSON.stringify(user.achievements || []),
      gender: user.gender || 'neutro', createdAt: user.createdAt || new Date().toISOString()
    });
  }
}

function seedCatalog() {
  if (db.prepare('SELECT COUNT(*) n FROM categories').get().n) return;
  const categories = readSeed('categories.json').categories;
  const questionGroups = readSeed('questions.json').questions;
  const insertCategory = db.prepare(`INSERT INTO categories
    (id,name,description,icon,kind,is_private,approved,display_order) VALUES (?,?,?,?, 'system',0,1,?)`);
  const insertSubcategory = db.prepare(`INSERT INTO subcategories
    (id,category_id,name,description,icon,display_order) VALUES (?,?,?,?,?,?)`);
  const insertQuestion = db.prepare(`INSERT INTO questions
    (id,subcategory_id,question,options,correct_index,difficulty,explanation,display_order)
    VALUES (?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    categories.forEach((category, categoryIndex) => {
      insertCategory.run(category.id, category.name, category.description || '', category.icon || 'fas fa-book', categoryIndex);
      (category.subcategories || []).forEach((subcategory, subcategoryIndex) => {
        insertSubcategory.run(subcategory.id, category.id, subcategory.name, subcategory.description || '', subcategory.icon || 'fas fa-book-open', subcategoryIndex);
        (questionGroups[subcategory.id] || []).forEach((question, questionIndex) => {
          const questionId = `${subcategory.id}:${question.id}`;
          insertQuestion.run(questionId, subcategory.id, question.question, JSON.stringify(question.options), question.correct, question.difficulty, question.explanation || '', questionIndex);
        });
      });
    });
  })();
}

function migrateLegacyPasswords() {
  const rows = db.prepare('SELECT id,password FROM users').all();
  const update = db.prepare('UPDATE users SET password=? WHERE id=?');
  db.transaction(() => rows.forEach((row) => {
    if (!row.password.startsWith('scrypt$')) update.run(hashSecret(row.password), row.id);
  }))();
}

function mapUser(row, includePrivate = false) {
  if (!row) return null;
  const user = {
    id: row.id, email: row.email, name: row.name, role: row.role,
    isAdmin: row.role === 'admin', isProfesor: row.role === 'profesor',
    isEstudiante: row.role === 'estudiante', gender: row.gender || 'neutro', avatar: row.avatar || null,
    score: row.score || 0, gamesPlayed: row.games_played || 0,
    achievements: JSON.parse(row.achievements || '[]'), createdAt: row.created_at
  };
  if (includePrivate) {
    user.passwordHash = row.password;
    user.securityPhraseHash = row.security_phrase;
  }
  return user;
}

function getUserByIdentifier(identifier, includePrivate = false) {
  const normalized = String(identifier || '').trim().toLowerCase();
  return mapUser(db.prepare('SELECT * FROM users WHERE lower(email)=? OR lower(username)=?').get(normalized, normalized), includePrivate);
}

function getUserById(id) { return mapUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)); }

function createUser({ email, password, name, role, gender, securityPhrase }) {
  const now = new Date().toISOString();
  const result = db.prepare(`INSERT INTO users
    (email,password,name,role,gender,security_phrase,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(email.toLowerCase(), hashSecret(password), name, role, gender || 'otro', securityPhrase ? hashSecret(securityPhrase) : null, now, now);
  return getUserById(result.lastInsertRowid);
}

function getCatalog() {
  const categories = db.prepare("SELECT * FROM categories WHERE kind='system' ORDER BY display_order,id").all();
  const subcategories = db.prepare('SELECT * FROM subcategories ORDER BY display_order,id').all();
  const counts = new Map(db.prepare('SELECT subcategory_id,COUNT(*) count FROM questions GROUP BY subcategory_id').all().map((r) => [r.subcategory_id, r.count]));
  return categories.map((category) => ({
    id: category.id, name: category.name, description: category.description, icon: category.icon,
    subcategories: subcategories.filter((sub) => sub.category_id === category.id).map((sub) => ({
      id: sub.id, name: sub.name, description: sub.description, icon: sub.icon, questionCount: counts.get(sub.id) || 0
    }))
  }));
}

function mapQuestion(row) {
  return row && { id: row.id, question: row.question, options: JSON.parse(row.options), correct: row.correct_index, difficulty: row.difficulty, explanation: row.explanation };
}

function getQuestions(subcategoryId) {
  return db.prepare('SELECT * FROM questions WHERE subcategory_id=? ORDER BY display_order,id').all(subcategoryId).map(mapQuestion);
}

initDb();

module.exports = { db, hashSecret, verifySecret, getUserByIdentifier, getUserById, createUser, getCatalog, getQuestions, mapUser, mapQuestion };
