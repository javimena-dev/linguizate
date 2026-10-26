const express = require('express');
const crypto = require('crypto');
const { db, getCatalog, getQuestions, mapQuestion, mapUser } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function fail(res, status, error, code) { return res.status(status).json({ error, code }); }
function id(prefix) { return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`; }
function accessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  do {
    value = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (db.prepare('SELECT 1 FROM categories WHERE access_code=?').get(value));
  return value;
}
function categoryDto(row, includeQuestions = false) {
  const sub = db.prepare('SELECT * FROM subcategories WHERE category_id=? ORDER BY display_order,id').all(row.id);
  const base = {
    id: row.id, name: row.name, description: row.description, icon: row.icon,
    isPersonal: row.kind === 'professor', private: Boolean(row.is_private), approved: Boolean(row.approved),
    accessCode: row.access_code, profesorId: row.owner_user_id,
    subcategories: sub.map((s) => ({
      id: s.id, name: s.name, description: s.description, icon: s.icon,
      questionCount: db.prepare('SELECT COUNT(*) n FROM questions WHERE subcategory_id=?').get(s.id).n,
      ...(includeQuestions ? { questions: getQuestions(s.id) } : {})
    }))
  };
  if (row.kind === 'professor') base.questions = includeQuestions && sub[0] ? getQuestions(sub[0].id) : undefined;
  return base;
}

router.get('/catalog', (_req, res) => res.json({ categories: getCatalog() }));
router.get('/subcategories/:id/questions', (req, res) => {
  const subcategory = db.prepare(`SELECT s.id,c.kind
    FROM subcategories s JOIN categories c ON c.id=s.category_id WHERE s.id=?`).get(req.params.id);
  if (!subcategory || subcategory.kind !== 'system') {
    return fail(res, 404, 'Subcategoría no encontrada', 'SUBCATEGORY_NOT_FOUND');
  }
  return res.json({ questions: getQuestions(req.params.id) });
});

router.get('/ranking', (_req, res) => {
  const users = db.prepare("SELECT * FROM users WHERE role!='admin' ORDER BY score DESC,id").all().map((row) => {
    const user = mapUser(row);
    return {
      id: user.id, name: user.name, role: user.role, isProfesor: user.isProfesor,
      isEstudiante: user.isEstudiante, avatar: user.avatar, score: user.score,
      gamesPlayed: user.gamesPlayed, achievements: user.achievements
    };
  });
  res.json({ users });
});

router.post('/classes/join', ...requireRole('estudiante'), (req, res) => {
  const code = String(req.body.accessCode || '').trim().toUpperCase();
  const category = db.prepare("SELECT * FROM categories WHERE access_code=? AND kind='professor' AND approved=1").get(code);
  if (!category) return fail(res, 404, 'Código no válido', 'INVALID_ACCESS_CODE');
  res.json({ category: categoryDto(category, true) });
});

router.get('/users/me/games', requireAuth, (req, res) => {
  const games = db.prepare('SELECT * FROM games WHERE user_id=? ORDER BY played_at DESC').all(req.user.id).map((g) => ({
    id: g.id, categoryName: g.category_name, subcategoryName: g.subcategory_name, score: g.score,
    date: g.played_at, totalQuestions: g.correct_answers + g.incorrect_answers,
    correctAnswers: g.correct_answers, incorrectAnswers: g.incorrect_answers,
    bestStreak: g.correct_answers, avgResponseTimeSeconds: g.avg_response_seconds,
    questionResults: db.prepare('SELECT question_id questionId,is_correct isCorrect,response_time_seconds responseTimeSeconds FROM question_attempts WHERE game_id=?').all(g.id)
  }));
  res.json({ games });
});

router.post('/games', requireAuth, (req, res) => {
  const body = req.body || {};
  if (!body.clientGameId || !Array.isArray(body.attempts) || body.attempts.length < 1 || body.attempts.length > 50) {
    return fail(res, 400, 'Partida incompleta', 'INVALID_GAME');
  }
  const existing = db.prepare('SELECT * FROM games WHERE client_game_id=?').get(body.clientGameId);
  if (existing) return res.json({ game: existing, user: req.user, duplicate: true });
  const mode = body.mode === 'estudio' ? 'estudio' : 'clasico';
  let score = 0;
  let correct = 0;
  let incorrect = 0;
  let totalTime = 0;
  const seenQuestions = new Set();
  const attempts = body.attempts.map((attempt) => {
    const question = db.prepare('SELECT * FROM questions WHERE id=? AND subcategory_id=?').get(attempt.questionId, body.subcategoryId);
    const responseTime = Math.max(0, Math.min(30, Number(attempt.responseTimeSeconds) || 0));
    const selectedIndex = Number(attempt.selectedOriginalIndex);
    const validSelection = Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex <= 3;
    const duplicateQuestion = seenQuestions.has(attempt.questionId);
    seenQuestions.add(attempt.questionId);
    const isCorrect = Boolean(question && validSelection && !duplicateQuestion && selectedIndex === question.correct_index);
    if (isCorrect) {
      correct += 1;
      const multiplier = question.difficulty === 'dificil' ? 2 : question.difficulty === 'medio' ? 1.5 : 1;
      const bonus = mode === 'clasico' ? Math.max(0, 30 - responseTime) * 10 : 0;
      score += Math.round((100 + bonus) * multiplier);
    } else incorrect += 1;
    totalTime += responseTime;
    return { questionId: attempt.questionId, isCorrect, responseTime };
  });
  const avg = attempts.length ? totalTime / attempts.length : 0;
  const category = db.prepare('SELECT name FROM categories WHERE id=?').get(body.categoryId);
  const subcategory = db.prepare('SELECT name FROM subcategories WHERE id=?').get(body.subcategoryId);
  const transaction = db.transaction(() => {
    const result = db.prepare(`INSERT INTO games
      (client_game_id,user_id,category_id,subcategory_id,category_name,subcategory_name,mode,score,correct_answers,incorrect_answers,avg_response_seconds,played_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        body.clientGameId, req.user.id, body.categoryId || null, body.subcategoryId || null,
        category?.name || body.categoryName || '-', subcategory?.name || body.subcategoryName || '-',
        mode, score, correct, incorrect, avg, body.playedAt || new Date().toISOString()
      );
    const insertAttempt = db.prepare('INSERT INTO question_attempts (game_id,question_id,is_correct,response_time_seconds) VALUES (?,?,?,?)');
    attempts.forEach((a) => insertAttempt.run(result.lastInsertRowid, a.questionId || null, a.isCorrect ? 1 : 0, a.responseTime));
    db.prepare('UPDATE users SET score=score+?,games_played=games_played+1,updated_at=? WHERE id=?').run(score, new Date().toISOString(), req.user.id);
    return result.lastInsertRowid;
  });
  const gameId = transaction();
  res.status(201).json({ game: db.prepare('SELECT * FROM games WHERE id=?').get(gameId), user: mapUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)) });
});

