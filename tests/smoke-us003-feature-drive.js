// US-003 (Feature Drive PRD): Route feature pads into DRIVE_TRANSITION.
//
// Dedicated manual-test evidence for Feature Drive story US-003. Covers AC#6
// ("Manual test: landing on each pad type enters the correct flow") by
// exercising ALL five pad-type routes through the real SCENE_SCROLL end
// branch extracted verbatim from js/update.js:
//
//   AC#1 — SCENE_SCROLL end branch detects `prType === 'feature'`
//   AC#2 — feature  → STATES.DRIVE_TRANSITION        (+ driveTransitionTimer=0)
//   AC#3 — security → STATES.INVADER_SCROLL_ROTATE   (odd count)
//   AC#3 — security → STATES.MISSILE_TRANSITION      (even count, missile scroll)
//   AC#4 — bugfix   → STATES.BUGFIX_TRANSITION       (unchanged)
//   AC#5 — other    → STATES.TECHDEBT_TRANSITION     (alternating, unchanged)
//   AC#5 — normal   → STATES.SCENE_DESCENT           (fallthrough, unchanged)
//   AC#6 — manual-test equivalence summary (all routes asserted)
//
// Runtime (not static grep): config.js is loaded into a vm context and the
// real SCENE_SCROLL block bytes are replayed for each pad-type scenario.
//
// Run:  node tests/smoke-us003-feature-drive.js
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

var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    keys: {},
    stopThrustSound: function () {}, startThrustSound: function () {},
    spawnBugWave: function () {},
    setupMissileWorld: function () {},
    setupTechdebtWorld: function () {},
    setupBreakoutWorld: function () {},
    resetShip: function () {}, resetWind: function () {},
    generateTerrain: function () {},
    getLevelConfig: function () { return { gravity: 0.05 }; },
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

check('config.js loaded STATES.DRIVE_TRANSITION',
    sandbox.STATES && sandbox.STATES.DRIVE_TRANSITION === 'drive_transition',
    'STATES.DRIVE_TRANSITION: ' + (sandbox.STATES && sandbox.STATES.DRIVE_TRANSITION));

// Extract the SCENE_SCROLL block from js/update.js (real bytes, no mocks).
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

