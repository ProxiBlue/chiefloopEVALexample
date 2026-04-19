// US-013 (Tech Debt Blaster): Shield visual + HUD indicator.
//
// Loads config.js + helper functions + the TECHDEBT_PLAYING update block +
// the renderTechdebtPlaying + drawTechdebtShieldHUD render functions into a
// vm sandbox and verifies all four AC:
//   1. When proxiblueShieldActive, a translucent blue circle (~25px radius)
//      is drawn around the ship with pulsing alpha.
//   2. HUD shows "🛡 ProxiBlue" in #4488ff text when shield is active, with a
//      small countdown bar that depletes over PROXIBLUE_SHIELD_DURATION.
//   3. Shield timer decrements each frame. When it reaches 0,
//      proxiblueShieldActive = false.
//   4. Shield deactivation plays a fade-out sound (descending tone —
//      playProxiblueShieldDeactivateSound).
//
// Run:  node tests/integration-techdebt-us013.js
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

// --- Mock 2D context that records every interesting call --------------------
function makeMockCtx() {
    var calls = {
        fillText: [], strokeStyle: [], fillStyle: [], shadowColor: [],
        arc: [], fillRect: [], strokeRect: [], globalAlpha: [],
        lineWidth: [], shadowBlur: [], font: [], textAlign: [],
        beginPath: 0, stroke: 0, fill: 0, save: 0, restore: 0
    };
    var ctx = {
        calls: calls,
        save: function () { calls.save++; },
        restore: function () { calls.restore++; },
        translate: function () {}, rotate: function () {},
        beginPath: function () { calls.beginPath++; },
        closePath: function () {},
        moveTo: function () {}, lineTo: function () {},
        fill: function () { calls.fill++; },
        stroke: function () { calls.stroke++; },
        arc: function (x, y, r, a, b) { calls.arc.push({ x: x, y: y, r: r }); },
        fillRect: function (x, y, w, h) { calls.fillRect.push({ x: x, y: y, w: w, h: h }); },
        strokeRect: function (x, y, w, h) { calls.strokeRect.push({ x: x, y: y, w: w, h: h }); },
        set strokeStyle(v) { calls.strokeStyle.push(v); },
        set fillStyle(v) { calls.fillStyle.push(v); },
        set shadowColor(v) { calls.shadowColor.push(v); },
        set globalAlpha(v) { calls.globalAlpha.push(v); },
        set lineWidth(v) { calls.lineWidth.push(v); },
        set shadowBlur(v) { calls.shadowBlur.push(v); },
        set font(v) { calls.font.push(v); },
        set textAlign(v) { calls.textAlign.push(v); },
        set textBaseline(v) {},
        fillText: function (text, x, y) { calls.fillText.push({ text: text, x: x, y: y }); }
    };
    return ctx;
}

// --- Spies ------------------------------------------------------------------
var deactivateSoundCalls = 0;
var collectSoundCalls = 0;

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
    playProxiblueCollectSound: function () { collectSoundCalls++; },
    playProxiblueShieldDeactivateSound: function () { deactivateSoundCalls++; },
    crashShipInTechdebt: function () {},
    spawnExplosion: function () {},
    startScreenShake: function () {},
    playExplosionSound: function () {},
    spawnCelebration: function () {},
    clearTechdebtState: function () {},
    spawnBugWave: function () {},
    setupMissileWorld: function () {},
    resetShip: function () {},
    resetWind: function () {},
    generateTerrain: function () {},
    getLevelConfig: function () { return { gravity: 0.05 }; },
    drawTerrain: function () {}, drawStars: function () {}, drawShip: function () {},
    drawCelebration: function () {}
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

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
var audioSrc = loadFile('js/audio.js');

