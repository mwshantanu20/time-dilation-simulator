// ============================================================================
// COSMIC INTRO — travel through the universe, arrive in the Milky Way,
// then a TAP TO START screen with the simulator controls.
// Self-contained: delete this file (+ intro.css + its <link>/<script> tags in
// index.html) to restore the original startup splash.
// ============================================================================

(() => {
    const overlay = document.getElementById('cosmicIntro');
    if (!overlay) return;

    const canvas = document.getElementById('introCanvas');
    const captionEl = document.getElementById('introCaption');
    const skipEl = document.getElementById('introSkip');
    const startScreen = document.getElementById('introStart');
    const startBtn = document.getElementById('introStartBtn');
    const ctx = canvas.getContext('2d');

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ----- timeline (seconds) -----
    const CAPTIONS = [
        { tIn: 0.6,  tOut: 3.0,  text: 'LOG 01 — DEPARTING INTERGALACTIC SPACE' },
        { tIn: 3.3,  tOut: 5.3,  text: 'LOG 02 — CROSSING THE COSMIC WEB' },
        { tIn: 5.5,  tOut: 7.0,  text: 'LOG 03 — PASSING DISTANT GALAXIES' },
        { tIn: 7.2,  tOut: 8.7,  text: 'LOG 04 — APPROACHING THE MILKY WAY' },
        { tIn: 8.9,  tOut: 10.4, text: 'REFERENCE LOCKED — EARTH OBSERVER · 26,500 LY' },
    ];
    const CARD_AT = 10.2;
    const GALAXY_APPEARS_AT = 6.3;

    let W = 0, H = 0, dpr = 1;
    let stars = [], galaxies = [], milkyDots = [];
    let running = true, phase = 'travel'; // travel -> card -> exiting -> done
    let startTime = performance.now();
    let activeCaption = -1;
    let cardShown = false;
    let rafId = null;

    const FOCAL = 340;

    // ---------- setup ----------
    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function makeStar(atFarZ) {
        const spread = Math.max(W, H);
        return {
            x: (Math.random() - 0.5) * spread * 2.4,
            y: (Math.random() - 0.5) * spread * 2.4,
            z: atFarZ ? 60 + Math.random() * 1400 : Math.random() * 1400,
            b: 0.35 + Math.random() * 0.65,
            hue: Math.random() < 0.12 ? (Math.random() < 0.5 ? 'warm' : 'blue') : 'white',
        };
    }

    // spiral-arm dot pattern in normalized [-1,1] coords (shared by passing galaxies + Milky Way)
    function makeSpiralDots(arms, count) {
        const dots = [];
        for (let i = 0; i < count; i++) {
            const r = Math.pow(Math.random(), 0.55);
            const arm = i % arms;
            const angle = arm * (Math.PI * 2 / arms) + r * 4.4 + (Math.random() - 0.5) * 0.55;
            dots.push({
                x: Math.cos(angle) * r,
                y: Math.sin(angle) * r * 0.62,      // perspective squash — seen at a tilt
                s: 0.4 + Math.random() * 1.3,
                a: 0.25 + Math.random() * 0.65,
                warm: Math.random() < 0.22,
            });
        }
        return dots;
    }

    function initScene() {
        resize();
        stars = Array.from({ length: 420 }, () => makeStar(true));
        galaxies = Array.from({ length: 6 }, (_, i) => ({
            x: (Math.random() - 0.5) * 1500,
            y: (Math.random() - 0.5) * 1000,
            z: 700 + i * 420 + Math.random() * 260,
            rot: Math.random() * Math.PI * 2,
            rotSpd: (Math.random() - 0.5) * 0.25,
            dots: makeSpiralDots(2 + (i % 2), 260),
            violet: i % 3 === 0,
        }));
        milkyDots = makeSpiralDots(3, 640);
    }

    // ---------- motion ----------
    function warpSpeed(t) {
        const easeIn = x => x * x;
        const easeInOut = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
        if (t < 1.2) return easeIn(t / 1.2) * 38;                       // engines spool up
        if (t < 6.2) return 38 + easeInOut((t - 1.2) / 5) * 100;        // full warp
        if (t < 8.5) return 138 - easeInOut((t - 6.2) / 2.3) * 128;     // decelerating into orbit
        return 10 - Math.min((t - 8.5) * 4, 8);                         // gentle drift
    }

    // ---------- drawing ----------
    function drawGalaxy(cx, cy, R, rot, alpha, dots, tint) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.globalAlpha = alpha;

        // core glow
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.55);
        core.addColorStop(0, 'rgba(235,245,255,0.9)');
        core.addColorStop(0.35, tint === 'violet' ? 'rgba(170,140,255,0.35)' : 'rgba(140,190,255,0.35)');
        core.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2); ctx.fill();

        // disk haze
        const disk = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
        disk.addColorStop(0, tint === 'violet' ? 'rgba(130,100,220,0.22)' : 'rgba(90,150,230,0.22)');
        disk.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = disk;
        ctx.save(); ctx.scale(1, 0.62);
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // arm stars
        for (const d of dots) {
            const px = d.x * R, py = d.y * R;
            ctx.globalAlpha = alpha * d.a;
            ctx.fillStyle = d.warm ? '#ffd9a8' : (tint === 'violet' ? '#d5c8ff' : '#dff0ff');
            const sz = d.s * Math.max(0.5, R / 220);
            ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    function drawMilkyWay(t) {
        if (t < GALAXY_APPEARS_AT) return;
        const p = Math.min((t - GALAXY_APPEARS_AT) / 3.4, 1);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const R = 14 + e * Math.min(W, H) * 0.40;
        const alpha = Math.min(p * 2.2, 1) * 0.95;
        const rot = t * 0.03;
        // faint outer halo first
        const halo = ctx.createRadialGradient(W / 2, H / 2, R * 0.2, W / 2, H / 2, R * 1.7);
        halo.addColorStop(0, 'rgba(110,160,240,0.10)');
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, R * 1.7, 0, Math.PI * 2); ctx.fill();
        drawGalaxy(W / 2, H / 2, R, rot, alpha, milkyDots, 'blue');
    }

    // ---------- captions ----------
    function updateCaptions(t) {
        let idx = -1;
        for (let i = 0; i < CAPTIONS.length; i++) {
            if (t >= CAPTIONS[i].tIn && t < CAPTIONS[i].tOut) { idx = i; break; }
        }
        if (idx === activeCaption) return;
        activeCaption = idx;
        if (idx === -1) { captionEl.classList.remove('show'); return; }
        captionEl.classList.remove('show');
        setTimeout(() => {
            if (activeCaption !== idx || phase !== 'travel') return;
            captionEl.textContent = CAPTIONS[idx].text;
            captionEl.classList.add('show');
        }, 280);
    }

    // ---------- main loop ----------
    function frame(now) {
        if (!running) return;
        const t = (now - startTime) / 1000;
        const dt = 1 / 60;
        const speed = warpSpeed(t);

        ctx.clearRect(0, 0, W, H);
        const cx = W / 2, cy = H / 2;

        // stars (warp streaks)
        for (const s of stars) {
            const prevZ = s.z;
            s.z -= speed * dt * 14;
            if (s.z < 6) {
                const far = makeStar(false);
                s.x = far.x; s.y = far.y; s.z = 1400 + Math.random() * 200; s.b = far.b; s.hue = far.hue;
            }
            const sx = cx + (s.x / s.z) * FOCAL, sy = cy + (s.y / s.z) * FOCAL;
            const px = cx + (s.x / prevZ) * FOCAL, py = cy + (s.y / prevZ) * FOCAL;
            const fade = Math.min(1, (1450 - s.z) / 900);
            ctx.globalAlpha = s.b * fade;
            ctx.strokeStyle = s.hue === 'warm' ? '#ffd9b0' : s.hue === 'blue' ? '#a8c8ff' : '#ffffff';
            ctx.lineWidth = Math.max(0.5, (1 - s.z / 1450) * 2.2);
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // passing galaxies
        for (const g of galaxies) {
            const prevZ = g.z;
            g.z -= speed * dt * 14;
            g.rot += g.rotSpd * dt;
            if (g.z < 40) {
                g.z = 1900 + Math.random() * 700;
                g.x = (Math.random() - 0.5) * 1700;
                g.y = (Math.random() - 0.5) * 1150;
            }
            if (prevZ < 40) continue;
            const sx = cx + (g.x / g.z) * FOCAL, sy = cy + (g.y / g.z) * FOCAL;
            const R = (230 / g.z) * FOCAL;
            if (R < 2 || sx < -R * 2 || sx > W + R * 2 || sy < -R * 2 || sy > H + R * 2) continue;
            const alpha = Math.min(1, (1900 - g.z) / 900) * Math.min(1, g.z / 260) * 0.9;
            drawGalaxy(sx, sy, R, g.rot, alpha, g.dots, g.violet ? 'violet' : 'blue');
        }

        drawMilkyWay(t);

        if (phase === 'travel') {
            updateCaptions(t);
            if (t >= CARD_AT && !cardShown) showCard();
        }

        rafId = requestAnimationFrame(frame);
    }

    // ---------- phases ----------
    function showCard() {
        cardShown = true;
        captionEl.classList.remove('show');
        if (skipEl) skipEl.style.display = 'none';
        startScreen.classList.add('visible');
        startBtn && startBtn.focus({ preventScroll: true });
    }

    function skipToCard() {
        if (phase !== 'travel') return;
        showCard();
    }

    function beginExit() {
        if (phase === 'exiting' || phase === 'done') return;
        phase = 'exiting';
        overlay.classList.add('intro-hidden');
        // hand control to the simulator: start the clocks, like pressing START
        setTimeout(() => {
            const btn = document.getElementById('startPauseBtn');
            if (btn && btn.textContent.trim().toUpperCase() === 'START') btn.click();
        }, 500);
        setTimeout(() => {
            running = false;
            if (rafId) cancelAnimationFrame(rafId);
            overlay.style.display = 'none';
            phase = 'done';
        }, 950);
    }

    // ---------- input ----------
    overlay.addEventListener('click', (e) => {
        if (phase === 'travel') { skipToCard(); return; }
        if (e.target === startBtn) beginExit();
    });
    startBtn && startBtn.addEventListener('click', (e) => { e.stopPropagation(); beginExit(); });
    document.addEventListener('keydown', (e) => {
        if (phase === 'exiting' || phase === 'done') return;
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') return;
        e.preventDefault();
        if (cardShown) beginExit();
        else skipToCard();
    });
    window.addEventListener('resize', () => { if (running) resize(); });

    // ---------- boot ----------
    initScene();
    if (reducedMotion) {
        // no warp animation — go straight to the welcome screen
        ctx.clearRect(0, 0, W, H);
        drawGalaxy(W / 2, H / 2, Math.min(W, H) * 0.40, 0.3, 0.9, milkyDots, 'blue');
        showCard();
    } else {
        rafId = requestAnimationFrame(frame);
    }
})();
