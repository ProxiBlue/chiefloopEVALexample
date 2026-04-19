// US-014 (Tech Debt Blaster): Render asteroids, bullets, particles, HUD swap.
//
// Loads config.js + relevant render/update functions into a vm sandbox and
// verifies all ten AC for the TECHDEBT_* rendering contract:
//
//   1. js/render.js has TECHDEBT_* rendering branch(es).
//   2. Asteroids drawn as irregular polygons (8-10 vertices, random radial
//      offsets) in #888 grey with a centered monospace label.
//   3. Asteroid size visually matches tier (LARGE/MEDIUM/SMALL radii).
//   4. ProxiBlue asteroids rendered in #4488ff with glow/pulse.
//   5. Bullets drawn as short orange line segments oriented along their
//      velocity direction.
//   6. Particle bursts from destroyed asteroids use grey for normal / blue
//      for ProxiBlue.
//   7. Background is a starfield (no per-state starfield re-render; stars
//      already drawn by render() before state branch).
//   8. No terrain rendered during TECHDEBT_* states.
//   9. HUD shows: asteroids remaining, fuel, score, shield status.
//  10. TECHDEBT_COMPLETE shows "TECH DEBT CLEARED!" + score breakdown.
//
// Run:  node tests/integration-techdebt-us014.js
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

