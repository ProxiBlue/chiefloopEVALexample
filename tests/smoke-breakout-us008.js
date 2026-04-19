// US-008 (Code Breaker): Power-ups drop, fall, catch, and activate.
//
// Extracts the real BREAKOUT_PLAYING block + activateBreakoutPowerup +
// spawnBreakoutBrickParticles from js/update.js and replays them in a vm
// sandbox seeded by js/config.js. Mirrors the harness pattern used by
// tests/smoke-breakout-us007.js.
//
// Acceptance criteria mapped (.chief/prds/codebreaker/prd.md):
//   AC#1  Power-up spawns at brick position when POWERUP_CHANCE roll passes.
//   AC#2  Power-ups fall at BREAKOUT_POWERUP_FALL_SPEED. Paddle AABB catch
//         activates; fall off bottom = lost.
//   AC#3  Four types randomly selected (wide, multi, fire, extra) with their
//         PRD-specified letter, label, colour.
//   AC#4  Rendered with BREAKOUT_POWERUP_SIZE and letter + label text (source
//         inspection on render.js).
//   AC#5  Only one timed power-up active at a time (new replaces existing).
//         Extra Ball is instant (no timer).
//   AC#6  Collection sound hook present (playBreakoutPowerupSound wired).
//
// Run:  node tests/smoke-breakout-us008.js
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

// Deterministic Math.random() via a fifo queue.
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

// Load config.js — STATES, BREAKOUT_* constants, breakout* state vars,
// BREAKOUT_POWERUP_TYPES.
vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });
sandbox.SHIP_SIZE = 40;

// Track whether activateBreakoutPowerup hits the sound hook.
sandbox.__soundPlayed = 0;
sandbox.playBreakoutPowerupSound = function () { sandbox.__soundPlayed++; };

// ===== Constants sanity =====
check('config.js: BREAKOUT_POWERUP_TYPES is a 4-entry array',
    Array.isArray(sandbox.BREAKOUT_POWERUP_TYPES) &&
    sandbox.BREAKOUT_POWERUP_TYPES.length === 4);
check('config.js: Wide type has letter W, label refactor(), green colour',
    sandbox.BREAKOUT_POWERUP_TYPES.some(function (t) {
        return t.type === 'wide' && t.letter === 'W' &&
               t.label === 'refactor()' && t.color === '#4CAF50';
    }));
check('config.js: Multi-Ball type has letter M, label fork(), orange colour',
    sandbox.BREAKOUT_POWERUP_TYPES.some(function (t) {
        return t.type === 'multi' && t.letter === 'M' &&
               t.label === 'fork()' && t.color === '#FF9800';
    }));
check('config.js: Fireball type has letter F, label --force, red colour',
    sandbox.BREAKOUT_POWERUP_TYPES.some(function (t) {
        return t.type === 'fire' && t.letter === 'F' &&
               t.label === '--force' && t.color === '#F44336';
    }));
check('config.js: Extra Ball type has letter +, label git stash, cyan colour',
    sandbox.BREAKOUT_POWERUP_TYPES.some(function (t) {
        return t.type === 'extra' && t.letter === '+' &&
               t.label === 'git stash' && t.color === '#00BCD4';
    }));
check('config.js: BREAKOUT_POWERUP_FALL_SPEED = 100',
    sandbox.BREAKOUT_POWERUP_FALL_SPEED === 100);
check('config.js: BREAKOUT_POWERUP_SIZE = 16',
    sandbox.BREAKOUT_POWERUP_SIZE === 16);
check('config.js: BREAKOUT_POWERUP_WIDE_DURATION = 10',
    sandbox.BREAKOUT_POWERUP_WIDE_DURATION === 10);
check('config.js: BREAKOUT_POWERUP_FIRE_DURATION = 5',
    sandbox.BREAKOUT_POWERUP_FIRE_DURATION === 5);
check('config.js: BREAKOUT_POWERUP_WIDE_MULTIPLIER = 1.5',
    sandbox.BREAKOUT_POWERUP_WIDE_MULTIPLIER === 1.5);

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

var particlesSrc = extractFunction('function spawnBreakoutBrickParticles(');
var activateSrc = extractFunction('function activateBreakoutPowerup(');
check('update.js: spawnBreakoutBrickParticles defined', !!particlesSrc);
check('update.js: activateBreakoutPowerup defined', !!activateSrc);
vm.runInContext(particlesSrc, sandbox, { filename: 'spawnBreakoutBrickParticles' });
vm.runInContext(activateSrc, sandbox, { filename: 'activateBreakoutPowerup' });