// AC#1 — static pin: the end branch must detect landedPRType === 'feature'
// directly (not via a pre-computed scroll flag).
check("AC#1: SCENE_SCROLL end branch detects landedPRType === 'feature'",
    /landedPRType\s*===\s*['"]feature['"]/.test(scrollBlock),
    'scrollBlock did not contain the feature-pad detection expression');

function runScrollEnd(opts) {
    sandbox.gameState = sandbox.STATES.SCENE_SCROLL;
    sandbox.terrain = [{ x: 0, y: 500 }, { x: 800, y: 500 }];
    sandbox.landingPads = [];
    sandbox.sceneScrollState = sandbox.createSceneScrollState(
        [{ x: 0, y: 500 }, { x: 800, y: 500 }],
        [],
        [{ x: 0, y: 522 }, { x: 800, y: 522 }],
        [],
        !!opts.isInvaderScroll,
        !!opts.isBugfixScroll,
        !!opts.isMissileScroll,
        400
    );
    sandbox.ship = { x: 400, y: 300, vx: 0, vy: 0, angle: 0, thrusting: false, retroThrusting: false, rotating: null, fuel: 100, invaderVX: 0, invaderVY: 0 };
    sandbox.dt = sandbox.SCENE_SCROLL_DURATION + 0.1;
    sandbox.invaderScrollRotateTimer = 999;
    sandbox.bugfixTransitionTimer = 999;
    sandbox.missileTransitionTimer = 999;
    sandbox.techdebtTransitionTimer = 999;
    sandbox.breakoutTransitionTimer = 999;
    sandbox.driveTransitionTimer = 999;
    sandbox.otherMiniGameCount = opts.otherMiniGameCount != null ? opts.otherMiniGameCount : 0;
    sandbox.landedPRType = opts.landedPRType || '';
    sandbox.landingPadIndex = -1;
    sandbox.sceneDescentStartY = 0;
    sandbox.sceneDescentTargetY = 0;
    sandbox.sceneDescentTimer = 0;
    scrollReplay.runInContext(sandbox);
}

// AC#2 — feature pad → DRIVE_TRANSITION, timer reset, ship centered.
runScrollEnd({ landedPRType: 'feature' });
check('AC#2: feature pad → STATES.DRIVE_TRANSITION',
    sandbox.gameState === sandbox.STATES.DRIVE_TRANSITION,
    'gameState: ' + sandbox.gameState);
check('AC#2: feature pad → driveTransitionTimer reset to 0',
    sandbox.driveTransitionTimer === 0,
    'driveTransitionTimer: ' + sandbox.driveTransitionTimer);
check('AC#2: feature pad → ship centered at canvas center',
    sandbox.ship.x === sandbox.canvas.width / 2 && sandbox.ship.y === sandbox.canvas.height / 2,
    'ship: (' + sandbox.ship.x + ',' + sandbox.ship.y + ')');
check('AC#2: feature pad → ship velocity/angle reset',
    sandbox.ship.vx === 0 && sandbox.ship.vy === 0 && sandbox.ship.angle === 0,
    'ship vx/vy/angle: ' + sandbox.ship.vx + '/' + sandbox.ship.vy + '/' + sandbox.ship.angle);
check('AC#2: feature pad → fuel refilled',
    sandbox.ship.fuel === sandbox.FUEL_MAX,
    'fuel: ' + sandbox.ship.fuel);
check('AC#2: feature pad → sceneScrollState cleared',
    sandbox.sceneScrollState === null,
    'sceneScrollState: ' + sandbox.sceneScrollState);

// AC#3 — security (invader route) unchanged.
runScrollEnd({ isInvaderScroll: true, landedPRType: 'security' });
check('AC#3: security pad (invader route) → STATES.INVADER_SCROLL_ROTATE',
    sandbox.gameState === sandbox.STATES.INVADER_SCROLL_ROTATE,
    'gameState: ' + sandbox.gameState);

// AC#3 — security (missile route) unchanged.
runScrollEnd({ isMissileScroll: true, landedPRType: 'security' });
check('AC#3: security pad (missile route) → STATES.MISSILE_TRANSITION',
    sandbox.gameState === sandbox.STATES.MISSILE_TRANSITION,
    'gameState: ' + sandbox.gameState);

// AC#4 — bugfix unchanged.
runScrollEnd({ isBugfixScroll: true, landedPRType: 'bugfix' });
check('AC#4: bugfix pad → STATES.BUGFIX_TRANSITION',
    sandbox.gameState === sandbox.STATES.BUGFIX_TRANSITION,
    'gameState: ' + sandbox.gameState);

// AC#5 — other pad: first landing routes to TECHDEBT_TRANSITION (odd count).
runScrollEnd({ landedPRType: 'other', otherMiniGameCount: 0 });
check('AC#5: other pad (count 0→1, odd) → STATES.TECHDEBT_TRANSITION',
    sandbox.gameState === sandbox.STATES.TECHDEBT_TRANSITION,
    'gameState: ' + sandbox.gameState);

// AC#5 — normal-pad fallthrough (no flags, non-routed prType) → SCENE_DESCENT.
runScrollEnd({ landedPRType: '' });
check('AC#5: normal pad (no routing flags) → STATES.SCENE_DESCENT',
    sandbox.gameState === sandbox.STATES.SCENE_DESCENT,
    'gameState: ' + sandbox.gameState);

// AC#6 — Manual-test summary: a passing run of THIS file is the manual-test
// equivalent for "landing on each pad type enters the correct flow". Each of
// the five routes above was exercised with the real SCENE_SCROLL bytes.
check('AC#6: manual-test equivalence — all 5 pad-type routes asserted above',
    failed === 0,
    'one or more pad-type routes above failed');

// Sanity: confirm the DRIVE_TRANSITION handler exists to tick the timer and
// advance gameState — otherwise routing into DRIVE_TRANSITION would hang.
check('Sanity: DRIVE_TRANSITION handler present in js/update.js',
    /if\s*\(\s*gameState\s*===\s*STATES\.DRIVE_TRANSITION\s*\)\s*\{[\s\S]*?driveTransitionTimer\s*\+=\s*dt/.test(updateSrc),
    'DRIVE_TRANSITION top-level handler block not found in js/update.js');

console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
