// US-011 (Code Breaker): BREAKOUT_RETURN → next level.
//
// Extracts the real BREAKOUT_RETURN / BREAKOUT_COMPLETE / BREAKOUT_PLAYING
// update blocks, the clearBreakoutState helper, and crashShipInBreakout /
// loseBreakoutBall from js/update.js and replays them in a vm sandbox seeded
// by js/config.js. Mirrors the harness used by smoke-breakout-us008/us009/us010.
//
// Acceptance criteria mapped (.chief/prds/codebreaker/prd.md US-011):
//   AC#1  After BREAKOUT_COMPLETE_DELAY, transition to BREAKOUT_RETURN (and
//         the BREAKOUT_RETURN rotation timer starts at 0).
//   AC#2  BREAKOUT_RETURN flips the ship back upright (π → 0, 0.5s ease),
//         then calls resetShip(), generateTerrain(), increments currentLevel,
//         clears all breakout arrays/state, and transitions to STATES.PLAYING.
//   AC#3  After return, ship has full fuel (via resetShip) on the new level.
//   AC#4  Loss path (crash from BREAKOUT_PLAYING) clears all breakout state.
//
// Run:  node tests/smoke-breakout-us011.js
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

function loadFile(relPath) {
    return fs.readFileSync(path.join(REPO, relPath), 'utf8');
}

var rngQueue = [];
function nextRandom() {
    if (rngQueue.length > 0) return rngQueue.shift();
    return 0.5;
}

var sandbox = {
    console: console,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Boolean: Boolean,
    JSON: JSON,
    Date: Date,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    keys: {},
};
sandbox.Math = Object.create(Math);
sandbox.Math.random = function () { return nextRandom(); };
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Seed STATES + BREAKOUT_* constants + breakout* state vars.
vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });
sandbox.SHIP_SIZE = 40;
sandbox.FUEL_MAX = 100;
sandbox.PIXELS_PER_METER = 10;

// Hook counters for crash FX pipeline + world-reset helpers invoked by
// BREAKOUT_RETURN's tail. These are stubs; the assertions check call counts.
sandbox.__explosionSpawns = 0;
sandbox.__shakeStarts = 0;
sandbox.__thrustStops = 0;
sandbox.__explosionSoundPlays = 0;
sandbox.__celebrationSpawns = 0;
sandbox.__celebrationUpdates = 0;
sandbox.__resetShipCalls = 0;
sandbox.__resetWindCalls = 0;
sandbox.__generateTerrainCalls = 0;
sandbox.__getLevelConfigCalls = 0;
sandbox.spawnExplosion = function () { sandbox.__explosionSpawns++; };
sandbox.startScreenShake = function () { sandbox.__shakeStarts++; };
sandbox.stopThrustSound = function () { sandbox.__thrustStops++; };
sandbox.playExplosionSound = function () { sandbox.__explosionSoundPlays++; };
sandbox.spawnCelebration = function () { sandbox.__celebrationSpawns++; };
sandbox.updateCelebration = function () { sandbox.__celebrationUpdates++; };
sandbox.playBreakoutPowerupSound = function () {};
sandbox.resetShip = function () {
    sandbox.__resetShipCalls++;
    sandbox.ship.x = sandbox.canvas.width / 2;
    sandbox.ship.y = sandbox.canvas.height / 3;
    sandbox.ship.vx = 0;
    sandbox.ship.vy = 0;
    sandbox.ship.angle = 0;
    sandbox.ship.thrusting = false;
    sandbox.ship.retroThrusting = false;
    sandbox.ship.rotating = null;
    sandbox.ship.fuel = sandbox.FUEL_MAX;
};
sandbox.resetWind = function () { sandbox.__resetWindCalls++; };
sandbox.generateTerrain = function () { sandbox.__generateTerrainCalls++; };
sandbox.getLevelConfig = function () {
    sandbox.__getLevelConfigCalls++;
    return { gravity: 1.6 };
};
sandbox.landingResult = '';