// --- Mock 2D canvas context ------------------------------------------------
function makeMockCtx() {
    var calls = {
        fillText: [], strokeStyle: [], fillStyle: [], shadowColor: [],
        arc: [], fillRect: [], strokeRect: [], globalAlpha: [],
        lineWidth: [], shadowBlur: [], font: [], textAlign: [],
        moveTo: [], lineTo: [],
        beginPath: 0, stroke: 0, fill: 0, save: 0, restore: 0
    };
    var ctx = {
        calls: calls,
        save: function () { calls.save++; },
        restore: function () { calls.restore++; },
        translate: function () {}, rotate: function () {},
        beginPath: function () { calls.beginPath++; },
        closePath: function () {},
        moveTo: function (x, y) { calls.moveTo.push({ x: x, y: y }); },
        lineTo: function (x, y) { calls.lineTo.push({ x: x, y: y }); },
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

// --- Sandbox ---------------------------------------------------------------
var terrainDrawCount = 0;
var shipDrawCount = 0;
var celebrationDrawCount = 0;

var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean, JSON: JSON,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    performance: { now: function () { return 0; } },
    keys: {},
    SHIP_SIZE: 40,
    stopThrustSound: function () {},
    startThrustSound: function () {},
    playTechdebtShootSound: function () {},
    playProxiblueCollectSound: function () {},
    playProxiblueShieldDeactivateSound: function () {},
    playExplosionSound: function () {},
    crashShipInTechdebt: function () {},
    spawnExplosion: function () {},
    startScreenShake: function () {},
    spawnCelebration: function () {},
    clearTechdebtState: function () {},
    spawnBugWave: function () {},
    setupMissileWorld: function () {},
    resetShip: function () {},
    resetWind: function () {},
    generateTerrain: function () {},
    getLevelConfig: function () { return { gravity: 0.05 }; },
    drawTerrain: function () { terrainDrawCount++; },
    drawStars: function () {},
    drawShip: function () { shipDrawCount++; },
    drawCelebration: function () { celebrationDrawCount++; },
    explosionFinished: false
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

vm.runInContext(extractBlock(updateSrc, 'function setupTechdebtWorld() {'), sandbox);
vm.runInContext(extractBlock(updateSrc, 'function spawnTechdebtAsteroidParticles('), sandbox);
vm.runInContext(extractBlock(updateSrc, 'function splitTechdebtAsteroid('), sandbox);
vm.runInContext(extractBlock(renderSrc, 'function drawTechdebtAsteroid('), sandbox);
vm.runInContext(extractBlock(renderSrc, 'function drawTechdebtHUD('), sandbox);
vm.runInContext(extractBlock(renderSrc, 'function drawTechdebtShieldHUD('), sandbox);
vm.runInContext(extractBlock(renderSrc, 'function renderTechdebtPlaying('), sandbox);
vm.runInContext(extractBlock(renderSrc, 'function renderTechdebtTransition('), sandbox);
vm.runInContext(extractBlock(renderSrc, 'function renderTechdebtComplete('), sandbox);

// =============================================================================
// AC#1 — render.js contains TECHDEBT_* rendering branch(es).
// =============================================================================
check('AC#1: renderTechdebtTransition is defined',
    typeof sandbox.renderTechdebtTransition === 'function');
check('AC#1: renderTechdebtPlaying is defined',
    typeof sandbox.renderTechdebtPlaying === 'function');
check('AC#1: renderTechdebtComplete is defined',
    typeof sandbox.renderTechdebtComplete === 'function');
// Source-level gate — the top-level switch dispatches to each.
var renderHasBranches = /case STATES\.TECHDEBT_TRANSITION:[\s\S]{0,120}renderTechdebtTransition/.test(renderSrc)
    && /case STATES\.TECHDEBT_PLAYING:[\s\S]{0,120}renderTechdebtPlaying/.test(renderSrc)
    && /case STATES\.TECHDEBT_COMPLETE:[\s\S]{0,120}renderTechdebtComplete/.test(renderSrc);
check('AC#1: render() switch dispatches TECHDEBT_* to the three render fns',
    renderHasBranches);

// =============================================================================
// AC#2 — Asteroids: 8-10 vertices, random radial offsets, #888 grey fill,
// labeled in monospace.
// =============================================================================
sandbox.setupTechdebtWorld();
// At least one non-ProxiBlue asteroid is very likely — find one.
var normalAst = null;
for (var ai = 0; ai < sandbox.techdebtAsteroids.length; ai++) {
    if (!sandbox.techdebtAsteroids[ai].isProxiblue) { normalAst = sandbox.techdebtAsteroids[ai]; break; }
}
check('AC#2: at least one normal asteroid seeded', normalAst !== null);
check('AC#2: asteroid has a shape array (per-entity random offsets)',
    normalAst && Array.isArray(normalAst.shape));
check('AC#2: shape has 8-10 vertices',
    normalAst && normalAst.shape.length >= 8 && normalAst.shape.length <= 10,
    'len: ' + (normalAst && normalAst.shape.length));

// Radial offsets vary (not constant).
var uniqRadii = {};
if (normalAst) {
    for (var ri = 0; ri < normalAst.shape.length; ri++) {
        uniqRadii[normalAst.shape[ri].toFixed(3)] = true;
    }
}
check('AC#2: shape radial offsets are varied (random, not constant)',
    Object.keys(uniqRadii).length >= 3,
    'unique radii: ' + Object.keys(uniqRadii).length);

// Across 20 spawns, at least two distinct shapes should appear (random per
// asteroid, not a deterministic shared shape).
var shapeFingerprints = {};
for (var t2 = 0; t2 < 20; t2++) {
    sandbox.setupTechdebtWorld();
    for (var a2 = 0; a2 < sandbox.techdebtAsteroids.length; a2++) {
        var fp = sandbox.techdebtAsteroids[a2].shape.map(function (n) { return n.toFixed(2); }).join(',');
        shapeFingerprints[fp] = true;
    }
}
check('AC#2: asteroid shapes are per-entity random (>=2 distinct across spawns)',
    Object.keys(shapeFingerprints).length >= 2,
    'distinct shapes sampled: ' + Object.keys(shapeFingerprints).length);

// Render a normal asteroid and inspect the fill + label.
sandbox.ctx = makeMockCtx();
sandbox.drawTechdebtAsteroid(normalAst);
var bodyFills = sandbox.ctx.calls.fillStyle.filter(function (c) {
    return typeof c === 'string' && c.toLowerCase() === '#888';
});
check('AC#2: normal asteroid body filled in #888 (grey)',
    bodyFills.length >= 1,
    'fillStyles: ' + JSON.stringify(sandbox.ctx.calls.fillStyle));

var labelCall = sandbox.ctx.calls.fillText.find(function (c) { return c.text === normalAst.label; });
check('AC#2: normal asteroid label is drawn at asteroid center',
    labelCall && labelCall.x === normalAst.x && labelCall.y === normalAst.y);

var labelFonts = sandbox.ctx.calls.font.filter(function (f) {
    return typeof f === 'string' && /monospace/i.test(f);
});
check('AC#2: asteroid label uses monospace font',
    labelFonts.length >= 1,
    'fonts: ' + JSON.stringify(sandbox.ctx.calls.font));

// =============================================================================
// AC#3 — Asteroid size visually matches tier: large→medium→small radii.
// =============================================================================
var tierRadiiUsed = { large: 0, medium: 0, small: 0 };
function renderAndCaptureMaxRadius(ast) {
    // Generate vertex radii: max of |pt| values moveTo+lineTo captures.
    var mc = makeMockCtx();
    sandbox.ctx = mc;
    sandbox.drawTechdebtAsteroid(ast);
    // All vertex coords relative to the translated origin. We don't have
    // translate tracking, but we know: coords = cos(ang)*rr and sin(ang)*rr,
    // so max magnitude across vertices ~= max(ast.size * shape[i]).
    var maxMag = 0;
    var vs = mc.calls.moveTo.concat(mc.calls.lineTo);
    for (var k = 0; k < vs.length; k++) {
        var m = Math.sqrt(vs[k].x * vs[k].x + vs[k].y * vs[k].y);
        if (m > maxMag) maxMag = m;
    }
    return maxMag;
}

var largeAst = { x: 0, y: 0, size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large',
    label: 'L', isProxiblue: false, rotation: 0,
    shape: [1, 1, 1, 1, 1, 1, 1, 1] };
var medAst = { x: 0, y: 0, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    label: 'M', isProxiblue: false, rotation: 0,
    shape: [1, 1, 1, 1, 1, 1, 1, 1] };
var smallAst = { x: 0, y: 0, size: sandbox.TECHDEBT_SIZE_SMALL, sizeTier: 'small',
    label: 'S', isProxiblue: false, rotation: 0,
    shape: [1, 1, 1, 1, 1, 1, 1, 1] };

var rL = renderAndCaptureMaxRadius(largeAst);
var rM = renderAndCaptureMaxRadius(medAst);
var rS = renderAndCaptureMaxRadius(smallAst);
check('AC#3: LARGE render radius > MEDIUM render radius',
    rL > rM, 'L=' + rL + ' M=' + rM);
check('AC#3: MEDIUM render radius > SMALL render radius',
    rM > rS, 'M=' + rM + ' S=' + rS);
// Ensure the sizes map directly to the configured tier constants.
check('AC#3: LARGE render radius ~= TECHDEBT_SIZE_LARGE',
    Math.abs(rL - sandbox.TECHDEBT_SIZE_LARGE) < 0.5);
check('AC#3: MEDIUM render radius ~= TECHDEBT_SIZE_MEDIUM',
    Math.abs(rM - sandbox.TECHDEBT_SIZE_MEDIUM) < 0.5);
check('AC#3: SMALL render radius ~= TECHDEBT_SIZE_SMALL',
    Math.abs(rS - sandbox.TECHDEBT_SIZE_SMALL) < 0.5);

// =============================================================================
// AC#4 — ProxiBlue renders in #4488ff with glow/pulse.
// =============================================================================
var proxi = { x: 0, y: 0, size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    label: 'ProxiBlue', isProxiblue: true, rotation: 0,
    shape: [1, 1, 1, 1, 1, 1, 1, 1] };

sandbox.performance = { now: function () { return 0; } };
sandbox.ctx = makeMockCtx();
sandbox.drawTechdebtAsteroid(proxi);
var blueFill = sandbox.ctx.calls.fillStyle.some(function (c) {
    return typeof c === 'string' && c.toLowerCase() === '#4488ff';
});
check('AC#4: ProxiBlue rendered in #4488ff',
    blueFill,
    'fillStyles: ' + JSON.stringify(sandbox.ctx.calls.fillStyle));

var glowColor = sandbox.ctx.calls.shadowColor.some(function (c) {
    return typeof c === 'string' && c.toLowerCase() === '#4488ff';
});
check('AC#4: ProxiBlue glow uses shadowColor = #4488ff', glowColor);

// Pulse: render two frames at different times; shadowBlur values should differ.
sandbox.performance = { now: function () { return 0; } };
var ctxA = makeMockCtx(); sandbox.ctx = ctxA;
sandbox.drawTechdebtAsteroid(proxi);

sandbox.performance = { now: function () { return 400; } }; // 0.4s later
var ctxB = makeMockCtx(); sandbox.ctx = ctxB;
sandbox.drawTechdebtAsteroid(proxi);

var blursA = ctxA.calls.shadowBlur.filter(function (v) { return v > 0; });
var blursB = ctxB.calls.shadowBlur.filter(function (v) { return v > 0; });
check('AC#4: ProxiBlue shadowBlur pulses over time (frame A != frame B)',
    JSON.stringify(blursA) !== JSON.stringify(blursB),
    'A=' + JSON.stringify(blursA) + ' B=' + JSON.stringify(blursB));

// =============================================================================
// AC#5 — Bullets drawn as short orange line segments in direction of travel.
// =============================================================================
sandbox.ship = { x: 400, y: 300, vx: 0, vy: 0, angle: 0, thrusting: false,
    rotating: null, fuel: 100 };
sandbox.techdebtAsteroids = [];
sandbox.techdebtParticles = [];
sandbox.proxiblueShieldActive = false;
sandbox.proxiblueShieldFlashTimer = 0;
sandbox.techdebtBullets = [
    { x: 100, y: 100, vx: 500, vy: 0, age: 0 } // moving right
];
sandbox.ctx = makeMockCtx();
sandbox.renderTechdebtPlaying();
var orangeStroke = sandbox.ctx.calls.strokeStyle.some(function (c) {
    return typeof c === 'string' && c.toLowerCase() === sandbox.BULLET_COLOR.toLowerCase();
});
check('AC#5: bullet stroke uses BULLET_COLOR (orange)',
    orangeStroke,
    'strokeStyles: ' + JSON.stringify(sandbox.ctx.calls.strokeStyle));

// The bullet should render as a moveTo(b.x - dx, b.y - dy) → lineTo(b.x, b.y)
// with dx/dy aligned to the velocity direction. For vx=500/vy=0, the segment
// must be horizontal (dy = 0) and its length must equal BULLET_SIZE.
var bulletMoves = sandbox.ctx.calls.moveTo;
var bulletLines = sandbox.ctx.calls.lineTo;
var found = false;
for (var bi = 0; bi < bulletMoves.length; bi++) {
    var m = bulletMoves[bi];
    var l = bulletLines[bi];
    if (!l) continue;
    var dx = l.x - m.x;
    var dy = l.y - m.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(len - sandbox.BULLET_SIZE) < 0.5 && Math.abs(dy) < 0.01 && dx > 0) {
        found = true; break;
    }
}
check('AC#5: bullet segment is horizontal (oriented along +X velocity), length = BULLET_SIZE',
    found);

// Diagonal velocity → segment rotated accordingly.
sandbox.techdebtBullets = [{ x: 200, y: 200, vx: 300, vy: 300, age: 0 }];
sandbox.ctx = makeMockCtx();
sandbox.renderTechdebtPlaying();
var diagFound = false;
for (var bi2 = 0; bi2 < sandbox.ctx.calls.moveTo.length; bi2++) {
    var m2 = sandbox.ctx.calls.moveTo[bi2];
    var l2 = sandbox.ctx.calls.lineTo[bi2];
    if (!l2) continue;
    var dx2 = l2.x - m2.x;
    var dy2 = l2.y - m2.y;
    // dx and dy should be approximately equal and positive for vx=vy=300.
    if (dx2 > 0 && Math.abs(dx2 - dy2) < 0.5) { diagFound = true; break; }
}
check('AC#5: diagonal bullet segment rotates to match velocity direction',
    diagFound);

// =============================================================================
// AC#6 — Particle bursts use asteroid colour: grey for normal, blue for
// ProxiBlue.
// =============================================================================
sandbox.techdebtParticles = [];
sandbox.spawnTechdebtAsteroidParticles(100, 100, '#888');
var allGrey = sandbox.techdebtParticles.every(function (p) { return p.color === '#888'; });
check('AC#6: normal asteroid particles are grey (#888)',
    allGrey && sandbox.techdebtParticles.length > 0);

sandbox.techdebtParticles = [];
sandbox.spawnTechdebtAsteroidParticles(100, 100, '#4488ff');
var allBlue = sandbox.techdebtParticles.every(function (p) { return p.color === '#4488ff'; });
check('AC#6: ProxiBlue particles are blue (#4488ff)',
    allBlue && sandbox.techdebtParticles.length > 0);

// Source gate — the bullet→asteroid collision branch must spawn particles
// with the grey colour literal (not the previous brown).
var particleGreyInSource = /spawnTechdebtAsteroidParticles\([^)]*'#888'\)/.test(updateSrc);
check('AC#6: bullet→asteroid collision spawns grey (#888) particles',
    particleGreyInSource);

