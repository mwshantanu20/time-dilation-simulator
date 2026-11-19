// ============================================================================
// GRAVITATIONAL TIME DILATION SIMULATOR — CINEMATIC EDITION
// ============================================================================

const CONSTANTS = {
    G: 6.674e-11,
    c: 299792458,
    solarMass: 1.989e30,
};

const STATE = {
    isRunning: false,
    localTime: 0,
    referenceTime: 0,
    timeRate: 1.0,
    // Probe distance measured in Schwarzschild radii (r / rs). Pure physics input.
    distance_r: 30.0,
    schwarzschildRadius: 14770,
    blackHoleMass: 5.0,
    sensitivity: 1.0,
    simulationSpeed: 1.0,
    // Probe velocity as a fraction of c (0 = stationary, 1 = light speed).
    velocityBeta: 0.0,
    // Lorentz factor gamma = 1 / sqrt(1 - beta^2); Infinity at beta = 1.
    lorentzFactor: 1.0,
    maxTimeRate: 2.0,
    // Kerr-like spin parameter a = Jc/(GM^2), 0 (Schwarzschild) to 0.99.
    blackHoleSpin: 0.0,
    // Shapiro-delayed probe clock (what the reference observer actually sees).
    laggedProbeTime: 0,
    telemetryLagMs: 0,
    behindLens: false,
    // Stopwatch: seconds the simulation has actually been running this session.
    labElapsedSeconds: 0,
};

// Physical reference distance of the Earth observer: 26,500 light-years.
const EARTH_DISTANCE_LY = 26500;
const LY_METERS = 9.4607e15;
// The 3D scene is compressed to Schwarzschild-radii units so WebGL stays
// readable. Earth's glyph sits at this visual radius; its physical clock rate
// is computed from EARTH_DISTANCE_LY, not from this scene coordinate.
const SUN_ORBIT_DISTANCE = 30;
const EARTH_VISUAL_DISTANCE = SUN_ORBIT_DISTANCE;
const EARTH_OFFSET = 3.5;

const CONFIG = {
    minDistance: 1.0,
    maxDistance: 50,
    demoDefaultDistance: EARTH_VISUAL_DISTANCE,
    minMass: 0.1,
    maxMass: 5.0,
};

// ============================================================================
// THREE.JS GLOBALS
// ============================================================================

let scene, camera, renderer, threeClock;
let blackHoleGroup, accretionGroup, starField, spacetimeMesh;
let earthMesh, earthAtmo, probeMesh, probeGlow, probeLight, orbitLine;
let lensingGroup, ghostLensingGroup;
let ghostSprites = [];
let planetsList;
let sunGroup, sunMesh;
let sunDipMesh, earthDipMesh;
const _dipTmp = new THREE.Vector3();
let pulsarGroup, pulsarEnabled = false, pulsarAudio = null, pulsarLastScheduledCycle = -1;
let sunOrbitAngle = 0, earthOrbitAngle = 0, moonAngle = 0;
let flameGroup, flameCorona, flamePoints, flameBase, flameSeed;
let wormholeGroup, wormholeBeam, wormholeCore, wormholeGlow, wormholeStream, wormholeFlash;
let wormholeIntensity = 0, wormholeLabelAnchor, wormholeBirth = -1;
let galaxy1, galaxy2, galaxy1Anchor;

// Orbital camera that can orbit ANY point (cameraOrbit.target) on the fabric.
// The orbit target follows `pTarget` with damping, so panning/flying is smooth.
let cameraOrbit = {
    theta: 0.8, phi: 1.1, radius: 28,
    tTheta: 0.8, tPhi: 1.1, tRadius: 28,
    target: { x: 0, y: 0, z: 0 },
    pTarget: { x: 0, y: 0, z: 0 },
    dragging: false, lastX: 0, lastY: 0, pan: false,
    minPhi: 0.15, maxPhi: 2.9,
    minRadius: 3, maxRadius: 280,
    panLimit: 80,
    fly: null,
};

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
let cinematicEnabled = false;
let isMobile = false;
let probeAngle = 0;
let currentVisualDistance = 30.0;
let warningStage = 0;
let startupDone = false;
let lastFabricMass = 0;

const DOM = {};

// ============================================================================
// INITIALIZATION
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || ('ontouchstart' in window) || (window.innerWidth < 768);
    cacheDOM();

    try {
        initSequence();
    } catch (err) {
        console.error('Initialization failed:', err);
        failStartup(err);
        return;
    }

    await runStartup();
    animate();
});

function initSequence() {
    initThree();
    createStarField();
    createSpacetimeFabric();
    createBlackHoleSystem();
    createAccretionDisk();
    createWormhole();
    createGalaxies();
    createPulsar();
    createPlanets();
    createFlames();
    createEarth();
    createProbe();
    createOrbitPath();
    createLensingEffect();
    createGhostLensing();
    setupEventListeners();
    calculateSchwarzchildRadius();
    resetSimulation();
}

function failStartup(err) {
    startupDone = true;
    const screen = DOM.startupScreen;
    const text = DOM.startupText;
    if (text) {
        text.textContent = 'SIMULATION COULD NOT INITIALIZE: ' + (err && err.message ? err.message : String(err));
        text.style.color = '#ff4d4d';
    }
    if (screen) {
        screen.classList.remove('hidden');
        screen.addEventListener('click', () => screen.classList.add('hidden'));
    }
}

function cacheDOM() {
    const ids = [
        'canvas-container', 'startPauseBtn', 'resetBtn',
        'distanceSlider', 'distanceSliderValue',
        'sensitivitySlider', 'sensitivitySliderValue',
        'maxRateSlider', 'maxRateSliderValue',
        'maxRateValue', 'rateScaleMax',
        'massSlider', 'massSliderValue',
        'speedSlider', 'speedSliderValue',
        'infoToggleBtn', 'infoCloseBtn', 'infoPanel',
        'localClock', 'earthClock', 'probeClock',
        'timeRate', 'timeRateHud', 'distanceValue', 'massDisplay', 'rateMarker',
        'velocityDisplay', 'gammaDisplay',
        'velocitySlider', 'velocitySliderValue',
        'redshiftDisplay', 'tidalDisplay', 'tidalFill', 'pingLagDisplay', 'spinDisplay',
        'spinSlider', 'spinSliderValue',
        'schwarzschildValue',
        'labToggleBtn', 'labCloseBtn', 'labPanel',
        'billingToggleBtn', 'billingCloseBtn', 'billingPanel',
        'warningOverlay', 'warningText',
        'startupScreen', 'startupText', 'startupBarFill',
        'cinematicBtn', 'fullscreenBtn', 'viewHomeBtn',
        'labelEarth', 'labelProbe', 'labelSpacetime',
        'labelMercury', 'labelVenus', 'labelMoon', 'labelMars', 'labelJupiter', 'labelSaturn', 'labelNeptune',
        'labelGalaxy1', 'labelGalaxy2', 'labelPulsar',
        'pulsarSoundBtn',
    ];
    ids.forEach(id => { DOM[id] = document.getElementById(id); });
}

function initThree() {
    const container = DOM['canvas-container'];
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020510);
    scene.fog = new THREE.FogExp2(0x020510, 0.008);

    camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000);
    updateCameraPosition();

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    threeClock = new THREE.Clock();

    const ambient = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xffeedd, 0.4);
    sunLight.position.set(20, 30, 10);
    scene.add(sunLight);

    window.addEventListener('resize', onWindowResize);
    setupCanvasInput();
}

// ============================================================================
// STAR FIELD
// ============================================================================

function createStarField() {
    const count = isMobile ? 1500 : 3000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const r = 100 + Math.random() * 800;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = r * Math.cos(phi);

        const brightness = 0.4 + Math.random() * 0.6;
        const tint = Math.random();
        colors[i3] = brightness * (tint > 0.9 ? 0.8 : 1);
        colors[i3 + 1] = brightness * (tint > 0.95 ? 0.85 : 1);
        colors[i3 + 2] = brightness * (tint < 0.1 ? 0.7 : 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
        size: 0.8, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true,
    });

    starField = new THREE.Points(geo, mat);
    // Pristine copy for the relativistic aberration transform (restore at beta=0).
    starField.userData.basePositions = positions.slice();
    starField.userData.aberrationActive = false;
    scene.add(starField);
}

// ============================================================================
// SPACETIME FABRIC
// ============================================================================

function getWellDepth(r, mass) {
    const strength = (mass || STATE.blackHoleMass) * 0.18;
    const softening = 0.6;
    return strength / Math.sqrt(r * r + softening * softening);
}

function createSpacetimeFabric() { rebuildSpacetimeFabric(); }

function rebuildSpacetimeFabric() {
    if (spacetimeMesh) {
        scene.remove(spacetimeMesh);
        spacetimeMesh.geometry.dispose();
        spacetimeMesh.material.dispose();
    }

    const rings = isMobile ? 35 : 60;
    const segs = isMobile ? 60 : 80;
    const maxR = 60;
    const positions = [];
    const indices = [];

    positions.push(0, -getWellDepth(0), 0);

    for (let i = 1; i <= rings; i++) {
        const r = (i / rings) * maxR;
        const y = -getWellDepth(r);
        for (let j = 0; j < segs; j++) {
            const a = (j / segs) * Math.PI * 2;
            positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
        }
    }

    for (let j = 0; j < segs; j++) {
        indices.push(0, 1 + j, 1 + ((j + 1) % segs));
    }
    for (let i = 0; i < rings - 1; i++) {
        for (let j = 0; j < segs; j++) {
            const a = 1 + i * segs + j;
            const b = 1 + i * segs + ((j + 1) % segs);
            const c = 1 + (i + 1) * segs + j;
            const d = 1 + (i + 1) * segs + ((j + 1) % segs);
            indices.push(a, c, b);
            indices.push(b, c, d);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
        color: 0x00b4e6, wireframe: true, transparent: true, opacity: 0.09, depthWrite: false,
    });

    spacetimeMesh = new THREE.Mesh(geo, mat);
    // Pristine grid used as the source for the frame-dragging twist.
    spacetimeMesh.userData.basePositions = Float32Array.from(positions);
    spacetimeMesh.userData.dragged = false;
    scene.add(spacetimeMesh);
    lastFabricMass = STATE.blackHoleMass;
}

function updateSpacetimeFabric(elapsed) {
    if (Math.abs(STATE.blackHoleMass - lastFabricMass) > 0.25) rebuildSpacetimeFabric();
    if (spacetimeMesh) {
        spacetimeMesh.material.opacity = 0.06 + Math.sin(elapsed * 0.3) * 0.03;
    }
    updateFrameDragging(elapsed);
}

// ============================================================================
// BLACK HOLE SYSTEM
// ============================================================================

function createBlackHoleSystem() {
    blackHoleGroup = new THREE.Group();
    scene.add(blackHoleGroup);

    // Event Horizon
    const ehGeo = new THREE.SphereGeometry(1, 64, 64);
    const ehMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eh = new THREE.Mesh(ehGeo, ehMat);
    eh.name = 'eventHorizon';
    blackHoleGroup.add(eh);

    // Event horizon glow sprite
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 256; glowCanvas.height = 256;
    const ctx = glowCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, 'rgba(80, 20, 120, 0.6)');
    grad.addColorStop(0.4, 'rgba(40, 10, 80, 0.3)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
    const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(glowCanvas), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glowSprite.scale.set(5, 5, 1);
    blackHoleGroup.add(glowSprite);

    // Photon Ring
    const prGeo = new THREE.TorusGeometry(1.5, 0.03, 16, 100);
    const prMat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.8 });
    const photonRing = new THREE.Mesh(prGeo, prMat);
    photonRing.rotation.x = Math.PI / 2;
    photonRing.name = 'photonRing';
    blackHoleGroup.add(photonRing);

    // Second photon ring
    const pr2 = new THREE.Mesh(
        new THREE.TorusGeometry(1.7, 0.02, 12, 80),
        new THREE.MeshBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0.4 })
    );
    pr2.rotation.x = Math.PI / 2;
    blackHoleGroup.add(pr2);
}

