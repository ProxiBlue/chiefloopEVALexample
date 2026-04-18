// US-004: Runtime integration test for the missile command trigger flow.
//
// This test exercises the end-to-end path:
//   STATES.LANDED (security pad, Space press, odd count)  → invader route
//   STATES.LANDED (security pad, Space press, even count) → missile route
//   STATES.SCENE_SCROLL (isMissileScroll=true, timer ≥ duration) → MISSILE_TRANSITION
//
// Runtime (not static): config.js is loaded into a vm context to seed the real
// game globals (STATES, the *PadScroll flags, securityMiniGameCount, the
// createSceneScrollState factory, SCENE_SCROLL_DURATION, canvas constants, etc).
// The two code paths under test are then extracted from input.js / update.js as
// substrings and replayed in that same vm context, so we are testing the exact
// bytes of source that ship — not a re-implementation.
//
// Run:  node tests/integration-us004.js
// Exits 0 on pass, 1 on any failure.

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.resolve(__dirname, '..');
var results = [];
function check(name, ok, detail) {
    results.push({ name: name, ok: !!ok, detail: detail || '' });
    var tag = ok ? 'PASS' : 'FAIL';
    console.log(tag + ' — ' + name + (ok ? '' : ' :: ' + (detail || '')));
}

// ----- Build a stub browser-ish sandbox -----
var sandbox = {
    console: console,
    Math: Math,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Boolean: Boolean,
    JSON: JSON,
    Date: Date,
    // Canvas stub — only width/height are read in the paths under test.
    canvas: { width: 800, height: 600 },
    // Window + addEventListener stub so config/input don't blow up.
    window: { addEventListener: function () {} },
    // Keyboard stub (empty — we only need LANDED/SCROLL routing, no input keys).
    keys: {},
    // Stubs for functions called by startNewGame() body that we don't need to test.
    resetShip: function () { sandbox.ship = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, thrusting: false, rotating: null, fuel: 100 }; },
    resetWind: function () {},
    generateTerrain: function () { sandbox.terrain = [{ x: 0, y: 500 }, { x: 800, y: 500 }]; sandbox.landingPads = []; },
    playClickSound: function () {},
    startThrustSound: function () {},
    requestGameSession: function () {},
    loadRepoData: function () {},
    isHighScore: function () { return false; },
    addToLeaderboard: function () {},
    submitOnlineScore: function () {},
    spawnBugWave: function () {},
    setupMissileWorld: function () { /* stubbed — only state machine transition is under test */ },
    clearBugfixState: function () {},
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function loadFile(relPath) {
    return fs.readFileSync(path.join(REPO, relPath), 'utf8');
}

// Run config.js in the vm context — it's almost pure declarations + one
// function. This gives us real STATES, createSceneScrollState, all PadScroll
// flags, securityMiniGameCount, SCENE_SCROLL_DURATION, etc.
var configSrc = loadFile('js/config.js');
vm.runInContext(configSrc, sandbox, { filename: 'js/config.js' });

// Sanity: states were loaded.
check('config.js loaded STATES.MISSILE_TRANSITION',
    sandbox.STATES && sandbox.STATES.MISSILE_TRANSITION === 'missile_transition',
    'STATES.MISSILE_TRANSITION: ' + (sandbox.STATES && sandbox.STATES.MISSILE_TRANSITION));

check('config.js loaded missilePadScroll = false at init',
    sandbox.missilePadScroll === false,
    'missilePadScroll: ' + sandbox.missilePadScroll);

check('config.js loaded securityMiniGameCount = 0 at init',
    sandbox.securityMiniGameCount === 0,
    'securityMiniGameCount: ' + sandbox.securityMiniGameCount);

check('config.js loaded createSceneScrollState function',
    typeof sandbox.createSceneScrollState === 'function');

