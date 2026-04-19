// US-007 (Feature Drive): Runtime integration test for gap-fall detection +
// lose condition. Loads js/config.js + the real DRIVE_PLAYING tick block
// from js/update.js into a vm sandbox, simulates gap-fall scenarios, and
// verifies every acceptance criterion — plus static pins proving the source
// wires up spawnExplosion / playExplosionSound / STATES.CRASHED on gap fall.
//
// Run:  node tests/integration-drive-us007.js
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

// FX-side stub counters so we can assert spawnExplosion / sound / shake fire
// exactly once on crash.
var fxCalls;
function resetFxCalls() {
    fxCalls = {
        spawnExplosion: 0,
        startScreenShake: 0,
        stopThrustSound: 0,
        playExplosionSound: 0,
        lastExplosion: null,
    };
}

var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean,
    Infinity: Infinity,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    spawnExplosion: function (x, y) { fxCalls.spawnExplosion++; fxCalls.lastExplosion = { x: x, y: y }; },
    startScreenShake: function () { fxCalls.startScreenShake++; },
    stopThrustSound: function () { fxCalls.stopThrustSound++; },
    playExplosionSound: function () { fxCalls.playExplosionSound++; },
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

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

// driveFalling must be declared at config scope for the physics block to
// reference it as a module-level var. Confirm it's in the sandbox.
check('driveFalling declared in config.js',
    typeof sandbox.driveFalling === 'boolean',
    'typeof=' + typeof sandbox.driveFalling);

// Helper — build a flat road with an explicit gap between world-X ranges
// [gapStart, gapEnd). Segments at 20px width; base ground Y = 450.
function buildRoadWithGap(gapStart, gapEnd) {
    var segs = [];
    var SEGW = 20;
    var total = 500;
    for (var i = 0; i < total; i++) {
        var sx = i * SEGW;
        var isGap = sx >= gapStart && sx < gapEnd;
        segs.push({
            x: sx,
            y: 450,
            type: isGap ? 'gap' : 'ground',
            label: null,
        });
    }
    return segs;
}

function resetScenario(gapStart, gapEnd) {
    resetFxCalls();
    sandbox.driveRoadSegments = buildRoadWithGap(gapStart, gapEnd);
    sandbox.driveRoadLength = sandbox.driveRoadSegments.length * 20;
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
    sandbox.landingResult = null;
    sandbox.score = 1234; // pre-existing banked score to prove it stays
    sandbox.keys = {};
    sandbox.ship = { fuel: 100 };
    sandbox.gameState = sandbox.STATES.DRIVE_PLAYING;
}

function runFrames(n, dt) {
    for (var k = 0; k < n; k++) {
        sandbox.drivePlayingTick(dt);
        if (sandbox.gameState !== sandbox.STATES.DRIVE_PLAYING) return k + 1;
    }
    return n;
}

// -------- AC#1: buggy over gap at/below gap edge Y → falls --------

// Start the buggy so its world-X lands inside the gap region.
// buggyWorldX = driveScrollX + canvas.width * 0.25 = scrollX + 200.
// To start with the buggy centered over a gap beginning at world-X 600,
// use scrollX = 400 → buggyWorldX = 600.
resetScenario(600, 660); // 3-seg gap
sandbox.driveScrollX = 400;
// Ground & matching Y at start — sitting on the phantom gap edge.
sandbox.driveBuggyY = 450;
sandbox.driveGrounded = true;

// First tick — detection should engage driveFalling.
sandbox.drivePlayingTick(1 / 60);
check('AC#1: grounded buggy over gap at edge Y → driveFalling=true',
    sandbox.driveFalling === true,
    'driveFalling=' + sandbox.driveFalling);
check('AC#1: gap-fall release breaks the ground stick',
    sandbox.driveGrounded === false,
    'driveGrounded=' + sandbox.driveGrounded);

// -------- AC#1 (negative): buggy ABOVE gap edge Y (mid-jump) does NOT fall --------
resetScenario(600, 660);
sandbox.driveScrollX = 400;
sandbox.driveBuggyY = 200; // well above edge Y of 450
sandbox.driveBuggyVY = -100; // still rising
sandbox.driveGrounded = false;
sandbox.drivePlayingTick(1 / 60);
check('AC#1: buggy above gap edge Y (mid-jump) does NOT commit to gap fall',
    sandbox.driveFalling === false,
    'driveFalling=' + sandbox.driveFalling);