// ============================================================================
// ACCRETION DISK
// ============================================================================

function createAccretionDisk() {
    accretionGroup = new THREE.Group();
    accretionGroup.rotation.x = Math.PI * 0.35;

    const layers = [
        { inner: 2.0, outer: 2.8, color: 0xffee88, opacity: 0.65, speed: 0.4 },
        { inner: 2.8, outer: 4.0, color: 0xff8833, opacity: 0.45, speed: 0.25 },
        { inner: 4.0, outer: 5.8, color: 0xcc3311, opacity: 0.25, speed: 0.15 },
    ];

    layers.forEach((l) => {
        const r = (l.inner + l.outer) / 2;
        const tube = (l.outer - l.inner) / 2;
        const geo = new THREE.TorusGeometry(r, tube, 12, isMobile ? 48 : 80);
        const mat = new THREE.MeshBasicMaterial({
            color: l.color, transparent: true, opacity: l.opacity,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.speed = l.speed;
        mesh.userData.baseColor = mat.color.clone();
        accretionGroup.add(mesh);
    });

    // Accretion particles
    const pCount = isMobile ? 300 : 600;
    const pPos = new Float32Array(pCount * 3);
    const pCol = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 2.0 + Math.random() * 3.8;
        pPos[i * 3] = Math.cos(angle) * dist;
        pPos[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
        pPos[i * 3 + 2] = Math.sin(angle) * dist;
        const heat = 1 - (dist - 2) / 3.8;
        pCol[i * 3] = 1; pCol[i * 3 + 1] = 0.3 + heat * 0.5; pCol[i * 3 + 2] = heat * 0.3;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const pMat = new THREE.PointsMaterial({
        size: 0.06, vertexColors: true, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const particles = new THREE.Points(pGeo, pMat);
    particles.name = 'accretionParticles';
    particles.userData.baseColors = pCol.slice();
    accretionGroup.add(particles);

    blackHoleGroup.add(accretionGroup);
}

function updateAccretionDisk(dt) {
    accretionGroup.children.forEach(child => {
        if (child.isMesh) child.rotation.z += child.userData.speed * dt;
        if (child.isPoints) child.rotation.y += 0.05 * dt;
    });
}

// ============================================================================
// EARTH
// ============================================================================

function createEarthTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    const ocean = ctx.createLinearGradient(0, 0, 0, 256);
    ocean.addColorStop(0, '#0a2a5a'); ocean.addColorStop(0.3, '#124a8a');
    ocean.addColorStop(0.7, '#124a8a'); ocean.addColorStop(1, '#0a2a5a');
    ctx.fillStyle = ocean; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#1a7a3a';
    [[120,80,40,28,-0.3],[165,165,18,38,0.2],[268,95,14,18,0],
     [278,155,22,32,0],[355,75,48,28,0],[400,178,18,13,0],[320,130,25,12,0.1]
    ].forEach(([x,y,rx,ry,rot]) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    });
    ctx.fillStyle = 'rgba(220,240,255,0.55)';
    ctx.fillRect(0, 0, 512, 12); ctx.fillRect(0, 244, 512, 12);
    return new THREE.CanvasTexture(c);
}

function createEarth() {
    const tex = createEarthTexture();
    earthMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 32, 32),
        new THREE.MeshPhongMaterial({ map: tex, emissive: 0x0a1a30, emissiveIntensity: 0.3, shininess: 10 })
    );
    earthMesh.position.set(Math.cos(earthOrbitAngle) * EARTH_OFFSET, 0, Math.sin(earthOrbitAngle) * EARTH_OFFSET);
    if (sunGroup) sunGroup.add(earthMesh); else scene.add(earthMesh);

    const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 20, 20),
        new THREE.MeshPhongMaterial({ color: 0xaaaaaa, emissive: 0x121212, shininess: 4 })
    );
    moonMesh.position.set(Math.cos(moonAngle) * 1.6, 0, Math.sin(moonAngle) * 1.6);
    moonMesh.name = 'earthMoon';
    earthMesh.add(moonMesh);

    earthAtmo = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.08, depthWrite: false })
    );
    earthMesh.add(earthAtmo);

    earthDipMesh = createPlanetDip(1.0);
}

function updateEarth(dt) {
    if (!earthMesh) return;
    earthOrbitAngle += 0.12 * dt;
    earthMesh.position.set(Math.cos(earthOrbitAngle) * EARTH_OFFSET, 0, Math.sin(earthOrbitAngle) * EARTH_OFFSET);
    earthMesh.rotation.y += 0.06 * dt;
    if (earthDipMesh) {
        earthMesh.updateWorldMatrix(true, false);
        earthMesh.getWorldPosition(_dipTmp);
        updatePlanetDip(earthDipMesh, _dipTmp.x, _dipTmp.z);
    }
    const moon = earthMesh.getObjectByName('earthMoon');
    if (moon) {
        moonAngle += 4.5 * dt;
        moon.position.set(Math.cos(moonAngle) * 1.6, 0, Math.sin(moonAngle) * 1.6);
    }
}

// ============================================================================
// PLANETARY SYSTEM
// ============================================================================

const PLANET_DEFS = [
    { name: 'MERCURY', label: 'Mercury', distance: 1.4, size: 0.12, color: 0x9a8f86, texture: 'mercury', speed: 0.10,  special: false, mass: 0.055 },
    { name: 'VENUS',   label: 'Venus',   distance: 2.0, size: 0.22, color: 0xe8d08a, texture: 'venus',   speed: 0.075, special: false, mass: 0.815 },
    { name: 'EARTH',   label: 'Earth',   distance: EARTH_OFFSET, size: 0.8, color: 0x2255aa, speed: 0.04, special: true, mass: 1.0 },
    { name: 'MARS',    label: 'Mars',    distance: 4.6, size: 0.16, color: 0xc75b3a, texture: 'mars',    speed: 0.032, special: false, mass: 0.107 },
    { name: 'JUPITER', label: 'Jupiter', distance: 6.2, size: 0.55, color: 0xc88b3a, texture: 'jupiter', speed: 0.024, special: false, mass: 317.8 },
    { name: 'SATURN',  label: 'Saturn',  distance: 7.8, size: 0.5,  color: 0xe0c888, texture: 'saturn',  speed: 0.018, special: false, ring: true, mass: 95.2 },
    { name: 'NEPTUNE', label: 'Neptune', distance: 9.4, size: 0.42, color: 0x3366cc, texture: 'neptune', speed: 0.014, special: false, mass: 17.1 },
];

function createPlanetTexture(kind) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const x = c.getContext('2d');
    if (kind === 'mercury') {
        x.fillStyle = '#9a8f86'; x.fillRect(0, 0, 128, 64);
        for (let i = 0; i < 70; i++) {
            x.fillStyle = 'rgba(55,50,46,' + (0.08 + Math.random() * 0.3) + ')';
            x.beginPath(); x.arc(Math.random() * 128, Math.random() * 64, 0.8 + Math.random() * 2.6, 0, Math.PI * 2); x.fill();
        }
    } else if (kind === 'venus') {
        x.fillStyle = '#e8d08a'; x.fillRect(0, 0, 128, 64);
        for (let i = 0; i < 22; i++) {
            x.fillStyle = 'rgba(255,244,200,' + (0.05 + Math.random() * 0.14) + ')';
            x.beginPath(); x.ellipse(Math.random() * 128, Math.random() * 64, 8 + Math.random() * 16, 3 + Math.random() * 7, 0, 0, Math.PI * 2); x.fill();
        }
    } else if (kind === 'mars') {
        x.fillStyle = '#c75b3a'; x.fillRect(0, 0, 128, 64);
        for (let i = 0; i < 16; i++) {
            x.fillStyle = 'rgba(92,30,18,' + (0.18 + Math.random() * 0.28) + ')';
            x.beginPath(); x.ellipse(Math.random() * 128, 20 + Math.random() * 24, 5 + Math.random() * 11, 3 + Math.random() * 5, 0, 0, Math.PI * 2); x.fill();
        }
        x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(30, 0, 68, 6); x.fillRect(44, 58, 40, 6);
    } else if (kind === 'jupiter') {
        const bands = ['#c88b3a', '#a06a2a', '#e3c98f', '#8a5a28', '#c88b3a', '#d8c088', '#9a6a30', '#c88b3a'];
        for (let i = 0; i < bands.length; i++) {
            x.fillStyle = bands[i]; x.fillRect(0, (i * 64) / bands.length, 128, 64 / bands.length);
        }
        for (let i = 0; i < 46; i++) {
            x.fillStyle = 'rgba(255,240,200,' + (0.02 + Math.random() * 0.07) + ')';
            x.fillRect(Math.random() * 128, Math.random() * 64, 6 + Math.random() * 30, 1);
        }
    } else if (kind === 'saturn') {
        const g = x.createLinearGradient(0, 0, 0, 64);
        g.addColorStop(0, '#d8bd86'); g.addColorStop(0.5, '#f0e2b6'); g.addColorStop(1, '#d8bd86');
        x.fillStyle = g; x.fillRect(0, 0, 128, 64);
        for (let i = 0; i < 26; i++) {
            x.fillStyle = 'rgba(120,96,55,' + (0.06 + Math.random() * 0.1) + ')';
            x.fillRect(Math.random() * 128, Math.random() * 64, 4 + Math.random() * 18, 1);
        }
    } else if (kind === 'neptune') {
        x.fillStyle = '#2a5ec8'; x.fillRect(0, 0, 128, 64);
        x.fillStyle = 'rgba(255,255,255,0.14)';
        for (let i = 0; i < 9; i++) {
            x.beginPath(); x.ellipse(Math.random() * 128, 38 + Math.random() * 16, 8 + Math.random() * 13, 2 + Math.random() * 3, 0, 0, Math.PI * 2); x.fill();
        }
    } else {
        x.fillStyle = '#556677'; x.fillRect(0, 0, 128, 64);
    }
    return new THREE.CanvasTexture(c);
}

function createOrbitRing(radius) {
    const pts = [];
    const seg = 96;
    for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0x88aadd, transparent: true, opacity: 0.2, depthWrite: false,
    }));
}

// Per-planet spacetime dimple, depth proportional to mass (Earth = 1).
// Pass an optional [strength, width] override for special bodies (the Sun).
function planetDipParams(mass) {
    const strength = 0.3 * Math.pow(mass, 0.38);
    const width = Math.max(1.0, 1.0 + 0.3 * Math.log10(mass + 1.0));
    return [strength, width];
}

function createPlanetDip(mass, override) {
    const [strength, width] = override ? [override[0], override[1]] : planetDipParams(mass);
    const seg = 22;
    const size = width * 2.4;
    const half = size / 2;
    const vertices = [];
    const indices = [];
    for (let i = 0; i <= seg; i++) {
        for (let j = 0; j <= seg; j++) {
            const x = -half + (j / seg) * size;
            const z = -half + (i / seg) * size;
            const d = Math.hypot(x, z);
            vertices.push(x, -strength * Math.exp(-(d / width) * (d / width)), z);
        }
    }
    for (let i = 0; i < seg; i++) {
        for (let j = 0; j < seg; j++) {
            const a = i * (seg + 1) + j;
            const b = a + 1;
            const c = a + (seg + 1);
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    const opacity = override ? 0.5 : Math.min(0.55, 0.18 + 0.1 * Math.log10(mass + 1.0));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xaad4ff, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
    }));
    mesh.userData.dipStrength = strength;
    mesh.userData.dipWidth = width;
    mesh.userData.dipSize = size;
    mesh.userData.dipSeg = seg;
    scene.add(mesh);
    return mesh;
}

