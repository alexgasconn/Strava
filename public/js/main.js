// /public/js/main.js
function initPage() {
    const path = window.location.pathname;

    if (path === '/' || path.endsWith('index.html')) {
        import('./pages/dashboard.js').then(module => module.init());
    } else if (path.endsWith('activity.html')) {
        import('./pages/activity.js').then(module => module.init());
    } 
    // Puedes añadir más 'else if' para las páginas de deportes si tienen JS
}

document.addEventListener('DOMContentLoaded', initPage);