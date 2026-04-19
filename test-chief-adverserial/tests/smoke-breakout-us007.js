// US-007 (Code Breaker): Ball-vs-brick collision + brick destruction.
//
// Extracts the real BREAKOUT_PLAYING block from js/update.js and replays it in
// a vm sandbox seeded by js/config.js, stepping the simulation frame-by-frame
// to verify every acceptance criterion against the actual shipped bytes.
// Same harness pattern as smoke-us007.js / smoke-us015.js.
//
// NOTE: The unrelated pre-existing tests/smoke-us007.js targets a different
// "US-007" (invader thruster physics) from an earlier PRD. This file covers
// the Code Breaker US-007 acceptance criteria listed in
// .chief/prds/codebreaker/prd.md.
//
// Acceptance criteria mapped:
//   AC#1  Ball-vs-brick collision uses AABB detection.
//   AC#2  Top/bottom face reflects VY; left/right face reflects VX.
//   AC#3  On hit, brick HP decreases by 1.
//   AC#4  HP reaches 0 → brick destroyed, points = PER_BRICK + BONUS_HP * originalHP;
//         breakoutBricksDestroyed++; particle burst in brick's colour.
//   AC#5  HP > 0 → brick colour shifts to reflect reduced HP; flash effect plays.
//   AC#6  Ball speed increases by BREAKOUT_BALL_SPEED_INCREMENT per brick destroyed,
//         capped at BREAKOUT_BALL_SPEED_MAX.
//   AC#7  BREAKOUT_POWERUP_CHANCE (15%) drops a power-up on destruction.
//   AC#8  Only one brick is affected per ball-collision event.
//
// Run:  node tests/smoke-breakout-us007.js
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

// ----- Sandbox with a deterministic Math.random() so the power-up roll and
// ----- particle-count jitter are reproducible. -----
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
// Shim Math so random() is controllable; keep every other method intact.
sandbox.Math = Object.create(Math);
sandbox.Math.random = function () { return nextRandom(); };
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Load config.js — real STATES, BREAKOUT_* constants, breakout* state vars.
vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });
// SHIP_SIZE lives in js/collision.js, not config.js; seed with the real value.
sandbox.SHIP_SIZE = 40;

// ===== Constants sanity =====
check('config.js: STATES.BREAKOUT_PLAYING exists',
    sandbox.STATES && sandbox.STATES.BREAKOUT_PLAYING === 'breakout_playing');
check('config.js: BREAKOUT_POINTS_PER_BRICK = 10',
    sandbox.BREAKOUT_POINTS_PER_BRICK === 10);
check('config.js: BREAKOUT_POINTS_BONUS_HP = 5',
    sandbox.BREAKOUT_POINTS_BONUS_HP === 5);
check('config.js: BREAKOUT_BALL_SPEED_INCREMENT = 5',
    sandbox.BREAKOUT_BALL_SPEED_INCREMENT === 5);
check('config.js: BREAKOUT_BALL_SPEED_MAX = 450',
    sandbox.BREAKOUT_BALL_SPEED_MAX === 450);
check('config.js: BREAKOUT_POWERUP_CHANCE = 0.15',
    sandbox.BREAKOUT_POWERUP_CHANCE === 0.15);

// ===== Extract the BREAKOUT_PLAYING block =====
var updateSrc = loadFile('js/update.js');
var breakoutSig = 'if (gameState === STATES.BREAKOUT_PLAYING) {';
var breakoutStart = updateSrc.indexOf(breakoutSig);
check('update.js: BREAKOUT_PLAYING block located',
    breakoutStart > 0, 'breakoutStart: ' + breakoutStart);

var braceOpen = updateSrc.indexOf('{', breakoutStart + breakoutSig.length - 1);
var depth = 0;
var braceClose = -1;
for (var i = braceOpen; i < updateSrc.length; i++) {
    if (updateSrc[i] === '{') depth++;
    else if (updateSrc[i] === '}') {
        depth--;
        if (depth === 0) { braceClose = i; break; }
    }
}
var breakoutBody = updateSrc.slice(braceOpen + 1, braceClose);
check('update.js: BREAKOUT_PLAYING body contains brick-collision code',
    breakoutBody.indexOf('breakoutBricks') >= 0 &&
    breakoutBody.indexOf('overlapX') >= 0 &&
    breakoutBody.indexOf('overlapY') >= 0 &&
    breakoutBody.indexOf('BREAKOUT_POINTS_PER_BRICK') >= 0);