function updatePlanetDip(dip, worldX, worldZ) {
    if (!dip) return;
    const seg = dip.userData.dipSeg;
    const half = dip.userData.dipSize / 2;
    const size = dip.userData.dipSize;
    const strength = dip.userData.dipStrength;
    const width = dip.userData.dipWidth;
    const pos = dip.geometry.attributes.position;
    let idx = 0;
    for (let i = 0; i <= seg; i++) {
        for (let j = 0; j <= seg; j++) {
            const x = -half + (j / seg) * size;
            const z = -half + (i / seg) * size;
            const d = Math.hypot(x, z);
            pos.setY(idx, -strength * Math.exp(-(d / width) * (d / width)));
            idx++;
        }
    }
    pos.needsUpdate = true;
    dip.position.set(worldX, -getWellDepth(Math.hypot(worldX, worldZ)), worldZ);
}

function createPlanets() {
    sunGroup = new THREE.Group();
    sunGroup.rotation.x = 0.12;
    sunGroup.position.set(SUN_ORBIT_DISTANCE, 0, 0);
    scene.add(sunGroup);
    scene.add(createOrbitRing(SUN_ORBIT_DISTANCE));
    planetsList = [];

    sunMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.15, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0xffdd88 })
    );
    sunMesh.name = 'sun';
    sunGroup.add(sunMesh);

    const sunRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.03, 12, 64),
        new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    sunRing.rotation.x = Math.PI / 2;
    sunGroup.add(sunRing);

    // The Sun dominates the solar system: its spacetime well is deeper and
    // wider than any planet's (override strength/width).
    sunDipMesh = createPlanetDip(1.0, [3.4, 3.2]);

    PLANET_DEFS.forEach((def) => {
        const orbit = createOrbitRing(def.distance);
        sunGroup.add(orbit);
        if (def.special) return;

        const tex = createPlanetTexture(def.texture);
        const mat = new THREE.MeshPhongMaterial({
            map: tex, emissive: 0x0a0a14, shininess: 6,
        });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.size, 24, 24), mat);
        if (def.ring) {
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xddc9a0, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
            });
            const ring1 = new THREE.Mesh(new THREE.TorusGeometry(def.size * 1.85, 0.03, 8, 48), ringMat);
            ring1.rotation.x = Math.PI / 2 + 0.35;
            mesh.add(ring1);
            const ring2 = new THREE.Mesh(new THREE.TorusGeometry(def.size * 2.1, 0.014, 8, 48), ringMat);
            ring2.rotation.x = Math.PI / 2 + 0.32;
            ring2.material.opacity = 0.28;
            mesh.add(ring2);
        }
        mesh.name = def.name;
        mesh.position.set(Math.cos(def.speed * 40) * def.distance, 0, Math.sin(def.speed * 40) * def.distance);
        planetsList.push({ mesh, distance: def.distance, speed: def.speed, angle: def.speed * 40, label: def.label, dipMesh: createPlanetDip(def.mass) });
        sunGroup.add(mesh);
    });
}

function updatePlanets(dt) {
    if (!planetsList) return;
    planetsList.forEach((p) => {
        // Lense-Thirring tangential drift, strongest for the inner planets.
        p.angle += (p.speed + calculateFrameDrift(p.distance)) * dt;
        p.mesh.position.set(Math.cos(p.angle) * p.distance, 0, Math.sin(p.angle) * p.distance);
        p.mesh.rotation.y += 0.02 * dt;
        if (p.dipMesh) {
            p.mesh.updateWorldMatrix(true, false);
            p.mesh.getWorldPosition(_dipTmp);
            updatePlanetDip(p.dipMesh, _dipTmp.x, _dipTmp.z);
        }
    });
}

function updateSolarSystem(dt) {
    if (!sunGroup) return;
    sunOrbitAngle += dt * (0.02 + calculateFrameDrift(SUN_ORBIT_DISTANCE));
    sunGroup.position.set(Math.cos(sunOrbitAngle) * SUN_ORBIT_DISTANCE, 0, Math.sin(sunOrbitAngle) * SUN_ORBIT_DISTANCE);
    if (sunMesh) sunMesh.rotation.y += dt * 0.06;
    if (sunDipMesh) {
        sunGroup.updateWorldMatrix(true, false);
        sunGroup.getWorldPosition(_dipTmp);
        updatePlanetDip(sunDipMesh, _dipTmp.x, _dipTmp.z);
    }
}

// ============================================================================
// STELLAR FLAMES (corona + plasma around the central body)
// ============================================================================

function makeGlowSprite(col1, col2) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, col1);
    g.addColorStop(0.5, col2);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
    }));
}

function createFlames() {
    flameGroup = new THREE.Group();
    flameGroup.rotation.x = -0.4;
    if (sunGroup) sunGroup.add(flameGroup); else scene.add(flameGroup);

    flameCorona = makeGlowSprite('rgba(255,190,90,0.75)', 'rgba(255,70,20,0.28)');
    flameCorona.scale.set(7, 7, 1);
    flameGroup.add(flameCorona);

    const n = isMobile ? 140 : 260;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    flameBase = new Float32Array(n * 3);
    flameSeed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 1.3 + Math.random() * 2.7;
        const y = (Math.random() - 0.5) * 0.5;
        const x0 = Math.cos(angle) * r;
        const z0 = Math.sin(angle) * r;
        flameBase[i * 3] = x0; flameBase[i * 3 + 1] = y; flameBase[i * 3 + 2] = z0;
        pos[i * 3] = x0; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z0;
        flameSeed[i] = Math.random() * Math.PI * 2;
        const t = (r - 1.3) / 2.7;
        col[i * 3] = 1.0;
        col[i * 3 + 1] = 0.55 + 0.45 * t;
        col[i * 3 + 2] = 0.15 + 0.25 * t;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    flamePoints = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.13, vertexColors: true, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    flameGroup.add(flamePoints);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.35, 0.05, 12, 64),
        new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2;
    flameGroup.add(ring);
}

function updateFlames(dt, elapsed) {
    if (!flameGroup) return;
    flameGroup.rotation.y += dt * 0.25;
    if (flameCorona) {
        const s = 6.5 + Math.sin(elapsed * 2.2) * 0.8 + Math.sin(elapsed * 5.1) * 0.3;
        flameCorona.scale.set(s, s, 1);
        flameCorona.material.opacity = 0.55 + Math.sin(elapsed * 3.1) * 0.15;
    }
    if (flamePoints) {
        const pa = flamePoints.geometry.attributes.position;
        for (let i = 0; i < flameSeed.length; i++) {
            const x = flameBase[i * 3];
            const y = flameBase[i * 3 + 1];
            const z = flameBase[i * 3 + 2];
            const r = Math.sqrt(x * x + z * z);
            const a = Math.atan2(z, x) + elapsed * 0.6;
            pa.setXYZ(i, Math.cos(a) * r, y + Math.sin(elapsed * 2.4 + flameSeed[i]) * 0.12, Math.sin(a) * r);
        }
        pa.needsUpdate = true;
    }
}

// ============================================================================
// GALAXIES (galaxy 1 above the fabric, galaxy 2 below the wormhole exit)
// ============================================================================

