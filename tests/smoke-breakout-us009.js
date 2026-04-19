// US-009 (Code Breaker): Ball loss + lives handling.
//
// Extracts the real BREAKOUT_PLAYING block + loseBreakoutBall +
// crashShipInBreakout from js/update.js and replays them in a vm sandbox
// seeded by js/config.js. Mirrors the harness used by smoke-breakout-us008.js.
//
// Acceptance criteria mapped (.chief/prds/codebreaker/prd.md):
//   AC#1  Active ball + all multi-balls exiting the canvas bottom = ball loss.
//   AC#2  breakoutExtraBalls > 0: decrement, respawn primary on paddle (stuck),
//         resume play.
//   AC#3  breakoutExtraBalls === 0: transition to STATES.CRASHED.
//   AC#4  Multi-balls independent: losing a subset of balls does not end the
//         round; only when none remain does the ball-loss check fire.
//   AC#5  On ball loss, any active timed power-up (wide paddle, fireball) is
//         cancelled.
//   AC#6  Partial breakoutScore persists in global `score` on loss.
//
// Run:  node tests/smoke-breakout-us009.js
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
function pushRandom(v) { rngQueue.push(v); }
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

// Hooks consumed by crashShipInBreakout — stub to record invocations without
// requiring the real audio / FX modules.
sandbox.__explosionSpawns = 0;
sandbox.__shakeStarts = 0;
sandbox.__thrustStops = 0;
sandbox.__explosionSoundPlays = 0;
sandbox.spawnExplosion = function () { sandbox.__explosionSpawns++; };
sandbox.startScreenShake = function () { sandbox.__shakeStarts++; };
sandbox.stopThrustSound = function () { sandbox.__thrustStops++; };
sandbox.playExplosionSound = function () { sandbox.__explosionSoundPlays++; };
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
var clearSrc = extractFunction('function clearBreakoutState(');
check('update.js: crashShipInBreakout defined', !!crashSrc);
check('update.js: loseBreakoutBall defined', !!loseSrc);
check('update.js: activateBreakoutPowerup defined', !!activateSrc);
check('update.js: spawnBreakoutBrickParticles defined', !!particlesSrc);
vm.runInContext(particlesSrc, sandbox, { filename: 'spawnBreakoutBrickParticles' });
vm.runInContext(activateSrc, sandbox, { filename: 'activateBreakoutPowerup' });
// US-011 added a clearBreakoutState() call in the BREAKOUT_PLAYING CRASHED
// tail. Load it so the replayed PLAYING body doesn't ReferenceError when the
// loss-path tests deliberately route through CRASHED.
if (clearSrc) {
    vm.runInContext(clearSrc, sandbox, { filename: 'clearBreakoutState' });
}
vm.runInContext(crashSrc, sandbox, { filename: 'crashShipInBreakout' });
vm.runInContext(loseSrc, sandbox, { filename: 'loseBreakoutBall' });

// Extract the BREAKOUT_PLAYING block body.
var sig = 'if (gameState === STATES.BREAKOUT_PLAYING) {';
var start = updateSrc.indexOf(sig);
check('update.js: BREAKOUT_PLAYING block located', start > 0);
var braceOpen = updateSrc.indexOf('{', start + sig.length - 1);
var depth = 0;
var braceClose = -1;
for (var i = braceOpen; i < updateSrc.length; i++) {
    if (updateSrc[i] === '{') depth++;
    else if (updateSrc[i] === '}') {
        depth--;
        if (depth === 0) { braceClose = i; break; }
    }
}
var body = updateSrc.slice(braceOpen + 1, braceClose);
check('update.js: BREAKOUT_PLAYING body calls loseBreakoutBall()',
    body.indexOf('loseBreakoutBall(') >= 0);
check('update.js: BREAKOUT_PLAYING body promotes a multi-ball when one remains',
    body.indexOf('breakoutBalls.shift()') >= 0);

var replay = new vm.Script(
    '(function () {\n' + body + '\n}).call(this);',
    { filename: 'breakout-body' }
);
function stepFrames(n) { for (var k = 0; k < n; k++) replay.runInContext(sandbox); }

function resetBreakoutWorld() {
    sandbox.gameState = sandbox.STATES.BREAKOUT_PLAYING;
    sandbox.dt = 1 / 60;
    sandbox.currentLevel = 1;
    sandbox.score = 0;
    sandbox.breakoutScore = 0;
    sandbox.breakoutBricksDestroyed = 0;
    sandbox.breakoutBricksTotal = 0;
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
    sandbox.breakoutBallY = 200;
    sandbox.breakoutBallVX = 0;
    sandbox.breakoutBallVY = 0;
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
    sandbox.landingResult = '';
    rngQueue.length = 0;
}

