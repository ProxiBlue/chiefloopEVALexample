// US-003: Runtime integration test for pad-type routing at SCENE_SCROLL end.
//
// Manual-test evidence for AC#6 ("landing on each pad type enters the correct
// flow"). Exercises the SCENE_SCROLL end branch in js/update.js for all four
// pad types and asserts the post-transition gameState:
//
//   security (odd)  → STATES.INVADER_SCROLL_ROTATE
//   security (even) → STATES.MISSILE_TRANSITION   (via missilePadScroll route)
//   bugfix          → STATES.BUGFIX_TRANSITION
//   feature         → STATES.SCENE_DESCENT        (normal/fall-through path)
//   other           → STATES.TECHDEBT_TRANSITION  (US-003 under test)
//
// Runtime (not static): config.js is loaded into a vm context. The actual
// SCENE_SCROLL block is extracted verbatim from js/update.js and replayed in
// that same context — we exercise the bytes that ship.
//
// Run:  node tests/integration-us003.js
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

// Minimal browser-ish sandbox. Functions called from the SCENE_SCROLL block
// that we don't need to exercise are stubbed to no-op so the block completes.
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

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

check('config.js loaded STATES.TECHDEBT_TRANSITION',
    sandbox.STATES && sandbox.STATES.TECHDEBT_TRANSITION === 'techdebt_transition',
    'STATES.TECHDEBT_TRANSITION: ' + (sandbox.STATES && sandbox.STATES.TECHDEBT_TRANSITION));

// Extract SCENE_SCROLL block from update.js.
var updateSrc = loadFile('js/update.js');
var scrollSig = 'if (gameState === STATES.SCENE_SCROLL && sceneScrollState) {';
var scrollStart = updateSrc.indexOf(scrollSig);
var sOpen = updateSrc.indexOf('{', scrollStart + scrollSig.length - 1);
var depth = 0, sClose = -1;
for (var j = sOpen; j < updateSrc.length; j++) {
    if (updateSrc[j] === '{') depth++;
    else if (updateSrc[j] === '}') { depth--; if (depth === 0) { sClose = j; break; } }
}
var scrollBlock = updateSrc.slice(scrollStart, sClose + 1);
var scrollReplay = new vm.Script('(function () {\n' + scrollBlock + '\n}).call(this);',
    { filename: 'scroll-block-extracted' });

// AC#1: the SCENE_SCROLL end branch references prType === 'other' (static check
// to pin that detection happens in update.js, not a pre-computed routing flag
// inherited from input.js).
check("SCENE_SCROLL end branch detects prType === 'other' for just-landed pad",
    /landedPRType\s*===\s*['"]other['"]/.test(scrollBlock),
    'scrollBlock did not mention landedPRType === "other"');

// Helper: drive SCENE_SCROLL to completion with a given scroll state.
function runScrollEnd(opts) {
    sandbox.gameState = sandbox.STATES.SCENE_SCROLL;
    sandbox.terrain = [{ x: 0, y: 500 }, { x: 800, y: 500 }];
    sandbox.landingPads = [];
    sandbox.sceneScrollState = sandbox.createSceneScrollState(
        [{ x: 0, y: 500 }, { x: 800, y: 500 }], // oldTerrain
        [],                                      // oldPads
        [{ x: 0, y: 522 }, { x: 800, y: 522 }], // newTerrain (flat)
        [],                                      // newPads
        !!opts.isInvaderScroll,
        !!opts.isBugfixScroll,
        !!opts.isMissileScroll,
        400                                      // shipStartX
    );
    sandbox.ship = { x: 400, y: 300, vx: 0, vy: 0, angle: 0, thrusting: false, rotating: null, fuel: 100 };
    sandbox.dt = sandbox.SCENE_SCROLL_DURATION + 0.1; // push timer past duration (t >= 1)
    sandbox.invaderScrollRotateTimer = 999;
    sandbox.bugfixTransitionTimer = 999;
    sandbox.missileTransitionTimer = 999;
    sandbox.techdebtTransitionTimer = 999;
    sandbox.landedPRType = opts.landedPRType || '';
    sandbox.landingPadIndex = -1;
    sandbox.sceneDescentStartY = 0;
    sandbox.sceneDescentTargetY = 0;
    sandbox.sceneDescentTimer = 0;
    scrollReplay.runInContext(sandbox);
}

// AC#3: Security pads (odd count, invader route) → INVADER_SCROLL_ROTATE.
runScrollEnd({ isInvaderScroll: true, landedPRType: 'security' });
check('security pad (invader route) → STATES.INVADER_SCROLL_ROTATE',
    sandbox.gameState === sandbox.STATES.INVADER_SCROLL_ROTATE,
    'gameState: ' + sandbox.gameState);

// AC#3 (alt): Security pads (even count, missile route) → MISSILE_TRANSITION.
runScrollEnd({ isMissileScroll: true, landedPRType: 'security' });
check('security pad (missile route) → STATES.MISSILE_TRANSITION',
    sandbox.gameState === sandbox.STATES.MISSILE_TRANSITION,
    'gameState: ' + sandbox.gameState);

// AC#4: Bugfix pads → BUGFIX_TRANSITION.
runScrollEnd({ isBugfixScroll: true, landedPRType: 'bugfix' });
check('bugfix pad → STATES.BUGFIX_TRANSITION',
    sandbox.gameState === sandbox.STATES.BUGFIX_TRANSITION,
    'gameState: ' + sandbox.gameState);

// AC#2: `other` pads → TECHDEBT_TRANSITION (US-003 under test).
runScrollEnd({ landedPRType: 'other' });
check("`other` pad (landedPRType === 'other') → STATES.TECHDEBT_TRANSITION",
    sandbox.gameState === sandbox.STATES.TECHDEBT_TRANSITION,
    'gameState: ' + sandbox.gameState);
check('`other` pad → techdebtTransitionTimer reset to 0',
    sandbox.techdebtTransitionTimer === 0,
    'techdebtTransitionTimer: ' + sandbox.techdebtTransitionTimer);
check('`other` pad → ship centered at canvas center',
    sandbox.ship.x === sandbox.canvas.width / 2 && sandbox.ship.y === sandbox.canvas.height / 2,
    'ship: (' + sandbox.ship.x + ',' + sandbox.ship.y + ')');
check('`other` pad → sceneScrollState cleared',
    sandbox.sceneScrollState === null,
    'sceneScrollState: ' + sandbox.sceneScrollState);

// AC#5: Feature pads → SCENE_DESCENT (normal path, no *Scroll flag set).
runScrollEnd({ landedPRType: 'feature' });
check('feature pad → STATES.SCENE_DESCENT (unchanged normal-pad path)',
    sandbox.gameState === sandbox.STATES.SCENE_DESCENT,
    'gameState: ' + sandbox.gameState);

console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