// ===== Extract update.js bits =====
var updateSrc = loadFile('js/update.js');

function extractFunction(sig) {
    var start = updateSrc.indexOf(sig);
    if (start < 0) return null;
    var open = updateSrc.indexOf('{', start);
    var depth = 0;
    for (var i = open; i < updateSrc.length; i++) {
        if (updateSrc[i] === '{') depth++;
        else if (updateSrc[i] === '}') {
            depth--;
            if (depth === 0) return updateSrc.slice(start, i + 1);
        }
    }
    return null;
}

var crashSrc = extractFunction('function crashShipInBreakout(');
var loseSrc = extractFunction('function loseBreakoutBall(');
var clearSrc = extractFunction('function clearBreakoutState(');
var activateSrc = extractFunction('function activateBreakoutPowerup(');
var particlesSrc = extractFunction('function spawnBreakoutBrickParticles(');

check('update.js: clearBreakoutState defined', !!clearSrc);
check('update.js: crashShipInBreakout defined', !!crashSrc);
check('update.js: loseBreakoutBall defined', !!loseSrc);
check('update.js: activateBreakoutPowerup defined', !!activateSrc);
check('update.js: spawnBreakoutBrickParticles defined', !!particlesSrc);

vm.runInContext(particlesSrc, sandbox, { filename: 'spawnBreakoutBrickParticles' });
vm.runInContext(activateSrc, sandbox, { filename: 'activateBreakoutPowerup' });
vm.runInContext(clearSrc, sandbox, { filename: 'clearBreakoutState' });
vm.runInContext(crashSrc, sandbox, { filename: 'crashShipInBreakout' });
vm.runInContext(loseSrc, sandbox, { filename: 'loseBreakoutBall' });

function extractBlock(sig) {
    var start = updateSrc.indexOf(sig);
    if (start < 0) return { start: -1, body: null };
    var braceOpen = updateSrc.indexOf('{', start + sig.length - 1);
    var depth = 0;
    for (var i = braceOpen; i < updateSrc.length; i++) {
        if (updateSrc[i] === '{') depth++;
        else if (updateSrc[i] === '}') {
            depth--;
            if (depth === 0) {
                return { start: start, body: updateSrc.slice(braceOpen + 1, i) };
            }
        }
    }
    return { start: start, body: null };
}

var playing = extractBlock('if (gameState === STATES.BREAKOUT_PLAYING) {');
var complete = extractBlock('if (gameState === STATES.BREAKOUT_COMPLETE) {');
var returnBlock = extractBlock('if (gameState === STATES.BREAKOUT_RETURN) {');
check('update.js: BREAKOUT_PLAYING block located', playing.body !== null);
check('update.js: BREAKOUT_COMPLETE block located', complete.body !== null);
check('update.js: BREAKOUT_RETURN block located', returnBlock.body !== null);

// ===== Source-level AC assertions =====
// AC#1 — BREAKOUT_COMPLETE gates advance on BREAKOUT_COMPLETE_DELAY and zeros
//        the return rotation timer before flipping to BREAKOUT_RETURN so the
//        flip animation starts from t=0 instead of a stale residual timer.
check('AC#1 COMPLETE advances to BREAKOUT_RETURN after BREAKOUT_COMPLETE_DELAY',
    /breakoutCompleteTimer\s*>=\s*BREAKOUT_COMPLETE_DELAY/.test(complete.body) &&
    /gameState\s*=\s*STATES\.BREAKOUT_RETURN/.test(complete.body));
check('AC#1 COMPLETE zeros breakoutReturnRotationTimer before handoff',
    /breakoutReturnRotationTimer\s*=\s*0/.test(complete.body));

// AC#2 source checks — the RETURN block:
//  - ticks breakoutReturnRotationTimer
//  - uses BREAKOUT_PADDLE_FLIP_DURATION for the 0.5s flip
//  - flips ship.angle via easeInOutCubic on (1 - eased)
//  - calls clearBreakoutState, resetShip, resetWind, generateTerrain
//  - increments currentLevel
//  - transitions to STATES.PLAYING
check('AC#2 RETURN ticks breakoutReturnRotationTimer',
    /breakoutReturnRotationTimer\s*\+=\s*dt/.test(returnBlock.body));