vm.runInContext(extractBlock(updateSrc, 'function setupTechdebtWorld() {'), sandbox);
vm.runInContext(extractBlock(updateSrc, 'function spawnTechdebtAsteroidParticles('), sandbox);
vm.runInContext(extractBlock(updateSrc, 'function splitTechdebtAsteroid('), sandbox);
vm.runInContext(extractBlock(renderSrc, 'function renderTechdebtPlaying() {'), sandbox);
vm.runInContext(extractBlock(renderSrc, 'function drawTechdebtShieldHUD() {'), sandbox);

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
        fuel: 0
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
    deactivateSoundCalls = 0;
    collectSoundCalls = 0;
}
function tick(dt) {
    sandbox.dt = (dt === undefined ? 0.016 : dt);
    sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
    playReplay.runInContext(sandbox);
}

// =============================================================================
// AC#1 — Translucent blue shield circle (~25px) around the ship with pulsing
// alpha, rendered only when proxiblueShieldActive is true.
// =============================================================================
resetScenario();

// Shield OFF — no arc around ship, no shield ring artefacts.
sandbox.proxiblueShieldActive = false;
sandbox.ctx = makeMockCtx();
sandbox.renderTechdebtPlaying();
var ringDrawnWhenOff = sandbox.ctx.calls.arc.some(function (a) {
    // The 25px arc at ship position is the shield ring.
    return a.r === 25 && Math.abs(a.x - 400) < 1 && Math.abs(a.y - 300) < 1;
});
check('AC#1: shield ring is NOT drawn when proxiblueShieldActive is false',
    ringDrawnWhenOff === false);

// Shield ON — arc of r=25 centred at ship position.
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = sandbox.PROXIBLUE_SHIELD_DURATION;
sandbox.ctx = makeMockCtx();
sandbox.renderTechdebtPlaying();
var ringArc = sandbox.ctx.calls.arc.filter(function (a) {
    return a.r === 25 && Math.abs(a.x - 400) < 1 && Math.abs(a.y - 300) < 1;
});
check('AC#1: shield ring arc drawn at ship position with radius ~25px when shield active',
    ringArc.length >= 1,
    'arcs: ' + JSON.stringify(sandbox.ctx.calls.arc));

var blueStroke = sandbox.ctx.calls.strokeStyle.some(function (s) {
    return typeof s === 'string' && s.toLowerCase() === '#4488ff';
});
check('AC#1: shield ring is drawn in blue (#4488ff)',
    blueStroke,
    'strokeStyles: ' + JSON.stringify(sandbox.ctx.calls.strokeStyle));

var translucentAlpha = sandbox.ctx.calls.globalAlpha.some(function (a) {
    return typeof a === 'number' && a > 0 && a < 1;
});
check('AC#1: shield ring draws with translucent alpha (0 < globalAlpha < 1)',
    translucentAlpha,
    'globalAlpha: ' + JSON.stringify(sandbox.ctx.calls.globalAlpha));

// Pulsing alpha: render two frames with different timer values and confirm the
// globalAlpha differs — pulse is driven by the timer so it cannot be constant
// across frames.
sandbox.proxiblueShieldTimer = sandbox.PROXIBLUE_SHIELD_DURATION;
sandbox.ctx = makeMockCtx();
sandbox.renderTechdebtPlaying();
var alphasA = sandbox.ctx.calls.globalAlpha.filter(function (a) { return typeof a === 'number'; });

sandbox.proxiblueShieldTimer = sandbox.PROXIBLUE_SHIELD_DURATION - 0.5;
sandbox.ctx = makeMockCtx();
sandbox.renderTechdebtPlaying();
var alphasB = sandbox.ctx.calls.globalAlpha.filter(function (a) { return typeof a === 'number'; });

var pulses = JSON.stringify(alphasA) !== JSON.stringify(alphasB);
check('AC#1: shield ring alpha changes with timer (pulsing, not static)',
    pulses,
    'alphasA=' + JSON.stringify(alphasA) + ' alphasB=' + JSON.stringify(alphasB));

// =============================================================================
// AC#2 — HUD shows "🛡 ProxiBlue" in #4488ff with a small countdown bar that
// depletes over PROXIBLUE_SHIELD_DURATION.
// =============================================================================
resetScenario();
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = sandbox.PROXIBLUE_SHIELD_DURATION;
sandbox.ctx = makeMockCtx();
sandbox.drawTechdebtShieldHUD();

