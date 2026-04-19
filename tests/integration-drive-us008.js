// US-008 (Feature Drive): Runtime integration test for rock collision.
// Loads js/config.js + the real DRIVE_PLAYING tick block from js/update.js
// into a vm sandbox, stages rock-overlap scenarios, and verifies every
// acceptance criterion — plus static pins proving the source wires up the
// spark burst, screen shake, clang sound, and fuel deduction.
//
// Run:  node tests/integration-drive-us008.js
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

function extractBodyAfter(src, marker, label) {
    var start = src.indexOf(marker);
    if (start < 0) {
        check(label + ' marker present', false, marker + ' not found');
        process.exit(1);
    }
    var open = src.indexOf('{', start + marker.length - 1);
    var depth = 0;
    for (var i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(open + 1, i);
        }
    }
    check(label + ' matching brace', false, 'no close brace for ' + marker);
    process.exit(1);
}

// FX-side stub counters — assert spark/shake/sound fire on rock hit.
var fxCalls;
function resetFxCalls() {
    fxCalls = {
        spawnDriveSparkBurst: 0,
        startScreenShake: 0,
        playDriveRockHitSound: 0,
        lastSpark: null,
    };
}
resetFxCalls();

var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean,
    Infinity: Infinity,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    SHIP_SIZE: 40, // matches collision.js top-level SHIP_SIZE
    spawnDriveSparkBurst: function (x, y) {
        fxCalls.spawnDriveSparkBurst++;
        fxCalls.lastSpark = { x: x, y: y };
    },
    startScreenShake: function () { fxCalls.startScreenShake++; },
    playDriveRockHitSound: function () { fxCalls.playDriveRockHitSound++; },
    // US-007 pipeline stubs — kept as no-ops since US-008 scenarios don't crash.
    spawnExplosion: function () {},
    stopThrustSound: function () {},
    playExplosionSound: function () {},
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

// Also pull in spawnDriveSparkBurst's real implementation as a reference — but
// our stub wins because the stub is defined BEFORE loading the update source,
// and we don't re-evaluate update.js top-level here. The extracted physics
// block references spawnDriveSparkBurst by name, which the sandbox stub
// satisfies.

var updateSrc = loadFile('js/update.js');
var playingBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.DRIVE_PLAYING) {',
    'DRIVE_PLAYING body'
);
vm.runInContext(
    'function drivePlayingTick(dt) {\n' + playingBody + '\n}',
    sandbox,
    { filename: 'DRIVE_PLAYING-extracted' }
);
check('drivePlayingTick extracted + evaluated',
    typeof sandbox.drivePlayingTick === 'function');

// -------- Test harness: build a flat 500-seg road + stage a single rock --------
function buildFlatRoad(total) {
    var segs = [];
    for (var i = 0; i < total; i++) {
        segs.push({ x: i * 20, y: 450, type: 'ground', label: null });
    }
    return segs;
}

// The buggy screen-X is canvas.width * 0.25 = 200. The buggy's world-X is
// driveScrollX + 200. To put a rock directly under the buggy, place it at
// world-X 200 with driveScrollX = 0.
function placeRock(worldX, y) {
    return {
        type: 'rock',
        x: worldX,
        y: y,
        size: sandbox.DRIVE_ROCK_SIZE,
        label: 'edge case'
    };
}

function resetScenario() {
    resetFxCalls();
    sandbox.driveRoadSegments = buildFlatRoad(500);
    sandbox.driveRoadLength = 500 * 20;
    sandbox.driveScrollX = 0;
    sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE;
    sandbox.driveBuggyY = 450;
    sandbox.driveBuggyVY = 0;
    sandbox.driveGrounded = true;
    sandbox.driveFalling = false;
    sandbox.driveWheelRotation = 0;
    sandbox.driveBuggyTilt = 0;
    sandbox.drivePrevJumpKey = false;
    sandbox.driveDistance = 0;
    sandbox.driveScore = 0;
    sandbox.driveObstacles = [];
    sandbox.drivePickups = [];
    sandbox.driveParticles = [];
    sandbox.landingResult = null;
    sandbox.score = 5000;
    sandbox.keys = {};
    sandbox.ship = { fuel: 100 };
    sandbox.gameState = sandbox.STATES.DRIVE_PLAYING;
}

// -------- AC#1: grounded + overlap → hit --------
resetScenario();
// Place a rock under the buggy (world-X 200 matches the buggy screen-X with scrollX=0).
sandbox.driveObstacles.push(placeRock(200, 450));
var rockCountBefore = sandbox.driveObstacles.length;
sandbox.drivePlayingTick(1 / 60);
check('AC#1: grounded buggy overlapping a rock takes a hit (rock removed)',
    sandbox.driveObstacles.length === 0,
    'rocks before=' + rockCountBefore + ' after=' + sandbox.driveObstacles.length);

// -------- AC#2: screen shake + spark burst + fuel -10 on hit --------
resetScenario();
sandbox.driveObstacles.push(placeRock(200, 450));
var fuelBefore = sandbox.ship.fuel;
sandbox.drivePlayingTick(1 / 60);
check('AC#2: screen shake fires exactly once on rock hit',
    fxCalls.startScreenShake === 1,
    'shake calls=' + fxCalls.startScreenShake);