// ----- Extract the LANDED→liftoff branch from input.js -----
// The branch spans from `} else if (gameState === STATES.LANDED && celebrationReady) {`
// through the matching brace ending `gameState = STATES.SCENE_LIFTOFF;`.
var inputSrc = loadFile('js/input.js');
var landedSig = '} else if (gameState === STATES.LANDED && celebrationReady) {';
var landedStart = inputSrc.indexOf(landedSig);
if (landedStart < 0) {
    check('input.js contains LANDED Space-press branch', false, 'signature not found');
    process.exit(1);
}
// Walk from the `{` after celebrationReady) to the matching `}`.
var braceOpen = inputSrc.indexOf('{', landedStart + landedSig.length - 1);
var depth = 0;
var braceClose = -1;
for (var i = braceOpen; i < inputSrc.length; i++) {
    if (inputSrc[i] === '{') depth++;
    else if (inputSrc[i] === '}') {
        depth--;
        if (depth === 0) { braceClose = i; break; }
    }
}
if (braceClose < 0) {
    check('input.js LANDED branch brace-walked successfully', false, 'unmatched braces');
    process.exit(1);
}
// Body is exclusive of the outer `{` and `}`.
var landedBody = inputSrc.slice(braceOpen + 1, braceClose);
check('input.js LANDED Space-press branch extracted',
    landedBody.indexOf('securityPadScroll') >= 0 &&
    landedBody.indexOf('missilePadScroll') >= 0 &&
    landedBody.indexOf('securityMiniGameCount') >= 0,
    'body length ' + landedBody.length);

// Wrap the extracted body as a callable script for repeated replay.
var landedReplay = new vm.Script('(function () {\n' + landedBody + '\n}).call(this);', { filename: 'landed-body-extracted' });

// ----- Seed the LANDED entry state -----
function enterLandedAsSecurityPad() {
    sandbox.gameState = sandbox.STATES.LANDED;
    sandbox.celebrationReady = true;
    sandbox.landedPRType = 'security';
    sandbox.ship = { x: 400, y: 300, vx: 0, vy: 0, angle: 0, thrusting: false, rotating: null, fuel: 100 };
    sandbox.sceneLiftoffStartY = 0;
}

// ----- First landing: odd count → invader route -----
enterLandedAsSecurityPad();
landedReplay.runInContext(sandbox);

check('1st security landing: gameState → SCENE_LIFTOFF',
    sandbox.gameState === sandbox.STATES.SCENE_LIFTOFF,
    'gameState: ' + sandbox.gameState);
check('1st security landing: securityPadScroll = true',
    sandbox.securityPadScroll === true,
    'securityPadScroll: ' + sandbox.securityPadScroll);
check('1st security landing: missilePadScroll = false (odd count)',
    sandbox.missilePadScroll === false,
    'missilePadScroll: ' + sandbox.missilePadScroll);
check('1st security landing: securityMiniGameCount = 1',
    sandbox.securityMiniGameCount === 1,
    'securityMiniGameCount: ' + sandbox.securityMiniGameCount);

// ----- Second landing: even count → missile route -----
enterLandedAsSecurityPad();
landedReplay.runInContext(sandbox);

check('2nd security landing: gameState → SCENE_LIFTOFF',
    sandbox.gameState === sandbox.STATES.SCENE_LIFTOFF,
    'gameState: ' + sandbox.gameState);
check('2nd security landing: securityPadScroll flipped to false (even count override)',
    sandbox.securityPadScroll === false,
    'securityPadScroll: ' + sandbox.securityPadScroll);
check('2nd security landing: missilePadScroll = true (even count)',
    sandbox.missilePadScroll === true,
    'missilePadScroll: ' + sandbox.missilePadScroll);
check('2nd security landing: securityMiniGameCount = 2',
    sandbox.securityMiniGameCount === 2,
    'securityMiniGameCount: ' + sandbox.securityMiniGameCount);

