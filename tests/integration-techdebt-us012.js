// US-012 (Tech Debt Blaster): ProxiBlue power-up asteroid.
//
// Loads config.js + helper functions (setupTechdebtWorld,
// spawnTechdebtAsteroidParticles, splitTechdebtAsteroid, crashShipInTechdebt)
// + the TECHDEBT_PLAYING block + drawTechdebtAsteroid (render.js) into a vm
// sandbox and verifies all seven AC:
//   1. ProxiBlue asteroids have isProxiblue=true, glow color #4488ff, label
//      "ProxiBlue" in white text.
//   2. ProxiBlue asteroids are always MEDIUM size.
//   3. Bullet hit: no split, PROXIBLUE_POINTS awarded, shield activates.
//   4. Distinct activation sound (playProxiblueCollectSound) fires.
//   5. Blue particles burst from collection point.
//   6. Unshielded ship ram on ProxiBlue crashes the ship.
//   7. Shooting a second ProxiBlue while shielded resets the shield timer to
//      full PROXIBLUE_SHIELD_DURATION.
//
// Run:  node tests/integration-techdebt-us012.js
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

// --- Spies -----------------------------------------------------------------
var proxiblueSoundCalls = 0;
var shootSoundCalls = 0;
var spawnExplosionCalls = [];
var startScreenShakeCalls = 0;
var playExplosionSoundCalls = 0;
var stopThrustSoundCalls = 0;

// --- A tiny mock canvas 2D context that records fillText/shadowColor --------
function makeMockCtx() {
    var calls = { fillText: [], shadowColor: [], fillStyle: [], strokeStyle: [] };
    return {
        calls: calls,
        save: function () {}, restore: function () {},
        translate: function () {}, rotate: function () {},
        beginPath: function () {}, closePath: function () {},
        moveTo: function () {}, lineTo: function () {},
        fill: function () {}, stroke: function () {},
        arc: function () {}, fillRect: function () {},
        set fillStyle(v) { calls.fillStyle.push(v); },
        set strokeStyle(v) { calls.strokeStyle.push(v); },
        set shadowColor(v) { calls.shadowColor.push(v); },
        shadowBlur: 0, lineWidth: 1, globalAlpha: 1,
        font: '', textAlign: '', textBaseline: '',
        fillText: function (text, x, y) { calls.fillText.push({ text: text, x: x, y: y }); }
    };
}

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
    playTechdebtShootSound: function () { shootSoundCalls++; },
    playProxiblueCollectSound: function () { proxiblueSoundCalls++; },
    playProxiblueShieldDeactivateSound: function () {},
    crashShipInTechdebt: null, // loaded from update.js
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
    drawTerrain: function () {}, drawStars: function () {}, drawShip: function () {}
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

// --- Brace-walk extract -----------------------------------------------------
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

var updateSrc = loadFile('js/update.js');
var renderSrc = loadFile('js/render.js');

vm.runInContext(extractBlock(updateSrc, 'function setupTechdebtWorld() {'), sandbox);
vm.runInContext(extractBlock(updateSrc, 'function spawnTechdebtAsteroidParticles('), sandbox);
vm.runInContext(extractBlock(updateSrc, 'function splitTechdebtAsteroid('), sandbox);
vm.runInContext(extractBlock(updateSrc, 'function crashShipInTechdebt('), sandbox);
vm.runInContext(extractBlock(renderSrc, 'function drawTechdebtAsteroid('), sandbox);

var playSrc = extractBlock(updateSrc, 'if (gameState === STATES.TECHDEBT_PLAYING) {');
var playReplay = new vm.Script('(function () {\n' + playSrc + '\n}).call(this);',
    { filename: 'techdebt-playing-extracted' });

// --- Helpers ----------------------------------------------------------------
function freshShip(over) {
    var s = {
        x: 400, y: 300, vx: 0, vy: 0,
        angle: 0,
        rotationSpeed: sandbox.ROTATION_SPEED,
        thrusting: false, rotating: null,
        fuel: 0  // zero fuel → no fuel bonus if round completes
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
    sandbox.techdebtBulletCooldownTimer = 0;
    sandbox.proxiblueShieldActive = false;
    sandbox.proxiblueShieldTimer = 0;
    sandbox.proxiblueShieldFlashTimer = 0;
    sandbox.landingResult = null;
    sandbox.ship = freshShip();
    sandbox.keys = {};
    proxiblueSoundCalls = 0;
    shootSoundCalls = 0;
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
        rotation: 0, rotationSpeed: 0
    };
}
function tick(dt) {
    sandbox.dt = (dt === undefined ? 0.016 : dt);
    sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
    playReplay.runInContext(sandbox);
}

