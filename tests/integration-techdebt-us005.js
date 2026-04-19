// US-005 (Tech Debt Blaster): Runtime integration test for the
// TECHDEBT_PLAYING ship-physics block.
//
// Extracts the `if (gameState === STATES.TECHDEBT_PLAYING) { ... }` body from
// js/update.js verbatim and replays it inside a vm sandbox. Verifies all
// acceptance criteria for US-005:
//   - Left/Right (and A/D) rotate using ROTATION_SPEED
//   - Up (and W) thrusts in facing direction, consumes fuel at FUEL_BURN_RATE
//   - No gravity, no wind during the mini-game
//   - Drag (TECHDEBT_SHIP_DRAG) is applied per frame
//   - Velocity clamped to TECHDEBT_SHIP_MAX_SPEED
//   - Ship wraps around all four screen edges
//   - When fuel hits 0 thrust is disabled but ship still drifts and rotates
//
// Run:  node tests/integration-techdebt-us005.js
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

// --- sandbox ---
var thrustCalls = { start: 0, stop: 0 };
var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    keys: {},
    stopThrustSound: function () { thrustCalls.stop++; },
    startThrustSound: function () { thrustCalls.start++; },
    spawnBugWave: function () {},
    setupMissileWorld: function () {},
    setupTechdebtWorld: function () {},
    resetShip: function () {},
    resetWind: function () {},
    generateTerrain: function () {},
    getLevelConfig: function () { return { gravity: 0.05 }; },
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

// Extract the TECHDEBT_PLAYING block from update.js (signature + brace walk).
var updateSrc = loadFile('js/update.js');
var sig = 'if (gameState === STATES.TECHDEBT_PLAYING) {';
var startIdx = updateSrc.indexOf(sig);
if (startIdx < 0) {
    check('update.js contains TECHDEBT_PLAYING block', false, 'signature not found');
    process.exit(1);
}
var openBrace = updateSrc.indexOf('{', startIdx + sig.length - 1);
var depth = 0, closeBrace = -1;
for (var i = openBrace; i < updateSrc.length; i++) {
    if (updateSrc[i] === '{') depth++;
    else if (updateSrc[i] === '}') { depth--; if (depth === 0) { closeBrace = i; break; } }
}
var playBlock = updateSrc.slice(startIdx, closeBrace + 1);
var playReplay = new vm.Script('(function () {\n' + playBlock + '\n}).call(this);',
    { filename: 'techdebt-playing-extracted' });

function freshShip(over) {
    var s = {
        x: 400, y: 300,
        vx: 0, vy: 0,
        angle: 0,
        rotationSpeed: sandbox.ROTATION_SPEED,
        thrusting: false,
        rotating: null,
        fuel: sandbox.FUEL_MAX
    };
    if (over) for (var k in over) s[k] = over[k];
    return s;
}

function runTick(over) {
    if (over && over.keys) sandbox.keys = over.keys;
    else sandbox.keys = {};
    sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
    sandbox.dt = (over && over.dt !== undefined) ? over.dt : 0.016;
    sandbox.ship = freshShip(over && over.ship);
    playReplay.runInContext(sandbox);
}

// --- AC: ArrowLeft rotates the ship counter-clockwise (negative delta) ---
runTick({ keys: { ArrowLeft: true }, dt: 0.1 });
check('ArrowLeft rotates ship by -ROTATION_SPEED * dt',
    Math.abs(sandbox.ship.angle - (-sandbox.ROTATION_SPEED * 0.1)) < 1e-9,
    'angle: ' + sandbox.ship.angle);
check('ArrowLeft sets ship.rotating = "left"',
    sandbox.ship.rotating === 'left');

runTick({ keys: { a: true }, dt: 0.1 });
check('"a" key rotates ship by -ROTATION_SPEED * dt',
    Math.abs(sandbox.ship.angle - (-sandbox.ROTATION_SPEED * 0.1)) < 1e-9,
    'angle: ' + sandbox.ship.angle);