// ----- Now simulate the SCENE_SCROLL end routing in update.js -----
// Threaded through createSceneScrollState with isMissileScroll=true, then
// trigger the else-if chain at scroll-end (t >= 1).
var updateSrc = loadFile('js/update.js');
var scrollSig = 'if (gameState === STATES.SCENE_SCROLL && sceneScrollState) {';
var scrollStart = updateSrc.indexOf(scrollSig);
if (scrollStart < 0) {
    check('update.js contains SCENE_SCROLL block', false, 'signature not found');
    process.exit(1);
}
// Walk to matching `}`.
var sOpen = updateSrc.indexOf('{', scrollStart + scrollSig.length - 1);
var sDepth = 0;
var sClose = -1;
for (var j = sOpen; j < updateSrc.length; j++) {
    if (updateSrc[j] === '{') sDepth++;
    else if (updateSrc[j] === '}') {
        sDepth--;
        if (sDepth === 0) { sClose = j; break; }
    }
}
if (sClose < 0) {
    check('update.js SCENE_SCROLL block brace-walked successfully', false, 'unmatched braces');
    process.exit(1);
}
// Include the outer if so the gameState gate actually executes.
var scrollBlock = updateSrc.slice(scrollStart, sClose + 1);
check('update.js SCENE_SCROLL block extracted and routes wasMissileScroll',
    scrollBlock.indexOf('wasMissileScroll') >= 0 &&
    scrollBlock.indexOf('STATES.MISSILE_TRANSITION') >= 0,
    'block length ' + scrollBlock.length);

var scrollReplay = new vm.Script('(function () {\n' + scrollBlock + '\n}).call(this);', { filename: 'scroll-block-extracted' });

// Seed: we're entering SCENE_SCROLL with isMissileScroll=true and a timer
// already near completion. Use dt that pushes timer past SCENE_SCROLL_DURATION.
sandbox.gameState = sandbox.STATES.SCENE_SCROLL;
sandbox.terrain = [{ x: 0, y: 500 }, { x: 800, y: 500 }];
sandbox.landingPads = [];
sandbox.sceneScrollState = sandbox.createSceneScrollState(
    [{ x: 0, y: 500 }, { x: 800, y: 500 }], // oldTerrain
    [],                                      // oldPads
    [{ x: 0, y: 522 }, { x: 800, y: 522 }], // newTerrain (flat)
    [],                                      // newPads (no pads on mini-game)
    false,                                   // isInvaderScroll
    false,                                   // isBugfixScroll
    true,                                    // isMissileScroll ← under test
    400                                      // shipStartX
);
sandbox.ship = { x: 400, y: 300, vx: 0, vy: 0, angle: 0, thrusting: false, rotating: null, fuel: 100 };
sandbox.dt = sandbox.SCENE_SCROLL_DURATION + 0.1; // force t >= 1 on first tick
sandbox.missileTransitionTimer = 999; // will be overwritten by wasMissileScroll branch
sandbox.landingPadIndex = -1;

scrollReplay.runInContext(sandbox);

check('SCENE_SCROLL end with isMissileScroll=true → gameState = MISSILE_TRANSITION',
    sandbox.gameState === sandbox.STATES.MISSILE_TRANSITION,
    'gameState: ' + sandbox.gameState);
check('SCENE_SCROLL end with isMissileScroll=true → sceneScrollState cleared',
    sandbox.sceneScrollState === null,
    'sceneScrollState: ' + sandbox.sceneScrollState);
check('SCENE_SCROLL end with isMissileScroll=true → missileTransitionTimer reset to 0',
    sandbox.missileTransitionTimer === 0,
    'missileTransitionTimer: ' + sandbox.missileTransitionTimer);
check('SCENE_SCROLL end with isMissileScroll=true → ship centered',
    sandbox.ship.x === sandbox.canvas.width / 2 && sandbox.ship.y === sandbox.canvas.height / 2,
    'ship: (' + sandbox.ship.x + ', ' + sandbox.ship.y + ')');

// ----- Summary -----
var failed = results.filter(function (r) { return !r.ok; }).length;
var passed = results.length - failed;
console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
