const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('Uso: npm run import:local -- C:\\ruta\\linguizate_backup.json');
  process.exit(1);
}

const raw = fs.readFileSync(inputPath);
const checksum = crypto.createHash('sha256').update(raw).digest('hex');
const payload = JSON.parse(raw.toString('utf8'));
if (!Array.isArray(payload.users) || !payload.questions || !Array.isArray(payload.categories)) {
  throw new Error('El respaldo no tiene el formato de exportación de Lingüízate.');
}

const { db, hashSecret } = require('../db');
if (db.prepare('SELECT 1 FROM data_imports WHERE checksum=?').get(checksum)) {
  console.log('Este respaldo ya fue importado; no se realizaron cambios.');
  db.close();
  process.exit(0);
}

const backupPath = path.join(path.dirname(db.name), `linguizate-preimport-${Date.now()}.db`);

function normalizeRole(user) {
  if (user.isAdmin) return 'admin';
  if (user.isProfesor) return 'profesor';
  return 'estudiante';
}

function importData() {
  const summary = { users: 0, categories: 0, questions: 0, games: 0 };
  const findUser = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)');
  const insertUser = db.prepare(`INSERT INTO users
    (email,password,name,role,gender,avatar,security_phrase,score,games_played,achievements,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const updateUser = db.prepare(`UPDATE users SET name=?,role=?,gender=?,avatar=?,security_phrase=COALESCE(?,security_phrase),
    score=?,games_played=?,achievements=?,updated_at=? WHERE id=?`);

  db.transaction(() => {
    for (const oldUser of payload.users) {
      if (!oldUser || !oldUser.email || !oldUser.name) continue;
      let row = findUser.get(oldUser.email);
      const phraseHash = oldUser.securityPhrase ? hashSecret(oldUser.securityPhrase) : null;
      if (!row) {
        const result = insertUser.run(
          oldUser.email.toLowerCase(), hashSecret(oldUser.password || crypto.randomBytes(24).toString('hex')),
          oldUser.name, normalizeRole(oldUser), oldUser.gender || 'neutro', oldUser.avatar || null,
          phraseHash, oldUser.score || 0, oldUser.gamesPlayed || 0,
          JSON.stringify(oldUser.achievements || []), oldUser.createdAt || new Date().toISOString(), new Date().toISOString()
        );
        row = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
      } else {
        updateUser.run(
          oldUser.name, normalizeRole(oldUser), oldUser.gender || 'neutro', oldUser.avatar || null,
          phraseHash, oldUser.score || row.score || 0, oldUser.gamesPlayed || row.games_played || 0,
          JSON.stringify(oldUser.achievements || []), new Date().toISOString(), row.id
        );
      }
      summary.users += 1;

      for (const category of oldUser.personalCategories || []) {
        const categoryId = String(category.id || `prof_${row.id}_cat_${Date.now()}`);
        db.prepare(`INSERT INTO categories
          (id,owner_user_id,name,description,icon,kind,is_private,approved,access_code,created_at,updated_at)
          VALUES (?,?,?,?,?,'professor',1,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,access_code=excluded.access_code,updated_at=excluded.updated_at`)
          .run(categoryId, row.id, category.name, category.description || '', category.icon || 'fas fa-book',
            category.approved === false ? 0 : 1, category.accessCode || null,
            category.createdAt || new Date().toISOString(), new Date().toISOString());
        db.prepare(`INSERT INTO subcategories (id,category_id,name,description,icon)
          VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description`)
          .run(categoryId, categoryId, category.name, category.description || '', category.icon || 'fas fa-book');
        summary.categories += 1;
        (category.questions || []).forEach((question, index) => {
          const questionId = String(question.id || `${categoryId}:q${index + 1}`);
          db.prepare(`INSERT INTO questions
            (id,subcategory_id,owner_user_id,question,options,correct_index,difficulty,explanation,display_order)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET question=excluded.question,options=excluded.options,
              correct_index=excluded.correct_index,difficulty=excluded.difficulty,explanation=excluded.explanation`)
            .run(questionId, categoryId, row.id, question.question, JSON.stringify(question.options),
              Number(question.correct), question.difficulty, question.explanation || '', index);
          summary.questions += 1;
        });
      }

      (oldUser.gameHistory || []).forEach((game, index) => {
        const clientGameId = 'legacy-' + crypto.createHash('sha256')
          .update(`${oldUser.email}:${game.date || index}:${game.score || 0}`).digest('hex').slice(0, 32);
        const result = db.prepare(`INSERT OR IGNORE INTO games
          (client_game_id,user_id,category_name,subcategory_name,mode,score,correct_answers,incorrect_answers,avg_response_seconds,played_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
            clientGameId, row.id, game.categoryName || '-', game.subcategoryName || game.categoryName || '-',
            game.mode === 'estudio' ? 'estudio' : 'clasico', game.score || 0,
            game.correctAnswers || 0, game.incorrectAnswers || 0, game.avgResponseTimeSeconds || 0,
            game.date || new Date().toISOString()
          );
        if (result.changes) {
          const insertAttempt = db.prepare('INSERT INTO question_attempts (game_id,question_id,is_correct,response_time_seconds) VALUES (?,?,?,?)');
          for (const attempt of game.questionResults || []) {
            const known = attempt.questionId && db.prepare('SELECT id FROM questions WHERE id=? OR id LIKE ? LIMIT 1')
              .get(attempt.questionId, `%:${attempt.questionId}`);
            insertAttempt.run(result.lastInsertRowid, known?.id || null, attempt.isCorrect ? 1 : 0, attempt.responseTimeSeconds || 0);
          }
          summary.games += 1;
        }
      });
    }

    for (const [subcategoryId, group] of Object.entries(payload.questions || {})) {
      if (!db.prepare('SELECT 1 FROM subcategories WHERE id=?').get(subcategoryId)) continue;
      (group || []).forEach((question, index) => {
        const questionId = `${subcategoryId}:${question.id || 'q' + (index + 1)}`;
        db.prepare(`INSERT INTO questions
          (id,subcategory_id,question,options,correct_index,difficulty,explanation,display_order)
          VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET question=excluded.question,options=excluded.options,
            correct_index=excluded.correct_index,difficulty=excluded.difficulty,explanation=excluded.explanation`)
          .run(questionId, subcategoryId, question.question, JSON.stringify(question.options),
            Number(question.correct), question.difficulty, question.explanation || '', index);
      });
    }

    db.prepare('INSERT INTO data_imports (checksum,summary) VALUES (?,?)').run(checksum, JSON.stringify(summary));
  })();
  return summary;
}

(async () => {
  await db.backup(backupPath);
  const summary = importData();
  console.log('Copia previa:', backupPath);
  console.log('Importación completada:', summary);
  db.close();
})().catch((error) => {
  console.error(error);
  try { db.close(); } catch (_) {}
  process.exit(1);
});
