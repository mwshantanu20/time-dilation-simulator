// Verification harness: extracts the real physics functions from app.js and
// exercises them, then checks DOM wiring across app.js, lab.js and index.html.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const labSrc = fs.readFileSync(path.join(root, 'lab.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function extractFunction(source, name) {
    const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(source);
    if (!m) throw new Error('Missing function: ' + name);
    let start = source.indexOf('{', m.index), depth = 0;
    for (let i = start; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) return source.slice(m.index, i + 1);
    }
    throw new Error('Unbalanced braces in ' + name);
}

const names = [
    'calculateSchwarzchildRadius', 'calculateTimeRate', 'getEarthReferenceRate',
    'calculateVelocityFactor', 'calculateLorentzFactor', 'calculateProbeRate',
    'getEffectiveRate', 'getEffectiveRs', 'calculateRedshift',
    'calculateTidalAcceleration', 'getTidalProgress', 'calculateFrameDrift',
    'calculateShapiroLagMs',
];
const body = `
const CONSTANTS = { G: 6.674e-11, c: 299792458, solarMass: 1.989e30 };
const STATE = { blackHoleMass: 5, maxTimeRate: 2, blackHoleSpin: 0, schwarzschildRadius: 14770 };
const CONFIG = { maxDistance: 50, minDistance: 1 };
const EARTH_DISTANCE_LY = 26500;
const LY_METERS = 9.4607e15;
const EARTH_VISUAL_DISTANCE = 30;
${names.map(n => extractFunction(src, n)).join('\n')}
return { STATE, ${names.join(', ')} };
`;
const p = new Function(body)();

let passed = 0, failed = 0;
function near(label, actual, expected, tol = 1e-4) {
    const ok = (Number.isNaN(expected) && Number.isNaN(actual)) ||
               (expected === Infinity && actual === Infinity) ||
               Math.abs(actual - expected) <= tol;
    if (ok) { passed++; console.log('  PASS  ' + label + ' = ' + actual); }
    else { failed++; console.log('  FAIL  ' + label + ': expected ' + expected + ', got ' + actual); }
}
function check(label, ok) { near(label, ok ? 1 : 0, 1); }

console.log('PHYSICS CHECKS');
near('velocity factor @ 0c', p.calculateVelocityFactor(0), 1);
near('velocity factor @ 0.5c', p.calculateVelocityFactor(0.5), Math.sqrt(0.75));
near('velocity factor @ 0.99c', p.calculateVelocityFactor(0.99), 0.14106736);
near('velocity factor @ c (freeze)', p.calculateVelocityFactor(1), 0);
near('velocity factor NaN fallback', p.calculateVelocityFactor(NaN), 1);
near('velocity factor Infinity clamped', p.calculateVelocityFactor(Infinity), 0);
near('velocity factor >1 clamped', p.calculateVelocityFactor(4), 0);
near('Lorentz gamma @ 0.99c', p.calculateLorentzFactor(0.99), 7.08881205, 1e-3);
near('Lorentz gamma @ c', p.calculateLorentzFactor(1), Infinity);

near('gravity @ 30 rs', p.calculateTimeRate(30), Math.sqrt(1 - 1 / 30));
near('gravity @ horizon freezes', p.calculateTimeRate(1), 0);
near('gravity NaN fallback', p.calculateTimeRate(NaN), 1);
near('earth reference rate @ 26,500 ly', p.getEarthReferenceRate(), 1, 1e-12);
near('combined @ rest = gravitational factor', p.calculateProbeRate(30, 0), p.calculateTimeRate(30));
near('combined @ 30rs & 0.99c', p.calculateProbeRate(30, 0.99), p.calculateTimeRate(30) * 0.14106736);
near('displayed rate @ default ≈ 0.9831x',
    p.getEffectiveRate(p.calculateProbeRate(30, 0) / p.getEarthReferenceRate()),
    Math.sqrt(1 - 1 / 30), 1e-4);
near('displayed rate @ light speed freezes',
    p.getEffectiveRate(p.calculateProbeRate(30, 1) / p.getEarthReferenceRate()), 0);
near('displayed rate @ event horizon freezes',
    p.getEffectiveRate(p.calculateProbeRate(1, 0) / p.getEarthReferenceRate()), 0);
check('displayed rate finite at 50 rs',
    Number.isFinite(p.getEffectiveRate(p.calculateProbeRate(50, 0) / p.getEarthReferenceRate())));