router.patch('/users/me', requireAuth, (req, res) => {
  const avatar = req.body.avatar == null ? req.user.avatar : String(req.body.avatar);
  if (avatar && avatar.length > 1_500_000) return fail(res, 413, 'La imagen es demasiado grande', 'AVATAR_TOO_LARGE');
  const name = String(req.body.name || req.user.name).trim();
  const gender = ['masculino','femenino','otro','neutro'].includes(req.body.gender) ? req.body.gender : req.user.gender;
  db.prepare('UPDATE users SET name=?,gender=?,avatar=?,updated_at=? WHERE id=?').run(name, gender, avatar, new Date().toISOString(), req.user.id);
  res.json({ user: mapUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)) });
});

router.get('/professor/categories', ...requireRole('profesor'), (req, res) => {
  const rows = db.prepare("SELECT * FROM categories WHERE owner_user_id=? AND kind='professor' ORDER BY created_at").all(req.user.id);
  res.json({ categories: rows.map((row) => categoryDto(row, true)) });
});

router.post('/professor/categories', ...requireRole('profesor'), (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return fail(res, 400, 'El nombre es obligatorio', 'VALIDATION_ERROR');
  const categoryId = id(`prof_${req.user.id}_cat`);
  const code = accessCode();
  db.transaction(() => {
    db.prepare(`INSERT INTO categories
      (id,owner_user_id,name,description,icon,kind,is_private,approved,access_code) VALUES (?,?,?,?,?,'professor',1,1,?)`)
      .run(categoryId, req.user.id, name, String(req.body.description || ''), 'fas fa-book', code);
    db.prepare('INSERT INTO subcategories (id,category_id,name,description,icon) VALUES (?,?,?,?,?)')
      .run(categoryId, categoryId, name, String(req.body.description || ''), 'fas fa-book');
  })();
  res.status(201).json({ category: categoryDto(db.prepare('SELECT * FROM categories WHERE id=?').get(categoryId), true) });
});