// =============================================================================
// AC#7 / AC#8 — Starfield background, NO terrain during TECHDEBT_* states.
// =============================================================================
terrainDrawCount = 0;

sandbox.techdebtAsteroids = [];
sandbox.techdebtBullets = [];
sandbox.techdebtParticles = [];
sandbox.techdebtTransitionTimer = 0;
sandbox.ship = { x: 400, y: 300, vx: 0, vy: 0, angle: 0, thrusting: false,
    rotating: null, fuel: 100 };
sandbox.proxiblueShieldActive = false;
sandbox.proxiblueShieldFlashTimer = 0;
sandbox.asteroidsDestroyed = 0;
sandbox.techdebtFuelBonus = 0;
sandbox.score = 0;

sandbox.ctx = makeMockCtx();
sandbox.renderTechdebtTransition();
var transitionTerrain = terrainDrawCount;
check('AC#8: renderTechdebtTransition does NOT draw terrain',
    transitionTerrain === 0,
    'terrainDrawCount: ' + transitionTerrain);

terrainDrawCount = 0;
sandbox.ctx = makeMockCtx();
sandbox.renderTechdebtPlaying();
check('AC#8: renderTechdebtPlaying does NOT draw terrain',
    terrainDrawCount === 0,
    'terrainDrawCount: ' + terrainDrawCount);