// --- AC: ArrowRight rotates the ship clockwise ---
runTick({ keys: { ArrowRight: true }, dt: 0.1 });
check('ArrowRight rotates ship by +ROTATION_SPEED * dt',
    Math.abs(sandbox.ship.angle - (sandbox.ROTATION_SPEED * 0.1)) < 1e-9,
    'angle: ' + sandbox.ship.angle);
check('ArrowRight sets ship.rotating = "right"',
    sandbox.ship.rotating === 'right');

runTick({ keys: { D: true }, dt: 0.1 });
check('"D" key rotates ship by +ROTATION_SPEED * dt',
    Math.abs(sandbox.ship.angle - (sandbox.ROTATION_SPEED * 0.1)) < 1e-9,
    'angle: ' + sandbox.ship.angle);

// --- AC: Up applies thrust in ship's facing direction ---
// At angle = 0 (upright, nose = -Y), thrust pushes vy negative.
runTick({ keys: { ArrowUp: true }, dt: 0.1 });
check('ArrowUp at angle=0 applies thrust upward (negative vy)',
    sandbox.ship.vy < 0,
    'vy: ' + sandbox.ship.vy);
check('ArrowUp at angle=0 leaves vx ~ 0 (with drag rounding)',
    Math.abs(sandbox.ship.vx) < 1e-6,
    'vx: ' + sandbox.ship.vx);
check('ArrowUp sets ship.thrusting=true when fuel > 0',
    sandbox.ship.thrusting === true);

runTick({ keys: { w: true }, dt: 0.1, ship: { angle: Math.PI / 2 } });
check('"w" + angle=π/2 thrusts to the right (positive vx)',
    sandbox.ship.vx > 0,
    'vx: ' + sandbox.ship.vx);

// --- AC: thrust consumes fuel at FUEL_BURN_RATE ---
runTick({ keys: { ArrowUp: true }, dt: 1.0, ship: { fuel: 50 } });
check('1s of thrust burns FUEL_BURN_RATE units of fuel',
    Math.abs(sandbox.ship.fuel - (50 - sandbox.FUEL_BURN_RATE)) < 1e-9,
    'fuel: ' + sandbox.ship.fuel);

runTick({ keys: { ArrowUp: true }, dt: 0.5, ship: { fuel: 1 } });
check('fuel cannot go below 0 (clamped)',
    sandbox.ship.fuel === 0,
    'fuel: ' + sandbox.ship.fuel);

// --- AC: when fuel = 0, thrust disabled but ship can still rotate and drift ---
runTick({ keys: { ArrowUp: true, ArrowLeft: true }, dt: 0.1,
          ship: { fuel: 0, vx: 50, vy: -30, angle: 0 } });
check('fuel=0 → ship.thrusting stays false even when ArrowUp held',
    sandbox.ship.thrusting === false,
    'thrusting: ' + sandbox.ship.thrusting);
check('fuel=0 → rotation still works',
    Math.abs(sandbox.ship.angle - (-sandbox.ROTATION_SPEED * 0.1)) < 1e-9,
    'angle: ' + sandbox.ship.angle);
// Ship drifts on remaining momentum (drag-attenuated, no zero-clamp).
check('fuel=0 + remaining velocity → ship still drifts (vx != 0)',
    sandbox.ship.vx !== 0,
    'vx: ' + sandbox.ship.vx);
check('fuel=0 + remaining velocity → ship still drifts (vy != 0)',
    sandbox.ship.vy !== 0,
    'vy: ' + sandbox.ship.vy);

// --- AC: drag is per-frame multiplier (TECHDEBT_SHIP_DRAG) ---
// With no input and starting velocity, expect velocity *= TECHDEBT_SHIP_DRAG.
runTick({ keys: {}, dt: 0.016, ship: { vx: 100, vy: -50, fuel: 50 } });
check('drag applied to vx (vx *= TECHDEBT_SHIP_DRAG)',
    Math.abs(sandbox.ship.vx - 100 * sandbox.TECHDEBT_SHIP_DRAG) < 1e-9,
    'vx: ' + sandbox.ship.vx + ' expected ~ ' + (100 * sandbox.TECHDEBT_SHIP_DRAG));
