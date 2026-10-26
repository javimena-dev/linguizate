/**
 * Lingüízate - Trivia Lingüística
 * Animaciones: realizadas con CSS (keyframes) por ser aplicación vanilla HTML/CSS/JS.
 * No se usa Framer Motion (requeriría React). Código comentado para mantenimiento.
 */
// Variables globales
let currentUser = null;
let currentGame = null;
let categories = [];
let questions = {};
let users = [];
let isAdmin = false;
let currentUserType = null; // 'admin', 'profesor', 'estudiante'
let currentProfesor = null; // Datos del profesor actual
let currentTheme = 'light';
let isLoadingData = false;
let dataLoadAttempts = 0;
const MAX_LOAD_ATTEMPTS = 3;

// Audio global (música + SFX)
let backgroundMusicAudio = null;

// Configuración de IA (Groq/OpenAI vía backend local)
window.LINGUIZATE_AI_API_URL = '/api/chat';
let backgroundMusicEnabled = true;
let audioPausedForReading = false;
const activeSfxAudios = new Set();

// Admin (Dashboard + gráficos)
let adminChartDominio = null;
let adminChartEvolucion = null;
let adminChartDemografia = null;

// Profesor: filtro actual de estadísticas para exportación
let profesorStatsFiltered = null;
let profesorStatsFilteredCategory = 'Todas';

// Modo de juego actual: 'clasico' | 'estudio'
let currentMode = 'clasico';

/** Invitado: partida congelada al abrir login/registro desde el juego */
let gameFrozenForAuth = false;

const SFX_PATHS = {
    click: 'assets/sounds/ui/click.mp3',
    toggle: 'assets/sounds/ui/toggle.mp3',
    start: 'assets/sounds/game/start.mp3',
    select: 'assets/sounds/game/select.mp3',
    correct: 'assets/sounds/game/correct.mp3',
    wrong: 'assets/sounds/game/wrong.mp3',
    timer_low: 'assets/sounds/alerts/timer-low.mp3',
    finish: 'assets/sounds/results/finish.mp3'
};

const SFX_ALIASES = {
    complete: 'finish',
    timerlow: 'timer_low',
    'timer-low': 'timer_low'
};

function stopSfxByType(type) {
    activeSfxAudios.forEach(function (audioEl) {
        if (!audioEl) return;
        if (audioEl._sfxType !== type) return;
        try {
            audioEl.pause();
            audioEl.currentTime = 0;
        } catch (e) { }
        activeSfxAudios.delete(audioEl);
    });
}

function stopAllSounds() {
    activeSfxAudios.forEach(function (audioEl) {
        try {
            audioEl.pause();
            audioEl.currentTime = 0;
        } catch (e) { }
    });
    activeSfxAudios.clear();
    if (backgroundMusicAudio) {
        try {
            backgroundMusicAudio.pause();
            backgroundMusicAudio.currentTime = 0;
        } catch (e) { }
    }
}

function closeAnyAudioContext() {
    var candidates = [window.audioContext, window.__audioContext, window.__linguizateAudioContext];
    candidates.forEach(function (ctx) {
        if (!ctx || typeof ctx.close !== 'function') return;
        if (ctx.state === 'closed') return;
        try { ctx.close(); } catch (e) { }
    });
}

function ensureBackgroundMusic() {
    if (backgroundMusicAudio) return backgroundMusicAudio;
    if (!window.Audio) return null;
    backgroundMusicAudio = new window.Audio('assets/music/ambient-loop.mp3');
    backgroundMusicAudio.loop = true;
    backgroundMusicAudio.volume = 0.2;
    return backgroundMusicAudio;
}

function updateMusicToggleUI() {
    var btn = document.getElementById('btn-music-toggle');
    if (!btn) return;
    var icon = btn.querySelector('i');
    var on = !!backgroundMusicEnabled;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('title', on ? 'Silenciar música' : 'Activar música');
    if (icon) icon.className = on ? 'fas fa-volume-up' : 'fas fa-volume-mute';
}

function playBackgroundMusicIfAllowed() {
    if (!backgroundMusicEnabled || audioPausedForReading) return;
    var music = ensureBackgroundMusic();
    if (!music) return;
    music.play().catch(function () { });
}

function pauseBackgroundMusic() {
    if (!backgroundMusicAudio) return;
    try { backgroundMusicAudio.pause(); } catch (e) { }
}

function toggleBackgroundMusic() {
    backgroundMusicEnabled = !backgroundMusicEnabled;
    sessionStorage.setItem('linguizate_music_enabled', backgroundMusicEnabled ? '1' : '0');
    updateMusicToggleUI();
    if (backgroundMusicEnabled) playBackgroundMusicIfAllowed();
    else pauseBackgroundMusic();
}

function loadMusicPreference() {
    try {
        var raw = sessionStorage.getItem('linguizate_music_enabled');
        if (raw === '0') backgroundMusicEnabled = false;
        if (raw === '1') backgroundMusicEnabled = true;
    } catch (e) { }
    updateMusicToggleUI();
}

/** Reproduce un efecto de sonido desde assets/sounds.
 *  Tipos disponibles: click, toggle, start, select, correct, wrong, timer_low, finish.
 *  Alias soportados: complete -> finish, timer-low -> timer_low. */
function playSFX(type) {
    if (!window.Audio) return;
    var raw = String(type || 'click').toLowerCase();
    var normalized = SFX_ALIASES[raw] || raw;
    var path = SFX_PATHS[normalized] || SFX_PATHS.click;
    if (normalized === 'timer_low') {
        stopSfxByType('timer_low');
    }
    try {
        var a = new window.Audio(path);
        a._sfxType = normalized;
        a.volume = normalized === 'toggle' ? 0.35 : 0.5;
        activeSfxAudios.add(a);
        a.addEventListener('ended', function () { activeSfxAudios.delete(a); }, { once: true });
        a.play().catch(function () { });
    } catch (e) { }
}

// Colores por categoría (HEX) para estética tipo Kahoot
const CATEGORY_COLORS = {
    general: '#6366F1',
    descriptiva: '#8B5CF6',
    historica: '#F59E0B',
    sociolinguistica: '#FF8C00',
    psicolinguistica: '#EC4899',
    computacional: '#00CED1',
    aplicada: '#10B981',
    diversidad_curiosidades: '#F97316'
};
function getCategoryColor(categoryId) {
    return CATEGORY_COLORS[categoryId] || '#6366F1';
}

/** Métricas agregadas del historial (para tablas admin / tesis). */
function getUserAggregateMetrics(user) {
    var h = (user && Array.isArray(user.gameHistory)) ? user.gameHistory : [];
    var totalQ = 0;
    var totalC = 0;
    var timeSum = 0;
    var timeN = 0;
    h.forEach(function (g) {
        totalQ += (g.totalQuestions || 0);
        totalC += (g.correctAnswers || 0);
        if (g.avgResponseTimeSeconds != null && !isNaN(Number(g.avgResponseTimeSeconds))) {
            timeSum += Number(g.avgResponseTimeSeconds);
            timeN++;
        }
    });
    var acc = totalQ > 0 ? (totalC / totalQ) * 100 : null;
    var avgT = timeN > 0 ? timeSum / timeN : null;
    return { accuracy: acc, avgResponse: avgT };
}

/** Toggle Estudiante | Profesor en login (sincroniza #user-type hidden). */
function initRoleSegmentControl() {
    var wrap = document.getElementById('role-segment');
    var hidden = document.getElementById('user-type');
    if (!wrap || !hidden) return;
    var btns = wrap.querySelectorAll('.role-segment-btn');
    function setRole(role) {
        var r = role === 'profesor' ? 'profesor' : 'estudiante';
        hidden.value = r;
        wrap.classList.toggle('is-profesor', r === 'profesor');
        btns.forEach(function (b) {
            var br = b.getAttribute('data-role');
            var on = br === r;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }
    btns.forEach(function (b) {
        b.addEventListener('click', function () {
            setRole(b.getAttribute('data-role') || 'estudiante');
        });
    });
    setRole(hidden.value || 'estudiante');
}

/** Género registro: Masculino | Femenino | Otro → #gender hidden */
function initGenderSegmentControl() {
    var wrap = document.getElementById('gender-segment');
    var hidden = document.getElementById('gender');
    if (!wrap || !hidden) return;
    var btns = wrap.querySelectorAll('.gender-segment-btn');
    function setGender(g) {
        var v = g === 'masculino' || g === 'femenino' ? g : 'otro';
        hidden.value = v;
        wrap.classList.remove('is-masculino', 'is-femenino', 'is-otro');
        wrap.classList.add(v === 'masculino' ? 'is-masculino' : v === 'femenino' ? 'is-femenino' : 'is-otro');
        btns.forEach(function (b) {
            var bg = b.getAttribute('data-gender');
            var on = bg === v;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }
    btns.forEach(function (b) {
        b.addEventListener('click', function () {
            setGender(b.getAttribute('data-gender') || 'otro');
        });
    });
    var initial = (hidden.value || 'otro').toLowerCase();
    if (initial === 'neutro') initial = 'otro';
    setGender(initial === 'masculino' || initial === 'femenino' ? initial : 'otro');
}

function freezeGuestGameForAuth() {
    if (currentUser || !currentGame) return;
    var tEl = document.getElementById('timer');
    if (tEl && (currentGame.mode || currentMode) === 'clasico') {
        var raw = String(tEl.textContent || '').trim();
        var n = parseInt(raw, 10);
        if (!isNaN(n) && n >= 0) currentGame._frozenTimeLeft = n;
    }
    gameFrozenForAuth = true;
    currentGame.isPaused = true;
    if (currentGame.timer) {
        clearInterval(currentGame.timer);
        currentGame.timer = null;
    }
    stopSfxByType('timer_low');
    document.querySelectorAll('#options-container .option-btn').forEach(function (btn) {
        btn.disabled = true;
    });
}

function abandonGuestGameFromAuth() {
    gameFrozenForAuth = false;
    if (!currentUser && currentGame) {
        currentGame = null;
    }
}

function tryResumeGuestGameAfterAuth() {
    if (!currentGame || currentUserType !== 'estudiante') {
        gameFrozenForAuth = false;
        return false;
    }
    if (!gameFrozenForAuth) return false;
    gameFrozenForAuth = false;
    currentGame.isPaused = false;
    document.querySelectorAll('#options-container .option-btn').forEach(function (btn) {
        btn.disabled = false;
    });
    showScreen('juego-screen');
    var mode = currentGame.mode || currentMode;
    if (mode === 'clasico') {
        var sec = currentGame._frozenTimeLeft;
        delete currentGame._frozenTimeLeft;
        if (sec != null && sec > 0) {
            startTimerFromSeconds(sec);
        } else {
            startTimer();
        }
    }
    return true;
}

function getDefaultAvatarPath(n) {
    var safe = Math.max(1, Math.min(6, Number(n) || 1));
    return 'assets/images/avatares/avatar-' + String(safe).padStart(2, '0') + '.png';
}

/** Devuelve la URL del avatar del usuario: default1..default6 -> assets/images/avatares/avatar-0N.png, o data URL si subió imagen. */
function getAvatarUrl(user) {
    if (!user || !user.avatar) return getDefaultAvatarPath(1);
    if (user.avatar.indexOf('data:') === 0) return user.avatar;
    if (/^assets\/images\/avatares\/avatar-\d{2}\.png$/i.test(user.avatar)) return user.avatar;
    var n = user.avatar.replace(/^default/i, '');
    if (/^[1-6]$/.test(n)) return getDefaultAvatarPath(n);
    return getDefaultAvatarPath(1);
}

/** Modal para elegir avatar: 6 por defecto o subir imagen. Actualiza currentUser y (si aplica) currentProfesor. */
function openAvatarModal() {
    if (!currentUser || currentUserType === 'admin') return;
    var defaultsHtml = [1, 2, 3, 4, 5, 6].map(function (n) {
        return '<button type="button" class="avatar-option" data-avatar="default' + n + '" aria-label="Avatar ' + n + '"><img src="' + getDefaultAvatarPath(n) + '" alt=""></button>';
    }).join('');
    var html = '<div class="avatar-picker">' +
        '<p class="avatar-picker-hint">Elige un avatar por defecto o sube tu imagen (recomendado: cuadrado, máx. 400×400 px).</p>' +
        '<div class="avatar-defaults">' + defaultsHtml + '</div>' +
        '<div class="avatar-upload"><label class="btn-secondary"><i class="fas fa-upload"></i> Subir imagen<input type="file" accept="image/*" id="avatar-file-input" hidden></label></div>' +
        '</div>';
    showModal('Cambiar Avatar', html);
    document.querySelectorAll('.avatar-option').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var val = btn.getAttribute('data-avatar');
            applyAvatar(val);
        });
    });
    var fileInput = document.getElementById('avatar-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', function () {
            var file = fileInput.files && fileInput.files[0];
            if (!file || !file.type.match(/^image\//)) {
                showNotification('Selecciona un archivo de imagen válido.', 'error');
                return;
            }
            var reader = new FileReader();
            reader.onload = function () {
                var dataUrl = reader.result;
                if (dataUrl.length > 300000) {
                    showNotification('Imagen demasiado grande. Usa una más pequeña (máx. ~200 KB).', 'error');
                    return;
                }
                applyAvatar(dataUrl);
            };
            reader.readAsDataURL(file);
        });
    }
}

async function applyAvatar(value) {
    if (!currentUser) return;
    try {
        const data = await LinguizateAPI.patch('/users/me', { avatar: value });
        currentUser = { ...currentUser, ...data.user };
    } catch (error) {
        showNotification(error.message, 'error');
        return;
    }
    currentUser.avatar = value;
    if (currentUserType === 'profesor' && currentProfesor) currentProfesor.avatar = value;
    var idx = users.findIndex(function (u) { return u.id === currentUser.id; });
    if (idx !== -1) users[idx] = currentUser;
    saveDataToLocalStorage();
    updateNavbarUser();
    var profAvatar = document.getElementById('profesor-avatar');
    if (profAvatar) profAvatar.src = getAvatarUrl(currentUser);
    var misResAvatar = document.getElementById('mis-resultados-avatar');
    if (misResAvatar) misResAvatar.src = getAvatarUrl(currentUser);
    closeModal();
    showNotification('Avatar actualizado', 'success');
}
/** Genera un código único de 6 caracteres (A-Z, 0-9) para categorías privadas de profesor. */
function generateAccessCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

/** Busca una categoría de profesor por código de acceso. Retorna { category, ownerUser } o null. */
function findCategoryByAccessCode(code) {
    const normalized = String(code).trim().toUpperCase();
    if (normalized.length !== 6) return null;
    for (const user of users) {
        if (!user.isProfesor || !user.personalCategories) continue;
        for (const cat of user.personalCategories) {
            const catCode = (cat.accessCode || '').toString().toUpperCase();
            if (catCode === normalized) return { category: cat, ownerUser: user };
        }
    }
    return null;
}

function getCategoryProgress(categoryId) {
    try {
        const key = 'linguizate_progress_' + categoryId;
        const raw = localStorage.getItem(key);
        if (raw) {
            const v = parseFloat(raw);
            if (!isNaN(v) && v >= 0 && v <= 100) return v;
        }
    } catch (e) { }
    return 0;
}

// URL del backend para chat con IA. Por defecto '/api/chat' (funciona si la app se sirve desde el backend Node).
// Si usas solo el servidor estático (ej. Python), déjalo vacío: window.LINGUIZATE_AI_API_URL = '';
window.LINGUIZATE_AI_API_URL = window.LINGUIZATE_AI_API_URL || '/api/chat';

// Configuración del juego (base para modo clásico)
const GAME_CONFIG = {
    timePerQuestion: 30,
    pointsPerCorrect: 100,
    timeBonus: 10,
    difficultyMultiplier: {
        facil: 1,
        medio: 1.5,
        dificil: 2
    }
};

// Función para verificar el estado de la aplicación
function checkAppState() {
    console.log('=== ESTADO DE LA APLICACIÓN ===');

    // Verificar pantallas
    const screens = document.querySelectorAll('.screen');
    console.log(`📺 Pantallas encontradas: ${screens.length}`);
    screens.forEach(screen => {
        const isActive = screen.classList.contains('active');
        const isVisible = window.getComputedStyle(screen).display !== 'none';
        console.log(`- ${screen.id}: ${isActive ? '✅ activa' : '❌ inactiva'}, ${isVisible ? '👁️ visible' : '🚫 oculta'}`);
    });

    // Verificar datos
    console.log('\n📊 Estado de los datos:');
    console.log(`- Categorías: ${categories ? categories.length : 0} cargadas`);
    if (categories && categories.length > 0) {
        console.log(`  - Primera categoría: ${categories[0].name}`);
        console.log(`  - Total subcategorías: ${categories.reduce((total, cat) => total + cat.subcategories.length, 0)}`);
    }
    console.log(`- Preguntas: ${Object.keys(questions).length} subcategorías con preguntas`);
    console.log(`- Usuarios: ${users.length} registrados`);
    console.log(`- Usuario actual: ${currentUser ? currentUser.name : 'ninguno'}`);

    // Verificar botones principales
    console.log('\n🔘 Estado de los botones:');
    ['btn-jugar', 'btn-login', 'btn-admin', 'btn-ranking'].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            const isClickable = window.getComputedStyle(btn).pointerEvents !== 'none';
            console.log(`- ${btnId}: ${btn ? '✅ existe' : '❌ no existe'}, ${isClickable ? '🖱️ clickeable' : '🚫 no clickeable'}`);
        }
    });

    // Verificar elementos críticos
    console.log('\n🎯 Elementos críticos:');
    const criticalElements = ['categories-grid', 'categorias-screen'];
    criticalElements.forEach(id => {
        const element = document.getElementById(id);
        console.log(`- ${id}: ${element ? '✅ existe' : '❌ no existe'}`);
    });

    console.log('============================');
}

// Verifica que el backend y el catálogo estén disponibles.
async function checkJsonFiles() {
    try {
        await LinguizateAPI.get('/health');
        await LinguizateAPI.get('/catalog');
        console.log('✅ API y catálogo disponibles');
    } catch (error) {
        console.error('❌ Error al verificar la API:', error);
    }
}

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 DOM Content Loaded');

    // Inicializar la aplicación completa
    initializeApp();
});

// Configuración simple de event listeners
function setupSimpleEventListeners() {
    console.log('🔧 Configurando event listeners simples...');

    // Botones principales
    const buttons = {
        'btn-jugar': 'categorias-screen',
        'btn-login': 'login-screen',
        'btn-admin': 'admin-screen',
        'btn-ranking': 'ranking-screen'
    };

    Object.entries(buttons).forEach(([btnId, screenId]) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            console.log(`✅ Configurando ${btnId} -> ${screenId}`);
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                console.log(`🖱️ Click en ${btnId}`);
                showScreen(screenId);
            });
        } else {
            console.error(`❌ No se encontró el botón ${btnId}`);
        }
    });

    // Botones de regreso
    const backButtons = [
        'btn-back-inicio',
        'btn-back-inicio-admin',
        'btn-back-inicio-cat',
        'btn-back-inicio-result',
        'btn-back-inicio-ranking'
    ];

    backButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            console.log(`✅ Configurando ${btnId} -> inicio-screen`);
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                console.log(`🖱️ Click en ${btnId}`);
                showScreen('inicio-screen');
            });
        }
    });
}

// Función de debug para la inicialización
function debugInitialization() {
    console.log('=== DEBUG INICIALIZACIÓN ===');

    LinguizateAPI.get('/health')
        .then(() => console.log('API status: ✅'))
        .catch(error => console.error('Error loading API:', error));

    // Verificar elementos críticos
    const criticalElements = [
        'inicio-screen',
        'btn-jugar',
        'notifications'
    ];

    criticalElements.forEach(id => {
        const element = document.getElementById(id);
        console.log(`${id}: ${element ? '✅ Encontrado' : '❌ No encontrado'}`);
        if (element) {
            console.log(`- classList: ${element.classList}`);
            console.log(`- visibility: ${getComputedStyle(element).visibility}`);
            console.log(`- display: ${getComputedStyle(element).display}`);
        }
    });

    console.log('========================');
}

// Función de debug para verificar elementos
function debugElements() {
    const elements = [
        'btn-jugar',
        'btn-login',
        'btn-admin',
        'btn-ranking',
        'inicio-screen',
        'categorias-screen',
        'login-screen',
        'admin-screen',
        'ranking-screen'
    ];

    console.log('=== DEBUG ELEMENTOS ===');
    elements.forEach(id => {
        const element = document.getElementById(id);
        console.log(`${id}: ${element ? '✅ Encontrado' : '❌ No encontrado'}`);
    });
    console.log('=======================');
}

// Inicializar la aplicación
async function initializeApp() {
    try {
        console.log('Iniciando aplicación...');

        // Debug: verificar elementos
        debugElements();

        // Verificar archivos JSON
        await checkJsonFiles();

        // Asegurarse de que el DOM está completamente cargado
        if (document.readyState !== 'complete') {
            console.log('Esperando a que el DOM esté listo...');
            await new Promise(resolve => {
                window.addEventListener('load', resolve);
            });
        }

        // Cargar datos
        console.log('Cargando datos...');
        const dataLoaded = await loadData();

        // Cargar datos guardados en localStorage (categorías personales, etc.)
        loadDataFromLocalStorage();
        await restoreSessionFromStorage();
        updateNavbarUser();
        if (!dataLoaded) {
            console.warn('⚠️ No se pudieron cargar los datos iniciales');
            showNotification('Error al cargar las categorías. Por favor, verifica que los archivos JSON sean correctos.', 'error');
        }

        // Verificar que las categorías se cargaron correctamente
        if (!categories || categories.length === 0) {
            console.error('❌ Las categorías no se cargaron correctamente');
            showNotification('Error: No se pudieron cargar las categorías. Por favor, recarga la página.', 'error');
        } else {
            console.log(`✅ ${categories.length} categorías cargadas exitosamente`);
        }

        // Configurar event listeners
        console.log('Configurando event listeners...');
        setupEventListeners();
        // Establecer modo de juego inicial en la UI
        setGameMode(currentMode);

        // Cargar tema
        console.log('Cargando tema...');
        loadTheme();
        loadMusicPreference();

        // Mostrar pantalla inicial
        console.log('Mostrando pantalla inicial...');
        const screenShown = showScreen('inicio-screen');
        if (!screenShown) {
            throw new Error('No se pudo mostrar la pantalla inicial');
        }
        if (currentUser && currentUserType === 'estudiante') {
            if (window.location.pathname === '/biblioteca') showScreen('biblioteca-screen');
            if (window.location.pathname === '/progresos') showScreen('progresos-screen');
        }

        console.log('✅ Aplicación inicializada exitosamente');

        // Verificar que la aplicación está funcionando correctamente
        setTimeout(() => {
            console.log('=== VERIFICACIÓN FINAL ===');
            checkAppState();
            console.log('✅ Aplicación lista para usar');
        }, 1000);

    } catch (error) {
        console.error('❌ Error al inicializar la aplicación:', error);
        showNotification('Error al inicializar la aplicación. Por favor, recarga la página.', 'error');

        // Intentar mostrar la pantalla de inicio de todos modos
        try {
            showScreen('inicio-screen');
        } catch (e) {
            console.error('Error fatal: No se puede mostrar la pantalla de inicio:', e);
        }
    }
}

// Cargar datos desde archivos JSON
async function loadData() {
    // Evitar múltiples cargas simultáneas
    if (isLoadingData) {
        console.log('⚠️ Ya se está cargando datos, esperando...');
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (!isLoadingData) {
                    clearInterval(checkInterval);
                    resolve(true);
                }
            }, 100);
        });
    }

    if (dataLoadAttempts >= MAX_LOAD_ATTEMPTS) {
        console.error('❌ Máximo número de intentos de carga alcanzado');
        showNotification('Error: No se pudieron cargar los datos después de múltiples intentos. Por favor, verifica que el servidor esté ejecutándose.', 'error');
        return false;
    }

    isLoadingData = true;
    dataLoadAttempts++;

    try {
        console.log(`🔄 Iniciando carga de datos (intento ${dataLoadAttempts}/${MAX_LOAD_ATTEMPTS})...`);

        const categoriesData = await LinguizateAPI.get('/catalog');
        if (!categoriesData || !Array.isArray(categoriesData.categories)) {
            throw new Error('El formato del archivo categories.json no es válido');
        }

        categories = categoriesData.categories;
        if (categories.length === 0) {
            throw new Error('No hay categorías definidas en el archivo categories.json');
        }

        console.log('✅ Categorías cargadas:', categories.length);
        console.log('📋 Primera categoría:', categories[0]?.name);

        const subcategories = categories.flatMap(category => category.subcategories || []);
        const questionEntries = await Promise.all(subcategories.map(async subcategory => {
            const data = await LinguizateAPI.get(`/subcategories/${encodeURIComponent(subcategory.id)}/questions`);
            return [subcategory.id, data.questions || []];
        }));
        questions = Object.fromEntries(questionEntries);
        console.log('✅ Preguntas cargadas:', Object.keys(questions).length);
        console.log('📋 Categorías con preguntas:', Object.keys(questions));
        console.log('🔍 Preguntas de diacronica:', questions['diacronica'] ? questions['diacronica'].length : 'NO ENCONTRADAS');

        // Cargar usuarios (crear si no existe)
        await loadUsers();

        console.log('✅ Todos los datos cargados exitosamente');
        dataLoadAttempts = 0; // Resetear contador en caso de éxito
        isLoadingData = false;
        return true;
    } catch (error) {
        console.error('❌ Error al cargar datos:', error);
        isLoadingData = false;

        // Solo mostrar notificación si no hemos alcanzado el máximo de intentos
        if (dataLoadAttempts < MAX_LOAD_ATTEMPTS) {
            showNotification(`Error al cargar los datos: ${error.message}. Reintentando...`, 'error');
        } else {
            showNotification(`Error: No se pudieron cargar los datos después de ${MAX_LOAD_ATTEMPTS} intentos. Por favor, verifica que el servidor esté ejecutándose en http://localhost:8000`, 'error');
        }

        // Intentar crear datos por defecto solo si no hay más intentos
        if (dataLoadAttempts >= MAX_LOAD_ATTEMPTS) {
            try {
                await createDefaultData();
                return false;
            } catch (defaultError) {
                console.error('Error al crear datos por defecto:', defaultError);
                return false;
            }
        }

        return false;
    }
}

// Crear datos por defecto
async function createDefaultData() {
    if (!users.length) {
        users = [
            {
                id: 1,
                email: 'admin@linguizate.com',
                password: 'admin123',
                name: 'Administrador',
                gender: 'neutro',
                isAdmin: true,
                score: 0,
                gamesPlayed: 0,
                achievements: []
            },
            {
                id: 2,
                email: 'profesor@linguizate.com',
                password: 'prof123',
                name: 'Profesor',
                gender: 'neutro',
                isAdmin: false,
                isProfesor: true,
                score: 0,
                gamesPlayed: 0,
                achievements: []
            },
            {
                id: 3,
                email: 'estudiante@linguizate.com',
                password: 'est123',
                name: 'Estudiante',
                gender: 'neutro',
                isAdmin: false,
                isEstudiante: true,
                score: 0,
                gamesPlayed: 0,
                achievements: []
            },
            {
                id: 4,
                email: 'investigador@linguizate.com',
                password: 'inv123',
                name: 'Investigador',
                gender: 'neutro',
                isAdmin: false,
                isInvestigador: true,
                score: 0,
                gamesPlayed: 0,
                achievements: []
            }
        ];
    }
}

