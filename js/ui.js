// js/ui.js

const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');

export function showLoading(message) {
    if (loadingMessage) loadingMessage.textContent = message;
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
}

export function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

export function handleError(message, error) {
    console.error(message, error);
    hideLoading();
    alert(`Error: ${message}. Revisa la consola para más detalles.`);
}