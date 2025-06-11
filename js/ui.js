// js/ui.js

// Referencias a los elementos de la página
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');

export function showLoading(message) {
    loadingMessage.textContent = message;
    loadingOverlay.classList.remove('hidden');
}

export function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

export function handleError(message, error) {
    console.error(message, error);
    hideLoading();
    // Podríamos mostrar un mensaje de error más visible al usuario aquí
    alert(`Error: ${message}. Revisa la consola para más detalles.`);
}