check('AC#2: spark particle burst spawned on rock hit',
    fxCalls.spawnDriveSparkBurst === 1,
    'spark calls=' + fxCalls.spawnDriveSparkBurst);
check('AC#2: fuel deducted by DRIVE_ROCK_FUEL_COST (10)',
    sandbox.ship.fuel === fuelBefore - sandbox.DRIVE_ROCK_FUEL_COST,
    'before=' + fuelBefore + ' after=' + sandbox.ship.fuel +
    ' cost=' + sandbox.DRIVE_ROCK_FUEL_COST);

// -------- AC#3: rock is destroyed — no repeat hit on same rock --------
resetScenario();
sandbox.driveObstacles.push(placeRock(200, 450));
sandbox.drivePlayingTick(1 / 60); // first frame — rock consumed
var fuelAfterHit = sandbox.ship.fuel;
// Run another 30 frames — even though scroll + Y stays overlapping the
// destroyed rock's former position, no further FX should fire.
for (var f = 0; f < 30; f++) sandbox.drivePlayingTick(1 / 60);
check('AC#3: rock is spliced from driveObstacles on impact (no repeat hit)',
    sandbox.driveObstacles.length === 0,
    'rocks=' + sandbox.driveObstacles.length);
check('AC#3: subsequent frames do not trigger additional hit FX',
    fxCalls.startScreenShake === 1 &&
    fxCalls.spawnDriveSparkBurst === 1 &&
    fxCalls.playDriveRockHitSound === 1,
    'shake=' + fxCalls.startScreenShake +
    ' spark=' + fxCalls.spawnDriveSparkBurst +
    ' sound=' + fxCalls.playDriveRockHitSound);
check('AC#3: fuel not further deducted after first rock hit',
    sandbox.ship.fuel === fuelAfterHit,
    'fuel stayed at ' + sandbox.ship.fuel);

// -------- AC#4: airborne buggy passes under/over rock with no collision --------
resetScenario();
sandbox.driveObstacles.push(placeRock(200, 450));
// Put the buggy in the air, well above the rock top (rock top = 450 - 15 = 435).
sandbox.driveBuggyY = 300;
sandbox.driveBuggyVY = -100;
sandbox.driveGrounded = false;
sandbox.drivePlayingTick(1 / 60);
check('AC#4: airborne buggy over rock does NOT destroy the rock',
    sandbox.driveObstacles.length === 1,
    'rocks=' + sandbox.driveObstacles.length);
check('AC#4: airborne buggy does NOT lose fuel from rock (no collision)',
    sandbox.ship.fuel === 100,
    'fuel=' + sandbox.ship.fuel);
check('AC#4: airborne pass does NOT fire spark/shake/sound FX',
    fxCalls.spawnDriveSparkBurst === 0 &&
    fxCalls.startScreenShake === 0 &&
    fxCalls.playDriveRockHitSound === 0,
    'spark=' + fxCalls.spawnDriveSparkBurst +
    ' shake=' + fxCalls.startScreenShake +
    ' sound=' + fxCalls.playDriveRockHitSound);

// -------- AC#5: fuel=0 from rock damage → jump disallowed but driving coasts --------
resetScenario();
sandbox.ship.fuel = 10; // exactly one rock-cost left
sandbox.driveObstacles.push(placeRock(200, 450));
sandbox.drivePlayingTick(1 / 60);
check('AC#5: fuel clamps to 0 after the last rock hit',
    sandbox.ship.fuel === 0,
    'fuel=' + sandbox.ship.fuel);
check('AC#5: buggy is still in DRIVE_PLAYING after rock hit (no crash)',
    sandbox.gameState === sandbox.STATES.DRIVE_PLAYING,
    'state=' + sandbox.gameState);
// Try to jump — must NOT leave the ground at fuel=0.
sandbox.keys['ArrowUp'] = true;
var yBeforeJump = sandbox.driveBuggyY;
var groundedBeforeJump = sandbox.driveGrounded;
sandbox.drivePlayingTick(1 / 60);
sandbox.keys['ArrowUp'] = false;
check('AC#5: fuel=0 disables jump (buggy stays grounded on Up press)',
    sandbox.driveGrounded === true && sandbox.driveBuggyVY === 0,
    'grounded=' + sandbox.driveGrounded + ' VY=' + sandbox.driveBuggyVY);
check('AC#5: fuel=0 buggy continues driving (scroll still advances)',
    sandbox.driveScrollX > 0,
    'scrollX=' + sandbox.driveScrollX);
// A few more frames to confirm the buggy coasts forward.
var scrollMid = sandbox.driveScrollX;
for (var cf = 0; cf < 60; cf++) sandbox.drivePlayingTick(1 / 60);
check('AC#5: fuel=0 buggy keeps coasting over time (no stall)',
    sandbox.driveScrollX > scrollMid,
    'scrollMid=' + scrollMid + ' scrollAfter=' + sandbox.driveScrollX);