// -------- AC#1 (positive): descending airborne buggy drops into gap and falls --------
// Use a wide gap so the buggy spends enough time over it to descend past
// the edge Y. Gap [600, 800) = 10 seg = 200px; at 120 px/s scroll that's
// ~1.66s of gap traversal, enough for a Y=420 buggy with VY=50 to descend
// to ≥450 (edge Y) under DRIVE_GRAVITY.
resetScenario(600, 800);
sandbox.driveScrollX = 400;
sandbox.driveBuggyY = 420;   // close to edge Y (450), below canvas mid
sandbox.driveBuggyVY = 50;   // already descending
sandbox.driveGrounded = false;
// Run until buggy descends past edge Y — should flip to falling.
var frames = runFrames(240, 1 / 60); // 4s cap
check('AC#1: descending airborne buggy over gap eventually commits to fall',
    sandbox.driveFalling === true,
    'frames=' + frames + ' driveFalling=' + sandbox.driveFalling +
    ' Y=' + sandbox.driveBuggyY);

// -------- AC#1 / AC#6 (bonus): buggy that clears a gap lands safely on far side --------
resetScenario(600, 640); // narrow 2-seg gap
sandbox.driveScrollX = 390; // buggyWorldX = 590 → one seg before gap
sandbox.driveBuggyY = 450;
sandbox.driveGrounded = true;
// Jump immediately so a high arc clears the 40px gap.
sandbox.keys['ArrowUp'] = true;
sandbox.drivePlayingTick(1 / 60);
sandbox.keys['ArrowUp'] = false;
// Run enough frames to traverse and re-ground past the gap.
runFrames(360, 1 / 60);
check('AC#1: buggy that jumps before gap and clears it does NOT fall',
    sandbox.driveFalling === false,
    'driveFalling=' + sandbox.driveFalling +
    ' finalY=' + sandbox.driveBuggyY +
    ' gameState=' + sandbox.gameState);
check('AC#1: buggy that clears gap is re-grounded on far side',
    sandbox.driveGrounded === true &&
    sandbox.gameState === sandbox.STATES.DRIVE_PLAYING,
    'grounded=' + sandbox.driveGrounded + ' state=' + sandbox.gameState);

// -------- AC#2: continues falling under DRIVE_GRAVITY while airborne --------
resetScenario(600, 760); // wide 8-seg gap
sandbox.driveScrollX = 400;
sandbox.driveBuggyY = 450;
sandbox.driveGrounded = true;

sandbox.drivePlayingTick(1 / 60); // engage fall
var vy1 = sandbox.driveBuggyVY;
sandbox.drivePlayingTick(1 / 60);
var vy2 = sandbox.driveBuggyVY;
var vyDelta = vy2 - vy1;
check('AC#2: falling VY grows per DRIVE_GRAVITY * dt (±0.5)',
    Math.abs(vyDelta - sandbox.DRIVE_GRAVITY * (1 / 60)) < 0.5,
    'vy1=' + vy1 + ' vy2=' + vy2 + ' delta=' + vyDelta);
check('AC#2: falling VY is positive (downward) after multiple gravity ticks',
    vy2 > 0,
    'vy2=' + vy2);

// AC#2: Y increases every frame while falling.
resetScenario(600, 760);
sandbox.driveScrollX = 400;
sandbox.driveBuggyY = 450;
sandbox.driveGrounded = true;
sandbox.drivePlayingTick(1 / 60); // engage fall
var yBefore = sandbox.driveBuggyY;
runFrames(20, 1 / 60);
check('AC#2: driveBuggyY increases while falling (buggy moves toward bottom)',
    sandbox.driveBuggyY > yBefore,
    'yBefore=' + yBefore + ' yAfter=' + sandbox.driveBuggyY);

// AC#2 persistence: even if scroll carries buggy past the gap back over
// ground segments, driveFalling must stay true (no re-ground mid-fall).
resetScenario(600, 660); // narrow 3-seg gap
sandbox.driveScrollX = 400;
sandbox.driveBuggyY = 450;
sandbox.driveGrounded = true;
sandbox.drivePlayingTick(1 / 60); // engage fall
// Run enough frames for scroll to carry buggyWorldX past the gap (660).
// At DRIVE_SCROLL_SPEED_BASE=120 px/s, needs ~(660-600)/120 = 0.5s → 30 frames.
runFrames(60, 1 / 60);
check('AC#2: driveFalling persists after scroll carries buggy past the gap',
    sandbox.driveFalling === true,
    'driveFalling=' + sandbox.driveFalling +
    ' worldX=' + (sandbox.driveScrollX + 800 * 0.25));
check('AC#2: buggy does NOT re-ground mid-fall (driveGrounded stays false)',
    sandbox.driveGrounded === false,
    'driveGrounded=' + sandbox.driveGrounded);

// -------- AC#3: gap fall transitions to STATES.CRASHED once buggy exits bottom --------
resetScenario(600, 760); // wide gap
sandbox.driveScrollX = 400;
sandbox.driveBuggyY = 450;
sandbox.driveGrounded = true;
var framesToCrash = runFrames(600, 1 / 60); // cap at 10s; should crash in <2s
check('AC#3: gap fall eventually transitions gameState to STATES.CRASHED',
    sandbox.gameState === sandbox.STATES.CRASHED,
    'gameState=' + sandbox.gameState + ' frames=' + framesToCrash);
