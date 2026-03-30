// ai-chat.js — AI Chat tab powered by Google Gemini 2.0 Flash (free tier)
// The user provides their own API key (stored in localStorage). No server cost.

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const STORAGE_KEY = 'gemini_api_key';
const HISTORY_KEY = 'ai_chat_history';

// --- Context builder: summarizes all Strava data into a system prompt ---
function buildStravaContext(allActivities) {
    if (!allActivities || allActivities.length === 0) {
        return 'The user has no Strava activities loaded yet.';
    }

    const fmt = (n, d = 1) => (n || 0).toFixed(d);
    const km = (m) => fmt((m || 0) / 1000);
    const pace = (secsPerM) => {
        if (!secsPerM || secsPerM <= 0) return '—';
        const secsPerKm = secsPerM * 1000;
        const m = Math.floor(secsPerKm / 60);
        const s = Math.round(secsPerKm % 60);
        return `${m}:${String(s).padStart(2, '0')}/km`;
    };
    const duration = (secs) => {
        if (!secs) return '0h';
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    // Group by sport type
    const byType = {};
    allActivities.forEach(a => {
        const t = a.type || 'Other';
        if (!byType[t]) byType[t] = [];
        byType[t].push(a);
    });

    // Overall stats section
    const totalDistance = allActivities.reduce((s, a) => s + (a.distance || 0), 0);
    const totalTime = allActivities.reduce((s, a) => s + (a.moving_time || 0), 0);
    const totalElev = allActivities.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);

    let ctx = `You are a personal sports coach and data analyst assistant. You have full access to the user's Strava data. Answer questions about their training, performance, trends and give actionable advice. Be specific and reference actual numbers from their data. Speak in the same language as the user's message.

=== STRAVA DATA SUMMARY ===

OVERVIEW (all time, ${allActivities.length} activities):
- Total distance: ${km(totalDistance)} km
- Total moving time: ${duration(totalTime)}
- Total elevation: ${fmt(totalElev, 0)} m
- Date range: ${allActivities.at(-1)?.start_date_local?.substring(0, 10) || '?'} → ${allActivities[0]?.start_date_local?.substring(0, 10) || '?'}

BY SPORT:\n`;

    Object.entries(byType)
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([type, acts]) => {
            const dist = acts.reduce((s, a) => s + (a.distance || 0), 0);
            const time = acts.reduce((s, a) => s + (a.moving_time || 0), 0);
            const elev = acts.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
            const avgHR = acts.filter(a => a.average_heartrate).map(a => a.average_heartrate);
            const avgHRStr = avgHR.length ? `avg HR ${fmt(avgHR.reduce((s, v) => s + v, 0) / avgHR.length, 0)} bpm` : '';
            ctx += `- ${type} (${acts.length} activities): ${km(dist)} km, ${duration(time)}, ${fmt(elev, 0)} m elevation${avgHRStr ? ', ' + avgHRStr : ''}\n`;
        });

    // Personal bests
    const runs = allActivities.filter(a => a.type === 'Run' || a.type === 'TrailRun');
    const rides = allActivities.filter(a => a.type === 'Ride' || a.type === 'VirtualRide' || a.type === 'GravelRide');

    if (runs.length) {
        const fastest5k = runs.filter(a => a.distance >= 4800 && a.distance <= 5500 && a.average_speed)
            .sort((a, b) => b.average_speed - a.average_speed)[0];
        const fastest10k = runs.filter(a => a.distance >= 9500 && a.distance <= 10500 && a.average_speed)
            .sort((a, b) => b.average_speed - a.average_speed)[0];
        const longestRun = runs.sort((a, b) => (b.distance || 0) - (a.distance || 0))[0];

        ctx += `\nRUN PERSONAL BESTS:\n`;
        if (fastest5k) ctx += `- Best 5K pace: ${pace(1 / fastest5k.average_speed)} (${fastest5k.start_date_local?.substring(0, 10)})\n`;
        if (fastest10k) ctx += `- Best 10K pace: ${pace(1 / fastest10k.average_speed)} (${fastest10k.start_date_local?.substring(0, 10)})\n`;
        if (longestRun) ctx += `- Longest run: ${km(longestRun.distance)} km on ${longestRun.start_date_local?.substring(0, 10)}\n`;
    }

    if (rides.length) {
        const longestRide = rides.sort((a, b) => (b.distance || 0) - (a.distance || 0))[0];
        const fastestRide = rides.filter(a => a.average_speed).sort((a, b) => b.average_speed - a.average_speed)[0];
        ctx += `\nCYCLING PERSONAL BESTS:\n`;
        if (longestRide) ctx += `- Longest ride: ${km(longestRide.distance)} km on ${longestRide.start_date_local?.substring(0, 10)}\n`;
        if (fastestRide) ctx += `- Fastest avg speed: ${fmt(fastestRide.average_speed * 3.6)} km/h on ${fastestRide.start_date_local?.substring(0, 10)}\n`;
    }

    // Gear summary
    const gearMap = {};
    allActivities.forEach(a => {
        if (a.gear_id && a.gear_name) {
            if (!gearMap[a.gear_id]) gearMap[a.gear_id] = { name: a.gear_name, dist: 0, count: 0 };
            gearMap[a.gear_id].dist += a.distance || 0;
            gearMap[a.gear_id].count++;
        }
    });
    const gearEntries = Object.values(gearMap);
    if (gearEntries.length) {
        ctx += `\nGEAR:\n`;
        gearEntries.sort((a, b) => b.dist - a.dist).forEach(g => {
            ctx += `- ${g.name}: ${km(g.dist)} km across ${g.count} activities\n`;
        });
    }

    // Recent 30 activities
    ctx += `\nRECENT ACTIVITIES (last 30):\n`;
    allActivities.slice(0, 30).forEach(a => {
        const d = a.start_date_local?.substring(0, 10) || '?';
        const hr = a.average_heartrate ? ` | HR: ${fmt(a.average_heartrate, 0)} bpm` : '';
        const elev = a.total_elevation_gain ? ` | +${fmt(a.total_elevation_gain, 0)}m` : '';
        const speedInfo = a.type?.includes('Run')
            ? ` | pace: ${pace(1 / (a.average_speed || 1))}`
            : a.average_speed ? ` | ${fmt(a.average_speed * 3.6)} km/h` : '';
        ctx += `- [${d}] ${a.type}: "${a.name}" — ${km(a.distance)} km in ${duration(a.moving_time)}${speedInfo}${hr}${elev}\n`;
    });

    // Monthly volume (last 12 months)
    const monthlyVol = {};
    const now = new Date();
    allActivities.forEach(a => {
        if (!a.start_date_local) return;
        const d = new Date(a.start_date_local);
        const diffMonths = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
        if (diffMonths > 11) return;
        const key = a.start_date_local.substring(0, 7);
        if (!monthlyVol[key]) monthlyVol[key] = { dist: 0, time: 0, count: 0 };
        monthlyVol[key].dist += a.distance || 0;
        monthlyVol[key].time += a.moving_time || 0;
        monthlyVol[key].count++;
    });
    ctx += `\nMONTHLY VOLUME (last 12 months):\n`;
    Object.entries(monthlyVol).sort().forEach(([month, v]) => {
        ctx += `- ${month}: ${km(v.dist)} km | ${duration(v.time)} | ${v.count} activities\n`;
    });

    return ctx;
}

