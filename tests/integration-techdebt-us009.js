// US-009 (Tech Debt Blaster): Ship vs asteroid collision + ProxiBlue shield.
//
// Loads config.js + helper functions (setupTechdebtWorld,
// spawnTechdebtAsteroidParticles, splitTechdebtAsteroid, crashShipInTechdebt)
// + the TECHDEBT_PLAYING block from js/update.js into a vm sandbox and
// verifies all five AC:
//   1. Ship-vs-asteroid collision uses circle-circle detection
//      (TECHDEBT_SHIP_RADIUS ~15 vs a.size).
//   2. Shield branch: absorbs hit, shield drops, asteroid destroyed (no split)
//      and awards its point value, blue flash plays, ship safe.
//   3. No shield: transitions to STATES.CRASHED.
//   4. Partial techdebtScore accumulated stays in `score`.
//   5. Crash spawns the existing explosion particle effect.
//
// Run:  node tests/integration-techdebt-us009.js
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

// Spy counters for the crash-FX pipeline so we can verify AC#5 literally.
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
    stopThrustSound: function () { stopThrustSoundCalls++; },
    startThrustSound: function () {},
    playTechdebtShootSound: function () {},
    playProxiblueCollectSound: function () {},
    spawnExplosion: function (x, y) { spawnExplosionCalls.push({ x: x, y: y }); },
    startScreenShake: function () { startScreenShakeCalls++; },
    playExplosionSound: function () { playExplosionSoundCalls++; },
    spawnCelebration: function () {},
    clearTechdebtState: function () {},
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

// --- Brace-walk extract helpers + TECHDEBT_PLAYING block ---
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

var partSrc = extractBlock(updateSrc, 'function spawnTechdebtAsteroidParticles(');
if (!partSrc) { check('found spawnTechdebtAsteroidParticles', false); process.exit(1); }
vm.runInContext(partSrc, sandbox, { filename: 'spawnTechdebtAsteroidParticles-extracted' });

var splitSrc = extractBlock(updateSrc, 'function splitTechdebtAsteroid(');
if (!splitSrc) { check('found splitTechdebtAsteroid', false); process.exit(1); }
vm.runInContext(splitSrc, sandbox, { filename: 'splitTechdebtAsteroid-extracted' });

var crashSrc = extractBlock(updateSrc, 'function crashShipInTechdebt(');
if (!crashSrc) { check('found crashShipInTechdebt', false); process.exit(1); }
vm.runInContext(crashSrc, sandbox, { filename: 'crashShipInTechdebt-extracted' });

check('crashShipInTechdebt loaded', typeof sandbox.crashShipInTechdebt === 'function');

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

function resetScenario() {
    sandbox.techdebtAsteroids = [];
    sandbox.techdebtBullets = [];
    sandbox.techdebtParticles = [];
    sandbox.techdebtScore = 0;
    sandbox.score = 0;
    sandbox.asteroidsDestroyed = 0;
    sandbox.techdebtBulletCooldownTimer = 0;
    sandbox.proxiblueShieldActive = false;
    sandbox.proxiblueShieldTimer = 0;
    sandbox.proxiblueShieldFlashTimer = 0;
    sandbox.landingResult = null;
    sandbox.ship = freshShip();
    // Zero fuel so the US-010 win-condition fuel bonus evaluates to 0 —
    // this test asserts tier point awards + crash pipeline, not fuel bonus.
    sandbox.ship.fuel = 0;
    sandbox.keys = {};
    spawnExplosionCalls = [];
    startScreenShakeCalls = 0;
    playExplosionSoundCalls = 0;
    stopThrustSoundCalls = 0;
}

function makeAsteroid(opts) {
    return {
        x: opts.x, y: opts.y,
        vx: opts.vx || 0, vy: opts.vy || 0,
        size: opts.size,
        sizeTier: opts.sizeTier,
        label: opts.label || 'TODO',
        isProxiblue: !!opts.isProxiblue,
        rotation: 0,
        rotationSpeed: 0
    };
}

// =========================================================================
// AC#1 — circle-circle detection: TECHDEBT_SHIP_RADIUS + a.size.
// Ship at (400, 300), asteroid at (400 + combined - 0.5, 300) hits.
// =========================================================================
check('TECHDEBT_SHIP_RADIUS config constant exists', typeof sandbox.TECHDEBT_SHIP_RADIUS === 'number'
    && sandbox.TECHDEBT_SHIP_RADIUS >= 10 && sandbox.TECHDEBT_SHIP_RADIUS <= 20,
    'TECHDEBT_SHIP_RADIUS = ' + sandbox.TECHDEBT_SHIP_RADIUS);