// Extract the BREAKOUT_PLAYING block.
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
check('update.js: BREAKOUT_PLAYING body references breakoutPowerups',
    body.indexOf('breakoutPowerups') >= 0);
check('update.js: BREAKOUT_PLAYING body references breakoutActivePowerup',
    body.indexOf('breakoutActivePowerup') >= 0);
check('update.js: BREAKOUT_PLAYING body calls activateBreakoutPowerup()',
    body.indexOf('activateBreakoutPowerup(') >= 0);

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
    sandbox.__soundPlayed = 0;
    rngQueue.length = 0;
}

function placePowerup(type, x, y) {
    var def = sandbox.BREAKOUT_POWERUP_TYPES.filter(function (t) {
        return t.type === type;
    })[0];
    var pu = {
        x: x, y: y,
        vy: sandbox.BREAKOUT_POWERUP_FALL_SPEED,
        size: sandbox.BREAKOUT_POWERUP_SIZE,
        type: def.type,
        letter: def.letter,
        label: def.label,
        color: def.color
    };
    sandbox.breakoutPowerups.push(pu);
    return pu;
}

// ===== AC#1: Power-up spawns at brick position when POWERUP_CHANCE roll passes =====
resetBreakoutWorld();
var brick = {
    x: 300, y: 300, w: 60, h: sandbox.BREAKOUT_BRICK_HEIGHT,
    hp: 1, maxHp: 1,
    color: sandbox.BREAKOUT_BRICK_COLOR_HP1,
    label: 'test', revealAt: 0, flashTimer: 0
};
sandbox.breakoutBricks.push(brick);
sandbox.breakoutBallX = brick.x + brick.w / 2;
sandbox.breakoutBallY = brick.y - sandbox.BREAKOUT_BALL_RADIUS + 2;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 200;
// Stub particle spawner to keep the RNG queue for our assertions.
var realSpawn = sandbox.spawnBreakoutBrickParticles;
sandbox.spawnBreakoutBrickParticles = function () {};
pushRandom(0.05); // < 0.15 → drop
pushRandom(0.0);  // type index 0 → 'wide'
stepFrames(1);
check('AC#1 Roll < POWERUP_CHANCE: exactly one power-up spawned',
    sandbox.breakoutPowerups.length === 1);
check('AC#1 Power-up positioned at brick centre (pre-fall)',
    sandbox.breakoutPowerups.length === 1 &&
    Math.abs(sandbox.breakoutPowerups[0].x - (brick.x + brick.w / 2)) < 0.5 &&
    Math.abs(sandbox.breakoutPowerups[0].y - (brick.y + brick.h / 2)) < 0.5);
check('AC#1 Spawned power-up has the randomly-selected type (wide)',
    sandbox.breakoutPowerups.length === 1 &&
    sandbox.breakoutPowerups[0].type === 'wide' &&
    sandbox.breakoutPowerups[0].letter === 'W' &&
    sandbox.breakoutPowerups[0].label === 'refactor()');
sandbox.spawnBreakoutBrickParticles = realSpawn;

// ===== AC#2: Power-ups fall at BREAKOUT_POWERUP_FALL_SPEED =====
resetBreakoutWorld();
var fallPu = placePowerup('extra', 400, 100);
var yBefore = fallPu.y;
stepFrames(1);
var expectedFall = sandbox.BREAKOUT_POWERUP_FALL_SPEED * sandbox.dt;
check('AC#2 Power-up falls at BREAKOUT_POWERUP_FALL_SPEED (y increased by vy*dt)',
    sandbox.breakoutPowerups.length === 1 &&
    Math.abs(sandbox.breakoutPowerups[0].y - (yBefore + expectedFall)) < 0.001,
    'y after: ' + (sandbox.breakoutPowerups.length && sandbox.breakoutPowerups[0].y) +
    ' expected: ' + (yBefore + expectedFall));

// ===== AC#2: Power-up that falls off bottom is lost =====
resetBreakoutWorld();
var lostPu = placePowerup('wide', 400, sandbox.canvas.height + 50); // already below bottom
stepFrames(1);
check('AC#2 Power-up past canvas bottom is spliced (lost)',
    sandbox.breakoutPowerups.length === 0);

// ===== AC#2: Paddle AABB catch activates effect =====
resetBreakoutWorld();
var paddleTop = sandbox.canvas.height - sandbox.BREAKOUT_PADDLE_Y_OFFSET;
var caughtPu = placePowerup('extra',
    sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2,
    paddleTop + 2);
var extrasBefore = sandbox.breakoutExtraBalls;
var soundBefore = sandbox.__soundPlayed;
stepFrames(1);
check('AC#2 Paddle-catch removes the power-up from the field',
    sandbox.breakoutPowerups.length === 0);