// =============================================================================
// AC#1 — ProxiBlue asteroids have isProxiblue=true, glow color #4488ff, label
// "ProxiBlue" in white text.
// =============================================================================
sandbox.currentLevel = 0;

// Find a ProxiBlue asteroid in the spawned field — retry a few rounds if the
// RNG doesn't land one (12.5% rate × ~6 asteroids → ~55% odds per trial).
var foundProxi = null;
for (var trial = 0; trial < 20 && !foundProxi; trial++) {
    sandbox.setupTechdebtWorld();
    for (var ai = 0; ai < sandbox.techdebtAsteroids.length; ai++) {
        if (sandbox.techdebtAsteroids[ai].isProxiblue) { foundProxi = sandbox.techdebtAsteroids[ai]; break; }
    }
}
check('AC#1: setupTechdebtWorld eventually spawns a ProxiBlue asteroid',
    foundProxi !== null);
check('AC#1: ProxiBlue asteroid has isProxiblue = true',
    foundProxi && foundProxi.isProxiblue === true);
check('AC#1: ProxiBlue asteroid label is "ProxiBlue"',
    foundProxi && foundProxi.label === 'ProxiBlue',
    'label: ' + (foundProxi && foundProxi.label));

// Render the ProxiBlue and inspect the mock ctx — glow should be #4488ff
// (case-insensitive match — allow "#4488FF" too) and label fill should be
// pure white (#FFFFFF or "white").
sandbox.ctx = makeMockCtx();
sandbox.drawTechdebtAsteroid(foundProxi);
var glowCorrect = sandbox.ctx.calls.shadowColor.some(function (c) {
    return typeof c === 'string' && c.toLowerCase() === '#4488ff';
});
check('AC#1: ProxiBlue renders with blue glow #4488ff (shadowColor)',
    glowCorrect,
    'shadowColors: ' + JSON.stringify(sandbox.ctx.calls.shadowColor));

var labelWritten = sandbox.ctx.calls.fillText.some(function (c) { return c.text === 'ProxiBlue'; });
check('AC#1: ProxiBlue label "ProxiBlue" is drawn on the asteroid', labelWritten);

// The last fillStyle set before the fillText call is the label colour. We
// record every fillStyle write; the one immediately preceding the fillText
// with text === 'ProxiBlue' is the label fill. Pure white accepted as
// '#FFFFFF', '#ffffff', or the literal 'white'.
// Find the final fillStyle written (drawTechdebtAsteroid sets fill, stroke,
// then label fill in that order — the label is the last fillStyle write).
var labelFill = sandbox.ctx.calls.fillStyle[sandbox.ctx.calls.fillStyle.length - 1];
var labelIsWhite = typeof labelFill === 'string'
    && (labelFill.toLowerCase() === '#ffffff' || labelFill.toLowerCase() === 'white');
check('AC#1: ProxiBlue label is drawn in white (last fillStyle before label fillText)',
    labelIsWhite,
    'last fillStyle: ' + labelFill);

// =============================================================================
// AC#2 — ProxiBlue asteroids are always MEDIUM size.
// =============================================================================
var allProxisMedium = true;
var totalProxis = 0;
for (var trial2 = 0; trial2 < 30; trial2++) {
    sandbox.currentLevel = 5; // more asteroids per level → more samples
    sandbox.setupTechdebtWorld();
    for (var a2 = 0; a2 < sandbox.techdebtAsteroids.length; a2++) {
        var ast2 = sandbox.techdebtAsteroids[a2];
        if (ast2.isProxiblue) {
            totalProxis++;
            if (ast2.sizeTier !== 'medium' || ast2.size !== sandbox.TECHDEBT_SIZE_MEDIUM) {
                allProxisMedium = false;
            }
        }
    }
}
check('AC#2: enough ProxiBlue samples observed to evaluate size (>5)',
    totalProxis > 5,
    'sampled: ' + totalProxis);
check('AC#2: every ProxiBlue asteroid is MEDIUM size (tier + size)',
    allProxisMedium,
    'total ProxiBlues inspected: ' + totalProxis);

// =============================================================================
// AC#3 — Bullet hit on ProxiBlue: asteroid removed, PROXIBLUE_POINTS awarded,
// shield active, shield timer = PROXIBLUE_SHIELD_DURATION. Does NOT split.
// =============================================================================
resetScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    isProxiblue: true, label: 'ProxiBlue'
}));
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: 0, age: 0 });
tick(0.001);

check('AC#3: ProxiBlue asteroid removed after bullet hit',
    sandbox.techdebtAsteroids.length === 0,
    'remaining: ' + sandbox.techdebtAsteroids.length);
