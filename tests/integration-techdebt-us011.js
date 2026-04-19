// US-011 (Tech Debt Blaster): Runtime integration test for the TECHDEBT_RETURN
// handler inside js/update.js — verifies the mini-game exits cleanly back to
// normal lander play on the next level, and that the loss path clears mini-
// game entities as part of the shared CRASHED cleanup.
//
// Acceptance criteria covered:
//   AC#1: After TECHDEBT_COMPLETE_DELAY, gameState advances to TECHDEBT_RETURN.
//   AC#2: TECHDEBT_RETURN handler calls resetShip(), generateTerrain(),
//         currentLevel++, clears techdebtAsteroids/techdebtBullets/
//         techdebtParticles, resets shield state, then flips to STATES.PLAYING.
//   AC#3: Ship returns to normal flight with full fuel (resetShip sets fuel).
//   AC#4: Loss path uses the CRASHED flow — asteroids/bullets/particles are
//         cleared as part of cleanup (TECHDEBT_PLAYING tail invokes
//         clearTechdebtState when gameState === STATES.CRASHED).
//
// Run:  node tests/integration-techdebt-us011.js
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
function loadFile(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

// -- Call counters for stubs (checked across scenarios) -----------------------
var resetShipCalls = 0;
var resetWindCalls = 0;
var generateTerrainCalls = 0;
var spawnExplosionCalls = [];
var startScreenShakeCalls = 0;
var playExplosionSoundCalls = 0;
var stopThrustSoundCalls = 0;

var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    keys: {},
    SHIP_SIZE: 40,
    // resetShip sets ship.fuel = FUEL_MAX (js/ship.js:71) — the stub must
    // mirror that behaviour for AC#3 ("full fuel on the new level") to be
    // verifiable without loading the whole ship.js module.
    resetShip: function () {
        resetShipCalls++;
        sandbox.ship = sandbox.ship || {};
        sandbox.ship.x = sandbox.canvas.width / 2;
        sandbox.ship.y = sandbox.canvas.height / 3;
        sandbox.ship.vx = 0;
        sandbox.ship.vy = 0;
        sandbox.ship.angle = 0;
        sandbox.ship.thrusting = false;
        sandbox.ship.rotating = null;
        sandbox.ship.fuel = sandbox.FUEL_MAX;
    },
    resetWind: function () { resetWindCalls++; },
    generateTerrain: function () { generateTerrainCalls++; },
    getLevelConfig: function () { return { gravity: 0.05 }; },
    stopThrustSound: function () { stopThrustSoundCalls++; },
    startThrustSound: function () {},
    playTechdebtShootSound: function () {},
    playProxiblueCollectSound: function () {},
    spawnExplosion: function (x, y) { spawnExplosionCalls.push({ x: x, y: y }); },
    startScreenShake: function () { startScreenShakeCalls++; },
    playExplosionSound: function () { playExplosionSoundCalls++; },
    spawnCelebration: function () {},
    updateCelebration: function () {},
    spawnBugWave: function () {},
    setupMissileWorld: function () {},
    setupTechdebtWorld: function () {},
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

// -- Brace-walk: extract blocks + helpers verbatim ---------------------------
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

var clearSrc = extractBlock(updateSrc, 'function clearTechdebtState() {');
check('found clearTechdebtState function', typeof clearSrc === 'string' && clearSrc.length > 0);
if (clearSrc) vm.runInContext(clearSrc, sandbox, { filename: 'clearTechdebtState-extracted' });

var crashSrc = extractBlock(updateSrc, 'function crashShipInTechdebt(');
check('found crashShipInTechdebt function', typeof crashSrc === 'string' && crashSrc.length > 0);
if (crashSrc) vm.runInContext(crashSrc, sandbox, { filename: 'crashShipInTechdebt-extracted' });

var playSrc = extractBlock(updateSrc, 'if (gameState === STATES.TECHDEBT_PLAYING) {');
check('found TECHDEBT_PLAYING block', typeof playSrc === 'string' && playSrc.length > 0);
var playReplay = new vm.Script('(function () {\n' + playSrc + '\n}).call(this);',
    { filename: 'techdebt-playing-extracted' });

var completeSrc = extractBlock(updateSrc, 'if (gameState === STATES.TECHDEBT_COMPLETE) {');
check('found TECHDEBT_COMPLETE block', typeof completeSrc === 'string' && completeSrc.length > 0);
var completeReplay = new vm.Script('(function () {\n' + completeSrc + '\n}).call(this);',
    { filename: 'techdebt-complete-extracted' });

var returnSrc = extractBlock(updateSrc, 'if (gameState === STATES.TECHDEBT_RETURN) {');
check('found TECHDEBT_RETURN handler block', typeof returnSrc === 'string' && returnSrc.length > 0);
var returnReplay = new vm.Script('(function () {\n' + returnSrc + '\n}).call(this);',
    { filename: 'techdebt-return-extracted' });

// -- Per-scenario reset --------------------------------------------------------
function freshShip(over) {
    var s = {
        x: 400, y: 300, vx: 0, vy: 0,
        angle: 0,
        rotationSpeed: sandbox.ROTATION_SPEED,
        thrusting: false, rotating: null,
        fuel: sandbox.FUEL_MAX
    };
    if (over) for (var k in over) s[k] = over[k];
    return s;
}
function resetScenario() {
    sandbox.techdebtAsteroids = [];
    sandbox.techdebtBullets = [];
    sandbox.techdebtParticles = [];
    sandbox.techdebtScore = 0;
    sandbox.score = 0;
    sandbox.asteroidsDestroyed = 0;
    sandbox.asteroidsTotal = 0;
    sandbox.techdebtCompleteTimer = 0;
    sandbox.techdebtFuelBonus = 0;
    sandbox.techdebtBulletCooldownTimer = 0;
    sandbox.techdebtTransitionTimer = 0;
    sandbox.proxiblueShieldActive = false;
    sandbox.proxiblueShieldTimer = 0;
    sandbox.proxiblueShieldFlashTimer = 0;
    sandbox.landingResult = null;
    sandbox.ship = freshShip();
    sandbox.keys = {};
    resetShipCalls = 0;
    resetWindCalls = 0;
    generateTerrainCalls = 0;
    spawnExplosionCalls = [];
    startScreenShakeCalls = 0;
    playExplosionSoundCalls = 0;
    stopThrustSoundCalls = 0;
}
function tickPlaying(dt) {
    sandbox.dt = (dt === undefined ? 0.016 : dt);
    playReplay.runInContext(sandbox);
}
function tickComplete(dt) {
    sandbox.dt = (dt === undefined ? 0.016 : dt);
    completeReplay.runInContext(sandbox);
}
function tickReturn(dt) {
    sandbox.dt = (dt === undefined ? 0.016 : dt);
    returnReplay.runInContext(sandbox);
}

// =============================================================================
// AC#1: After TECHDEBT_COMPLETE_DELAY, TECHDEBT_COMPLETE transitions to
// TECHDEBT_RETURN.
// =============================================================================
resetScenario();
sandbox.ship.fuel = sandbox.FUEL_MAX;
sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
tickPlaying(0.001);  // empty-asteroid-array win condition → TECHDEBT_COMPLETE
check('AC#1 setup: win-condition enters TECHDEBT_COMPLETE',
    sandbox.gameState === sandbox.STATES.TECHDEBT_COMPLETE);

// Tick COMPLETE below the delay threshold — must NOT transition.
tickComplete(1.0);
check('AC#1: below TECHDEBT_COMPLETE_DELAY → stays in TECHDEBT_COMPLETE',
    sandbox.gameState === sandbox.STATES.TECHDEBT_COMPLETE,
    'gameState: ' + sandbox.gameState);

// Tick past the threshold — transitions to TECHDEBT_RETURN.
tickComplete(sandbox.TECHDEBT_COMPLETE_DELAY);  // cumulative well over 2.0
check('AC#1: >= TECHDEBT_COMPLETE_DELAY → gameState = TECHDEBT_RETURN',
    sandbox.gameState === sandbox.STATES.TECHDEBT_RETURN,
    'gameState: ' + sandbox.gameState + ', timer: ' + sandbox.techdebtCompleteTimer);

// =============================================================================
// AC#2: TECHDEBT_RETURN handler is a real block with all the required effects.
// =============================================================================
resetScenario();
// Seed mini-game state as if we've just completed a round.
sandbox.techdebtAsteroids = [
    { x: 1, y: 1, size: 5, sizeTier: 'small', label: 'a',
      isProxiblue: false, vx: 0, vy: 0, rotation: 0, rotationSpeed: 0 },
    { x: 2, y: 2, size: 5, sizeTier: 'small', label: 'b',
      isProxiblue: false, vx: 0, vy: 0, rotation: 0, rotationSpeed: 0 }
];
sandbox.techdebtBullets = [
    { x: 10, y: 10, vx: 100, vy: 0, age: 0.1 },
    { x: 20, y: 20, vx: 0, vy: 100, age: 0.2 }
];
sandbox.techdebtParticles = [
    { x: 30, y: 30, vx: 0, vy: 0, life: 0.5, maxLife: 0.5, size: 2, color: '#5D4037' }
];
sandbox.techdebtFuelBonus = 200;
sandbox.asteroidsDestroyed = 7;
sandbox.asteroidsTotal = 7;
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 5.0;
sandbox.proxiblueShieldFlashTimer = 0.2;
sandbox.techdebtBulletCooldownTimer = 0.17;
sandbox.techdebtCompleteTimer = 2.5;
sandbox.currentLevel = 3;
sandbox.gameState = sandbox.STATES.TECHDEBT_RETURN;

tickReturn();

check('AC#2: gameState flips to STATES.PLAYING',
    sandbox.gameState === sandbox.STATES.PLAYING,
    'gameState: ' + sandbox.gameState);
check('AC#2: currentLevel advanced by 1 (3 → 4)',
    sandbox.currentLevel === 4,
    'currentLevel: ' + sandbox.currentLevel);
check('AC#2: resetShip() called exactly once',
    resetShipCalls === 1,
    'calls: ' + resetShipCalls);
check('AC#2: generateTerrain() called exactly once',
    generateTerrainCalls === 1,
    'calls: ' + generateTerrainCalls);
check('AC#2: techdebtAsteroids cleared',
    sandbox.techdebtAsteroids.length === 0);
check('AC#2: techdebtBullets cleared',
    sandbox.techdebtBullets.length === 0);
check('AC#2: techdebtParticles cleared',
    sandbox.techdebtParticles.length === 0);
check('AC#2: proxiblueShieldActive reset (shield cleared)',
    sandbox.proxiblueShieldActive === false);
check('AC#2: proxiblueShieldTimer reset (shield cleared)',
    sandbox.proxiblueShieldTimer === 0);
check('AC#2: proxiblueShieldFlashTimer reset',
    sandbox.proxiblueShieldFlashTimer === 0);

// =============================================================================
// AC#3: Ship returns to normal flight with full fuel on the new level.
// =============================================================================
resetScenario();
sandbox.ship.fuel = 12;  // simulate drained fuel from the mini-game round
sandbox.currentLevel = 2;
sandbox.gameState = sandbox.STATES.TECHDEBT_RETURN;
tickReturn();
check('AC#3: ship.fuel restored to FUEL_MAX after return',
    sandbox.ship.fuel === sandbox.FUEL_MAX,
    'fuel: ' + sandbox.ship.fuel);
check('AC#3: ship.vx zeroed (normal flight starts at rest)',
    sandbox.ship.vx === 0);
check('AC#3: ship.vy zeroed',
    sandbox.ship.vy === 0);
check('AC#3: ship.angle reset to 0 (upright)',
    sandbox.ship.angle === 0);

// =============================================================================
// End-to-end: PLAYING (win) → COMPLETE → RETURN → PLAYING without hanging.
// =============================================================================
resetScenario();
sandbox.ship.fuel = sandbox.FUEL_MAX;
sandbox.currentLevel = 5;
sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
tickPlaying(0.001);  // no asteroids → enters TECHDEBT_COMPLETE
check('e2e: PLAYING → COMPLETE on last asteroid',
    sandbox.gameState === sandbox.STATES.TECHDEBT_COMPLETE);
tickComplete(sandbox.TECHDEBT_COMPLETE_DELAY + 0.1);
check('e2e: COMPLETE → RETURN after delay',
    sandbox.gameState === sandbox.STATES.TECHDEBT_RETURN);
tickReturn();
check('e2e: RETURN → PLAYING (game is not stuck)',
    sandbox.gameState === sandbox.STATES.PLAYING);
check('e2e: currentLevel advanced (5 → 6)',
    sandbox.currentLevel === 6);
check('e2e: ship.fuel is FUEL_MAX on the new level',
    sandbox.ship.fuel === sandbox.FUEL_MAX);

// =============================================================================
// AC#4: Loss path uses the existing CRASHED flow; asteroids/bullets/particles
// cleared as part of cleanup.
// =============================================================================
// Place the ship inside a LARGE asteroid with shield OFF — ship-vs-asteroid
// collision (US-009) fires crashShipInTechdebt which sets gameState=CRASHED.
// The new US-011 tail cleanup in the TECHDEBT_PLAYING block must then clear
// the residual entities.
resetScenario();
sandbox.ship.fuel = 40;  // intentionally non-full to confirm we do NOT auto-reset fuel on crash
sandbox.techdebtAsteroids = [
    { x: 400, y: 300, size: 40, sizeTier: 'large', label: 'crash',
      isProxiblue: false, vx: 0, vy: 0, rotation: 0, rotationSpeed: 0 },
    // second asteroid off-screen so it survives and we can assert it got cleared
    { x: 100, y: 100, size: 20, sizeTier: 'medium', label: 'survivor',
      isProxiblue: false, vx: 0, vy: 0, rotation: 0, rotationSpeed: 0 }
];
sandbox.techdebtBullets = [{ x: 50, y: 50, vx: 0, vy: -100, age: 0.1 }];
sandbox.techdebtParticles = [
    { x: 60, y: 60, vx: 0, vy: 0, life: 0.5, maxLife: 0.5, size: 2, color: '#5D4037' }
];
sandbox.proxiblueShieldActive = false;
sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
tickPlaying(0.016);

check('AC#4: unshielded ship-vs-asteroid → gameState = CRASHED',
    sandbox.gameState === sandbox.STATES.CRASHED,
    'gameState: ' + sandbox.gameState);
check('AC#4: existing CRASHED flow — crashShipInTechdebt spawned explosion',
    spawnExplosionCalls.length === 1);
check('AC#4: existing CRASHED flow — screen shake triggered',
    startScreenShakeCalls === 1);
check('AC#4: existing CRASHED flow — explosion sound played',
    playExplosionSoundCalls === 1);
check('AC#4: existing CRASHED flow — landingResult set for crash screen',
    sandbox.landingResult === 'Tech debt asteroid collision',
    'landingResult: ' + sandbox.landingResult);
// The four cleared-on-crash invariants (AC#4's second clause).
check('AC#4: techdebtAsteroids cleared on CRASHED',
    sandbox.techdebtAsteroids.length === 0,
    'remaining: ' + sandbox.techdebtAsteroids.length);
check('AC#4: techdebtBullets cleared on CRASHED',
    sandbox.techdebtBullets.length === 0);
check('AC#4: techdebtParticles cleared on CRASHED',
    sandbox.techdebtParticles.length === 0);
// Counters should also reset for a clean slate on the next round.
check('AC#4: asteroidsDestroyed reset to 0',
    sandbox.asteroidsDestroyed === 0);
check('AC#4: asteroidsTotal reset to 0',
    sandbox.asteroidsTotal === 0);

// --- Summary ---
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