// Also extract spawnBreakoutBrickParticles so the brick-destroy branch can
// call it (that function lives outside the BREAKOUT_PLAYING block).
var particleSig = 'function spawnBreakoutBrickParticles(';
var particleStart = updateSrc.indexOf(particleSig);
check('update.js: spawnBreakoutBrickParticles defined',
    particleStart > 0);
var particleOpen = updateSrc.indexOf('{', particleStart);
var particleDepth = 0;
var particleClose = -1;
for (var pi = particleOpen; pi < updateSrc.length; pi++) {
    if (updateSrc[pi] === '{') particleDepth++;
    else if (updateSrc[pi] === '}') {
        particleDepth--;
        if (particleDepth === 0) { particleClose = pi; break; }
    }
}
var particleSrc = updateSrc.slice(particleStart, particleClose + 1);
vm.runInContext(particleSrc, sandbox, { filename: 'spawnBreakoutBrickParticles' });

var breakoutReplay = new vm.Script(
    '(function () {\n' + breakoutBody + '\n}).call(this);',
    { filename: 'breakout-body' }
);

function stepFrames(n) {
    for (var k = 0; k < n; k++) breakoutReplay.runInContext(sandbox);
}

// Seed the BREAKOUT_PLAYING-required globals for all subsequent tests.
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
    sandbox.breakoutPaddleX = (sandbox.canvas.width - sandbox.BREAKOUT_PADDLE_WIDTH) / 2;
    sandbox.breakoutBallX = sandbox.canvas.width / 2;
    sandbox.breakoutBallY = 200;
    sandbox.breakoutBallVX = 0;
    sandbox.breakoutBallVY = 0;
    sandbox.ship = {
        x: sandbox.breakoutPaddleX + sandbox.BREAKOUT_PADDLE_WIDTH / 2,
        y: sandbox.canvas.height - sandbox.BREAKOUT_PADDLE_Y_OFFSET - sandbox.SHIP_SIZE / 2,
        vx: 0, vy: 0, angle: Math.PI,
        thrusting: false, retroThrusting: false,
        rotating: null, fuel: 100
    };
    sandbox.keys = {};
    rngQueue.length = 0;
}

// Build a single-brick field so collisions are deterministic.
function placeBrick(x, y, hp) {
    var brick = {
        x: x, y: y,
        w: 60, h: sandbox.BREAKOUT_BRICK_HEIGHT,
        hp: hp, maxHp: hp,
        color: hp === 3 ? sandbox.BREAKOUT_BRICK_COLOR_HP3
             : hp === 2 ? sandbox.BREAKOUT_BRICK_COLOR_HP2
             : sandbox.BREAKOUT_BRICK_COLOR_HP1,
        label: 'test',
        revealAt: 0,
        flashTimer: 0
    };
    sandbox.breakoutBricks.push(brick);
    return brick;
}

// ===== AC#1 AABB ball-vs-brick collision detection =====
resetBreakoutWorld();
var brick1 = placeBrick(300, 150, 1);
// Place ball well away from brick; no velocity → no collision.
sandbox.breakoutBallX = 100; sandbox.breakoutBallY = 400;
sandbox.breakoutBallVX = 0; sandbox.breakoutBallVY = 0;
stepFrames(1);
check('AC#1 AABB: ball far from brick does NOT collide (brick intact)',
    sandbox.breakoutBricks.length === 1 && sandbox.breakoutBricks[0].hp === 1);

resetBreakoutWorld();
var brickAABB = placeBrick(300, 150, 1);
// Position ball overlapping the brick's left edge — AABB overlap.
sandbox.breakoutBallX = brickAABB.x + 1; // overlaps left face
sandbox.breakoutBallY = brickAABB.y + brickAABB.h / 2; // middle vertically
sandbox.breakoutBallVX = 100;
sandbox.breakoutBallVY = 0;
// Prevent power-up drop on this round to isolate AABB.
pushRandom(0.99);
stepFrames(1);
check('AC#1 AABB: ball overlapping brick AABB triggers collision (brick removed)',
    sandbox.breakoutBricks.length === 0);

// ===== AC#2 Face detection + reflection =====

// Top face (ball moving down, hits top) → VY reflects
resetBreakoutWorld();
var brickTop = placeBrick(300, 300, 2); // HP 2 so brick stays alive after hit
sandbox.breakoutBallX = brickTop.x + brickTop.w / 2;
sandbox.breakoutBallY = brickTop.y - sandbox.BREAKOUT_BALL_RADIUS + 2; // just clipping top
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 200; // moving down
stepFrames(1);
check('AC#2 Top face: VY reflected (was +, now -)',
    sandbox.breakoutBallVY < 0,
    'ballVY: ' + sandbox.breakoutBallVY);
