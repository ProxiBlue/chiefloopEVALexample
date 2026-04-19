// US-008 (Tech Debt Blaster): Bullet vs asteroid collision + splitting.
//
// Loads config.js + helper functions (setupTechdebtWorld,
// spawnTechdebtAsteroidParticles, splitTechdebtAsteroid) + the TECHDEBT_PLAYING
// block from js/update.js into a vm sandbox and verifies all six AC:
//   1. Bullet-vs-asteroid collision uses circle-circle (point vs radius).
//   2. On hit: large -> 2 medium, medium -> 2 small, small -> destroyed.
//   3. Points added to BOTH techdebtScore AND global score.
//      asteroidsDestroyed increments.
//   4. Destroyed/split asteroids spawn a 4-8 particle burst (asteroid colour).
//   5. The bullet is consumed (removed) on hit.
//   6. ProxiBlue asteroids do NOT split.
//
// Run:  node tests/integration-techdebt-us008.js
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
    crashShipInTechdebt: function () {},
    spawnExplosion: function () {},
    startScreenShake: function () {},
    playExplosionSound: function () {},
    spawnCelebration: function () {},
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

check('setupTechdebtWorld loaded', typeof sandbox.setupTechdebtWorld === 'function');
check('spawnTechdebtAsteroidParticles loaded', typeof sandbox.spawnTechdebtAsteroidParticles === 'function');
check('splitTechdebtAsteroid loaded', typeof sandbox.splitTechdebtAsteroid === 'function');

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

// Reset shared globals between scenarios.
function resetCollisionScenario() {
    sandbox.techdebtAsteroids = [];
    sandbox.techdebtBullets = [];
    sandbox.techdebtParticles = [];
    sandbox.techdebtScore = 0;
    sandbox.score = 0;
    sandbox.asteroidsDestroyed = 0;
    sandbox.techdebtBulletCooldownTimer = 0;
    sandbox.ship = freshShip();
    // Zero fuel so the US-010 win-condition fuel bonus (Math.round((fuel/FUEL_MAX)*200))
    // evaluates to 0 — this test asserts tier point awards, not fuel bonus.
    sandbox.ship.fuel = 0;
    sandbox.keys = {};
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
// AC#1 + AC#2 (large) + AC#3 + AC#4 + AC#5 — single bullet hits a large.
// =========================================================================
resetCollisionScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large'
}));
sandbox.techdebtBullets.push({
    x: 400, y: 300, vx: 0, vy: 0, age: 0
});
tick(0.001); // tiny dt so movement does not displace anything significant
check('bullet inside large asteroid radius is detected as a hit',
    sandbox.techdebtAsteroids.length === 2 // 2 medium children, original gone
    && sandbox.techdebtBullets.length === 0,
    'asteroids: ' + sandbox.techdebtAsteroids.length
    + ', bullets: ' + sandbox.techdebtBullets.length);
check('hit on large -> spawns 2 medium asteroids',
    sandbox.techdebtAsteroids.length === 2
    && sandbox.techdebtAsteroids[0].sizeTier === 'medium'
    && sandbox.techdebtAsteroids[1].sizeTier === 'medium',
    'tiers: ' + sandbox.techdebtAsteroids.map(function (x) { return x.sizeTier; }).join(','));
check('medium children have TECHDEBT_SIZE_MEDIUM radius',
    sandbox.techdebtAsteroids[0].size === sandbox.TECHDEBT_SIZE_MEDIUM
    && sandbox.techdebtAsteroids[1].size === sandbox.TECHDEBT_SIZE_MEDIUM);
check('large hit awards TECHDEBT_POINTS_LARGE to techdebtScore AND global score',
    sandbox.techdebtScore === sandbox.TECHDEBT_POINTS_LARGE
    && sandbox.score === sandbox.TECHDEBT_POINTS_LARGE,
    'techdebtScore: ' + sandbox.techdebtScore + ', score: ' + sandbox.score);