check('drag applied to vy (vy *= TECHDEBT_SHIP_DRAG)',
    Math.abs(sandbox.ship.vy - (-50) * sandbox.TECHDEBT_SHIP_DRAG) < 1e-9,
    'vy: ' + sandbox.ship.vy);

// --- AC: no gravity (no vy increase from gravity term) ---
// Run many idle frames; vy should monotonically approach zero, never grow more negative or positive.
sandbox.ship = freshShip({ vx: 0, vy: 0 });
sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
sandbox.keys = {};
sandbox.dt = 0.016;
for (var f = 0; f < 60; f++) playReplay.runInContext(sandbox);
check('no gravity: 60 idle frames leave vy = 0',
    sandbox.ship.vy === 0,
    'vy after 60 idle frames: ' + sandbox.ship.vy);
check('no wind: 60 idle frames leave vx = 0',
    sandbox.ship.vx === 0,
    'vx after 60 idle frames: ' + sandbox.ship.vx);

// --- AC: velocity clamped to TECHDEBT_SHIP_MAX_SPEED ---
runTick({ keys: {}, dt: 0.016,
          ship: { vx: 1000, vy: 0, fuel: 50 } });
var spd = Math.sqrt(sandbox.ship.vx * sandbox.ship.vx + sandbox.ship.vy * sandbox.ship.vy);
check('huge starting vx is clamped to TECHDEBT_SHIP_MAX_SPEED',
    Math.abs(spd - sandbox.TECHDEBT_SHIP_MAX_SPEED) < 1e-6,
    'speed: ' + spd + ' max: ' + sandbox.TECHDEBT_SHIP_MAX_SPEED);

// Diagonal velocity also clamped (not just an axis-aligned limit).
runTick({ keys: {}, dt: 0.016,
          ship: { vx: 800, vy: -800, fuel: 50 } });
var spd2 = Math.sqrt(sandbox.ship.vx * sandbox.ship.vx + sandbox.ship.vy * sandbox.ship.vy);
check('diagonal velocity is clamped by magnitude',
    Math.abs(spd2 - sandbox.TECHDEBT_SHIP_MAX_SPEED) < 1e-6,
    'speed: ' + spd2 + ' max: ' + sandbox.TECHDEBT_SHIP_MAX_SPEED);

// --- AC: ship wraps around all four screen edges ---
// Right edge → left
runTick({ keys: {}, dt: 0.1, ship: { x: 799, y: 300, vx: 100, vy: 0, fuel: 50 } });
check('exits right edge → wraps to left',
    sandbox.ship.x < 50,
    'x: ' + sandbox.ship.x);

// Left edge → right
runTick({ keys: {}, dt: 0.1, ship: { x: 1, y: 300, vx: -100, vy: 0, fuel: 50 } });
check('exits left edge → wraps to right',
    sandbox.ship.x > 750,
    'x: ' + sandbox.ship.x);

// Bottom edge → top
runTick({ keys: {}, dt: 0.1, ship: { x: 400, y: 599, vx: 0, vy: 100, fuel: 50 } });
check('exits bottom edge → wraps to top',
    sandbox.ship.y < 50,
    'y: ' + sandbox.ship.y);

// Top edge → bottom
runTick({ keys: {}, dt: 0.1, ship: { x: 400, y: 1, vx: 0, vy: -100, fuel: 50 } });
check('exits top edge → wraps to bottom',
    sandbox.ship.y > 550,
    'y: ' + sandbox.ship.y);

// --- AC sanity: ship.x stays in-bounds after wrap (no NaN, no off-canvas) ---
runTick({ keys: {}, dt: 0.5, ship: { x: 700, y: 500, vx: 200, vy: 200, fuel: 50 } });
check('after wrap, ship.x is in [0, canvas.width)',
    sandbox.ship.x >= 0 && sandbox.ship.x < sandbox.canvas.width,
    'x: ' + sandbox.ship.x);
check('after wrap, ship.y is in [0, canvas.height)',
    sandbox.ship.y >= 0 && sandbox.ship.y < sandbox.canvas.height,
    'y: ' + sandbox.ship.y);

console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
