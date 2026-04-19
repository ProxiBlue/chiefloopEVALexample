// US-010 (Code Breaker): Win condition + BREAKOUT_COMPLETE.
//
// Extracts the real BREAKOUT_PLAYING block and the BREAKOUT_COMPLETE update
// handler from js/update.js and replays them in a vm sandbox seeded by
// js/config.js. Mirrors the harness used by smoke-breakout-us008/us009.
//
// Acceptance criteria mapped (.chief/prds/codebreaker/prd.md):
//   AC#1  When breakoutBricksDestroyed >= breakoutBricksTotal, transition to
//         STATES.BREAKOUT_COMPLETE.
//   AC#2  On entering BREAKOUT_COMPLETE:
//           - Award BREAKOUT_POINTS_COMPLETION.
//           - Award BREAKOUT_POINTS_BALLS_REMAINING × breakoutExtraBalls.
//           - Add bonuses to both breakoutScore and global `score`.
//   AC#3  Results overlay presents the breakdown (source-level check that the
//         renderer writes the required text).
//   AC#4  Celebration particles fire on entry.
//   AC#5  Results display for BREAKOUT_COMPLETE_DELAY seconds, then advance.
//
// Run:  node tests/smoke-breakout-us010.js
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

// Hooks consumed by crashShipInBreakout + BREAKOUT_COMPLETE entry.
sandbox.__explosionSpawns = 0;
sandbox.__shakeStarts = 0;
sandbox.__thrustStops = 0;
sandbox.__explosionSoundPlays = 0;
sandbox.__celebrationSpawns = 0;
sandbox.__celebrationUpdates = 0;
sandbox.__lastCelebrationXY = null;
sandbox.spawnExplosion = function () { sandbox.__explosionSpawns++; };
sandbox.startScreenShake = function () { sandbox.__shakeStarts++; };
sandbox.stopThrustSound = function () { sandbox.__thrustStops++; };
sandbox.playExplosionSound = function () { sandbox.__explosionSoundPlays++; };
sandbox.spawnCelebration = function (x, y) {
    sandbox.__celebrationSpawns++;
    sandbox.__lastCelebrationXY = { x: x, y: y };
};
sandbox.updateCelebration = function () { sandbox.__celebrationUpdates++; };
sandbox.playBreakoutPowerupSound = function () {};
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
var activateSrc = extractFunction('function activateBreakoutPowerup(');
var particlesSrc = extractFunction('function spawnBreakoutBrickParticles(');
check('update.js: crashShipInBreakout defined', !!crashSrc);
check('update.js: loseBreakoutBall defined', !!loseSrc);
check('update.js: activateBreakoutPowerup defined', !!activateSrc);
check('update.js: spawnBreakoutBrickParticles defined', !!particlesSrc);
vm.runInContext(particlesSrc, sandbox, { filename: 'spawnBreakoutBrickParticles' });
vm.runInContext(activateSrc, sandbox, { filename: 'activateBreakoutPowerup' });
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
check('update.js: BREAKOUT_PLAYING block located', playing.body !== null);
check('update.js: BREAKOUT_COMPLETE block located', complete.body !== null);

// Source-level sanity — AC#1 (transition) + AC#2 (bonuses) + AC#4 (celebration)
check('update.js: PLAYING checks breakoutBricksDestroyed >= breakoutBricksTotal',
    /breakoutBricksDestroyed\s*>=\s*breakoutBricksTotal/.test(playing.body));
check('update.js: PLAYING sets gameState = STATES.BREAKOUT_COMPLETE',
    /gameState\s*=\s*STATES\.BREAKOUT_COMPLETE/.test(playing.body));
check('update.js: PLAYING awards BREAKOUT_POINTS_COMPLETION',
    /BREAKOUT_POINTS_COMPLETION/.test(playing.body));
check('update.js: PLAYING awards BREAKOUT_POINTS_BALLS_REMAINING * breakoutExtraBalls',
    /BREAKOUT_POINTS_BALLS_REMAINING\s*\*\s*breakoutExtraBalls/.test(playing.body));