router.patch('/professor/categories/:id', ...requireRole('profesor'), (req, res) => {
  const category = db.prepare("SELECT * FROM categories WHERE id=? AND owner_user_id=? AND kind='professor'").get(req.params.id, req.user.id);
  if (!category) return fail(res, 404, 'Categoría no encontrada', 'NOT_FOUND');
  const name = String(req.body.name || category.name).trim();
  const description = String(req.body.description ?? category.description);
  db.transaction(() => {
    db.prepare('UPDATE categories SET name=?,description=?,updated_at=? WHERE id=?').run(name, description, new Date().toISOString(), category.id);
    db.prepare('UPDATE subcategories SET name=?,description=? WHERE category_id=?').run(name, description, category.id);
  })();
  res.json({ category: categoryDto(db.prepare('SELECT * FROM categories WHERE id=?').get(category.id), true) });
});

router.delete('/professor/categories/:id', ...requireRole('profesor'), (req, res) => {
  const result = db.prepare("DELETE FROM categories WHERE id=? AND owner_user_id=? AND kind='professor'").run(req.params.id, req.user.id);
  if (!result.changes) return fail(res, 404, 'Categoría no encontrada', 'NOT_FOUND');
  res.status(204).end();
});

function validateQuestion(body) {
  return body && String(body.question || '').trim() && Array.isArray(body.options) && body.options.length === 4
    && Number.isInteger(Number(body.correct)) && Number(body.correct) >= 0 && Number(body.correct) <= 3
    && ['facil','medio','dificil'].includes(body.difficulty);
}

router.post('/professor/categories/:id/questions', ...requireRole('profesor'), (req, res) => {
  const category = db.prepare("SELECT * FROM categories WHERE id=? AND owner_user_id=? AND kind='professor'").get(req.params.id, req.user.id);
  if (!category) return fail(res, 404, 'Categoría no encontrada', 'NOT_FOUND');
  if (!validateQuestion(req.body)) return fail(res, 400, 'Pregunta inválida', 'VALIDATION_ERROR');
  const questionId = id('prof_q');
  db.prepare(`INSERT INTO questions (id,subcategory_id,owner_user_id,question,options,correct_index,difficulty,explanation,display_order)
    VALUES (?,?,?,?,?,?,?,?,(SELECT COUNT(*) FROM questions WHERE subcategory_id=?))`)
    .run(questionId, category.id, req.user.id, req.body.question.trim(), JSON.stringify(req.body.options), Number(req.body.correct), req.body.difficulty, String(req.body.explanation || ''), category.id);
  res.status(201).json({ question: mapQuestion(db.prepare('SELECT * FROM questions WHERE id=?').get(questionId)) });
});

router.patch('/professor/questions/:id', ...requireRole('profesor'), (req, res) => {
  const question = db.prepare('SELECT * FROM questions WHERE id=? AND owner_user_id=?').get(req.params.id, req.user.id);
  if (!question) return fail(res, 404, 'Pregunta no encontrada', 'NOT_FOUND');
  if (!validateQuestion(req.body)) return fail(res, 400, 'Pregunta inválida', 'VALIDATION_ERROR');
  const targetId = req.body.categoryId || question.subcategory_id;
  const target = db.prepare("SELECT 1 FROM categories WHERE id=? AND owner_user_id=? AND kind='professor'").get(targetId, req.user.id);
  if (!target) return fail(res, 403, 'La categoría de destino no pertenece al profesor', 'FORBIDDEN');
  db.prepare('UPDATE questions SET subcategory_id=?,question=?,options=?,correct_index=?,difficulty=?,explanation=?,updated_at=? WHERE id=?')
    .run(targetId, req.body.question.trim(), JSON.stringify(req.body.options), Number(req.body.correct), req.body.difficulty, String(req.body.explanation || ''), new Date().toISOString(), question.id);
  res.json({ question: mapQuestion(db.prepare('SELECT * FROM questions WHERE id=?').get(question.id)) });
});

router.delete('/professor/questions/:id', ...requireRole('profesor'), (req, res) => {
  const result = db.prepare('DELETE FROM questions WHERE id=? AND owner_user_id=?').run(req.params.id, req.user.id);
  if (!result.changes) return fail(res, 404, 'Pregunta no encontrada', 'NOT_FOUND');
  res.status(204).end();
});

router.get('/professor/statistics', ...requireRole('profesor'), (req, res) => {
  const rows = db.prepare(`SELECT g.*,u.name student_name FROM games g
    JOIN categories c ON c.id=g.category_id LEFT JOIN users u ON u.id=g.user_id
    WHERE c.owner_user_id=? ORDER BY g.played_at DESC`).all(req.user.id);
  res.json({ statistics: rows.map((g) => ({
    studentName: g.student_name || 'Anónimo', categoryName: g.category_name, score: g.score,
    correctAnswers: g.correct_answers, incorrectAnswers: g.incorrect_answers, date: g.played_at
  })) });
});