// Cargar usuarios
async function loadUsers() {
    try {
        const data = await LinguizateAPI.get('/ranking');
        users = data.users || [];
    } catch (error) {
        users = [];
    }
}

// Configurar event listeners
function setupEventListeners() {
    try {
        console.log('Configurando event listeners...');

        // Función auxiliar para agregar event listener de forma segura
        function addSafeEventListener(elementId, event, handler) {
            const element = document.getElementById(elementId);
            if (element) {
                element.addEventListener(event, handler);
                console.log(`✅ Listener agregado para ${elementId}`);
            } else {
                console.error(`❌ No se encontró el elemento ${elementId}`);
            }
        }

        // Botones de navegación
        addSafeEventListener('btn-jugar', 'click', () => {
            console.log('Botón Jugar clickeado');
            playSFX('click');
            playBackgroundMusicIfAllowed();
            showScreen('categorias-screen');
        });
        addSafeEventListener('btn-login', 'click', () => {
            console.log('Botón Login clickeado');
            playSFX('click');
            playBackgroundMusicIfAllowed();
            showScreen('login-screen');
        });
        // Acceso al Admin: solo por icono secreto en footer o atajo Ctrl+Shift+Alt+A (invisible para Estudiante/Profesor)
        const footerAdminSecret = document.getElementById('footer-admin-secret');
        if (footerAdminSecret) {
            footerAdminSecret.addEventListener('click', (e) => { e.preventDefault(); showScreen('admin-screen'); });
        }
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.altKey && e.key === 'A') {
                e.preventDefault();
                showScreen('admin-screen');
            }
        });
        addSafeEventListener('btn-ranking', 'click', () => {
            console.log('Botón Ranking clickeado');
            playSFX('click');
            playBackgroundMusicIfAllowed();
            showScreen('ranking-screen');
        });
        addSafeEventListener('btn-login-nav', 'click', () => {
            playSFX('click');
            playBackgroundMusicIfAllowed();
            showScreen('login-screen');
        });
        addSafeEventListener('btn-music-toggle', 'click', () => {
            toggleBackgroundMusic();
        });
        setupNavbarUserDropdown();
        addSafeEventListener('btn-mis-resultados-nav', 'click', () => { showScreen('mis-resultados-screen'); loadMisResultadosScreen(); });
        addSafeEventListener('btn-ranking-nav', 'click', () => { showScreen('ranking-screen'); if (typeof showRanking === 'function') showRanking(); });
        addSafeEventListener('btn-back-inicio-mis-resultados', 'click', () => showScreen('inicio-screen'));
        addSafeEventListener('btn-back-inicio-biblioteca', 'click', () => showScreen('inicio-screen'));
        addSafeEventListener('btn-back-inicio-progresos', 'click', () => showScreen('inicio-screen'));
        const navbarLogo = document.getElementById('navbar-logo');
        if (navbarLogo) navbarLogo.addEventListener('click', (e) => { e.preventDefault(); showScreen('inicio-screen'); });
        addSafeEventListener('btn-join-by-code', 'click', handleJoinByCode);
        const accessCodeInput = document.getElementById('access-code-input');
        if (accessCodeInput) {
            accessCodeInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleJoinByCode(); });
            accessCodeInput.addEventListener('input', () => { accessCodeInput.value = accessCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
        }

        // Botones de autenticación
        addSafeEventListener('btn-auth', 'click', handleAuth);
        addSafeEventListener('btn-toggle-auth', 'click', toggleAuthMode);
        addSafeEventListener('btn-forgot-password', 'click', openForgotPasswordModal);
        addSafeEventListener('btn-back-inicio', 'click', () => {
            abandonGuestGameFromAuth();
            showScreen('inicio-screen');
        });
        initRoleSegmentControl();
        initGenderSegmentControl();

        // Botones de admin
        addSafeEventListener('btn-admin-login', 'click', handleAdminLogin);
        addSafeEventListener('btn-back-inicio-admin', 'click', () => showScreen('inicio-screen'));

        // Botones de categorías
        addSafeEventListener('btn-back-inicio-cat', 'click', () => showScreen('inicio-screen'));
        addSafeEventListener('btn-back-inicio-result', 'click', () => showScreen('inicio-screen'));
        addSafeEventListener('btn-back-categorias-result', 'click', () => showScreen('categorias-screen'));
        addSafeEventListener('btn-back-inicio-ranking', 'click', () => showScreen('inicio-screen'));
        addSafeEventListener('btn-back-categorias', 'click', () => showScreen('categorias-screen'));

        // Botones de logout admin
        addSafeEventListener('btn-logout-admin', 'click', logoutAdmin);

        // Botones de juego
        addSafeEventListener('btn-play-again', 'click', () => {
            if (currentGame && currentGame.category && currentGame.subcategory) {
                startGame(currentGame.category, currentGame.subcategory);
            } else if (window._lastGameReplay && window._lastGameReplay.category && window._lastGameReplay.subcategory) {
                startGame(window._lastGameReplay.category, window._lastGameReplay.subcategory);
            } else {
                showNotification('Selecciona una categoría para jugar de nuevo.', 'info');
                showScreen('categorias-screen');
            }
        });

        // Tema
        addSafeEventListener('theme-toggle', 'click', toggleTheme);
        addSafeEventListener('btn-sidebar-toggle', 'click', () => document.body.classList.add('sidebar-open'));
        addSafeEventListener('btn-sidebar-close', 'click', () => document.body.classList.remove('sidebar-open'));
        addSafeEventListener('sidebar-btn-avatar', 'click', openAvatarModal);
        addSafeEventListener('sidebar-btn-theme', 'click', toggleTheme);
        addSafeEventListener('sidebar-btn-prof-switch', 'click', toggleProfessorStudentMode);

        document.querySelectorAll('#app-sidebar .sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                const profTab = item.getAttribute('data-prof-tab');
                if (profTab) {
                    if (ensureProfesorManagementMode()) {
                        showScreen('profesor-panel');
                        loadProfesorPanel();
                        switchProfesorTab(profTab);
                    }
                    document.body.classList.remove('sidebar-open');
                    return;
                }

                const target = item.getAttribute('data-target');
                const route = item.getAttribute('data-route');
                if (target === 'ajustes') {
                    openAvatarModal();
                } else if (target === 'biblioteca-screen') {
                    navigateToAppRoute(route || '/biblioteca', 'biblioteca-screen');
                    showScreen('biblioteca-screen');
                } else if (target === 'progresos-screen') {
                    navigateToAppRoute(route || '/progresos', 'progresos-screen');
                    showScreen('progresos-screen');
                } else if (target === 'ranking-screen') {
                    showScreen('ranking-screen');
                    if (typeof showRanking === 'function') showRanking();
                } else if (target) {
                    if (window.location.pathname === '/biblioteca' || window.location.pathname === '/progresos') {
                        navigateToAppRoute('/', target);
                    }
                    showScreen(target);
                }
                document.body.classList.remove('sidebar-open');
            });
        });

        const sidebar = document.getElementById('app-sidebar');
        if (sidebar) {
            sidebar.addEventListener('mouseenter', () => {
                if (window.innerWidth > 1024) document.body.classList.add('sidebar-expanded');
            });
            sidebar.addEventListener('mouseleave', () => {
                if (window.innerWidth > 1024) document.body.classList.remove('sidebar-expanded');
            });
        }

        window.addEventListener('popstate', () => {
            if (window.location.pathname === '/biblioteca') showScreen('biblioteca-screen');
            else if (window.location.pathname === '/progresos') showScreen('progresos-screen');
            else showScreen('inicio-screen');
        });

        // Selector de modo de juego
        const modeCards = document.querySelectorAll('.mode-card');
        if (modeCards && modeCards.length) {
            modeCards.forEach(card => {
                card.addEventListener('click', () => {
                    const mode = card.getAttribute('data-mode') || 'clasico';
                    setGameMode(mode);
                });
            });
        }

        // Pestañas del admin
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.getAttribute('data-tab');
                switchTab(tabName);
            });
        });

        // Sidebar Admin (reemplaza menús horizontales)
        const adminSidebar = document.getElementById('admin-sidebar');
        if (adminSidebar) {
            adminSidebar.querySelectorAll('[data-admin-tab]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tabName = btn.getAttribute('data-admin-tab');
                    adminSidebar.querySelectorAll('.admin-sidebar-item').forEach(i => i.classList.remove('admin-sidebar-item-active'));
                    btn.classList.add('admin-sidebar-item-active');
                    if (tabName) switchTab(tabName);
                });
            });
            const exportBtn = document.getElementById('btn-export-tesis');
            if (exportBtn) exportBtn.addEventListener('click', exportThesisExcel);
        }

        // Botones de admin panel
        addSafeEventListener('btn-add-question', 'click', openAddQuestionModal);
        addSafeEventListener('btn-add-category', 'click', () => {
            showNotification('Función de agregar categoría próximamente', 'info');
        });

        // Búsqueda y filtros del admin
        const searchQuestionsAdmin = document.getElementById('search-questions-admin');
        if (searchQuestionsAdmin) {
            searchQuestionsAdmin.addEventListener('input', filterAdminQuestions);
        }

        const filterDifficultyAdmin = document.getElementById('filter-difficulty-admin');
        if (filterDifficultyAdmin) {
            filterDifficultyAdmin.addEventListener('change', filterAdminQuestions);
        }

        const filterCategoryAdmin = document.getElementById('filter-category-admin');
        if (filterCategoryAdmin) {
            // Llenar opciones de categorías
            categories.forEach(cat => {
                cat.subcategories.forEach(sub => {
                    const option = document.createElement('option');
                    option.value = sub.id;
                    option.textContent = `${cat.name} - ${sub.name}`;
                    filterCategoryAdmin.appendChild(option);
                });
            });
            filterCategoryAdmin.addEventListener('change', filterAdminQuestions);
        }

        const filterAccuracyAdmin = document.getElementById('filter-accuracy-admin');
        if (filterAccuracyAdmin) filterAccuracyAdmin.addEventListener('change', filterAdminQuestions);

        const adminCategoriesSearch = document.getElementById('admin-categories-search');
        if (adminCategoriesSearch) adminCategoriesSearch.addEventListener('input', filterAdminCategoriesTable);

        // Búsqueda y filtros de usuarios (tabla)
        const adminUsersSearch = document.getElementById('admin-users-search');
        const adminUsersGender = document.getElementById('admin-users-gender-filter');
        const adminUsersAcc = document.getElementById('admin-users-accuracy-filter');
        const adminUsersReg = document.getElementById('admin-users-reg-filter');
        const adminUsersTime = document.getElementById('admin-users-time-filter');
        if (adminUsersSearch) adminUsersSearch.addEventListener('input', filterAdminUsersTable);
        if (adminUsersGender) adminUsersGender.addEventListener('change', filterAdminUsersTable);
        if (adminUsersAcc) adminUsersAcc.addEventListener('change', filterAdminUsersTable);
        if (adminUsersReg) adminUsersReg.addEventListener('change', filterAdminUsersTable);
        if (adminUsersTime) adminUsersTime.addEventListener('change', filterAdminUsersTable);

        // Cerrar modal
        const modalCloseBtn = document.querySelector('.modal-close');
        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', closeModal);
        }

        const modalOverlayEl = document.getElementById('modal-overlay');
        if (modalOverlayEl) {
            modalOverlayEl.addEventListener('click', (e) => {
                if (e.target === modalOverlayEl) {
                    closeModal();
                }
            });
        }

        console.log('✅ Event listeners configurados exitosamente');
    } catch (error) {
        console.error('Error al configurar event listeners:', error);
        showNotification('Error al inicializar la aplicación', 'error');
    }
}

// Persistir sesión en sessionStorage (solo id y tipo para restaurar al recargar)
function persistSession() {
    try {
        if (currentUser && currentUserType) {
            sessionStorage.setItem('linguizate_session', JSON.stringify({
                userId: currentUser.id,
                userType: currentUserType
            }));
        }
    } catch (e) { console.warn('persistSession', e); }
}

// Limpiar por completo la sesión (logout)
function clearSession() {
    currentUser = null;
    currentUserType = null;
    currentProfesor = null;
    isAdmin = false;
    try {
        sessionStorage.removeItem('linguizate_session');
    } catch (e) { }
    updateNavbarUser();
}

function cleanupGameStateForLogout() {
    if (currentGame && currentGame.timer) {
        clearInterval(currentGame.timer);
        currentGame.timer = null;
    }
    stopSfxByType('timer_low');
    audioPausedForReading = false;
    stopAllSounds();
    closeAnyAudioContext();
    gameFrozenForAuth = false;
    currentGame = null;
    try { window._lastGameReplay = null; } catch (e) { }

    document.querySelectorAll('.explanation-modal, .ai-chat-overlay, .notification').forEach(function (el) {
        el.remove();
    });
    document.querySelectorAll('#options-container .option-btn').forEach(function (btn) {
        btn.classList.remove('answer-correct', 'answer-incorrect');
    });
}

// Restaurar sesión desde sessionStorage (al recargar la página)
async function restoreSessionFromStorage() {
    try {
        const data = await LinguizateAPI.get('/auth/session');
        const user = data.user;
        if (!user) return;
        currentUser = user;
        currentUserType = user.role;
        if (user.isProfesor) {
            currentProfesor = user;
            await refreshProfessorData();
        } else if (user.isEstudiante) {
            const historyData = await LinguizateAPI.get('/users/me/games');
            user.gameHistory = historyData.games || [];
        }
        const index = users.findIndex(u => u.id === user.id);
        if (index >= 0) users[index] = user; else users.push(user);
        persistSession();
        await syncPendingGames();
    } catch (e) {
        sessionStorage.removeItem('linguizate_session');
    }
}

// Actualizar Navbar: mostrar nombre + indicador "En línea" si hay usuario logeado
function updateNavbarUser() {
    const wrap = document.getElementById('navbar-user-wrap');
    const loginBtn = document.getElementById('btn-login-nav');
    const userNameEl = document.getElementById('navbar-user-name');
    const dropdown = document.getElementById('navbar-user-dropdown');
    if (dropdown) dropdown.hidden = true;
    if (wrap) wrap.classList.remove('navbar-user-dropdown-open');
    if (wrap) {
        if (currentUser && currentUserType && currentUserType !== 'admin') {
            wrap.style.display = 'flex';
            if (userNameEl) userNameEl.textContent = currentUser.name;
            if (loginBtn) loginBtn.style.display = 'none';
            var avatarEl = document.getElementById('navbar-user-avatar');
            var dotEl = wrap.querySelector('.navbar-user-dot');
            if (avatarEl) {
                avatarEl.src = getAvatarUrl(currentUser);
                avatarEl.alt = currentUser.name;
                avatarEl.hidden = false;
                avatarEl.onerror = function () {
                    avatarEl.hidden = true;
                    avatarEl.src = '';
                    if (dotEl) dotEl.style.display = '';
                };
            }
            if (dotEl) dotEl.style.display = (avatarEl && !avatarEl.hidden) ? 'none' : '';
        } else {
            wrap.style.display = 'none';
            if (loginBtn) loginBtn.style.display = 'inline-flex';
        }
    }
    var joinCodeSection = document.getElementById('join-by-code-section');
    if (joinCodeSection) {
        joinCodeSection.style.display = (currentUser && currentUserType === 'estudiante') ? 'block' : 'none';
    }
    var footerAdminSecret = document.getElementById('footer-admin-secret');
    if (footerAdminSecret) {
        footerAdminSecret.style.display = (currentUserType === 'estudiante') ? 'none' : 'inline-flex';
    }
    var navMisResultados = document.getElementById('btn-mis-resultados-nav');
    if (navMisResultados) {
        navMisResultados.style.display = (currentUser && currentUserType === 'estudiante') ? 'inline-flex' : 'none';
    }
    updateSidebarUI();
}

function getRankProgress(score) {
    var s = Number(score) || 0;
    var ranges = [
        { min: 0, max: 1500 },
        { min: 1501, max: 5000 },
        { min: 5001, max: 15000 },
        { min: 15001, max: 30000 }
    ];
    var current = ranges[ranges.length - 1];
    for (var i = 0; i < ranges.length; i++) {
        if (s >= ranges[i].min && s <= ranges[i].max) {
            current = ranges[i];
            break;
        }
    }
    var span = Math.max(1, current.max - current.min);
    var pct = Math.min(100, Math.max(0, ((s - current.min) / span) * 100));
    return { percent: pct, min: current.min, max: current.max };
}

function updateSidebarLibrary() {
    var list = document.getElementById('sidebar-library-list');
    if (!list) return;
    list.innerHTML = '';
    var history = (currentUser && currentUser.gameHistory) ? currentUser.gameHistory : [];
    if (!history.length) {
        list.innerHTML = '<p class="sidebar-xp-text">Aún no hay categorías completadas.</p>';
        return;
    }
    var bestByCategory = {};
    history.forEach(function (h) {
        var cat = h.categoryName || '-';
        bestByCategory[cat] = Math.max(bestByCategory[cat] || 0, h.score || 0);
    });
    Object.keys(bestByCategory).slice(0, 6).forEach(function (cat) {
        var row = document.createElement('div');
        row.className = 'library-item';
        row.innerHTML = '<span>' + escapeHtml(cat) + ' <strong>(' + bestByCategory[cat] + ')</strong></span>' +
            '<button type="button" class="btn-secondary btn-small sidebar-retry-btn">Reintentar</button>';
        row.querySelector('.sidebar-retry-btn').addEventListener('click', function () {
            showScreen('categorias-screen');
            showNotification('Selecciona la categoría para reintentar.', 'info');
        });
        list.appendChild(row);
    });
}

function updateSidebarProgress() {
    var rankTextEl = document.getElementById('sidebar-rank-text');
    var xpFillEl = document.getElementById('sidebar-xp-fill');
    var xpTextEl = document.getElementById('sidebar-xp-text');
    if (!rankTextEl || !xpFillEl || !xpTextEl) return;
    var score = currentUser ? (currentUser.score || 0) : 0;
    var rank = getLinguisticRank(score, currentUser ? currentUser.id : 0, currentUser ? currentUser.gender : 'neutro');
    var progress = getRankProgress(score);
    rankTextEl.textContent = 'Rango actual: ' + rank;
    xpFillEl.style.width = progress.percent.toFixed(1) + '%';
    xpTextEl.textContent = 'XP: ' + score + ' (' + progress.min + ' - ' + progress.max + ')';
}

function navigateToAppRoute(route, screenId) {
    try {
        if (route && window.location.pathname !== route) {
            window.history.pushState({ screenId: screenId || null }, '', route);
        }
    } catch (e) { }
}

function loadBibliotecaScreen() {
    var tbody = document.getElementById('biblioteca-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    var history = (currentUser && currentUser.gameHistory) ? currentUser.gameHistory.slice() : [];
    if (!history.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-message">Aún no tienes categorías completadas.</td></tr>';
        return;
    }
    history.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    history.forEach(function (h) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + escapeHtml(h.categoryName || '-') + '</td>' +
            '<td>' + formatStatsDate(h.date) + '</td>' +
            '<td>' + (h.score || 0) + ' pts</td>' +
            '<td><button type="button" class="btn-secondary btn-small biblioteca-retry-btn">Volver a jugar</button></td>';
        tr.querySelector('.biblioteca-retry-btn').addEventListener('click', function () {
            showScreen('categorias-screen');
            showNotification('Selecciona la categoría para reforzarla.', 'info');
        });
        tbody.appendChild(tr);
    });
}

/** Radar simplificado (5 ramas) para pantalla de resultados */
function getBranchScoresFromHistory(history) {
    var labels = ['Fonética', 'Morfología', 'Sintaxis', 'Semántica', 'Pragmática'];
    var branchScores = {};
    labels.forEach(function (l) { branchScores[l] = 28; });
    (history || []).forEach(function (h) {
        var cat = (h.categoryName || '').toLowerCase();
        var value = Math.max(15, Math.min(100, Math.round((h.score || 0) / 15)));
        if (cat.includes('fon')) branchScores['Fonética'] = Math.max(branchScores['Fonética'], value);
        if (cat.includes('morf')) branchScores['Morfología'] = Math.max(branchScores['Morfología'], value);
        if (cat.includes('sint')) branchScores['Sintaxis'] = Math.max(branchScores['Sintaxis'], value);
        if (cat.includes('prag')) branchScores['Pragmática'] = Math.max(branchScores['Pragmática'], value);
        else if (cat.includes('sem')) branchScores['Semántica'] = Math.max(branchScores['Semántica'], value);
    });
    return branchScores;
}

function drawResultsRadarMini(branchScores) {
    var svg = document.getElementById('results-radar-svg');
    if (!svg) return;
    var labels = ['Fonética', 'Morfología', 'Sintaxis', 'Semántica', 'Pragmática'];
    var isDark = document.body.getAttribute('data-theme') === 'dark';
    var gridStroke = isDark ? 'rgba(226, 232, 240, 0.12)' : 'rgba(148,163,184,0.3)';
    var axisStroke = isDark ? 'rgba(226, 232, 240, 0.15)' : 'rgba(148,163,184,0.4)';
    var labelFill = isDark ? '#94A3B8' : '#64748b';
    var cx = 100;
    var cy = 100;
    var r = 72;
    var steps = [0.25, 0.5, 0.75, 1];
    function pt(i, radiusScale) {
        var ang = (-Math.PI / 2) + (i * (2 * Math.PI / labels.length));
        return { x: cx + Math.cos(ang) * r * radiusScale, y: cy + Math.sin(ang) * r * radiusScale };
    }
    var html = '';
    steps.forEach(function (s) {
        var points = labels.map(function (_, i) { var p = pt(i, s); return p.x + ',' + p.y; }).join(' ');
        html += '<polygon points="' + points + '" fill="none" stroke="' + gridStroke + '" stroke-width="1"></polygon>';
    });
    labels.forEach(function (label, i) {
        var p1 = pt(i, 0);
        var p2 = pt(i, 1.02);
        var tx = pt(i, 1.15);
        html += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="' + axisStroke + '" stroke-width="1"></line>';
        html += '<text x="' + tx.x + '" y="' + tx.y + '" text-anchor="middle" font-size="9" fill="' + labelFill + '">' + label + '</text>';
    });
    var dataPoints = labels.map(function (label, i) {
        var score = Math.max(0, Math.min(100, branchScores[label] || 0));
        var p = pt(i, score / 100);
        return p.x + ',' + p.y;
    }).join(' ');
    var fillPoly = isDark ? 'rgba(124, 58, 237, 0.35)' : 'rgba(124,58,237,0.22)';
    html += '<g class="results-radar-polygon-group">';
    html += '<polygon class="results-radar-area" points="' + dataPoints + '" fill="' + fillPoly + '" stroke="#c4b5fd" stroke-width="2"></polygon>';
    html += '</g>';
    svg.innerHTML = html;
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            var g = svg.querySelector('.results-radar-polygon-group');
            if (g) g.classList.add('results-radar-animate');
        });
    });
}

function drawRadarProgress(branchScores) {
    var svg = document.getElementById('progress-radar-svg');
    if (!svg) return;
    var isDark = document.body.getAttribute('data-theme') === 'dark';
    var gridStroke = isDark ? 'rgba(226, 232, 240, 0.1)' : 'rgba(148,163,184,0.25)';
    var axisStroke = isDark ? 'rgba(226, 232, 240, 0.12)' : 'rgba(148,163,184,0.35)';
    var labelFill = isDark ? '#E2E8F0' : 'currentColor';
    var areaFill = isDark ? 'rgba(124, 58, 237, 0.42)' : 'rgba(124,58,237,0.28)';
    var labels = ['Fonética', 'Morfología', 'Sintaxis', 'Semántica', 'Pragmática', 'Dialectología', 'Gramática Histórica'];
    var cx = 160, cy = 160, r = 110;
    var steps = [0.25, 0.5, 0.75, 1];
    function pt(i, radiusScale) {
        var ang = (-Math.PI / 2) + (i * (2 * Math.PI / labels.length));
        return { x: cx + Math.cos(ang) * r * radiusScale, y: cy + Math.sin(ang) * r * radiusScale };
    }
    var html = '';
    steps.forEach(function (s) {
        var points = labels.map(function (_, i) { var p = pt(i, s); return p.x + ',' + p.y; }).join(' ');
        html += '<polygon points="' + points + '" fill="none" stroke="' + gridStroke + '" stroke-width="1"></polygon>';
    });
    labels.forEach(function (label, i) {
        var p1 = pt(i, 0), p2 = pt(i, 1.02), tx = pt(i, 1.18);
        html += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="' + axisStroke + '" stroke-width="1"></line>';
        html += '<text x="' + tx.x + '" y="' + tx.y + '" text-anchor="middle" font-size="11" fill="' + labelFill + '">' + label + '</text>';
    });
    var dataPoints = labels.map(function (label, i) {
        var score = Math.max(0, Math.min(100, branchScores[label] || 0));
        var p = pt(i, score / 100);
        return p.x + ',' + p.y;
    }).join(' ');
    html += '<polygon points="' + dataPoints + '" fill="' + areaFill + '" stroke="#7c3aed" stroke-width="2"></polygon>';
    svg.innerHTML = html;
}