check('AC#2 RETURN uses BREAKOUT_PADDLE_FLIP_DURATION for flip length',
    /BREAKOUT_PADDLE_FLIP_DURATION/.test(returnBlock.body));
check('AC#2 RETURN rotates ship.angle from π back to 0',
    /ship\.angle\s*=\s*Math\.PI\s*\*\s*\(\s*1\s*-\s*easedBR\s*\)/.test(returnBlock.body));
check('AC#2 RETURN calls clearBreakoutState()',
    /clearBreakoutState\s*\(\s*\)/.test(returnBlock.body));
check('AC#2 RETURN increments currentLevel',
    /currentLevel\+\+/.test(returnBlock.body));
check('AC#2 RETURN calls resetShip()',
    /resetShip\s*\(\s*\)/.test(returnBlock.body));
check('AC#2 RETURN calls resetWind()',
    /resetWind\s*\(\s*\)/.test(returnBlock.body));
check('AC#2 RETURN calls generateTerrain()',
    /generateTerrain\s*\(\s*\)/.test(returnBlock.body));
check('AC#2 RETURN transitions to STATES.PLAYING',
    /gameState\s*=\s*STATES\.PLAYING/.test(returnBlock.body));

// AC#4 source check — PLAYING clears breakout state if we landed in CRASHED
// this tick (mirrors BUGFIX_PLAYING's loss-path cleanup).
check('AC#4 PLAYING clears breakout state on CRASHED tail',
    /gameState\s*===\s*STATES\.CRASHED[\s\S]*?clearBreakoutState\s*\(\s*\)/.test(playing.body));

// ===== Runtime replay =====
var playScript = new vm.Script(
    '(function () {\n' + playing.body + '\n}).call(this);',
    { filename: 'breakout-playing' }
);
var completeScript = new vm.Script(
    '(function () {\n' + complete.body + '\n}).call(this);',
    { filename: 'breakout-complete' }
);
var returnScript = new vm.Script(
    '(function () {\n' + returnBlock.body + '\n}).call(this);',
    { filename: 'breakout-return' }
);

function stepPlaying(n) {
    for (var k = 0; k < n; k++) playScript.runInContext(sandbox);
}
function stepComplete(n) {
    for (var k = 0; k < n; k++) completeScript.runInContext(sandbox);
}
function stepReturn(n) {
    // Mirror the real outer `if (gameState === STATES.BREAKOUT_RETURN)` guard
    // so that once the block transitions state to PLAYING, we don't re-enter
    // the body and restart the flip animation on the next frame.
    for (var k = 0; k < n; k++) {
        if (sandbox.gameState !== sandbox.STATES.BREAKOUT_RETURN) break;
        returnScript.runInContext(sandbox);
    }
}

function resetShipLocal() {
    sandbox.ship = {
        x: sandbox.canvas.width / 2,
        y: sandbox.canvas.height - sandbox.BREAKOUT_PADDLE_Y_OFFSET - sandbox.SHIP_SIZE / 2,
        vx: 0, vy: 0, angle: Math.PI,
        thrusting: false, retroThrusting: false,
        rotating: null, fuel: 37 // deliberate mid-value so resetShip → FUEL_MAX is observable
    };
}