check('AC#3: crash transition occurred AFTER driveBuggyY passed canvas.height',
    sandbox.driveBuggyY > sandbox.canvas.height,
    'driveBuggyY=' + sandbox.driveBuggyY + ' canvas.height=' + sandbox.canvas.height);
check('AC#3: crash transition not instantaneous — requires multiple frames of fall',
    framesToCrash >= 2,
    'framesToCrash=' + framesToCrash);

// -------- AC#4: partial driveScore / banked score stays in `score` --------
resetScenario(600, 760);
sandbox.driveScrollX = 400;
sandbox.driveBuggyY = 450;
sandbox.driveGrounded = true;
var preCrashScore = sandbox.score;
runFrames(600, 1 / 60);
check('AC#4: global `score` is not reset or subtracted by the gap-fall crash',
    sandbox.score === preCrashScore,
    'preCrash=' + preCrashScore + ' post=' + sandbox.score);
check('AC#4: driveScore is not subtracted/zeroed by the crash path',
    sandbox.driveScore === 0,
    'driveScore=' + sandbox.driveScore);

// -------- AC#5: crash explosion + screen shake + explosion sound fire on crash --------
resetScenario(600, 760);
sandbox.driveScrollX = 400;
sandbox.driveBuggyY = 450;
sandbox.driveGrounded = true;
runFrames(600, 1 / 60);
check('AC#5: spawnExplosion() is called exactly once on the gap-fall crash',
    fxCalls.spawnExplosion === 1,
    'spawnExplosion calls=' + fxCalls.spawnExplosion);
check('AC#5: explosion X is the buggy screen X (canvas.width * 0.25)',
    fxCalls.lastExplosion && Math.abs(fxCalls.lastExplosion.x - 200) < 1,
    'explosion=' + JSON.stringify(fxCalls.lastExplosion));
check('AC#5: explosion Y is at / near the canvas bottom (off-screen fall)',
    fxCalls.lastExplosion && fxCalls.lastExplosion.y > 500 &&
    fxCalls.lastExplosion.y <= sandbox.canvas.height,
    'explosion=' + JSON.stringify(fxCalls.lastExplosion));
check('AC#5: startScreenShake() is called on the gap-fall crash',
    fxCalls.startScreenShake === 1,
    'startScreenShake calls=' + fxCalls.startScreenShake);
check('AC#5: playExplosionSound() is called on the gap-fall crash',
    fxCalls.playExplosionSound === 1,
    'playExplosionSound calls=' + fxCalls.playExplosionSound);
check('AC#5: stopThrustSound() is called on the gap-fall crash',
    fxCalls.stopThrustSound >= 1,
    'stopThrustSound calls=' + fxCalls.stopThrustSound);
check('AC#5: landingResult is set with a crash reason for the crash screen',
    typeof sandbox.landingResult === 'string' && sandbox.landingResult.length > 0,
    'landingResult=' + sandbox.landingResult);

// -------- Additional guard: no crash / no FX when buggy drives on flat road --------
resetScenario(10000, 10020); // gap out of reach on 500-segment road
sandbox.driveScrollX = 0;
sandbox.driveBuggyY = 450;
sandbox.driveGrounded = true;
runFrames(120, 1 / 60); // 2s of flat-road driving
check('Guard: flat-road driving does not engage driveFalling',
    sandbox.driveFalling === false,
    'driveFalling=' + sandbox.driveFalling);
check('Guard: flat-road driving does not transition to CRASHED',
    sandbox.gameState === sandbox.STATES.DRIVE_PLAYING,
    'state=' + sandbox.gameState);
check('Guard: flat-road driving does not call spawnExplosion',
    fxCalls.spawnExplosion === 0,
    'calls=' + fxCalls.spawnExplosion);

// -------- Static pins: source-byte contract --------
function hasLiteral(src, needle, label) {
    check('static pin: ' + label,
        src.indexOf(needle) >= 0,
        'needle not found: ' + needle);
}
hasLiteral(updateSrc, "driveFalling",
    'update.js uses driveFalling state');
hasLiteral(updateSrc, ".type === 'gap'",
    'update.js detects gap segments by seg.type');
hasLiteral(updateSrc, "gameState = STATES.CRASHED",
    'update.js transitions to STATES.CRASHED');
hasLiteral(updateSrc, "spawnExplosion",
    'update.js calls spawnExplosion on gap-fall crash');
hasLiteral(updateSrc, "playExplosionSound",
    'update.js calls playExplosionSound on gap-fall crash');
hasLiteral(updateSrc, "DRIVE_GRAVITY",
    'update.js references DRIVE_GRAVITY for fall physics');
hasLiteral(updateSrc, "canvas.height",
    'update.js uses canvas.height as the off-screen crash threshold');

var configSrc = loadFile('js/config.js');
hasLiteral(configSrc, "var driveFalling",
    'config.js declares driveFalling module-level state');

// -------- Summary --------
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