resetScenario();
var combined = sandbox.TECHDEBT_SHIP_RADIUS + sandbox.TECHDEBT_SIZE_LARGE;
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400 + combined - 0.5, y: 300,
    size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large'
}));
sandbox.proxiblueShieldActive = true; // avoid state-change during detection test
sandbox.proxiblueShieldTimer = 5;
tick(0.001);
check('ship and asteroid touching at combined-radius - 0.5 registers collision',
    sandbox.techdebtAsteroids.length === 0,
    'remaining asteroids: ' + sandbox.techdebtAsteroids.length);

// Just outside combined radius: no collision.
resetScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400 + combined + 0.5, y: 300,
    size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large'
}));
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 5;
tick(0.001);
check('ship just outside combined radius does NOT collide',
    sandbox.techdebtAsteroids.length === 1
    && sandbox.proxiblueShieldActive === true
    && sandbox.gameState === sandbox.STATES.TECHDEBT_PLAYING);

// =========================================================================
// AC#2 — Shielded hit: shield consumed, asteroid destroyed (NOT split),
// awards point value, blue flash plays, ship stays safe.
// =========================================================================
resetScenario();
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 5;
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large'
}));
tick(0.001);
check('shielded hit: proxiblueShieldActive set to false',
    sandbox.proxiblueShieldActive === false);
check('shielded hit: proxiblueShieldTimer set to 0',
    sandbox.proxiblueShieldTimer === 0,
    'timer: ' + sandbox.proxiblueShieldTimer);
check('shielded hit on LARGE: asteroid destroyed WITHOUT splitting (no children)',
    sandbox.techdebtAsteroids.length === 0,
    'remaining asteroids: ' + sandbox.techdebtAsteroids.length);
check('shielded hit on LARGE: awards TECHDEBT_POINTS_LARGE to techdebtScore and score',
    sandbox.techdebtScore === sandbox.TECHDEBT_POINTS_LARGE
    && sandbox.score === sandbox.TECHDEBT_POINTS_LARGE,
    'techdebtScore: ' + sandbox.techdebtScore + ', score: ' + sandbox.score);
check('shielded hit: asteroidsDestroyed incremented',
    sandbox.asteroidsDestroyed === 1);
check('shielded hit: blue flash timer was armed (PROXIBLUE_SHIELD_FLASH_DURATION)',
    sandbox.proxiblueShieldFlashTimer > 0
    && sandbox.proxiblueShieldFlashTimer <= sandbox.PROXIBLUE_SHIELD_FLASH_DURATION,
    'flash timer: ' + sandbox.proxiblueShieldFlashTimer);
// US-010: clearing the last asteroid transitions to TECHDEBT_COMPLETE — either
// TECHDEBT_PLAYING (more asteroids remaining) or TECHDEBT_COMPLETE (this was
// the last one) means the ship survived. CRASHED would mean the shield failed.
check('shielded hit: gameState NOT CRASHED (ship safe)',
    sandbox.gameState !== sandbox.STATES.CRASHED);
check('shielded hit: no explosion spawned (ship safe)',
    spawnExplosionCalls.length === 0);

// Flash particles should use the ProxiBlue blue (#1976D2).
var anyBlue = false;
for (var pi = 0; pi < sandbox.techdebtParticles.length; pi++) {
    if (sandbox.techdebtParticles[pi].color === sandbox.PROXIBLUE_COLOR) anyBlue = true;
}
check('shielded hit: blue particle burst spawned (PROXIBLUE_COLOR)',
    sandbox.techdebtParticles.length > 0 && anyBlue,
    'particles: ' + sandbox.techdebtParticles.length + ', anyBlue: ' + anyBlue);

// =========================================================================
// Shielded hit on MEDIUM awards MEDIUM points; SMALL awards SMALL.
// =========================================================================
resetScenario();
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 5;
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium'
}));
tick(0.001);
check('shielded hit on MEDIUM: awards TECHDEBT_POINTS_MEDIUM',
    sandbox.techdebtScore === sandbox.TECHDEBT_POINTS_MEDIUM
    && sandbox.score === sandbox.TECHDEBT_POINTS_MEDIUM);

resetScenario();
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 5;
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_SMALL, sizeTier: 'small'
}));
tick(0.001);
check('shielded hit on SMALL: awards TECHDEBT_POINTS_SMALL',
    sandbox.techdebtScore === sandbox.TECHDEBT_POINTS_SMALL
    && sandbox.score === sandbox.TECHDEBT_POINTS_SMALL);