function resetWorld(seedActive) {
    sandbox.gameState = sandbox.STATES.BREAKOUT_COMPLETE;
    sandbox.dt = 1 / 60;
    sandbox.currentLevel = 3;
    sandbox.GRAVITY = 1.6;
    sandbox.THRUST_POWER = 4;
    sandbox.score = 1000;
    sandbox.breakoutScore = 340;
    sandbox.breakoutBricksDestroyed = 10;
    sandbox.breakoutBricksTotal = 10;
    sandbox.breakoutCompleteTimer = 0;
    sandbox.breakoutCompletionBonus = sandbox.BREAKOUT_POINTS_COMPLETION;
    sandbox.breakoutExtraBallBonus =
        sandbox.BREAKOUT_POINTS_BALLS_REMAINING * 2;
    sandbox.breakoutTransitionTimer = sandbox.BREAKOUT_TRANSITION_DURATION;
    sandbox.breakoutReturnRotationTimer = 0;
    sandbox.breakoutBallStuck = false;
    sandbox.breakoutBricks = seedActive
        ? [{ x: 10, y: 20, w: 50, h: 15, hp: 2, maxHp: 2,
             color: '#abc', label: 'x.go', revealAt: 0, flashTimer: 0 }]
        : [];
    sandbox.breakoutPowerups = seedActive
        ? [{ x: 100, y: 100, vy: 60, size: 30, type: 'wide',
             letter: 'W', label: 'refactor()', color: '#4CAF50' }]
        : [];
    sandbox.breakoutParticles = seedActive
        ? [{ x: 50, y: 50, vx: 10, vy: -10, life: 0.3, maxLife: 0.5, color: '#abc' }]
        : [];
    sandbox.breakoutBalls = seedActive
        ? [{ x: 200, y: 250, vx: 120, vy: -200 }]
        : [];
    sandbox.breakoutExtraBalls = seedActive ? 2 : 0;
    sandbox.breakoutActivePowerup = seedActive ? 'wide' : null;
    sandbox.breakoutPowerupTimer = seedActive ? 4.0 : 0;
    sandbox.breakoutPaddleWidth = seedActive
        ? sandbox.BREAKOUT_PADDLE_WIDTH * sandbox.BREAKOUT_POWERUP_WIDE_MULTIPLIER
        : sandbox.BREAKOUT_PADDLE_WIDTH;
    sandbox.breakoutPaddleX =
        (sandbox.canvas.width - sandbox.breakoutPaddleWidth) / 2;
    sandbox.breakoutBallX = sandbox.canvas.width / 2;
    sandbox.breakoutBallY = 300;
    sandbox.breakoutBallVX = 0;
    sandbox.breakoutBallVY = -200;
    resetShipLocal();
    sandbox.keys = {};
    sandbox.__explosionSpawns = 0;
    sandbox.__shakeStarts = 0;
    sandbox.__thrustStops = 0;
    sandbox.__explosionSoundPlays = 0;
    sandbox.__celebrationSpawns = 0;
    sandbox.__celebrationUpdates = 0;
    sandbox.__resetShipCalls = 0;
    sandbox.__resetWindCalls = 0;
    sandbox.__generateTerrainCalls = 0;
    sandbox.__getLevelConfigCalls = 0;
    sandbox.landingResult = '';
    rngQueue.length = 0;
}

// ===== AC#1: After delay, BREAKOUT_COMPLETE → BREAKOUT_RETURN with rotation
// timer starting at 0 (not leaked from a prior state).
resetWorld(true);
sandbox.breakoutReturnRotationTimer = 99; // simulate stale value
var framesToDelay = Math.ceil(sandbox.BREAKOUT_COMPLETE_DELAY * 60) + 2;
stepComplete(framesToDelay);
check('AC#1 Advances to BREAKOUT_RETURN after BREAKOUT_COMPLETE_DELAY',
    sandbox.gameState === sandbox.STATES.BREAKOUT_RETURN);
check('AC#1 breakoutReturnRotationTimer zeroed on entry (stale 99 wiped)',
    sandbox.breakoutReturnRotationTimer === 0);

// ===== AC#2: RETURN flip animation — ship.angle eases from π back to 0
// WITHOUT completing the transition mid-animation (clearBreakoutState not yet
// called, state not yet PLAYING, currentLevel not yet incremented).
resetWorld(true);
sandbox.gameState = sandbox.STATES.BREAKOUT_RETURN;
sandbox.breakoutReturnRotationTimer = 0;
sandbox.ship.angle = Math.PI;
stepReturn(1); // one frame in → eased is small positive