check('update.js: PLAYING calls spawnCelebration on win',
    /spawnCelebration\s*\(/.test(playing.body));
check('update.js: COMPLETE advances to STATES.BREAKOUT_RETURN',
    /gameState\s*=\s*STATES\.BREAKOUT_RETURN/.test(complete.body));
check('update.js: COMPLETE gates advance on BREAKOUT_COMPLETE_DELAY',
    /breakoutCompleteTimer\s*>=\s*BREAKOUT_COMPLETE_DELAY/.test(complete.body));

var playScript = new vm.Script(
    '(function () {\n' + playing.body + '\n}).call(this);',
    { filename: 'breakout-playing' }
);
var completeScript = new vm.Script(
    '(function () {\n' + complete.body + '\n}).call(this);',
    { filename: 'breakout-complete' }
);

function stepPlaying(n) {
    for (var k = 0; k < n; k++) playScript.runInContext(sandbox);
}
function stepComplete(n) {
    for (var k = 0; k < n; k++) completeScript.runInContext(sandbox);
}

function resetWorld() {
    sandbox.gameState = sandbox.STATES.BREAKOUT_PLAYING;
    sandbox.dt = 1 / 60;
    sandbox.currentLevel = 1;
    sandbox.score = 0;
    sandbox.breakoutScore = 0;
    sandbox.breakoutBricksDestroyed = 0;
    sandbox.breakoutBricksTotal = 0;
    sandbox.breakoutCompleteTimer = 0;
    sandbox.breakoutCompletionBonus = 0;
    sandbox.breakoutExtraBallBonus = 0;
    sandbox.breakoutTransitionTimer = sandbox.BREAKOUT_TRANSITION_DURATION;
    sandbox.breakoutBallStuck = false;
    sandbox.breakoutBricks = [];
    sandbox.breakoutPowerups = [];
    sandbox.breakoutParticles = [];
    sandbox.breakoutBalls = [];
    sandbox.breakoutExtraBalls = 0;
    sandbox.breakoutPaddleWidth = sandbox.BREAKOUT_PADDLE_WIDTH;
    sandbox.breakoutActivePowerup = null;
    sandbox.breakoutPowerupTimer = 0;
    sandbox.breakoutPaddleX = (sandbox.canvas.width - sandbox.breakoutPaddleWidth) / 2;
    sandbox.breakoutBallX = sandbox.canvas.width / 2;
    sandbox.breakoutBallY = 300;
    sandbox.breakoutBallVX = 0;
    sandbox.breakoutBallVY = -200;
    sandbox.ship = {
        x: sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2,
        y: sandbox.canvas.height - sandbox.BREAKOUT_PADDLE_Y_OFFSET - sandbox.SHIP_SIZE / 2,
        vx: 0, vy: 0, angle: Math.PI,
        thrusting: false, retroThrusting: false,
        rotating: null, fuel: 100
    };
    sandbox.keys = {};
    sandbox.__explosionSpawns = 0;
    sandbox.__shakeStarts = 0;
    sandbox.__thrustStops = 0;
    sandbox.__explosionSoundPlays = 0;
    sandbox.__celebrationSpawns = 0;
    sandbox.__celebrationUpdates = 0;
    sandbox.__lastCelebrationXY = null;
    sandbox.landingResult = '';
    rngQueue.length = 0;
}

// ===== AC#1 + AC#2 + AC#4: Clearing all bricks fires BREAKOUT_COMPLETE =====
resetWorld();
sandbox.breakoutBricksTotal = 5;
sandbox.breakoutBricksDestroyed = 5;
sandbox.breakoutExtraBalls = 2;
sandbox.score = 500;      // prior accumulated score
sandbox.breakoutScore = 240; // partial breakout score from bricks
stepPlaying(1);

var expectedCompletion = sandbox.BREAKOUT_POINTS_COMPLETION;
var expectedExtraBonus = sandbox.BREAKOUT_POINTS_BALLS_REMAINING * 2;
var expectedTotalBonus = expectedCompletion + expectedExtraBonus;

check('AC#1 Destroyed >= total triggers BREAKOUT_COMPLETE',
    sandbox.gameState === sandbox.STATES.BREAKOUT_COMPLETE);
check('AC#2 Completion bonus equals BREAKOUT_POINTS_COMPLETION',
    sandbox.breakoutCompletionBonus === expectedCompletion);
check('AC#2 Extra-ball bonus equals BREAKOUT_POINTS_BALLS_REMAINING × breakoutExtraBalls',
    sandbox.breakoutExtraBallBonus === expectedExtraBonus);
check('AC#2 breakoutScore receives total bonus on top of partial',
    sandbox.breakoutScore === 240 + expectedTotalBonus);
check('AC#2 Global score receives the same total bonus',
    sandbox.score === 500 + expectedTotalBonus);
check('AC#2 breakoutCompleteTimer reset to 0 on entry',
    sandbox.breakoutCompleteTimer === 0);
check('AC#4 spawnCelebration() fired exactly once on entry',
    sandbox.__celebrationSpawns === 1);
check('AC#4 spawnCelebration called at paddle position (centered, above paddle)',
    sandbox.__lastCelebrationXY &&
    sandbox.__lastCelebrationXY.x === sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2);

// ===== AC#1: Win check does NOT fire while bricks remain =====
resetWorld();
sandbox.breakoutBricksTotal = 10;
sandbox.breakoutBricksDestroyed = 9;
stepPlaying(1);
check('AC#1 9/10 bricks destroyed keeps state as BREAKOUT_PLAYING',
    sandbox.gameState === sandbox.STATES.BREAKOUT_PLAYING);
check('AC#1 No bonuses awarded while bricks remain',
    sandbox.breakoutCompletionBonus === 0 && sandbox.breakoutExtraBallBonus === 0);
check('AC#1 No celebration spawned while bricks remain',
    sandbox.__celebrationSpawns === 0);

// ===== AC#1: Empty round (total = 0) must NOT trigger COMPLETE =====
// Guards against a zero-bricks-spawned edge case where 0 >= 0 would falsely win.
resetWorld();
sandbox.breakoutBricksTotal = 0;
sandbox.breakoutBricksDestroyed = 0;
stepPlaying(1);
check('AC#1 Zero-brick round does NOT auto-win',
    sandbox.gameState === sandbox.STATES.BREAKOUT_PLAYING);

// ===== AC#2: Extra-ball bonus is zero when no extras banked =====
resetWorld();
sandbox.breakoutBricksTotal = 1;
sandbox.breakoutBricksDestroyed = 1;
sandbox.breakoutExtraBalls = 0;
sandbox.score = 100;
stepPlaying(1);
check('AC#2 No extras: extra-ball bonus is 0',
    sandbox.breakoutExtraBallBonus === 0);
check('AC#2 No extras: total bonus == completion bonus only',
    sandbox.score === 100 + sandbox.BREAKOUT_POINTS_COMPLETION);

// ===== AC#5: Results screen persists for BREAKOUT_COMPLETE_DELAY =====
resetWorld();
sandbox.breakoutBricksTotal = 1;
sandbox.breakoutBricksDestroyed = 1;
sandbox.breakoutExtraBalls = 0;
stepPlaying(1);
check('AC#5 Precondition: entered BREAKOUT_COMPLETE',
    sandbox.gameState === sandbox.STATES.BREAKOUT_COMPLETE);

// Tick just under the delay — should remain in COMPLETE.
var framesUnder = Math.floor((sandbox.BREAKOUT_COMPLETE_DELAY * 60) - 2);
stepComplete(framesUnder);
check('AC#5 Still in BREAKOUT_COMPLETE before delay elapses',
    sandbox.gameState === sandbox.STATES.BREAKOUT_COMPLETE);

// A few more ticks to cross the delay threshold.
stepComplete(5);
check('AC#5 Advances to BREAKOUT_RETURN after BREAKOUT_COMPLETE_DELAY',
    sandbox.gameState === sandbox.STATES.BREAKOUT_RETURN);
check('AC#5 updateCelebration ticks during the results window',
    sandbox.__celebrationUpdates > 0);

// ===== AC#2: Win path is single-shot — double stepping does not re-award =====
resetWorld();
sandbox.breakoutBricksTotal = 2;
sandbox.breakoutBricksDestroyed = 2;
sandbox.breakoutExtraBalls = 1;
sandbox.score = 0;
sandbox.breakoutScore = 0;
stepPlaying(1);
var firstScore = sandbox.score;
var firstBreakoutScore = sandbox.breakoutScore;
// Step the PLAYING block once more — we should already be in COMPLETE so the
// if-guard skips the block body entirely. No new bonuses, no new celebration.
stepPlaying(1);
check('AC#2 Bonus awarded exactly once (score unchanged on re-step)',
    sandbox.score === firstScore && sandbox.breakoutScore === firstBreakoutScore);
check('AC#4 spawnCelebration fires exactly once (no double-spawn)',
    sandbox.__celebrationSpawns === 1);

// ===== AC#3: Renderer draws the required breakdown text =====
var renderSrc = loadFile('js/render.js');
check('render.js: renderBreakoutComplete defined',
    /function\s+renderBreakoutComplete\s*\(/.test(renderSrc));
check('render.js: "TECH DEBT CLEARED!" title present',
    /TECH DEBT CLEARED!/.test(renderSrc));
check('render.js: Bricks destroyed line present',
    /Bricks destroyed:\s*'\s*\+\s*breakoutBricksDestroyed/.test(renderSrc));
check('render.js: Extra balls remaining line present',
    /Extra balls remaining:\s*'\s*\+\s*breakoutExtraBalls/.test(renderSrc));
check('render.js: Completion bonus line present',
    /Completion bonus:\s*\+'\s*\+\s*breakoutCompletionBonus/.test(renderSrc));
check('render.js: Total bonus line present',
    /Total bonus:\s*\+'\s*\+\s*totalBonus/.test(renderSrc));
check('render.js: BREAKOUT_COMPLETE wired into the render switch',
    /case\s+STATES\.BREAKOUT_COMPLETE\s*:\s*[\s\S]*?renderBreakoutComplete\s*\(/.test(renderSrc));

// ===== Summary =====
var failed = results.filter(function (r) { return !r.ok; }).length;
var passed = results.length - failed;
console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
