// US-007 (Tech Debt Blaster): Runtime integration test for asteroid movement
// + screen wrapping inside the TECHDEBT_PLAYING block.
//
// Loads config.js + setupTechdebtWorld() + the TECHDEBT_PLAYING block from
// js/update.js into a vm sandbox and verifies all six AC:
//   1. Each asteroid stores { x, y, vx, vy, size, label, rotation,
//      rotationSpeed, isProxiblue }.
//   2. Asteroids drift at constant velocity (no acceleration, no drag).
//   3. Speed = TECHDEBT_SPEED_BASE + currentLevel * TECHDEBT_SPEED_PER_LEVEL
//      ± TECHDEBT_SPEED_VARIANCE; direction random.
//   4. Asteroids wrap on all four screen edges.
//   5. Each asteroid rotates with rotationSpeed in [-1, 1] rad/s.
//   6. asteroidsTotal = count * 7 (1 large + 2 mediums + 4 smalls per large),
//      set once at spawn time.
//
// Run:  node tests/integration-techdebt-us007.js
// Exits 0 on pass, 1 on any failure.

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.resolve(__dirname, '..');
var passed = 0;
var failed = 0;
function check(name, ok, detail) {
    var tag = ok ? 'PASS' : 'FAIL';
    console.log(tag + ' \u2014 ' + name + (!ok && detail ? ' :: ' + detail : ''));
    if (ok) passed++; else failed++;
}