function createSpiralGalaxy(o) {
    const count = o.count;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const arms = o.arms || 3;
    for (let i = 0; i < count; i++) {
        const r = Math.pow(Math.random(), 1.6) * o.radius;
        const armI = i % arms;
        const twist = armI * (Math.PI * 2 / arms) + (r / o.radius) * o.twist;
        const theta = twist + (Math.random() - 0.5) * o.width;
        const y = (Math.random() - 0.5) * o.thickness * (1 - r / (o.radius * 1.2) + 0.15);
        pos[i * 3] = Math.cos(theta) * r;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = Math.sin(theta) * r;
        const t = r / o.radius;
        const hot = Math.random() > t * t ? 1 : 0.3;
        col[i * 3]     = hot * (o.armColor[0] + (o.coreColor[0] - o.armColor[0]) * (1 - t));
        col[i * 3 + 1] = hot * (o.armColor[1] + (o.coreColor[1] - o.armColor[1]) * (1 - t));
        col[i * 3 + 2] = hot * (o.armColor[2] + (o.coreColor[2] - o.armColor[2]) * (1 - t));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
        size: o.size, vertexColors: true, transparent: true, opacity: o.opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
}

function createGalaxies() {
    galaxy1 = createSpiralGalaxy({
        count: isMobile ? 1400 : 3200,
        radius: 45, arms: 3, twist: 5.5, width: 0.5, thickness: 3.5,
        size: 0.16, opacity: 0.9,
        coreColor: [1.0, 0.95, 0.8], armColor: [0.6, 0.84, 1.0],
    });
    galaxy1.position.set(0, 120, -100);
    galaxy1.rotation.x = 1.25;
    scene.add(galaxy1);

    galaxy1Anchor = new THREE.Object3D();
    galaxy1Anchor.position.copy(galaxy1.position);
    scene.add(galaxy1Anchor);

    galaxy2 = createSpiralGalaxy({
        count: isMobile ? 800 : 1800,
        radius: 28, arms: 3, twist: 5.0, width: 0.45, thickness: 2.8,
        size: 0.17, opacity: 0.9,
        coreColor: [1.0, 0.7, 1.0], armColor: [0.5, 0.6, 1.0],
    });
    galaxy2.rotation.x = 0.6;
    galaxy2.position.y = -48;
    wormholeGroup.add(galaxy2);
}

function updateGalaxies(dt) {
    if (galaxy1) galaxy1.rotation.z += dt * 0.02;
    if (galaxy2 && wormholeGroup && wormholeGroup.visible) {
        galaxy2.rotation.z += dt * 0.12;
        galaxy2.material.opacity = 0.9 * wormholeIntensity;
    }
}

// ============================================================================
// WORMHOLE EXIT (GALAXY 2 at max mass)
// ============================================================================

function createWormhole() {
    wormholeGroup = new THREE.Group();
    wormholeGroup.visible = false;
    scene.add(wormholeGroup);

    wormholeBeam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 1.1, 1, 24, 1, true),
        new THREE.MeshBasicMaterial({
            color: 0x6fc8ff, transparent: true, opacity: 0.22,
            side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
    );
    wormholeBeam.material.userData.baseOp = 0.22;
    wormholeGroup.add(wormholeBeam);

    wormholeStream = new THREE.Points(
        (() => {
            const n = 70;
            const pos = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2;
                const rr = 0.15 + Math.random() * 0.5;
                pos[i * 3] = Math.cos(a) * rr;
                pos[i * 3 + 1] = Math.random() * 1 - 0.5;
                pos[i * 3 + 2] = Math.sin(a) * rr;
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            return g;
        })(),
        new THREE.PointsMaterial({
            color: 0xb4e0ff, size: 0.06, transparent: true, opacity: 0.8,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
        })
    );
    wormholeBeam.add(wormholeStream);

    wormholeCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.75, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    wormholeGroup.add(wormholeCore);

    wormholeGlow = makeGlowSprite('rgba(190,140,255,0.85)', 'rgba(90,40,180,0.3)');
    wormholeGlow.scale.set(3.5, 3.5, 1);
    wormholeGroup.add(wormholeGlow);

    const vortex = new THREE.Mesh(
        new THREE.TorusGeometry(1.15, 0.03, 12, 64),
        new THREE.MeshBasicMaterial({ color: 0x9f7bff, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    vortex.rotation.x = Math.PI / 2;
    vortex.material.userData.baseOp = 0.65;
    vortex.name = 'vortex';
    wormholeGroup.add(vortex);

    wormholeFlash = new THREE.Mesh(
        new THREE.TorusGeometry(1.7, 0.07, 12, 64),
        new THREE.MeshBasicMaterial({ color: 0xdcc8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    wormholeFlash.material.userData.baseOp = 0.9;
    wormholeFlash.name = 'flashRing';
    wormholeGroup.add(wormholeFlash);

    wormholeLabelAnchor = new THREE.Object3D();
    wormholeLabelAnchor.name = 'labelAnchor';
    wormholeGroup.add(wormholeLabelAnchor);

    positionWormhole();
}

function positionWormhole() {
    if (!wormholeGroup) return;
    const depth = getWellDepth(0);
    const coreY = -depth - 1.5;

    wormholeCore.position.set(0, coreY, 0);
    wormholeGlow.position.set(0, coreY, 0);
    wormholeLabelAnchor.position.set(0, coreY, 0);
    if (wormholeFlash) wormholeFlash.position.set(0, coreY, 0);

    const topY = -0.9;
    const len = Math.abs(coreY - topY);
    wormholeBeam.position.set(0, (coreY + topY) / 2, 0);
    wormholeBeam.scale.y = len;
    wormholeBeam.userData.len = len;

    if (galaxy2) galaxy2.position.y = coreY - 20;
}

function updateWormhole(dt, elapsed) {
    if (!wormholeGroup) return;
    const target = STATE.blackHoleMass >= 90
        ? Math.min(1, (STATE.blackHoleMass - 90) / 10)
        : 0;

    if (target > 0.01 && wormholeBirth < 0) wormholeBirth = elapsed;
    if (target <= 0.01) wormholeBirth = -1;

    wormholeIntensity += (target - wormholeIntensity) * Math.min(1, dt * 1.6);
    wormholeGroup.visible = wormholeIntensity > 0.01;
    if (!wormholeGroup.visible) return;

    const birth = wormholeBirth < 0 ? 1 : Math.min(1, (elapsed - wormholeBirth) / 1.6);

    wormholeGroup.traverse((o) => {
        if (o.isMesh && o.material && o.material.transparent) {
            const base = o.material.userData.baseOp != null ? o.material.userData.baseOp : 0.5;
            o.material.opacity = base * wormholeIntensity;
        }
    });
    const vortex = wormholeGroup.getObjectByName('vortex');
    if (vortex) vortex.rotation.z += dt * 0.8;

    wormholeBeam.rotation.y += dt * 0.4;
    wormholeBeam.scale.y = Math.max(0.001, wormholeBeam.userData.len || 1) * (0.12 + 0.88 * birth);
    if (wormholeGlow) {
        const s = 3 + Math.sin(elapsed * 2.5) * 0.5;
        wormholeGlow.scale.set(s, s, 1);
        wormholeGlow.material.opacity = 0.7 * wormholeIntensity;
    }
    if (wormholeFlash) {
        if (birth < 1) {
            const fs = 1 + (1 - birth) * 3.2;
            wormholeFlash.scale.set(fs, fs, 1);
            wormholeFlash.material.opacity = (1 - birth) * 0.9 * wormholeIntensity;
            wormholeFlash.rotation.z += dt * (2 - birth * 1.6);
            wormholeFlash.visible = true;
        } else {
            wormholeFlash.visible = false;
        }
    }
    if (galaxy2) {
        const s = 0.3 + 0.7 * birth + 0.05 * Math.sin(elapsed * 2);
        galaxy2.scale.setScalar(s);
    }
    if (wormholeStream) {
        const pa = wormholeStream.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
            let y = pa.getY(i) - dt * 0.35;
            if (y < -0.5) y = 0.5;
            pa.setY(i, y);
        }
        pa.needsUpdate = true;
    }
}

// ============================================================================
// PULSAR STAR (double flash + "damru" two-beat tick)
// ============================================================================

function createPulsar() {
    pulsarGroup = new THREE.Group();
    pulsarGroup.position.set(38, 3.4, -34);
    scene.add(pulsarGroup);

    const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    core.name = 'core';
    pulsarGroup.add(core);

    const glow = makeGlowSprite('rgba(255,255,255,0.9)', 'rgba(120,200,255,0.25)');
    glow.name = 'glow';
    glow.scale.set(2.4, 2.4, 1);
    pulsarGroup.add(glow);

    const beamGeo = new THREE.ConeGeometry(0.5, 8, 20, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0x9fd8ff, transparent: true, opacity: 0.05,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const b1 = new THREE.Mesh(beamGeo, beamMat);
    b1.name = 'beam1'; b1.position.x = 4; b1.rotation.z = Math.PI / 2;
    const b2 = new THREE.Mesh(beamGeo, beamMat);
    b2.name = 'beam2'; b2.position.x = -4; b2.rotation.z = -Math.PI / 2;
    pulsarGroup.add(b1); pulsarGroup.add(b2);
}

const PULSAR_PERIOD = 1.0;

// Fast damaru-style roll: "dha-ta-ta-dhin" pairs at ~12 strikes per second.
// v = volume, p = base pitch (lower = deep drum "dha/dhin", higher = drum "ta").
const DAMRU_PATTERN = [
    { t: 0.00, v: 1.0, p: 95 },
    { t: 0.07, v: 0.55, p: 170 },
    { t: 0.15, v: 0.55, p: 170 },
    { t: 0.22, v: 0.85, p: 100 },
    { t: 0.34, v: 1.0, p: 95 },
    { t: 0.41, v: 0.55, p: 170 },
    { t: 0.49, v: 0.55, p: 170 },
    { t: 0.56, v: 0.85, p: 100 },
    { t: 0.68, v: 1.0, p: 95 },
    { t: 0.75, v: 0.55, p: 170 },
    { t: 0.83, v: 0.55, p: 170 },
    { t: 0.90, v: 0.85, p: 100 },
];

function updatePulsar(dt, elapsed) {
    if (!pulsarGroup) return;
    pulsarGroup.rotation.y += dt * 0.9;

    const t = ((elapsed % PULSAR_PERIOD) + PULSAR_PERIOD) % PULSAR_PERIOD;
    let flash = 0;
    [0, 0.24].forEach((off) => {
        const d = t - off;
        if (d >= 0 && d < 0.14) flash = Math.max(flash, 1 - d / 0.14);
    });

    const core = pulsarGroup.getObjectByName('core');
    const glow = pulsarGroup.getObjectByName('glow');
    if (core) core.scale.setScalar(0.8 + 0.7 * flash);
    if (glow) {
        const s = 2 + 3.4 * flash;
        glow.scale.set(s, s, 1);
        glow.material.opacity = 0.4 + 0.6 * flash;
    }
    const b1 = pulsarGroup.getObjectByName('beam1');
    const b2 = pulsarGroup.getObjectByName('beam2');
    if (b1) b1.material.opacity = 0.05 + 0.45 * flash;
    if (b2) b2.material.opacity = 0.05 + 0.45 * flash;

    if (pulsarEnabled && pulsarAudio) {
        const cycle = Math.floor(elapsed / PULSAR_PERIOD);
        if (cycle > pulsarLastScheduledCycle) {
            pulsarLastScheduledCycle = cycle;
            const baseT = pulsarAudio.ctx.currentTime + 0.05;
            DAMRU_PATTERN.forEach((hit) => pulsarPlayHit(baseT + hit.t, hit.v, hit.p));
        }
    }
}

function pulsarPlayHit(t, vol, baseFreq) {
    if (!pulsarAudio) return;
    const ctx = pulsarAudio.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(38, baseFreq * 0.45), t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 0.4, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.18);

    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.028)), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(vol * 0.26, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(cg); cg.connect(ctx.destination);
    src.start(t);
}

// ============================================================================
// PROBE
// ============================================================================

function createProbe() {
    probeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0x00aaff })
    );
    probeMesh.position.set(STATE.distance_r, 0, 0);
    scene.add(probeMesh);

    const gc = document.createElement('canvas');
    gc.width = 64; gc.height = 64;
    const ctx = gc.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,180,255,0.8)'); g.addColorStop(0.5, 'rgba(0,120,255,0.2)');
    g.addColorStop(1, 'rgba(0,60,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    probeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(gc), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    probeGlow.scale.set(1.2, 1.2, 1);
    probeMesh.add(probeGlow);

    probeLight = new THREE.PointLight(0x00aaff, 0.5, 8);
    probeMesh.add(probeLight);
}

function updateProbe(dt, elapsed) {
    if (!probeMesh) return;
    // Visual orbit speed tracks the velocity control (1x at rest, 10x at c).
    // Clocks slow with gamma, but the probe's apparent motion speeds up.
    const orbitRate = 0.3 * STATE.simulationSpeed * (1 + STATE.velocityBeta * 9);
    if (STATE.isRunning) {
        probeAngle += dt * (orbitRate + calculateFrameDrift(currentVisualDistance));
    }
    currentVisualDistance += (STATE.distance_r - currentVisualDistance) * Math.min(1, dt * 2);
    probeMesh.position.set(Math.cos(probeAngle) * currentVisualDistance, 0, Math.sin(probeAngle) * currentVisualDistance);
    // Combined gravitational + kinematic redshift shifts probe, glow and disk.
    updateRedshiftVisuals();
    // Tidal field stretches the probe radially near r < 3rs.
    const deform = updateSpaghettification();
    if (probeGlow) {
        const p = 1.0 + Math.sin(elapsed * 3) * 0.15;
        // Inverse-scale the sprite so it stays round despite the stretched parent.
        probeGlow.scale.set(p / deform.stretch, p / deform.lateral, 1);
    }
    updateOrbitPath();
}

// ============================================================================
// ORBIT PATH
// ============================================================================

const ORBIT_SEGMENTS = 120;

function createOrbitPath() {
    const positions = new Float32Array(ORBIT_SEGMENTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    orbitLine = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: 0x00b4e6, transparent: true, opacity: 0.22, depthWrite: false })
    );
    orbitLine.frustumCulled = false;
    scene.add(orbitLine);
    updateOrbitPath();
}