function loadProgresosScreen() {
    if (!currentUser) return;
    var score = currentUser.score || 0;
    var rank = getLinguisticRank(score, currentUser.id, currentUser.gender || 'neutro');
    var progress = getRankProgress(score);
    var history = currentUser.gameHistory || [];
    var rankTitle = document.getElementById('progress-rank-title');
    var rankScore = document.getElementById('progress-rank-score');
    var xpFill = document.getElementById('progress-xp-fill');
    var xpText = document.getElementById('progress-xp-text');
    if (rankTitle) rankTitle.textContent = rank;
    if (rankScore) rankScore.textContent = score + ' XP acumulados';
    if (xpFill) xpFill.style.width = progress.percent.toFixed(1) + '%';
    if (xpText) xpText.textContent = 'Progreso al siguiente tramo: ' + progress.percent.toFixed(1) + '%';

    var branchScores = {
        'Fonética': 35, 'Morfología': 35, 'Sintaxis': 35, 'Semántica': 35, 'Pragmática': 35, 'Dialectología': 35, 'Gramática Histórica': 35
    };
    history.forEach(function (h) {
        var cat = (h.categoryName || '').toLowerCase();
        var value = Math.max(15, Math.min(100, Math.round((h.score || 0) / 15)));
        if (cat.includes('fon')) branchScores['Fonética'] = Math.max(branchScores['Fonética'], value);
        if (cat.includes('morf')) branchScores['Morfología'] = Math.max(branchScores['Morfología'], value);
        if (cat.includes('sint')) branchScores['Sintaxis'] = Math.max(branchScores['Sintaxis'], value);
        if (cat.includes('sem')) branchScores['Semántica'] = Math.max(branchScores['Semántica'], value);
        if (cat.includes('prag')) branchScores['Pragmática'] = Math.max(branchScores['Pragmática'], value);
        if (cat.includes('dial')) branchScores['Dialectología'] = Math.max(branchScores['Dialectología'], value);
        if (cat.includes('hist')) branchScores['Gramática Histórica'] = Math.max(branchScores['Gramática Histórica'], value);
    });
    drawRadarProgress(branchScores);

    var totalQuestions = history.reduce(function (acc, h) { return acc + (h.totalQuestions || 10); }, 0);
    var totalCorrect = history.reduce(function (acc, h) { return acc + (h.correctAnswers || Math.round((h.score || 0) / 100)); }, 0);
    var accuracy = totalQuestions > 0 ? ((totalCorrect / totalQuestions) * 100) : 0;
    var bestStreak = Math.max(0, history.reduce(function (acc, h) { return Math.max(acc, h.bestStreak || 0); }, 0));
    var qEl = document.getElementById('progress-total-questions');
    var aEl = document.getElementById('progress-accuracy');
    var sEl = document.getElementById('progress-best-streak');
    if (qEl) qEl.textContent = String(totalQuestions);
    if (aEl) aEl.textContent = accuracy.toFixed(1) + '%';
    if (sEl) sEl.textContent = String(bestStreak);

    var medalsGrid = document.getElementById('progress-medals-grid');
    if (medalsGrid) {
        var userAchievements = (currentUser.achievements || []).slice();
        var medals = [
            { id: 'perfecto', label: 'Perfección', icon: 'fa-gem', unlock: function () { return userAchievements.includes('¡Perfecto!'); }, tooltip: 'Desbloqueada al responder perfecto (todas correctas) en una partida.' },
            { id: 'alta', label: 'Puntuación Alta', icon: 'fa-star', unlock: function () { return userAchievements.includes('¡Puntuación alta!'); }, tooltip: 'Desbloqueada al alcanzar una puntuación >= 1000 en una partida.' },
            { id: 'rae', label: 'Hijo Predilecto RAE', icon: 'fa-crown', unlock: function () { return userAchievements.includes('Hijo Predilecto de la RAE'); }, tooltip: 'Desbloqueada si consigues puntaje perfecto en una categoría del profesor.' },
            { id: 'racha', label: 'Racha 5+', icon: 'fa-fire', unlock: function () { return bestStreak >= 5; }, tooltip: 'Desbloqueada al acumular una racha de 5+ aciertos seguidos.' },
            { id: 'veterano', label: 'Veterano', icon: 'fa-medal', unlock: function () { return (currentUser.gamesPlayed || 0) >= 10; }, tooltip: 'Desbloqueada al jugar 10+ partidas.' },
            { id: 'consistente', label: 'Consistencia', icon: 'fa-check-circle', unlock: function () { return accuracy >= 70; }, tooltip: 'Desbloqueada al mantener una precisión >= 70% en tu historial.' },
            { id: 'semantico', label: 'Dominio Semántico', icon: 'fa-brain', unlock: function () { return branchScores['Semántica'] >= 75; }, tooltip: 'Desbloqueada al expandir tu dominio en Semántica (>= 75).' },
            { id: 'fonetico', label: 'Dominio Fonético', icon: 'fa-wave-square', unlock: function () { return branchScores['Fonética'] >= 75; }, tooltip: 'Desbloqueada al expandir tu dominio en Fonética (>= 75).' }
        ];
        medalsGrid.innerHTML = medals.map(function (m) {
            var unlocked = !!m.unlock();
            var tooltip = m.tooltip ? escapeHtml(m.tooltip) : '';
            return '<div class="medal-item ' + (unlocked ? 'unlocked' : 'locked') + '">' +
                '<div class="medal-icon-wrap"><i class="fas ' + m.icon + '"></i>' + (unlocked ? '' : '<span class="medal-lock"><i class="fas fa-lock"></i></span>') + '</div>' +
                '<span class="medal-label">' + escapeHtml(m.label) + '</span>' +
                (tooltip ? '<div class="medal-tooltip" role="tooltip">' + tooltip + '</div>' : '') +
                '</div>';
        }).join('');
    }
}

function updateSidebarUI() {
    var sidebar = document.getElementById('app-sidebar');
    var toggleBtn = document.getElementById('btn-sidebar-toggle');
    var isLoggedIn = !!(currentUser && currentUserType && currentUserType !== 'admin');
    if (sidebar) sidebar.style.display = isLoggedIn ? 'block' : 'none';
    if (toggleBtn) toggleBtn.style.display = isLoggedIn ? '' : 'none';
    document.body.classList.toggle('has-sidebar', isLoggedIn);
    if (!isLoggedIn) {
        document.body.classList.remove('sidebar-open');
        document.body.classList.remove('sidebar-expanded');
    }
    if (!isLoggedIn) return;

    var isProfessorAccount = !!(currentUser && currentUser.isProfesor);
    var docSection = document.getElementById('sidebar-doc-section');
    if (docSection) docSection.style.display = isProfessorAccount ? 'block' : 'none';

    // Sidebar simplificada para profesores: sólo "Gestión Docente" arriba
    var academicHeader = document.getElementById('sidebar-academic-header');
    var academicNav = document.getElementById('sidebar-academic-nav');
    var academicDivider = document.getElementById('sidebar-academic-divider');
    if (academicHeader) academicHeader.style.display = isProfessorAccount ? 'none' : '';
    if (academicNav) academicNav.style.display = isProfessorAccount ? 'none' : '';
    if (academicDivider) academicDivider.style.display = isProfessorAccount ? 'none' : '';

    var profSwitchBtn = document.getElementById('sidebar-btn-prof-switch');
    if (profSwitchBtn) {
        profSwitchBtn.style.display = isProfessorAccount ? 'inline-flex' : 'none';
        var span = profSwitchBtn.querySelector('span');
        if (span) {
            if (currentUserType === 'estudiante') span.textContent = 'Volver a Gestión Docente';
            else span.textContent = 'Modo Estudiante';
        }
    }
}

function ensureProfesorManagementMode() {
    if (!currentUser || !currentUser.isProfesor) return false;
    if (currentUserType === 'profesor') return true;
    currentUserType = 'profesor';
    currentProfesor = currentUser;
    persistSession();
    updateNavbarUser();
    updateSidebarUI();
    return true;
}

function toggleProfessorStudentMode() {
    if (!currentUser || !currentUser.isProfesor) return;
    if (currentUserType === 'profesor') {
        currentUserType = 'estudiante';
        persistSession();
        updateNavbarUser();
        updateSidebarUI();
        showScreen('categorias-screen');
    } else {
        currentUserType = 'profesor';
        currentProfesor = currentUser;
        persistSession();
        updateNavbarUser();
        updateSidebarUI();
        loadProfesorPanel();
        showScreen('profesor-panel');
        switchProfesorTab('estadisticas-profesor');
    }
}

function setupNavbarUserDropdown() {
    const wrap = document.getElementById('navbar-user-wrap');
    const trigger = document.getElementById('navbar-user');
    const dropdown = document.getElementById('navbar-user-dropdown');
    const logoutBtn = document.getElementById('navbar-btn-logout');
    if (!trigger || !dropdown) return;
    function closeDropdown() {
        dropdown.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (wrap) wrap.classList.remove('navbar-user-dropdown-open');
    }
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !dropdown.hidden;
        if (isOpen) closeDropdown();
        else {
            dropdown.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
            if (wrap) wrap.classList.add('navbar-user-dropdown-open');
        }
    });
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            closeDropdown();
            cleanupGameStateForLogout();
            clearSession();
            showNotification('Sesión cerrada', 'success');
            showScreen('inicio-screen');
        });
    }
    var avatarBtn = document.getElementById('navbar-btn-avatar');
    if (avatarBtn) {
        avatarBtn.addEventListener('click', () => {
            closeDropdown();
            openAvatarModal();
        });
    }
    document.addEventListener('click', closeDropdown);
}

/** Muestra iconos contextual en la navbar (Inicio / volver categorías) */
function updateNavbarContextNav(screenId) {
    var homeBtn = document.getElementById('btn-back-inicio-cat');
    var catBtn = document.getElementById('btn-back-categorias');
    if (homeBtn) {
        homeBtn.style.display = screenId === 'categorias-screen' ? 'inline-flex' : 'none';
    }
    if (catBtn) {
        catBtn.style.display = screenId === 'subcategorias-screen' ? 'inline-flex' : 'none';
    }
}

// Mostrar pantalla
function showScreen(screenId) {
    try {
        // Detener juego si salimos de la pantalla de juego
        if (currentGame && screenId !== 'juego-screen' && screenId !== 'login-screen') {
            console.log('🛑 Saliendo del juego, deteniendo procesos...');
            if (currentGame.timer) {
                clearInterval(currentGame.timer);
                currentGame.timer = null;
            }
            stopSfxByType('timer_low');
            currentGame = null; // Limpiar estado del juego activo
        }

        document.body.classList.remove('sidebar-open');
        const prevActiveScreen = document.querySelector('.screen.active');
        const prevScreenId = prevActiveScreen ? prevActiveScreen.id : null;
        if (screenId === 'login-screen' && !currentUser && currentGame && prevScreenId === 'juego-screen') {
            freezeGuestGameForAuth();
        }

        if (screenId === 'profesor-panel' && currentUserType !== 'profesor') {
            showNotification('No tienes acceso a esta sección', 'warning');
            showScreen('inicio-screen');
            return false;
        }
        if (screenId === 'mis-resultados-screen' && (!currentUser || currentUserType !== 'estudiante')) {
            showScreen('inicio-screen');
            return false;
        }
        if ((screenId === 'biblioteca-screen' || screenId === 'progresos-screen') && (!currentUser || currentUserType !== 'estudiante')) {
            showScreen('inicio-screen');
            return false;
        }

        console.log(`🔄 Intentando mostrar pantalla: ${screenId}`);

        // Verificar que el elemento existe
        const targetScreen = document.getElementById(screenId);
        if (!targetScreen) {
            console.error(`❌ Error: No se encontró la pantalla ${screenId}`);
            showNotification('Error al cambiar de pantalla', 'error');
            return false;
        }

        console.log(`📊 Estado actual de las pantallas:`);
        document.querySelectorAll('.screen').forEach(screen => {
            console.log(`- ${screen.id}: ${screen.classList.contains('active') ? 'activa' : 'inactiva'}`);
        });

        // Ocultar todas las pantallas
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
            console.log(`🔴 Desactivando pantalla: ${screen.id}`);
        });

        // Mostrar la pantalla seleccionada
        targetScreen.classList.add('active');
        console.log(`✅ Pantalla ${screenId} activada`);

        // Verificar visibilidad
        const isVisible = window.getComputedStyle(targetScreen).display !== 'none';
        console.log(`👁️ Visibilidad de ${screenId}: ${isVisible ? 'visible' : 'oculta'}`);

        // Cargar contenido específico
        if (screenId === 'categorias-screen') {
            console.log('🎮 Cargando categorías...');
            // Asegurar que los datos estén cargados antes de mostrar categorías
            if (!categories || categories.length === 0) {
                console.log('🔄 Datos no cargados, recargando...');
                loadData().then(() => {
                    console.log('✅ Datos recargados, mostrando categorías...');
                    loadCategories();
                }).catch(error => {
                    console.error('❌ Error al recargar datos:', error);
                    showNotification('Error al cargar las categorías', 'error');
                });
            } else {
                loadCategories();
            }
        } else if (screenId === 'ranking-screen') {
            console.log('🏆 Cargando ranking...');
            showRanking();
        } else if (screenId === 'mis-resultados-screen') {
            loadMisResultadosScreen();
        } else if (screenId === 'biblioteca-screen') {
            loadBibliotecaScreen();
        } else if (screenId === 'progresos-screen') {
            loadProgresosScreen();
        }
        updateSidebarUI();
        updateNavbarContextNav(screenId);

        return true;
    } catch (error) {
        console.error('❌ Error al mostrar pantalla:', error);
        console.error('Stack trace:', error.stack);
        showNotification('Error al cambiar de pantalla', 'error');
        return false;
    }
}

