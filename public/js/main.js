// /public/js/main.js - El Cargador Universal
function initPage() {
    const path = window.location.pathname;

    if (path === '/' || path.endsWith('/') || path.endsWith('index.html')) {
        console.log('Loading dashboard script...');
        import('./pages/dashboard.js').then(module => {
            if (module.init) module.init();
        });
    } else if (path.endsWith('activity.html')) {
        console.log('Loading activity script...');
        import('./pages/activity.js').then(module => {
            if (module.init) module.init();
        });
    }
    // Aquí puedes añadir más 'else if' para las páginas de deportes si tienen JS
    else if (path.includes('/sports/running.html')) {
        console.log('Loading running sports script...');
        import('./pages/sports/running.js').then(module => {
            if (module.init) module.init();
        });
    } else if (path.includes('/sports/swim.html')) {
        console.log('Loading swim sports script...');
        import('./pages/sports/swim.js').then(module => {
            if (module.init) module.init();
        });
    } else if (path.includes('/sports/bike.html')) {
        console.log('Loading bike sports script...');
        import('./pages/sports/bike.js').then(module => {
            if (module.init) module.init();
        });
    }
}

document.addEventListener('DOMContentLoaded', initPage);