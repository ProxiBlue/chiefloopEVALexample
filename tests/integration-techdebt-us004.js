// US-004 (Tech Debt Blaster): Runtime integration test for the
// TECHDEBT_TRANSITION entry flow.
//
// Exercises two paths in a single vm context:
//   1. The SCENE_SCROLL end branch extracted verbatim from js/update.js — with
//      landedPRType === 'other' — which calls setupTechdebtWorld() and advances
//      gameState to TECHDEBT_TRANSITION.
//   2. The TECHDEBT_TRANSITION tick block, driven past
//      TECHDEBT_TRANSITION_DURATION to verify it routes to TECHDEBT_PLAYING.
//
// Runtime (not static): config.js + the setupTechdebtWorld() function + both
// update-block extracts are all evaluated inside the vm sandbox, so assertions
// reflect the actual bytes that ship.
//
// Run:  node tests/integration-techdebt-us004.js
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
    console.log(tag + ' — ' + name + (!ok && detail ? ' :: ' + detail : ''));
    if (ok) passed++; else failed++;
}

function loadFile(rel) {
    return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

// --- sandbox ---
var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    keys: {},
    stopThrustSound: function () {},
    startThrustSound: function () {},
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

// --- load config + setupTechdebtWorld ---
vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

// Extract the setupTechdebtWorld function from update.js by signature + brace walk.
var updateSrc = loadFile('js/update.js');
var sig = 'function setupTechdebtWorld() {';
var startIdx = updateSrc.indexOf(sig);
if (startIdx < 0) {
    check('update.js contains setupTechdebtWorld definition', false, 'signature not found');
    process.exit(1);
}
var openBrace = updateSrc.indexOf('{', startIdx + sig.length - 1);
var depth = 0;
var closeBrace = -1;
for (var i = openBrace; i < updateSrc.length; i++) {
    if (updateSrc[i] === '{') depth++;
    else if (updateSrc[i] === '}') { depth--; if (depth === 0) { closeBrace = i; break; } }
}
var setupFnSrc = updateSrc.slice(startIdx, closeBrace + 1);
vm.runInContext(setupFnSrc, sandbox, { filename: 'setupTechdebtWorld-extracted' });
check('setupTechdebtWorld evaluated into sandbox',
    typeof sandbox.setupTechdebtWorld === 'function');

// Extract the SCENE_SCROLL block (to drive the isOtherPad → TECHDEBT_TRANSITION path).
var scrollSig = 'if (gameState === STATES.SCENE_SCROLL && sceneScrollState) {';
var scrollStart = updateSrc.indexOf(scrollSig);
var sOpen = updateSrc.indexOf('{', scrollStart + scrollSig.length - 1);
var sDepth = 0, sClose = -1;
for (var j = sOpen; j < updateSrc.length; j++) {
    if (updateSrc[j] === '{') sDepth++;
    else if (updateSrc[j] === '}') { sDepth--; if (sDepth === 0) { sClose = j; break; } }
}
var scrollBlock = updateSrc.slice(scrollStart, sClose + 1);
var scrollReplay = new vm.Script('(function () {\n' + scrollBlock + '\n}).call(this);',
    { filename: 'scroll-block-extracted' });

// Extract the TECHDEBT_TRANSITION tick block.
var tSig = 'if (gameState === STATES.TECHDEBT_TRANSITION) {';
var tStart = updateSrc.indexOf(tSig);
if (tStart < 0) {
    check('update.js contains TECHDEBT_TRANSITION tick block', false, 'signature not found');
    process.exit(1);
}
var tOpen = updateSrc.indexOf('{', tStart + tSig.length - 1);
var tDepth = 0, tClose = -1;
for (var k = tOpen; k < updateSrc.length; k++) {
    if (updateSrc[k] === '{') tDepth++;
    else if (updateSrc[k] === '}') { tDepth--; if (tDepth === 0) { tClose = k; break; } }
}
var tickBlock = updateSrc.slice(tStart, tClose + 1);
var tickReplay = new vm.Script('(function () {\n' + tickBlock + '\n}).call(this);',
    { filename: 'techdebt-tick-extracted' });

// --- seed + drive the SCENE_SCROLL end branch for an `other` pad ---
function runSceneScrollEndForOtherPad(level) {
    sandbox.currentLevel = level;
    sandbox.gameState = sandbox.STATES.SCENE_SCROLL;
    sandbox.terrain = [{ x: 0, y: 500 }, { x: 800, y: 500 }];
    sandbox.landingPads = [];
    sandbox.sceneScrollState = sandbox.createSceneScrollState(
        [{ x: 0, y: 500 }, { x: 800, y: 500 }],
        [],
        [{ x: 0, y: 522 }, { x: 800, y: 522 }],
        [],
        false, false, false,
        400
    );
    sandbox.ship = { x: 400, y: 300, vx: 7, vy: -3, angle: 0.4, thrusting: false, rotating: null, fuel: 37 };
    sandbox.dt = sandbox.SCENE_SCROLL_DURATION + 0.1;
    sandbox.landedPRType = 'other';
    sandbox.landingPadIndex = -1;
    sandbox.sceneDescentStartY = 0;
    sandbox.sceneDescentTargetY = 0;
    sandbox.sceneDescentTimer = 0;
    sandbox.techdebtTransitionTimer = 999;
    // Pre-pollute per-round counters + arrays to verify setup clears them.
    sandbox.techdebtScore = 12345;
    sandbox.asteroidsDestroyed = 7;
    sandbox.techdebtAsteroids = [{ stale: true }];
    sandbox.techdebtBullets = [{ stale: true }];
    sandbox.techdebtParticles = [{ stale: true }];
    sandbox.proxiblueShieldActive = true;
    sandbox.proxiblueShieldTimer = 4.2;
    scrollReplay.runInContext(sandbox);
}

// --- AC checks at level 0 ---
runSceneScrollEndForOtherPad(0);

check('gameState → STATES.TECHDEBT_TRANSITION',
    sandbox.gameState === sandbox.STATES.TECHDEBT_TRANSITION,
    'gameState: ' + sandbox.gameState);

check('techdebtTransitionTimer reset to 0',
    sandbox.techdebtTransitionTimer === 0,
    'techdebtTransitionTimer: ' + sandbox.techdebtTransitionTimer);

check('ship centered at canvas center',
    sandbox.ship.x === sandbox.canvas.width / 2 && sandbox.ship.y === sandbox.canvas.height / 2,
    'ship: (' + sandbox.ship.x + ',' + sandbox.ship.y + ')');

check('ship angle zeroed (upright)',
    sandbox.ship.angle === 0,
    'ship.angle: ' + sandbox.ship.angle);

check('ship velocity zeroed',
    sandbox.ship.vx === 0 && sandbox.ship.vy === 0,
    'ship.vx: ' + sandbox.ship.vx + ', ship.vy: ' + sandbox.ship.vy);

check('ship.fuel set to FUEL_MAX',
    sandbox.ship.fuel === sandbox.FUEL_MAX,
    'ship.fuel: ' + sandbox.ship.fuel);

check('techdebtScore reset to 0',
    sandbox.techdebtScore === 0,
    'techdebtScore: ' + sandbox.techdebtScore);

check('asteroidsDestroyed reset to 0',
    sandbox.asteroidsDestroyed === 0,
    'asteroidsDestroyed: ' + sandbox.asteroidsDestroyed);

check('techdebtBullets cleared',
    Array.isArray(sandbox.techdebtBullets) && sandbox.techdebtBullets.length === 0,
    'techdebtBullets: ' + JSON.stringify(sandbox.techdebtBullets));

check('techdebtParticles cleared',
    Array.isArray(sandbox.techdebtParticles) && sandbox.techdebtParticles.length === 0,
    'techdebtParticles: ' + JSON.stringify(sandbox.techdebtParticles));

check('proxiblueShieldActive reset',
    sandbox.proxiblueShieldActive === false,
    'proxiblueShieldActive: ' + sandbox.proxiblueShieldActive);

check('proxiblueShieldTimer reset',
    sandbox.proxiblueShieldTimer === 0,
    'proxiblueShieldTimer: ' + sandbox.proxiblueShieldTimer);

// Asteroid-field checks at level 0
var expectedAt0 = Math.min(
    sandbox.TECHDEBT_ASTEROID_MAX,
    sandbox.TECHDEBT_ASTEROID_BASE_COUNT + 0 * sandbox.TECHDEBT_ASTEROID_PER_LEVEL
);
check('asteroid count at level 0 matches formula',
    sandbox.techdebtAsteroids.length === expectedAt0,
    'got: ' + sandbox.techdebtAsteroids.length + ', expected: ' + expectedAt0);
// asteroidsTotal accounts for split children (1 large + 2 mediums + 4 smalls = 7 per large).
check('asteroidsTotal == asteroid count * 7 (large + potential children)',
    sandbox.asteroidsTotal === sandbox.techdebtAsteroids.length * 7,
    'asteroidsTotal: ' + sandbox.asteroidsTotal + ', asteroids: ' + sandbox.techdebtAsteroids.length);

var centerX = sandbox.canvas.width / 2;
var centerY = sandbox.canvas.height / 2;
var allLarge = true;
var allSafeDist = true;
var allValidLabel = true;
var labelPool = sandbox.TECHDEBT_LABEL_POOL;
for (var ai = 0; ai < sandbox.techdebtAsteroids.length; ai++) {
    var a = sandbox.techdebtAsteroids[ai];
    // US-012: ProxiBlue asteroids spawn MEDIUM. Every other asteroid starts as
    // LARGE (US-004 spawn contract) and splits into mediums/smalls later.
    if (a.isProxiblue) {
        if (a.sizeTier !== 'medium' || a.size !== sandbox.TECHDEBT_SIZE_MEDIUM) allLarge = false;
    } else {
        if (a.sizeTier !== 'large' || a.size !== sandbox.TECHDEBT_SIZE_LARGE) allLarge = false;
    }
    var ddx = a.x - centerX;
    var ddy = a.y - centerY;
    var dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dist < sandbox.TECHDEBT_SAFE_SPAWN_RADIUS) allSafeDist = false;
    if (a.isProxiblue) {
        if (a.label !== 'ProxiBlue') allValidLabel = false;
    } else {
        if (labelPool.indexOf(a.label) < 0) allValidLabel = false;
    }
}
check('all non-ProxiBlue asteroids start as LARGE; ProxiBlue asteroids start as MEDIUM (US-012 AC#2)', allLarge);
check('all asteroids at least TECHDEBT_SAFE_SPAWN_RADIUS from ship center', allSafeDist);
check('all asteroid labels are either "ProxiBlue" or from TECHDEBT_LABEL_POOL', allValidLabel);