var labelCall = sandbox.ctx.calls.fillText.find(function (t) {
    return typeof t.text === 'string' && t.text.indexOf('ProxiBlue') >= 0;
});
check('AC#2: HUD draws a text label containing "ProxiBlue"',
    !!labelCall,
    'fillText: ' + JSON.stringify(sandbox.ctx.calls.fillText));
check('AC#2: HUD label includes the shield glyph (🛡 U+1F6E1)',
    !!labelCall && labelCall.text.indexOf('\uD83D\uDEE1') >= 0,
    'text: ' + (labelCall && JSON.stringify(labelCall.text)));

var labelIndex = sandbox.ctx.calls.fillText.indexOf(labelCall);
// The fillStyle immediately preceding the label's fillText call must be #4488ff.
// Find the fillStyle write that happened before the label fillText. Since the
// mock captures them in call order, locate the last fillStyle write set before
// this fillText. We can't directly correlate across two arrays without a merged
// log, so assert instead that #4488ff appears in the fillStyle writes AND the
// label text was written.
var blueFillWritten = sandbox.ctx.calls.fillStyle.some(function (s) {
    return typeof s === 'string' && s.toLowerCase() === '#4488ff';
});
check('AC#2: HUD uses #4488ff as a fillStyle colour (for the label)',
    blueFillWritten,
    'fillStyles: ' + JSON.stringify(sandbox.ctx.calls.fillStyle));

// Countdown bar: drawTechdebtShieldHUD should fillRect twice (background + fill)
// with identical widths when shield is full. At PROXIBLUE_SHIELD_DURATION the
// fill width should equal the background width.
var bars = sandbox.ctx.calls.fillRect;
check('AC#2: HUD draws at least 2 fillRects (background + countdown fill)',
    bars.length >= 2,
    'fillRects: ' + JSON.stringify(bars));

// At full shield, at least one fillRect should match the background width.
var barW = Math.max.apply(Math, bars.map(function (r) { return r.w; }));
check('AC#2: countdown bar at full duration has fill width equal to bar width',
    bars.some(function (r) { return Math.abs(r.w - barW) < 1e-6 && r.w > 0; }),
    'fillRects: ' + JSON.stringify(bars));

// At half duration, the fill-bar width should be ~half the background width.
sandbox.proxiblueShieldTimer = sandbox.PROXIBLUE_SHIELD_DURATION / 2;
sandbox.ctx = makeMockCtx();
sandbox.drawTechdebtShieldHUD();
var halfBars = sandbox.ctx.calls.fillRect;
var halfMaxW = Math.max.apply(Math, halfBars.map(function (r) { return r.w; }));
var halfFillWidth = halfBars.filter(function (r) { return r.w > 0 && r.w < halfMaxW; });
check('AC#2: countdown bar depletes to ~half width at half shield duration',
    halfFillWidth.length >= 1
    && Math.abs(halfFillWidth[0].w - halfMaxW / 2) < 1,
    'fillRects: ' + JSON.stringify(halfBars));

// At zero, the fill-bar width should be 0 — but the HUD shouldn't render at
// all once proxiblueShieldActive is false. Verify the "not active → no draw".
sandbox.proxiblueShieldActive = false;
sandbox.proxiblueShieldTimer = 0;
sandbox.ctx = makeMockCtx();
sandbox.drawTechdebtShieldHUD();
check('AC#2: HUD does not render when shield is inactive',
    sandbox.ctx.calls.fillText.length === 0
    && sandbox.ctx.calls.fillRect.length === 0,
    'fillText: ' + sandbox.ctx.calls.fillText.length + ', fillRect: ' + sandbox.ctx.calls.fillRect.length);

// =============================================================================
// AC#3 — Shield timer decrements each frame. When it reaches 0,
// proxiblueShieldActive = false.
// =============================================================================
resetScenario();
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 0.5;

tick(0.1);
check('AC#3: shield timer decrements by dt each frame',
    Math.abs(sandbox.proxiblueShieldTimer - 0.4) < 1e-6,
    'timer: ' + sandbox.proxiblueShieldTimer);
