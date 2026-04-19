// US-004 (Feature Drive): Runtime integration test for DRIVE_TRANSITION entry.
//
// Exercises two paths in a single vm context:
//   1. The SCENE_SCROLL end branch extracted verbatim from js/update.js — with
//      landedPRType === 'feature' — which calls setupDriveWorld() and advances
//      gameState to DRIVE_TRANSITION.
//   2. The DRIVE_TRANSITION tick block, driven past DRIVE_TRANSITION_DURATION
//      to verify it advances to DRIVE_PLAYING.
//
// Also verifies setupDriveWorld() directly against every US-004 AC that is
// purely a data/world-setup concern (road length formula, reset of score +
// pickups + arrays, destination-pad world position, safe-zone obstacle
// placement, zero velocity, fuel refill, buggy snapped to ground).
//
// Runtime (not static): config.js + setupDriveWorld() + both update-block
// extracts are all evaluated inside the vm sandbox, so assertions reflect the
// actual bytes that ship.
//
// Run:  node tests/integration-drive-us004.js
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
function loadFile(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

function extractBlock(src, signature, label) {
    var start = src.indexOf(signature);
    if (start < 0) {
        check(label + ' signature present', false, signature + ' not found');
        process.exit(1);
    }
    var open = src.indexOf('{', start + signature.length - 1);
    var depth = 0, close = -1;
    for (var i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    return src.slice(start, close + 1);
}

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
    setupTechdebtWorld: function () {},
    setupBreakoutWorld: function () {},
    resetShip: function () {},
    resetWind: function () {},
    generateTerrain: function () {},
    getLevelConfig: function () { return { gravity: 0.05 }; },
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

var updateSrc = loadFile('js/update.js');

// Load the real setupDriveWorld() into the sandbox.
var setupFnSrc = extractBlock(updateSrc, 'function setupDriveWorld() {', 'setupDriveWorld');
vm.runInContext(setupFnSrc, sandbox, { filename: 'setupDriveWorld-extracted' });
check('setupDriveWorld evaluated into sandbox',
    typeof sandbox.setupDriveWorld === 'function');

// Extract the SCENE_SCROLL end branch (feature pad → DRIVE_TRANSITION path).
var scrollBlock = extractBlock(updateSrc,
    'if (gameState === STATES.SCENE_SCROLL && sceneScrollState) {',
    'SCENE_SCROLL end branch');
var scrollReplay = new vm.Script('(function () {\n' + scrollBlock + '\n}).call(this);',
    { filename: 'scroll-block-extracted' });

// Extract the DRIVE_TRANSITION tick block.
var tickBlock = extractBlock(updateSrc,
    'if (gameState === STATES.DRIVE_TRANSITION) {',
    'DRIVE_TRANSITION tick block');
var tickReplay = new vm.Script('(function () {\n' + tickBlock + '\n}).call(this);',
    { filename: 'drive-tick-extracted' });

// --- Drive the SCENE_SCROLL end branch for a feature pad ---
function runSceneScrollEndForFeaturePad(level) {
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
    sandbox.landedPRType = 'feature';
    sandbox.landingPadIndex = -1;
    sandbox.sceneDescentStartY = 0;
    sandbox.sceneDescentTargetY = 0;
    sandbox.sceneDescentTimer = 0;
    sandbox.driveTransitionTimer = 999;
    // Pre-pollute per-round state + arrays to verify setupDriveWorld clears them.
    sandbox.driveScore = 4242;
    sandbox.drivePickupsCollected = 9;
    sandbox.driveDistance = 777;
    sandbox.driveSpeed = 160;
    sandbox.driveBuggyVY = -45;
    sandbox.driveGrounded = false;
    sandbox.driveRoadSegments = [{ stale: true }];
    sandbox.driveObstacles = [{ stale: true }];
    sandbox.drivePickups = [{ stale: true }];
    sandbox.driveParticles = [{ stale: true }];
    scrollReplay.runInContext(sandbox);
}

runSceneScrollEndForFeaturePad(0);

// --- AC: "After DRIVE_TRANSITION_DURATION, state transitions to DRIVE_PLAYING" ---
// First assert the entry path reached DRIVE_TRANSITION.
check('AC: feature pad → STATES.DRIVE_TRANSITION',
    sandbox.gameState === sandbox.STATES.DRIVE_TRANSITION,
    'gameState: ' + sandbox.gameState);

check('AC: driveTransitionTimer reset to 0 on entry',
    sandbox.driveTransitionTimer === 0,
    'driveTransitionTimer: ' + sandbox.driveTransitionTimer);

// --- AC: "Ship velocity zeroed, fuel set to FUEL_MAX." ---
check('AC: ship velocity zeroed',
    sandbox.ship.vx === 0 && sandbox.ship.vy === 0,
    'ship vx/vy: ' + sandbox.ship.vx + '/' + sandbox.ship.vy);
check('AC: ship.angle zeroed (upright)',
    sandbox.ship.angle === 0,
    'ship.angle: ' + sandbox.ship.angle);
check('AC: ship.fuel === FUEL_MAX',
    sandbox.ship.fuel === sandbox.FUEL_MAX,
    'ship.fuel: ' + sandbox.ship.fuel);

// --- AC: "driveScore, drivePickupsCollected, arrays all reset." ---
check('AC: driveScore reset to 0',
    sandbox.driveScore === 0,
    'driveScore: ' + sandbox.driveScore);
check('AC: drivePickupsCollected reset to 0',
    sandbox.drivePickupsCollected === 0,
    'drivePickupsCollected: ' + sandbox.drivePickupsCollected);
check('AC: driveDistance reset to 0',
    sandbox.driveDistance === 0,
    'driveDistance: ' + sandbox.driveDistance);
check('AC: driveRoadSegments populated (fresh array)',
    Array.isArray(sandbox.driveRoadSegments)
        && sandbox.driveRoadSegments.length > 0
        && !sandbox.driveRoadSegments[0].stale,
    'driveRoadSegments[0]: ' + JSON.stringify(sandbox.driveRoadSegments[0]));
check('AC: driveObstacles reset (stale entries cleared)',
    Array.isArray(sandbox.driveObstacles)
        && sandbox.driveObstacles.every(function (o) { return !o.stale; }),
    'driveObstacles contained a stale entry');
check('AC: drivePickups reset (stale entries cleared)',
    Array.isArray(sandbox.drivePickups)
        && sandbox.drivePickups.every(function (p) { return !p.stale; }),
    'drivePickups contained a stale entry');
check('AC: driveParticles reset to empty',
    Array.isArray(sandbox.driveParticles) && sandbox.driveParticles.length === 0,
    'driveParticles: ' + JSON.stringify(sandbox.driveParticles));
check('AC: driveSpeed reset to 0 (buggy starts at rest)',
    sandbox.driveSpeed === 0,
    'driveSpeed: ' + sandbox.driveSpeed);
check('AC: driveBuggyVY reset to 0',
    sandbox.driveBuggyVY === 0,
    'driveBuggyVY: ' + sandbox.driveBuggyVY);
check('AC: driveGrounded reset to true (settled on surface)',
    sandbox.driveGrounded === true,
    'driveGrounded: ' + sandbox.driveGrounded);

// --- AC: "Ship settles onto the terrain surface ... snap to ground" ---
// setupDriveWorld sets driveBuggyY to the ground height of the first segment.
check('AC: buggy Y snapped to terrain surface (matches first road segment)',
    sandbox.driveRoadSegments.length > 0
        && sandbox.driveBuggyY === sandbox.driveRoadSegments[0].y,
    'driveBuggyY: ' + sandbox.driveBuggyY
        + ', first segment y: ' + (sandbox.driveRoadSegments[0] && sandbox.driveRoadSegments[0].y));

// --- AC: "Road length = min(DRIVE_ROAD_MAX_LENGTH, DRIVE_ROAD_BASE_LENGTH + currentLevel * DRIVE_ROAD_PER_LEVEL)" ---
function expectedLen(level) {
    return Math.min(
        sandbox.DRIVE_ROAD_MAX_LENGTH,
        sandbox.DRIVE_ROAD_BASE_LENGTH + level * sandbox.DRIVE_ROAD_PER_LEVEL
    );
}
check('AC: road length at level 0 matches formula',
    sandbox.driveRoadLength === expectedLen(0),
    'got: ' + sandbox.driveRoadLength + ', expected: ' + expectedLen(0));

sandbox.currentLevel = 4;
sandbox.setupDriveWorld();
check('AC: road length at level 4 matches formula',
    sandbox.driveRoadLength === expectedLen(4),
    'got: ' + sandbox.driveRoadLength + ', expected: ' + expectedLen(4));

sandbox.currentLevel = 20;
sandbox.setupDriveWorld();
check('AC: road length at level 20 capped at DRIVE_ROAD_MAX_LENGTH',
    sandbox.driveRoadLength === sandbox.DRIVE_ROAD_MAX_LENGTH,
    'got: ' + sandbox.driveRoadLength + ', MAX: ' + sandbox.DRIVE_ROAD_MAX_LENGTH);

// --- AC: "destination landing pad is placed at the end of the road" ---
// Road segment array spans [0, driveRoadLength) in 20px steps; the destination
// is conceptually the far right edge (worldX = driveRoadLength).
var lastSeg = sandbox.driveRoadSegments[sandbox.driveRoadSegments.length - 1];
check('AC: road segment array ends within 20px of road length (destination at end)',
    lastSeg && (sandbox.driveRoadLength - lastSeg.x) <= 20 && (sandbox.driveRoadLength - lastSeg.x) >= 0,
    'lastSeg.x: ' + (lastSeg && lastSeg.x) + ', roadLength: ' + sandbox.driveRoadLength);

// --- AC: "procedural road generates ahead ... obstacles and pickups placed along it" ---
sandbox.currentLevel = 2;
sandbox.setupDriveWorld();
check('obstacles are all inside safe zones (200px margin at both ends)',
    sandbox.driveObstacles.every(function (o) {
        return o.x >= 200 && o.x <= sandbox.driveRoadLength - 200;
    }),
    'some obstacle was outside safe zones');
check('pickups are all inside safe zones (200px margin at both ends)',
    sandbox.drivePickups.every(function (p) {
        return p.x >= 200 && p.x <= sandbox.driveRoadLength - 200;
    }),
    'some pickup was outside safe zones');
check('at least one obstacle placed (road is non-trivial at level 2)',
    sandbox.driveObstacles.length > 0,
    'driveObstacles.length: ' + sandbox.driveObstacles.length);
check('at least one pickup placed (road is non-trivial at level 2)',
    sandbox.drivePickups.length > 0,
    'drivePickups.length: ' + sandbox.drivePickups.length);

// --- AC: "After DRIVE_TRANSITION_DURATION, state transitions to DRIVE_PLAYING" ---
sandbox.gameState = sandbox.STATES.DRIVE_TRANSITION;
sandbox.driveTransitionTimer = 0;
sandbox.dt = 0.1;
tickReplay.runInContext(sandbox);
check('mid-transition tick advances timer but does NOT exit state',
    sandbox.gameState === sandbox.STATES.DRIVE_TRANSITION
        && sandbox.driveTransitionTimer > 0,
    'gameState: ' + sandbox.gameState
        + ', timer: ' + sandbox.driveTransitionTimer);

sandbox.dt = sandbox.DRIVE_TRANSITION_DURATION + 0.1;
tickReplay.runInContext(sandbox);
check('AC: timer ≥ DRIVE_TRANSITION_DURATION → STATES.DRIVE_PLAYING',
    sandbox.gameState === sandbox.STATES.DRIVE_PLAYING,
    'gameState: ' + sandbox.gameState);

// --- Render-side static pins (AC: wheel ease + DEPLOY FEATURE! flash + banner + camera 25%) ---
var renderSrc = loadFile('js/render.js');
check('render: renderDriveTransition() function defined',
    /function\s+renderDriveTransition\s*\(/.test(renderSrc),
    'renderDriveTransition definition not found');
check('render: DRIVE_TRANSITION dispatched in render() switch',
    /case\s+STATES\.DRIVE_TRANSITION:\s*\n\s*renderDriveTransition\s*\(\s*\)/.test(renderSrc),
    'DRIVE_TRANSITION case not wired in render() switch');
check('render: wheel radius eases from 0 with cubic ease-out over ~0.5s',
    /Math\.min\(\s*driveTransitionTimer\s*\/\s*0\.5\s*,\s*1\s*\)/.test(renderSrc)
        && /1\s*-\s*Math\.pow\(\s*1\s*-\s*\w+\s*,\s*3\s*\)/.test(renderSrc),
    'ease-out formula not present in renderDriveTransition');
check('render: "DEPLOY FEATURE!" text flashes during transition',
    /DEPLOY FEATURE!/.test(renderSrc),
    '"DEPLOY FEATURE!" string not present in render.js');
check('render: buggy positioned at ~25% from left edge of screen',
    /canvas\.width\s*\*\s*0\.25/.test(renderSrc),
    'canvas.width * 0.25 (buggy screen X) not present in render.js');
check('render: destination banner uses landedPRTitle with FEATURE COMPLETE fallback',
    /landedPRTitle/.test(renderSrc) && /FEATURE COMPLETE/.test(renderSrc),
    'banner text or fallback not present in render.js');

console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