check('AC#3: PROXIBLUE_POINTS awarded to techdebtScore',
    sandbox.techdebtScore === sandbox.PROXIBLUE_POINTS,
    'techdebtScore: ' + sandbox.techdebtScore);
check('AC#3: PROXIBLUE_POINTS awarded to global score',
    sandbox.score === sandbox.PROXIBLUE_POINTS,
    'score: ' + sandbox.score);
check('AC#3: proxiblueShieldActive = true after collection',
    sandbox.proxiblueShieldActive === true);
check('AC#3: proxiblueShieldTimer set to PROXIBLUE_SHIELD_DURATION on collection (decremented by one tick of 0.001s)',
    Math.abs(sandbox.proxiblueShieldTimer - (sandbox.PROXIBLUE_SHIELD_DURATION - 0.001)) < 1e-6,
    'timer: ' + sandbox.proxiblueShieldTimer);
check('AC#3: ProxiBlue hit does NOT increment asteroidsDestroyed (it is a collect)',
    sandbox.asteroidsDestroyed === 0);
check('AC#3: bullet consumed after ProxiBlue collection',
    sandbox.techdebtBullets.length === 0);

// =============================================================================
// AC#4 — Distinct activation sound plays when ProxiBlue is collected.
// =============================================================================
resetScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    isProxiblue: true, label: 'ProxiBlue'
}));
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: 0, age: 0 });
tick(0.001);
check('AC#4: playProxiblueCollectSound called exactly once on collection',
    proxiblueSoundCalls === 1,
    'calls: ' + proxiblueSoundCalls);
check('AC#4: playProxiblueCollectSound exists on the audio module',
    typeof loadFile('js/audio.js') === 'string'
    && loadFile('js/audio.js').indexOf('function playProxiblueCollectSound(') > -1);

// =============================================================================
// AC#5 — Blue particles burst outward from collection point.
// =============================================================================
resetScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    isProxiblue: true, label: 'ProxiBlue'
}));
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: 0, age: 0 });
tick(0.001);

check('AC#5: particle burst spawned at collection',
    sandbox.techdebtParticles.length >= 4 && sandbox.techdebtParticles.length <= 8,
    'particles: ' + sandbox.techdebtParticles.length);

// All spawned particles should be blue (#4488ff).
var allBlue = sandbox.techdebtParticles.length > 0;
for (var p5 = 0; p5 < sandbox.techdebtParticles.length; p5++) {
    if (sandbox.techdebtParticles[p5].color.toLowerCase() !== '#4488ff') allBlue = false;
}
check('AC#5: all ProxiBlue burst particles coloured #4488ff',
    allBlue);

// Particles should be spawned at the collection point (the asteroid's pos).
// The collision point was (400, 300) — every particle should start there
// (they've moved by vx*dt during this first tick's particle update, but
// our tick used dt=0.001 so displacement is negligible — particles also
// update in the same tick, so they've drifted by up to ~200*0.001 = 0.2px).
var allAtOrigin = true;
for (var p6 = 0; p6 < sandbox.techdebtParticles.length; p6++) {
    var ppp = sandbox.techdebtParticles[p6];
    if (Math.abs(ppp.x - 400) > 1 || Math.abs(ppp.y - 300) > 1) { allAtOrigin = false; break; }
}
check('AC#5: burst particles spawn at the collection point (400, 300) within 1px tolerance',
    allAtOrigin);

// Particles should have non-zero velocity in at least 2 distinct directions
// (burst "outward", not a single-direction stream). Compute the set of
// quadrants covered — expect at least 2 for a legitimate outward burst.
var quadrants = {};
for (var p7 = 0; p7 < sandbox.techdebtParticles.length; p7++) {
    var pp = sandbox.techdebtParticles[p7];
    var qx = pp.vx >= 0 ? 'R' : 'L';
    var qy = pp.vy >= 0 ? 'D' : 'U';
    quadrants[qx + qy] = true;
}
check('AC#5: particles burst outward (cover at least 2 quadrants)',
    Object.keys(quadrants).length >= 2,
    'quadrants: ' + Object.keys(quadrants).join(','));

// =============================================================================
// AC#6 — Unshielded ship ramming ProxiBlue crashes the ship.
// =============================================================================
resetScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    isProxiblue: true, label: 'ProxiBlue'
}));
sandbox.proxiblueShieldActive = false;
tick(0.001);

check('AC#6: unshielded ram on ProxiBlue → gameState = CRASHED',
    sandbox.gameState === sandbox.STATES.CRASHED,
    'gameState: ' + sandbox.gameState);