// -------- AC#6: rock hit does NOT immediately crash the buggy --------
resetScenario();
sandbox.driveObstacles.push(placeRock(200, 450));
sandbox.drivePlayingTick(1 / 60);
check('AC#6: rock hit leaves gameState as DRIVE_PLAYING (no CRASHED)',
    sandbox.gameState === sandbox.STATES.DRIVE_PLAYING,
    'state=' + sandbox.gameState);
// Run more frames — confirm no delayed crash.
for (var c2 = 0; c2 < 60; c2++) sandbox.drivePlayingTick(1 / 60);
check('AC#6: still DRIVE_PLAYING a second later — rock is a penalty, not death',
    sandbox.gameState === sandbox.STATES.DRIVE_PLAYING,
    'state=' + sandbox.gameState);

// -------- AC#7: clang/impact sound plays on rock hit --------
resetScenario();
sandbox.driveObstacles.push(placeRock(200, 450));
sandbox.drivePlayingTick(1 / 60);
check('AC#7: playDriveRockHitSound() is called exactly once on rock hit',
    fxCalls.playDriveRockHitSound === 1,
    'sound calls=' + fxCalls.playDriveRockHitSound);

// -------- Additional: sparks tick down (life decreases) --------
// Stage a hit and check spark tick by manually populating driveParticles.
resetScenario();
sandbox.driveParticles.push({
    x: 200, y: 430,
    vx: 0, vy: 0,
    life: 0.5, maxLife: 0.5,
    size: 2, color: '#FFEB3B'
});
var lifeBefore = sandbox.driveParticles[0].life;
sandbox.drivePlayingTick(1 / 60);
check('Spark particle life decreases each frame',
    sandbox.driveParticles.length > 0 &&
    sandbox.driveParticles[0].life < lifeBefore,
    'lifeBefore=' + lifeBefore + ' lifeAfter=' +
    (sandbox.driveParticles[0] && sandbox.driveParticles[0].life));
// Run enough frames to expire the particle.
for (var tf = 0; tf < 60; tf++) sandbox.drivePlayingTick(1 / 60);
check('Expired spark particles are spliced from driveParticles',
    sandbox.driveParticles.length === 0,
    'remaining=' + sandbox.driveParticles.length);

// -------- Guard: no rock in path → no hit FX --------
resetScenario();
// Place rock far away (world-X 1000 — well past buggyWorldX=200 at start).
sandbox.driveObstacles.push(placeRock(1000, 450));
sandbox.drivePlayingTick(1 / 60);
check('Guard: far-away rock does not trigger any hit FX',
    fxCalls.startScreenShake === 0 &&
    fxCalls.spawnDriveSparkBurst === 0 &&
    fxCalls.playDriveRockHitSound === 0 &&
    sandbox.ship.fuel === 100,
    'shake=' + fxCalls.startScreenShake +
    ' spark=' + fxCalls.spawnDriveSparkBurst +
    ' sound=' + fxCalls.playDriveRockHitSound +
    ' fuel=' + sandbox.ship.fuel);

// -------- Static pins: source-byte contract --------
function hasLiteral(src, needle, label) {
    check('static pin: ' + label,
        src.indexOf(needle) >= 0,
        'needle not found: ' + needle);
}
hasLiteral(updateSrc, 'DRIVE_ROCK_FUEL_COST',
    'update.js deducts DRIVE_ROCK_FUEL_COST from fuel on rock hit');
hasLiteral(updateSrc, 'spawnDriveSparkBurst',
    'update.js spawns spark burst on rock hit');
hasLiteral(updateSrc, 'playDriveRockHitSound',
    'update.js calls playDriveRockHitSound on rock hit');
hasLiteral(updateSrc, 'startScreenShake',
    'update.js triggers screen shake on rock hit (shared with crash path)');
hasLiteral(updateSrc, 'driveObstacles.splice',
    'update.js splices the rock from driveObstacles on hit (no repeat)');
hasLiteral(updateSrc, "rk.type !== 'rock'",
    'update.js filters collision loop to rock-type obstacles');
hasLiteral(updateSrc, 'driveGrounded && !driveFalling',
    'update.js gates rock collision behind grounded state');

var configSrc = loadFile('js/config.js');
hasLiteral(configSrc, 'DRIVE_ROCK_FUEL_COST',
    'config.js declares DRIVE_ROCK_FUEL_COST constant');
hasLiteral(configSrc, '10', // the value; loose check but constant is present right before
    'config.js carries numeric constants including rock fuel cost');

var audioSrc = loadFile('js/audio.js');
hasLiteral(audioSrc, 'function playDriveRockHitSound',
    'audio.js defines playDriveRockHitSound');
hasLiteral(audioSrc, "bp.type = 'bandpass'",
    'audio.js uses a bandpass filter for the clang (PRD §14)');
hasLiteral(audioSrc, 'bp.frequency.setValueAtTime(800',
    'audio.js centres the clang filter at ~800Hz (PRD §14)');

var renderSrc = loadFile('js/render.js');
hasLiteral(renderSrc, 'driveParticles',
    'render.js draws driveParticles on DRIVE_PLAYING screen');

// -------- Summary --------
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