// --- Chat API call ---
async function callGemini(apiKey, history, systemContext) {
    const contents = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
    }));

    const body = {
        system_instruction: {
            parts: [{ text: systemContext }]
        },
        contents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
        }
    };

    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${res.status}`;
        throw new Error(msg);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '(no response)';
}

// --- Render ---
export function renderAIChatTab(allActivities) {
    const container = document.getElementById('ai-chat-tab');
    if (!container) return;

    const savedKey = localStorage.getItem(STORAGE_KEY) || '';
    const savedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

    container.innerHTML = `
        <div class="ai-chat-wrapper">
            <div class="ai-chat-header">
                <div class="ai-chat-title">
                    <span class="ai-chat-icon">🤖</span>
                    <div>
                        <h2>AI Coach</h2>
                        <p class="ai-chat-subtitle">Powered by Gemini 2.0 Flash · Runs in your browser · No data sent to servers</p>
                    </div>
                </div>
                <button class="ai-chat-clear-btn" id="ai-clear-history" title="Clear conversation">🗑️ Clear</button>
            </div>

            ${!savedKey ? `
            <div class="ai-apikey-banner" id="ai-apikey-banner">
                <div class="ai-apikey-info">
                    <strong>🔑 API Key required (free)</strong>
                    <p>Get your free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com</a> — no credit card needed. It's saved only in your browser.</p>
                </div>
                <div class="ai-apikey-form">
                    <input type="password" id="ai-apikey-input" placeholder="Paste your Gemini API key..." autocomplete="off" spellcheck="false">
                    <button id="ai-apikey-save">Save key</button>
                </div>
            </div>
            ` : `
            <div class="ai-apikey-set" id="ai-apikey-set">
                <span>🔑 API key set</span>
                <button id="ai-apikey-change">Change key</button>
            </div>
            `}

            <div class="ai-chat-messages" id="ai-chat-messages">
                ${savedHistory.length === 0 ? `
                <div class="ai-chat-welcome">
                    <p>👋 Ask me anything about your training! For example:</p>
                    <div class="ai-chat-suggestions">
                        <button class="ai-suggestion-btn">What is my best training streak?</button>
                        <button class="ai-suggestion-btn">How has my running pace evolved this year?</button>
                        <button class="ai-suggestion-btn">Which sport do I do most and when?</button>
                        <button class="ai-suggestion-btn">Give me a training plan for next month</button>
                        <button class="ai-suggestion-btn">What are my weakest training months?</button>
                    </div>
                </div>
                ` : savedHistory.map(m => renderMessage(m.role, m.text)).join('')}
            </div>

            <div class="ai-chat-input-area">
                <textarea id="ai-chat-input" placeholder="Ask your AI coach..." rows="2" ${!savedKey ? 'disabled' : ''}></textarea>
                <button id="ai-chat-send" ${!savedKey ? 'disabled' : ''}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
            </div>
        </div>
    `;

    // --- State ---
    let history = savedHistory.slice();
    let stravaContext = null;
    let isLoading = false;

    const messagesEl = document.getElementById('ai-chat-messages');
    const inputEl = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-send');

    function renderMessage(role, text) {
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            // Convert **bold** markdown
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Convert *italic*
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Convert newlines
            .replace(/\n/g, '<br>');
        return `<div class="ai-msg ai-msg--${role}">
            <div class="ai-msg-bubble">${escaped}</div>
        </div>`;
    }

    function appendMessage(role, text) {
        const welcome = messagesEl.querySelector('.ai-chat-welcome');
        if (welcome) welcome.remove();

        const div = document.createElement('div');
        div.innerHTML = renderMessage(role, text);
        messagesEl.appendChild(div.firstElementChild);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function appendTypingIndicator() {
        const el = document.createElement('div');
        el.className = 'ai-msg ai-msg--model ai-typing';
        el.id = 'ai-typing-indicator';
        el.innerHTML = `<div class="ai-msg-bubble"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></div>`;
        messagesEl.appendChild(el);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeTypingIndicator() {
        document.getElementById('ai-typing-indicator')?.remove();
    }

    async function sendMessage(text) {
        if (!text.trim() || isLoading) return;
        const apiKey = localStorage.getItem(STORAGE_KEY);
        if (!apiKey) return;

        if (!stravaContext) {
            stravaContext = buildStravaContext(allActivities);
        }

        isLoading = true;
        sendBtn.disabled = true;
        inputEl.disabled = true;

        appendMessage('user', text);
        history.push({ role: 'user', text });

        appendTypingIndicator();

        try {
            const reply = await callGemini(apiKey, history, stravaContext);
            removeTypingIndicator();
            history.push({ role: 'model', text: reply });
            appendMessage('model', reply);
            // Persist history (keep last 40 messages to avoid localStorage bloat)
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-40)));
        } catch (err) {
            removeTypingIndicator();
            const errText = `⚠️ Error: ${err.message}`;
            appendMessage('model', errText);
        } finally {
            isLoading = false;
            sendBtn.disabled = false;
            inputEl.disabled = false;
            inputEl.focus();
        }
    }

    // --- API Key setup ---
    const saveKeyBtn = document.getElementById('ai-apikey-save');
    const changeKeyBtn = document.getElementById('ai-apikey-change');

    if (saveKeyBtn) {
        saveKeyBtn.addEventListener('click', () => {
            const keyInput = document.getElementById('ai-apikey-input');
            const key = keyInput?.value?.trim();
            if (!key) return;
            localStorage.setItem(STORAGE_KEY, key);
            // Re-render
            renderAIChatTab(allActivities);
        });
    }

    if (changeKeyBtn) {
        changeKeyBtn.addEventListener('click', () => {
            localStorage.removeItem(STORAGE_KEY);
            renderAIChatTab(allActivities);
        });
    }

    // --- Send message ---
    sendBtn?.addEventListener('click', () => {
        const text = inputEl.value.trim();
        if (!text) return;
        inputEl.value = '';
        inputEl.style.height = 'auto';
        sendMessage(text);
    });

    inputEl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const text = inputEl.value.trim();
            if (!text) return;
            inputEl.value = '';
            inputEl.style.height = 'auto';
            sendMessage(text);
        }
    });

    // Auto-resize textarea
    inputEl?.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
    });

    // Suggestion buttons
    messagesEl.querySelectorAll('.ai-suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!localStorage.getItem(STORAGE_KEY)) return;
            const text = btn.textContent;
            sendMessage(text);
        });
    });

    // Clear history
    document.getElementById('ai-clear-history')?.addEventListener('click', () => {
        history = [];
        localStorage.removeItem(HISTORY_KEY);
        renderAIChatTab(allActivities);
    });

    // Scroll to bottom if history was restored
    if (savedHistory.length > 0) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
}
