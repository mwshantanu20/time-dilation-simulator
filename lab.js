// ============================================================================
// VIRTUAL RELATIVITY LAB — NOTEBOOK, PRESETS, PRINT REPORT, OWNER BILLING
// ============================================================================
// This module is intentionally isolated from the Three.js render loop. It reads
// the live simulation STATE and polls once per second, so it can be replaced by
// a backend later without touching the physics engine. All data is per-browser
// in localStorage; see DEPLOY.md for the shared-database caveat.
// ============================================================================

const OWNER_PIN = '4825'; // Owner PIN — required even with the owner URL key.
const OWNER_URL_KEY = 'RLO-4825-owner'; // Casual guard for the owner route (visible in client JS).
const READINGS_KEY = 'tds.virtualLab.readings.v1';
const BILLING_KEY = 'tds.virtualLab.billing.v1';
const PROFILE_KEY = 'tds.virtualLab.profile.v1';
const PROFILES_KEY = 'tds.virtualLab.profiles.v1';

// Optional shared-storage hook. Leave blank for per-device localStorage only.
// When set, LabStorage mirrors writes via POST and can pull owner data on unlock.
// Example: 'https://your-api.example.com/lab-state'
const REMOTE_SYNC_ENDPOINT = '';

const VIEW_PARAMS = new URLSearchParams(window.location.search);
const VIEW_MODE = VIEW_PARAMS.get('view') === 'owner' ? 'owner' : 'lab';

const $ = (id) => document.getElementById(id);

const PRESETS = {
    baseline: { distance: 30, mass: 5, velocity: 0, speed: 1 },
    horizon:  { distance: 1.1, mass: 5, velocity: 0, speed: 1 },
    velocity: { distance: 30, mass: 5, velocity: 0.95, speed: 1 },
    combined: { distance: 2, mass: 5, velocity: 0.9, speed: 1 },
    photon:   { distance: 1.5, mass: 5, velocity: 0, speed: 1 },
};

let readings = [];
let billing = null;
let currentSession = null;
let billingUnlocked = false;
let profile = null;
let profiles = [];

// ----------------------------------------------------------------------------
// Small utilities
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Storage abstraction: localStorage always works; an optional REST endpoint can
// mirror data so the owner console can see readings/sessions from other devices.
// For a production multi-device setup, back this with Firebase/Supabase/REST.
// ----------------------------------------------------------------------------

const LabStorage = {
    get(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    },
    set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage disabled */ }
        this.push(key, value);
    },
    async push(key, value) {
        if (!REMOTE_SYNC_ENDPOINT) return;
        try {
            await fetch(REMOTE_SYNC_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value }),
            });
        } catch (e) { /* offline / endpoint unavailable: local data is still kept */ }
    },
    async pullAll() {
        if (!REMOTE_SYNC_ENDPOINT) return null;
        try {
            const res = await fetch(REMOTE_SYNC_ENDPOINT, { cache: 'no-store' });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            return null;
        }
    },
};

function loadJSON(key, fallback) { return LabStorage.get(key, fallback); }
function saveJSON(key, value) { LabStorage.set(key, value); }

