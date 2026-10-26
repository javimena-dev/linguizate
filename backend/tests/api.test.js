const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linguizate-test-'));
process.env.DB_PATH = path.join(tempDir, 'test.db');
process.env.JWT_SECRET = 'test-only-secret';
process.env.NODE_ENV = 'test';

const { app } = require('../server');
const { db } = require('../db');
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

async function json(pathname, options = {}) {
  const response = await fetch(base + pathname, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = response.status === 204 ? null : await response.json();
  return { response, data, cookie: response.headers.get('set-cookie') };
}

test('flujo integrado de catálogo, roles, clases y partidas idempotentes', async () => {
  const catalog = await json('/api/catalog');
  assert.equal(catalog.response.status, 200);
  assert.equal(catalog.data.categories.length, 8);
  assert.equal(catalog.data.categories.reduce((n, c) => n + c.subcategories.length, 0), 28);

  const studentLogin = await json('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'estudiante@linguizate.com', password: 'estudiante123', role: 'estudiante' })
  });
  assert.equal(studentLogin.response.status, 200);
  assert.ok(studentLogin.cookie);
  const studentCookie = studentLogin.cookie.split(';')[0];

  const professorLogin = await json('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'profesor@linguizate.com', password: 'profesor123', role: 'profesor' })
  });
  assert.equal(professorLogin.response.status, 200);
  const professorCookie = professorLogin.cookie.split(';')[0];

  const createdCategory = await json('/api/professor/categories', {
    method: 'POST', headers: { Cookie: professorCookie },
    body: JSON.stringify({ name: 'Categoría de prueba', description: 'Prueba integrada' })
  });
  assert.equal(createdCategory.response.status, 201);
  assert.equal(createdCategory.data.category.accessCode.length, 6);
  const categoryId = createdCategory.data.category.id;

  const createdQuestion = await json(`/api/professor/categories/${categoryId}/questions`, {
    method: 'POST', headers: { Cookie: professorCookie },
    body: JSON.stringify({
      question: '¿Cuál es la respuesta correcta para esta prueba?',
      options: ['A', 'B', 'C', 'D'], correct: 1, difficulty: 'facil', explanation: 'B'
    })
  });
  assert.equal(createdQuestion.response.status, 201);

  const privateQuestions = await json(`/api/subcategories/${categoryId}/questions`);
  assert.equal(privateQuestions.response.status, 404);

  const ranking = await json('/api/ranking');
  assert.equal(ranking.response.status, 200);
  assert.equal(Object.hasOwn(ranking.data.users[0], 'email'), false);

  const joined = await json('/api/classes/join', {
    method: 'POST', headers: { Cookie: studentCookie },
    body: JSON.stringify({ accessCode: createdCategory.data.category.accessCode })
  });
  assert.equal(joined.response.status, 200);
  assert.equal(joined.data.category.questions.length, 1);

  const before = studentLogin.data.user.score;
  const payload = {
    clientGameId: 'integration-game-1', categoryId, subcategoryId: categoryId,
    mode: 'estudio', attempts: [{
      questionId: createdQuestion.data.question.id, selectedOriginalIndex: 1, responseTimeSeconds: 5
    }]
  };
  const firstGame = await json('/api/games', {
    method: 'POST', headers: { Cookie: studentCookie }, body: JSON.stringify(payload)
  });
  assert.equal(firstGame.response.status, 201);
  assert.equal(firstGame.data.user.score, before + 100);
  const duplicate = await json('/api/games', {
    method: 'POST', headers: { Cookie: studentCookie }, body: JSON.stringify(payload)
  });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.data.duplicate, true);

  const removed = await json(`/api/professor/categories/${categoryId}`, {
    method: 'DELETE', headers: { Cookie: professorCookie }
  });
  assert.equal(removed.response.status, 204);

  const internal = await fetch(base + '/backend/db.js');
  assert.equal((await internal.text()).includes("require('better-sqlite3')"), false);
});

test.after(() => {
  server.close();
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