terrainDrawCount = 0;
sandbox.ctx = makeMockCtx();
sandbox.renderTechdebtComplete();
check('AC#8: renderTechdebtComplete does NOT draw terrain',
    terrainDrawCount === 0,
    'terrainDrawCount: ' + terrainDrawCount);

// Source gate — confirm drawTerrain is not referenced inside any of the
// three TECHDEBT_* render fns.
function bodyOf(fnSrc, sig) {
    var start = fnSrc.indexOf(sig);
    var open = fnSrc.indexOf('{', start + sig.length - 1);
    var depth = 0, close = -1;
    for (var i = open; i < fnSrc.length; i++) {
        if (fnSrc[i] === '{') depth++;
        else if (fnSrc[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    return fnSrc.slice(open, close + 1);
}
var transBody = bodyOf(renderSrc, 'function renderTechdebtTransition(');
var playBody = bodyOf(renderSrc, 'function renderTechdebtPlaying(');
var completeBody = bodyOf(renderSrc, 'function renderTechdebtComplete(');
check('AC#8 (source): renderTechdebtTransition body does not call drawTerrain',
    !/\bdrawTerrain\(/.test(transBody));
check('AC#8 (source): renderTechdebtPlaying body does not call drawTerrain',
    !/\bdrawTerrain\(/.test(playBody));
check('AC#8 (source): renderTechdebtComplete body does not call drawTerrain',
    !/\bdrawTerrain\(/.test(completeBody));

// =============================================================================
// AC#9 — HUD shows asteroids remaining, fuel, score, shield status.
// =============================================================================
sandbox.ship = { x: 400, y: 300, vx: 0, vy: 0, angle: 0, thrusting: false,
    rotating: null, fuel: sandbox.FUEL_MAX * 0.5 };
sandbox.techdebtAsteroids = [
    { x: 1, y: 1, size: 20, sizeTier: 'large', label: 'A', isProxiblue: false,
        rotation: 0, rotationSpeed: 0, vx: 0, vy: 0, shape: [1,1,1,1,1,1,1,1] },
    { x: 2, y: 2, size: 20, sizeTier: 'large', label: 'B', isProxiblue: false,
        rotation: 0, rotationSpeed: 0, vx: 0, vy: 0, shape: [1,1,1,1,1,1,1,1] }
];
sandbox.score = 1234;
sandbox.proxiblueShieldActive = false;
sandbox.proxiblueShieldTimer = 0;

sandbox.ctx = makeMockCtx();
sandbox.drawTechdebtHUD();

var hudTexts = sandbox.ctx.calls.fillText.map(function (c) { return c.text; });
function hasHudText(regex) { return hudTexts.some(function (t) { return regex.test(t); }); }

check('AC#9: HUD shows asteroids remaining count',
    hasHudText(/Asteroids?.*2/i),
    'hud texts: ' + JSON.stringify(hudTexts));
check('AC#9: HUD shows score',
    hasHudText(/Score.*1234/i));
check('AC#9: HUD shows fuel (percent or bar label)',
    hasHudText(/Fuel/i));
check('AC#9: HUD shows shield status',
    hasHudText(/Shield/i));

// With shield ACTIVE, the HUD label should indicate active state.
sandbox.proxiblueShieldActive = true;
sandbox.proxiblueShieldTimer = sandbox.PROXIBLUE_SHIELD_DURATION;
sandbox.ctx = makeMockCtx();
sandbox.drawTechdebtHUD();
var activeTexts = sandbox.ctx.calls.fillText.map(function (c) { return c.text; });
check('AC#9: HUD indicates ACTIVE when shield is on',
    activeTexts.some(function (t) { return /ACTIVE|\d+\.\d+s/i.test(t) && /shield/i.test(t); })
        || activeTexts.some(function (t) { return /ACTIVE/i.test(t); }),
    'active texts: ' + JSON.stringify(activeTexts));

// Fuel bar (rectangle) must be drawn.
var hasFuelBar = sandbox.ctx.calls.fillRect.length >= 2; // bg + fill rects
check('AC#9: HUD renders a fuel bar (>=2 fillRects)',
    hasFuelBar,
    'fillRects: ' + sandbox.ctx.calls.fillRect.length);

// Source gate — HUD is called inside renderTechdebtPlaying.
check('AC#9: renderTechdebtPlaying calls drawTechdebtHUD',
    /drawTechdebtHUD\(/.test(playBody));

// =============================================================================
// AC#10 — TECHDEBT_COMPLETE: "TECH DEBT CLEARED!" banner + score breakdown.
// =============================================================================
sandbox.asteroidsDestroyed = 14;
sandbox.techdebtFuelBonus = 142;
sandbox.score = 5000;
sandbox.techdebtParticles = [];
sandbox.ship = { x: 400, y: 300, vx: 0, vy: 0, angle: 0, thrusting: false,
    rotating: null, fuel: sandbox.FUEL_MAX };

sandbox.ctx = makeMockCtx();
sandbox.renderTechdebtComplete();
var completeTexts = sandbox.ctx.calls.fillText.map(function (c) { return c.text; });
check('AC#10: TECHDEBT_COMPLETE shows "TECH DEBT CLEARED!" banner',
    completeTexts.some(function (t) { return /TECH DEBT CLEARED/i.test(t); }),
    'texts: ' + JSON.stringify(completeTexts));
check('AC#10: TECHDEBT_COMPLETE shows asteroids destroyed count',
    completeTexts.some(function (t) { return /Asteroids Destroyed.*14/i.test(t); }));
check('AC#10: TECHDEBT_COMPLETE shows fuel bonus',
    completeTexts.some(function (t) { return /Fuel Bonus.*142/i.test(t); }));
check('AC#10: TECHDEBT_COMPLETE shows score breakdown (total score visible)',
    completeTexts.some(function (t) { return /Score.*5000|5000/.test(t); }));

// =============================================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
