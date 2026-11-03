<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pruebas de autenticación | Lingüízate</title>
    <style>
        :root { color-scheme: light; font-family: Inter, system-ui, sans-serif; background:#f5f7fb; color:#192033; }
        * { box-sizing:border-box; } body { margin:0; min-height:100vh; }
        main { width:min(1040px, calc(100% - 2rem)); margin:3rem auto; }
        .hero { margin-bottom:1.5rem; } h1 { margin:0; font-size:clamp(1.8rem, 4vw, 2.7rem); } .hero p { color:#59657a; max-width:680px; line-height:1.55; }
        .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1rem; align-items:start; }
        .card { background:#fff; border:1px solid #e2e7f0; border-radius:16px; padding:1.25rem; box-shadow:0 8px 25px rgba(27,39,65,.06); }
        .card.wide { grid-column:1 / -1; } h2 { margin:.1rem 0 .75rem; font-size:1.1rem; } p { line-height:1.5; }
        form { display:grid; gap:.75rem; } label { display:grid; gap:.35rem; font-size:.9rem; font-weight:650; color:#344055; }
        input { width:100%; border:1px solid #cbd4e2; border-radius:9px; padding:.72rem .8rem; font:inherit; }
        button, .button { border:0; border-radius:9px; padding:.72rem .9rem; font:inherit; font-weight:700; cursor:pointer; background:#3b55d9; color:#fff; text-align:center; text-decoration:none; }
        button:hover, .button:hover { background:#2943c2; } .button.google { display:block; background:#fff; color:#263247; border:1px solid #cbd4e2; } .button.google:hover { background:#f8fafc; }
        .secondary { background:#e8ecf8; color:#263d83; } .secondary:hover { background:#dce3f6; }
        .danger { background:#bd3d51; } .danger:hover { background:#a22c40; }
        .actions { display:flex; flex-wrap:wrap; gap:.65rem; }
        .status { border-radius:10px; padding:.8rem; background:#f1f4f9; color:#3d4c66; min-height:3rem; white-space:pre-wrap; overflow-wrap:anywhere; }
        .status.ok { background:#e6f6ec; color:#17643b; } .status.error { background:#fff0f2; color:#9b2033; }
        .hint { color:#64748b; font-size:.88rem; margin:.65rem 0 0; }
        @media (max-width:600px) { main { margin:1.5rem auto; } }
    </style>
</head>
<body>
<main>
    <header class="hero">
        <h1>Pruebas de autenticación</h1>
        <p>Esta pantalla se sirve directamente desde Laravel. Úsala para probar sesión, registro, acceso normal, Google y recuperación sin Astro ni proxy.</p>
    </header>

    <section class="grid">
        <article class="card wide">
            <h2>Estado de la sesión</h2>
            <div id="session-status" class="status" role="status">Comprobando sesión…</div>
            <div class="actions" style="margin-top:.8rem">
                <button type="button" id="refresh-session" class="secondary">Actualizar estado</button>
                <button type="button" id="check-chat" class="secondary">Probar acceso al chat</button>
                <button type="button" id="logout" class="danger" hidden>Cerrar sesión</button>
            </div>
        </article>

        <article class="card">
            <h2>Google</h2>
            <a class="button google" href="{{ route('google.redirect', ['return_to' => '/pruebas-autenticacion?auth=google']) }}">Continuar con Google</a>
            <p class="hint">Al terminar, Google vuelve a esta misma página para comprobar la cookie de Laravel.</p>
        </article>

        <article class="card">
            <h2>Iniciar sesión</h2>
            <form id="login-form">
                <label>Correo <input name="email" type="email" autocomplete="email" required></label>
                <label>Contraseña <input name="password" type="password" autocomplete="current-password" required></label>
                <button>Ingresar</button>
            </form>
        </article>

        <article class="card">
            <h2>Crear cuenta</h2>
            <form id="register-form">
                <label>Nombre <input name="name" autocomplete="name" required></label>
                <label>Correo <input name="email" type="email" autocomplete="email" required></label>
                <label>Contraseña <input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
                <label>Confirmar contraseña <input name="password_confirmation" type="password" autocomplete="new-password" minlength="8" required></label>
                <button>Registrar</button>
            </form>
        </article>

        <article class="card">
            <h2>Recuperar contraseña</h2>
            <form id="forgot-form">
                <label>Correo <input name="email" type="email" autocomplete="email" required></label>
                <button>Enviar enlace</button>
            </form>
            <p class="hint">El correo usa la configuración SMTP actual de Laravel.</p>
        </article>

        <article class="card">
            <h2>Prueba SMTP directa</h2>
            <form id="mail-test-form">
                <label>Destinatario <input name="email" type="email" autocomplete="email" required></label>
                <button>Enviar correo de prueba</button>
            </form>
            <p class="hint">Solo está habilitada en los entornos local y testing. No depende de que el destinatario tenga cuenta en Lingüízate.</p>
        </article>

        <article class="card wide">
            <h2>Resultado de la última acción</h2>
            <div id="result" class="status" aria-live="polite">Aún no hay acciones.</div>
        </article>
    </section>
</main>

<script>
    const sessionStatus = document.querySelector('#session-status');
    const result = document.querySelector('#result');
    const logout = document.querySelector('#logout');

    const cookie = (name) => document.cookie.split('; ').find((item) => item.startsWith(`${name}=`))?.split('=').slice(1).join('=');
    const show = (element, message, kind = '') => { element.textContent = message; element.className = `status ${kind}`; };
    const csrf = async () => { if (!cookie('XSRF-TOKEN')) await fetch('/sanctum/csrf-cookie', { credentials: 'include' }); };
    const request = async (path, options = {}) => {
        const method = (options.method || 'GET').toUpperCase();
        if (method !== 'GET') await csrf();
        const response = await fetch(`/api${path}`, {
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...(cookie('XSRF-TOKEN') ? { 'X-XSRF-TOKEN': decodeURIComponent(cookie('XSRF-TOKEN')) } : {}),
                ...(options.headers || {})
            },
            ...options
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || body.message || `Error HTTP ${response.status}`);
        return body;
    };
    const data = (form) => Object.fromEntries(new FormData(form).entries());

    async function refreshSession() {
        try {
            const response = await request('/auth/session');
            const user = response.user;
            show(sessionStatus, `Sesión activa\n${user.name} · ${user.email}\nRol: ${user.role} · Correo verificado: ${user.emailVerified ? 'sí' : 'no'}`, 'ok');
            logout.hidden = false;
        } catch (error) {
            show(sessionStatus, 'Sin sesión activa.', '');
            logout.hidden = true;
        }
    }

    document.querySelector('#login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        try { const response = await request('/auth/login', { method: 'POST', body: JSON.stringify(data(event.currentTarget)) }); show(result, response.requiresVerification ? 'Sesión iniciada. Falta verificar el correo.' : 'Sesión iniciada correctamente.', 'ok'); await refreshSession(); }
        catch (error) { show(result, error.message, 'error'); }
    });
    document.querySelector('#register-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        try { const response = await request('/auth/register', { method: 'POST', body: JSON.stringify({ ...data(event.currentTarget), gender: 'otro' }) }); show(result, response.message || 'Cuenta creada.', 'ok'); await refreshSession(); }
        catch (error) { show(result, error.message, 'error'); }
    });
    document.querySelector('#forgot-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        try { const response = await request('/auth/password/forgot', { method: 'POST', body: JSON.stringify(data(event.currentTarget)) }); show(result, response.message, 'ok'); }
        catch (error) { show(result, error.message, 'error'); }
    });
    document.querySelector('#mail-test-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            await csrf();
            const response = await fetch('/pruebas-autenticacion/correo', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    ...(cookie('XSRF-TOKEN') ? { 'X-XSRF-TOKEN': decodeURIComponent(cookie('XSRF-TOKEN')) } : {})
                },
                body: JSON.stringify(data(event.currentTarget))
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || `Error HTTP ${response.status}`);
            show(result, body.message, 'ok');
        } catch (error) { show(result, error.message, 'error'); }
    });
    document.querySelector('#refresh-session').addEventListener('click', refreshSession);
    document.querySelector('#check-chat').addEventListener('click', async () => {
        try { const response = await request('/chat/usage'); show(result, `Chat autenticado: ${response.remaining} de ${response.limit} preguntas disponibles.`, 'ok'); }
        catch (error) { show(result, error.message, 'error'); }
    });
    logout.addEventListener('click', async () => {
        try { await request('/auth/session', { method: 'DELETE' }); show(result, 'Sesión cerrada.', 'ok'); await refreshSession(); }
        catch (error) { show(result, error.message, 'error'); }
    });
    const google = new URLSearchParams(location.search).get('google');
    if (google) show(result, google === 'failed' ? 'Google no pudo completar el acceso.' : `Google: ${google}`, 'error');
    refreshSession();
</script>
</body>
</html>