check('AC#2 Mid-flip: ship.angle decreased from π (animation started)',
    sandbox.ship.angle < Math.PI && sandbox.ship.angle > 0);
check('AC#2 Mid-flip: still in BREAKOUT_RETURN state (animation incomplete)',
    sandbox.gameState === sandbox.STATES.BREAKOUT_RETURN);
check('AC#2 Mid-flip: currentLevel NOT yet incremented',
    sandbox.currentLevel === 3);
check('AC#2 Mid-flip: resetShip NOT yet called',
    sandbox.__resetShipCalls === 0);
check('AC#2 Mid-flip: generateTerrain NOT yet called',
    sandbox.__generateTerrainCalls === 0);
check('AC#2 Mid-flip: bricks still intact (clearBreakoutState not yet called)',
    sandbox.breakoutBricks.length === 1);

// Midpoint — around t=0.25s (half of 0.5s flip) the easeInOutCubic midpoint is
// 0.5, so ship.angle should be roughly π/2 (tolerate ±0.2 for dt quantization).
resetWorld(true);
sandbox.gameState = sandbox.STATES.BREAKOUT_RETURN;
sandbox.breakoutReturnRotationTimer = 0;
sandbox.ship.angle = Math.PI;
var midFrames = Math.round(sandbox.BREAKOUT_PADDLE_FLIP_DURATION * 30);
stepReturn(midFrames);
check('AC#2 Half-flip: ship.angle near π/2 (within 0.3 rad of midpoint)',
    Math.abs(sandbox.ship.angle - Math.PI / 2) < 0.3);

// ===== AC#2 + AC#3: Animation completion → clear + level++ + reset + PLAYING
resetWorld(true);
sandbox.gameState = sandbox.STATES.BREAKOUT_RETURN;
sandbox.breakoutReturnRotationTimer = 0;
sandbox.ship.angle = Math.PI;
sandbox.ship.fuel = 7;
var totalFrames = Math.ceil(sandbox.BREAKOUT_PADDLE_FLIP_DURATION * 60) + 3;
stepReturn(totalFrames);

check('AC#2 After flip: currentLevel incremented (3 → 4)',
    sandbox.currentLevel === 4);
check('AC#2 After flip: clearBreakoutState wiped breakoutBricks',
    sandbox.breakoutBricks.length === 0);
check('AC#2 After flip: clearBreakoutState wiped breakoutPowerups',
    sandbox.breakoutPowerups.length === 0);
check('AC#2 After flip: clearBreakoutState wiped breakoutParticles',
    sandbox.breakoutParticles.length === 0);
check('AC#2 After flip: clearBreakoutState wiped breakoutBalls',
    sandbox.breakoutBalls.length === 0);
check('AC#2 After flip: breakoutExtraBalls reset to 0',
    sandbox.breakoutExtraBalls === 0);
check('AC#2 After flip: breakoutActivePowerup cleared',
    sandbox.breakoutActivePowerup === null);
check('AC#2 After flip: breakoutPowerupTimer zeroed',
    sandbox.breakoutPowerupTimer === 0);
check('AC#2 After flip: breakoutPaddleWidth restored to base constant',
    sandbox.breakoutPaddleWidth === sandbox.BREAKOUT_PADDLE_WIDTH);
check('AC#2 After flip: breakoutBricksDestroyed zeroed',
    sandbox.breakoutBricksDestroyed === 0);
check('AC#2 After flip: breakoutBricksTotal zeroed',
    sandbox.breakoutBricksTotal === 0);
// breakoutScore is intentionally NOT reset by clearBreakoutState — the round's
// points were already banked into the global `score` by US-007's brick code,
// and setupBreakoutWorld() re-zeroes breakoutScore on the next round's entry.
// This mirrors the "AC#6 breakoutScore preserved" assertion in the US-009
// smoke test.
check('AC#2 After flip: breakoutScore preserved (banked in global score already)',
    sandbox.breakoutScore === 340);
