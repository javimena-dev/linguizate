const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('la sesión restaurada y los enlaces del sidebar abren y cargan cada sección', async () => {
  const handlers = new Map();
  const elements = new Map();
  const calls = [];
  const sections = ['dashboard', 'users', 'questions', 'categories'].map((name) => ({ id: `admin-sec-${name}`, style: {} }));
  const element = () => ({
    style: {}, dataset: {}, value: '', textContent: '', disabled: false,
    addEventListener() {}, replaceChildren() {}, querySelectorAll() { return []; }
  });
  for (const id of ['admin-panel-wrap', 'admin-screen', 'admin-login-msg', 'btn-admin-submit', 'btn-admin-logout', 'btn-export-research', 'stat-total-users', 'stat-total-questions', 'stat-total-categories']) elements.set(id, element());
  const lists = {};
  for (const name of ['users', 'questions', 'categories']) {
    const controls = Object.fromEntries(['search', 'sort', 'direction', 'size', 'body', 'status', 'count', 'page', 'prev', 'next'].map((key) => [key, element()]));
    controls.sort.value = 'id'; controls.direction.value = 'asc'; controls.size.value = '10';
    lists[name] = { ...element(), querySelector(selector) { return controls[selector.slice(6, -1)]; } };
  }
  let user = null;
  let subscriber;
  const store = {
    $currentUser: { get: () => user, set: (value) => { user = value; subscriber?.(user); }, subscribe: (fn) => { subscriber = fn; fn(user); return () => {}; } },
    fetchCurrentSession: async () => { store.$currentUser.set({ isAdmin: true }); }, logoutUser: async () => {}
  };
  const api = { get: async (path) => { calls.push(path); return { users: [], questions: [], categories: [] }; } };
  const document = {
    getElementById: (id) => elements.get(id),
    querySelector: (selector) => lists[selector.match(/data-list="(.*?)"/)?.[1]],
    querySelectorAll: (selector) => selector === '.admin-tab-content' ? sections : [],
    addEventListener() {}
  };
  const window = { location: { hash: '#questions' }, addEventListener: (event, fn) => handlers.set(event, fn), removeEventListener() {} };
  const imports = { './api': { api }, './store': store, './feedback': { notify() {} }, xlsx: {} };
  const code = ts.transpileModule(fs.readFileSync('src/scripts/admin.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { require: (name) => imports[name], exports: {}, document, window, console, Intl, URL, setTimeout });
  await new Promise(setImmediate);
  assert.equal(elements.get('admin-screen').style.display, 'none');
  assert.equal(elements.get('admin-panel-wrap').style.display, 'block');
  assert.equal(sections.find((section) => section.id === 'admin-sec-questions').style.display, 'block');
  for (const name of ['users', 'categories', 'dashboard', 'questions']) {
    window.location.hash = `#${name}`;
    handlers.get('hashchange')();
    await new Promise(setImmediate);
    assert.equal(sections.find((section) => section.id === `admin-sec-${name}`).style.display, 'block');
    assert.equal(sections.filter((section) => section.style.display === 'block').length, 1);
  }
  for (const name of ['users', 'questions', 'categories']) assert.ok(calls.includes(`/admin/${name}`));
});