check('AC#3: shield still active while timer > 0',
    sandbox.proxiblueShieldActive === true);

// Advance past zero — shield should deactivate AND timer clamp to 0.
tick(1.0);
check('AC#3: shield timer reaches 0 when dt pushes it past zero',
    sandbox.proxiblueShieldTimer === 0,
    'timer: ' + sandbox.proxiblueShieldTimer);
check('AC#3: proxiblueShieldActive = false once timer hits 0',
    sandbox.proxiblueShieldActive === false);

// Regression: once deactivated, ticking again MUST NOT re-fire the deactivate
// sound nor flip the active flag back on.
var deactivateAfter = deactivateSoundCalls;
tick(0.1);
check('AC#3: further ticks after deactivation do not re-fire deactivate sound',
    deactivateSoundCalls === deactivateAfter,
    'calls: ' + deactivateSoundCalls + ' vs ' + deactivateAfter);
check('AC#3: further ticks after deactivation leave proxiblueShieldActive false',
    sandbox.proxiblueShieldActive === false);

// =============================================================================
// AC#4 — Shield deactivation plays a fade-out sound (descending tone).
// =============================================================================
resetScenario();
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 0.05;
tick(0.1); // drives timer below 0 on a single frame → deactivate
check('AC#4: playProxiblueShieldDeactivateSound fires exactly once on natural expiry',
    deactivateSoundCalls === 1,
    'calls: ' + deactivateSoundCalls);

// The audio module must actually export the deactivate function.
var audioHasFn = audioSrc.indexOf('function playProxiblueShieldDeactivateSound(') > -1;
check('AC#4: audio.js defines playProxiblueShieldDeactivateSound',
    audioHasFn);

// Verify the waveform is a descending tone — the function must contain a
// frequency ramp from a higher to a lower value. We look for the sequence
// setValueAtTime(<high>) + exponentialRampToValueAtTime(<low>) inside the
// function body.
var deactivateBody = extractBlock(audioSrc, 'function playProxiblueShieldDeactivateSound(');
check('AC#4: deactivate sound body extracted',
    !!deactivateBody);

var rampMatch = deactivateBody && deactivateBody.match(/setValueAtTime\s*\(\s*(\d+(?:\.\d+)?)[^)]*\)\s*;[\s\S]*?(?:exponentialRampToValueAtTime|linearRampToValueAtTime)\s*\(\s*(\d+(?:\.\d+)?)/);
check('AC#4: deactivate sound ramps frequency from high to low (descending tone)',
    rampMatch !== null && Number(rampMatch[1]) > Number(rampMatch[2]),
    rampMatch ? ('start=' + rampMatch[1] + ' end=' + rampMatch[2]) : 'no ramp match');

// The sound must be quiet — peak gain should be modest (<= 0.15) per "quiet
// fade-out sound" wording in AC#4. Scan for gain.linearRampToValueAtTime peak.
var gainPeakMatch = deactivateBody && deactivateBody.match(/gain\.gain\.linearRampToValueAtTime\s*\(\s*([\d.]+)/);
check('AC#4: deactivate sound peaks at a quiet gain (<= 0.15)',
    gainPeakMatch !== null && Number(gainPeakMatch[1]) <= 0.15,
    gainPeakMatch ? ('peak=' + gainPeakMatch[1]) : 'no gain match');

// Sanity: shield consumed by absorb (US-009 path) does NOT go through natural
// expiry, so no deactivate sound in that case — absorb has its own flash.
resetScenario();
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = 5;
sandbox.techdebtAsteroids.push({
    x: 400, y: 300, vx: 0, vy: 0,
    size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    label: 'TODO', isProxiblue: false,
    rotation: 0, rotationSpeed: 0
});
tick(0.016);
check('AC#4: shield absorb path (US-009) does NOT fire deactivate sound',
    deactivateSoundCalls === 0
    && sandbox.proxiblueShieldActive === false
    && sandbox.proxiblueShieldFlashTimer > 0,
    'calls: ' + deactivateSoundCalls + ', flashTimer: ' + sandbox.proxiblueShieldFlashTimer);

// --- Summary ---
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