console.log('\nMASS / DISTANCE CHECKS');
p.STATE.blackHoleMass = 5;
p.calculateSchwarzchildRadius();
near('rs @ 5 Msun (km)', p.STATE.schwarzschildRadius / 1000, 14.77, 0.02);
p.STATE.blackHoleMass = 0.1;
p.calculateSchwarzchildRadius();
near('rs @ 0.1 Msun (km)', p.STATE.schwarzschildRadius / 1000, 0.295, 0.005);
p.STATE.blackHoleMass = 5;
p.calculateSchwarzchildRadius();
near('normalized rs stays 1 scene unit', p.getEffectiveRs(), 1);
near('gravity is mass-independent at fixed r/rs', p.calculateTimeRate(21), Math.sqrt(1 - 1 / 21));
check('mass slider max is 5', /id="massSlider"[^>]*max="5"/.test(html));
check('mass slider min is 0.1', /id="massSlider"[^>]*min="0\.1"/.test(html));
check('Earth label uses 26,500 ly', html.includes('EARTH OBSERVER @ 26,500 ly'));

console.log('\nADVANCED RELATIVITY CHECKS');
near('redshift z @ 30rs rest', p.calculateRedshift(30, 0), 1 / Math.sqrt(1 - 1 / 30) - 1);
near('redshift z @ horizon = Infinity', p.calculateRedshift(1, 0), Infinity);
near('redshift z @ light speed = Infinity', p.calculateRedshift(30, 1), Infinity);
near('tidal progress @ 3rs = 0', p.getTidalProgress(3), 0);
near('tidal progress @ 2rs = 0.5', p.getTidalProgress(2), 0.5);
near('tidal progress @ horizon = 1', p.getTidalProgress(1), 1);
near('tidal acceleration @ horizon = 2', p.calculateTidalAcceleration(1), 2);
near('tidal acceleration @ 2rs = 0.25', p.calculateTidalAcceleration(2), 0.25);
near('frame drift @ spin 0 = 0', p.calculateFrameDrift(2), 0);
p.STATE.blackHoleSpin = 0.5;
near('frame drift @ a=0.5, r=2rs', p.calculateFrameDrift(2), 0.5);
p.STATE.blackHoleSpin = 0;
const lagFar = p.calculateShapiroLagMs(30, false);
check('Shapiro lag @ 30rs > 2.9 ms', lagFar > 2.9);
check('Shapiro lag grows behind lens',
    p.calculateShapiroLagMs(2, true) > p.calculateShapiroLagMs(2, false));

console.log('\nREMOVAL CHECKS');
check('no wifi files referenced in app.js/html/lab.js',
    !/wifi-(client|server)|WifiClient|NETWORK mode|signalStrength/i.test(src + html + labSrc));

console.log('\nDOM WIRING CHECKS');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const referenced = new Set([
    ...[...src.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]),
    ...[...labSrc.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(m => m[1]),
]);
const cacheBlock = src.slice(src.indexOf('function cacheDOM()'), src.indexOf('function initThree()'));
[...cacheBlock.matchAll(/'([a-zA-Z][\w-]*)'/g)].forEach(m => referenced.add(m[1]));
for (const id of [
    'velocityDisplay', 'gammaDisplay', 'velocitySlider', 'velocitySliderValue',
    'redshiftDisplay', 'tidalDisplay', 'tidalFill', 'pingLagDisplay',
    'spinDisplay', 'spinSlider', 'spinSliderValue',
    'labPanel', 'labToggleBtn', 'labCloseBtn', 'labStopwatch', 'readingsBody',
    'readingNote', 'logReadingBtn', 'printReportBtn', 'exportReadingsBtn',
    'clearReadingsBtn', 'studentName', 'sessionDateTime', 'printReport',
    'billingPanel', 'billingToggleBtn', 'billingCloseBtn', 'billingGate',
    'billingPin', 'billingUnlockBtn', 'billingContent', 'billingUser',
    'newSessionBtn', 'usageTotal', 'usageActive', 'usageBillable',
    'usageAmount', 'billingCurrency', 'rateHour', 'rateMinute',
    'billingBasis', 'minIncrement', 'saveBillingBtn', 'billingBody',
    'exportBillingBtn', 'resetBillingBtn',
]) {
    check('HTML contains #' + id, ids.has(id));
    check('JS references #' + id, referenced.has(id));
}
const dupes = [...ids].filter(id => (html.match(new RegExp('id="' + id + '"', 'g')) || []).length > 1);
near('no duplicate ids', dupes.length, 0);
if (dupes.length) console.log('    duplicates: ' + dupes.join(', '));
const missing = [...referenced].filter(id => !ids.has(id));
if (missing.length) console.log('    missing ids: ' + missing.join(', '));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