check('AC#2 Paddle-catch activates effect (Extra Ball → breakoutExtraBalls + 1)',
    sandbox.breakoutExtraBalls === extrasBefore + 1);
check('AC#6 Collection sound hook fires on catch',
    sandbox.__soundPlayed > soundBefore);

// ===== AC#3: Four power-up types selectable =====
var typeSet = sandbox.BREAKOUT_POWERUP_TYPES.map(function (t) { return t.type; });
check('AC#3 The four specified types exist in the pool',
    typeSet.indexOf('wide') >= 0 &&
    typeSet.indexOf('multi') >= 0 &&
    typeSet.indexOf('fire') >= 0 &&
    typeSet.indexOf('extra') >= 0);

// Wide → paddle width grows by the multiplier
resetBreakoutWorld();
placePowerup('wide',
    sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2,
    paddleTop + 2);
var widthBefore = sandbox.breakoutPaddleWidth;
stepFrames(1);
check('AC#3 Wide Paddle grows paddle width by 1.5x',
    Math.abs(sandbox.breakoutPaddleWidth - widthBefore *
             sandbox.BREAKOUT_POWERUP_WIDE_MULTIPLIER) < 0.001,
    'paddleWidth: ' + sandbox.breakoutPaddleWidth);
check('AC#5 Wide Paddle is a timed effect (breakoutPowerupTimer set)',
    sandbox.breakoutActivePowerup === 'wide' &&
    Math.abs(sandbox.breakoutPowerupTimer -
             sandbox.BREAKOUT_POWERUP_WIDE_DURATION) < 0.02);

// Fire → active power-up set, timer armed
resetBreakoutWorld();
placePowerup('fire',
    sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2,
    paddleTop + 2);
stepFrames(1);
check('AC#3 Fireball sets breakoutActivePowerup = fire with 5s timer',
    sandbox.breakoutActivePowerup === 'fire' &&
    Math.abs(sandbox.breakoutPowerupTimer -
             sandbox.BREAKOUT_POWERUP_FIRE_DURATION) < 0.02);

// Fireball: ball destroys brick in one hit regardless of HP, no bounce
resetBreakoutWorld();
sandbox.breakoutActivePowerup = 'fire';
sandbox.breakoutPowerupTimer = sandbox.BREAKOUT_POWERUP_FIRE_DURATION;
var hardBrick = {
    x: 300, y: 300, w: 60, h: sandbox.BREAKOUT_BRICK_HEIGHT,
    hp: 3, maxHp: 3,
    color: sandbox.BREAKOUT_BRICK_COLOR_HP3,
    label: 'boss', revealAt: 0, flashTimer: 0
};
sandbox.breakoutBricks.push(hardBrick);
sandbox.breakoutBallX = hardBrick.x + hardBrick.w / 2;
sandbox.breakoutBallY = hardBrick.y - sandbox.BREAKOUT_BALL_RADIUS + 2;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 200;
pushRandom(0.99); // no power-up drop
for (var pfi = 0; pfi < 60; pfi++) pushRandom(0.5); // particle jitter
stepFrames(1);
check('AC#3 Fireball: 3-HP brick destroyed in ONE hit regardless of HP',
    sandbox.breakoutBricks.length === 0);
check('AC#3 Fireball: ball does NOT reflect off destroyed brick (VY stays +)',
    sandbox.breakoutBallVY > 0,
    'ballVY: ' + sandbox.breakoutBallVY);

// Multi-Ball → two extra balls spawn
resetBreakoutWorld();
// Seed a velocity so multi-ball angle calc has a baseline direction.
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = -200;
placePowerup('multi',
    sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2,
    paddleTop + 2);
stepFrames(1);
check('AC#3 Multi-Ball spawns 2 extra balls into breakoutBalls',
    sandbox.breakoutBalls.length === 2);
// After stepFrames(1) both the primary and extras have moved one tick, so we
// compare against the primary position (which also moved) within a small
// tolerance rather than the original spawn point.
check('AC#3 Multi-Ball extras start near primary ball position',
    sandbox.breakoutBalls.length === 2 &&
    Math.abs(sandbox.breakoutBalls[0].x - sandbox.breakoutBallX) < 5 &&
    Math.abs(sandbox.breakoutBalls[0].y - sandbox.breakoutBallY) < 5);
check('AC#3 Multi-Ball is INSTANT (no timer, no activePowerup change)',
    sandbox.breakoutActivePowerup !== 'multi' &&
    sandbox.breakoutPowerupTimer === 0);