// Función auxiliar para mostrar mensajes de error
function showErrorMessage(container, message) {
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error-message';
    errorMsg.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error al cargar categorías</h3>
        <p>${message}</p>
        <button onclick="location.reload()" class="btn-primary">
            <i class="fas fa-redo"></i>
            Recargar página
        </button>
    `;
    container.appendChild(errorMsg);
}

// Cargar categorías
function loadCategories() {
    console.log('🎯 Función loadCategories() ejecutándose...');
    console.log('📊 Estado actual de categorías:', {
        categories: categories,
        isArray: Array.isArray(categories),
        length: categories ? categories.length : 0
    });

    const grid = document.getElementById('categories-grid');
    if (!grid) {
        console.error('❌ No se encontró el elemento categories-grid');
        showNotification('Error: No se encontró el contenedor de categorías', 'error');
        return;
    }

    // Mostrar indicador de carga
    grid.innerHTML = `
        <div class="loading-indicator">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Cargando categorías...</p>
        </div>
    `;

    // Verificar si las categorías están disponibles
    if (!categories || !Array.isArray(categories)) {
        console.error('❌ Las categorías no están definidas correctamente');

        // Solo intentar recargar si no se está cargando ya
        if (!isLoadingData && dataLoadAttempts < MAX_LOAD_ATTEMPTS) {
            console.log('🔍 Intentando recargar datos...');
            loadData().then(() => {
                console.log('🔄 Datos recargados, intentando mostrar categorías nuevamente...');
                loadCategories();
            }).catch(error => {
                console.error('❌ Error al recargar datos:', error);
                showErrorMessage(grid, 'Las categorías no están definidas correctamente. Por favor, verifica que el servidor esté ejecutándose en http://localhost:8000');
            });
        } else {
            showErrorMessage(grid, 'Las categorías no están definidas correctamente. Por favor, verifica que el servidor esté ejecutándose en http://localhost:8000');
        }
        return;
    }

    if (categories.length === 0) {
        console.error('❌ No hay categorías disponibles');

        // Solo intentar recargar si no se está cargando ya
        if (!isLoadingData && dataLoadAttempts < MAX_LOAD_ATTEMPTS) {
            console.log('🔍 Intentando recargar datos...');
            loadData().then(() => {
                console.log('🔄 Datos recargados, intentando mostrar categorías nuevamente...');
                loadCategories();
            }).catch(error => {
                console.error('❌ Error al recargar datos:', error);
                showErrorMessage(grid, 'No hay categorías disponibles. Por favor, verifica que el servidor esté ejecutándose en http://localhost:8000');
            });
        } else {
            showErrorMessage(grid, 'No hay categorías disponibles. Por favor, verifica que el servidor esté ejecutándose en http://localhost:8000');
        }
        return;
    }

    // Limpiar el grid antes de cargar las categorías
    grid.innerHTML = '';

    // Agregar botón de selección aleatoria
    const randomBtn = document.createElement('div');
    randomBtn.className = 'random-category-btn';
    randomBtn.innerHTML = `
        <i class="fas fa-random"></i>
        <h3>Selección Aleatoria</h3>
        <p>¡Deja que la suerte decida tu categoría!</p>
    `;
    randomBtn.addEventListener('click', () => selectRandomCategory());
    grid.appendChild(randomBtn);

    // Obtener todas las categorías personales de profesores
    const personalCategories = [];
    users.forEach(user => {
        if (user.isProfesor && user.personalCategories && user.personalCategories.length > 0) {
            user.personalCategories.forEach(personalCat => {
                personalCategories.push({
                    ...personalCat,
                    isPersonal: true,
                    profesorName: user.name,
                    profesorId: user.id
                });
            });
        }
    });

    // Obtener todas las categorías personales de profesores
    const allPersonalCategories = [];
    users.forEach(user => {
        if (user.isProfesor && user.personalCategories && user.personalCategories.length > 0) {
            user.personalCategories.forEach(personalCat => {
                allPersonalCategories.push({
                    ...personalCat,
                    isPersonal: true,
                    profesorName: user.name,
                    profesorId: user.id
                });
            });
        }
    });

    console.log(`✅ Cargando ${categories.length} categorías del sistema`);
    if (allPersonalCategories.length > 0) {
        console.log(`✅ Cargando ${allPersonalCategories.length} categorías personales de profesores`);
    }

    // Cargar las categorías del sistema
    categories.forEach((category, index) => {
        if (!category || !category.name || !category.icon || !category.description) {
            console.error(`❌ Categoría ${index} mal formada:`, category);
            return;
        }

        console.log(`Categoría ${index + 1}: ${category.name} (${category.subcategories.length} subcategorías)`);
        const card = document.createElement('div');
        card.className = 'category-card';
        const color = getCategoryColor(category.id);
        const progress = getCategoryProgress(category.id);
        card.setAttribute('data-color', color);
        card.style.setProperty('--category-color', color);
        card.innerHTML = `
            <div class="category-card-inner">
                <i class="${category.icon}"></i>
                <h3>${category.name}</h3>
                <div class="category-stats-mini">
                    <span>${category.subcategories.length} temas</span>
                </div>
                <div class="category-progress-mini">
                    <div class="progress-bar-inner" style="width:${progress}%"></div>
                </div>
            </div>
        `;
        card.addEventListener('click', () => showSubcategories(category));
        grid.appendChild(card);
    });

    // Las categorías de profesores son PRIVADAS: no se muestran en la pantalla general.
    // Solo se accede mediante "Unirse con código" en el Home.

    // Mostrar información del usuario si está logueado
    if (currentUser) {
        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('user-name').textContent = currentUser.name;
        document.getElementById('user-score').textContent = `${currentUser.score} puntos`;
    } else {
        document.getElementById('user-info').style.display = 'none';
    }
}

/**
 * Unirse a una categoría de profesor mediante código de 6 caracteres.
 * Muestra la pantalla de subcategorías (una sola tarjeta) para esa categoría.
 */
async function handleJoinByCode() {
    {
        if (!currentUser || currentUserType !== 'estudiante') {
            showNotification('Debes iniciar sesión como estudiante para usar un código de clase.', 'warning');
            return;
        }
        const inputApi = document.getElementById('access-code-input');
        const msgApi = document.getElementById('join-code-message');
        try {
            const data = await LinguizateAPI.post('/classes/join', { accessCode: inputApi?.value || '' });
            const cat = data.category;
            const sub = cat.subcategories[0];
            sub.questions = cat.questions || sub.questions || [];
            sub.profesorId = cat.profesorId;
            cat.profesorId = cat.profesorId;
            if (inputApi) inputApi.value = '';
            startGame(cat, sub);
        } catch (error) {
            if (msgApi) {
                msgApi.textContent = error.message;
                msgApi.className = 'join-code-message error';
            }
        }
        return;
    }
    if (!currentUser || currentUserType !== 'estudiante') {
        showNotification('Debes iniciar sesión como estudiante para usar un código de clase.', 'warning');
        return;
    }
    const input = document.getElementById('access-code-input');
    const msgEl = document.getElementById('join-code-message');
    const code = input ? input.value.trim() : '';
    if (!msgEl) return;
    msgEl.textContent = '';
    msgEl.className = 'join-code-message';
    if (!code) {
        msgEl.textContent = 'Escribe el código de 6 caracteres que te dio tu profesor.';
        msgEl.classList.add('error');
        return;
    }
    const found = findCategoryByAccessCode(code);
    if (!found) {
        msgEl.textContent = 'Código no válido. Verifica e intenta de nuevo.';
        msgEl.classList.add('error');
        return;
    }
    const { category: cat, ownerUser } = found;
    const totalQuestions = cat.questions ? cat.questions.length : 0;
    const tempCategory = {
        id: cat.id,
        name: cat.name,
        icon: cat.icon || 'fas fa-book',
        description: cat.description || '',
        profesorId: ownerUser.id,
        subcategories: [{
            id: cat.id,
            name: cat.name,
            icon: cat.icon || 'fas fa-book',
            description: cat.description || '',
            questionCount: totalQuestions,
            isPersonal: true,
            questions: cat.questions || [],
            profesorId: ownerUser.id
        }]
    };
    msgEl.textContent = '¡Código correcto! Iniciando juego...';
    msgEl.classList.add('success');
    if (input) input.value = '';
    // Lanzar juego directamente sin pasar por selección de categorías
    const subcategory = tempCategory.subcategories[0];
    if (subcategory && subcategory.questions && subcategory.questions.length > 0) {
        startGame(tempCategory, subcategory);
    } else {
        msgEl.textContent = 'Esta categoría no tiene preguntas todavía.';
        msgEl.classList.remove('success');
        msgEl.classList.add('error');
    }
}

/**
 * Selección aleatoria tipo ruleta: sin modal.
 * Las tarjetas de categoría se iluminan una por una de forma aleatoria;
 * a los ~2s la animación frena en la ganadora, se aplica glow y se redirige.
 */
function selectRandomCategory() {
    const grid = document.getElementById('categories-grid');
    const cards = Array.from(grid.querySelectorAll('.category-card'));
    const randomBtn = grid.querySelector('.random-category-btn');
    if (!cards.length || !categories.length) return;

    randomBtn.style.pointerEvents = 'none';
    randomBtn.style.opacity = '0.5';
    cards.forEach(c => { c.style.pointerEvents = 'none'; });

    const totalDurationMs = 2000;
    const fastIntervalMs = 80;
    const slowIntervalMs = 200;
    const slowStartAtMs = 1400;

    let currentHighlight = -1;
    let startTime = Date.now();
    let lastStep = 0;

    function removeRuletaClasses() {
        cards.forEach(c => {
            c.classList.remove('ruleta-active', 'ruleta-winner');
        });
    }

    function tick() {
        const elapsed = Date.now() - startTime;
        const isSlowPhase = elapsed >= slowStartAtMs;
        const interval = isSlowPhase ? slowIntervalMs : fastIntervalMs;
        if (elapsed - lastStep < interval && elapsed < totalDurationMs) {
            requestAnimationFrame(tick);
            return;
        }
        lastStep = elapsed;

        if (elapsed >= totalDurationMs) {
            const selectedIndex = Math.floor(Math.random() * categories.length);
            removeRuletaClasses();
            if (cards[selectedIndex]) {
                cards[selectedIndex].classList.add('ruleta-winner');
            }
            const selectedCategory = categories[selectedIndex];
            setTimeout(() => {
                removeRuletaClasses();
                randomBtn.style.pointerEvents = 'auto';
                randomBtn.style.opacity = '1';
                cards.forEach(c => { c.style.pointerEvents = ''; });
                showSubcategories(selectedCategory);
            }, 1200);
            return;
        }

        removeRuletaClasses();
        const randomIndex = Math.floor(Math.random() * cards.length);
        currentHighlight = randomIndex;
        if (cards[randomIndex]) cards[randomIndex].classList.add('ruleta-active');
        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}

// Mostrar subcategorías
function showSubcategories(category) {
    document.getElementById('category-title').textContent = category.name;
    const grid = document.getElementById('subcategories-grid');
    grid.innerHTML = '';

    const categoryColor = getCategoryColor(category.id);
    category.subcategories.forEach(subcategory => {
        const card = document.createElement('div');
        card.className = 'subcategory-card';
        card.setAttribute('data-color', categoryColor);
        card.style.setProperty('--category-color', categoryColor);
        card.innerHTML = `
            <i class="${subcategory.icon}"></i>
            <h3>${subcategory.name}</h3>
            <p>${subcategory.description}</p>
            <span class="question-count">${subcategory.questionCount} preguntas</span>
        `;
        card.addEventListener('click', () => startGame(category, subcategory));
        grid.appendChild(card);
    });

    var nSub = category.subcategories ? category.subcategories.length : 0;
    grid.dataset.count = String(nSub);

    showScreen('subcategorias-screen');
}

// Iniciar juego
function startGame(category, subcategory) {
    // Si la subcategoría tiene preguntas directamente (categoría personal)
    let gameQuestions = [];
    if (subcategory.questions && Array.isArray(subcategory.questions)) {
        gameQuestions = subcategory.questions;
    } else {
        gameQuestions = getQuestionsForSubcategory(subcategory.id);
    }

    currentGame = {
        clientGameId: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('game_' + Date.now() + '_' + Math.random().toString(16).slice(2)),
        category: category,
        subcategory: subcategory,
        questions: gameQuestions,
        currentQuestion: 0,
        score: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        startTime: Date.now(),
        times: [],
        questionResults: [],
        mode: currentMode,
        profesorId: subcategory.profesorId || category.profesorId || null
    };

    if (currentGame.questions.length === 0) {
        showNotification('No hay preguntas disponibles para esta subcategoría', 'error');
        return;
    }

    try {
        window._lastGameReplay = { category: category, subcategory: subcategory };
    } catch (e) { }

    playSFX('start');

    // Actualizar perfil lateral
    if (currentUser) {
        const sidebarAvatar = document.getElementById('game-sidebar-avatar');
        const sidebarName = document.getElementById('game-sidebar-name');
        const sidebarRank = document.getElementById('game-sidebar-rank');
        if (sidebarAvatar) sidebarAvatar.src = getAvatarUrl(currentUser);
        if (sidebarName) sidebarName.textContent = currentUser.name;
        if (sidebarRank) {
            const score = currentUser.score || 0;
            sidebarRank.textContent = getLinguisticRank(score, currentUser.id, currentUser.gender || 'neutro');
        }
    }

    showScreen('juego-screen');
    showQuestion();
}

// Obtener preguntas para subcategoría
function getQuestionsForSubcategory(subcategoryId) {
    console.log('🔍 Buscando preguntas para subcategoría:', subcategoryId);
    console.log('📊 Preguntas disponibles:', Object.keys(questions));
    console.log('📋 Preguntas encontradas:', questions[subcategoryId] ? questions[subcategoryId].length : 0);

    // Buscar en preguntas del sistema
    let foundQuestions = questions[subcategoryId] || [];

    // Si no se encuentran, buscar en categorías personales de profesores
    if (foundQuestions.length === 0) {
        users.forEach(user => {
            if (user.isProfesor && user.personalCategories) {
                user.personalCategories.forEach(cat => {
                    if (cat.id === subcategoryId && cat.questions) {
                        foundQuestions = cat.questions;
                        console.log(`✅ Encontradas ${foundQuestions.length} preguntas personales del profesor ${user.name}`);
                    }
                });
            }
        });
    }

    if (foundQuestions.length === 0) {
        console.warn('⚠️ No se encontraron preguntas para:', subcategoryId);
        console.log('🔍 Verificando variaciones del ID...');
        // Intentar buscar con diferentes variaciones
        for (const key in questions) {
            if (key.toLowerCase().includes(subcategoryId.toLowerCase()) || subcategoryId.toLowerCase().includes(key.toLowerCase())) {
                console.log('💡 ID similar encontrado:', key);
            }
        }
    }

    return foundQuestions;
}

// Mezclar array con algoritmo Fisher-Yates
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/** Barra dual: avance (preguntas ya contestadas / total) y precisión en vivo */
function updateGameProgressUI() {
    const game = currentGame;
    const advEl = document.getElementById('progress-bar-advance');
    const accEl = document.getElementById('progress-bar-accuracy');
    const fracEl = document.getElementById('game-progress-fraction');
    const accTextEl = document.getElementById('game-accuracy-text');
    const dualWrap = document.getElementById('game-dual-progress');
    if (!game || !game.questions || !game.questions.length) return;

    const total = game.questions.length;
    var answered = Math.max(game.currentQuestion || 0, (game.correctAnswers || 0) + (game.incorrectAnswers || 0));
    answered = Math.max(0, Math.min(answered, total));
    const advancePct = (answered / total) * 100;
    if (advEl) advEl.style.width = advancePct + '%';
    if (fracEl) fracEl.textContent = answered + ' / ' + total;

    const attempts = (game.correctAnswers || 0) + (game.incorrectAnswers || 0);
    var acc = attempts > 0 ? Math.round((100 * (game.correctAnswers || 0)) / attempts) : null;
    if (accTextEl) accTextEl.textContent = acc == null ? 'Precisión: —' : 'Precisión: ' + acc + '%';
    if (accEl) accEl.style.width = (acc == null ? 0 : acc) + '%';

    if (dualWrap) {
        if (acc == null) dualWrap.setAttribute('data-accuracy-tier', 'neutral');
        else if (acc >= 70) dualWrap.setAttribute('data-accuracy-tier', 'high');
        else if (acc >= 40) dualWrap.setAttribute('data-accuracy-tier', 'mid');
        else dualWrap.setAttribute('data-accuracy-tier', 'low');
    }
}

// Mostrar pregunta
function showQuestion() {
    const game = currentGame;
    if (game) game._advanceScheduled = false;
    const question = game.questions[game.currentQuestion];

    if (!question) {
        endGame();
        return;
    }

    // Actualizar información del juego
    document.getElementById('current-category').textContent = game.subcategory.name;
    document.getElementById('question-number').textContent = `Pregunta ${game.currentQuestion + 1} de ${game.questions.length}`;
    document.getElementById('current-score').textContent = game.score;

    // Actualizar badge de modo
    const modeBadge = document.getElementById('game-mode-badge');
    if (modeBadge) {
        const mode = game.mode || currentMode;
        modeBadge.textContent = mode === 'estudio' ? 'Modo estudio' : 'Modo clásico';
        modeBadge.classList.toggle('estudio', mode === 'estudio');
        modeBadge.classList.toggle('clasico', mode === 'clasico');
    }

    // Mostrar pregunta
    document.getElementById('question-text').textContent = question.question;

    // Mostrar opciones
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';

    const optionsWithMeta = question.options.map((optionText, originalIndex) => ({
        id: `${question.id || `q${game.currentQuestion}`}_o${originalIndex}`,
        text: optionText,
        originalIndex
    }));
    const shuffledOptions = shuffleArray(optionsWithMeta);
    game.currentShuffledOptions = shuffledOptions;
    shuffledOptions.forEach((optionMeta, index) => {
        const button = document.createElement('button');
        button.className = `option-btn option-${index}`;
        button.textContent = optionMeta.text;
        button.dataset.optionId = optionMeta.id;
        button.addEventListener('click', () => selectAnswer(optionMeta.id));
        optionsContainer.appendChild(button);
    });

    updateGameProgressUI();

    // Iniciar u ocultar temporizador según modo
    const timerElement = document.getElementById('timer');
    const timerWrapper = timerElement ? timerElement.parentElement : null;
    const mode = game.mode || currentMode;
    if (mode === 'clasico') {
        if (timerWrapper) timerWrapper.style.opacity = '1';
        startTimer();
    } else {
        // Modo estudio: sin cuenta atrás
        if (game.timer) {
            clearInterval(game.timer);
            game.timer = null;
        }
        if (timerElement) {
            timerElement.textContent = '∞';
        }
        if (timerWrapper) {
            timerWrapper.style.opacity = '0.6';
        }
    }
}

// Temporizador (modo clásico); respeta congelación por login invitado
function startTimerFromSeconds(initialSeconds) {
    const game = currentGame;
    if (!game) return;
    const timerElement = document.getElementById('timer');
    let timeLeft = Math.max(1, Math.floor(Number(initialSeconds) || GAME_CONFIG.timePerQuestion));
    if (timerElement) timerElement.textContent = timeLeft;
    if (game.timer) {
        clearInterval(game.timer);
        game.timer = null;
    }
    const timer = setInterval(() => {
        if (!currentGame || currentGame !== game) {
            clearInterval(timer);
            return;
        }
        if (gameFrozenForAuth) return;
        timeLeft--;
        if (timerElement) timerElement.textContent = timeLeft;
        if (timeLeft > 0 && timeLeft <= 10) {
            playSFX('timer_low');
        }
        if (timeLeft <= 0) {
            clearInterval(timer);
            game.timer = null;
            stopSfxByType('timer_low');
            selectAnswer(null);
        }
    }, 1000);
    game.timer = timer;
}

function startTimer() {
    startTimerFromSeconds(GAME_CONFIG.timePerQuestion);
}

// Seleccionar respuesta
function selectAnswer(selectedOptionId) {
    if (gameFrozenForAuth) return;
    const game = currentGame;
    if (!game || !game.questions || game.currentQuestion >= game.questions.length) return;
    const question = game.questions[game.currentQuestion];
    if (!question) return;

    // Detener timer
    if (game.timer) {
        clearInterval(game.timer);
        game.timer = null;
    }
    stopSfxByType('timer_low');

    const optionsContainer = document.getElementById('options-container');
    const buttons = optionsContainer ? optionsContainer.querySelectorAll('.option-btn') : [];
    buttons.forEach(btn => { btn.disabled = true; });

    const shuffledOptions = game.currentShuffledOptions || [];
    const correctOptionMeta = shuffledOptions.find(opt => opt.originalIndex === question.correct);
    const correctOptionId = correctOptionMeta ? correctOptionMeta.id : null;
    const isCorrect = selectedOptionId != null && selectedOptionId === correctOptionId;

    const selectedBtn = selectedOptionId != null
        ? Array.from(buttons).find(btn => btn.dataset.optionId === selectedOptionId)
        : null;
    const correctBtn = correctOptionId
        ? Array.from(buttons).find(btn => btn.dataset.optionId === correctOptionId)
        : null;
    if (selectedBtn) {
        playSFX('select');
        selectedBtn.classList.add(isCorrect ? 'answer-correct' : 'answer-incorrect');
    }
    if (!isCorrect && correctBtn && correctBtn !== selectedBtn) correctBtn.classList.add('answer-correct');

    const responseTime = (Date.now() - game.startTime) / 1000;
    game.times.push(responseTime);

    // Persistir resultados por pregunta para calcular "%% acierto global" en el panel de Administración.
    if (!game.questionResults) game.questionResults = [];
    const questionId = question && question.id ? question.id : `q_${game.currentQuestion}`;
    game.questionResults.push({
        questionId: questionId,
        isCorrect: isCorrect,
        selectedOriginalIndex: selectedOptionId == null ? null : shuffledOptions.find(opt => opt.id === selectedOptionId)?.originalIndex,
        responseTimeSeconds: responseTime
    });
    const mode = game.mode || currentMode;

    if (isCorrect) {
        playSFX('correct');
        game.correctAnswers++;
        let points = 0;
        const difficultyBonus = GAME_CONFIG.difficultyMultiplier[question.difficulty] || 1;

        if (mode === 'clasico') {
            const timeBonus = Math.max(0, GAME_CONFIG.timePerQuestion - responseTime) * GAME_CONFIG.timeBonus;
            points = Math.round((GAME_CONFIG.pointsPerCorrect + timeBonus) * difficultyBonus);
        } else {
            points = Math.round(GAME_CONFIG.pointsPerCorrect * difficultyBonus);
        }

        const oldScore = game.score;
        game.score += points;
        animateValue('current-score', oldScore, game.score, 800);
        showModernFeedback(true, `+${points}`);
    } else {
        playSFX('wrong');
        game.incorrectAnswers++;
        showModernFeedback(false, '¡Ups!');
    }
    updateGameProgressUI();

    function advanceToNextQuestion() {
        if (game._advanceScheduled) return;
        game._advanceScheduled = true;
        game.isPaused = false;
        game.currentQuestion++;
        if (game.currentQuestion < game.questions.length) {
            game.startTime = Date.now();
            showQuestion();
        } else {
            endGame();
        }
    }

    if (question.explanation) {
        game.isPaused = true;
        game.timer = null;
        setTimeout(() => {
            showExplanation(question.explanation, isCorrect, question, advanceToNextQuestion);
        }, 1000);
    } else {
        setTimeout(advanceToNextQuestion, 1500);
    }
}

// Terminar juego
async function endGame() {
    if (currentGame.timer) {
        clearInterval(currentGame.timer);
    }
    if (currentUser) {
        const gamePayload = {
            clientGameId: currentGame.clientGameId,
            categoryId: currentGame.category?.id,
            subcategoryId: currentGame.subcategory?.id,
            categoryName: currentGame.category?.name,
            subcategoryName: currentGame.subcategory?.name,
            mode: currentGame.mode,
            playedAt: new Date().toISOString(),
            attempts: currentGame.questionResults || []
        };
        try {
            const data = await LinguizateAPI.post('/games', gamePayload);
            if (data.user) {
                currentUser.score = data.user.score;
                currentUser.gamesPlayed = data.user.gamesPlayed;
            }
        } catch (error) {
            const pending = JSON.parse(localStorage.getItem('linguizate_pending_games') || '[]');
            pending.push(gamePayload);
            localStorage.setItem('linguizate_pending_games', JSON.stringify(pending));
            showNotification('La partida se guardará cuando vuelva la conexión.', 'warning');
        }
    }
    showResults();
}

function updateResultsMedals(game, opts) {
    opts = opts || {};
    var row = document.getElementById('results-medals-row');
    if (!row || !game) return;
    var n = game.questions ? game.questions.length : 0;
    var sessionPrecision = n > 0 ? Math.round((100 * (game.correctAnswers || 0)) / n) : 0;
    var raeNew = !!opts.raeNew;
    row.querySelectorAll('.results-medal').forEach(function (el) {
        el.classList.remove('is-lit', 'is-pulse');
        var t = el.getAttribute('data-medal');
        var lit = false;
        var pulse = false;
        if (t === 'alta') {
            lit = (game.score || 0) >= 1000;
            pulse = lit;
        } else if (t === 'perfecto') {
            lit = n > 0 && (game.correctAnswers || 0) === n;
            pulse = lit;
        } else if (t === 'rae') {
            lit = !!(game.profesorId && n > 0 && (game.correctAnswers || 0) === n);
            pulse = raeNew || lit;
        } else if (t === 'precision') {
            lit = sessionPrecision >= 70;
            pulse = sessionPrecision >= 85;
        }
        if (lit) el.classList.add('is-lit');
        if (pulse) el.classList.add('is-pulse');
    });
}

function initResultsParticles() {
    var root = document.querySelector('.results-particles');
    if (!root) return;
    root.innerHTML = '';
    for (var i = 0; i < 28; i++) {
        var d = document.createElement('div');
        d.className = 'results-particle';
        d.style.left = (4 + Math.random() * 92) + '%';
        d.style.animationDelay = (Math.random() * 8) + 's';
        d.style.animationDuration = (10 + Math.random() * 10) + 's';
        root.appendChild(d);
    }
}

/** Sistema de Feedback Moderno (Overlay Central) */
function showModernFeedback(isCorrect, text) {
    // Crear elementos si no existen
    let overlay = document.getElementById('modern-feedback-overlay');
    let flash = document.getElementById('screen-flash');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'modern-feedback-overlay';
        overlay.className = 'feedback-overlay';
        overlay.innerHTML = `
            <i class="feedback-icon fas"></i>
            <span class="feedback-text"></span>
        `;
        document.body.appendChild(overlay);
    }

    if (!flash) {
        flash = document.createElement('div');
        flash.id = 'screen-flash';
        flash.className = 'flash-screen';
        document.body.appendChild(flash);
    }

    const iconEl = overlay.querySelector('.feedback-icon');
    const textEl = overlay.querySelector('.feedback-text');

    // Configurar contenido
    iconEl.className = `feedback-icon fas ${isCorrect ? 'fa-check-circle feedback-correct' : 'fa-times-circle feedback-incorrect'}`;
    textEl.className = `feedback-text ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}`;
    textEl.textContent = text;

    // Disparar flash
    flash.className = `flash-screen ${isCorrect ? 'flash-correct' : 'flash-incorrect'}`;
    flash.style.opacity = '1';

    // Disparar overlay
    overlay.classList.add('active');

    // Limpiar después de 1 segundo
    setTimeout(() => {
        overlay.classList.remove('active');
        flash.style.opacity = '0';
    }, 1000);
}

// Mostrar resultados (consola de logros, radar, medallas, confeti)
function showResults() {
    const game = currentGame;
    var achBefore = (currentUser && currentUser.achievements) ? currentUser.achievements.slice() : [];

    var previousBest = 0;
    if (currentUser && currentUser.gameHistory && currentUser.gameHistory.length) {
        previousBest = Math.max.apply(null, currentUser.gameHistory.map(function (g) { return g.score || 0; }));
    }
    var isNewRecord = currentUser && currentUserType === 'estudiante' && game.score > previousBest;

    // Verificar logros (UI en #achievements)
    if (currentUser) {
        checkAchievements(currentUser, game);
    }

    // Registrar resultado en estadísticas del profesor si la partida fue de una categoría privada
    if (game.profesorId) {
        const profesor = users.find(u => u.id === game.profesorId);
        if (profesor) {
            if (!profesor.stats) profesor.stats = [];
            profesor.stats.push({
                studentName: currentUser ? currentUser.name : 'Anónimo',
                categoryName: game.category ? game.category.name : '-',
                score: game.score,
                correctAnswers: game.correctAnswers || 0,
                incorrectAnswers: game.incorrectAnswers || 0,
                date: new Date().toISOString()
            });
            saveDataToLocalStorage();
        }
        // Logro especial: puntaje perfecto en categoría del profesor
        if (currentUser && currentUserType === 'estudiante' && game.questions && game.questions.length > 0 && game.correctAnswers === game.questions.length) {
            var ach = 'Hijo Predilecto de la RAE';
            if (!currentUser.achievements) currentUser.achievements = [];
            if (currentUser.achievements.indexOf(ach) === -1) {
                currentUser.achievements.push(ach);
                var uIdx = users.findIndex(function (u) { return u.id === currentUser.id; });
                if (uIdx !== -1) users[uIdx] = currentUser;
                saveDataToLocalStorage();
                showNotification('¡Logro desbloqueado: ' + ach + '!', 'success');
            }
        }
    }

    // Historial personal del estudiante (Mis Resultados)
    if (currentUser && currentUserType === 'estudiante') {
        currentUser.gameHistory = currentUser.gameHistory || [];
        var bestStreak = Math.max(0, Math.min(game.correctAnswers || 0, game.questions ? game.questions.length : 0));
        var avgResponseTimeSeconds = 0;
        if (game.times && game.times.length > 0) {
            avgResponseTimeSeconds = game.times.reduce(function (a, b) { return a + b; }, 0) / game.times.length;
        }
        currentUser.gameHistory.push({
            categoryName: game.category ? game.category.name : '-',
            score: game.score,
            date: new Date().toISOString(),
            totalQuestions: game.questions ? game.questions.length : 0,
            correctAnswers: game.correctAnswers || 0,
            incorrectAnswers: game.incorrectAnswers || 0,
            bestStreak: bestStreak,
            avgResponseTimeSeconds: avgResponseTimeSeconds,
            questionResults: game.questionResults || []
        });
        var idx = users.findIndex(u => u.id === currentUser.id);
        if (idx !== -1) users[idx] = currentUser;
        saveDataToLocalStorage();
    }

    // Stats estáticos
    document.getElementById('correct-answers').textContent = game.correctAnswers;
    document.getElementById('incorrect-answers').textContent = game.incorrectAnswers;
    var avgTime = game.times.length > 0 ? (game.times.reduce(function (a, b) { return a + b; }, 0) / game.times.length).toFixed(1) : 0;
    document.getElementById('avg-time').textContent = avgTime + 's';

    // Rango — badge metálico
    var rankText = getLinguisticRank(game.score, currentUser ? currentUser.id : 0, currentUser ? currentUser.gender : 'neutro');
    var rankTextEl = document.getElementById('result-rank-text');
    var rankEl = document.getElementById('result-rank-badge');
    if (rankTextEl) rankTextEl.textContent = rankText;
    if (rankEl) rankEl.style.display = 'inline-flex';

    // Radar: historial ya incluye esta partida (estudiante) o solo partida actual
    var histRadar = [];
    if (currentUser && currentUser.gameHistory && currentUser.gameHistory.length) {
        histRadar = currentUser.gameHistory.slice();
    } else {
        histRadar = [{ categoryName: game.category ? game.category.name : '-', score: game.score }];
    }
    drawResultsRadarMini(getBranchScoresFromHistory(histRadar));

    var achAfter = (currentUser && currentUser.achievements) ? currentUser.achievements : [];
    var raeNew = achAfter.indexOf('Hijo Predilecto de la RAE') !== -1 && achBefore.indexOf('Hijo Predilecto de la RAE') === -1;
    updateResultsMedals(game, { raeNew: raeNew });

    initResultsParticles();

    // Contador en 0 para animar
    var finalScoreEl = document.getElementById('final-score');
    if (finalScoreEl) finalScoreEl.textContent = '0';

    showScreen('resultados-screen');

    // Animación: contador de 0 a puntaje (easeOutQuart, ~1.2s)
    var duration = 1200;
    var startTime = null;
    function tick(now) {
        if (!startTime) startTime = now;
        var elapsed = now - startTime;
        var t = Math.min(elapsed / duration, 1);
        var eased = 1 - (1 - t) * (1 - t) * (1 - t) * (1 - t);
        var value = Math.floor(eased * game.score);
        if (finalScoreEl) finalScoreEl.textContent = value;
        if (t < 1) {
            requestAnimationFrame(tick);
        } else {
            if (finalScoreEl) finalScoreEl.textContent = game.score;
            if (isNewRecord && typeof confetti === 'function') {
                confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
                setTimeout(function () {
                    confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 } });
                    confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 } });
                }, 200);
                playSFX('record');
            }
            playSFX('complete');
        }
    }
    requestAnimationFrame(tick);
}

// Verificar logros (mensajes compactos bajo las estadísticas)
function checkAchievements(user, game) {
    const achievements = [];
    if (game.score >= 1000) achievements.push('¡Puntuación alta!');
    if (game.questions && game.correctAnswers === game.questions.length) achievements.push('¡Perfecto!');

    const achievementsContainer = document.getElementById('achievements');
    if (!achievementsContainer) return achievements;

    if (achievements.length === 0) {
        achievementsContainer.innerHTML = '';
        return achievements;
    }
    achievementsContainer.innerHTML = achievements.map(function (achievement) {
        var high = achievement.indexOf('Puntuación alta') !== -1;
        return '<div class="achievement-inline' + (high ? ' achievement-high-score' : '') + '">' +
            '<i class="fas fa-trophy" aria-hidden="true"></i> ' + achievement + '</div>';
    }).join('');
    return achievements;
}

// Manejar autenticación
async function handleAuth() {
    {
        const emailValue = document.getElementById('email').value.trim();
        const passwordValue = document.getElementById('password').value;
        const roleValue = document.getElementById('user-type').value;
        const registering = document.getElementById('btn-auth').textContent.includes('Registrarse');
        try {
            let data;
            if (registering) {
                const confirmation = document.getElementById('confirm-password').value;
                const securityPhraseValue = document.getElementById('security-phrase')?.value.trim() || '';
                if (passwordValue !== confirmation) throw new Error('Las contraseñas no coinciden');
                if (!securityPhraseValue) throw new Error('La Frase de Seguridad es obligatoria para recuperar tu cuenta.');
                data = await LinguizateAPI.post('/auth/register', {
                    email: emailValue, password: passwordValue, role: roleValue,
                    name: document.getElementById('name').value.trim() || emailValue.split('@')[0],
                    gender: document.getElementById('gender')?.value || 'otro',
                    securityPhrase: securityPhraseValue
                });
            } else {
                data = await LinguizateAPI.post('/auth/login', { email: emailValue, password: passwordValue, role: roleValue });
            }
            const user = data.user;
            currentUser = user;
            currentUserType = user.role;
            const existing = users.findIndex(item => item.id === user.id);
            if (existing >= 0) users[existing] = user; else users.push(user);
            if (user.isProfesor) {
                currentProfesor = user;
                await refreshProfessorData();
                gameFrozenForAuth = false;
                currentGame = null;
                persistSession();
                showScreen('profesor-panel');
                loadProfesorPanel();
            } else {
                const historyData = await LinguizateAPI.get('/users/me/games');
                user.gameHistory = historyData.games || [];
                persistSession();
                if (!tryResumeGuestGameAfterAuth()) showScreen('inicio-screen');
            }
            updateNavbarUser();
            await syncPendingGames();
            showNotification(registering ? 'Usuario registrado exitosamente' : 'Sesión iniciada exitosamente', 'success');
        } catch (error) {
            showNotification(error.message || 'No se pudo iniciar sesión', 'error');
        }
        return;
    }
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const userType = document.getElementById('user-type').value;
    const isRegister = document.getElementById('btn-auth').textContent.includes('Registrarse');

    if (isRegister) {
        const confirmPassword = document.getElementById('confirm-password').value;
        const name = document.getElementById('name').value.trim() || email.split('@')[0];
        const gender = (document.getElementById('gender') && document.getElementById('gender').value) || 'otro';
        const securityPhraseEl = document.getElementById('security-phrase');
        const securityPhrase = securityPhraseEl ? securityPhraseEl.value.trim() : '';

        if (password !== confirmPassword) {
            showNotification('Las contraseñas no coinciden', 'error');
            return;
        }
        if (!securityPhrase) {
            showNotification('La Frase de Seguridad es obligatoria para recuperar tu cuenta.', 'error');
            return;
        }

        // Registrar usuario
        const newUser = {
            id: users.length + 1,
            email,
            password,
            name: name,
            gender: gender,
            securityPhrase: securityPhrase,
            score: 0,
            gamesPlayed: 0,
            achievements: [],
            isProfesor: userType === 'profesor',
            isEstudiante: userType === 'estudiante',
            createdAt: new Date().toISOString(),
            personalCategories: userType === 'profesor' ? [] : undefined
        };

        users.push(newUser);
        currentUser = newUser;
        currentUserType = userType;
        saveDataToLocalStorage();

        if (userType === 'profesor') {
            gameFrozenForAuth = false;
            currentGame = null;
            currentProfesor = newUser;
            currentUserType = 'profesor';
            persistSession();
            showNotification('Profesor registrado exitosamente', 'success');
            showScreen('profesor-panel');
            loadProfesorPanel();
        } else {
            currentUserType = 'estudiante';
            persistSession();
            showNotification('Usuario registrado exitosamente', 'success');
            updateNavbarUser();
            if (tryResumeGuestGameAfterAuth()) {
                return;
            }
            showScreen('inicio-screen');
        }
        updateNavbarUser();
    } else {
        // Iniciar sesión: validación cruzada tipoUsuario seleccionado vs rol de la cuenta
        const user = users.find(u => u.email === email && u.password === password);
        if (!user) {
            showNotification('Credenciales incorrectas', 'error');
            return;
        }
        const selectedProfesor = userType === 'profesor';
        const selectedEstudiante = userType === 'estudiante';
        if (user.isAdmin) {
            showNotification('Esta cuenta es de administrador. Usa la ruta de acceso de administrador.', 'error');
            return;
        }
        if (selectedProfesor && !user.isProfesor) {
            showNotification('El tipo de usuario seleccionado no coincide con tu cuenta. Por favor, verifica tu selección.', 'error');
            return;
        }
        if (selectedEstudiante && user.isProfesor) {
            showNotification('El tipo de usuario seleccionado no coincide con tu cuenta. Por favor, verifica tu selección.', 'error');
            return;
        }
        currentUser = user;
        if (user.isProfesor) {
            gameFrozenForAuth = false;
            currentGame = null;
            currentUserType = 'profesor';
            currentProfesor = user;
            persistSession();
            showNotification('Sesión de profesor iniciada', 'success');
            showScreen('profesor-panel');
            loadProfesorPanel();
        } else {
            currentUserType = 'estudiante';
            persistSession();
            showNotification('Sesión iniciada exitosamente', 'success');
            if (tryResumeGuestGameAfterAuth()) {
                updateNavbarUser();
                return;
            }
            showScreen('inicio-screen');
        }
        updateNavbarUser();
    }
}

// Cambiar modo de autenticación
function toggleAuthMode() {
    const authTitle = document.getElementById('auth-title');
    const authBtn = document.getElementById('btn-auth');
    const toggleBtn = document.getElementById('btn-toggle-auth');
    const confirmGroup = document.getElementById('confirm-password-group');
    const nameGroup = document.getElementById('name-group');
    const genderGroup = document.getElementById('gender-group');
    const securityPhraseGroup = document.getElementById('security-phrase-group');
    const forgotBtn = document.getElementById('btn-forgot-password');

    if (authTitle.textContent === 'Iniciar Sesión') {
        authTitle.textContent = 'Registrarse';
        authBtn.textContent = 'Registrarse';
        toggleBtn.textContent = '¿Ya tienes cuenta? Inicia Sesión';
        confirmGroup.style.display = 'block';
        nameGroup.style.display = 'block';
        if (genderGroup) genderGroup.style.display = 'block';
        if (securityPhraseGroup) securityPhraseGroup.style.display = 'block';
        if (forgotBtn) forgotBtn.style.display = 'none';
    } else {
        authTitle.textContent = 'Iniciar Sesión';
        authBtn.textContent = 'Iniciar Sesión';
        toggleBtn.textContent = '¿No tienes cuenta? Regístrate';
        confirmGroup.style.display = 'none';
        nameGroup.style.display = 'none';
        if (genderGroup) genderGroup.style.display = 'none';
        if (securityPhraseGroup) securityPhraseGroup.style.display = 'none';
        if (forgotBtn) forgotBtn.style.display = '';
    }
}

// Recuperar contraseña: paso 1 (email + frase) y paso 2 (nueva contraseña)
function openForgotPasswordModal() {
    {
        const content = '<div class="forgot-password-form">' +
            '<p>Ingresa tus datos y define una nueva contraseña. Tu progreso se mantendrá.</p>' +
            '<div class="form-group"><label for="fp-email-api">Correo</label><input type="email" id="fp-email-api"></div>' +
            '<div class="form-group"><label for="fp-phrase-api">Frase de Seguridad</label><input type="text" id="fp-phrase-api"></div>' +
            '<div class="form-group"><label for="fp-new-api">Nueva contraseña</label><input type="password" id="fp-new-api"></div>' +
            '<div class="form-group"><label for="fp-confirm-api">Confirmar contraseña</label><input type="password" id="fp-confirm-api"></div>' +
            '<button type="button" id="fp-reset-api" class="btn-primary">Guardar y acceder</button></div>';
        showModal('¿Olvidaste tu contraseña?', content);
        document.getElementById('fp-reset-api').addEventListener('click', async function () {
            const password = document.getElementById('fp-new-api').value;
            if (!password || password !== document.getElementById('fp-confirm-api').value) {
                showNotification('Las contraseñas no coinciden', 'error');
                return;
            }
            try {
                const data = await LinguizateAPI.post('/auth/password-reset', {
                    email: document.getElementById('fp-email-api').value,
                    securityPhrase: document.getElementById('fp-phrase-api').value,
                    newPassword: password
                });
                currentUser = data.user;
                currentUserType = data.user.role;
                persistSession();
                closeModal();
                updateNavbarUser();
                showScreen(data.user.isProfesor ? 'profesor-panel' : 'inicio-screen');
                showNotification('Contraseña actualizada. Sesión iniciada.', 'success');
            } catch (error) {
                showNotification(error.message, 'error');
            }
        });
        return;
    }
    var step1Html = '<div class="forgot-password-form">' +
        '<p>Ingresa tu correo y tu Frase de Seguridad. Si coinciden, podrás definir una nueva contraseña sin perder tu progreso.</p>' +
        '<div class="form-group"><label for="fp-email">Correo</label><input type="email" id="fp-email" placeholder="tu@email.com"></div>' +
        '<div class="form-group"><label for="fp-phrase">Frase de Seguridad</label><input type="text" id="fp-phrase" placeholder="Tu frase memorable"></div>' +
        '<button type="button" id="fp-btn-verify" class="btn-primary">Verificar y continuar</button></div>';
    showModal('¿Olvidaste tu contraseña?', step1Html);
    var overlay = document.getElementById('modal-overlay');
    function once(el, ev, fn) {
        el.addEventListener(ev, function h() { el.removeEventListener(ev, h); fn(); });
    }
    once(document.getElementById('fp-btn-verify'), 'click', function () {
        var email = (document.getElementById('fp-email') && document.getElementById('fp-email').value) || '';
        var phrase = (document.getElementById('fp-phrase') && document.getElementById('fp-phrase').value) || '';
        var user = users.find(function (u) { return u.email === email && !u.isAdmin; });
        if (!user) {
            showNotification('No existe una cuenta con ese correo.', 'error');
            return;
        }
        if (!user.securityPhrase) {
            showNotification('Esta cuenta no tiene Frase de Seguridad. No es posible recuperar la contraseña por este medio.', 'error');
            return;
        }
        if (user.securityPhrase !== phrase) {
            showNotification('La Frase de Seguridad no coincide.', 'error');
            return;
        }
        var step2Html = '<div class="forgot-password-form">' +
            '<p>Define tu nueva contraseña. Tu progreso y logros se mantendrán.</p>' +
            '<div class="form-group"><label for="fp-new">Nueva contraseña</label><input type="password" id="fp-new" placeholder="Nueva contraseña"></div>' +
            '<div class="form-group"><label for="fp-confirm">Confirmar contraseña</label><input type="password" id="fp-confirm" placeholder="Repite la contraseña"></div>' +
            '<button type="button" id="fp-btn-reset" class="btn-primary">Guardar y acceder</button></div>';
        document.getElementById('modal-title').textContent = 'Nueva contraseña';
        document.getElementById('modal-body').innerHTML = step2Html;
        once(document.getElementById('fp-btn-reset'), 'click', function () {
            var newPwd = (document.getElementById('fp-new') && document.getElementById('fp-new').value) || '';
            var confirmPwd = (document.getElementById('fp-confirm') && document.getElementById('fp-confirm').value) || '';
            if (!newPwd) {
                showNotification('Escribe una contraseña.', 'error');
                return;
            }
            if (newPwd !== confirmPwd) {
                showNotification('Las contraseñas no coinciden.', 'error');
                return;
            }
            user.password = newPwd;
            saveDataToLocalStorage();
            currentUser = user;
            currentUserType = user.isProfesor ? 'profesor' : 'estudiante';
            if (user.isProfesor) currentProfesor = user;
            persistSession();
            closeModal();
            updateNavbarUser();
            if (user.isProfesor) {
                gameFrozenForAuth = false;
                currentGame = null;
                showScreen('profesor-panel');
                loadProfesorPanel();
            } else if (!tryResumeGuestGameAfterAuth()) {
                showScreen('inicio-screen');
            }
            showNotification('Contraseña actualizada. Sesión iniciada.', 'success');
        });
    });
}

// Manejar login de admin
async function handleAdminLogin() {
    {
        try {
            const data = await LinguizateAPI.post('/auth/login', {
                identifier: document.getElementById('admin-username').value,
                password: document.getElementById('admin-password').value,
                role: 'admin'
            });
            isAdmin = true;
            currentUserType = 'admin';
            currentUser = data.user;
            currentProfesor = null;
            updateNavbarUser();
            showScreen('admin-panel');
            const adminSidebarApi = document.getElementById('admin-sidebar');
            if (adminSidebarApi) adminSidebarApi.style.display = 'block';
            await refreshAdminData();
            loadAdminPanel();
        } catch (error) {
            showNotification(error.message || 'Credenciales de administrador incorrectas', 'error');
        }
        return;
    }
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;

    if (username === 'admin' && password === 'admin123') {
        isAdmin = true;
        currentUserType = 'admin';
        currentUser = null;
        currentProfesor = null;
        updateNavbarUser();
        showScreen('admin-panel');
        const adminSidebar = document.getElementById('admin-sidebar');
        if (adminSidebar) adminSidebar.style.display = 'block';
        loadAdminPanel();
    } else {
        showNotification('Credenciales de administrador incorrectas', 'error');
    }
}

// Cerrar sesión de admin
function logoutAdmin() {
    LinguizateAPI.delete('/auth/session').catch(() => {});
    cleanupGameStateForLogout();
    clearSession();
    showNotification('Sesión cerrada', 'success');
    const adminSidebar = document.getElementById('admin-sidebar');
    if (adminSidebar) adminSidebar.style.display = 'none';
    showScreen('inicio-screen');
}

// Cerrar sesión de profesor (o cualquier usuario)
function logoutProfesor() {
    LinguizateAPI.delete('/auth/session').catch(() => {});
    cleanupGameStateForLogout();
    clearSession();
    showNotification('Sesión cerrada exitosamente', 'success');
    showScreen('inicio-screen');
}

// Función auxiliar global para agregar event listener de forma segura
function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const eased = 1 - (1 - progress) * (1 - progress) * (1 - progress); // easeOutCubic
        obj.innerHTML = Math.floor(eased * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end;
        }
    };
    window.requestAnimationFrame(step);
}
function addSafeEventListenerGlobal(elementId, event, handler) {
    const element = document.getElementById(elementId);
    if (element) {
        // Remover listener anterior si existe
        const newElement = element.cloneNode(true);
        element.parentNode.replaceChild(newElement, element);
        newElement.addEventListener(event, handler);
        console.log(`✅ Listener agregado para ${elementId}`);
        return true;
    } else {
        console.error(`❌ No se encontró el elemento ${elementId}`);
        return false;
    }
}

// Cargar panel de profesor
function loadProfesorPanel() {
    if (!currentProfesor) {
        console.error('No hay profesor actual');
        return;
    }

    const profesorNameEl = document.getElementById('profesor-name');
    if (profesorNameEl) {
        profesorNameEl.textContent = currentProfesor.name;
    }
    const profesorAvatarEl = document.getElementById('profesor-avatar');
    if (profesorAvatarEl) {
        profesorAvatarEl.src = getAvatarUrl(currentProfesor);
    }
    const btnAvatarProfesor = document.getElementById('btn-avatar-profesor');
    if (btnAvatarProfesor) {
        btnAvatarProfesor.onclick = openAvatarModal;
    }

    loadProfesorQuestionsTab();
    loadProfesorCategoriesTab();
    loadProfesorStatsTab();

    // Event listeners para tabs
    document.querySelectorAll('#profesor-panel .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            switchProfesorTab(tabName);
        });
    });

    // Event listeners para botones - usar setTimeout para asegurar que el DOM esté listo
    setTimeout(() => {
        const logoutBtn = document.getElementById('btn-logout-profesor');
        if (logoutBtn) {
            logoutBtn.onclick = logoutProfesor;
            console.log('✅ Botón cerrar sesión configurado');
        } else {
            console.error('❌ No se encontró btn-logout-profesor');
        }

        const addQuestionBtn = document.getElementById('btn-add-question-profesor');
        if (addQuestionBtn) {
            addQuestionBtn.onclick = openAddQuestionModalProfesor;
            console.log('✅ Botón agregar pregunta configurado');
        } else {
            console.error('❌ No se encontró btn-add-question-profesor');
        }

        const addCategoryBtn = document.getElementById('btn-add-category-profesor');
        if (addCategoryBtn) {
            addCategoryBtn.onclick = openAddCategoryModalProfesor;
            console.log('✅ Botón agregar categoría configurado');
        } else {
            console.error('❌ No se encontró btn-add-category-profesor');
        }

        // Event listeners para búsqueda y filtros
        const searchQuestions = document.getElementById('search-questions-profesor');
        if (searchQuestions) {
            searchQuestions.addEventListener('input', filterProfesorQuestions);
        }

        const filterDifficulty = document.getElementById('filter-difficulty-profesor');
        if (filterDifficulty) {
            filterDifficulty.addEventListener('change', filterProfesorQuestions);
        }

        const filterCategory = document.getElementById('filter-category-profesor');
        if (filterCategory) {
            filterCategory.addEventListener('change', filterProfesorQuestions);
        }

        const searchCategories = document.getElementById('search-categories-profesor');
        if (searchCategories) {
            searchCategories.addEventListener('input', filterProfesorCategories);
        }
    }, 100);
}

// Filtrar preguntas del profesor
function filterProfesorQuestions() {
    const searchEl = document.getElementById('search-questions-profesor');
    const difficultyEl = document.getElementById('filter-difficulty-profesor');
    const categoryEl = document.getElementById('filter-category-profesor');

    const searchTerm = (searchEl && searchEl.value ? searchEl.value : '').toLowerCase();
    const difficultyFilter = (difficultyEl && difficultyEl.value ? difficultyEl.value : '').toLowerCase();
    const categoryFilter = (categoryEl && categoryEl.value ? categoryEl.value : '').toLowerCase();

    const container = document.getElementById('profesor-questions-list');
    if (!container) return;

    const rows = container.querySelectorAll('tr.profesor-question-row');
    if (!rows || rows.length === 0) return;

    rows.forEach(row => {
        const questionText = (row.dataset.questionText || '').toLowerCase();
        const difficulty = (row.dataset.difficulty || '').toLowerCase();
        const categoryId = (row.dataset.categoryId || '').toLowerCase();

        const matchesSearch = !searchTerm || questionText.includes(searchTerm);
        const matchesDifficulty = !difficultyFilter || difficulty === difficultyFilter;
        const matchesCategory = !categoryFilter || categoryId === categoryFilter;

        row.style.display = (matchesSearch && matchesDifficulty && matchesCategory) ? 'table-row' : 'none';
    });
}

// Filtrar categorías del profesor
function filterProfesorCategories() {
    const el = document.getElementById('search-categories-profesor');
    const searchTerm = (el && el.value ? el.value : '').toLowerCase();
    const container = document.getElementById('profesor-categories-list');
    if (!container) return;
    const rows = container.querySelectorAll('tr.profesor-category-row');
    rows.forEach(row => {
        const hay = (row.dataset.search || '').toLowerCase();
        const matches = !searchTerm || hay.includes(searchTerm);
        row.style.display = matches ? 'table-row' : 'none';
    });
}

// Cambiar tab del profesor
function switchProfesorTab(tabName) {
    document.querySelectorAll('#profesor-panel .tab-panel').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('#profesor-panel .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(`${tabName}-tab`).classList.add('active');
    const tabBtn = document.querySelector(`#profesor-panel [data-tab="${tabName}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    if (tabName === 'estadisticas-profesor') loadProfesorStatsTab();
}