function loadFile(rel) {
    return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    keys: {},
    SHIP_SIZE: 40,
    stopThrustSound: function () {},
    startThrustSound: function () {},
    playTechdebtShootSound: function () {},
    playProxiblueCollectSound: function () {},
    spawnBugWave: function () {},
    setupMissileWorld: function () {},
    resetShip: function () {},
    resetWind: function () {},
    generateTerrain: function () {},
    getLevelConfig: function () { return { gravity: 0.05 }; },
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

// --- Brace-walk extract setupTechdebtWorld + TECHDEBT_PLAYING block ---
var updateSrc = loadFile('js/update.js');

function extractBlock(haystack, signature) {
    var start = haystack.indexOf(signature);
    if (start < 0) return null;
    var open = haystack.indexOf('{', start + signature.length - 1);
    var depth = 0, close = -1;
    for (var i = open; i < haystack.length; i++) {
        if (haystack[i] === '{') depth++;
        else if (haystack[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    return haystack.slice(start, close + 1);
}

var setupSrc = extractBlock(updateSrc, 'function setupTechdebtWorld() {');
if (!setupSrc) { check('found setupTechdebtWorld', false); process.exit(1); }
vm.runInContext(setupSrc, sandbox, { filename: 'setupTechdebtWorld-extracted' });
check('setupTechdebtWorld loaded into sandbox',
    typeof sandbox.setupTechdebtWorld === 'function');

var playSrc = extractBlock(updateSrc, 'if (gameState === STATES.TECHDEBT_PLAYING) {');
if (!playSrc) { check('found TECHDEBT_PLAYING block', false); process.exit(1); }
var playReplay = new vm.Script('(function () {\n' + playSrc + '\n}).call(this);',
    { filename: 'techdebt-playing-extracted' });

function freshShip() {
    return {
        x: 400, y: 300, vx: 0, vy: 0,
        angle: 0,
        rotationSpeed: sandbox.ROTATION_SPEED,
        thrusting: false, rotating: null,
        fuel: sandbox.FUEL_MAX
    };
}

function tick(dt) {
    sandbox.dt = (dt === undefined ? 0.016 : dt);
    sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
    sandbox.ship = sandbox.ship || freshShip();
    sandbox.keys = sandbox.keys || {};
    playReplay.runInContext(sandbox);
}

// =========================================================================
// AC#1: Each asteroid has { x, y, vx, vy, size, label, rotation,
//                           rotationSpeed, isProxiblue }
// =========================================================================
sandbox.currentLevel = 0;
sandbox.setupTechdebtWorld();
var requiredFields = ['x', 'y', 'vx', 'vy', 'size', 'label',
                      'rotation', 'rotationSpeed', 'isProxiblue'];
var allHaveFields = true;
var missingField = '';
for (var ai = 0; ai < sandbox.techdebtAsteroids.length; ai++) {
    var a = sandbox.techdebtAsteroids[ai];
    for (var fi = 0; fi < requiredFields.length; fi++) {
        var key = requiredFields[fi];
        if (!(key in a)) {
            allHaveFields = false;
            missingField = key + ' on asteroid ' + ai;
            break;
        }
    }
    if (!allHaveFields) break;
}
check('every asteroid has required fields {x,y,vx,vy,size,label,rotation,rotationSpeed,isProxiblue}',
    allHaveFields, missingField);

// Type sanity: rotationSpeed must be a number (not undefined / NaN), isProxiblue boolean.
var typesOk = true;
for (var ti = 0; ti < sandbox.techdebtAsteroids.length; ti++) {
    var ast = sandbox.techdebtAsteroids[ti];
    if (typeof ast.rotationSpeed !== 'number' || isNaN(ast.rotationSpeed)) typesOk = false;
    if (typeof ast.isProxiblue !== 'boolean') typesOk = false;
    if (typeof ast.label !== 'string') typesOk = false;
}
check('rotationSpeed is a number, isProxiblue is boolean, label is string', typesOk);

// Confirm legacy field names are gone (regression guard for the rename).
var legacyCount = 0;
for (var li = 0; li < sandbox.techdebtAsteroids.length; li++) {
    var la = sandbox.techdebtAsteroids[li];
    if ('rotSpeed' in la) legacyCount++;
    if ('isProxiBlue' in la) legacyCount++;
}
check('no legacy field names (rotSpeed, isProxiBlue) remain on any asteroid',
    legacyCount === 0, 'found ' + legacyCount + ' legacy fields');

// =========================================================================
// AC#5: rotationSpeed in [-1, 1] rad/s, distributed across the range.
// =========================================================================
var rotMin = Infinity, rotMax = -Infinity;
var rotSamples = [];
for (var trial = 0; trial < 30; trial++) {
    sandbox.currentLevel = 8;
    sandbox.setupTechdebtWorld();
    for (var ri = 0; ri < sandbox.techdebtAsteroids.length; ri++) {
        var rs = sandbox.techdebtAsteroids[ri].rotationSpeed;
        rotSamples.push(rs);
        if (rs < rotMin) rotMin = rs;
        if (rs > rotMax) rotMax = rs;
    }
}
check('rotationSpeed >= -1 across many spawns', rotMin >= -1,
    'min observed: ' + rotMin);
check('rotationSpeed <= 1 across many spawns', rotMax <= 1,
    'max observed: ' + rotMax);
check('rotationSpeed range exercises both halves (~uniform across [-1, 1])',
    rotMin < -0.4 && rotMax > 0.4,
    'min: ' + rotMin + ', max: ' + rotMax);

// =========================================================================
// AC#3: Speed per asteroid = base + currentLevel * perLevel ± variance.
//       Verify all asteroid speeds at level=5 fall within
//       [base + 5*perLevel - variance, base + 5*perLevel + variance].
//       (Note: setupTechdebtWorld floors very-low speeds to 10 px/s — accept
//       that as a valid speed too. With base=40, level=5, per=5, variance=15
//       the floor never trips.)
// =========================================================================
sandbox.currentLevel = 5;
sandbox.setupTechdebtWorld();
var expectedBase = sandbox.TECHDEBT_SPEED_BASE + 5 * sandbox.TECHDEBT_SPEED_PER_LEVEL;
var lo = expectedBase - sandbox.TECHDEBT_SPEED_VARIANCE - 1e-6;
var hi = expectedBase + sandbox.TECHDEBT_SPEED_VARIANCE + 1e-6;
var allInRange = true;
var dirSamples = {};
for (var si = 0; si < sandbox.techdebtAsteroids.length; si++) {
    var sa = sandbox.techdebtAsteroids[si];
    var speed = Math.sqrt(sa.vx * sa.vx + sa.vy * sa.vy);
    if (speed < lo || speed > hi) {
        // Allow the 10 px/s floor branch too.
        if (Math.abs(speed - 10) > 1e-6) allInRange = false;
    }
    // Bucket angle in 8 octants to confirm direction is random across asteroids.
    var ang = Math.atan2(sa.vy, sa.vx); // [-PI, PI]
    var oct = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 8;
    dirSamples[oct] = (dirSamples[oct] || 0) + 1;
}
check('all asteroid speeds within base + level*perLevel ± variance (or 10 px/s floor)',
    allInRange);

// Direction randomness — across 5 spawns at level=8 (16 asteroids each =>
// ~80 samples) we expect at least 4 of 8 octants represented.
var allDirs = {};
for (var dt2 = 0; dt2 < 5; dt2++) {
    sandbox.currentLevel = 8;
    sandbox.setupTechdebtWorld();
    for (var di = 0; di < sandbox.techdebtAsteroids.length; di++) {
        var dsa = sandbox.techdebtAsteroids[di];
        var dang = Math.atan2(dsa.vy, dsa.vx);
        var docto = Math.floor(((dang + Math.PI) / (Math.PI * 2)) * 8) % 8;
        allDirs[docto] = (allDirs[docto] || 0) + 1;
    }
}
check('direction is random — at least 4 of 8 octants represented',
    Object.keys(allDirs).length >= 4,
    'octants seen: ' + Object.keys(allDirs).length);

// =========================================================================
// AC#6: asteroidsTotal = count * 7 (1 large + 2 mediums + 4 smalls per large)
//       and is set ONCE at spawn time (not mutated by gameplay ticks).
// =========================================================================
sandbox.currentLevel = 0;
sandbox.setupTechdebtWorld();
var expectedCountL0 = Math.min(
    sandbox.TECHDEBT_ASTEROID_MAX,
    sandbox.TECHDEBT_ASTEROID_BASE_COUNT + 0 * sandbox.TECHDEBT_ASTEROID_PER_LEVEL);
check('asteroidsTotal at level 0 == count * 7',
    sandbox.asteroidsTotal === expectedCountL0 * 7,
    'asteroidsTotal: ' + sandbox.asteroidsTotal + ', expected: ' + (expectedCountL0 * 7));

sandbox.currentLevel = 3;
sandbox.setupTechdebtWorld();
var expectedCountL3 = Math.min(
    sandbox.TECHDEBT_ASTEROID_MAX,
    sandbox.TECHDEBT_ASTEROID_BASE_COUNT + 3 * sandbox.TECHDEBT_ASTEROID_PER_LEVEL);
check('asteroidsTotal at level 3 == count * 7',
    sandbox.asteroidsTotal === expectedCountL3 * 7,
    'asteroidsTotal: ' + sandbox.asteroidsTotal + ', expected: ' + (expectedCountL3 * 7));

sandbox.currentLevel = 50; // saturates to TECHDEBT_ASTEROID_MAX
sandbox.setupTechdebtWorld();
check('asteroidsTotal saturates at TECHDEBT_ASTEROID_MAX * 7 at high levels',
    sandbox.asteroidsTotal === sandbox.TECHDEBT_ASTEROID_MAX * 7);

// asteroidsTotal does NOT mutate during gameplay ticks even if asteroids
// disappear (sim: pop one, tick, expect counter unchanged).
sandbox.currentLevel = 0;
sandbox.setupTechdebtWorld();
var totalBefore = sandbox.asteroidsTotal;
sandbox.techdebtAsteroids.pop();
sandbox.ship = freshShip();
tick(0.016);
check('asteroidsTotal is not mutated during a gameplay tick',
    sandbox.asteroidsTotal === totalBefore,
    'before: ' + totalBefore + ', after: ' + sandbox.asteroidsTotal);

// =========================================================================
// AC#2: Drift at constant velocity (no accel, no drag).
//       After N frames, vx/vy must equal the initial vx/vy exactly.
// =========================================================================
sandbox.currentLevel = 0;
sandbox.setupTechdebtWorld();
var snap = [];
for (var sn = 0; sn < sandbox.techdebtAsteroids.length; sn++) {
    var sas = sandbox.techdebtAsteroids[sn];
    snap.push({ vx: sas.vx, vy: sas.vy });
}
sandbox.ship = freshShip();
sandbox.keys = {};
for (var fr = 0; fr < 60; fr++) tick(0.016);
var velStable = true;
for (var vc = 0; vc < sandbox.techdebtAsteroids.length; vc++) {
    var va = sandbox.techdebtAsteroids[vc];
    if (Math.abs(va.vx - snap[vc].vx) > 1e-9) velStable = false;
    if (Math.abs(va.vy - snap[vc].vy) > 1e-9) velStable = false;
}
check('asteroid velocity is constant across 60 frames (no drag, no accel)',
    velStable);

// Position should advance by vx*dt*frames (modulo wrap). Verify net displacement
// (with wrap unwound) matches v * elapsed for at least the first asteroid we
// can keep wrap-free by giving it a controlled position + velocity.
sandbox.techdebtAsteroids = [{
    x: 100, y: 100,
    vx: 30, vy: 20, // gentle drift, won't escape canvas in 50 frames @ dt=0.016
    size: sandbox.TECHDEBT_SIZE_LARGE,
    sizeTier: 'large',
    label: 'TODO',
    isProxiblue: false,
    rotation: 0,
    rotationSpeed: 0.5
}];
sandbox.ship = freshShip();
sandbox.keys = {};
for (var f2 = 0; f2 < 50; f2++) tick(0.016);
var driftA = sandbox.techdebtAsteroids[0];
var elapsed = 50 * 0.016;
check('asteroid x advances by vx*dt*frames (constant velocity)',
    Math.abs(driftA.x - (100 + 30 * elapsed)) < 1e-6,
    'x: ' + driftA.x + ', expected: ' + (100 + 30 * elapsed));
check('asteroid y advances by vy*dt*frames (constant velocity)',
    Math.abs(driftA.y - (100 + 20 * elapsed)) < 1e-6,
    'y: ' + driftA.y + ', expected: ' + (100 + 20 * elapsed));

// =========================================================================
// AC#5 (runtime): rotation increments by rotationSpeed * dt per tick.
// =========================================================================
sandbox.techdebtAsteroids = [{
    x: 100, y: 100, vx: 0, vy: 0,
    size: sandbox.TECHDEBT_SIZE_LARGE,
    sizeTier: 'large',
    label: 'TODO',
    isProxiblue: false,
    rotation: 0,
    rotationSpeed: 0.7
}];
sandbox.ship = freshShip();
sandbox.keys = {};
for (var rf = 0; rf < 30; rf++) tick(0.016);
var rotA = sandbox.techdebtAsteroids[0];
var expectedRot = 0.7 * 0.016 * 30;
check('asteroid rotation advances by rotationSpeed * dt each tick',
    Math.abs(rotA.rotation - expectedRot) < 1e-6,
    'rotation: ' + rotA.rotation + ', expected: ' + expectedRot);

// Negative rotationSpeed rotates the other way.
sandbox.techdebtAsteroids = [{
    x: 100, y: 100, vx: 0, vy: 0,
    size: sandbox.TECHDEBT_SIZE_LARGE,
    sizeTier: 'large',
    label: 'TODO',
    isProxiblue: false,
    rotation: 0,
    rotationSpeed: -0.5
}];
sandbox.ship = freshShip();
sandbox.keys = {};
tick(0.016);
check('asteroid with negative rotationSpeed rotates negatively',
    sandbox.techdebtAsteroids[0].rotation < 0,
    'rotation: ' + sandbox.techdebtAsteroids[0].rotation);

// =========================================================================
// AC#4: Wrap on all four screen edges. Use one tick with a hop > canvas size
//       so a single-frame wrap is unambiguous.
// =========================================================================
function wrapOnce(seed) {
    sandbox.techdebtAsteroids = [seed];
    sandbox.ship = freshShip();
    sandbox.keys = {};
    tick(0.016);
    return sandbox.techdebtAsteroids[0];
}

// Right edge: start near x=canvas.width, vx positive — should wrap to small x.
var rightWrap = wrapOnce({
    x: 799, y: 300, vx: 1000, vy: 0,
    size: 40, sizeTier: 'large', label: 'TODO',
    isProxiblue: false, rotation: 0, rotationSpeed: 0
});
check('asteroid wraps off right edge to left side',
    rightWrap.x < sandbox.canvas.width / 2,
    'x: ' + rightWrap.x);
check('right-wrapped asteroid x is in [0, canvas.width)',
    rightWrap.x >= 0 && rightWrap.x < sandbox.canvas.width,
    'x: ' + rightWrap.x);

// Left edge: start near x=0, vx negative — should wrap to large x.
var leftWrap = wrapOnce({
    x: 1, y: 300, vx: -1000, vy: 0,
    size: 40, sizeTier: 'large', label: 'TODO',
    isProxiblue: false, rotation: 0, rotationSpeed: 0
});
check('asteroid wraps off left edge to right side',
    leftWrap.x > sandbox.canvas.width / 2,
    'x: ' + leftWrap.x);
check('left-wrapped asteroid x is in [0, canvas.width)',
    leftWrap.x >= 0 && leftWrap.x < sandbox.canvas.width,
    'x: ' + leftWrap.x);

// Bottom edge.
var bottomWrap = wrapOnce({
    x: 400, y: 599, vx: 0, vy: 1000,
    size: 40, sizeTier: 'large', label: 'TODO',
    isProxiblue: false, rotation: 0, rotationSpeed: 0
});
check('asteroid wraps off bottom edge to top',
    bottomWrap.y < sandbox.canvas.height / 2,
    'y: ' + bottomWrap.y);
check('bottom-wrapped asteroid y is in [0, canvas.height)',
    bottomWrap.y >= 0 && bottomWrap.y < sandbox.canvas.height,
    'y: ' + bottomWrap.y);

// Top edge.
var topWrap = wrapOnce({
    x: 400, y: 1, vx: 0, vy: -1000,
    size: 40, sizeTier: 'large', label: 'TODO',
    isProxiblue: false, rotation: 0, rotationSpeed: 0
});
check('asteroid wraps off top edge to bottom',
    topWrap.y > sandbox.canvas.height / 2,
    'y: ' + topWrap.y);
check('top-wrapped asteroid y is in [0, canvas.height)',
    topWrap.y >= 0 && topWrap.y < sandbox.canvas.height,
    'y: ' + topWrap.y);

// =========================================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