// --- ProxiBlue distribution sanity over many spawns ---
// With PROXIBLUE_SPAWN_CHANCE = 0.125 and ~150 asteroids sampled, expect some
// ProxiBlue but far fewer than half. This is probabilistic — use wide bounds.
var totalProxi = 0;
var totalAst = 0;
for (var trial = 0; trial < 15; trial++) {
    sandbox.currentLevel = 8; // saturates to MAX (4 + 8*2 = 20 → capped 16)
    sandbox.setupTechdebtWorld();
    totalAst += sandbox.techdebtAsteroids.length;
    for (var ii = 0; ii < sandbox.techdebtAsteroids.length; ii++) {
        if (sandbox.techdebtAsteroids[ii].isProxiblue) totalProxi++;
    }
}
var proxiRate = totalProxi / Math.max(1, totalAst);
check('ProxiBlue spawn rate within sane bounds (0% < rate < 40%) over ~' + totalAst + ' asteroids',
    proxiRate > 0 && proxiRate < 0.4,
    'observed proxiRate: ' + proxiRate + ' (' + totalProxi + '/' + totalAst + ')');

// --- Count formula at higher levels (including MAX cap) ---
sandbox.currentLevel = 3;
sandbox.setupTechdebtWorld();
var expectedAt3 = Math.min(sandbox.TECHDEBT_ASTEROID_MAX,
    sandbox.TECHDEBT_ASTEROID_BASE_COUNT + 3 * sandbox.TECHDEBT_ASTEROID_PER_LEVEL);
