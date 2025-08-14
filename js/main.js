// js/main.js
import { redirectToStrava, logout, handleAuth } from './auth.js';
import { fetchAllActivities } from './api.js';
import { setupDashboard, renderDashboard, showLoading, hideLoading, handleError, renderPlannerTab } from './ui.js';

// Espera a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {

    // --- STATE ---
    let allActivities = [];
    let dateFilterFrom = null;
    let dateFilterTo = null;

    // --- DOM REFERENCES ---
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const refreshButton = document.getElementById('refresh-button');
    const applyFilterButton = document.getElementById('apply-date-filter');
    const resetFilterButton = document.getElementById('reset-date-filter');

        // =========================================================
    //         AÑADE ESTE BLOQUE DE CÓDIGO AQUÍ
    // =========================================================
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.getAttribute('data-tab');

            // 1. Quitar la clase 'active' de todos los links y contenidos
            tabLinks.forEach(item => item.classList.remove('active'));
            tabContents.forEach(item => item.classList.remove('active'));

            // 2. Añadir la clase 'active' al link y contenido seleccionados
            link.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            // 3. Renderizar el contenido de la pestaña si es la primera vez
            if (tabId === 'planner-tab' && !plannerTabRendered) {
                renderPlannerTab(allActivities); 
                plannerTabRendered = true; 
            }
        });
    });
    // =========================================================
    //         FIN DEL BLOQUE A AÑADIR
    // =========================================================


    // --- INITIALIZATION ---
    // Movemos la función initializeApp DENTRO del listener también
    async function initializeApp(tokenData) {
        showLoading('Loading activities...');
        try {
            allActivities = await fetchAllActivities();
            setupDashboard(allActivities);
            renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
        } catch (error) {
            handleError("Could not initialize the app", error);
        } finally {
            hideLoading();
        }
    }

    // Y la pasamos a auth.js a través de una función de "callback" o importándola directamente
    // Para simplificar, vamos a modificar auth.js para que no dependa de initializeApp directamente.

    async function refreshActivities() {
        showLoading('Refreshing activities...');
        try {
            allActivities = await fetchAllActivities(); // La API se encarga de los tokens
            renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
        } catch (error) {
            handleError('Error refreshing activities', error);
        } finally {
            hideLoading();
        }
    }

    // --- EVENT LISTENERS ---
    // Ahora estamos 100% seguros de que loginButton no es null
    if (loginButton) {
        loginButton.addEventListener('click', redirectToStrava);
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
    if (refreshButton) {
        refreshButton.addEventListener('click', refreshActivities);
    }
    if (applyFilterButton) {
        applyFilterButton.addEventListener('click', () => {
            dateFilterFrom = document.getElementById('date-from').value || null;
            dateFilterTo = document.getElementById('date-to').value || null;
            renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
        });
    }
    if (resetFilterButton) {
        resetFilterButton.addEventListener('click', () => {
            dateFilterFrom = null;
            dateFilterTo = null;
            document.getElementById('date-from').value = '';
            document.getElementById('date-to').value = '';
            renderDashboard(allActivities, dateFilterFrom, dateFilterTo);
        });
    }

    // --- APP ENTRY POINT ---
    // Lo llamamos aquí al final del listener.
    // Necesitamos pasar la función de inicialización a handleAuth.
    handleAuth(initializeApp).catch(error => {
        console.error("App failed to start:", error);
        hideLoading();
    });
});