check('AC#2 Top face: VX unchanged',
    sandbox.breakoutBallVX === 0);

// Bottom face (ball moving up, hits bottom) → VY reflects to +
resetBreakoutWorld();
var brickBot = placeBrick(300, 300, 2);
sandbox.breakoutBallX = brickBot.x + brickBot.w / 2;
sandbox.breakoutBallY = brickBot.y + brickBot.h + sandbox.BREAKOUT_BALL_RADIUS - 2; // clipping bottom
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = -200;
stepFrames(1);
check('AC#2 Bottom face: VY reflected (was -, now +)',
    sandbox.breakoutBallVY > 0,
    'ballVY: ' + sandbox.breakoutBallVY);

// Left face (ball moving right, hits left) → VX reflects to -
resetBreakoutWorld();
var brickL = placeBrick(300, 300, 2);
sandbox.breakoutBallX = brickL.x - sandbox.BREAKOUT_BALL_RADIUS + 2; // clipping left
sandbox.breakoutBallY = brickL.y + brickL.h / 2;
sandbox.breakoutBallVX = 200; // moving right
sandbox.breakoutBallVY = 0;
stepFrames(1);
check('AC#2 Left face: VX reflected (was +, now -)',
    sandbox.breakoutBallVX < 0,
    'ballVX: ' + sandbox.breakoutBallVX);
check('AC#2 Left face: VY unchanged',
    sandbox.breakoutBallVY === 0);

// Right face (ball moving left, hits right) → VX reflects to +
resetBreakoutWorld();
var brickR = placeBrick(300, 300, 2);
sandbox.breakoutBallX = brickR.x + brickR.w + sandbox.BREAKOUT_BALL_RADIUS - 2; // clipping right
sandbox.breakoutBallY = brickR.y + brickR.h / 2;
sandbox.breakoutBallVX = -200;
sandbox.breakoutBallVY = 0;
stepFrames(1);
check('AC#2 Right face: VX reflected (was -, now +)',
    sandbox.breakoutBallVX > 0,
    'ballVX: ' + sandbox.breakoutBallVX);

// ===== AC#3 HP decreases by 1 on hit =====
resetBreakoutWorld();
var brickHP = placeBrick(300, 300, 3);
sandbox.breakoutBallX = brickHP.x + brickHP.w / 2;
sandbox.breakoutBallY = brickHP.y - sandbox.BREAKOUT_BALL_RADIUS + 2;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 200;
stepFrames(1);
check('AC#3 HP decreases by 1 (3 → 2)',
    sandbox.breakoutBricks.length === 1 && sandbox.breakoutBricks[0].hp === 2,
    'hp: ' + (sandbox.breakoutBricks[0] && sandbox.breakoutBricks[0].hp));

// ===== AC#4 HP → 0: destroyed, score, counter, particles =====
resetBreakoutWorld();
var brickDead = placeBrick(300, 300, 3);
// Over-write to simulate ball about to kill a 3-HP brick on its final hit.
brickDead.hp = 1;
// Reset vertical distance each attempt; nudge ball to overlap brick top.
sandbox.breakoutBallX = brickDead.x + brickDead.w / 2;
sandbox.breakoutBallY = brickDead.y - sandbox.BREAKOUT_BALL_RADIUS + 2;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 200;
// Prevent a power-up from dropping so breakoutPowerups.length stays 0.
pushRandom(0.99);
// Seed particle-count jitter (not strictly needed for PASS).
for (var pr = 0; pr < 20; pr++) pushRandom(0.5);
var scoreBefore = sandbox.score;
var breakoutScoreBefore = sandbox.breakoutScore;
var particlesBefore = sandbox.breakoutParticles.length;
stepFrames(1);
var expectedPoints = sandbox.BREAKOUT_POINTS_PER_BRICK +
                     sandbox.BREAKOUT_POINTS_BONUS_HP * 3; // originalHP = maxHp = 3
check('AC#4 Brick removed from array on HP=0',
    sandbox.breakoutBricks.length === 0);
check('AC#4 breakoutBricksDestroyed incremented',
    sandbox.breakoutBricksDestroyed === 1);
check('AC#4 Score awarded = PER_BRICK + BONUS_HP * originalHP (10 + 5*3 = 25)',
    sandbox.score - scoreBefore === expectedPoints,
    'got: ' + (sandbox.score - scoreBefore) + ' expected: ' + expectedPoints);