function formatDuration(seconds) {
    const t = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function formatStamp(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

function csvCell(value) {
    const s = String(value == null ? '' : value);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCsv(filename, rows) {
    const csv = '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setSlider(id, value) {
    const el = $(id);
    if (!el) return;
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ----------------------------------------------------------------------------
// User profiles (email identity)
// ----------------------------------------------------------------------------

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function renderProfile() {
    const emailEl = $('profileEmail');
    const nameEl = $('profileName');
    const status = $('profileStatus');
    const select = $('savedProfiles');
    const studentName = $('studentName');
    const billingUser = $('billingUser');

    if (emailEl && !emailEl.value && profile) emailEl.value = profile.email;
    if (nameEl && !nameEl.value && profile) nameEl.value = profile.name || '';
    if (status) {
        status.textContent = profile
            ? `Signed in as ${profile.email}${profile.name ? ` · ${profile.name}` : ''}`
            : 'No profile yet — enter an email to start a tracked lab session.';
        status.classList.toggle('signed-in', !!profile);
    }
    if (studentName) studentName.value = profile?.name || profile?.email || 'Student';
    if (billingUser) billingUser.value = profile?.email || '';
    if (select) {
        select.innerHTML = '<option value="">Choose a saved profile…</option>' + profiles.map(p =>
            `<option value="${escapeHTML(p.email)}">${escapeHTML(p.email)}${p.name ? ` — ${escapeHTML(p.name)}` : ''}</option>`
        ).join('');
    }
}

function saveProfile() {
    const email = normalizeEmail($('profileEmail')?.value);
    const name = String($('profileName')?.value || '').trim();
    if (!isValidEmail(email)) {
        const status = $('profileStatus');
        if (status) status.textContent = 'Enter a valid email address (e.g. student@school.edu).';
        $('profileEmail')?.focus();
        return;
    }
    profile = { email, name };
    if (!profiles.some(p => p.email === email)) profiles.push(profile);
    else profiles = profiles.map(p => p.email === email ? profile : p);
    saveJSON(PROFILE_KEY, profile);
    saveJSON(PROFILES_KEY, profiles);

    if (currentSession && currentSession.user !== email) {
        currentSession.user = email;
        persistBilling();
    }
    if (!currentSession || currentSession.user !== email) startNewSession(email);
    renderProfile();
    return true;
}

function requireProfile() {
    if (profile) return true;
    openModal($('labPanel'));
    const status = $('profileStatus');
    if (status) status.textContent = 'A valid email is required before tracking readings or lab time.';
    $('profileEmail')?.focus();
    return false;
}

function initProfile() {
    profile = loadJSON(PROFILE_KEY, null);
    if (profile && (!isValidEmail(profile.email) || !profile.email)) profile = null;
    else if (profile) profile.email = normalizeEmail(profile.email);
    profiles = loadJSON(PROFILES_KEY, []);
    if (!Array.isArray(profiles)) profiles = [];
    profiles = profiles.filter(p => p && isValidEmail(p.email)).map(p => ({ email: normalizeEmail(p.email), name: p.name || '' }));
    if (profile && !profiles.some(p => p.email === profile.email)) profiles.push(profile);

    const urlEmail = normalizeEmail(VIEW_PARAMS.get('email'));
    if (urlEmail && isValidEmail(urlEmail)) {
        profile = { email: urlEmail, name: VIEW_PARAMS.get('name') || '' };
        saveJSON(PROFILE_KEY, profile);
    }
    renderProfile();

    $('saveProfileBtn')?.addEventListener('click', saveProfile);
    $('profileEmail')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveProfile(); });
    $('profileToggleBtn')?.addEventListener('click', () => {
        openModal($('labPanel'));
        setTimeout(() => $('profileEmail')?.focus(), 50);
    });
    $('switchProfileBtn')?.addEventListener('click', () => {
        const picked = $('savedProfiles')?.value;
        if (!picked) { $('profileStatus').textContent = 'Choose a saved email first.'; return; }
        const found = profiles.find(p => p.email === picked);
        if (found) {
            $('profileEmail').value = found.email;
            $('profileName').value = found.name || '';
            saveProfile();
        }
    });
    $('savedProfiles')?.addEventListener('change', (e) => {
        const found = profiles.find(p => p.email === e.target.value);
        if (found) {
            $('profileEmail').value = found.email;
            $('profileName').value = found.name || '';
        }
    });
}
// ----------------------------------------------------------------------------
// Modal wiring
// ----------------------------------------------------------------------------

function openModal(panel) {
    if (!panel) return;
    panel.classList.add('visible');
    panel.setAttribute('aria-hidden', 'false');
}

function closeModal(panel) {
    if (!panel) return;
    panel.classList.remove('visible');
    panel.setAttribute('aria-hidden', 'true');
}

function initModals() {
    const labPanel = $('labPanel');
    const billingPanel = $('billingPanel');
    const notePanel = $('notePanel');

    $('labToggleBtn')?.addEventListener('click', () => openModal(labPanel));
    $('labCloseBtn')?.addEventListener('click', () => closeModal(labPanel));
    labPanel?.addEventListener('click', (e) => { if (e.target === labPanel) closeModal(labPanel); });

    $('billingToggleBtn')?.addEventListener('click', () => openModal(billingPanel));
    $('billingCloseBtn')?.addEventListener('click', () => closeModal(billingPanel));
    billingPanel?.addEventListener('click', (e) => { if (e.target === billingPanel) closeModal(billingPanel); });

    $('noteReadingBtn')?.addEventListener('click', openNoteModal);
    $('noteCloseBtn')?.addEventListener('click', () => closeModal(notePanel));
    $('cancelNoteBtn')?.addEventListener('click', () => closeModal(notePanel));
    notePanel?.addEventListener('click', (e) => { if (e.target === notePanel) closeModal(notePanel); });
    $('saveNoteReadingBtn')?.addEventListener('click', () => {
        if (!requireProfile()) return;
        if ($('readingNote')) $('readingNote').value = $('noteReadingText')?.value || '';
        captureReading();
        closeModal(notePanel);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closeModal(labPanel);
        closeModal(billingPanel);
        closeModal(notePanel);
    });
}

function openNoteModal() {
    if (!requireProfile()) return;
    const summary = $('noteSummary');
    if (summary) {
        summary.innerHTML = `
            <span>Email: <b>${escapeHTML(profile.email)}</b></span>
            <span>Distance: <b>${(typeof currentVisualDistance === 'number' ? currentVisualDistance : STATE.distance_r).toFixed(2)} rₛ</b></span>
            <span>Mass: <b>${STATE.blackHoleMass.toFixed(1)} M☉</b></span>
            <span>Velocity: <b>${STATE.velocityBeta.toFixed(3)} c</b></span>
            <span>Time rate: <b>${STATE.timeRate.toFixed(4)}×</b></span>`;
    }
    if ($('noteReadingText')) $('noteReadingText').value = '';
    openModal($('notePanel'));
    setTimeout(() => $('noteReadingText')?.focus(), 50);
}

// ----------------------------------------------------------------------------
// Readings notebook
// ----------------------------------------------------------------------------

function renderReadings() {
    const body = $('readingsBody');
    if (!body) return;
    if (!readings.length) {
        body.innerHTML = '<tr><td colspan="13" class="empty-row">No readings logged yet.</td></tr>';
        return;
    }
    body.innerHTML = readings.map((r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${escapeHTML(r.email || 'Guest')}</td>
            <td>${escapeHTML(formatStamp(r.timestamp))}</td>
            <td>${escapeHTML(r.localTime)}</td>
            <td>${escapeHTML(r.referenceTime)}</td>
            <td>${escapeHTML(r.probeTime)}</td>
            <td>${escapeHTML(r.distance)}</td>
            <td>${escapeHTML(r.mass)}</td>
            <td>${escapeHTML(r.velocity)}</td>
            <td>${escapeHTML(r.rsKm)}</td>
            <td>${escapeHTML(r.rate)}</td>
            <td>${escapeHTML(r.note || '—')}</td>
            <td><button class="row-del" data-reading-index="${i}" title="Delete reading">&times;</button></td>
        </tr>`).join('');
}

function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
}

function captureReading() {
    const reading = {
        trial: readings.length + 1,
        email: profile?.email || 'Guest',
        timestamp: new Date().toISOString(),
        localTime: $('localClock')?.textContent || '',
        referenceTime: $('earthClock')?.textContent || '',
        probeTime: $('probeClock')?.textContent || '',
        distance: (typeof currentVisualDistance === 'number' ? currentVisualDistance : STATE.distance_r).toFixed(2) + ' rₛ',
        mass: STATE.blackHoleMass.toFixed(1),
        velocity: STATE.velocityBeta.toFixed(3) + ' c',
        rsKm: (STATE.schwarzschildRadius / 1000).toFixed(2),
        rate: STATE.timeRate.toFixed(4) + '×',
        note: ($('readingNote')?.value || '').trim(),
    };
    readings.push(reading);
    saveJSON(READINGS_KEY, readings);
    renderReadings();
    if ($('readingNote')) $('readingNote').value = '';
}

function exportReadings() {
    const rows = [
        ['Trial', 'Email', 'Timestamp', 'Local Time', 'Reference Time', 'Probe Proper Time',
         'Distance (r/rs)', 'Mass (Msun)', 'Velocity (v/c)', 'Schwarzschild Radius (km)',
         'Time Rate', 'Observation'],
        ...readings.map(r => [r.trial, r.email || 'Guest', r.timestamp, r.localTime, r.referenceTime, r.probeTime,
            r.distance, r.mass, r.velocity, r.rsKm, r.rate, r.note]),
    ];
    downloadCsv('relativity-lab-readings.csv', rows);
}

function initReadings() {
    readings = loadJSON(READINGS_KEY, []);
    if (!Array.isArray(readings)) readings = [];
    renderReadings();

    $('logReadingBtn')?.addEventListener('click', () => {
        if (!requireProfile()) return;
        captureReading();
    });

    // Gate the main START button unless a valid email profile exists. The
    // capture listener runs before app.js's bubble listener, so intro clicks
    // (which call startPauseBtn.click()) are gated too.
    $('startPauseBtn')?.addEventListener('click', (e) => {
        if (!profile && !STATE.isRunning) {
            e.preventDefault();
            e.stopImmediatePropagation();
            requireProfile();
        }
    }, true);
    $('exportReadingsBtn')?.addEventListener('click', exportReadings);
    $('clearReadingsBtn')?.addEventListener('click', () => {
        if (!readings.length || !confirm('Delete all logged readings?')) return;
        readings = [];
        saveJSON(READINGS_KEY, readings);
        renderReadings();
    });
    $('readingsBody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-reading-index]');
        if (!btn) return;
        readings.splice(Number(btn.dataset.readingIndex), 1);
        saveJSON(READINGS_KEY, readings);
        renderReadings();
    });
    $('applyPresetBtn')?.addEventListener('click', () => {
        const preset = PRESETS[$('presetSelect')?.value] || PRESETS.baseline;
        setSlider('distanceSlider', preset.distance);
        setSlider('massSlider', preset.mass);
        setSlider('velocitySlider', preset.velocity);
        setSlider('speedSlider', preset.speed);
    });
}

// ----------------------------------------------------------------------------
// Printable experiment report
// ----------------------------------------------------------------------------

function buildPrintReport() {
    const target = $('printReport');
    if (!target) return;
    const name = escapeHTML(($('studentName')?.value || profile?.email || 'Student').trim());
    const email = escapeHTML(profile?.email || 'Guest');
    const dtInput = $('sessionDateTime')?.value;
    const dt = dtInput ? new Date(dtInput) : new Date();
    const stamp = isNaN(dt.getTime()) ? new Date().toLocaleString() : dt.toLocaleString();
    const active = formatDuration(STATE.labElapsedSeconds);

    const readingRows = readings.length
        ? readings.map(r => `<tr><td>${r.trial}</td><td>${escapeHTML(r.email || 'Guest')}</td><td>${escapeHTML(r.localTime)}</td><td>${escapeHTML(r.referenceTime)}</td><td>${escapeHTML(r.probeTime)}</td><td>${escapeHTML(r.distance)}</td><td>${escapeHTML(r.mass)}</td><td>${escapeHTML(r.velocity)}</td><td>${escapeHTML(r.rate)}</td><td>${escapeHTML(r.note || '')}</td></tr>`).join('')
        : '<tr><td colspan="10">No readings were recorded during this session.</td></tr>';

    target.innerHTML = `
        <h1>Time Dilation Simulator — Virtual Relativity Lab</h1>
        <div class="report-meta">
            <div><div class="report-label">Student / User</div><div class="report-value">${name}</div></div>
            <div><div class="report-label">Profile Email</div><div class="report-value">${email}</div></div>
            <div><div class="report-label">Session Date &amp; Time</div><div class="report-value">${escapeHTML(stamp)}</div></div>
            <div><div class="report-label">Total Active Lab Time</div><div class="report-value">${active}</div></div>
        </div>

        <h2>Current Configuration</h2>
        <p>Distance r/r<sub>s</sub>: <b>${STATE.distance_r.toFixed(2)}</b> &nbsp;|&nbsp;
           Mass: <b>${STATE.blackHoleMass.toFixed(1)} M☉</b> &nbsp;|&nbsp;
           Velocity: <b>${STATE.velocityBeta.toFixed(3)} c</b> &nbsp;|&nbsp;
           Spin a: <b>${STATE.blackHoleSpin.toFixed(2)}</b> &nbsp;|&nbsp;
           Schwarzschild radius: <b>${(STATE.schwarzschildRadius / 1000).toFixed(2)} km</b> &nbsp;|&nbsp;
           Time rate: <b>${STATE.timeRate.toFixed(4)}×</b></p>
        <p>Earth reference observer: <b>26,500 light-years</b> from the black hole.</p>

        <h2>Physics Equations</h2>
        <div class="equation-box">
            Schwarzschild radius: r<sub>s</sub> = 2GM/c²<br>
            General relativity: dτ/dt = √(1 − r<sub>s</sub>/r)<br>
            Special relativity: Δt = Δt₀/√(1 − v²/c²) &nbsp;;&nbsp; γ = 1/√(1 − v²/c²)<br>
            Combined proper-time rate: dτ/dt = √(1 − r<sub>s</sub>/r) × √(1 − v²/c²)
        </div>

        <h2>Recorded Readings (${readings.length})</h2>
        <table>
            <thead><tr><th>#</th><th>Email</th><th>Local</th><th>Reference</th><th>Probe</th><th>r/rₛ</th><th>M</th><th>v/c</th><th>Rate</th><th>Observation</th></tr></thead>
            <tbody>${readingRows}</tbody>
        </table>
        <p class="footer-note">Generated by the Time Dilation Simulator Virtual Relativity Lab. Values are educational simulations of relativistic effects.</p>
    `;
}

function initPrint() {
    const field = $('sessionDateTime');
    if (field && !field.value) {
        const now = new Date();
        field.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    $('printReportBtn')?.addEventListener('click', () => {
        buildPrintReport();
        window.print();
    });
}

// ----------------------------------------------------------------------------
// Owner usage & billing
// ----------------------------------------------------------------------------

function defaultBilling() {
    return {
        settings: {
            currency: '₹', rateHour: 60, rateMinute: 1,
            basis: 'active', minIncrement: 1,
        },
        sessions: [],
    };
}

function normalizeBilling(data) {
    const base = defaultBilling();
    if (!data || typeof data !== 'object') return base;
    return {
        settings: { ...base.settings, ...(data.settings || {}) },
        sessions: Array.isArray(data.sessions) ? data.sessions : [],
    };
}

function persistBilling() {
    saveJSON(BILLING_KEY, billing);
}

function billableSeconds(session) {
    const basis = billing.settings.basis;
    return Math.max(0, Number(basis === 'total' ? session.totalSeconds : session.activeSeconds) || 0);
}

function sessionAmount(session) {
    const s = billing.settings;
    const minutes = billableSeconds(session) / 60;
    const inc = Math.max(1, Number(s.minIncrement) || 1);
    const roundedMinutes = Math.ceil(minutes / inc) * inc;
    const perMinute = Number(s.rateMinute) > 0
        ? Number(s.rateMinute)
        : (Number(s.rateHour) || 0) / 60;
    return roundedMinutes * perMinute;
}

function renderProfileSummary() {
    const body = $('profileSummaryBody');
    if (!body) return;
    const byEmail = new Map();
    billing.sessions.forEach(sess => {
        const email = sess.user || 'Student';
        const entry = byEmail.get(email) || { sessions: 0, totalSeconds: 0, activeSeconds: 0, amount: 0, settled: 0 };
        entry.sessions += 1;
        entry.totalSeconds += Number(sess.totalSeconds) || 0;
        entry.activeSeconds += Number(sess.activeSeconds) || 0;
        entry.amount += sessionAmount(sess);
        if (sess.paid) entry.settled += 1;
        byEmail.set(email, entry);
    });
    if (!byEmail.size) {
        body.innerHTML = '<tr><td colspan="6" class="empty-row">No user profiles with sessions yet.</td></tr>';
        return;
    }
    const sym = escapeHTML(billing.settings.currency || '');
    body.innerHTML = [...byEmail.entries()].map(([email, e]) => `
        <tr>
            <td>${escapeHTML(email)}</td>
            <td>${e.sessions}</td>
            <td>${formatDuration(e.totalSeconds)}</td>
            <td>${formatDuration(e.activeSeconds)}</td>
            <td>${sym}${e.amount.toFixed(2)}</td>
            <td>${e.settled} / ${e.sessions}</td>
        </tr>`).join('');
}

function renderBilling() {
    if (!billingUnlocked) return;
    const s = billing.settings;
    const sym = escapeHTML(s.currency || '');
    renderProfileSummary();

    if ($('usageTotal')) $('usageTotal').textContent = formatDuration(currentSession?.totalSeconds || 0);
    if ($('usageActive')) $('usageActive').textContent = formatDuration(currentSession?.activeSeconds || 0);
    if ($('usageBillable')) $('usageBillable').textContent = formatDuration(billableSeconds(currentSession || {}));
    if ($('usageAmount')) $('usageAmount').textContent = sym + sessionAmount(currentSession || {}).toFixed(2);

    const body = $('billingBody');
    if (!body) return;
    if (!billing.sessions.length) {
        body.innerHTML = '<tr><td colspan="9" class="empty-row">No sessions recorded yet.</td></tr>';
        return;
    }
    body.innerHTML = billing.sessions.map((sess, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${escapeHTML(sess.user || 'Student')}</td>
            <td>${escapeHTML(formatStamp(sess.startedAt))}</td>
            <td>${formatDuration(sess.totalSeconds)}</td>
            <td>${formatDuration(sess.activeSeconds)}</td>
            <td>${formatDuration(billableSeconds(sess))}</td>
            <td>${sym}${sessionAmount(sess).toFixed(2)}</td>
            <td>${sess.paid ? 'PAID' : 'UNPAID'}</td>
            <td>
                <button class="row-paid" data-session-paid="${i}" title="Toggle paid">${sess.paid ? '↺' : '✓'}</button>
                <button class="row-del" data-session-del="${i}" title="Delete session">&times;</button>
            </td>
        </tr>`).join('');
}

function startNewSession(user) {
    if (currentSession) {
        const existing = billing.sessions.find(x => x.id === currentSession.id);
        if (existing) {
            existing.totalSeconds = currentSession.totalSeconds;
            existing.activeSeconds = currentSession.activeSeconds;
            existing.endedAt = new Date().toISOString();
        }
    }
    currentSession = {
        id: Date.now(),
        user: (user || 'Student').trim() || 'Student',
        startedAt: new Date().toISOString(),
        endedAt: null,
        totalSeconds: 0,
        activeSeconds: 0,
        paid: false,
    };
    billing.sessions.push(currentSession);
    persistBilling();
    renderBilling();
}

function tickUsage() {
    // Poll wall-clock time; independent of the simulated clock rates.
    // Wall-clock stopwatch: counts only while the simulation is running and is
    // independent of render-frame throttling or simulated time dilation.
    if (STATE.isRunning) STATE.labElapsedSeconds = (STATE.labElapsedSeconds || 0) + 1;
    if ($('labStopwatch')) $('labStopwatch').textContent = formatDuration(STATE.labElapsedSeconds || 0);
    if (currentSession) {
        currentSession.totalSeconds += 1;
        if (STATE.isRunning) currentSession.activeSeconds += 1;
        // Persist every 10 seconds to avoid excessive localStorage writes.
        if (currentSession.totalSeconds % 10 === 0) persistBilling();
    }
    renderBilling();
}

async function syncOwnerData() {
    const remote = await LabStorage.pullAll();
    if (!remote) return;
    if (Array.isArray(remote.readings)) {
        const seen = new Set(readings.map(r => r.timestamp + '|' + (r.email || '')));
        remote.readings.forEach(r => {
            if (r && !seen.has(r.timestamp + '|' + (r.email || ''))) readings.push(r);
        });
        saveJSON(READINGS_KEY, readings);
        renderReadings();
    }
    if (remote.billing && Array.isArray(remote.billing.sessions)) {
        const seen = new Set(billing.sessions.map(s => s.id));
        remote.billing.sessions.forEach(s => { if (s && !seen.has(s.id)) billing.sessions.push(s); });
        billing.settings = { ...billing.settings, ...(remote.billing.settings || {}) };
        persistBilling();
    }
    if (Array.isArray(remote.profiles)) {
        profiles = remote.profiles.filter(p => p && isValidEmail(p.email));
        saveJSON(PROFILES_KEY, profiles);
    }
    renderBilling();
    renderProfile();
}

function unlockOwnerConsole() {
    const keyOk = String($('ownerKey')?.value || '').trim() === OWNER_URL_KEY;
    const pinOk = String($('billingPin')?.value || '') === OWNER_PIN;
    if (!keyOk || !pinOk) {
        if ($('billingPinError')) $('billingPinError').textContent = !keyOk ? 'Incorrect owner URL key.' : 'Incorrect PIN.';
        return;
    }
    billingUnlocked = true;
    $('billingGate')?.classList.add('hidden');
    $('billingContent')?.classList.remove('hidden');
    if ($('billingPinError')) $('billingPinError').textContent = '';
    renderBilling();
    void syncOwnerData();
}

function initBilling() {
    billing = normalizeBilling(loadJSON(BILLING_KEY, null));

    // Any session left open by a previous page load is closed at unload time;
    // guarantee it is not billed as still running when a new page opens.
    billing.sessions.forEach(sess => {
        if (!sess.endedAt) sess.endedAt = new Date().toISOString();
    });
    // A session is created only after a student signs in with a valid email.
    currentSession = null;

    const setField = (id, key) => {
        const el = $(id);
        if (el && billing.settings[key] !== undefined) el.value = billing.settings[key];
    };
    setField('billingCurrency', 'currency');
    setField('rateHour', 'rateHour');
    setField('rateMinute', 'rateMinute');
    setField('billingBasis', 'basis');
    setField('minIncrement', 'minIncrement');

    $('billingUnlockBtn')?.addEventListener('click', unlockOwnerConsole);
    $('billingPin')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('billingUnlockBtn')?.click();
    });

    $('saveBillingBtn')?.addEventListener('click', () => {
        billing.settings = {
            currency: ($('billingCurrency')?.value || '₹').slice(0, 4),
            rateHour: Math.max(0, Number($('rateHour')?.value) || 0),
            rateMinute: Math.max(0, Number($('rateMinute')?.value) || 0),
            basis: $('billingBasis')?.value === 'total' ? 'total' : 'active',
            minIncrement: Math.max(1, Number($('minIncrement')?.value) || 1),
        };
        persistBilling();
        renderBilling();
    });

    $('newSessionBtn')?.addEventListener('click', () => startNewSession($('billingUser')?.value));

    $('billingBody')?.addEventListener('click', (e) => {
        const paid = e.target.closest('[data-session-paid]');
        const del = e.target.closest('[data-session-del]');
        if (paid) {
            const sess = billing.sessions[Number(paid.dataset.sessionPaid)];
            if (sess) { sess.paid = !sess.paid; persistBilling(); renderBilling(); }
        }
        if (del) {
            const sess = billing.sessions[Number(del.dataset.sessionDel)];
            if (!sess) return;
            if (sess.id === currentSession?.id) currentSession = null;
            billing.sessions.splice(Number(del.dataset.sessionDel), 1);
            persistBilling();
            renderBilling();
        }
    });

    $('exportBillingBtn')?.addEventListener('click', () => {
        const sym = billing.settings.currency || '';
        const rows = [
            ['Session', 'User', 'Started', 'Ended', 'Connected (s)', 'Active (s)', 'Billable (s)', 'Rate/Min', 'Amount', 'Status'],
            ...billing.sessions.map((sess, i) => [
                i + 1, sess.user, sess.startedAt, sess.endedAt || '',
                Math.floor(sess.totalSeconds || 0), Math.floor(sess.activeSeconds || 0),
                Math.floor(billableSeconds(sess)),
                (Number(billing.settings.rateMinute) > 0 ? billing.settings.rateMinute : (Number(billing.settings.rateHour) || 0) / 60),
                sym + sessionAmount(sess).toFixed(2), sess.paid ? 'PAID' : 'UNPAID',
            ]),
        ];
        downloadCsv('relativity-lab-billing.csv', rows);
    });

    $('resetBillingBtn')?.addEventListener('click', () => {
        if (!confirm('Delete all billing sessions and settings?')) return;
        billing = defaultBilling();
        currentSession = null;
        persistBilling();
        renderBilling();
    });

    window.addEventListener('beforeunload', () => {
        if (currentSession) currentSession.endedAt = new Date().toISOString();
        persistBilling();
    });
}

// ----------------------------------------------------------------------------
// Boot
// ----------------------------------------------------------------------------

function initRouting() {
    document.body.classList.add(VIEW_MODE === 'owner' ? 'owner-view' : 'lab-view');
    if (VIEW_MODE === 'owner') {
        // Skip the cinematic intro for the private owner console.
        const intro = $('cosmicIntro');
        const splash = $('startupScreen');
        if (intro) intro.style.display = 'none';
        if (splash) splash.style.display = 'none';
        // The key arrives in the URL; prefill it so the PIN is the only entry.
        if ($('ownerKey')) $('ownerKey').value = OWNER_URL_KEY;
        openModal($('billingPanel'));
    } else {
        $('billingToggleBtn')?.classList.add('hidden');
    }
}

function initVirtualLab() {
    initModals();
    initReadings();
    initPrint();
    initBilling();
    initProfile();
    initRouting();
    setInterval(tickUsage, 1000);
    tickUsage();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVirtualLab);
} else {
    initVirtualLab();
}