check('AC#6: unshielded ProxiBlue ram invokes crash FX (spawnExplosion)',
    spawnExplosionCalls.length === 1);
check('AC#6: unshielded ProxiBlue ram invokes screen shake',
    startScreenShakeCalls === 1);
check('AC#6: unshielded ProxiBlue ram plays explosion sound',
    playExplosionSoundCalls === 1);
check('AC#6: unshielded ProxiBlue ram does NOT activate shield (you crashed)',
    sandbox.proxiblueShieldActive === false);
check('AC#6: unshielded ProxiBlue ram does NOT award PROXIBLUE_POINTS',
    sandbox.techdebtScore === 0
    && sandbox.score === 0,
    'techdebtScore: ' + sandbox.techdebtScore + ', score: ' + sandbox.score);

// =============================================================================
// AC#6 (cont.) — Shielded ram on ProxiBlue passes through: you still must
// SHOOT it to collect (ProxiBlue is preserved, shield intact).
// =============================================================================
resetScenario();
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 5;
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    isProxiblue: true, label: 'ProxiBlue'
}));
tick(0.001);

check('AC#6: shielded ram on ProxiBlue does NOT crash ship',
    sandbox.gameState !== sandbox.STATES.CRASHED,
    'gameState: ' + sandbox.gameState);
check('AC#6: shielded ram on ProxiBlue leaves ProxiBlue alive (must shoot to collect)',
    sandbox.techdebtAsteroids.length === 1
    && sandbox.techdebtAsteroids[0].isProxiblue === true);
check('AC#6: shielded ram on ProxiBlue does NOT consume shield',
    sandbox.proxiblueShieldActive === true);

// =============================================================================
// AC#7 — Shooting a second ProxiBlue while shielded resets the timer to
// PROXIBLUE_SHIELD_DURATION (full refresh, not additive).
// =============================================================================
resetScenario();
// Stage: shield already active and partly depleted (say 2s remaining).
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 2;
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    isProxiblue: true, label: 'ProxiBlue'
}));
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: 0, age: 0 });
tick(0.001);

check('AC#7: second ProxiBlue while shielded → shield still active',
    sandbox.proxiblueShieldActive === true);
check('AC#7: second ProxiBlue refresh resets timer to ~PROXIBLUE_SHIELD_DURATION (not additive)',
    // One tick of 0.001s decay applies after the refresh.
    Math.abs(sandbox.proxiblueShieldTimer - (sandbox.PROXIBLUE_SHIELD_DURATION - 0.001)) < 1e-6,
    'timer: ' + sandbox.proxiblueShieldTimer + ', expected ~' + (sandbox.PROXIBLUE_SHIELD_DURATION - 0.001));
check('AC#7: refresh is not additive — timer must not exceed PROXIBLUE_SHIELD_DURATION',
    sandbox.proxiblueShieldTimer <= sandbox.PROXIBLUE_SHIELD_DURATION + 1e-9);
check('AC#7: second ProxiBlue awards PROXIBLUE_POINTS (collection still pays out)',
    sandbox.techdebtScore === sandbox.PROXIBLUE_POINTS);
check('AC#7: second ProxiBlue removed after collection',
    sandbox.techdebtAsteroids.length === 0);

// =============================================================================
// Bonus: shield timer decays over time and eventually expires, deactivating
// proxiblueShieldActive. AC#7 implicitly requires a finite shield lifetime.
// =============================================================================
resetScenario();
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 0.1;
tick(0.05);
check('shield timer decays per tick',
    Math.abs(sandbox.proxiblueShieldTimer - 0.05) < 1e-6,
    'timer: ' + sandbox.proxiblueShieldTimer);
tick(0.2); // drives timer below 0 → deactivates
check('shield deactivates when timer reaches 0',
    sandbox.proxiblueShieldActive === false
    && sandbox.proxiblueShieldTimer === 0,
    'active: ' + sandbox.proxiblueShieldActive + ', timer: ' + sandbox.proxiblueShieldTimer);

// =============================================================================
// Bonus: bullet hit on ProxiBlue does NOT spawn split children (ProxiBlue
// does NOT split per AC#3). Regression guard against a refactor that lets
// ProxiBlues fall through to the split branch.
// =============================================================================
resetScenario();
sandbox.techdebtAsteroids.push(makeAsteroid({
    x: 400, y: 300, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    isProxiblue: true, label: 'ProxiBlue'
}));
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: 0, age: 0 });
tick(0.001);
check('ProxiBlue bullet hit does NOT spawn split children (array must be empty, not 2)',
    sandbox.techdebtAsteroids.length === 0,
    'remaining: ' + sandbox.techdebtAsteroids.length);

// --- Summary ---
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