check('AC#4 breakoutScore also incremented by the same amount',
    sandbox.breakoutScore - breakoutScoreBefore === expectedPoints);
check('AC#4 Particle burst spawned (count > 0)',
    sandbox.breakoutParticles.length > particlesBefore);
check('AC#4 Particles use the brick colour',
    sandbox.breakoutParticles.every(function (p) {
        return p.color === brickDead.color;
    }));

// ===== AC#5 HP > 0: colour shifts + flash effect =====
resetBreakoutWorld();
var brickShift = placeBrick(300, 300, 3);
var originalColor = brickShift.color;
sandbox.breakoutBallX = brickShift.x + brickShift.w / 2;
sandbox.breakoutBallY = brickShift.y - sandbox.BREAKOUT_BALL_RADIUS + 2;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 200;
stepFrames(1);
var hitBrick = sandbox.breakoutBricks[0];
check('AC#5 Brick still present (HP > 0 after single hit)',
    !!hitBrick && hitBrick.hp === 2);
check('AC#5 Brick colour shifted to match new HP (3 → HP2 colour)',
    hitBrick && hitBrick.color === sandbox.BREAKOUT_BRICK_COLOR_HP2 &&
    hitBrick.color !== originalColor,
    'color: ' + (hitBrick && hitBrick.color));
check('AC#5 flashTimer set > 0 (brief flash effect queued)',
    hitBrick && hitBrick.flashTimer > 0,
    'flashTimer: ' + (hitBrick && hitBrick.flashTimer));

// ===== AC#6 Ball speed increases by INCREMENT after each destroyed brick, capped =====
resetBreakoutWorld();
var brickSpeed = placeBrick(300, 300, 1);
sandbox.breakoutBallX = brickSpeed.x + brickSpeed.w / 2;
sandbox.breakoutBallY = brickSpeed.y - sandbox.BREAKOUT_BALL_RADIUS + 2;
// Use a pure vertical velocity so reflection keeps magnitude consistent.
var startSpeed = 200;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = startSpeed;
pushRandom(0.99); // no power-up
stepFrames(1);
var speedAfterDestroy = Math.sqrt(
    sandbox.breakoutBallVX * sandbox.breakoutBallVX +
    sandbox.breakoutBallVY * sandbox.breakoutBallVY
);
check('AC#6 Ball speed increased by BREAKOUT_BALL_SPEED_INCREMENT after destruction',
    Math.abs(speedAfterDestroy - (startSpeed + sandbox.BREAKOUT_BALL_SPEED_INCREMENT)) < 0.001,
    'speedAfter: ' + speedAfterDestroy + ' expected: ' +
    (startSpeed + sandbox.BREAKOUT_BALL_SPEED_INCREMENT));

// Speed cap
resetBreakoutWorld();
var brickCap = placeBrick(300, 300, 1);
sandbox.breakoutBallX = brickCap.x + brickCap.w / 2;
sandbox.breakoutBallY = brickCap.y - sandbox.BREAKOUT_BALL_RADIUS + 2;
// Start already above the cap-minus-increment so the increment would blow past the cap.
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = sandbox.BREAKOUT_BALL_SPEED_MAX; // already at cap
pushRandom(0.99); // no power-up
stepFrames(1);
var speedAtCap = Math.sqrt(
    sandbox.breakoutBallVX * sandbox.breakoutBallVX +
    sandbox.breakoutBallVY * sandbox.breakoutBallVY
);
check('AC#6 Ball speed capped at BREAKOUT_BALL_SPEED_MAX (no further increase)',
    Math.abs(speedAtCap - sandbox.BREAKOUT_BALL_SPEED_MAX) < 0.001,
    'speedAtCap: ' + speedAtCap + ' max: ' + sandbox.BREAKOUT_BALL_SPEED_MAX);

// Damaged (not destroyed) bricks should NOT ramp ball speed.
resetBreakoutWorld();
var brickDmg = placeBrick(300, 300, 2);
sandbox.breakoutBallX = brickDmg.x + brickDmg.w / 2;
sandbox.breakoutBallY = brickDmg.y - sandbox.BREAKOUT_BALL_RADIUS + 2;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 200;
stepFrames(1);
var speedAfterDmg = Math.sqrt(
    sandbox.breakoutBallVX * sandbox.breakoutBallVX +
    sandbox.breakoutBallVY * sandbox.breakoutBallVY
);
check('AC#6 Damaged (alive) brick does NOT increase ball speed',
    Math.abs(speedAfterDmg - 200) < 0.001,
    'speedAfterDmg: ' + speedAfterDmg);