check('asteroidsDestroyed incremented by 1 on large hit',
    sandbox.asteroidsDestroyed === 1);
check('bullet was consumed on hit',
    sandbox.techdebtBullets.length === 0);
check('hit spawned 4-8 particles',
    sandbox.techdebtParticles.length >= 4
    && sandbox.techdebtParticles.length <= 8,
    'particles: ' + sandbox.techdebtParticles.length);
// Asteroid colour for non-ProxiBlue is '#5D4037' (brown — see render.js
// drawTechdebtAsteroid). Particles must use this colour.
var allBrown = true;
for (var pi = 0; pi < sandbox.techdebtParticles.length; pi++) {
    if (sandbox.techdebtParticles[pi].color !== '#5D4037') allBrown = false;
}
check('particles use the asteroid colour (#5D4037)', allBrown);

// =========================================================================
// AC#2 (medium) — a medium hit spawns 2 small.
// =========================================================================
resetCollisionScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium'
}));
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: 0, age: 0 });
tick(0.001);
check('hit on medium -> spawns 2 small asteroids',
    sandbox.techdebtAsteroids.length === 2
    && sandbox.techdebtAsteroids[0].sizeTier === 'small'
    && sandbox.techdebtAsteroids[1].sizeTier === 'small');
check('small children have TECHDEBT_SIZE_SMALL radius',
    sandbox.techdebtAsteroids[0].size === sandbox.TECHDEBT_SIZE_SMALL
    && sandbox.techdebtAsteroids[1].size === sandbox.TECHDEBT_SIZE_SMALL);
check('medium hit awards TECHDEBT_POINTS_MEDIUM',
    sandbox.techdebtScore === sandbox.TECHDEBT_POINTS_MEDIUM
    && sandbox.score === sandbox.TECHDEBT_POINTS_MEDIUM);

// =========================================================================
// AC#2 (small) — small hit destroys with no children.
// =========================================================================
resetCollisionScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_SMALL, sizeTier: 'small'
}));
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: 0, age: 0 });
tick(0.001);
check('hit on small -> NO children (asteroid removed)',
    sandbox.techdebtAsteroids.length === 0,
    'remaining: ' + sandbox.techdebtAsteroids.length);
check('small hit awards TECHDEBT_POINTS_SMALL',
    sandbox.techdebtScore === sandbox.TECHDEBT_POINTS_SMALL
    && sandbox.score === sandbox.TECHDEBT_POINTS_SMALL);

// =========================================================================
// AC#1 — circle-circle distance check: a bullet just inside the radius hits,
// a bullet just outside does NOT.
// =========================================================================
// Just inside (radius - 0.5): hit.
resetCollisionScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large'
}));
sandbox.techdebtBullets.push({
    x: 400 + sandbox.TECHDEBT_SIZE_LARGE - 0.5, y: 300, vx: 0, vy: 0, age: 0
});
tick(0.001);
check('bullet just inside asteroid radius (radius - 0.5) registers a hit',
    sandbox.asteroidsDestroyed === 1);

// Just outside (radius + 0.5): no hit.
resetCollisionScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large'
}));
sandbox.techdebtBullets.push({
    x: 400 + sandbox.TECHDEBT_SIZE_LARGE + 0.5, y: 300, vx: 0, vy: 0, age: 0
});
tick(0.001);
check('bullet just outside asteroid radius (radius + 0.5) does NOT register a hit',
    sandbox.asteroidsDestroyed === 0
    && sandbox.techdebtBullets.length === 1
    && sandbox.techdebtAsteroids.length === 1);

// =========================================================================
// AC#5 — bullet ABOVE the asteroid (vertical separation > radius) misses.
// Sanity-check the y-axis distance term.
// =========================================================================
resetCollisionScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large'
}));
sandbox.techdebtBullets.push({
    x: 400, y: 300 - sandbox.TECHDEBT_SIZE_LARGE - 5, vx: 0, vy: 0, age: 0
});
tick(0.001);
check('bullet vertically above (gap > radius) does NOT hit',
    sandbox.asteroidsDestroyed === 0);

