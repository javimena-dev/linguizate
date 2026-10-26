// Variables globales
let currentUser = null;
let currentGame = null;
let categories = [];
let questions = {};
let users = [];
let isAdmin = false;
let currentTheme = 'light';

// Inicialización simple
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM Content Loaded - Versión Simple');
    setupSimpleNavigation();
    console.log('✅ Aplicación simple inicializada');
});

// Configuración simple de navegación
function setupSimpleNavigation() {
    console.log('🔧 Configurando navegación simple...');
    
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
            btn.onclick = function(e) {
                e.preventDefault();
                console.log(`🖱️ Click en ${btnId}`);
                showScreen(screenId);
            };
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
            btn.onclick = function(e) {
                e.preventDefault();
                console.log(`🖱️ Click en ${btnId}`);
                showScreen('inicio-screen');
            };
        }
    });
}

// Función simple para mostrar pantallas
function showScreen(screenId) {
    console.log(`🔄 Mostrando pantalla: ${screenId}`);
    
    // Verificar que el elemento existe
    const targetScreen = document.getElementById(screenId);
    if (!targetScreen) {
        console.error(`❌ No se encontró la pantalla ${screenId}`);
        alert(`Error: No se encontró la pantalla ${screenId}`);
        return;
    }

    // Ocultar todas las pantallas
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        console.log(`🔴 Ocultando: ${screen.id}`);
    });
    
    // Mostrar la pantalla seleccionada
    targetScreen.classList.add('active');
    console.log(`✅ Mostrando: ${screenId}`);
    
    // Cargar contenido específico si es necesario
    if (screenId === 'categorias-screen') {
        loadSimpleCategories();
    }
}

// Cargar categorías de forma simple
function loadSimpleCategories() {
    console.log('🎮 Cargando categorías simples...');
    
    const grid = document.getElementById('categories-grid');
    if (!grid) {
        console.error('❌ No se encontró categories-grid');
        return;
    }
    
    grid.innerHTML = '<p>Cargando categorías...</p>';
    
    // Intentar cargar categorías
    fetch('categories.json')
        .then(response => response.json())
        .then(data => {
            categories = data.categories;
            console.log(`✅ Categorías cargadas: ${categories.length}`);
            
            // Mostrar categorías
            grid.innerHTML = '';
            categories.forEach(category => {
                const card = document.createElement('div');
                card.className = 'category-card';
                card.innerHTML = `
                    <i class="${category.icon}"></i>
                    <h3>${category.name}</h3>
                    <p>${category.description}</p>
                `;
                card.onclick = () => {
                    console.log(`🎯 Categoría seleccionada: ${category.name}`);
                    alert(`Categoría seleccionada: ${category.name}`);
                };
                grid.appendChild(card);
            });
        })
        .catch(error => {
            console.error('❌ Error al cargar categorías:', error);
            grid.innerHTML = '<p>Error al cargar categorías</p>';
        });
}

// Función para mostrar notificaciones
function showNotification(message, type = 'info') {
    console.log(`📢 Notificación [${type}]: ${message}`);
    alert(`${type.toUpperCase()}: ${message}`);
}