// Cargar preguntas del profesor
function loadProfesorQuestionsTab() {
    const container = document.getElementById('profesor-questions-list');
    container.innerHTML = '';

    if (!currentProfesor.personalCategories) {
        currentProfesor.personalCategories = [];
    }

    // Obtener todas las preguntas personales del profesor
    const personalQuestions = [];
    currentProfesor.personalCategories.forEach(cat => {
        if (cat.questions) {
            cat.questions.forEach((q, idx) => {
                personalQuestions.push({
                    question: q,
                    category: cat,
                    index: idx
                });
            });
        }
    });

    if (personalQuestions.length === 0) {
        container.innerHTML = '<p class="empty-message">No has creado preguntas personales aún. ¡Crea tu primera pregunta!</p>';
        return;
    }

    // Completar dropdown de filtro por categoría/asignatura
    const categorySelect = document.getElementById('filter-category-profesor');
    const prevCategoryValue = categorySelect ? categorySelect.value : '';
    if (categorySelect) {
        const uniqueCatMap = {};
        (currentProfesor.personalCategories || []).forEach(function (cat) {
            if (!cat || cat.id == null) return;
            uniqueCatMap[String(cat.id)] = cat;
        });

        const uniqueCategories = Object.keys(uniqueCatMap).map(function (id) {
            var cat = uniqueCatMap[id];
            return { id: cat.id, name: cat.name || 'Sin nombre' };
        });

        const optionsHtml = ['<option value="">Filtrar por Asignatura/Categoría</option>']
            .concat(uniqueCategories.map(function (c) {
                const safeValue = escapeHtml(String(c.id));
                return `<option value="${safeValue}">${escapeHtml(c.name)}</option>`;
            }))
            .join('');

        categorySelect.innerHTML = optionsHtml;
        if (prevCategoryValue && Array.from(categorySelect.options).some(o => o.value === prevCategoryValue)) {
            categorySelect.value = prevCategoryValue;
        }
    }

    // Render tabla/lista compacta
    container.innerHTML = `
        <div class="profesor-questions-table-wrapper">
            <table class="profesor-questions-table">
                <thead>
                    <tr>
                        <th>Pregunta</th>
                        <th>Categoría</th>
                        <th>Dificultad</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="profesor-questions-tbody"></tbody>
            </table>
        </div>
    `;

    const tbody = document.getElementById('profesor-questions-tbody');

    function getDifficultyLabel(d) {
        if (d === 'facil') return 'Fácil';
        if (d === 'medio') return 'Medio';
        if (d === 'dificil') return 'Difícil';
        return d || '—';
    }

    personalQuestions.forEach(function (item) {
        const q = item.question || {};
        const cat = item.category || {};

        const row = document.createElement('tr');
        row.className = 'profesor-question-row';
        row.dataset.questionText = String(q.question || '');
        row.dataset.difficulty = String(q.difficulty || '');
        row.dataset.categoryId = String(cat.id || '');

        const categoryColor = getCategoryColor(cat.id);
        const difficultyClass = 'difficulty-' + String(q.difficulty || '');
        const difficultyLabel = getDifficultyLabel(q.difficulty);
        const safeCatIdForOnclick = String(cat.id || '').replace(/'/g, '\\\'');

        row.innerHTML = `
            <td>
                <div class="profesor-question-enunciado" title="${escapeHtml(q.question || '')}">
                    ${escapeHtml(q.question || '')}
                </div>
            </td>
            <td>
                <span class="q-category-badge" style="background: ${categoryColor};">
                    ${escapeHtml(cat.name || '—')}
                </span>
            </td>
            <td>
                <span class="difficulty-badge ${difficultyClass}">
                    ${escapeHtml(difficultyLabel)}
                </span>
            </td>
            <td>
                <div class="profesor-question-actions">
                    <button class="btn-icon btn-edit" onclick="openEditQuestionModalProfesor('${safeCatIdForOnclick}', ${item.index})" title="Editar" aria-label="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="confirmDeleteQuestionProfesor('${safeCatIdForOnclick}', ${item.index})" title="Eliminar" aria-label="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;

        if (tbody) tbody.appendChild(row);
    });

    // Aplicar filtros actuales sobre la nueva tabla
    filterProfesorQuestions();
}

// Crear tarjeta de pregunta del profesor
function createProfesorQuestionCard(question, category, index, globalIdx) {
    const card = document.createElement('div');
    card.className = 'admin-question-card';
    card.innerHTML = `
        <div class="question-card-header">
            <span class="question-number">#${globalIdx + 1}</span>
            <span class="difficulty-badge difficulty-${question.difficulty}">${question.difficulty}</span>
            <span class="category-badge">${category.name}</span>
        </div>
        <div class="question-card-body">
            <p class="question-text">${question.question}</p>
            <div class="question-info">
                <span><i class="fas fa-check-circle"></i> Opción ${question.correct + 1}</span>
                <span><i class="fas fa-list"></i> ${question.options.length} opciones</span>
            </div>
        </div>
        <div class="question-card-actions">
            <button class="btn-icon btn-edit" onclick="openEditQuestionModalProfesor('${category.id}', ${index})" title="Editar">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon btn-delete" onclick="confirmDeleteQuestionProfesor('${category.id}', ${index})" title="Eliminar">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    return card;
}

// Cargar categorías del profesor (tabla densa)
function loadProfesorCategoriesTab() {
    const container = document.getElementById('profesor-categories-list');
    container.innerHTML = '';

    if (!currentProfesor.personalCategories || currentProfesor.personalCategories.length === 0) {
        container.innerHTML = '<p class="empty-message">No has creado categorías personales aún. ¡Crea tu primera categoría!</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'profesor-questions-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Código</th>
                <th># Preg</th>
                <th>Acciones</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    currentProfesor.personalCategories.forEach(category => {
        const questionCount = category.questions ? category.questions.length : 0;
        const code = category.accessCode || '—';
        const safeCid = String(category.id).replace(/'/g, '\\\'');
        const desc = category.description || 'Sin descripción';
        const tr = document.createElement('tr');
        tr.className = 'profesor-category-row';
        tr.dataset.search = ((category.name || '') + ' ' + desc + ' ' + code).toLowerCase();
        tr.innerHTML = `
            <td>${escapeHtml(category.name)}</td>
            <td class="td-truncate" title="${escapeHtml(desc)}">${escapeHtml(desc)}</td>
            <td><code>${escapeHtml(code)}</code></td>
            <td>${questionCount}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon btn-edit" onclick="openEditCategoryModalProfesor('${safeCid}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="confirmDeleteCategoryProfesor('${safeCid}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    container.appendChild(table);
    filterProfesorCategories();
}

/**
 * Cargar pestaña Estadísticas del profesor: resumen + tabla con Nombre, Puntaje, Fecha.
 * Incluye alertas pedagógicas: si 3+ alumnos fallan en la misma categoría, se muestra aviso.
 */
function loadProfesorStatsTab() {
    const container = document.getElementById('profesor-stats');
    container.innerHTML = '';

    const totalCategories = currentProfesor.personalCategories ? currentProfesor.personalCategories.length : 0;
    const totalQuestions = currentProfesor.personalCategories ?
        currentProfesor.personalCategories.reduce((sum, cat) => sum + (cat.questions ? cat.questions.length : 0), 0) : 0;
    const stats = currentProfesor.stats || [];
    const sortedStats = [...stats].sort((a, b) => new Date(b.date) - new Date(a.date));

    const uniqueCategories = Array.from(new Set(sortedStats.map(s => s.categoryName || '-')));
    const categoryOptionsHtml = ['Todas'].concat(uniqueCategories).map(function (cat) {
        const value = String(cat);
        const safeValue = value.replace(/"/g, '&quot;');
        const label = cat === '-' ? 'Sin categoría' : cat;
        const selected = cat === 'Todas' ? 'selected' : '';
        return `<option value="${safeValue}" ${selected}>${escapeHtml(label)}</option>`;
    }).join('');

    // Alertas pedagógicas: categorías donde 3 o más alumnos (estudiantes distintos) fallaron
    var alertsHtml = '';
    var byCategory = {};
    stats.forEach(function (s) {
        var cat = s.categoryName || '-';
        if (!byCategory[cat]) byCategory[cat] = { studentsWithErrors: new Set() };
        var hasError = (s.incorrectAnswers != null && s.incorrectAnswers >= 1);
        if (hasError) byCategory[cat].studentsWithErrors.add(s.studentName || 'Anónimo');
    });
    Object.keys(byCategory).forEach(function (cat) {
        if (byCategory[cat].studentsWithErrors.size >= 3) {
            alertsHtml += '<div class="pedagogical-alert"><span class="pedagogical-alert-icon" aria-hidden="true">⚠️</span> Alerta Pedagógica: Reforzar el concepto <strong>' + escapeHtml(cat) + '</strong></div>';
        }
    });
    var mainContent = `
        <div class="stats-grid">
            <div class="stat-card">
                <i class="fas fa-tags"></i>
                <h3>${totalCategories}</h3>
                <p>Categorías Creadas</p>
            </div>
            <div class="stat-card">
                <i class="fas fa-question-circle"></i>
                <h3>${totalQuestions}</h3>
                <p>Preguntas Creadas</p>
            </div>
            <div class="stat-card">
                <i class="fas fa-chart-line"></i>
                <h3>${stats.length}</h3>
                <p>Partidas jugadas</p>
            </div>
        </div>
        <div class="profesor-stats-table-wrap">
            <div class="profesor-stats-header-row">
                <h4>Resultados de estudiantes</h4>
                <button type="button" id="btn-download-excel" class="btn-download-excel" ${sortedStats.length === 0 ? 'disabled' : ''}>
                    <i class="fas fa-file-excel"></i>
                    Descargar Reporte Excel
                </button>
            </div>
            <div class="profesor-stats-filter-row">
                <label for="filter-profesor-asignatura">Filtrar por Asignatura/Categoría</label>
                <select id="filter-profesor-asignatura">
                    ${categoryOptionsHtml}
                </select>
            </div>
            ${sortedStats.length === 0
            ? '<p class="no-stats-msg">Aún no hay partidas jugadas en tus categorías. Comparte tu código de acceso con los estudiantes.</p>'
            : `
            <table class="profesor-stats-table">
                <thead>
                    <tr>
                        <th>Estudiante</th>
                        <th>Categoría</th>
                        <th>Aciertos</th>
                        <th>Errores</th>
                        <th>Puntaje</th>
                        <th>Fecha</th>
                    </tr>
                </thead>
                <tbody id="profesor-stats-tbody">
                    ${sortedStats.map(s => `
                        <tr>
                            <td>${escapeHtml(s.studentName || '-')}</td>
                            <td>${escapeHtml(s.categoryName || '-')}</td>
                            <td>${s.correctAnswers != null ? s.correctAnswers : '-'}</td>
                            <td>${s.incorrectAnswers != null ? s.incorrectAnswers : '-'}</td>
                            <td>${s.score} pts</td>
                            <td>${formatStatsDate(s.date)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            `}
        </div>
    `;
    container.innerHTML = (alertsHtml ? '<div class="pedagogical-alerts-block">' + alertsHtml + '</div>' : '') + mainContent;
    const btnExcel = document.getElementById('btn-download-excel');
    if (btnExcel && sortedStats.length > 0) btnExcel.addEventListener('click', downloadStatsExcel);

    // Aplicar filtro por asignatura/categoría en la tabla y para la exportación
    profesorStatsFiltered = sortedStats;
    profesorStatsFilteredCategory = 'Todas';
    const filterSelect = document.getElementById('filter-profesor-asignatura');
    const tbody = document.getElementById('profesor-stats-tbody');

    function renderStatsRows(statsArr) {
        return (statsArr || []).map(s => `
            <tr>
                <td>${escapeHtml(s.studentName || '-')}</td>
                <td>${escapeHtml(s.categoryName || '-')}</td>
                <td>${s.correctAnswers != null ? s.correctAnswers : '-'}</td>
                <td>${s.incorrectAnswers != null ? s.incorrectAnswers : '-'}</td>
                <td>${s.score} pts</td>
                <td>${formatStatsDate(s.date)}</td>
            </tr>
        `).join('');
    }

    if (filterSelect) {
        filterSelect.addEventListener('change', function () {
            const chosen = filterSelect.value;
            profesorStatsFilteredCategory = chosen;
            if (chosen === 'Todas') {
                profesorStatsFiltered = sortedStats;
            } else {
                profesorStatsFiltered = sortedStats.filter(s => (s.categoryName || '-') === chosen);
            }
            if (tbody) tbody.innerHTML = renderStatsRows(profesorStatsFiltered);

            // Ajustar habilitación del botón exportar según filas visibles
            if (btnExcel) {
                if (profesorStatsFiltered && profesorStatsFiltered.length > 0) btnExcel.disabled = false;
                else btnExcel.disabled = true;
            }
        });
    }
}

function formatStatsDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Descargar estadísticas del profesor como archivo Excel.
 * Columnas: Estudiante, Categoría, Aciertos, Errores, Puntaje, Fecha.
 */
function downloadStatsExcel() {
    if (typeof XLSX === 'undefined') {
        showNotification('La librería Excel no está cargada. Recarga la página e intenta de nuevo.', 'error');
        return;
    }
    const stats = (profesorStatsFiltered != null) ? profesorStatsFiltered : (currentProfesor.stats || []);
    if (!stats || stats.length === 0) {
        showNotification('No hay datos para exportar', 'warning');
        return;
    }
    const rows = stats.map(s => ({
        'Estudiante': s.studentName || 'Anónimo',
        'Categoría': s.categoryName || '-',
        'Aciertos': s.correctAnswers != null ? s.correctAnswers : '-',
        'Errores': s.incorrectAnswers != null ? s.incorrectAnswers : '-',
        'Puntaje': s.score != null ? s.score : '-',
        'Fecha': s.date ? formatStatsDate(s.date) : '-'
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estadísticas');
    function sanitizeFilename(name) {
        return String(name || '')
            .trim()
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .slice(0, 40);
    }
    const filterName = profesorStatsFilteredCategory || 'Todas';
    const filename = `linguizate_reporte_${sanitizeFilename(filterName)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    showNotification('Reporte Excel descargado correctamente', 'success');
}

// Cargar panel de administración
async function refreshAdminData() {
    const [userData, categoryData, questionData] = await Promise.all([
        LinguizateAPI.get('/admin/dashboard'),
        LinguizateAPI.get('/admin/categories'),
        LinguizateAPI.get('/admin/questions')
    ]);
    users = userData.users || [];
    users.forEach(user => { if (user.isProfesor) user.personalCategories = []; });
    (categoryData.categories || []).filter(category => category.isPersonal).forEach(category => {
        const owner = users.find(user => String(user.id) === String(category.profesorId));
        if (owner) owner.personalCategories.push({
            ...category,
            questions: category.questions || category.subcategories?.[0]?.questions || []
        });
    });
    questions = {};
    (questionData.questions || []).forEach(question => {
        const key = question.subcategoryId;
        if (!questions[key]) questions[key] = [];
        questions[key].push(question);
    });
}

async function refreshProfessorData() {
    if (!currentProfesor) return;
    const [categoryData, statsData] = await Promise.all([
        LinguizateAPI.get('/professor/categories'),
        LinguizateAPI.get('/professor/statistics')
    ]);
    currentProfesor.personalCategories = (categoryData.categories || []).map(category => ({
        ...category,
        questions: category.questions || category.subcategories?.[0]?.questions || []
    }));
    currentProfesor.stats = statsData.statistics || [];
}

async function syncPendingGames() {
    if (!currentUser) return;
    const pending = JSON.parse(localStorage.getItem('linguizate_pending_games') || '[]');
    if (!pending.length) return;
    const remaining = [];
    for (const game of pending) {
        try { await LinguizateAPI.post('/games', game); } catch (_error) { remaining.push(game); }
    }
    localStorage.setItem('linguizate_pending_games', JSON.stringify(remaining));
}

function loadAdminPanel() {
    loadQuestionsTab();
    loadCategoriesTab();
    loadUsersTab();
    loadVistaGlobalTab();
}

// Filtrar preguntas del admin
function filterAdminQuestions() {
    const searchTerm = (document.getElementById('search-questions-admin')?.value || '').toLowerCase();
    const difficultyFilter = (document.getElementById('filter-difficulty-admin')?.value || '').toLowerCase();
    const categoryFilter = (document.getElementById('filter-category-admin')?.value || '').toLowerCase();
    const accuracyFilter = (document.getElementById('filter-accuracy-admin')?.value || '').toLowerCase();

    const container = document.getElementById('questions-list');
    if (!container) return;

    const rows = container.querySelectorAll('tbody tr.admin-question-row');
    if (!rows || rows.length === 0) return;

    var hasVisible = false;
    rows.forEach(row => {
        const questionText = (row.dataset.questionText || '').toLowerCase();
        const difficulty = (row.dataset.difficulty || '').toLowerCase();
        const categoryId = (row.dataset.categoryId || '').toLowerCase();
        const accBucket = (row.dataset.accuracyBucket || '').toLowerCase();

        const matchesSearch = !searchTerm || questionText.includes(searchTerm);
        const matchesDifficulty = !difficultyFilter || difficulty === difficultyFilter;
        const matchesCategory = !categoryFilter || categoryId === categoryFilter;
        const matchesAccuracy = !accuracyFilter || accBucket === accuracyFilter;

        const visible = matchesSearch && matchesDifficulty && matchesCategory && matchesAccuracy;
        row.style.display = visible ? 'table-row' : 'none';
        if (visible) hasVisible = true;
    });

    var emptyEl = document.getElementById('admin-questions-empty-filter');
    if (!emptyEl) {
        emptyEl = document.createElement('p');
        emptyEl.id = 'admin-questions-empty-filter';
        emptyEl.className = 'empty-message';
        emptyEl.textContent = 'No se encontraron preguntas con los filtros actuales.';
        container.appendChild(emptyEl);
    }
    if (hasVisible) emptyEl.style.display = 'none';
    else emptyEl.style.display = 'block';
}

// Cargar pestaña de preguntas
function loadQuestionsTab() {
    const container = document.getElementById('questions-list');
    container.innerHTML = '';

    if (!questions || Object.keys(questions).length === 0) {
        container.innerHTML = '<p class="empty-message">No hay preguntas disponibles</p>';
        return;
    }

    // Precalcular % acierto global por questionId (a partir de gameHistory.questionResults)
    var questionStatsMap = {};
    users.forEach(function (u) {
        var hist = u && Array.isArray(u.gameHistory) ? u.gameHistory : [];
        hist.forEach(function (h) {
            if (!h || !Array.isArray(h.questionResults)) return;
            h.questionResults.forEach(function (r) {
                if (!r || !r.questionId) return;
                if (!questionStatsMap[r.questionId]) {
                    questionStatsMap[r.questionId] = { correct: 0, attempts: 0, timeSum: 0, timeCount: 0, lastDate: null };
                }
                var m = questionStatsMap[r.questionId];
                m.attempts += 1;
                if (r.isCorrect) m.correct += 1;
                if (r.responseTimeSeconds != null && !isNaN(Number(r.responseTimeSeconds))) {
                    m.timeSum += Number(r.responseTimeSeconds);
                    m.timeCount += 1;
                }
                if (h.date && (!m.lastDate || String(h.date) > String(m.lastDate))) m.lastDate = h.date;
            });
        });
    });

    function getDifficultyLabel(d) {
        if (d === 'facil') return 'Fácil';
        if (d === 'medio') return 'Medio';
        if (d === 'dificil') return 'Difícil';
        return d || '—';
    }

    const table = document.createElement('table');
    table.className = 'admin-data-table admin-dense-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>ID</th>
                <th>Enunciado</th>
                <th>Categoría</th>
                <th>Dificultad</th>
                <th>Género (ref.)</th>
                <th>% Precisión</th>
                <th>Tiempo resp. (s)</th>
                <th>Último intento</th>
                <th>Acciones</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    Object.keys(questions).forEach(function (subcategoryId) {
        const subcategoryQuestions = questions[subcategoryId] || [];
        const category = categories.find(cat => cat.subcategories.some(sub => sub.id === subcategoryId));
        const subcategory = category ? category.subcategories.find(sub => sub.id === subcategoryId) : null;

        if (!subcategory || subcategoryQuestions.length === 0) return;

        subcategoryQuestions.forEach(function (question, index) {
            const qId = question && question.id ? question.id : `${subcategoryId}_${index}`;
            const stats = questionStatsMap[qId] || { correct: 0, attempts: 0, timeSum: 0, timeCount: 0, lastDate: null };
            const accuracy = stats.attempts > 0 ? (stats.correct / stats.attempts) * 100 : null;
            const accuracyText = accuracy != null ? accuracy.toFixed(1) + '%' : '-';
            const avgQTime = stats.timeCount > 0 ? (stats.timeSum / stats.timeCount).toFixed(2) : '—';
            const lastAttempt = stats.lastDate ? formatStatsDate(stats.lastDate) : '—';
            var accBucket = 'none';
            if (accuracy != null) {
                if (accuracy > 80) accBucket = 'high';
                else if (accuracy >= 50) accBucket = 'mid';
                else accBucket = 'low';
            }

            const difficultyClass = 'difficulty-' + String(question.difficulty || '');
            const difficultyLabel = getDifficultyLabel(question.difficulty);
            const categoryText = category ? `${category.name} - ${subcategory.name}` : subcategory.name;
            const enunciado = String(question.question || '');
            const safeSubcatId = String(subcategoryId).replace(/'/g, '\\\'');

            const tr = document.createElement('tr');
            tr.className = 'admin-question-row';
            tr.dataset.questionText = enunciado;
            tr.dataset.difficulty = String(question.difficulty || '');
            tr.dataset.categoryId = String(subcategoryId);
            tr.dataset.accuracyBucket = accBucket;

            tr.innerHTML = `
                <td>${escapeHtml(String(qId))}</td>
                <td class="td-truncate" title="${escapeHtml(enunciado)}">${escapeHtml(enunciado)}</td>
                <td>${escapeHtml(categoryText)}</td>
                <td><span class="difficulty-badge ${difficultyClass}">${escapeHtml(difficultyLabel)}</span></td>
                <td title="Agregado en jugadores">Mixto</td>
                <td>${escapeHtml(accuracyText)}</td>
                <td>${escapeHtml(avgQTime)}</td>
                <td>${escapeHtml(lastAttempt)}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn-icon btn-edit" onclick="openEditQuestionModal('${safeSubcatId}', ${index})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon btn-delete" onclick="confirmDeleteQuestion('${safeSubcatId}', ${index})" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });

    // Limpiar mensaje vacío anterior si existía
    const oldEmpty = document.getElementById('admin-questions-empty-filter');
    if (oldEmpty) oldEmpty.remove();

    container.appendChild(table);
    filterAdminQuestions();
}

// Crear tarjeta de pregunta
function createQuestionCard(question, subcategoryId, index) {
    const card = document.createElement('div');
    card.className = 'admin-question-card';
    card.innerHTML = `
        <div class="question-card-header">
            <span class="question-number">#${index + 1}</span>
            <span class="difficulty-badge difficulty-${question.difficulty}">${question.difficulty}</span>
        </div>
        <div class="question-card-body">
            <p class="question-text">${question.question}</p>
            <div class="question-info">
                <span><i class="fas fa-check-circle"></i> Opción ${question.correct + 1}</span>
                <span><i class="fas fa-list"></i> ${question.options.length} opciones</span>
            </div>
        </div>
        <div class="question-card-actions">
            <button class="btn-icon btn-edit" onclick="openEditQuestionModal('${subcategoryId}', ${index})" title="Editar">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon btn-delete" onclick="confirmDeleteQuestion('${subcategoryId}', ${index})" title="Eliminar">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    return card;
}

function filterAdminCategoriesTable() {
    const q = (document.getElementById('admin-categories-search')?.value || '').toLowerCase();
    document.querySelectorAll('#categories-list tr.admin-category-row').forEach(tr => {
        const hay = (tr.dataset.search || '').toLowerCase();
        tr.style.display = (!q || hay.includes(q)) ? 'table-row' : 'none';
    });
}

// Cargar pestaña de categorías (Admin) — tablas de alta densidad
function loadCategoriesTab() {
    const container = document.getElementById('categories-list');
    container.innerHTML = '';

    const hSys = document.createElement('h3');
    hSys.className = 'categories-section-title';
    hSys.innerHTML = '<i class="fas fa-shield-alt"></i> Categorías del sistema (protegidas)';
    container.appendChild(hSys);

    if (!categories || categories.length === 0) {
        const p = document.createElement('p');
        p.className = 'empty-message';
        p.textContent = 'No hay categorías del sistema disponibles';
        container.appendChild(p);
    } else {
        const tableSys = document.createElement('table');
        tableSys.className = 'admin-data-table admin-dense-table';
        tableSys.innerHTML = '<thead><tr><th>Categoría</th><th>Subcategoría</th><th>Género (sesiones)</th><th>% Precisión</th><th>Tiempo resp. (s)</th><th>Última partida</th><th># Preguntas</th></tr></thead><tbody></tbody>';
        const tbSys = tableSys.querySelector('tbody');
        categories.forEach(category => {
            category.subcategories.forEach(sub => {
                const n = questions[sub.id]?.length || 0;
                const agg = aggregateHistoryForSubcategoryLabel(category.name, sub.name);
                const tr = document.createElement('tr');
                tr.className = 'admin-category-row';
                tr.dataset.search = ((category.name || '') + ' ' + (sub.name || '')).toLowerCase();
                tr.innerHTML = `<td>${escapeHtml(category.name)}</td><td><i class="${escapeHtml(sub.icon || '')}" aria-hidden="true"></i> ${escapeHtml(sub.name)}</td><td>${escapeHtml(agg.genTxt)}</td><td>${escapeHtml(agg.prec)}</td><td>${escapeHtml(agg.avgT)}</td><td>${escapeHtml(agg.lastTxt)}</td><td>${n}</td>`;
                tbSys.appendChild(tr);
            });
        });
        container.appendChild(tableSys);
    }

    const hPer = document.createElement('h3');
    hPer.className = 'categories-section-title';
    hPer.style.marginTop = '1.5rem';
    hPer.innerHTML = '<i class="fas fa-user-graduate"></i> Categorías personales de profesores';
    container.appendChild(hPer);

    const tablePer = document.createElement('table');
    tablePer.className = 'admin-data-table admin-dense-table';
    tablePer.innerHTML = '<thead><tr><th>Profesor</th><th>Categoría</th><th>Género</th><th>% Precisión</th><th>Tiempo (s)</th><th>Última partida</th><th># Preg</th><th>Código</th><th>Estado</th><th>Acciones</th></tr></thead><tbody></tbody>';
    const tbPer = tablePer.querySelector('tbody');
    let hasPersonal = false;
    users.forEach(user => {
        if (!user.isProfesor || !user.personalCategories) return;
        user.personalCategories.forEach(category => {
            hasPersonal = true;
            const qCount = category.questions ? category.questions.length : 0;
            const isApproved = category.approved !== false;
            const safePid = String(user.id).replace(/'/g, '\\\'');
            const safeCid = String(category.id).replace(/'/g, '\\\'');
            const tr = document.createElement('tr');
            tr.className = 'admin-category-row personal';
            tr.dataset.search = (
                (user.name || '') + ' ' + (category.name || '') + ' ' + (category.accessCode || '') + ' ' + (category.description || '')
            ).toLowerCase();
            let actions = '';
            if (!isApproved) {
                actions = `<button type="button" class="btn-icon btn-approve" onclick="approveCategory('${safePid}', '${safeCid}')" title="Aprobar"><i class="fas fa-check"></i></button>
                    <button type="button" class="btn-icon btn-reject" onclick="rejectCategory('${safePid}', '${safeCid}')" title="Rechazar"><i class="fas fa-times"></i></button>`;
            }
            var aggP = aggregateHistoryForSubcategoryLabel(category.name, category.name);
            tr.innerHTML = `
                <td>${escapeHtml(user.name)}</td>
                <td>${escapeHtml(category.name)}</td>
                <td>${escapeHtml(aggP.genTxt)}</td>
                <td>${escapeHtml(aggP.prec)}</td>
                <td>${escapeHtml(aggP.avgT)}</td>
                <td>${escapeHtml(aggP.lastTxt)}</td>
                <td>${qCount}</td>
                <td><code>${escapeHtml(category.accessCode || '—')}</code></td>
                <td>${isApproved ? 'Aprobada' : 'Pendiente'}</td>
                <td><div class="table-actions">${actions}</div></td>
            `;
            tbPer.appendChild(tr);
        });
    });
    if (!hasPersonal) {
        const p = document.createElement('p');
        p.className = 'empty-message';
        p.textContent = 'No hay categorías personales de profesores aún';
        container.appendChild(p);
    } else {
        container.appendChild(tablePer);
    }

    filterAdminCategoriesTable();
}

// Vista Global (Admin): espejo del contenido de todos los profesores
function loadVistaGlobalTab() {
    const container = document.getElementById('vista-global-tab');
    if (!container) return;

    // Destruir instancias previas para evitar renderizaciones duplicadas
    if (adminChartDominio) { adminChartDominio.destroy(); adminChartDominio = null; }
    if (adminChartEvolucion) { adminChartEvolucion.destroy(); adminChartEvolucion = null; }
    if (adminChartDemografia) { adminChartDemografia.destroy(); adminChartDemografia = null; }

    if (typeof Chart === 'undefined') {
        container.innerHTML = '<p class="empty-message">Chart.js no está cargado.</p>';
        return;
    }

    // Obtener colores desde CSS para modo oscuro
    function cssVar(name) {
        try {
            return getComputedStyle(document.body).getPropertyValue(name).trim();
        } catch (e) {
            return '';
        }
    }
    var isDark = document.body.getAttribute('data-theme') === 'dark';
    var textPrimary = isDark ? '#E2E8F0' : (cssVar('--text-primary') || '#111827');
    var textSecondary = isDark ? '#94A3B8' : (cssVar('--text-secondary') || '#e5e7eb');
    var gridLine = isDark ? 'rgba(226, 232, 240, 0.1)' : 'rgba(148, 163, 184, 0.2)';
    var donutBorder = isDark ? 'rgba(226, 232, 240, 0.12)' : 'rgba(255,255,255,0.15)';

    // 1) Dominio por rama (7 ramas) usando gameHistory de estudiantes/profesores
    var branchLabels = [
        { key: 'Fonética/Fonología', match: ['fon'] },
        { key: 'Morfología', match: ['morf'] },
        { key: 'Sintaxis', match: ['sint'] },
        { key: 'Semántica', match: ['sem'] },
        { key: 'Pragmática', match: ['prag'] },
        { key: 'Dialectología', match: ['dial'] },
        { key: 'Gramática Histórica', match: ['hist'] }
    ];

    function getBranchLabel(categoryName) {
        var c = (categoryName || '').toLowerCase();
        for (var i = 0; i < branchLabels.length; i++) {
            var b = branchLabels[i];
            for (var j = 0; j < b.match.length; j++) {
                if (c.includes(b.match[j])) return b.key;
            }
        }
        return null;
    }

    var branchCorrect = {};
    var branchTotal = {};
    branchLabels.forEach(b => { branchCorrect[b.key] = 0; branchTotal[b.key] = 0; });

    users.forEach(u => {
        var hist = u && Array.isArray(u.gameHistory) ? u.gameHistory : [];
        hist.forEach(h => {
            var branch = getBranchLabel(h.categoryName);
            if (!branch) return;
            var ca = h.correctAnswers != null ? h.correctAnswers : 0;
            var ia = h.incorrectAnswers != null ? h.incorrectAnswers : 0;
            branchCorrect[branch] += ca;
            branchTotal[branch] += (ca + ia);
        });
    });

    var dominioLabels = branchLabels.map(b => b.key);
    var dominioData = dominioLabels.map(l => {
        var total = branchTotal[l] || 0;
        return total > 0 ? (branchCorrect[l] / total) * 100 : 0;
    });

    // 2) Evolución de Usuario (partidas por día, último mes)
    var now = new Date();
    var start = new Date(now);
    start.setDate(start.getDate() - 29);

    function isoDateKey(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    var labelsDates = [];
    var dateKeys = [];
    for (var k = 0; k < 30; k++) {
        var tmp = new Date(start);
        tmp.setDate(start.getDate() + k);
        labelsDates.push(tmp.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }));
        dateKeys.push(isoDateKey(tmp));
    }

    var gamesPerDay = {};
    dateKeys.forEach(key => gamesPerDay[key] = 0);

    users.forEach(u => {
        var hist = u && Array.isArray(u.gameHistory) ? u.gameHistory : [];
        hist.forEach(h => {
            if (!h || !h.date) return;
            var dt = new Date(h.date);
            if (isNaN(dt.getTime())) return;
            if (dt < start || dt > now) return;
            var key = isoDateKey(dt);
            if (gamesPerDay[key] != null) gamesPerDay[key] += 1;
        });
    });

    var evolucionData = dateKeys.map(k => gamesPerDay[k] || 0);

    // 3) Composición Demográfica (donut)
    var genderCounts = { masculino: 0, femenino: 0, neutro: 0, otro: 0 };
    users.forEach(u => {
        var g = (u && u.gender) ? String(u.gender).toLowerCase() : 'neutro';
        if (g === 'otro') genderCounts.otro += 1;
        else if (genderCounts[g] != null) genderCounts[g] += 1;
        else genderCounts.neutro += 1;
    });

    var donutLabels = ['Masculino', 'Femenino', 'Otro', 'Neutro'];
    var donutData = [genderCounts.masculino, genderCounts.femenino, genderCounts.otro, genderCounts.neutro];

    // Render charts
    var canvasDominio = document.getElementById('chart-dominio-rama');
    var canvasEvolucion = document.getElementById('chart-evolucion-dia');
    var canvasDemografia = document.getElementById('chart-composicion-demografica');
    if (!canvasDominio || !canvasEvolucion || !canvasDemografia) return;

    // 1) Barras (horizontal)
    adminChartDominio = new Chart(canvasDominio.getContext('2d'), {
        type: 'bar',
        data: {
            labels: dominioLabels,
            datasets: [{
                label: '% de aciertos',
                data: dominioData,
                backgroundColor: ['#7c3aed', '#6366f1', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#ec4899'],
                borderWidth: 0
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            return `${ctx.parsed.x.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: textSecondary }, grid: { color: gridLine } },
                y: { ticks: { color: textPrimary }, grid: { display: false } }
            }
        }
    });

    // 2) Líneas (evolución)
    adminChartEvolucion = new Chart(canvasEvolucion.getContext('2d'), {
        type: 'line',
        data: {
            labels: labelsDates,
            datasets: [{
                label: 'Partidas jugadas',
                data: evolucionData,
                borderColor: '#7c3aed',
                backgroundColor: 'rgba(124, 58, 237, 0.15)',
                fill: true,
                tension: 0.35,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { ticks: { color: textSecondary }, grid: { color: gridLine } },
                y: { ticks: { color: textSecondary }, grid: { color: gridLine } }
            }
        }
    });

    // 3) Donut (demografía)
    adminChartDemografia = new Chart(canvasDemografia.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: donutLabels,
            datasets: [{
                data: donutData,
                backgroundColor: ['#7c3aed', '#3b82f6', '#f97316', '#10b981'],
                borderColor: donutBorder,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: textPrimary } }
            }
        }
    });
}

async function adminDeleteProfessorCategory(profesorId, categoryId) {
    {
        if (!confirm('¿Eliminar esta categoría creada por el profesor? Esta acción no se puede deshacer.')) return;
        try {
            await LinguizateAPI.delete(`/admin/professor-categories/${encodeURIComponent(categoryId)}`);
            await refreshAdminData();
            loadVistaGlobalTab();
            showNotification('Categoría eliminada', 'success');
        } catch (error) { showNotification(error.message, 'error'); }
        return;
    }
    if (!confirm('¿Eliminar esta categoría creada por el profesor? Esta acción no se puede deshacer.')) return;
    const pid = parseInt(profesorId, 10);
    const user = users.find(u => u.id === pid || u.id === profesorId);
    if (!user || !user.personalCategories) return;
    const idx = user.personalCategories.findIndex(c => c.id === categoryId);
    if (idx === -1) return;
    user.personalCategories.splice(idx, 1);
    saveDataToLocalStorage();
    loadVistaGlobalTab();
    showNotification('Categoría eliminada', 'success');
}

// Cargar pestaña de usuarios
function loadUsersTab() {
    const container = document.getElementById('users-list');
    container.innerHTML = '';

    if (!users || users.length === 0) {
        container.innerHTML = '<p class="empty-message">No hay usuarios registrados</p>';
        return;
    }

    const regSelect = document.getElementById('admin-users-reg-filter');
    if (regSelect) {
        const prev = regSelect.value;
        regSelect.innerHTML = '<option value="">Todas las fechas de registro</option>';
        const months = new Set();
        users.forEach(u => {
            if (u.createdAt && u.createdAt.length >= 7) months.add(u.createdAt.slice(0, 7));
        });
        Array.from(months).sort().reverse().forEach(m => {
            const o = document.createElement('option');
            o.value = m;
            o.textContent = m;
            regSelect.appendChild(o);
        });
        if (prev && Array.from(regSelect.options).some(o => o.value === prev)) regSelect.value = prev;
    }

    const sortedUsers = [...users].sort((a, b) => (b.score || 0) - (a.score || 0));

    const table = document.createElement('table');
    table.className = 'admin-data-table admin-dense-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>ID</th>
                <th>Avatar</th>
                <th>Nombre</th>
                <th>Género</th>
                <th>Correo</th>
                <th>Puntos</th>
                <th>Rango</th>
                <th>% Aciertos</th>
                <th>Fecha registro</th>
                <th>Tiempo resp. (s)</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    sortedUsers.forEach((user) => {
        const gender = user.gender || 'neutro';
        const points = user.score || 0;
        const range = getLinguisticRank(points, user.id, gender);
        const avatarSrc = getAvatarUrl(user);
        const m = getUserAggregateMetrics(user);
        const accPct = m.accuracy;
        const accText = accPct != null ? accPct.toFixed(1) + '%' : '—';
        let accBucket = 'none';
        if (accPct != null) {
            if (accPct > 80) accBucket = 'high';
            else if (accPct >= 50) accBucket = 'mid';
            else accBucket = 'low';
        }
        const avgT = m.avgResponse;
        let timeBucket = 'none';
        if (avgT != null) {
            if (avgT < 10) timeBucket = 'fast';
            else if (avgT <= 20) timeBucket = 'mid';
            else timeBucket = 'slow';
        }
        const regMonth = (user.createdAt && user.createdAt.length >= 7) ? user.createdAt.slice(0, 7) : '';
        const regText = user.createdAt ? formatStatsDate(user.createdAt) : '—';
        const timeText = avgT != null ? avgT.toFixed(1) : '—';

        const tr = document.createElement('tr');
        tr.className = 'admin-user-row';
        tr.dataset.name = String(user.name || '').toLowerCase();
        tr.dataset.email = String(user.email || '').toLowerCase();
        tr.dataset.gender = String(gender || '').toLowerCase();
        tr.dataset.accuracyBucket = accBucket;
        tr.dataset.regMonth = regMonth;
        tr.dataset.timeBucket = timeBucket;

        tr.innerHTML = `
            <td>${escapeHtml(String(user.id))}</td>
            <td class="users-avatar-cell">
                <img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(user.name || '')}">
            </td>
            <td>${escapeHtml(user.name || '')}</td>
            <td>${escapeHtml(gender)}</td>
            <td>${escapeHtml(user.email || '')}</td>
            <td>${escapeHtml(String(points))}</td>
            <td>${escapeHtml(range)}</td>
            <td>${escapeHtml(accText)}</td>
            <td>${escapeHtml(regText)}</td>
            <td>${escapeHtml(timeText)}</td>
        `;
        tbody.appendChild(tr);
    });

    container.appendChild(table);
    filterAdminUsersTable();
}

// Filtrar tabla de usuarios (búsqueda + género + % aciertos + mes registro + tiempo)
function filterAdminUsersTable() {
    const container = document.getElementById('users-list');
    if (!container) return;

    const searchEl = document.getElementById('admin-users-search');
    const genderEl = document.getElementById('admin-users-gender-filter');
    const accEl = document.getElementById('admin-users-accuracy-filter');
    const regEl = document.getElementById('admin-users-reg-filter');
    const timeEl = document.getElementById('admin-users-time-filter');

    const searchTerm = (searchEl && searchEl.value ? searchEl.value : '').toLowerCase();
    const genderFilter = (genderEl && genderEl.value ? genderEl.value : '').toLowerCase();
    const accFilter = (accEl && accEl.value ? accEl.value : '').toLowerCase();
    const regFilter = (regEl && regEl.value ? regEl.value : '').toLowerCase();
    const timeFilter = (timeEl && timeEl.value ? timeEl.value : '').toLowerCase();

    const rows = container.querySelectorAll('tbody tr.admin-user-row');
    if (!rows || rows.length === 0) return;

    rows.forEach(row => {
        const name = row.dataset.name || '';
        const email = row.dataset.email || '';
        const gender = row.dataset.gender || '';
        const accB = (row.dataset.accuracyBucket || '').toLowerCase();
        const regM = (row.dataset.regMonth || '').toLowerCase();
        const timeB = (row.dataset.timeBucket || '').toLowerCase();

        const matchesSearch = !searchTerm || name.includes(searchTerm) || email.includes(searchTerm);
        const matchesGender = !genderFilter || gender === genderFilter;
        const matchesAcc = !accFilter || accB === accFilter;
        const matchesReg = !regFilter || regM === regFilter;
        const matchesTime = !timeFilter || timeB === timeFilter;

        row.style.display = (matchesSearch && matchesGender && matchesAcc && matchesReg && matchesTime) ? 'table-row' : 'none';
    });
}

// Cambiar pestaña
function switchTab(tabName) {
    document.querySelectorAll('.tab-panel').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const tabEl = document.getElementById(`${tabName}-tab`);
    if (tabEl) tabEl.classList.add('active');
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');
    if (tabName === 'vista-global') loadVistaGlobalTab();
}

// Cargar pantalla Mis Resultados (historial del estudiante)
function loadMisResultadosScreen() {
    var profileWrap = document.getElementById('mis-resultados-profile');
    if (profileWrap) {
        if (currentUser && currentUserType === 'estudiante') {
            profileWrap.style.display = 'flex';
            var av = document.getElementById('mis-resultados-avatar');
            var nameEl = document.getElementById('mis-resultados-profile-name');
            if (av) av.src = getAvatarUrl(currentUser);
            if (nameEl) nameEl.textContent = currentUser.name;
            var btnAvatar = document.getElementById('btn-avatar-mis-resultados');
            if (btnAvatar) btnAvatar.onclick = openAvatarModal;
        } else {
            profileWrap.style.display = 'none';
        }
    }
    var container = document.getElementById('mis-resultados-list');
    if (!container) return;
    container.innerHTML = '';
    var totalScore = currentUser ? (currentUser.score || 0) : 0;
    var rank = getLinguisticRank(totalScore, currentUser ? currentUser.id : 0, currentUser ? currentUser.gender : 'neutro');
    var rankBlock = document.createElement('div');
    rankBlock.className = 'mis-resultados-rank';
    rankBlock.innerHTML = '<strong>Tu rango lingüístico:</strong> <span class="rank-badge">' + escapeHtml(rank) + '</span> <span class="rank-score">(' + totalScore + ' pts acumulados)</span>';
    container.appendChild(rankBlock);
    var history = (currentUser && currentUser.gameHistory) ? currentUser.gameHistory : [];
    if (history.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'empty-message';
        empty.textContent = 'Aún no tienes partidas registradas. ¡Juega para ver aquí tu historial!';
        container.appendChild(empty);
        return;
    }
    var sorted = history.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var table = document.createElement('table');
    table.className = 'profesor-stats-table';
    table.innerHTML = '<thead><tr><th>Categoría</th><th>Puntaje</th><th>Fecha</th></tr></thead><tbody></tbody>';
    var tbody = table.querySelector('tbody');
    sorted.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + escapeHtml(r.categoryName) + '</td><td>' + r.score + ' pts</td><td>' + formatStatsDate(r.date) + '</td>';
        tbody.appendChild(tr);
    });
    container.appendChild(table);
}

// Mostrar ranking (tabla con medallas top 3)
function showRanking() {
    const tbody = document.getElementById('ranking-list');
    if (!tbody) return;
    tbody.innerHTML = '';

    const sortedUsers = [...users].sort((a, b) => b.score - a.score);

    const medalIcons = { 1: 'fa-medal', 2: 'fa-medal', 3: 'fa-medal' };
    const medalClasses = { 1: 'medal-gold', 2: 'medal-silver', 3: 'medal-bronze' };

    sortedUsers.forEach((user, index) => {
        const pos = index + 1;
        const medal = medalIcons[pos];
        const medalClass = medalClasses[pos];
        const cellContent = medal
            ? `<span class="ranking-medal ${medalClass}"><i class="fas ${medal}"></i></span><span class="ranking-pos-num">${pos}</span>`
            : pos;

        const rank = getLinguisticRank(user.score || 0, user.id, user.gender || 'neutro');
        const avatarSrc = getAvatarUrl(user);
        const tr = document.createElement('tr');
        tr.className = pos <= 3 ? 'ranking-row-top' : '';
        tr.innerHTML = `
            <td class="ranking-col-pos">${cellContent}</td>
            <td class="ranking-col-avatar"><img class="ranking-avatar" src="${escapeHtml(avatarSrc)}" alt=""></td>
            <td class="ranking-col-name">${escapeHtml(user.name)}</td>
            <td class="ranking-col-rank">${escapeHtml(rank)}</td>
            <td class="ranking-col-score">${user.score} pts</td>
        `;
        tbody.appendChild(tr);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Mostrar explicación. onClose: se llama al cerrar (X, Continuar o fuera); el tiempo no avanza hasta entonces.
function showExplanation(explanation, isCorrect, question, onClose) {
    const explanationModal = document.createElement('div');
    explanationModal.className = 'explanation-modal';
    const chatContext = question ? { text: question.question, explanation: question.explanation } : null;
    let closed = false;
    function closeAndAdvance() {
        if (closed) return;
        closed = true;
        stopSfxByType('timer_low');
        if (explanationModal.parentNode) explanationModal.remove();
        if (typeof onClose === 'function') onClose();
    }
    explanationModal.innerHTML = `
        <div class="explanation-content">
            <div class="explanation-header">
                <i class="fas ${isCorrect ? 'fa-check-circle success' : 'fa-times-circle error'}"></i>
                <h3>${isCorrect ? '¡Correcto!' : 'Incorrecto'}</h3>
                <button class="explanation-close" type="button" aria-label="Cerrar">&times;</button>
            </div>
            <div class="explanation-text">
                <p><strong>Explicación:</strong></p>
                <p>${explanation}</p>
            </div>
            ${chatContext ? (currentUser ? `
            <div class="explanation-ai-cta">
                <p>¿Necesitas más información?</p>
                <button type="button" class="btn-ai-chat btn-secondary">
                    <i class="fas fa-robot"></i> Chatear con la IA
                </button>
            </div>
            ` : `
            <div class="explanation-ai-guest-cta">
                <i class="fas fa-sparkles"></i>
                <p><strong>¿Quieres preguntarle a la IA?</strong></p>
                <p>Crea tu cuenta gratis y desbloquea el chat con la IA para resolver tus dudas en vivo sobre cada pregunta.</p>
                <button type="button" class="btn-goto-login btn-primary" data-action="login">Iniciar sesión / Registrarme</button>
            </div>
            `) : ''}
            <button type="button" class="explanation-continue btn-primary">Siguiente</button>
        </div>
    `;
    document.body.appendChild(explanationModal);
    explanationModal.querySelector('.explanation-close').addEventListener('click', closeAndAdvance);
    explanationModal.querySelector('.explanation-continue').addEventListener('click', closeAndAdvance);
    if (chatContext && currentUser) {
        var btnAi = explanationModal.querySelector('.btn-ai-chat');
        if (btnAi) btnAi.addEventListener('click', () => {
            if (closed) return;
            closed = true;
            explanationModal.remove();
            openAIChatModal(chatContext.text, chatContext.explanation, onClose);
        });
    }
    var btnGotoLogin = explanationModal.querySelector('.btn-goto-login');
    if (btnGotoLogin) {
        btnGotoLogin.addEventListener('click', () => {
            if (closed) return;
            closed = true;
            explanationModal.remove();
            if (typeof onClose === 'function') onClose();
            showScreen('login-screen');
        });
    }
    explanationModal.addEventListener('click', (e) => {
        if (e.target === explanationModal) closeAndAdvance();
    });
    setTimeout(() => { closeAndAdvance(); }, 120000);
}

// Abrir modal de chat con IA. onClose (opcional): se llama al cerrar para reanudar el juego.
function openAIChatModal(questionText, explanation, onClose) {
    audioPausedForReading = true;
    stopSfxByType('timer_low');
    pauseBackgroundMusic();
    const overlay = document.createElement('div');
    overlay.className = 'ai-chat-overlay';
    overlay.innerHTML = `
        <div class="ai-chat-modal">
            <div class="ai-chat-header">
                <h3><i class="fas fa-robot"></i> Chat con la IA</h3>
                <button type="button" class="ai-chat-close" aria-label="Cerrar">&times;</button>
            </div>
            <div class="ai-chat-context">
                <p><strong>Pregunta de la trivia:</strong></p>
                <p>${escapeHtml(questionText)}</p>
                <p><strong>Explicación:</strong></p>
                <p>${escapeHtml(explanation || '')}</p>
            </div>
            <div class="ai-chat-messages" id="ai-chat-messages"></div>
            <div class="ai-chat-input-bar">
                <input type="text" id="ai-chat-input" placeholder="Escribe tu pregunta o pide más detalles..." maxlength="500">
                <button type="button" id="ai-chat-send" class="btn-primary">
                    <i class="fas fa-paper-plane"></i> Enviar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const messagesEl = overlay.querySelector('#ai-chat-messages');
    const inputEl = overlay.querySelector('#ai-chat-input');
    const sendBtn = overlay.querySelector('#ai-chat-send');

    const apiUrl = (typeof window.LINGUIZATE_AI_API_URL === 'string' && window.LINGUIZATE_AI_API_URL.trim()) ? window.LINGUIZATE_AI_API_URL.trim() : '';
    const chatHistory = [];

    function appendMessage(role, content, isPlaceholder) {
        const div = document.createElement('div');
        div.className = `ai-chat-msg ai-chat-msg-${role}`;
        div.innerHTML = `<div class="ai-chat-msg-content">${escapeHtml(content)}</div>`;
        if (isPlaceholder) div.classList.add('ai-chat-msg-placeholder');
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    if (!apiUrl) {
        appendMessage('assistant', 'Para chatear con una IA en vivo, configura la URL de tu backend en el archivo script.js (variable LINGUIZATE_AI_API_URL). Tu backend debe aceptar POST con: question, explanation, userMessage y devolver { reply: "..." }. Mientras tanto, puedes repasar la explicación arriba o buscar más información en tus materiales.', true);
    }

    function sendMessage() {
        const text = (inputEl.value || '').trim();
        if (!text) return;
        inputEl.value = '';
        chatHistory.push({ role: 'user', content: text });
        appendMessage('user', text);
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        if (!apiUrl) {
            appendMessage('assistant', 'Activa el chat configurando LINGUIZATE_AI_API_URL en script.js con la URL de tu servicio de IA.', true);
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar';
            return;
        }

        fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question: questionText,
                explanation: explanation || '',
                userMessage: text,
                history: chatHistory.slice(-10)
            })
        })
            .then(res => res.json().then(data => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                const reply = (data && data.reply) ? data.reply : (data && data.message) ? data.message : 'No hubo respuesta.';
                chatHistory.push({ role: 'assistant', content: reply });
                appendMessage('assistant', reply);
                if (!ok && data && data.error) console.warn('API chat:', data.error);
            })
            .catch(() => {
                appendMessage('assistant', 'No se pudo conectar con el servidor de IA. Comprueba la URL y que tu backend esté en marcha.', true);
            })
            .finally(() => {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar';
            });
    }

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

    function closeChat() {
        overlay.remove();
        audioPausedForReading = false;
        playBackgroundMusicIfAllowed();
        if (typeof onClose === 'function') onClose();
    }
    overlay.querySelector('.ai-chat-close').addEventListener('click', closeChat);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeChat(); });
    inputEl.focus();
}

/** Rango lingüístico por puntaje y género ('masculino'|'femenino'|'neutro'). */
function getLinguisticRank(totalScore, seed, gender) {
    var score = Number(totalScore) || 0;
    var g = (gender || 'neutro').toLowerCase();
    if (g !== 'masculino' && g !== 'femenino') g = 'neutro';
    var levels = [
        {
            min: 0, max: 1500, titles: [
                { masculino: 'Fonetista en pañales', femenino: 'Fonetista en pañales', neutro: 'Fonetista en pañales' },
                { masculino: 'Balbuceador principiante', femenino: 'Balbuceadora principiante', neutro: 'Balbuceante principiante' },
                { masculino: 'Cazador de grafemas', femenino: 'Cazadora de grafemas', neutro: 'Cazador de grafemas' },
                { masculino: 'Articulador novato', femenino: 'Articuladora novata', neutro: 'Articulador novato' },
                { masculino: 'Buscador de lexemas', femenino: 'Buscadora de lexemas', neutro: 'Buscador de lexemas' }
            ]
        },
        {
            min: 1501, max: 5000, titles: [
                { masculino: 'Arquitecto de oraciones', femenino: 'Arquitecta de oraciones', neutro: 'Arquitecto de oraciones' },
                { masculino: 'Señor de los alófonos', femenino: 'Señora de los alófonos', neutro: 'Señor de los alófonos' },
                { masculino: 'Morfólogo de campo', femenino: 'Morfóloga de campo', neutro: 'Morfólogo de campo' },
                { masculino: 'Tejedor de sintagmas', femenino: 'Tejedora de sintagmas', neutro: 'Tejedor de sintagmas' },
                { masculino: 'Analista de raíces', femenino: 'Analista de raíces', neutro: 'Analista de raíces' }
            ]
        },
        {
            min: 5001, max: 15000, titles: [
                { masculino: 'Caballero de la etimología', femenino: 'Dama de la etimología', neutro: 'Custodio de la etimología' },
                { masculino: 'Guardián de la gramática', femenino: 'Guardiana de la gramática', neutro: 'Guardián de la gramática' },
                { masculino: 'Maestro de la pragmática', femenino: 'Maestra de la pragmática', neutro: 'Maestría de la pragmática' },
                { masculino: 'Ingeniero de corpus', femenino: 'Ingeniera de corpus', neutro: 'Ingeniería de corpus' },
                { masculino: 'Cronista de la lengua', femenino: 'Cronista de la lengua', neutro: 'Cronista de la lengua' }
            ]
        },
        {
            min: 15001, max: 9999999, titles: [
                { masculino: 'Heredero de Saussure', femenino: 'Heredera de Saussure', neutro: 'Herencia de Saussure' },
                { masculino: 'Eminencia de la lengua', femenino: 'Eminencia de la lengua', neutro: 'Eminencia de la lengua' },
                { masculino: 'Oráculo lingüístico', femenino: 'Oráculo lingüística', neutro: 'Oráculo lingüístico' },
                { masculino: 'Semiólogo supremo', femenino: 'Semióloga suprema', neutro: 'Semiólogo supremo' },
                { masculino: 'Sabio de la diacronía', femenino: 'Sabia de la diacronía', neutro: 'Sabiduría de la diacronía' }
            ]
        }
    ];
    var level = levels[levels.length - 1];
    for (var i = 0; i < levels.length; i++) {
        if (score >= levels[i].min && score <= levels[i].max) { level = levels[i]; break; }
    }
    var idx = (seed != null ? Math.abs(seed) % level.titles.length : 0);
    var title = level.titles[idx] || level.titles[0];
    return title[g] || title.neutro;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Establecer modo de juego y actualizar UI del selector
function setGameMode(mode) {
    currentMode = mode === 'estudio' ? 'estudio' : 'clasico';
    const cards = document.querySelectorAll('.mode-card');
    cards.forEach(card => {
        const cardMode = card.getAttribute('data-mode') || 'clasico';
        if (cardMode === currentMode) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
}

// Mostrar notificación
function showNotification(message, type = 'info') {
    const notifications = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    notifications.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Cambiar tema
function toggleTheme() {
    playSFX('toggle');
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);

    const icon = document.querySelector('#theme-toggle i');
    icon.className = currentTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';

    if (document.getElementById('progresos-screen') && document.getElementById('progresos-screen').classList.contains('active')) {
        loadProgresosScreen();
    }
    if (document.getElementById('vista-global-tab') && document.getElementById('vista-global-tab').classList.contains('active')) {
        loadVistaGlobalTab();
    }
}

// Cargar tema
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    currentTheme = savedTheme;
    document.body.setAttribute('data-theme', currentTheme);

    const icon = document.querySelector('#theme-toggle i');
    icon.className = currentTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

// Mostrar modal
function showModal(title, content) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-overlay').style.display = 'flex';
}

// Cerrar modal
function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

// Abrir modal para agregar pregunta (Profesor)
function openAddQuestionModalProfesor() {
    if (!currentProfesor.personalCategories || currentProfesor.personalCategories.length === 0) {
        showNotification('Primero debes crear una categoría personal', 'warning');
        setTimeout(() => {
            switchProfesorTab('mis-categorias');
        }, 1500);
        return;
    }

    const subcategoryOptions = currentProfesor.personalCategories.map(cat =>
        `<option value="${cat.id}">${cat.name}</option>`
    ).join('');

    const modalContent = `
        <form id="question-form" class="admin-form">
            <div class="form-group">
                <label for="question-subcategory">Mi Categoría *</label>
                <select id="question-subcategory" required>
                    <option value="">Seleccione una categoría personal</option>
                    ${subcategoryOptions}
                </select>
            </div>
            
            <div class="form-group">
                <label for="question-text">Pregunta *</label>
                <textarea id="question-text" rows="3" required placeholder="Escriba la pregunta aquí..."></textarea>
            </div>
            
            <div class="form-group">
                <label for="question-difficulty">Dificultad *</label>
                <select id="question-difficulty" required>
                    <option value="facil">Fácil</option>
                    <option value="medio">Medio</option>
                    <option value="dificil">Difícil</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Opciones de respuesta *</label>
                <div id="question-options">
                    <div class="option-row">
                        <input type="text" class="option-input" placeholder="Opción 1" required>
                        <label class="radio-label">
                            <input type="radio" name="correct-option" value="0" required>
                            Correcta
                        </label>
                    </div>
                    <div class="option-row">
                        <input type="text" class="option-input" placeholder="Opción 2" required>
                        <label class="radio-label">
                            <input type="radio" name="correct-option" value="1" required>
                            Correcta
                        </label>
                    </div>
                    <div class="option-row">
                        <input type="text" class="option-input" placeholder="Opción 3" required>
                        <label class="radio-label">
                            <input type="radio" name="correct-option" value="2" required>
                            Correcta
                        </label>
                    </div>
                    <div class="option-row">
                        <input type="text" class="option-input" placeholder="Opción 4" required>
                        <label class="radio-label">
                            <input type="radio" name="correct-option" value="3" required>
                            Correcta
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="form-group">
                <label for="question-explanation">Explicación</label>
                <textarea id="question-explanation" rows="3" placeholder="Explicación de la respuesta correcta..."></textarea>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary">Guardar Pregunta</button>
            </div>
        </form>
    `;

    showModal('Agregar Pregunta Personal', modalContent);

    setTimeout(() => {
        const form = document.getElementById('modal-body')?.querySelector('#question-form');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                saveNewQuestionProfesor();
            });
        }
    }, 0);
}

// Guardar datos en localStorage
function saveDataToLocalStorage() {
    return true;
}

// Cargar datos de localStorage
function loadDataFromLocalStorage() {
    return true;
}

// Exportar datos a JSON (para descarga)
function exportDataToJSON() {
    const data = {
        users: users,
        questions: questions,
        categories: categories,
        exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linguizate_backup_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification('Datos exportados correctamente', 'success');
}

/**
 * Export Excel para tesis:
 * - Sheet 1: Usuarios (incluye género y fecha de registro)
 * - Sheet 2: Logs de Partida (historial crudo de cada juego)
 */
function aggregateHistoryForSubcategoryLabel(categoryName, subName) {
    var tQ = 0;
    var tC = 0;
    var times = [];
    var last = null;
    var genders = { masculino: 0, femenino: 0, neutro: 0, otro: 0 };
    var catL = (categoryName || '').toLowerCase();
    var subL = (subName || '').toLowerCase();
    (users || []).forEach(function (u) {
        var g = (u.gender || 'neutro').toLowerCase();
        (u.gameHistory || []).forEach(function (h) {
            if (!h) return;
            var cn = (h.categoryName || '').toLowerCase();
            var match = (subL && cn.includes(subL)) || (catL && cn.includes(catL));
            if (!match) return;
            tQ += h.totalQuestions || 0;
            tC += h.correctAnswers || 0;
            if (h.avgResponseTimeSeconds != null && !isNaN(Number(h.avgResponseTimeSeconds))) {
                times.push(Number(h.avgResponseTimeSeconds));
            }
            if (h.date && (!last || String(h.date) > String(last))) last = h.date;
            if (g === 'otro') genders.otro += 1;
            else if (genders[g] != null) genders[g] += 1;
            else genders.neutro += 1;
        });
    });
    var prec = tQ > 0 ? ((tC / tQ) * 100).toFixed(1) + '%' : '—';
    var avgT = times.length ? (times.reduce(function (a, b) { return a + b; }, 0) / times.length).toFixed(2) : '—';
    var genTxt = 'M:' + genders.masculino + ' F:' + genders.femenino + ' O:' + genders.otro + ' N:' + genders.neutro;
    if (!tQ && !times.length && !last) genTxt = '—';
    var lastTxt = last ? formatStatsDate(last) : '—';
    return { prec: prec, avgT: avgT, lastTxt: lastTxt, genTxt: genTxt };
}

function exportThesisExcel() {
    if (typeof XLSX === 'undefined') {
        showNotification('La librería Excel no está cargada. Recarga la página e intenta de nuevo.', 'error');
        return;
    }

    if (!users || users.length === 0) {
        showNotification('No hay datos para exportar.', 'warning');
        return;
    }

    function sanitizeFilename(name) {
        return String(name || '')
            .trim()
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .slice(0, 40);
    }

    var usersRows = (users || []).map(function (u) {
        var gender = u.gender || 'neutro';
        var points = u.score || 0;
        var range = getLinguisticRank(points, u.id, gender);
        var m = typeof getUserAggregateMetrics === 'function' ? getUserAggregateMetrics(u) : {};
        var accU = m.accuracy != null ? m.accuracy.toFixed(1) + '%' : '—';
        var tU = m.avgResponse != null ? m.avgResponse.toFixed(2) : '—';
        return {
            'ID': u.id,
            'Avatar': getAvatarUrl(u),
            'Nombre': u.name || '',
            'Género': gender,
            'Correo': u.email || '',
            'Puntos': points,
            'Rango': range,
            '% Precisión Global': accU,
            'Tiempo Respuesta (s)': tU,
            'Fecha Registro': u.createdAt ? formatStatsDate(u.createdAt) : '-',
            'Partidas Jugadas': u.gamesPlayed || 0,
            'Es Profesor': u.isProfesor ? 'Sí' : 'No',
            'Es Estudiante': u.isEstudiante ? 'Sí' : 'No'
        };
    });

    var logsRows = [];
    (users || []).forEach(function (u) {
        var hist = u && Array.isArray(u.gameHistory) ? u.gameHistory : [];
        hist.forEach(function (h) {
            if (!h) return;
            var tq = h.totalQuestions != null ? Number(h.totalQuestions) : 0;
            var ca = h.correctAnswers != null ? Number(h.correctAnswers) : 0;
            var pctPartida = tq > 0 ? ((ca / tq) * 100).toFixed(1) + '%' : '—';
            logsRows.push({
                'Usuario': u.name || '',
                'Género': u.gender || 'neutro',
                'Categoría': h.categoryName || '-',
                'Aciertos': h.correctAnswers != null ? h.correctAnswers : '-',
                'Errores': h.incorrectAnswers != null ? h.incorrectAnswers : '-',
                '% Precisión Partida': pctPartida,
                'Tiempo de Respuesta (s)': h.avgResponseTimeSeconds != null ? Number(h.avgResponseTimeSeconds).toFixed(2) : '0.00',
                'Fecha': h.date ? formatStatsDate(h.date) : '-'
            });
        });
    });

    var wb = XLSX.utils.book_new();
    var wsUsers = XLSX.utils.json_to_sheet(usersRows);
    XLSX.utils.book_append_sheet(wb, wsUsers, 'Usuarios');

    var wsLogs = XLSX.utils.json_to_sheet(logsRows);
    XLSX.utils.book_append_sheet(wb, wsLogs, 'Logs Partida');

    var questionStatsExport = {};
    (users || []).forEach(function (u) {
        (u.gameHistory || []).forEach(function (h) {
            if (!h || !Array.isArray(h.questionResults)) return;
            h.questionResults.forEach(function (r) {
                if (!r || !r.questionId) return;
                if (!questionStatsExport[r.questionId]) {
                    questionStatsExport[r.questionId] = { correct: 0, attempts: 0, timeSum: 0, timeCount: 0, lastDate: null };
                }
                var m = questionStatsExport[r.questionId];
                m.attempts += 1;
                if (r.isCorrect) m.correct += 1;
                if (r.responseTimeSeconds != null && !isNaN(Number(r.responseTimeSeconds))) {
                    m.timeSum += Number(r.responseTimeSeconds);
                    m.timeCount += 1;
                }
                if (h.date && (!m.lastDate || String(h.date) > String(m.lastDate))) m.lastDate = h.date;
            });
        });
    });
    var qResearchRows = [];
    Object.keys(questions || {}).forEach(function (subcategoryId) {
        var subcategoryQuestions = questions[subcategoryId] || [];
        var category = categories.find(function (cat) { return cat.subcategories.some(function (sub) { return sub.id === subcategoryId; }); });
        var subcategory = category ? category.subcategories.find(function (sub) { return sub.id === subcategoryId; }) : null;
        if (!subcategory) return;
        subcategoryQuestions.forEach(function (question, index) {
            var qId = question && question.id ? question.id : subcategoryId + '_' + index;
            var st = questionStatsExport[qId] || { correct: 0, attempts: 0, timeSum: 0, timeCount: 0, lastDate: null };
            var acc = st.attempts > 0 ? ((st.correct / st.attempts) * 100).toFixed(1) + '%' : '—';
            var avgT = st.timeCount > 0 ? (st.timeSum / st.timeCount).toFixed(2) : '—';
            qResearchRows.push({
                'ID Pregunta': qId,
                'Categoría': category ? category.name + ' — ' + subcategory.name : subcategory.name,
                'Género (ref.)': 'Mixto (agregado)',
                '% Precisión Global': acc,
                'Tiempo Respuesta (s)': avgT,
                'Fecha último intento': st.lastDate ? formatStatsDate(st.lastDate) : '—'
            });
        });
    });
    if (qResearchRows.length > 0) {
        var wsQ = XLSX.utils.json_to_sheet(qResearchRows);
        XLSX.utils.book_append_sheet(wb, wsQ, 'Preguntas');
    }

    var filename = `linguizate_tesis_${sanitizeFilename(new Date().toISOString().slice(0, 10))}.xlsx`;
    XLSX.writeFile(wb, filename);
    showNotification('Excel de investigación descargado correctamente', 'success');
}

// Validar formulario de pregunta (ambos: profesor y admin)
function validateQuestionForm() {
    const modalBody = document.getElementById('modal-body');
    const form = modalBody ? modalBody.querySelector('#question-form') : null;
    const scope = form || document;
    const questionTextEl = scope.querySelector('#question-text');
    const questionText = questionTextEl ? questionTextEl.value.trim() : '';
    const optionInputs = scope.querySelectorAll('.option-input');
    const options = Array.from(optionInputs).map(input => input.value.trim()).filter(opt => opt);
    const correctOption = scope.querySelector('input[name="correct-option"]:checked');

    if (!questionText || questionText.length < 10) {
        showNotification('La pregunta debe tener al menos 10 caracteres', 'error');
        return false;
    }

    if (options.length < 2) {
        showNotification('Debe agregar al menos 2 opciones', 'error');
        return false;
    }

    if (options.length > 6) {
        showNotification('Máximo 6 opciones permitidas', 'error');
        return false;
    }

    // Verificar que no haya opciones duplicadas
    const uniqueOptions = new Set(options);
    if (uniqueOptions.size !== options.length) {
        showNotification('No puede haber opciones duplicadas', 'error');
        return false;
    }

    // Verificar que todas las opciones tengan contenido
    if (options.some(opt => opt.length === 0)) {
        showNotification('Todas las opciones deben tener contenido', 'error');
        return false;
    }

    if (!correctOption) {
        showNotification('Debe seleccionar una opción correcta', 'error');
        return false;
    }

    return true;
}

// Validar formulario de categoría
function validateCategoryForm() {
    const name = document.getElementById('category-name').value.trim();

    if (!name || name.length < 3) {
        showNotification('El nombre de la categoría debe tener al menos 3 caracteres', 'error');
        return false;
    }

    if (name.length > 50) {
        showNotification('El nombre de la categoría no puede exceder 50 caracteres', 'error');
        return false;
    }

    // Verificar que no exista una categoría con el mismo nombre
    if (currentProfesor && currentProfesor.personalCategories) {
        const exists = currentProfesor.personalCategories.some(cat =>
            cat.name.toLowerCase() === name.toLowerCase()
        );
        if (exists) {
            showNotification('Ya existe una categoría con ese nombre', 'error');
            return false;
        }
    }

    return true;
}

// Guardar nueva pregunta del profesor
async function saveNewQuestionProfesor() {
    {
        const scopeApi = document.getElementById('modal-body')?.querySelector('#question-form') || document;
        if (!validateQuestionForm()) return;
        const categoryIdApi = scopeApi.querySelector('#question-subcategory')?.value;
        const payloadApi = {
            question: scopeApi.querySelector('#question-text')?.value.trim(),
            difficulty: scopeApi.querySelector('#question-difficulty')?.value,
            explanation: scopeApi.querySelector('#question-explanation')?.value.trim() || '',
            options: Array.from(scopeApi.querySelectorAll('.option-input')).map(input => input.value.trim()),
            correct: Number(scopeApi.querySelector('input[name="correct-option"]:checked')?.value)
        };
        try {
            await LinguizateAPI.post(`/professor/categories/${encodeURIComponent(categoryIdApi)}/questions`, payloadApi);
            await refreshProfessorData();
            closeModal();
            loadProfesorQuestionsTab();
            loadProfesorCategoriesTab();
            showNotification('Pregunta personal agregada correctamente', 'success');
        } catch (error) { showNotification(error.message, 'error'); }
        return;
    }
    if (!currentProfesor || !currentProfesor.personalCategories) {
        showNotification('Sesión de profesor no válida', 'error');
        return;
    }
    const modalBody = document.getElementById('modal-body');
    const form = modalBody ? modalBody.querySelector('#question-form') : null;
    const scope = form || document;
    if (!validateQuestionForm()) return;

    const subcatEl = scope.querySelector('#question-subcategory');
    const questionTextEl = scope.querySelector('#question-text');
    const difficultyEl = scope.querySelector('#question-difficulty');
    const explanationEl = scope.querySelector('#question-explanation');
    const categoryId = subcatEl ? subcatEl.value : '';
    const questionText = questionTextEl ? questionTextEl.value.trim() : '';
    const difficulty = difficultyEl ? difficultyEl.value : 'facil';
    const explanation = explanationEl ? explanationEl.value.trim() : '';
    const optionInputs = scope.querySelectorAll('.option-input');
    const options = Array.from(optionInputs).map(input => input.value.trim()).filter(opt => opt);
    const correctRadio = scope.querySelector('input[name="correct-option"]:checked');
    const correctOption = correctRadio ? parseInt(correctRadio.value, 10) : 0;

    const category = currentProfesor.personalCategories.find(cat => cat.id === categoryId);
    if (!category) {
        showNotification('Categoría no encontrada', 'error');
        return;
    }

    if (!category.questions) {
        category.questions = [];
    }

    const newQuestion = {
        id: `prof_${currentProfesor.id}_${Date.now()}`,
        question: questionText,
        options: options,
        correct: correctOption,
        difficulty: difficulty,
        explanation: explanation || ''
    };

    category.questions.push(newQuestion);

    closeModal();
    loadProfesorQuestionsTab();
    loadProfesorCategoriesTab();
    showNotification('Pregunta personal agregada correctamente', 'success');

    // Actualizar en users
    const userIndex = users.findIndex(u => u.id === currentProfesor.id);
    if (userIndex !== -1) {
        users[userIndex] = currentProfesor;
    }

    // Guardar en localStorage
    saveDataToLocalStorage();
}

// Abrir modal para agregar pregunta (Admin)
function openAddQuestionModal() {
    const subcategories = [];
    categories.forEach(cat => {
        cat.subcategories.forEach(sub => {
            subcategories.push({
                id: sub.id,
                name: `${cat.name} - ${sub.name}`,
                categoryId: cat.id
            });
        });
    });

    const subcategoryOptions = subcategories.map(sub =>
        `<option value="${sub.id}">${sub.name}</option>`
    ).join('');

    const modalContent = `
        <form id="question-form" class="admin-form">
            <div class="form-group">
                <label for="question-subcategory">Subcategoría *</label>
                <select id="question-subcategory" required>
                    <option value="">Seleccione una subcategoría</option>
                    ${subcategoryOptions}
                </select>
            </div>
            
            <div class="form-group">
                <label for="question-text">Pregunta *</label>
                <textarea id="question-text" rows="3" required placeholder="Escriba la pregunta aquí..."></textarea>
            </div>
            
            <div class="form-group">
                <label for="question-difficulty">Dificultad *</label>
                <select id="question-difficulty" required>
                    <option value="facil">Fácil</option>
                    <option value="medio">Medio</option>
                    <option value="dificil">Difícil</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Opciones de respuesta *</label>
                <div id="question-options">
                    <div class="option-row">
                        <input type="text" class="option-input" placeholder="Opción 1" required>
                        <label class="radio-label">
                            <input type="radio" name="correct-option" value="0" required>
                            Correcta
                        </label>
                    </div>
                    <div class="option-row">
                        <input type="text" class="option-input" placeholder="Opción 2" required>
                        <label class="radio-label">
                            <input type="radio" name="correct-option" value="1" required>
                            Correcta
                        </label>
                    </div>
                    <div class="option-row">
                        <input type="text" class="option-input" placeholder="Opción 3" required>
                        <label class="radio-label">
                            <input type="radio" name="correct-option" value="2" required>
                            Correcta
                        </label>
                    </div>
                    <div class="option-row">
                        <input type="text" class="option-input" placeholder="Opción 4" required>
                        <label class="radio-label">
                            <input type="radio" name="correct-option" value="3" required>
                            Correcta
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="form-group">
                <label for="question-explanation">Explicación</label>
                <textarea id="question-explanation" rows="3" placeholder="Explicación de la respuesta correcta..."></textarea>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary">Guardar Pregunta</button>
            </div>
        </form>
    `;

    showModal('Agregar Nueva Pregunta', modalContent);

    document.getElementById('question-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveNewQuestion();
    });
}

// Guardar nueva pregunta
async function saveNewQuestion() {
    {
        const payloadApi = {
            subcategoryId: document.getElementById('question-subcategory').value,
            question: document.getElementById('question-text').value.trim(),
            difficulty: document.getElementById('question-difficulty').value,
            explanation: document.getElementById('question-explanation').value.trim(),
            options: Array.from(document.querySelectorAll('.option-input')).map(input => input.value.trim()),
            correct: Number(document.querySelector('input[name="correct-option"]:checked')?.value)
        };
        try {
            await LinguizateAPI.post('/admin/questions', payloadApi);
            await refreshAdminData();
            closeModal();
            loadQuestionsTab();
            showNotification('Pregunta agregada correctamente', 'success');
        } catch (error) { showNotification(error.message, 'error'); }
        return;
    }
    const subcategoryId = document.getElementById('question-subcategory').value;
    const questionText = document.getElementById('question-text').value.trim();
    const difficulty = document.getElementById('question-difficulty').value;
    const explanation = document.getElementById('question-explanation').value.trim();

    const optionInputs = document.querySelectorAll('.option-input');
    const options = Array.from(optionInputs).map(input => input.value.trim()).filter(opt => opt);

    if (options.length < 2) {
        showNotification('Debe agregar al menos 2 opciones', 'error');
        return;
    }

    const correctOption = parseInt(document.querySelector('input[name="correct-option"]:checked').value);

    if (!questions[subcategoryId]) {
        questions[subcategoryId] = [];
    }

    const newQuestion = {
        id: `${subcategoryId}_${Date.now()}`,
        question: questionText,
        options: options,
        correct: correctOption,
        difficulty: difficulty,
        explanation: explanation || ''
    };

    questions[subcategoryId].push(newQuestion);

    // Actualizar contador en categorías
    const subcategory = categories.find(cat =>
        cat.subcategories.some(sub => sub.id === subcategoryId)
    )?.subcategories.find(sub => sub.id === subcategoryId);

    if (subcategory) {
        subcategory.questionCount = questions[subcategoryId].length;
    }

    closeModal();
    loadQuestionsTab();
    showNotification('Pregunta agregada correctamente', 'success');

    // Nota: En un entorno real, aquí se haría una petición al servidor para guardar en el archivo JSON
    console.log('Nueva pregunta agregada:', newQuestion);
    console.log('⚠️ Nota: Para guardar permanentemente, se necesita un servidor backend');
}

// Abrir modal para editar pregunta
function openEditQuestionModal(subcategoryId, questionIndex) {
    const question = questions[subcategoryId][questionIndex];
    if (!question) return;

    const subcategories = [];
    categories.forEach(cat => {
        cat.subcategories.forEach(sub => {
            subcategories.push({
                id: sub.id,
                name: `${cat.name} - ${sub.name}`,
                categoryId: cat.id
            });
        });
    });

    const subcategoryOptions = subcategories.map(sub =>
        `<option value="${sub.id}" ${sub.id === subcategoryId ? 'selected' : ''}>${sub.name}</option>`
    ).join('');

    const optionsHtml = question.options.map((opt, idx) => `
        <div class="option-row">
            <input type="text" class="option-input" value="${opt.replace(/"/g, '&quot;')}" required>
            <label class="radio-label">
                <input type="radio" name="correct-option" value="${idx}" ${idx === question.correct ? 'checked' : ''} required>
                Correcta
            </label>
        </div>
    `).join('');

    const modalContent = `
        <form id="question-form" class="admin-form">
            <div class="form-group">
                <label for="question-subcategory">Subcategoría *</label>
                <select id="question-subcategory" required>
                    <option value="">Seleccione una subcategoría</option>
                    ${subcategoryOptions}
                </select>
            </div>
            
            <div class="form-group">
                <label for="question-text">Pregunta *</label>
                <textarea id="question-text" rows="3" required>${question.question.replace(/"/g, '&quot;')}</textarea>
            </div>
            
            <div class="form-group">
                <label for="question-difficulty">Dificultad *</label>
                <select id="question-difficulty" required>
                    <option value="facil" ${question.difficulty === 'facil' ? 'selected' : ''}>Fácil</option>
                    <option value="medio" ${question.difficulty === 'medio' ? 'selected' : ''}>Medio</option>
                    <option value="dificil" ${question.difficulty === 'dificil' ? 'selected' : ''}>Difícil</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Opciones de respuesta *</label>
                <div id="question-options">
                    ${optionsHtml}
                </div>
            </div>
            
            <div class="form-group">
                <label for="question-explanation">Explicación</label>
                <textarea id="question-explanation" rows="3">${(question.explanation || '').replace(/"/g, '&quot;')}</textarea>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary">Guardar Cambios</button>
            </div>
        </form>
    `;

    showModal('Editar Pregunta', modalContent);

    document.getElementById('question-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveEditedQuestion(subcategoryId, questionIndex);
    });
}

// Guardar pregunta editada
async function saveEditedQuestion(oldSubcategoryId, questionIndex) {
    {
        const questionApi = questions[oldSubcategoryId]?.[questionIndex];
        if (!questionApi) return;
        try {
            await LinguizateAPI.patch(`/admin/questions/${encodeURIComponent(questionApi.id)}`, {
                subcategoryId: document.getElementById('question-subcategory').value,
                question: document.getElementById('question-text').value.trim(),
                difficulty: document.getElementById('question-difficulty').value,
                explanation: document.getElementById('question-explanation').value.trim(),
                options: Array.from(document.querySelectorAll('.option-input')).map(input => input.value.trim()),
                correct: Number(document.querySelector('input[name="correct-option"]:checked')?.value)
            });
            await refreshAdminData();
            closeModal();
            loadQuestionsTab();
            showNotification('Pregunta actualizada correctamente', 'success');
        } catch (error) { showNotification(error.message, 'error'); }
        return;
    }
    const newSubcategoryId = document.getElementById('question-subcategory').value;
    const questionText = document.getElementById('question-text').value.trim();
    const difficulty = document.getElementById('question-difficulty').value;
    const explanation = document.getElementById('question-explanation').value.trim();

    const optionInputs = document.querySelectorAll('.option-input');
    const options = Array.from(optionInputs).map(input => input.value.trim()).filter(opt => opt);

    if (options.length < 2) {
        showNotification('Debe agregar al menos 2 opciones', 'error');
        return;
    }

    const correctOption = parseInt(document.querySelector('input[name="correct-option"]:checked').value);

    const editedQuestion = {
        id: questions[oldSubcategoryId][questionIndex].id,
        question: questionText,
        options: options,
        correct: correctOption,
        difficulty: difficulty,
        explanation: explanation || ''
    };

    // Si cambió de subcategoría, mover la pregunta
    if (oldSubcategoryId !== newSubcategoryId) {
        questions[oldSubcategoryId].splice(questionIndex, 1);
        if (!questions[newSubcategoryId]) {
            questions[newSubcategoryId] = [];
        }
        questions[newSubcategoryId].push(editedQuestion);

        // Actualizar contadores
        const oldSub = categories.find(cat =>
            cat.subcategories.some(sub => sub.id === oldSubcategoryId)
        )?.subcategories.find(sub => sub.id === oldSubcategoryId);
        const newSub = categories.find(cat =>
            cat.subcategories.some(sub => sub.id === newSubcategoryId)
        )?.subcategories.find(sub => sub.id === newSubcategoryId);

        if (oldSub) oldSub.questionCount = questions[oldSubcategoryId].length;
        if (newSub) newSub.questionCount = questions[newSubcategoryId].length;
    } else {
        questions[oldSubcategoryId][questionIndex] = editedQuestion;
    }

    closeModal();
    loadQuestionsTab();
    showNotification('Pregunta actualizada correctamente', 'success');
    saveDataToLocalStorage();
}

// Confirmar eliminación de pregunta
function confirmDeleteQuestion(subcategoryId, questionIndex) {
    const question = questions[subcategoryId][questionIndex];
    if (!question) return;

    if (confirm(`¿Está seguro de que desea eliminar esta pregunta?\n\n"${question.question.substring(0, 50)}..."`)) {
        deleteQuestion(subcategoryId, questionIndex);
    }
}

// Abrir modal para crear categoría personal (Profesor)
function openAddCategoryModalProfesor() {
    const modalContent = `
        <form id="category-form" class="admin-form">
            <div class="form-group">
                <label for="category-name">Nombre de la Categoría *</label>
                <input type="text" id="category-name" required placeholder="Ej: Mi Curso de Lingüística">
            </div>
            
            <div class="form-group">
                <label for="category-description">Descripción</label>
                <textarea id="category-description" rows="3" placeholder="Describe tu categoría..."></textarea>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary">Crear Categoría</button>
            </div>
        </form>
    `;

    showModal('Crear Categoría Personal', modalContent);
    setTimeout(() => {
        const form = document.getElementById('modal-body')?.querySelector('#category-form');
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveNewCategoryProfesor(); });
    }, 0);
}

// Guardar nueva categoría del profesor
async function saveNewCategoryProfesor() {
    {
        if (!validateCategoryForm()) return;
        try {
            const data = await LinguizateAPI.post('/professor/categories', {
                name: document.getElementById('category-name').value.trim(),
                description: document.getElementById('category-description').value.trim()
            });
            await refreshProfessorData();
            closeModal();
            loadProfesorCategoriesTab();
            loadProfesorStatsTab();
            showNotification('Categoría creada. Código de acceso: ' + data.category.accessCode, 'success');
        } catch (error) { showNotification(error.message, 'error'); }
        return;
    }
    if (!validateCategoryForm()) {
        return;
    }

    const name = document.getElementById('category-name').value.trim();
    const description = document.getElementById('category-description').value.trim();

    if (!currentProfesor.personalCategories) {
        currentProfesor.personalCategories = [];
    }

    let accessCode = generateAccessCode();
    while (users.some(u => u.personalCategories && u.personalCategories.some(c => (c.accessCode || '').toUpperCase() === accessCode.toUpperCase()))) {
        accessCode = generateAccessCode();
    }
    const newCategory = {
        id: `prof_${currentProfesor.id}_cat_${Date.now()}`,
        name: name,
        description: description || '',
        icon: 'fas fa-book',
        questions: [],
        isPersonal: true,
        private: true,
        profesorId: currentProfesor.id,
        profesorName: currentProfesor.name,
        accessCode: accessCode,
        approved: true,
        private: true,
        createdAt: new Date().toISOString()
    };

    currentProfesor.personalCategories.push(newCategory);

    closeModal();
    loadProfesorCategoriesTab();
    loadProfesorStatsTab();
    showNotification('Categoría creada. Código de acceso: ' + accessCode + ' (comparte este código con tus estudiantes)', 'success');

    // Actualizar en users
    const userIndex = users.findIndex(u => u.id === currentProfesor.id);
    if (userIndex !== -1) {
        users[userIndex] = currentProfesor;
    }

    // Guardar en localStorage
    saveDataToLocalStorage();
}

// Editar pregunta del profesor
function openEditQuestionModalProfesor(categoryId, questionIndex) {
    const category = currentProfesor.personalCategories.find(cat => cat.id === categoryId);
    if (!category || !category.questions || !category.questions[questionIndex]) return;

    const question = category.questions[questionIndex];
    const subcategoryOptions = currentProfesor.personalCategories.map(cat =>
        `<option value="${cat.id}" ${cat.id === categoryId ? 'selected' : ''}>${cat.name}</option>`
    ).join('');

    const optionsHtml = question.options.map((opt, idx) => `
        <div class="option-row">
            <input type="text" class="option-input" value="${opt.replace(/"/g, '&quot;')}" required>
            <label class="radio-label">
                <input type="radio" name="correct-option" value="${idx}" ${idx === question.correct ? 'checked' : ''} required>
                Correcta
            </label>
        </div>
    `).join('');

    const modalContent = `
        <form id="question-form" class="admin-form">
            <div class="form-group">
                <label for="question-subcategory">Mi Categoría *</label>
                <select id="question-subcategory" required>
                    <option value="">Seleccione una categoría personal</option>
                    ${subcategoryOptions}
                </select>
            </div>
            
            <div class="form-group">
                <label for="question-text">Pregunta *</label>
                <textarea id="question-text" rows="3" required>${question.question.replace(/"/g, '&quot;')}</textarea>
            </div>
            
            <div class="form-group">
                <label for="question-difficulty">Dificultad *</label>
                <select id="question-difficulty" required>
                    <option value="facil" ${question.difficulty === 'facil' ? 'selected' : ''}>Fácil</option>
                    <option value="medio" ${question.difficulty === 'medio' ? 'selected' : ''}>Medio</option>
                    <option value="dificil" ${question.difficulty === 'dificil' ? 'selected' : ''}>Difícil</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Opciones de respuesta *</label>
                <div id="question-options">
                    ${optionsHtml}
                </div>
            </div>
            
            <div class="form-group">
                <label for="question-explanation">Explicación</label>
                <textarea id="question-explanation" rows="3">${(question.explanation || '').replace(/"/g, '&quot;')}</textarea>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary">Guardar Cambios</button>
            </div>
        </form>
    `;

    showModal('Editar Pregunta Personal', modalContent);

    document.getElementById('question-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveEditedQuestionProfesor(categoryId, questionIndex);
    });
}

// Guardar pregunta editada del profesor
async function saveEditedQuestionProfesor(oldCategoryId, questionIndex) {
    {
        if (!validateQuestionForm()) return;
        const oldApi = currentProfesor.personalCategories.find(cat => cat.id === oldCategoryId);
        const questionApi = oldApi?.questions?.[questionIndex];
        if (!questionApi) return;
        try {
            await LinguizateAPI.patch(`/professor/questions/${encodeURIComponent(questionApi.id)}`, {
                categoryId: document.getElementById('question-subcategory').value,
                question: document.getElementById('question-text').value.trim(),
                difficulty: document.getElementById('question-difficulty').value,
                explanation: document.getElementById('question-explanation').value.trim(),
                options: Array.from(document.querySelectorAll('.option-input')).map(input => input.value.trim()),
                correct: Number(document.querySelector('input[name="correct-option"]:checked').value)
            });
            await refreshProfessorData();
            closeModal();
            loadProfesorQuestionsTab();
            loadProfesorCategoriesTab();
            showNotification('Pregunta actualizada correctamente', 'success');
        } catch (error) { showNotification(error.message, 'error'); }
        return;
    }
    if (!validateQuestionForm()) {
        return;
    }

    const newCategoryId = document.getElementById('question-subcategory').value;
    const questionText = document.getElementById('question-text').value.trim();
    const difficulty = document.getElementById('question-difficulty').value;
    const explanation = document.getElementById('question-explanation').value.trim();

    const optionInputs = document.querySelectorAll('.option-input');
    const options = Array.from(optionInputs).map(input => input.value.trim()).filter(opt => opt);

    const correctOption = parseInt(document.querySelector('input[name="correct-option"]:checked').value);

    const oldCategory = currentProfesor.personalCategories.find(cat => cat.id === oldCategoryId);
    if (!oldCategory) return;

    const editedQuestion = {
        id: oldCategory.questions[questionIndex].id,
        question: questionText,
        options: options,
        correct: correctOption,
        difficulty: difficulty,
        explanation: explanation || ''
    };

    if (oldCategoryId !== newCategoryId) {
        oldCategory.questions.splice(questionIndex, 1);
        const newCategory = currentProfesor.personalCategories.find(cat => cat.id === newCategoryId);
        if (newCategory) {
            if (!newCategory.questions) newCategory.questions = [];
            newCategory.questions.push(editedQuestion);
        }
    } else {
        oldCategory.questions[questionIndex] = editedQuestion;
    }

    closeModal();
    loadProfesorQuestionsTab();
    loadProfesorCategoriesTab();
    showNotification('Pregunta actualizada correctamente', 'success');

    // Actualizar en users
    const userIndex = users.findIndex(u => u.id === currentProfesor.id);
    if (userIndex !== -1) {
        users[userIndex] = currentProfesor;
    }

    // Guardar en localStorage
    saveDataToLocalStorage();
}

// Confirmar eliminación de pregunta del profesor
function confirmDeleteQuestionProfesor(categoryId, questionIndex) {
    const category = currentProfesor.personalCategories.find(cat => cat.id === categoryId);
    if (!category || !category.questions || !category.questions[questionIndex]) return;

    const question = category.questions[questionIndex];
    if (confirm(`¿Está seguro de que desea eliminar esta pregunta?\n\n"${question.question.substring(0, 50)}..."`)) {
        deleteQuestionProfesor(categoryId, questionIndex);
    }
}

// Eliminar pregunta del profesor
async function deleteQuestionProfesor(categoryId, questionIndex) {
    {
        const categoryApi = currentProfesor.personalCategories.find(cat => cat.id === categoryId);
        const questionApi = categoryApi?.questions?.[questionIndex];
        if (!questionApi) return;
        try {
            await LinguizateAPI.delete(`/professor/questions/${encodeURIComponent(questionApi.id)}`);
            await refreshProfessorData();
            loadProfesorQuestionsTab();
            loadProfesorCategoriesTab();
            showNotification('Pregunta eliminada correctamente', 'success');
        } catch (error) { showNotification(error.message, 'error'); }
        return;
    }
    const category = currentProfesor.personalCategories.find(cat => cat.id === categoryId);
    if (category && category.questions) {
        category.questions.splice(questionIndex, 1);
    }

    loadProfesorQuestionsTab();
    loadProfesorCategoriesTab();
    loadProfesorStatsTab();
    showNotification('Pregunta eliminada correctamente', 'success');

    // Actualizar en users
    const userIndex = users.findIndex(u => u.id === currentProfesor.id);
    if (userIndex !== -1) {
        users[userIndex] = currentProfesor;
    }

    // Guardar en localStorage
    saveDataToLocalStorage();
}

// Editar categoría del profesor
function openEditCategoryModalProfesor(categoryId) {
    const category = currentProfesor.personalCategories.find(cat => cat.id === categoryId);
    if (!category) return;

    const modalContent = `
        <form id="category-form" class="admin-form">
            <div class="form-group">
                <label for="category-name">Nombre de la Categoría *</label>
                <input type="text" id="category-name" value="${category.name.replace(/"/g, '&quot;')}" required>
            </div>
            
            <div class="form-group">
                <label for="category-description">Descripción</label>
                <textarea id="category-description" rows="3">${(category.description || '').replace(/"/g, '&quot;')}</textarea>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn-primary">Guardar Cambios</button>
            </div>
        </form>
    `;

    showModal('Editar Categoría Personal', modalContent);

    document.getElementById('category-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveEditedCategoryProfesor(categoryId);
    });
}

// Guardar categoría editada del profesor
async function saveEditedCategoryProfesor(categoryId) {
    {
        if (!validateCategoryForm()) return;
        try {
            await LinguizateAPI.patch(`/professor/categories/${encodeURIComponent(categoryId)}`, {
                name: document.getElementById('category-name').value.trim(),
                description: document.getElementById('category-description').value.trim()
            });
            await refreshProfessorData();
            closeModal();
            loadProfesorCategoriesTab();
            showNotification('Categoría actualizada correctamente', 'success');
        } catch (error) { showNotification(error.message, 'error'); }
        return;
    }
    if (!validateCategoryForm()) {
        return;
    }

    const name = document.getElementById('category-name').value.trim();
    const description = document.getElementById('category-description').value.trim();

    const category = currentProfesor.personalCategories.find(cat => cat.id === categoryId);
    if (category) {
        // Verificar que el nuevo nombre no esté en uso por otra categoría
        const exists = currentProfesor.personalCategories.some(cat =>
            cat.id !== categoryId && cat.name.toLowerCase() === name.toLowerCase()
        );
        if (exists) {
            showNotification('Ya existe otra categoría con ese nombre', 'error');
            return;
        }

        category.name = name;
        category.description = description || '';
    }

    closeModal();
    loadProfesorCategoriesTab();
    showNotification('Categoría actualizada correctamente', 'success');

    // Actualizar en users
    const userIndex = users.findIndex(u => u.id === currentProfesor.id);
    if (userIndex !== -1) {
        users[userIndex] = currentProfesor;
    }

    // Guardar en localStorage
    saveDataToLocalStorage();
}

// Confirmar eliminación de categoría del profesor
function confirmDeleteCategoryProfesor(categoryId) {
    const category = currentProfesor.personalCategories.find(cat => cat.id === categoryId);
    if (!category) return;

    const questionCount = category.questions ? category.questions.length : 0;
    if (confirm(`¿Está seguro de que desea eliminar la categoría "${category.name}"?\n\nSe eliminarán ${questionCount} preguntas asociadas.`)) {
        deleteCategoryProfesor(categoryId);
    }
}

// Aprobar categoría personal (Admin)
async function approveCategory(profesorId, categoryId) {
    {
        try {
            await LinguizateAPI.patch(`/admin/categories/${encodeURIComponent(categoryId)}/approval`, { approved: true });
            await refreshAdminData();
            loadCategoriesTab();
            showNotification('Categoría aprobada correctamente', 'success');
        } catch (error) { showNotification(error.message, 'error'); }
        return;
    }
    const user = users.find(u => u.id === parseInt(profesorId));
    if (!user || !user.personalCategories) return;

    const category = user.personalCategories.find(cat => cat.id === categoryId);
    if (category) {
        category.approved = true;
        category.approvedAt = new Date().toISOString();
        category.approvedBy = 'admin'; // En un sistema real sería el ID del admin

        saveDataToLocalStorage();
        loadCategoriesTab();
        showNotification('Categoría aprobada correctamente', 'success');
    }
}

// Rechazar categoría personal (Admin)
async function rejectCategory(profesorId, categoryId) {
    {
        if (!confirm('¿Está seguro de que desea rechazar esta categoría? Se eliminará permanentemente.')) return;
        try {
            await LinguizateAPI.delete(`/admin/professor-categories/${encodeURIComponent(categoryId)}`);
            await refreshAdminData();
            loadCategoriesTab();
            showNotification('Categoría rechazada y eliminada', 'success');
        } catch (error) { showNotification(error.message, 'error'); }
        return;
    }
    if (confirm('¿Está seguro de que desea rechazar esta categoría? Se eliminará permanentemente.')) {
        const user = users.find(u => u.id === parseInt(profesorId));
        if (!user || !user.personalCategories) return;

        const index = user.personalCategories.findIndex(cat => cat.id === categoryId);
        if (index !== -1) {
            user.personalCategories.splice(index, 1);

            saveDataToLocalStorage();
            loadCategoriesTab();
            showNotification('Categoría rechazada y eliminada', 'success');
        }
    }
}

// Eliminar categoría del profesor
async function deleteCategoryProfesor(categoryId) {
    {
        try {
            await LinguizateAPI.delete(`/professor/categories/${encodeURIComponent(categoryId)}`);
            await refreshProfessorData();
            loadProfesorCategoriesTab();
            loadProfesorQuestionsTab();
            loadProfesorStatsTab();
            showNotification('Categoría eliminada correctamente', 'success');
        } catch (error) { showNotification(error.message, 'error'); }
        return;
    }
    const index = currentProfesor.personalCategories.findIndex(cat => cat.id === categoryId);
    if (index !== -1) {
        currentProfesor.personalCategories.splice(index, 1);
    }

    loadProfesorCategoriesTab();
    loadProfesorQuestionsTab();
    loadProfesorStatsTab();
    showNotification('Categoría eliminada correctamente', 'success');

    // Actualizar en users
    const userIndex = users.findIndex(u => u.id === currentProfesor.id);
    if (userIndex !== -1) {
        users[userIndex] = currentProfesor;
    }

    // Guardar en localStorage
    saveDataToLocalStorage();
}

// Eliminar pregunta
async function deleteQuestion(subcategoryId, questionIndex) {
    {
        const questionApi = questions[subcategoryId]?.[questionIndex];
        if (!questionApi) return;
        try {
            await LinguizateAPI.delete(`/admin/questions/${encodeURIComponent(questionApi.id)}`);
            await refreshAdminData();
            loadQuestionsTab();
            showNotification('Pregunta eliminada correctamente', 'success');
        } catch (error) { showNotification(error.message, 'error'); }
        return;
    }
    questions[subcategoryId].splice(questionIndex, 1);

    // Actualizar contador
    const subcategory = categories.find(cat =>
        cat.subcategories.some(sub => sub.id === subcategoryId)
    )?.subcategories.find(sub => sub.id === subcategoryId);

    if (subcategory) {
        subcategory.questionCount = questions[subcategoryId].length;
    }

    loadQuestionsTab();
    showNotification('Pregunta eliminada correctamente', 'success');

    console.log('Pregunta eliminada');
    console.log('⚠️ Nota: Para guardar permanentemente, se necesita un servidor backend');
}

// Función para mostrar contraseña
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}