// ===== AC#1 + AC#3: Primary ball alone → exits bottom → CRASHED =====
resetBreakoutWorld();
sandbox.breakoutBallY = sandbox.canvas.height + 10; // clearly past bottom + radius
sandbox.breakoutBallVY = 200;
sandbox.breakoutExtraBalls = 0;
stepFrames(1);
check('AC#1+AC#3 Ball past bottom with no extras transitions to STATES.CRASHED',
    sandbox.gameState === sandbox.STATES.CRASHED);
check('AC#3 Crash pipeline fires (explosion + shake + sound)',
    sandbox.__explosionSpawns === 1 &&
    sandbox.__shakeStarts === 1 &&
    sandbox.__explosionSoundPlays === 1);
check('AC#3 landingResult is set to the ball-lost reason',
    sandbox.landingResult === 'Ball lost');

// ===== AC#2: breakoutExtraBalls > 0 → decrement, respawn on paddle (stuck) =====
resetBreakoutWorld();
sandbox.breakoutExtraBalls = 2;
sandbox.breakoutBallY = sandbox.canvas.height + 5;
sandbox.breakoutBallVY = 200;
sandbox.breakoutBallVX = 120;
stepFrames(1);
check('AC#2 Extras > 0: state stays BREAKOUT_PLAYING (no crash)',
    sandbox.gameState === sandbox.STATES.BREAKOUT_PLAYING);
check('AC#2 Extras decremented by 1 on respawn',
    sandbox.breakoutExtraBalls === 1);
check('AC#2 Ball re-stuck on paddle after respawn',
    sandbox.breakoutBallStuck === true);
check('AC#2 Respawned ball sits above paddle top',
    sandbox.breakoutBallY < sandbox.canvas.height - sandbox.BREAKOUT_PADDLE_Y_OFFSET);
check('AC#2 Respawned ball velocity reset to (0, 0)',
    sandbox.breakoutBallVX === 0 && sandbox.breakoutBallVY === 0);
check('AC#2 No explosion/crash FX fired when extras bank the loss',
    sandbox.__explosionSpawns === 0 && sandbox.__explosionSoundPlays === 0);

// ===== AC#4: Multi-ball independence — one extra alive keeps round going =====
resetBreakoutWorld();
// Primary exits bottom; one extra still on screen mid-canvas.
sandbox.breakoutBallY = sandbox.canvas.height + 5;
sandbox.breakoutBallVY = 200;
sandbox.breakoutBalls.push({ x: 400, y: 300, vx: 50, vy: -100 });
sandbox.breakoutExtraBalls = 0;
stepFrames(1);
check('AC#4 Primary lost but one multi-ball remaining: no crash',
    sandbox.gameState === sandbox.STATES.BREAKOUT_PLAYING);
check('AC#4 Multi-ball is promoted to primary (array drains to 0)',
    sandbox.breakoutBalls.length === 0);
check('AC#4 Promoted ball carries forward non-zero velocity (still alive)',
    Math.abs(sandbox.breakoutBallVX) > 0 || Math.abs(sandbox.breakoutBallVY) > 0);
check('AC#4 Promoted ball is on screen (not at the old bottom position)',
    sandbox.breakoutBallY < sandbox.canvas.height);

// ===== AC#4: Losing an individual extra does NOT end the round =====
resetBreakoutWorld();
sandbox.breakoutBallY = 300;
sandbox.breakoutBallVY = -200; // primary safely on-screen heading up
sandbox.breakoutBalls.push({
    x: 400,
    y: sandbox.canvas.height + 10, // below bottom — will be spliced
    vx: 0, vy: 200
});
sandbox.breakoutExtraBalls = 0;
stepFrames(1);
check('AC#4 Single extra exits bottom with primary alive: no crash',
    sandbox.gameState === sandbox.STATES.BREAKOUT_PLAYING);
check('AC#4 Lost extra is removed from breakoutBalls',
    sandbox.breakoutBalls.length === 0);
check('AC#4 Primary ball untouched by extra loss',
    sandbox.breakoutBallY < sandbox.canvas.height);

// ===== AC#4: All balls lost in same frame with extras > 0 respawns =====
resetBreakoutWorld();
sandbox.breakoutExtraBalls = 1;
sandbox.breakoutBallY = sandbox.canvas.height + 5;
sandbox.breakoutBallVY = 200;
sandbox.breakoutBalls.push({
    x: 200, y: sandbox.canvas.height + 5,
    vx: 0, vy: 200
});
sandbox.breakoutBalls.push({
    x: 500, y: sandbox.canvas.height + 5,
    vx: 0, vy: 200
});
stepFrames(1);
check('AC#4 All balls bottom-out same frame with extras: single ball respawned',
    sandbox.gameState === sandbox.STATES.BREAKOUT_PLAYING &&
    sandbox.breakoutBalls.length === 0 &&
    sandbox.breakoutBallStuck === true);
