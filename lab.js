// ============================================================================
// VIRTUAL RELATIVITY LAB — NOTEBOOK, PRESETS, PRINT REPORT, OWNER BILLING
// ============================================================================
// This module is intentionally isolated from the Three.js render loop. It reads
// the live simulation STATE and polls once per second, so it can be replaced by
// a backend later without touching the physics engine. All data is per-browser
// in localStorage; see DEPLOY.md for the shared-database caveat.
// ============================================================================

const OWNER_PIN = '4825'; // Owner PIN for the lab usage/billing window.
const READINGS_KEY = 'tds.virtualLab.readings.v1';
const BILLING_KEY = 'tds.virtualLab.billing.v1';

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

// ----------------------------------------------------------------------------
// Small utilities
// ----------------------------------------------------------------------------

function loadJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage disabled */ }
}

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

    $('labToggleBtn')?.addEventListener('click', () => openModal(labPanel));
    $('labCloseBtn')?.addEventListener('click', () => closeModal(labPanel));
    labPanel?.addEventListener('click', (e) => { if (e.target === labPanel) closeModal(labPanel); });

    $('billingToggleBtn')?.addEventListener('click', () => openModal(billingPanel));
    $('billingCloseBtn')?.addEventListener('click', () => closeModal(billingPanel));
    billingPanel?.addEventListener('click', (e) => { if (e.target === billingPanel) closeModal(billingPanel); });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closeModal(labPanel);
        closeModal(billingPanel);
    });
}

// ----------------------------------------------------------------------------
// Readings notebook
// ----------------------------------------------------------------------------

function renderReadings() {
    const body = $('readingsBody');
    if (!body) return;
    if (!readings.length) {
        body.innerHTML = '<tr><td colspan="12" class="empty-row">No readings logged yet.</td></tr>';
        return;
    }
    body.innerHTML = readings.map((r, i) => `
        <tr>
            <td>${i + 1}</td>
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
        ['Trial', 'Timestamp', 'Local Time', 'Reference Time', 'Probe Proper Time',
         'Distance (r/rs)', 'Mass (Msun)', 'Velocity (v/c)', 'Schwarzschild Radius (km)',
         'Time Rate', 'Observation'],
        ...readings.map(r => [r.trial, r.timestamp, r.localTime, r.referenceTime, r.probeTime,
            r.distance, r.mass, r.velocity, r.rsKm, r.rate, r.note]),
    ];
    downloadCsv('relativity-lab-readings.csv', rows);
}

function initReadings() {
    readings = loadJSON(READINGS_KEY, []);
    if (!Array.isArray(readings)) readings = [];
    renderReadings();

    $('logReadingBtn')?.addEventListener('click', captureReading);
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
    const name = escapeHTML(($('studentName')?.value || 'Student').trim());
    const dtInput = $('sessionDateTime')?.value;
    const dt = dtInput ? new Date(dtInput) : new Date();
    const stamp = isNaN(dt.getTime()) ? new Date().toLocaleString() : dt.toLocaleString();
    const active = formatDuration(STATE.labElapsedSeconds);

    const readingRows = readings.length
        ? readings.map(r => `<tr><td>${r.trial}</td><td>${escapeHTML(r.localTime)}</td><td>${escapeHTML(r.referenceTime)}</td><td>${escapeHTML(r.probeTime)}</td><td>${escapeHTML(r.distance)}</td><td>${escapeHTML(r.mass)}</td><td>${escapeHTML(r.velocity)}</td><td>${escapeHTML(r.rate)}</td><td>${escapeHTML(r.note || '')}</td></tr>`).join('')
        : '<tr><td colspan="9">No readings were recorded during this session.</td></tr>';

    target.innerHTML = `
        <h1>Time Dilation Simulator — Virtual Relativity Lab</h1>
        <div class="report-meta">
            <div><div class="report-label">Student / User</div><div class="report-value">${name}</div></div>
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
            <thead><tr><th>#</th><th>Local</th><th>Reference</th><th>Probe</th><th>r/rₛ</th><th>M</th><th>v/c</th><th>Rate</th><th>Observation</th></tr></thead>
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

function renderBilling() {
    if (!billingUnlocked) return;
    const s = billing.settings;
    const sym = escapeHTML(s.currency || '');

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

function initBilling() {
    billing = normalizeBilling(loadJSON(BILLING_KEY, null));

    // Any session left open by a previous page load is closed at unload time;
    // guarantee it is not billed as still running when a new page opens.
    billing.sessions.forEach(sess => {
        if (!sess.endedAt) sess.endedAt = new Date().toISOString();
    });
    startNewSession($('billingUser')?.value || 'Student');

    const setField = (id, key) => {
        const el = $(id);
        if (el && billing.settings[key] !== undefined) el.value = billing.settings[key];
    };
    setField('billingCurrency', 'currency');
    setField('rateHour', 'rateHour');
    setField('rateMinute', 'rateMinute');
    setField('billingBasis', 'basis');
    setField('minIncrement', 'minIncrement');

    $('billingUnlockBtn')?.addEventListener('click', () => {
        if (($('billingPin')?.value || '') === OWNER_PIN) {
            billingUnlocked = true;
            $('billingGate')?.classList.add('hidden');
            $('billingContent')?.classList.remove('hidden');
            if ($('billingPinError')) $('billingPinError').textContent = '';
            renderBilling();
        } else {
            if ($('billingPinError')) $('billingPinError').textContent = 'Incorrect PIN.';
        }
    });
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
        startNewSession($('billingUser')?.value || 'Student');
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

function initVirtualLab() {
    initModals();
    initReadings();
    initPrint();
    initBilling();
    setInterval(tickUsage, 1000);
    tickUsage();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVirtualLab);
} else {
    initVirtualLab();
}