router.get('/admin/users', ...requireRole('admin'), (_req, res) => {
  res.json({ users: db.prepare('SELECT * FROM users ORDER BY score DESC,id').all().map((row) => mapUser(row)) });
});
router.get('/admin/dashboard', ...requireRole('admin'), (_req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY score DESC,id').all().map((row) => {
    const user = mapUser(row);
    user.gameHistory = db.prepare('SELECT * FROM games WHERE user_id=? ORDER BY played_at DESC').all(user.id).map((game) => ({
      categoryName: game.category_name, subcategoryName: game.subcategory_name, score: game.score,
      date: game.played_at, totalQuestions: game.correct_answers + game.incorrect_answers,
      correctAnswers: game.correct_answers, incorrectAnswers: game.incorrect_answers,
      avgResponseTimeSeconds: game.avg_response_seconds,
      questionResults: db.prepare('SELECT question_id questionId,is_correct isCorrect,response_time_seconds responseTimeSeconds FROM question_attempts WHERE game_id=?').all(game.id)
    }));
    return user;
  });
  res.json({ users });
});
router.get('/admin/categories', ...requireRole('admin'), (_req, res) => {
  res.json({ categories: db.prepare('SELECT * FROM categories ORDER BY kind,display_order,created_at').all().map((row) => categoryDto(row, true)) });
});
router.patch('/admin/categories/:id/approval', ...requireRole('admin'), (req, res) => {
  db.prepare('UPDATE categories SET approved=?,updated_at=? WHERE id=?').run(req.body.approved ? 1 : 0, new Date().toISOString(), req.params.id);
  const row = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
  if (!row) return fail(res, 404, 'Categoría no encontrada', 'NOT_FOUND');
  res.json({ category: categoryDto(row, true) });
});
router.delete('/admin/professor-categories/:id', ...requireRole('admin'), (req, res) => {
  const result = db.prepare("DELETE FROM categories WHERE id=? AND kind='professor'").run(req.params.id);
  if (!result.changes) return fail(res, 404, 'Categoría no encontrada', 'NOT_FOUND');
  res.status(204).end();
});

router.get('/admin/questions', ...requireRole('admin'), (_req, res) => {
  const rows = db.prepare('SELECT * FROM questions ORDER BY subcategory_id,display_order,id').all();
  res.json({ questions: rows.map((row) => ({ ...mapQuestion(row), subcategoryId: row.subcategory_id })) });
});
router.post('/admin/questions', ...requireRole('admin'), (req, res) => {
  if (!validateQuestion(req.body) || !db.prepare('SELECT 1 FROM subcategories WHERE id=?').get(req.body.subcategoryId)) {
    return fail(res, 400, 'Pregunta inválida', 'VALIDATION_ERROR');
  }
  const questionId = id('q');
  db.prepare(`INSERT INTO questions (id,subcategory_id,question,options,correct_index,difficulty,explanation,display_order)
    VALUES (?,?,?,?,?,?,?,(SELECT COUNT(*) FROM questions WHERE subcategory_id=?))`)
    .run(questionId, req.body.subcategoryId, req.body.question.trim(), JSON.stringify(req.body.options), Number(req.body.correct), req.body.difficulty, String(req.body.explanation || ''), req.body.subcategoryId);
  res.status(201).json({ question: mapQuestion(db.prepare('SELECT * FROM questions WHERE id=?').get(questionId)) });
});
router.patch('/admin/questions/:id', ...requireRole('admin'), (req, res) => {
  if (!validateQuestion(req.body)) return fail(res, 400, 'Pregunta inválida', 'VALIDATION_ERROR');
  const result = db.prepare('UPDATE questions SET subcategory_id=?,question=?,options=?,correct_index=?,difficulty=?,explanation=?,updated_at=? WHERE id=?')
    .run(req.body.subcategoryId, req.body.question.trim(), JSON.stringify(req.body.options), Number(req.body.correct), req.body.difficulty, String(req.body.explanation || ''), new Date().toISOString(), req.params.id);
  if (!result.changes) return fail(res, 404, 'Pregunta no encontrada', 'NOT_FOUND');
  res.json({ question: mapQuestion(db.prepare('SELECT * FROM questions WHERE id=?').get(req.params.id)) });
});
router.delete('/admin/questions/:id', ...requireRole('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM questions WHERE id=?').run(req.params.id);
  if (!result.changes) return fail(res, 404, 'Pregunta no encontrada', 'NOT_FOUND');
  res.status(204).end();
});

module.exports = router;