// =========================================================================
// Shield only absorbs ONE hit — a second asteroid touching the ship on a
// later tick (shield now down) must route to CRASHED, not absorb again.
// =========================================================================
resetScenario();
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 5;
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_SMALL, sizeTier: 'small'
}));
tick(0.001);
check('first shielded hit consumed shield',
    sandbox.proxiblueShieldActive === false
    && sandbox.gameState !== sandbox.STATES.CRASHED);

sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_SMALL, sizeTier: 'small'
}));
tick(0.001);
check('second hit (shield already down) routes to CRASHED',
    sandbox.gameState === sandbox.STATES.CRASHED,
    'gameState: ' + sandbox.gameState);

// =========================================================================
// AC#3 — No shield: transition to STATES.CRASHED.
// AC#5 — Crash spawns the existing explosion particle effect (spawnExplosion).
// =========================================================================
resetScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large'
}));
tick(0.001);
check('unshielded hit: gameState transitions to CRASHED',
    sandbox.gameState === sandbox.STATES.CRASHED,
    'gameState: ' + sandbox.gameState);
check('unshielded hit: spawnExplosion called at ship position (AC#5)',
    spawnExplosionCalls.length === 1
    && Math.abs(spawnExplosionCalls[0].x - 400) < 1
    && Math.abs(spawnExplosionCalls[0].y - 300) < 1,
    'calls: ' + JSON.stringify(spawnExplosionCalls));
check('unshielded hit: startScreenShake called',
    startScreenShakeCalls === 1);
check('unshielded hit: playExplosionSound called',
    playExplosionSoundCalls === 1);
check('unshielded hit: landingResult set (so crash screen shows a reason)',
    typeof sandbox.landingResult === 'string' && sandbox.landingResult.length > 0,
    'landingResult: ' + sandbox.landingResult);
check('unshielded hit: ship velocity zeroed',
    sandbox.ship.vx === 0 && sandbox.ship.vy === 0);

// =========================================================================
// AC#4 — Partial techdebtScore accumulated stays in `score` after crash.
// Pre-load score + techdebtScore with some partial value; the crash must
// NOT subtract or clear those.
// =========================================================================
resetScenario();
sandbox.techdebtScore = 120;
sandbox.score = 120; // partial bonus already accumulated into global score
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large'
}));
tick(0.001);
check('partial techdebtScore preserved after crash (not reset)',
    sandbox.techdebtScore === 120,
    'techdebtScore: ' + sandbox.techdebtScore);
check('partial score preserved after crash (not reset)',
    sandbox.score === 120,
    'score: ' + sandbox.score);

// =========================================================================
// US-012: unshielded ship ramming a ProxiBlue asteroid still crashes — the
// player must shoot the ProxiBlue to collect it. Shielded ram passes through
// without consuming either the shield or the ProxiBlue.
// =========================================================================
resetScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    isProxiblue: true, label: 'ProxiBlue'
}));
tick(0.001);
check('unshielded ram on ProxiBlue still crashes the ship (AC#6)',
    sandbox.gameState === sandbox.STATES.CRASHED,
    'gameState: ' + sandbox.gameState);

resetScenario();
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = sandbox.PROXIBLUE_SHIELD_DURATION;
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    isProxiblue: true, label: 'ProxiBlue'
}));
tick(0.001);
check('shielded ram on ProxiBlue passes through — ship survives',
    sandbox.gameState !== sandbox.STATES.CRASHED,
    'gameState: ' + sandbox.gameState);
check('shielded ram on ProxiBlue leaves the ProxiBlue intact (must shoot it)',
    sandbox.techdebtAsteroids.length === 1
    && sandbox.techdebtAsteroids[0].isProxiblue === true);
check('shielded ram on ProxiBlue does NOT consume the shield',
    sandbox.proxiblueShieldActive === true);

// =========================================================================
// Flash timer decays over successive frames.
// =========================================================================
resetScenario();
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 5;
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_SMALL, sizeTier: 'small'
}));
tick(0.001);
var flashAfterHit = sandbox.proxiblueShieldFlashTimer;
for (var fr = 0; fr < 30; fr++) tick(0.016); // ~0.48s elapsed
check('blue flash timer decays over time',
    sandbox.proxiblueShieldFlashTimer < flashAfterHit,
    'before: ' + flashAfterHit + ', after: ' + sandbox.proxiblueShieldFlashTimer);
check('blue flash timer clamps at 0 (never negative)',
    sandbox.proxiblueShieldFlashTimer >= 0);

// =========================================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