// Extra Ball → +1 reserve, instant
resetBreakoutWorld();
placePowerup('extra',
    sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2,
    paddleTop + 2);
var reserveBefore = sandbox.breakoutExtraBalls;
stepFrames(1);
check('AC#3 Extra Ball: breakoutExtraBalls + 1',
    sandbox.breakoutExtraBalls === reserveBefore + 1);
check('AC#5 Extra Ball is INSTANT (no timer, no activePowerup change)',
    sandbox.breakoutActivePowerup === null &&
    sandbox.breakoutPowerupTimer === 0);

// ===== AC#5: Only one timed power-up active; new replaces existing =====
resetBreakoutWorld();
// Catch Wide first
placePowerup('wide',
    sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2,
    paddleTop + 2);
stepFrames(1);
check('AC#5 Wide captured: activePowerup=wide, paddle widened',
    sandbox.breakoutActivePowerup === 'wide' &&
    sandbox.breakoutPaddleWidth ===
        sandbox.BREAKOUT_PADDLE_WIDTH * sandbox.BREAKOUT_POWERUP_WIDE_MULTIPLIER);
// Catch Fire — should replace Wide (revert paddle + swap to fire timer)
placePowerup('fire',
    sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2,
    paddleTop + 2);
stepFrames(1);
check('AC#5 Catching Fire while Wide active REPLACES timer (now fire)',
    sandbox.breakoutActivePowerup === 'fire');
check('AC#5 Paddle width reverts to BREAKOUT_PADDLE_WIDTH on Wide → Fire swap',
    sandbox.breakoutPaddleWidth === sandbox.BREAKOUT_PADDLE_WIDTH);
check('AC#5 Fire timer is armed at BREAKOUT_POWERUP_FIRE_DURATION',
    Math.abs(sandbox.breakoutPowerupTimer -
             sandbox.BREAKOUT_POWERUP_FIRE_DURATION) < 0.02);

// Wide → Wide: timer refreshes, paddle stays wide
resetBreakoutWorld();
placePowerup('wide',
    sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2,
    paddleTop + 2);
stepFrames(1);
// Advance time partway
sandbox.breakoutPowerupTimer -= 5;
var timerAfterDecay = sandbox.breakoutPowerupTimer;
placePowerup('wide',
    sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2,
    paddleTop + 2);
stepFrames(1);
check('AC#5 Catching Wide again REFRESHES timer to full duration',
    Math.abs(sandbox.breakoutPowerupTimer -
             sandbox.BREAKOUT_POWERUP_WIDE_DURATION) < 0.02 &&
    sandbox.breakoutPowerupTimer > timerAfterDecay);

// Wide timer expires → paddle reverts
resetBreakoutWorld();
placePowerup('wide',
    sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2,
    paddleTop + 2);
stepFrames(1);
// Burn timer past zero.
sandbox.breakoutPowerupTimer = 0.001;
stepFrames(1);
check('AC#5 Wide timer expiring reverts paddle width and clears activePowerup',
    sandbox.breakoutActivePowerup === null &&
    sandbox.breakoutPaddleWidth === sandbox.BREAKOUT_PADDLE_WIDTH);

// ===== AC#4: Rendering — source inspection =====
var renderSrc = loadFile('js/render.js');
check('AC#4 render.js: drawBreakoutWorld iterates breakoutPowerups',
    /breakoutPowerups/.test(renderSrc));
check('AC#4 render.js: uses BREAKOUT_POWERUP_SIZE (via pup.size or constant)',
    /BREAKOUT_POWERUP_SIZE/.test(renderSrc) || /pup\.size/.test(renderSrc));
check('AC#4 render.js: draws rounded rectangle via quadraticCurveTo',
    /quadraticCurveTo/.test(renderSrc));
check('AC#4 render.js: draws letter and label text',
    /pup\.letter/.test(renderSrc) && /pup\.label/.test(renderSrc));
check('AC#4 render.js: draws additional balls from breakoutBalls',
    /breakoutBalls\[/.test(renderSrc));

// ===== AC#6: Collection sound exists in audio.js =====
var audioSrc = loadFile('js/audio.js');
check('AC#6 audio.js: playBreakoutPowerupSound is defined',
    /function playBreakoutPowerupSound\s*\(/.test(audioSrc));
check('AC#6 audio.js: sound is two-note ascending chime (two voices)',
    /playBreakoutPowerupSound/.test(audioSrc) &&
    /freq:\s*660/.test(audioSrc) && /freq:\s*990/.test(audioSrc));

// ===== Summary =====
var failed = results.filter(function (r) { return !r.ok; }).length;
var passed = results.length - failed;
console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