check('asteroid count at level 3 matches formula',
    sandbox.techdebtAsteroids.length === expectedAt3,
    'got: ' + sandbox.techdebtAsteroids.length + ', expected: ' + expectedAt3);

sandbox.currentLevel = 20; // far past the cap
sandbox.setupTechdebtWorld();
check('asteroid count at level 20 capped at TECHDEBT_ASTEROID_MAX',
    sandbox.techdebtAsteroids.length === sandbox.TECHDEBT_ASTEROID_MAX,
    'got: ' + sandbox.techdebtAsteroids.length + ', MAX: ' + sandbox.TECHDEBT_ASTEROID_MAX);

// --- Tick block: timer elapses → TECHDEBT_PLAYING ---
sandbox.gameState = sandbox.STATES.TECHDEBT_TRANSITION;
sandbox.techdebtTransitionTimer = 0;
sandbox.dt = 0.1;
tickReplay.runInContext(sandbox);
check('mid-transition tick advances timer but does NOT exit state',
    sandbox.gameState === sandbox.STATES.TECHDEBT_TRANSITION && sandbox.techdebtTransitionTimer > 0,
    'gameState: ' + sandbox.gameState + ', timer: ' + sandbox.techdebtTransitionTimer);

sandbox.dt = sandbox.TECHDEBT_TRANSITION_DURATION + 0.1;
tickReplay.runInContext(sandbox);
check('transition timer ≥ TECHDEBT_TRANSITION_DURATION → STATES.TECHDEBT_PLAYING',
    sandbox.gameState === sandbox.STATES.TECHDEBT_PLAYING,
    'gameState: ' + sandbox.gameState);

console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