check('AC#4 Extras decremented exactly once even when all balls drop together',
    sandbox.breakoutExtraBalls === 0);

// ===== AC#5: Wide power-up cancelled on ball loss, paddle reverts =====
resetBreakoutWorld();
sandbox.breakoutExtraBalls = 1;
sandbox.activateBreakoutPowerup('wide');
check('AC#5 precondition: Wide active and paddle widened',
    sandbox.breakoutActivePowerup === 'wide' &&
    sandbox.breakoutPaddleWidth ===
        sandbox.BREAKOUT_PADDLE_WIDTH * sandbox.BREAKOUT_POWERUP_WIDE_MULTIPLIER);
sandbox.breakoutBallY = sandbox.canvas.height + 5;
sandbox.breakoutBallVY = 200;
stepFrames(1);
check('AC#5 Wide cancelled on ball loss (activePowerup null, timer 0)',
    sandbox.breakoutActivePowerup === null &&
    sandbox.breakoutPowerupTimer === 0);
check('AC#5 Paddle width reverts to BREAKOUT_PADDLE_WIDTH on ball loss',
    sandbox.breakoutPaddleWidth === sandbox.BREAKOUT_PADDLE_WIDTH);

// ===== AC#5: Fireball cancelled on ball loss =====
resetBreakoutWorld();
sandbox.breakoutExtraBalls = 1;
sandbox.activateBreakoutPowerup('fire');
check('AC#5 precondition: Fire active and timer armed',
    sandbox.breakoutActivePowerup === 'fire' &&
    sandbox.breakoutPowerupTimer > 0);
sandbox.breakoutBallY = sandbox.canvas.height + 5;
sandbox.breakoutBallVY = 200;
stepFrames(1);
check('AC#5 Fire cancelled on ball loss (activePowerup null, timer 0)',
    sandbox.breakoutActivePowerup === null &&
    sandbox.breakoutPowerupTimer === 0);

// ===== AC#5: Power-up cancellation also happens on terminal loss =====
resetBreakoutWorld();
sandbox.breakoutExtraBalls = 0;
sandbox.activateBreakoutPowerup('wide');
sandbox.breakoutBallY = sandbox.canvas.height + 5;
sandbox.breakoutBallVY = 200;
stepFrames(1);
check('AC#5 Terminal loss (no extras): power-up also cancelled',
    sandbox.breakoutActivePowerup === null &&
    sandbox.breakoutPowerupTimer === 0 &&
    sandbox.breakoutPaddleWidth === sandbox.BREAKOUT_PADDLE_WIDTH);
check('AC#5 Terminal loss still routes to CRASHED',
    sandbox.gameState === sandbox.STATES.CRASHED);

// ===== AC#6: Partial breakoutScore persists in global `score` on loss =====
resetBreakoutWorld();
sandbox.breakoutExtraBalls = 0;
sandbox.breakoutScore = 250;
sandbox.score = 1000; // pretend prior global score (level progression etc.)
sandbox.breakoutBallY = sandbox.canvas.height + 5;
sandbox.breakoutBallVY = 200;
stepFrames(1);
check('AC#6 Terminal loss: breakoutScore preserved (not zeroed)',
    sandbox.breakoutScore === 250);
check('AC#6 Terminal loss: global `score` preserved (not subtracted)',
    sandbox.score === 1000);

// ===== AC#6: Partial score also preserved on respawn (extras > 0) =====
resetBreakoutWorld();
sandbox.breakoutExtraBalls = 1;
sandbox.breakoutScore = 80;
sandbox.score = 300;
sandbox.breakoutBallY = sandbox.canvas.height + 5;
sandbox.breakoutBallVY = 200;
stepFrames(1);
check('AC#6 Respawn: breakoutScore preserved',
    sandbox.breakoutScore === 80);
check('AC#6 Respawn: global `score` preserved',
    sandbox.score === 300);

// ===== Source-level sanity: CRASHED is the state crashShipInBreakout targets =====
check('update.js: crashShipInBreakout sets gameState = STATES.CRASHED',
    /function crashShipInBreakout[\s\S]*?gameState\s*=\s*STATES\.CRASHED/.test(updateSrc));
check('update.js: loseBreakoutBall decrements breakoutExtraBalls',
    /function loseBreakoutBall[\s\S]*?breakoutExtraBalls\s*-=\s*1/.test(updateSrc));
check('update.js: loseBreakoutBall clears active timed power-up',
    /function loseBreakoutBall[\s\S]*?breakoutActivePowerup\s*=\s*null/.test(updateSrc));

// ===== Summary =====
var failed = results.filter(function (r) { return !r.ok; }).length;
var passed = results.length - failed;
console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