check('AC#2 After flip: resetShip called',
    sandbox.__resetShipCalls === 1);
check('AC#2 After flip: resetWind called',
    sandbox.__resetWindCalls === 1);
check('AC#2 After flip: generateTerrain called',
    sandbox.__generateTerrainCalls === 1);
check('AC#2 After flip: gameState = STATES.PLAYING',
    sandbox.gameState === sandbox.STATES.PLAYING);
check('AC#3 After flip: ship.fuel = FUEL_MAX (full fuel on new level)',
    sandbox.ship.fuel === sandbox.FUEL_MAX);
check('AC#3 After flip: ship.angle snapped to 0 (upright)',
    Math.abs(sandbox.ship.angle) < 0.01);
check('AC#3 After flip: global `score` preserved across return (no reset)',
    sandbox.score === 1000);

// ===== AC#4: Loss path — crashShipInBreakout from BREAKOUT_PLAYING clears
// breakout state. We stand up a world mid-round, seed an already-past-bottom
// primary ball with no extras, step PLAYING once, and assert:
//  - gameState became CRASHED (via loseBreakoutBall → crashShipInBreakout)
//  - every breakout array / counter / timer was wiped by clearBreakoutState
resetWorld(true);
sandbox.gameState = sandbox.STATES.BREAKOUT_PLAYING;
sandbox.breakoutBricksDestroyed = 2;
sandbox.breakoutBricksTotal = 10;
// Seed primary ball already past bottom (needs to clear its radius after one
// integration tick — +10 buffer is plenty).
sandbox.breakoutBallY = sandbox.canvas.height + 10;
sandbox.breakoutBallX = 400;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 200;
sandbox.breakoutBallStuck = false;
// No extras banked → loseBreakoutBall calls crashShipInBreakout.
sandbox.breakoutExtraBalls = 0;
sandbox.breakoutBalls = [];
stepPlaying(1);

check('AC#4 Loss path: gameState is CRASHED after ball loss with no extras',
    sandbox.gameState === sandbox.STATES.CRASHED);
check('AC#4 Loss path: breakoutBricks cleared on CRASHED entry',
    sandbox.breakoutBricks.length === 0);
check('AC#4 Loss path: breakoutPowerups cleared on CRASHED entry',
    sandbox.breakoutPowerups.length === 0);
check('AC#4 Loss path: breakoutParticles cleared on CRASHED entry',
    sandbox.breakoutParticles.length === 0);
check('AC#4 Loss path: breakoutBalls cleared on CRASHED entry',
    sandbox.breakoutBalls.length === 0);
check('AC#4 Loss path: breakoutBricksDestroyed zeroed on CRASHED entry',
    sandbox.breakoutBricksDestroyed === 0);
check('AC#4 Loss path: breakoutBricksTotal zeroed on CRASHED entry',
    sandbox.breakoutBricksTotal === 0);
check('AC#4 Loss path: breakoutExtraBalls zeroed',
    sandbox.breakoutExtraBalls === 0);
check('AC#4 Loss path: breakoutActivePowerup cleared',
    sandbox.breakoutActivePowerup === null);
check('AC#4 Loss path: breakoutPowerupTimer zeroed',
    sandbox.breakoutPowerupTimer === 0);
check('AC#4 Loss path: breakoutPaddleWidth restored to base',
    sandbox.breakoutPaddleWidth === sandbox.BREAKOUT_PADDLE_WIDTH);
check('AC#4 Loss path: crash FX fired (explosion + shake + sound)',
    sandbox.__explosionSpawns === 1 &&
    sandbox.__shakeStarts === 1 &&
    sandbox.__explosionSoundPlays === 1);
check('AC#4 Loss path: landingResult set to "Ball lost"',
    sandbox.landingResult === 'Ball lost');

// ===== Summary =====
var failed = results.filter(function (r) { return !r.ok; }).length;
var passed = results.length - failed;
console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
