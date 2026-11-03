const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('todas las mutaciones usan CSRF de Laravel y reintentan un 419', () => {
  const source = read('src/scripts/api.ts');
  assert.match(source, /!\['GET', 'HEAD', 'OPTIONS'\]\.includes\(method\)/);
  assert.match(source, /response\.status === 419 && csrfProtected/);
  assert.match(source, /ensureCsrfCookie\(true\)/);
  assert.match(source, /credentials: 'include'/);
  assert.doesNotMatch(source, /isLaravelPath/);
});

test('las guardas exigen verificación y respetan los tres roles', () => {
  const guards = read('src/scripts/guards.ts');
  assert.match(guards, /if \(!user\.emailVerified\)/);
  assert.match(guards, /estudiante: '\/'/);
  assert.match(guards, /profesor: '\/profesor'/);
  assert.match(guards, /admin: '\/administracion'/);
});

test('login único acepta usuario, recuerda sesión y limita Google a estudiantes', () => {
  const login = read('src/pages/login.astro');
  assert.match(login, /Correo o usuario/);
  assert.match(login, /identifier: loginIdentifier/);
  assert.match(login, /remember:/);
  assert.match(login, /Google solo está disponible para estudiantes/);
  assert.match(login, /roleHome/);
});

test('admin puede invitar y reenviar invitaciones docentes', () => {
  const page = read('src/pages/administracion.astro');
  const script = read('src/scripts/admin.ts');
  const acceptance = read('src/pages/aceptar-invitacion.astro');
  assert.match(page, /teacher-invitation-form/);
  assert.match(script, /api\.post\('\/admin\/users', \{ name, email \}\)/);
  assert.match(script, /resendInvitation/);
  assert.match(acceptance, /\/auth\/invitations\/accept/);
});

test('todas las páginas del producto existen dentro de Laravel', () => {
  const pages = [
    'index.astro', 'login.astro', 'registro.astro', 'verificar-correo.astro',
    'recuperar-contrasena.astro', 'restablecer-contrasena.astro',
    'aceptar-invitacion.astro', 'categorias/index.astro', 'juego.astro',
    'resultados.astro', 'ranking.astro', 'chat.astro', 'perfil.astro',
    'progresos.astro', 'biblioteca.astro', 'profesor.astro', 'administracion.astro'
  ];
  for (const page of pages) assert.ok(fs.existsSync(path.join(root, 'src/pages', page)), page);
});

test('desarrollo envía toda la API al backend Laravel', () => {
  const config = read('astro.config.mjs');
  assert.match(config, /'\/api'/);
  assert.match(config, /target: 'http:\/\/localhost:8000'/);
  assert.doesNotMatch(config, /localhost:3000/);
});