// ===== AC#7 BREAKOUT_POWERUP_CHANCE drop on destruction =====
// Stub the particle spawn so its internal Math.random() calls don't consume
// the queued value we want landing on the power-up-chance roll.
var realSpawnBreakoutBrickParticles = sandbox.spawnBreakoutBrickParticles;
sandbox.spawnBreakoutBrickParticles = function () { /* no-op during AC#7 */ };

// Force power-up drop: rand < 0.15 → drop.
resetBreakoutWorld();
var brickDrop = placeBrick(300, 300, 1);
sandbox.breakoutBallX = brickDrop.x + brickDrop.w / 2;
sandbox.breakoutBallY = brickDrop.y - sandbox.BREAKOUT_BALL_RADIUS + 2;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 200;
pushRandom(0.05); // < 0.15 → drop
stepFrames(1);
check('AC#7 Random < POWERUP_CHANCE: exactly one power-up spawned',
    sandbox.breakoutPowerups.length === 1,
    'powerups: ' + sandbox.breakoutPowerups.length);
check('AC#7 Power-up position matches destroyed brick centre',
    sandbox.breakoutPowerups.length === 1 &&
    Math.abs(sandbox.breakoutPowerups[0].x - (brickDrop.x + brickDrop.w / 2)) < 0.5 &&
    Math.abs(sandbox.breakoutPowerups[0].y - (brickDrop.y + brickDrop.h / 2)) < 0.5);

// Force no-drop: rand >= 0.15 → no drop.
resetBreakoutWorld();
var brickNoDrop = placeBrick(300, 300, 1);
sandbox.breakoutBallX = brickNoDrop.x + brickNoDrop.w / 2;
sandbox.breakoutBallY = brickNoDrop.y - sandbox.BREAKOUT_BALL_RADIUS + 2;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 200;
pushRandom(0.99); // >= 0.15 → no drop
stepFrames(1);
check('AC#7 Random >= POWERUP_CHANCE: no power-up spawned',
    sandbox.breakoutPowerups.length === 0);

// Source inspection: the threshold constant is the configured one, not hard-coded.
check('AC#7 Drop guard uses BREAKOUT_POWERUP_CHANCE (not a literal)',
    /Math\.random\(\)\s*<\s*BREAKOUT_POWERUP_CHANCE/.test(breakoutBody));

// Damaged-only bricks should NOT drop power-ups.
resetBreakoutWorld();
var brickNoDrop2 = placeBrick(300, 300, 2);
sandbox.breakoutBallX = brickNoDrop2.x + brickNoDrop2.w / 2;
sandbox.breakoutBallY = brickNoDrop2.y - sandbox.BREAKOUT_BALL_RADIUS + 2;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 200;
pushRandom(0.01); // would drop if path allowed it
stepFrames(1);
check('AC#7 Damaged (alive) brick does NOT drop a power-up',
    sandbox.breakoutPowerups.length === 0);

// Restore real particle spawn for the remaining tests.
sandbox.spawnBreakoutBrickParticles = realSpawnBreakoutBrickParticles;

// ===== AC#8 Only ONE brick affected per collision event =====
// Set up two overlapping bricks (corner-hit scenario) — ball's AABB overlaps
// both. The loop should process only the first one (and `break`).
resetBreakoutWorld();
var brickA = placeBrick(300, 300, 1);
var brickB = placeBrick(360, 300, 1); // adjacent on the right; gap-free for the test
sandbox.breakoutBallX = brickA.x + brickA.w; // right on the shared edge between A and B
sandbox.breakoutBallY = brickA.y - sandbox.BREAKOUT_BALL_RADIUS + 2;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 200;
pushRandom(0.99); // no power-up on A
pushRandom(0.99); // just in case
stepFrames(1);
check('AC#8 Two adjacent bricks overlapping ball AABB: exactly one removed',
    sandbox.breakoutBricks.length === 1,
    'remaining: ' + sandbox.breakoutBricks.length);
check('AC#8 breakoutBricksDestroyed incremented by exactly 1',
    sandbox.breakoutBricksDestroyed === 1);

// Source inspection: the collision loop contains a `break;` inside the ball-
// vs-brick loop (the "first one found" guarantee).
check('AC#8 Source: collision loop exits after first hit (break statement present)',
    /for\s*\(\s*var\s+bi\s*=[\s\S]*?break;\s*\}/.test(breakoutBody));

// ===== Summary =====
var failed = results.filter(function (r) { return !r.ok; }).length;
var passed = results.length - failed;
console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