// =========================================================================
// AC#6 — ProxiBlue asteroids do NOT split. A bullet at the same position as
// a ProxiBlue asteroid must leave the asteroid intact AND keep the bullet
// alive (US-008 defers all ProxiBlue handling to US-012).
// =========================================================================
resetCollisionScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large',
    isProxiblue: true, label: 'ProxiBlue'
}));
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: 0, age: 0 });
tick(0.001);
check('ProxiBlue asteroid is NOT destroyed by bullet (no split)',
    sandbox.techdebtAsteroids.length === 1
    && sandbox.techdebtAsteroids[0].isProxiblue === true,
    'remaining asteroids: ' + sandbox.techdebtAsteroids.length);
check('ProxiBlue collision does NOT increment score / asteroidsDestroyed',
    sandbox.techdebtScore === 0
    && sandbox.score === 0
    && sandbox.asteroidsDestroyed === 0);

// =========================================================================
// One bullet should only consume ONE asteroid even if multiple overlap.
// =========================================================================
resetCollisionScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_SMALL, sizeTier: 'small'
}));
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_SMALL, sizeTier: 'small'
}));
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: 0, age: 0 });
tick(0.001);
check('a single bullet destroys exactly ONE asteroid even when overlapping',
    sandbox.asteroidsDestroyed === 1
    && sandbox.techdebtAsteroids.length === 1
    && sandbox.techdebtBullets.length === 0);

// =========================================================================
// Particles fade and expire over time (4-8 short-lived particles per AC#4).
// =========================================================================
resetCollisionScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large'
}));
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: 0, age: 0 });
tick(0.001);
var particlesRightAfter = sandbox.techdebtParticles.length;
check('particles spawned within 4-8 inclusive',
    particlesRightAfter >= 4 && particlesRightAfter <= 8);
// Run forward 1 second of frames — particle lifetimes max out at ~0.6s, so
// all should be expired well before then.
for (var fr = 0; fr < 75; fr++) tick(0.016); // ~1.2s elapsed
check('all hit-burst particles expire within ~1.2s',
    sandbox.techdebtParticles.length === 0,
    'remaining: ' + sandbox.techdebtParticles.length);

// =========================================================================
// Cumulative score after destroying multiple asteroids.
// =========================================================================
resetCollisionScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 100, y: 100, size: sandbox.TECHDEBT_SIZE_SMALL, sizeTier: 'small'
}));
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 500, y: 500, size: sandbox.TECHDEBT_SIZE_SMALL, sizeTier: 'small'
}));
sandbox.techdebtBullets.push({ x: 100, y: 100, vx: 0, vy: 0, age: 0 });
sandbox.techdebtBullets.push({ x: 500, y: 500, vx: 0, vy: 0, age: 0 });
tick(0.001);
check('two simultaneous hits award cumulative score',
    sandbox.techdebtScore === 2 * sandbox.TECHDEBT_POINTS_SMALL
    && sandbox.score === 2 * sandbox.TECHDEBT_POINTS_SMALL,
    'techdebtScore: ' + sandbox.techdebtScore + ', score: ' + sandbox.score);
check('two simultaneous hits both increment asteroidsDestroyed',
    sandbox.asteroidsDestroyed === 2);

// =========================================================================
// Splitting children do not also split on the same frame (avoid cascade
// from 1 bullet -> 7 destruction events). The remaining bullet count is the
// best proxy: only one bullet was fired, so only one tier transition occurs.
// =========================================================================
resetCollisionScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large'
}));
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: 0, age: 0 });
tick(0.001);
check('large hit produces exactly 2 children (no cascade splits)',
    sandbox.techdebtAsteroids.length === 2
    && sandbox.asteroidsDestroyed === 1);

// =========================================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