function updateOrbitPath() {
    if (!orbitLine) return;
    const posAttr = orbitLine.geometry.attributes.position;
    const n = posAttr.count;
    const r = Math.max(currentVisualDistance, 1.1);
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        posAttr.setXYZ(i, Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    posAttr.needsUpdate = true;
}

// ============================================================================
// LENSING EFFECT
// ============================================================================

function createLensingEffect() {
    lensingGroup = new THREE.Group();
    [{ r: 2.2, tube: 0.08, color: 0xffeedd, opacity: 0.06 },
     { r: 2.6, tube: 0.12, color: 0xffccaa, opacity: 0.04 },
     { r: 3.2, tube: 0.18, color: 0xffeecc, opacity: 0.03 }
    ].forEach(r => {
        const mesh = new THREE.Mesh(
            new THREE.TorusGeometry(r.r, r.tube, 12, 64),
            new THREE.MeshBasicMaterial({
                color: r.color, transparent: true, opacity: r.opacity,
                side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
            })
        );
        mesh.rotation.x = Math.PI / 2;
        lensingGroup.add(mesh);
    });
    scene.add(lensingGroup);
}

function updateLensing(elapsed) {
    if (!lensingGroup) return;
    const intensity = Math.max(0, 1 - (currentVisualDistance - 1.05) / 5);
    lensingGroup.children.forEach((child, i) => {
        child.material.opacity = (0.04 + intensity * 0.08) * (1 - i * 0.2);
        const s = 1 + Math.sin(elapsed * 0.5 + i) * 0.02;
        child.scale.set(s, s, 1);
    });
}

// ============================================================================
// ADVANCED RELATIVITY EFFECTS
// Redshift · Spaghettification · Aberration · Frame dragging ·
// Shapiro delay · Photon-sphere ghost images
// ============================================================================

const REDSHIFT_INFRARED = 0x2a0202;
const LAG_VISUAL_SCALE = 25; // exaggerates sub-ms lag so telemetry visibly stutters
let redshiftVisualT = -1;
let fabricDragTick = 0;
let tidalWarnActive = false;

// The scene is normalized so one scene unit == one Schwarzschild radius.
// Distance is specified as r/rs, so the horizon is always at r = 1 regardless
// of mass; mass changes the physical rs in km, not the normalized geometry.
function getEffectiveRs() {
    return 1;
}

// 1 + z = 1 / (sqrt(1 - rs/r) * sqrt(1 - beta^2)); z -> Infinity at horizon/c.
function calculateRedshift(r, beta) {
    const raw = calculateProbeRate(r, beta);
    if (!(raw > 1e-9)) return Infinity;
    return 1 / raw - 1;
}

// Newtonian tidal acceleration across unit length: a ~ 2GM/r^3.
// With GM = rs/2 in scene units this is a = rs / r^3 (scaled x2 for display).
function calculateTidalAcceleration(r) {
    const rs = getEffectiveRs();
    return 2 * rs / Math.pow(Math.max(r, rs), 3);
}

// 0 at r = 3rs, 1 at the horizon — drives the spaghettification stretch.
function getTidalProgress(r) {
    if (!isFinite(r)) return 0;
    const rs = getEffectiveRs();
    return Math.min(1, Math.max(0, (3 * rs - r) / (2 * rs)));
}

// Lense-Thirring angular drift ~ a / r^3 (softened near the horizon).
function calculateFrameDrift(r) {
    const a = Math.min(0.99, Math.max(0, STATE.blackHoleSpin || 0));
    const soft = Math.max(r, getEffectiveRs() * 1.2);
    return Math.min(0.6, a * 8 / (soft * soft * soft));
}

// Shapiro round-trip delay: flat-space light time + (rs/c) ln(4 r_E r / b^2).
// b = photon-sphere impact parameter when the probe sits behind the lens.
function calculateShapiroLagMs(r, behindLens) {
    const rsKm = STATE.schwarzschildRadius / 1000;
    const cKmS = CONSTANTS.c / 1000;
    const safeR = Math.max(1, isFinite(r) ? r : 1);
    const geometricMs = (2 * safeR * rsKm / cKmS) * 1000;
    const b = behindLens ? 1.5 : Math.max(3, safeR * 0.5);
    const logTerm = Math.log(1 + 4 * EARTH_VISUAL_DISTANCE * safeR / (b * b));
    const shapiroMs = (STATE.schwarzschildRadius / CONSTANTS.c) * 1000 * logTerm;
    return geometricMs + shapiroMs;
}

// Telemetry arrives late when the line of sight grazes the black hole.
// A first-order lag filter turns that delay into visibly stale probe time.
function updateTelemetry(dt) {
    if (!camera || !probeMesh) return;
    const rs = getEffectiveRs();
    const cam = camera.position;
    const probe = probeMesh.position;
    const dirX = probe.x - cam.x, dirY = probe.y - cam.y, dirZ = probe.z - cam.z;
    const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
    const ux = dirX / len, uy = dirY / len, uz = dirZ / len;
    // Closest approach of the camera->probe ray to the black hole at the origin.
    const t = -(cam.x * ux + cam.y * uy + cam.z * uz);
    let behind = false;
    if (t > 0 && t < len) {
        const bx = cam.x + ux * t, by = cam.y + uy * t, bz = cam.z + uz * t;
        behind = Math.sqrt(bx * bx + by * by + bz * bz) < 3 * rs;
    }
    STATE.behindLens = behind;
    STATE.telemetryLagMs = calculateShapiroLagMs(currentVisualDistance, behind);
    const tau = Math.max(0.12, (STATE.telemetryLagMs / 1000) * LAG_VISUAL_SCALE);
    STATE.laggedProbeTime += (STATE.localTime - STATE.laggedProbeTime) * Math.min(1, dt / tau);
}

// Combined gravitational + kinematic redshift drives the probe, its glow,
// and the accretion-disk emission from blue through white/yellow to infrared.
function updateRedshiftVisuals() {
    const z = calculateRedshift(currentVisualDistance, STATE.velocityBeta);
    const t = isFinite(z) ? Math.min(1, z / 8) : 1;
    const hue = 0.6 * (1 - t);
    const light = 0.5 - 0.2 * t;
    if (probeMesh && probeMesh.material) probeMesh.material.color.setHSL(hue, 1, light);
    if (probeGlow && probeGlow.material) probeGlow.material.color.setHSL(hue, 1, light);
    if (probeLight) probeLight.color.setHSL(hue, 1, light);

    if (Math.abs(t - redshiftVisualT) < 0.005) return;
    redshiftVisualT = t;
    const infrared = new THREE.Color(REDSHIFT_INFRARED);
    if (accretionGroup) {
        accretionGroup.children.forEach((child) => {
            if (!child.material) return;
            if (child.userData.baseColor && child.material.color) {
                child.material.color.copy(child.userData.baseColor).lerp(infrared, t * 0.85);
            }
            if (child.userData.baseColors && child.geometry && child.geometry.attributes.color) {
                const base = child.userData.baseColors;
                const attr = child.geometry.attributes.color;
                for (let i = 0; i < attr.count; i++) {
                    const i3 = i * 3;
                    attr.array[i3] = base[i3] + (infrared.r - base[i3]) * t * 0.85;
                    attr.array[i3 + 1] = base[i3 + 1] + (infrared.g - base[i3 + 1]) * t * 0.85;
                    attr.array[i3 + 2] = base[i3 + 2] + (infrared.b - base[i3 + 2]) * t * 0.85;
                }
                attr.needsUpdate = true;
            }
        });
    }
}

// Radial stretching + lateral squeezing (volume-preserving) near r < 3rs.
function updateSpaghettification() {
    if (!probeMesh) return { stretch: 1, lateral: 1 };
    const tidal = getTidalProgress(currentVisualDistance);
    const stretch = 1 + tidal * 3;
    const lateral = 1 / Math.sqrt(stretch);
    probeMesh.scale.set(stretch, lateral, lateral);
    // Align the probe's local X axis with the radial vector toward the hole.
    probeMesh.rotation.y = -probeAngle;
    return { stretch, lateral };
}

// Relativistic aberration: cos(theta') = (cos(theta) + beta) / (1 + beta cos(theta))
// pulls apparent star positions toward the probe's direction of travel.
function updateAberration() {
    if (!starField) return;
    const base = starField.userData.basePositions;
    if (!base) return;
    const attr = starField.geometry.attributes.position;
    const orbitRate = STATE.isRunning
        ? 0.3 * STATE.simulationSpeed * (1 + STATE.velocityBeta * 9) : 0;
    const beta = Math.min(0.95, Math.max(STATE.velocityBeta, orbitRate / 6));
    if (beta < 0.01) {
        if (starField.userData.aberrationActive) {
            for (let i = 0; i < base.length; i++) attr.array[i] = base[i];
            attr.needsUpdate = true;
            starField.userData.aberrationActive = false;
        }
        return;
    }
    const dx = -Math.sin(probeAngle), dy = 0, dz = Math.cos(probeAngle);
    for (let i = 0; i < attr.count; i++) {
        const i3 = i * 3;
        const px = base[i3], py = base[i3 + 1], pz = base[i3 + 2];
        const r = Math.sqrt(px * px + py * py + pz * pz) || 1;
        const ux = px / r, uy = py / r, uz = pz / r;
        const dot = Math.max(-1, Math.min(1, ux * dx + uy * dy + uz * dz));
        const cosPrime = (dot + beta) / (1 + beta * dot);
        const theta = Math.acos(dot);
        const thetaPrime = Math.acos(Math.max(-1, Math.min(1, cosPrime)));
        const delta = theta - thetaPrime;
        let qx = dx - ux * dot, qy = dy - uy * dot, qz = dz - uz * dot;
        const qlen = Math.sqrt(qx * qx + qy * qy + qz * qz);
        if (qlen > 1e-6) {
            qx /= qlen; qy /= qlen; qz /= qlen;
            const cd = Math.cos(delta), sd = Math.sin(delta);
            attr.array[i3] = (ux * cd + qx * sd) * r;
            attr.array[i3 + 1] = (uy * cd + qy * sd) * r;
            attr.array[i3 + 2] = (uz * cd + qz * sd) * r;
        } else {
            attr.array[i3] = px; attr.array[i3 + 1] = py; attr.array[i3 + 2] = pz;
        }
    }
    attr.needsUpdate = true;
    starField.userData.aberrationActive = true;
}

// Frame dragging: twist the wireframe grid more strongly near the center,
// with an additional time-dependent vortex term proportional to spin a.
function updateFrameDragging(elapsed) {
    if (!spacetimeMesh) return;
    const base = spacetimeMesh.userData.basePositions;
    if (!base) return;
    const spin = STATE.blackHoleSpin;
    if (spin <= 0.001) {
        if (spacetimeMesh.userData.dragged) {
            const attr = spacetimeMesh.geometry.attributes.position;
            for (let i = 0; i < base.length; i++) attr.array[i] = base[i];
            attr.needsUpdate = true;
            spacetimeMesh.userData.dragged = false;
        }
        return;
    }
    // Halve the geometry work: the low-frequency vortex tolerates 30 Hz updates.
    if (++fabricDragTick % 2 !== 0) return;
    const attr = spacetimeMesh.geometry.attributes.position;
    for (let i = 0; i < attr.count; i++) {
        const i3 = i * 3;
        const x = base[i3], z = base[i3 + 2];
        const rho = Math.sqrt(x * x + z * z);
        const twist = spin * 2.5 / (rho + 1) + elapsed * spin * 0.25 * Math.exp(-rho / 8);
        const c = Math.cos(twist), s = Math.sin(twist);
        attr.array[i3] = x * c - z * s;
        attr.array[i3 + 2] = x * s + z * c;
    }
    attr.needsUpdate = true;
    spacetimeMesh.userData.dragged = true;
}

// Photon sphere (1.5 rs): secondary/tertiary Einstein rings plus mirrored
// ghost images of Earth and background galaxies, fading in near the boundary.
function createGhostLensing() {
    ghostLensingGroup = new THREE.Group();
    ghostSprites = [];
    [
        { r: 1.5, tube: 0.025, color: 0xffe8b0, opacity: 0.35 },
        { r: 2.25, tube: 0.02, color: 0xc9d8ff, opacity: 0.2 },
        { r: 3.0, tube: 0.015, color: 0xa0b4ff, opacity: 0.1 },
    ].forEach((ring) => {
        const mesh = new THREE.Mesh(
            new THREE.TorusGeometry(ring.r, ring.tube, 8, 96),
            new THREE.MeshBasicMaterial({
                color: ring.color, transparent: true, opacity: 0,
                side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
            })
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.userData.baseOpacity = ring.opacity;
        ghostLensingGroup.add(mesh);
    });
    [
        { colors: ['rgba(120,220,255,0.9)', 'rgba(20,80,200,0.25)'], size: 0.55 },  // Earth
        { colors: ['rgba(200,180,255,0.8)', 'rgba(90,40,180,0.2)'], size: 0.7 },   // Galaxy 1
        { colors: ['rgba(255,220,160,0.8)', 'rgba(180,80,20,0.2)'], size: 0.6 },   // Galaxy 2
    ].forEach((spec) => {
        const sprite = makeGlowSprite(spec.colors[0], spec.colors[1]);
        sprite.scale.set(spec.size, spec.size, 1);
        sprite.material.opacity = 0;
        sprite.userData.baseScale = spec.size;
        ghostLensingGroup.add(sprite);
        ghostSprites.push(sprite);
    });
    scene.add(ghostLensingGroup);
}

function updateGhostLensing(elapsed) {
    if (!ghostLensingGroup) return;
    const rs = getEffectiveRs();
    const photon = rs * 1.5;
    const nearProbe = Math.max(0, 1 - Math.abs(currentVisualDistance - photon) / (rs * 3));
    const camR = camera ? Math.sqrt(camera.position.x ** 2 + camera.position.y ** 2 + camera.position.z ** 2) : 1e6;
    const nearCamera = Math.max(0, 1 - Math.abs(camR - photon) / (rs * 3));
    const strength = Math.max(nearProbe, nearCamera);
    ghostLensingGroup.children.forEach((child, i) => {
        if (i < 3) {
            child.material.opacity = child.userData.baseOpacity * strength;
            child.rotation.z = elapsed * 0.05 * (i + 1);
        } else {
            const idx = i - 3;
            const angle = earthOrbitAngle + Math.PI * (idx + 1) * 0.66 + elapsed * 0.08 * (idx + 1);
            const radius = photon * (1.15 + idx * 0.35);
            child.position.set(Math.cos(angle) * radius, (idx - 1) * 0.12, Math.sin(angle) * radius);
            child.material.opacity = 0.55 * strength;
            const s = 1 + Math.sin(elapsed * 1.3 + idx) * 0.08;
            child.scale.setScalar(child.userData.baseScale * s);
        }
    });
}

// ============================================================================
// SCHWARZSCHILD METRIC CALCULATIONS (PRESERVED EXACTLY)
// ============================================================================

function calculateSchwarzchildRadius() {
    const M = STATE.blackHoleMass * CONSTANTS.solarMass;
    STATE.schwarzschildRadius = (2 * CONSTANTS.G * M) / (CONSTANTS.c * CONSTANTS.c);
}

function calculateTimeRate(distance_r) {
    if (typeof distance_r !== 'number' || !isFinite(distance_r)) return 1;
    // distance_r is r/rs, so the gravitational factor is sqrt(1 - 1/(r/rs)).
    // Proper time halts at the event horizon relative to a distant observer.
    if (distance_r <= 1) return 0;
    return Math.sqrt(Math.max(0, 1 - 1 / distance_r));
}

// The Earth reference observer is 26,500 ly away. For any mass up to 5 Msun
// rs/r ~ 1e-16, so this rate is 1 to double precision — but computing it from
// real units avoids a divide-by-zero or NaN when normalizing probe clocks.
function getEarthReferenceRate() {
    const earthRadius = EARTH_DISTANCE_LY * LY_METERS;
    const ratio = Math.min(1, Math.max(0, STATE.schwarzschildRadius / earthRadius));
    return Math.sqrt(Math.max(0, 1 - ratio));
}

// SPECIAL RELATIVITY — pure velocity time dilation, sqrt(1 - beta^2) = 1/gamma.
// beta = v/c, clamped to [0, 1]. NaN / non-numeric input falls back to rest;
// signed infinities clamp to the appropriate end of the range.
// At beta = 1 (light speed) proper time is exactly zero for a light-like observer.
function calculateVelocityFactor(beta) {
    if (typeof beta !== 'number' || isNaN(beta)) return 1;
    const b = Math.min(1, Math.max(0, beta));
    if (b >= 1) return 0;
    return Math.sqrt(Math.max(0, 1 - b * b));
}

// Lorentz factor; Infinity at light speed (the HUD renders that case as a symbol).
function calculateLorentzFactor(beta) {
    const factor = calculateVelocityFactor(beta);
    return factor > 0 ? 1 / factor : Infinity;
}

// COMBINED METRIC — Schwarzschild gravitational factor x SR velocity factor.
// Reference clocks are stationary at the Earth observer (beta = 0) at 26,500 ly,
// whose gravitational rate is effectively 1. At the 30 rs visual baseline the
// probe therefore reads sqrt(1 - 1/30) = 0.9831x, not 1.0000x.
function calculateProbeRate(distance_r, beta) {
    return calculateTimeRate(distance_r) * calculateVelocityFactor(beta);
}

// Displayed time rate. Below 1x (near the black hole) it stays exactly real.
// Above 1x it is stretched so the rate reaches the user's MAX RATE exactly at
// the outermost slider distance (CONFIG.maxDistance).
function getEffectiveRate(realRatio) {
    const maxR = STATE.maxTimeRate;
    // Zero is allowed: at the event horizon or at v = c the probe clock freezes.
    if (realRatio <= 1 || maxR <= 1) return Math.max(0, Math.min(1, realRatio));
    const anchor = calculateTimeRate(CONFIG.maxDistance) / calculateTimeRate(EARTH_VISUAL_DISTANCE);
    const slope = (maxR - 1) / (anchor - 1);
    return Math.min(maxR, Math.max(1, 1 + (realRatio - 1) * slope));
}

// ============================================================================
// SIMULATION UPDATE
// ============================================================================

function updateSimulation(deltaTime) {
    if (!STATE.isRunning) return;
    const refRate = getEarthReferenceRate();
    const probeRate = calculateProbeRate(currentVisualDistance, STATE.velocityBeta);
    STATE.timeRate = getEffectiveRate(probeRate / refRate);
    const adjustedDeltaTime = deltaTime * STATE.simulationSpeed;
    STATE.referenceTime += adjustedDeltaTime * refRate;
    STATE.localTime += adjustedDeltaTime * refRate * probeRate;
}

// ============================================================================
// THREE-CLOCK SYSTEM
// ============================================================================

function updateClocks() {
    // LOCAL TIME — real browser time
    const now = new Date();
    if (DOM.localClock) DOM.localClock.textContent =
        `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

    // REFERENCE CLOCK
    if (DOM.earthClock) DOM.earthClock.textContent = formatSimClock(STATE.referenceTime);

    // PROBE CLOCK — telemetry is delayed by Shapiro lag near the lens.
    if (DOM.probeClock) DOM.probeClock.textContent = formatSimClock(STATE.laggedProbeTime);
}

function formatSimClock(seconds) {
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600) % 24;
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ============================================================================
// CAMERA SYSTEM
// ============================================================================

function setupCanvasInput() {
    const el = renderer.domElement;

    el.addEventListener('contextmenu', e => e.preventDefault());

    el.addEventListener('mousedown', e => {
        cameraOrbit.lastX = e.clientX; cameraOrbit.lastY = e.clientY;
        if (e.button === 2 || e.shiftKey) {
            cameraOrbit.pan = true; cameraOrbit.dragging = false;
        } else {
            cameraOrbit.dragging = true; cameraOrbit.pan = false;
        }
        if (cinematicEnabled) toggleCinematic(false);
    });
    window.addEventListener('mousemove', e => {
        const dx = e.clientX - cameraOrbit.lastX;
        const dy = e.clientY - cameraOrbit.lastY;
        cameraOrbit.lastX = e.clientX; cameraOrbit.lastY = e.clientY;
        if (!cameraOrbit.dragging && !cameraOrbit.pan) return;
        if (cameraOrbit.pan) { panCameraByPixels(dx, dy); return; }
        cameraOrbit.tTheta -= dx * 0.005;
        cameraOrbit.tPhi = Math.max(cameraOrbit.minPhi,
            Math.min(cameraOrbit.maxPhi, cameraOrbit.tPhi + dy * 0.005));
    });
    window.addEventListener('mouseup', () => { cameraOrbit.dragging = false; cameraOrbit.pan = false; });
    el.addEventListener('wheel', e => {
        e.preventDefault();
        cameraOrbit.tRadius = Math.max(cameraOrbit.minRadius,
            Math.min(cameraOrbit.maxRadius, cameraOrbit.tRadius + e.deltaY * 0.02));
    }, { passive: false });

    // Double-click anywhere on the fabric -> fly the camera to that point.
    el.addEventListener('dblclick', e => {
        const rect = el.getBoundingClientRect();
        _ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1);
        _raycaster.setFromCamera(_ndc, camera);
        if (spacetimeMesh) {
            const hits = _raycaster.intersectObject(spacetimeMesh, false);
            if (hits.length) {
                flyCameraTo(hits[0].point.x, hits[0].point.y + 2, hits[0].point.z, 10, 1.2);
            }
        }
    });

    // Touch
    let touchDist = 0;
    el.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
            cameraOrbit.dragging = true;
            cameraOrbit.lastX = e.touches[0].clientX;
            cameraOrbit.lastY = e.touches[0].clientY;
            if (cinematicEnabled) toggleCinematic(false);
        } else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            touchDist = Math.sqrt(dx * dx + dy * dy);
        }
    }, { passive: true });
    el.addEventListener('touchmove', e => {
        e.preventDefault();
        if (e.touches.length === 1 && cameraOrbit.dragging) {
            cameraOrbit.tTheta -= (e.touches[0].clientX - cameraOrbit.lastX) * 0.005;
            cameraOrbit.tPhi = Math.max(cameraOrbit.minPhi,
                Math.min(cameraOrbit.maxPhi, cameraOrbit.tPhi + (e.touches[0].clientY - cameraOrbit.lastY) * 0.005));
            cameraOrbit.lastX = e.touches[0].clientX;
            cameraOrbit.lastY = e.touches[0].clientY;
        } else if (e.touches.length === 2 && touchDist > 0) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            cameraOrbit.tRadius = Math.max(cameraOrbit.minRadius,
                Math.min(cameraOrbit.maxRadius, cameraOrbit.tRadius * (touchDist / dist)));
            touchDist = dist;
        }
    }, { passive: false });
    el.addEventListener('touchend', () => { cameraOrbit.dragging = false; touchDist = 0; });
}

// Pan the orbit target so you can travel across the whole fabric.
// `scale` replaces the default pixels-per-unit factor (used for hand gestures too).
function panCameraByPixels(dx, dy, scale) {
    const k = (scale !== undefined ? scale : 0.0013) * cameraOrbit.radius;
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    _v1.set(e[0], e[4], e[8]); // camera right
    _v2.set(e[1], e[5], e[9]); // camera up
    setOrbitTarget(
        cameraOrbit.target.x - _v1.x * dx * k + _v2.x * dy * k,
        cameraOrbit.target.y - _v1.y * dx * k + _v2.y * dy * k,
        cameraOrbit.target.z - _v1.z * dx * k + _v2.z * dy * k
    );
}

function setOrbitTarget(x, y, z) {
    const lim = cameraOrbit.panLimit;
    cameraOrbit.pTarget.x = Math.max(-lim, Math.min(lim, x));
    cameraOrbit.pTarget.z = Math.max(-lim, Math.min(lim, z));
    cameraOrbit.pTarget.y = Math.max(-6, Math.min(90, y));
}

// Animate the camera to a given spot, keeping the object/point in view.
function flyCameraTo(x, y, z, radius, dur) {
    const cur = camera.position.clone();
    const dir = cur.clone().sub(_v1.set(x, y, z));
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const dest = _v1.clone().add(dir.multiplyScalar(radius || 12));
    cameraOrbit.fly = {
        t0: threeClock ? threeClock.getElapsedTime() : 0,
        dur: dur || 1.3,
        sx: cur.x, sy: cur.y, sz: cur.z,
        tx: dest.x, ty: dest.y, tz: dest.z,
        lx: cameraOrbit.target.x, ly: cameraOrbit.target.y, lz: cameraOrbit.target.z,
        ox: x, oy: y, oz: z,
    };
}

// Re-derive the orbital spherical state from the live camera position so the
// user can keep orbiting from wherever the flight ended.
function setOrbitFromView() {
    const dx = camera.position.x - cameraOrbit.target.x;
    const dy = camera.position.y - cameraOrbit.target.y;
    const dz = camera.position.z - cameraOrbit.target.z;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    cameraOrbit.radius = Math.max(cameraOrbit.minRadius, Math.min(cameraOrbit.maxRadius, r));
    cameraOrbit.phi = Math.acos(Math.max(-1, Math.min(1, dy / r)));
    cameraOrbit.phi = Math.max(cameraOrbit.minPhi, Math.min(cameraOrbit.maxPhi, cameraOrbit.phi));
    cameraOrbit.theta = Math.atan2(dz, dx);
    cameraOrbit.tRadius = cameraOrbit.radius;
    cameraOrbit.tPhi = cameraOrbit.phi;
    cameraOrbit.tTheta = cameraOrbit.theta;
}

function setCameraFromOrbit() {
    const sp = Math.sin(cameraOrbit.phi), cp = Math.cos(cameraOrbit.phi);
    const st = Math.sin(cameraOrbit.theta), ct = Math.cos(cameraOrbit.theta);
    camera.position.set(
        cameraOrbit.target.x + cameraOrbit.radius * sp * ct,
        cameraOrbit.target.y + cameraOrbit.radius * cp,
        cameraOrbit.target.z + cameraOrbit.radius * sp * st
    );
    camera.lookAt(cameraOrbit.target.x, cameraOrbit.target.y, cameraOrbit.target.z);
}

function updateCamera(dt, elapsed) {
    // Active flight to a label / fabric point.
    if (cameraOrbit.fly) {
        const f = cameraOrbit.fly;
        const t = Math.max(0, Math.min(1, (elapsed - f.t0) / f.dur));
        const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        camera.position.set(
            f.sx + (f.tx - f.sx) * k,
            f.sy + (f.ty - f.sy) * k,
            f.sz + (f.tz - f.sz) * k
        );
        camera.lookAt(
            f.lx + (f.ox - f.lx) * k,
            f.ly + (f.oy - f.ly) * k,
            f.lz + (f.oz - f.lz) * k
        );
        if (t >= 1) {
            cameraOrbit.fly = null;
            setOrbitTarget(f.ox, f.oy, f.oz);
            cameraOrbit.target.x = f.ox; cameraOrbit.target.y = f.oy; cameraOrbit.target.z = f.oz;
            setOrbitFromView();
        }
        return;
    }

    // Proximity factor: 0 far ... 1 at the horizon. Applied to the cinematic
    // camera only, so it never fights the user's manual orbit/zoom.
    const prox = Math.max(0, Math.min(1, (20 - currentVisualDistance) / 18.8));

    if (cinematicEnabled && !cameraOrbit.dragging) {
        cameraOrbit.tTheta += 0.08 * dt;
        cameraOrbit.tPhi = 1.0 + Math.sin(elapsed * 0.08) * 0.3 - prox * 0.35;
        cameraOrbit.tRadius = (25 + Math.sin(elapsed * 0.05) * 5) - prox * 14;
    }
    const damping = 1 - Math.pow(0.001, dt);
    cameraOrbit.tRadius = Math.max(cameraOrbit.minRadius, Math.min(cameraOrbit.maxRadius, cameraOrbit.tRadius));
    cameraOrbit.theta += (cameraOrbit.tTheta - cameraOrbit.theta) * damping;
    cameraOrbit.phi += (cameraOrbit.tPhi - cameraOrbit.phi) * damping;
    cameraOrbit.phi = Math.max(cameraOrbit.minPhi, Math.min(cameraOrbit.maxPhi, cameraOrbit.phi));
    cameraOrbit.radius += (cameraOrbit.tRadius - cameraOrbit.radius) * damping;
    cameraOrbit.target.x += (cameraOrbit.pTarget.x - cameraOrbit.target.x) * damping;
    cameraOrbit.target.y += (cameraOrbit.pTarget.y - cameraOrbit.target.y) * damping;
    cameraOrbit.target.z += (cameraOrbit.pTarget.z - cameraOrbit.target.z) * damping;
    setCameraFromOrbit();
}

function updateCameraPosition() {
    setCameraFromOrbit();
}

// Fly to a labelled object (clicking a 3D label).
function flyToLabel(id) {
    if (cameraOrbit.fly) return;
    let obj = null, r = 12;
    if (id === 'labelSpacetime') { flyCameraTo(0, 0, 0, 34, 1.5); return; }
    if (id === 'labelEarth') { obj = earthMesh; r = 10; }
    else if (id === 'labelMoon') {
        obj = earthMesh ? earthMesh.getObjectByName('earthMoon') : null; r = 4;
    } else if (id === 'labelProbe') { obj = probeMesh; r = 5; }
    else if (id === 'labelGalaxy1') { obj = galaxy1Anchor; r = 60; }
    else if (id === 'labelGalaxy2') {
        obj = (wormholeGroup && wormholeGroup.visible) ? wormholeLabelAnchor : galaxy2; r = 34;
    } else if (id === 'labelPulsar') { obj = pulsarGroup; r = 10; }
    else if (planetsList) {
        const p = planetsList.find(q => ('label' + q.label === id));
        if (p) { obj = p.mesh; r = 7; }
    }
    if (!obj) return;
    obj.getWorldPosition(_v1);
    flyCameraTo(_v1.x, _v1.y + 0.5, _v1.z, r, 1.35);
}

function toggleCinematic(on) {
    cinematicEnabled = on;
    if (DOM.cinematicBtn) {
        DOM.cinematicBtn.classList.toggle('active', on);
        DOM.cinematicBtn.textContent = on ? 'AUTO CAMERA ON' : 'AUTO CAMERA';
    }
}

// ============================================================================
// WARNING SYSTEM
// ============================================================================

function updateWarnings() {
    const overlay = DOM.warningOverlay;
    const text = DOM.warningText;
    if (!text) return;

    let stage = 0;
    if (STATE.distance_r < 1.1) stage = 3;
    else if (STATE.distance_r < 1.5) stage = 2;
    else if (STATE.distance_r < 2.5) stage = 1;

    // Tidal stress begins at r = 3rs, before the main field warnings kick in.
    const tidalWarn = getTidalProgress(currentVisualDistance) > 0.08;
    if (stage !== warningStage || tidalWarn !== tidalWarnActive) {
        warningStage = stage;
        tidalWarnActive = tidalWarn;
        if (overlay) {
            overlay.classList.remove('stage1', 'stage2', 'stage3', 'tidal');
            if (stage > 0) overlay.classList.add('stage' + stage);
            else if (tidalWarn) overlay.classList.add('tidal');
        }
        if (stage === 0) {
            if (tidalWarn) {
                text.className = 'warning-text visible tidal';
                text.textContent = 'TIDAL STRESS \u2014 SPAGHETTIFICATION';
            } else {
                text.className = 'warning-text';
                text.textContent = '';
            }
        }
        else if (stage === 1) { text.className = 'warning-text visible'; text.textContent = 'HIGH GRAVITATIONAL FIELD'; }
        else if (stage === 2) { text.className = 'warning-text visible'; text.textContent = 'EXTREME TIME DILATION'; }
        else { text.className = 'warning-text visible stage3'; text.textContent = 'EVENT HORIZON APPROACHING'; }
    }

    const proximity = Math.max(0, 1 - (STATE.distance_r - 1.05) / 3);
    const photonRing = blackHoleGroup ? blackHoleGroup.getObjectByName('photonRing') : null;
    if (photonRing) {
        photonRing.material.opacity = 0.5 + proximity * 0.5;
        const s = 1 + proximity * 0.15;
        photonRing.scale.set(s, s, 1);
    }
}

// ============================================================================
// HUD UPDATES
// ============================================================================

function updateHUD(dt) {
    const refRate = getEarthReferenceRate();
    const probeRate = calculateProbeRate(currentVisualDistance, STATE.velocityBeta);
    STATE.timeRate = getEffectiveRate(probeRate / refRate);
    if (DOM.timeRate) DOM.timeRate.textContent = STATE.timeRate.toFixed(4) + '×';
    if (DOM.timeRateHud) DOM.timeRateHud.textContent = STATE.timeRate.toFixed(4) + '×';
    if (DOM.maxRateValue) DOM.maxRateValue.textContent = STATE.maxTimeRate.toFixed(1) + '×';
    if (DOM.rateScaleMax) DOM.rateScaleMax.textContent = STATE.maxTimeRate.toFixed(4) + '×';
    if (DOM.rateMarker) {
        const pct = Math.min(100, Math.max(0, (STATE.timeRate / STATE.maxTimeRate) * 100));
        DOM.rateMarker.style.left = pct + '%';
    }
    if (DOM.distanceValue) DOM.distanceValue.textContent = currentVisualDistance.toFixed(1) + ' rₛ';
    if (DOM.velocityDisplay) {
        DOM.velocityDisplay.textContent = STATE.velocityBeta.toFixed(3) + ' c';
        DOM.velocityDisplay.classList.toggle('relativistic', STATE.velocityBeta >= 0.5);
    }
    if (DOM.gammaDisplay) {
        DOM.gammaDisplay.textContent = isFinite(STATE.lorentzFactor)
            ? STATE.lorentzFactor.toFixed(4)
            : '\u221E';
    }
    // Combined gravitational + kinematic redshift (1+z = 1 / dtau/dt).
    if (DOM.redshiftDisplay) {
        const z = calculateRedshift(currentVisualDistance, STATE.velocityBeta);
        DOM.redshiftDisplay.textContent = isFinite(z) ? z.toFixed(3) : '\u221E';
        DOM.redshiftDisplay.classList.toggle('redshifted', z > 0.5);
    }
    // Tidal stress meter: 0 at r = 3rs, 100% at the event horizon.
    if (DOM.tidalDisplay || DOM.tidalFill) {
        const tidal = getTidalProgress(currentVisualDistance);
        if (DOM.tidalDisplay) DOM.tidalDisplay.textContent = (tidal * 100).toFixed(0) + '%';
        if (DOM.tidalFill) {
            DOM.tidalFill.style.width = (tidal * 100).toFixed(1) + '%';
            DOM.tidalFill.classList.toggle('warn', tidal > 0.35 && tidal <= 0.7);
            DOM.tidalFill.classList.toggle('critical', tidal > 0.7);
        }
    }
    // Shapiro telemetry lag; lens marker appears when the signal grazes the hole.
    if (DOM.pingLagDisplay) {
        DOM.pingLagDisplay.textContent = STATE.telemetryLagMs.toFixed(3) + ' ms'
            + (STATE.behindLens ? ' \u25c8' : '');
        DOM.pingLagDisplay.classList.toggle('lagging', STATE.behindLens);
    }
    if (DOM.spinDisplay) DOM.spinDisplay.textContent = STATE.blackHoleSpin.toFixed(2);
    if (DOM.massDisplay) DOM.massDisplay.textContent = STATE.blackHoleMass.toFixed(1) + ' M\u2609';
    if (DOM.schwarzschildValue) DOM.schwarzschildValue.textContent = (STATE.schwarzschildRadius / 1000).toFixed(2) + ' km';
}

// Single source of truth for probe velocity: validates input, refreshes the
// Lorentz factor, and keeps the slider and both readouts in sync.
function setProbeVelocity(beta) {
    let b = parseFloat(beta);
    if (!isFinite(b)) b = 0;
    STATE.velocityBeta = Math.min(1, Math.max(0, b));
    STATE.lorentzFactor = calculateLorentzFactor(STATE.velocityBeta);
    if (DOM.velocitySlider) DOM.velocitySlider.value = String(STATE.velocityBeta);
    if (DOM.velocitySliderValue) {
        DOM.velocitySliderValue.textContent = (STATE.velocityBeta * 100).toFixed(1) + '% c';
    }
    updateHUD();
}

// Spin a = Jc/(GM^2) in [0, 0.99]; 0 restores the static Schwarzschild grid.
function setBlackHoleSpin(a) {
    let s = parseFloat(a);
    if (!isFinite(s)) s = 0;
    STATE.blackHoleSpin = Math.min(0.99, Math.max(0, s));
    if (DOM.spinSlider) DOM.spinSlider.value = String(STATE.blackHoleSpin);
    if (DOM.spinSliderValue) DOM.spinSliderValue.textContent = STATE.blackHoleSpin.toFixed(2);
    updateHUD();
}

function updateLabels() {
    updateSingleLabel(earthMesh, DOM.labelEarth);
    const moon = earthMesh ? earthMesh.getObjectByName('earthMoon') : null;
    updateSingleLabel(moon, DOM.labelMoon);
    updateSingleLabel(probeMesh, DOM.labelProbe);
    if (DOM.labelProbe) DOM.labelProbe.textContent = 'PROBE \u00b7 ' + STATE.timeRate.toFixed(4) + '\u00d7';
    if (planetsList) {
        planetsList.forEach((p) => {
            updateSingleLabel(p.mesh, DOM['label' + p.label]);
        });
    }
    if (wormholeGroup && wormholeGroup.visible && wormholeLabelAnchor) {
        updateSingleLabel(wormholeLabelAnchor, DOM.labelGalaxy2);
    } else if (DOM.labelGalaxy2) {
        DOM.labelGalaxy2.style.opacity = '0';
    }
    updateSingleLabel(galaxy1Anchor, DOM.labelGalaxy1);
    updateSingleLabel(pulsarGroup, DOM.labelPulsar);
    if (DOM.labelSpacetime) {
        DOM.labelSpacetime.style.left = '50%';
        DOM.labelSpacetime.style.top = '65%';
        DOM.labelSpacetime.style.transform = 'translateX(-50%)';
        DOM.labelSpacetime.style.opacity = '0.5';
    }
}

function updateSingleLabel(obj, el) {
    if (!obj || !el) return;
    const pos = new THREE.Vector3();
    obj.getWorldPosition(pos);
    pos.y += 1.2;
    pos.project(camera);
    if (pos.z > 1) { el.style.opacity = '0'; return; }
    el.style.left = ((pos.x * 0.5 + 0.5) * window.innerWidth) + 'px';
    el.style.top = ((-pos.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    el.style.transform = 'translate(-50%, -100%)';
    el.style.opacity = '0.6';
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================

function animate() {
    requestAnimationFrame(animate);
    if (!startupDone) return;

    const dt = Math.min(threeClock.getDelta(), 0.1);
    const elapsed = threeClock.getElapsedTime();

    updateSimulation(dt);
    updateSpacetimeFabric(elapsed);
    updateAccretionDisk(dt);
    updateEarth(dt);
    updatePlanets(dt);
    updateSolarSystem(dt);
    updateFlames(dt, elapsed);
    updateGalaxies(dt);
    updateWormhole(dt, elapsed);
    updatePulsar(dt, elapsed);
    updateProbe(dt, elapsed);
    updateAberration();
    updateLensing(elapsed);
    updateGhostLensing(elapsed);
    updateCamera(dt, elapsed);
    updateTelemetry(dt);
    updateClocks();
    updateHUD(dt);
    updateWarnings();
    updateLabels();

    if (starField) starField.rotation.y += 0.00002 * dt;
    if (blackHoleGroup) {
        const pr = blackHoleGroup.getObjectByName('photonRing');
        if (pr) pr.rotation.z += 0.05 * dt;
    }

    renderer.render(scene, camera);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    document.getElementById('startPauseBtn').addEventListener('click', toggleSimulation);
    document.getElementById('resetBtn').addEventListener('click', resetSimulation);
    if (DOM.pulsarSoundBtn) {
        DOM.pulsarSoundBtn.addEventListener('click', () => {
            if (!pulsarAudio) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                pulsarAudio = { ctx: new AC() };
            }
            pulsarEnabled = !pulsarEnabled;
            if (pulsarEnabled) {
                pulsarAudio.ctx.resume();
                pulsarLastScheduledCycle = -1;
            }
            if (DOM.pulsarSoundBtn) {
                DOM.pulsarSoundBtn.textContent = pulsarEnabled ? 'PULSAR: ON' : 'PULSAR: OFF';
                DOM.pulsarSoundBtn.classList.toggle('active', pulsarEnabled);
            }
        });
    }

    document.getElementById('distanceSlider').addEventListener('input', (e) => {
        STATE.distance_r = parseFloat(e.target.value);
        if (!isFinite(STATE.distance_r)) STATE.distance_r = CONFIG.demoDefaultDistance;
        STATE.distance_r = Math.max(CONFIG.minDistance, Math.min(CONFIG.maxDistance, STATE.distance_r));
        document.getElementById('distanceSliderValue').textContent = STATE.distance_r.toFixed(1) + ' rₛ';
    });
    document.getElementById('sensitivitySlider').addEventListener('input', (e) => {
        STATE.sensitivity = parseFloat(e.target.value);
        if (!isFinite(STATE.sensitivity)) STATE.sensitivity = 1.0;
        document.getElementById('sensitivitySliderValue').textContent = STATE.sensitivity.toFixed(1) + '×';
    });
    document.getElementById('massSlider').addEventListener('input', (e) => {
        let val = parseFloat(e.target.value);
        if (!isFinite(val)) val = CONFIG.maxMass;
        STATE.blackHoleMass = Math.max(CONFIG.minMass, Math.min(CONFIG.maxMass, val));
        document.getElementById('massSliderValue').textContent = STATE.blackHoleMass.toFixed(1) + ' M\u2609';
        calculateSchwarzchildRadius();
        rebuildSpacetimeFabric();
        positionWormhole();
        updateHUD();
    });
document.getElementById('speedSlider').addEventListener('input', (e) => {
    STATE.simulationSpeed = parseFloat(e.target.value);
    if (!isFinite(STATE.simulationSpeed)) STATE.simulationSpeed = 1.0;
    document.getElementById('speedSliderValue').textContent = STATE.simulationSpeed.toFixed(1) + 'x';
});

if (DOM.velocitySlider) {
    DOM.velocitySlider.addEventListener('input', (e) => setProbeVelocity(e.target.value));
}

if (DOM.spinSlider) {
    DOM.spinSlider.addEventListener('input', (e) => setBlackHoleSpin(e.target.value));
}

DOM.maxRateSlider.addEventListener('input', (e) => {
    STATE.maxTimeRate = parseFloat(e.target.value);
    if (!isFinite(STATE.maxTimeRate)) STATE.maxTimeRate = 2.0;
    DOM.maxRateSliderValue.textContent = STATE.maxTimeRate.toFixed(1) + '×';
    updateHUD();
});

    const infoPanel = document.getElementById('infoPanel');
    document.getElementById('infoToggleBtn').addEventListener('click', () => infoPanel.classList.add('visible'));
    document.getElementById('infoCloseBtn').addEventListener('click', () => infoPanel.classList.remove('visible'));
    infoPanel.addEventListener('click', (e) => { if (e.target.id === 'infoPanel') infoPanel.classList.remove('visible'); });

    if (DOM.cinematicBtn) DOM.cinematicBtn.addEventListener('click', () => toggleCinematic(!cinematicEnabled));
    if (DOM.fullscreenBtn) DOM.fullscreenBtn.addEventListener('click', toggleFullscreen);
    if (DOM.viewHomeBtn) DOM.viewHomeBtn.addEventListener('click', () => flyCameraTo(0, 0, 0, 30, 1.5));

    // Clicking any 3D label flies the camera to that object.
    const labelIds = ['labelSpacetime', 'labelEarth', 'labelMoon', 'labelProbe', 'labelPulsar',
        'labelGalaxy1', 'labelGalaxy2',
        'labelMercury', 'labelVenus', 'labelMars', 'labelJupiter', 'labelSaturn', 'labelNeptune'];
    labelIds.forEach(id => {
        const el2 = document.getElementById(id);
        if (el2) el2.addEventListener('click', () => flyToLabel(id));
    });

    // Click to skip splash
    const splash = DOM.startupScreen;
    if (splash) splash.addEventListener('click', () => {
        startupDone = true;
        splash.classList.add('hidden');
        setTimeout(() => { splash.style.display = 'none'; }, 800);
    });
}

function toggleSimulation() {
    STATE.isRunning = !STATE.isRunning;
    const btn = document.getElementById('startPauseBtn');
    if (STATE.isRunning) {
        btn.textContent = 'PAUSE';
        btn.classList.add('active');
        threeClock.getDelta();
    } else {
        btn.textContent = 'START';
        btn.classList.remove('active');
    }
}

function resetSimulation() {
    STATE.isRunning = false;
    STATE.localTime = 0;
    STATE.referenceTime = 0;
    STATE.timeRate = 1.0;
    STATE.distance_r = CONFIG.demoDefaultDistance;
    STATE.maxTimeRate = 2.0;
    STATE.blackHoleMass = CONFIG.maxMass;
    STATE.velocityBeta = 0.0;
    STATE.lorentzFactor = 1.0;
    STATE.blackHoleSpin = 0.0;
    STATE.laggedProbeTime = 0;
    STATE.telemetryLagMs = 0;
    STATE.behindLens = false;
    STATE.labElapsedSeconds = 0;
    if (DOM.velocitySlider) DOM.velocitySlider.value = '0';
    if (DOM.velocitySliderValue) DOM.velocitySliderValue.textContent = '0.0% c';
    if (DOM.spinSlider) DOM.spinSlider.value = '0';
    if (DOM.spinSliderValue) DOM.spinSliderValue.textContent = '0.00';
    probeAngle = 0;
    currentVisualDistance = CONFIG.demoDefaultDistance;
    warningStage = 0;
    tidalWarnActive = false;
    redshiftVisualT = -1;
    cinematicEnabled = false;

    document.getElementById('startPauseBtn').textContent = 'START';
    document.getElementById('startPauseBtn').classList.remove('active');
    document.getElementById('distanceSlider').value = CONFIG.demoDefaultDistance;
    document.getElementById('distanceSliderValue').textContent = CONFIG.demoDefaultDistance.toFixed(1) + ' rₛ';
    if (DOM.massSlider) DOM.massSlider.value = String(STATE.blackHoleMass);
    if (DOM.massSliderValue) DOM.massSliderValue.textContent = STATE.blackHoleMass.toFixed(1) + ' M\u2609';
    if (DOM.maxRateSlider) DOM.maxRateSlider.value = STATE.maxTimeRate;
    if (DOM.maxRateSliderValue) DOM.maxRateSliderValue.textContent = STATE.maxTimeRate.toFixed(1) + '×';

    if (DOM.cinematicBtn) { DOM.cinematicBtn.classList.remove('active'); DOM.cinematicBtn.textContent = 'AUTO CAMERA'; }

    if (DOM.warningOverlay) DOM.warningOverlay.classList.remove('stage1', 'stage2', 'stage3', 'tidal');
    if (DOM.warningText) { DOM.warningText.className = 'warning-text'; DOM.warningText.textContent = ''; }

    cameraOrbit.tTheta = 0.8; cameraOrbit.tPhi = 1.1; cameraOrbit.tRadius = 28;
    cameraOrbit.theta = 0.8; cameraOrbit.phi = 1.1; cameraOrbit.radius = 28;
    cameraOrbit.fly = null;
    setOrbitTarget(0, 0, 0);
    cameraOrbit.target.x = 0; cameraOrbit.target.y = 0; cameraOrbit.target.z = 0;

    calculateSchwarzchildRadius();
    updateHUD();
    updateClocks();
}

function toggleFullscreen() {
    const doc = document;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        const el = doc.documentElement;
        try {
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            else return; // Fullscreen API not supported
        } catch (e) { return; }
        doc.body.classList.add('fullscreen-mode');
    } else {
        try {
            if (doc.exitFullscreen) doc.exitFullscreen();
            else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        } catch (e) { /* noop */ }
        doc.body.classList.remove('fullscreen-mode');
    }
}

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        document.body.classList.remove('fullscreen-mode');
        if (DOM.fullscreenBtn) DOM.fullscreenBtn.textContent = 'FULLSCREEN';
    } else {
        if (DOM.fullscreenBtn) DOM.fullscreenBtn.textContent = 'EXIT FULLSCREEN';
    }
});

// ============================================================================
// STARTUP SEQUENCE
// ============================================================================

async function runStartup() {
    const screen = DOM.startupScreen;
    const text = DOM.startupText;
    const bar = DOM.startupBarFill;

    if (!screen || !text || !bar) { startupDone = true; return; }

    text.textContent = 'INITIALIZING SPACETIME...';
    bar.style.width = '30%';
    await delay(400);

    bar.style.width = '70%';
    text.textContent = 'CALIBRATING GRAVITATIONAL FIELD...';
    await delay(400);

    bar.style.width = '100%';
    text.textContent = 'GRAVITATIONAL FIELD ONLINE';
    await delay(300);

    screen.classList.add('hidden');
    startupDone = true;
    await delay(700);
    screen.style.display = 'none';
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================================
// WINDOW RESIZE
// ============================================================================

function onWindowResize() {
    const container = DOM['canvas-container'];
    if (!container) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

// ============================================================================
// STARTUP
// ============================================================================

calculateSchwarzchildRadius();
console.log('Time Dilation Simulator — Virtual Relativity Lab');
console.log('Earth reference:', EARTH_DISTANCE_LY.toLocaleString(), 'light-years');
console.log('Schwarzschild radius:', STATE.schwarzschildRadius, 'meters');
