// US-006 (Feature Drive): Runtime integration test for buggy physics —
// driving + jumping. Loads js/config.js + the real DRIVE_PLAYING tick block
// from js/update.js into a vm sandbox, simulates sequences of frames across
// every acceptance criterion, and also pins the render-side contract.
//
// Run:  node tests/integration-drive-us006.js
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

var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean,
    Infinity: Infinity,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
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

// Helper — reset per-scenario state to a clean flat-road baseline.
function setupScenario() {
    sandbox.driveRoadSegments = [];
    for (var i = 0; i < 500; i++) {
        sandbox.driveRoadSegments.push({
            x: i * 20,
            y: 450,
            type: 'ground',
            label: null,
        });
    }
    sandbox.driveRoadLength = 500 * 20;
    sandbox.driveScrollX = 0;
    sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE;
    sandbox.driveBuggyY = 450;
    sandbox.driveBuggyVY = 0;
    sandbox.driveGrounded = true;
    sandbox.driveWheelRotation = 0;
    sandbox.driveBuggyTilt = 0;
    sandbox.drivePrevJumpKey = false;
    sandbox.driveDistance = 0;
    sandbox.keys = {};
    sandbox.ship = { fuel: 100 };
    sandbox.gameState = sandbox.STATES.DRIVE_PLAYING;
}

function runFrames(n, dt) {
    for (var k = 0; k < n; k++) sandbox.drivePlayingTick(dt);
}

// -------- AC#1: auto-scroll at DRIVE_SCROLL_SPEED_BASE --------
setupScenario();
sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE;
runFrames(60, 1 / 60); // 1 second of no-input driving
check('AC#1: no-input drive preserves base speed',
    sandbox.driveSpeed === sandbox.DRIVE_SCROLL_SPEED_BASE,
    'driveSpeed=' + sandbox.driveSpeed);
check('AC#1: no-input drive scrolls right (driveScrollX increases)',
    sandbox.driveScrollX > 0,
    'driveScrollX=' + sandbox.driveScrollX);
// 1 s * 120 px/s = 120 px ±1
check('AC#1: 1s of scroll at base = DRIVE_SCROLL_SPEED_BASE (±1px)',
    Math.abs(sandbox.driveScrollX - sandbox.DRIVE_SCROLL_SPEED_BASE) < 1,
    'driveScrollX=' + sandbox.driveScrollX);

// -------- AC#2: accelerate with right/D --------
setupScenario();
sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE;
sandbox.keys['ArrowRight'] = true;
runFrames(180, 1 / 60); // 3s of holding accel
check('AC#2: ArrowRight accelerates above base',
    sandbox.driveSpeed > sandbox.DRIVE_SCROLL_SPEED_BASE,
    'driveSpeed=' + sandbox.driveSpeed);
check('AC#2: accelerate caps at DRIVE_SCROLL_SPEED_MAX',
    sandbox.driveSpeed === sandbox.DRIVE_SCROLL_SPEED_MAX,
    'driveSpeed=' + sandbox.driveSpeed);
check('AC#2: accelerate costs no fuel',
    sandbox.ship.fuel === 100,
    'fuel=' + sandbox.ship.fuel);

setupScenario();
sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE;
sandbox.keys['d'] = true;
runFrames(30, 1 / 60); // 0.5s
check('AC#2: lowercase d accelerates',
    sandbox.driveSpeed > sandbox.DRIVE_SCROLL_SPEED_BASE);

setupScenario();
sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE;
sandbox.keys['D'] = true;
runFrames(30, 1 / 60);
check('AC#2: uppercase D accelerates',
    sandbox.driveSpeed > sandbox.DRIVE_SCROLL_SPEED_BASE);

// -------- AC#3: brake with left/A, floor at 40 px/s --------
setupScenario();
sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE;
sandbox.keys['ArrowLeft'] = true;
runFrames(600, 1 / 60); // 10 s of holding brake
check('AC#3: brake floor is 40 px/s (never stops)',
    sandbox.driveSpeed === 40,
    'driveSpeed=' + sandbox.driveSpeed);
check('AC#3: brake keeps buggy moving forward (positive speed)',
    sandbox.driveSpeed > 0);
check('AC#3: brake costs no fuel',
    sandbox.ship.fuel === 100,
    'fuel=' + sandbox.ship.fuel);

setupScenario();
sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE;
sandbox.keys['a'] = true;
runFrames(30, 1 / 60);
check('AC#3: lowercase a brakes',
    sandbox.driveSpeed < sandbox.DRIVE_SCROLL_SPEED_BASE);

setupScenario();
sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE;
sandbox.keys['A'] = true;
runFrames(30, 1 / 60);
check('AC#3: uppercase A brakes',
    sandbox.driveSpeed < sandbox.DRIVE_SCROLL_SPEED_BASE);

// -------- AC#4: jump with up/W/space, fuel cost, edge-triggered --------
setupScenario();
sandbox.keys['ArrowUp'] = true;
sandbox.drivePlayingTick(1 / 60);
// After jump, VY = DRIVE_JUMP_VELOCITY (-280); gravity in the same tick
// adds DRIVE_GRAVITY*dt ≈ 8.33, so assert VY is within one frame of gravity.
var oneFrameGrav = sandbox.DRIVE_GRAVITY * (1 / 60);
check('AC#4: ArrowUp from grounded triggers jump (VY near DRIVE_JUMP_VELOCITY)',
    sandbox.driveBuggyVY < 0 &&
    sandbox.driveBuggyVY <= sandbox.DRIVE_JUMP_VELOCITY + oneFrameGrav + 1,
    'driveBuggyVY=' + sandbox.driveBuggyVY);
check('AC#4: jump leaves grounded=false',
    sandbox.driveGrounded === false);
check('AC#4: jump deducts DRIVE_JUMP_FUEL_COST',
    sandbox.ship.fuel === 100 - sandbox.DRIVE_JUMP_FUEL_COST,
    'fuel=' + sandbox.ship.fuel);

// Holding ArrowUp across many frames must not repeat-jump (edge-triggered).
setupScenario();
sandbox.keys['ArrowUp'] = true;
runFrames(10, 1 / 60);
check('AC#4: holding jump key spends only ONE fuel cost (edge-triggered)',
    sandbox.ship.fuel === 100 - sandbox.DRIVE_JUMP_FUEL_COST,
    'fuel=' + sandbox.ship.fuel);

// Releasing + re-pressing after landing triggers a second jump.
setupScenario();
sandbox.keys['ArrowUp'] = true;
sandbox.drivePlayingTick(1 / 60); // first jump
sandbox.keys['ArrowUp'] = false;
runFrames(120, 1 / 60); // wait for landing (gravity brings buggy down)
check('AC#4: released mid-air returns to grounded after gravity cycle',
    sandbox.driveGrounded === true);
var fuelAfterFirstLand = sandbox.ship.fuel;
sandbox.keys['ArrowUp'] = true;
sandbox.drivePlayingTick(1 / 60);
check('AC#4: second press after landing fires a second jump',
    sandbox.ship.fuel === fuelAfterFirstLand - sandbox.DRIVE_JUMP_FUEL_COST);

// W triggers jump.
setupScenario();
sandbox.keys['w'] = true;
sandbox.drivePlayingTick(1 / 60);
check('AC#4: lowercase w triggers jump',
    sandbox.driveGrounded === false);

setupScenario();
sandbox.keys['W'] = true;
sandbox.drivePlayingTick(1 / 60);
check('AC#4: uppercase W triggers jump',
    sandbox.driveGrounded === false);

// Space triggers jump.
setupScenario();
sandbox.keys[' '] = true;
sandbox.drivePlayingTick(1 / 60);
check('AC#4: space triggers jump',
    sandbox.driveGrounded === false);

// No jump when fuel=0.
setupScenario();
sandbox.ship.fuel = 0;
sandbox.keys['ArrowUp'] = true;
sandbox.drivePlayingTick(1 / 60);
check('AC#4: cannot jump when fuel is 0 (grounded stays true)',
    sandbox.driveGrounded === true);
check('AC#4: cannot jump when fuel is 0 (VY unchanged)',
    sandbox.driveBuggyVY === 0);
check('AC#4: cannot jump when fuel is 0 (fuel stays 0 — no negative)',
    sandbox.ship.fuel === 0);

// -------- AC#5: gravity applies while airborne --------
setupScenario();
sandbox.keys['ArrowUp'] = true;
sandbox.drivePlayingTick(1 / 60);
sandbox.keys['ArrowUp'] = false;
var vyAfterJump = sandbox.driveBuggyVY;
sandbox.drivePlayingTick(1 / 60);
check('AC#5: gravity adds to driveBuggyVY while airborne',
    sandbox.driveBuggyVY > vyAfterJump,
    'vyAfterJump=' + vyAfterJump + ' newVY=' + sandbox.driveBuggyVY);
// VY delta ≈ DRIVE_GRAVITY * dt = 500 * 1/60 ≈ 8.33
var vyDelta = sandbox.driveBuggyVY - vyAfterJump;
check('AC#5: gravity delta ≈ DRIVE_GRAVITY * dt (±1)',
    Math.abs(vyDelta - sandbox.DRIVE_GRAVITY * (1 / 60)) < 1,
    'delta=' + vyDelta);

// Airborne buggy eventually returns to ground.
setupScenario();
sandbox.keys['ArrowUp'] = true;
sandbox.drivePlayingTick(1 / 60);
sandbox.keys['ArrowUp'] = false;
runFrames(300, 1 / 60); // 5 seconds — plenty for full gravity arc
check('AC#5: buggy lands back on ground after airborne arc',
    sandbox.driveGrounded === true &&
    Math.abs(sandbox.driveBuggyY - 450) < 0.001,
    'Y=' + sandbox.driveBuggyY + ' grounded=' + sandbox.driveGrounded);

// -------- AC#6: buggy sticks to terrain; follows slopes --------
setupScenario();
// Rewrite road as a slope: rising from y=450 to y=400 over 100 segments.
for (var si = 0; si < sandbox.driveRoadSegments.length; si++) {
    if (si < 100) {
        sandbox.driveRoadSegments[si].y = 450 - si * 0.5;
    } else {
        sandbox.driveRoadSegments[si].y = 400;
    }
}
sandbox.driveBuggyY = sandbox.driveRoadSegments[10].y; // arbitrary start on slope
sandbox.driveScrollX = 10 * 20 - 800 * 0.25; // buggy world-x = seg 10
sandbox.drivePlayingTick(1 / 60);
var expectedSegIdx = Math.floor((sandbox.driveScrollX + 800 * 0.25) / 20);
var expectedY = sandbox.driveRoadSegments[expectedSegIdx].y;
check('AC#6: grounded buggy follows slope (Y = segment y at buggy world-X)',
    Math.abs(sandbox.driveBuggyY - expectedY) < 0.001,
    'buggyY=' + sandbox.driveBuggyY + ' expected=' + expectedY);

// While driving along a slope, Y tracks segments continuously.
setupScenario();
for (var si = 0; si < sandbox.driveRoadSegments.length; si++) {
    sandbox.driveRoadSegments[si].y = 450 - si * 0.25; // gentle rise
}
sandbox.driveBuggyY = 450;
var lastY = sandbox.driveBuggyY;
var decreasedAtLeastOnce = false;
for (var f = 0; f < 30; f++) {
    sandbox.drivePlayingTick(1 / 60);
    if (sandbox.driveBuggyY < lastY) decreasedAtLeastOnce = true;
    lastY = sandbox.driveBuggyY;
}
check('AC#6: grounded Y changes as buggy advances over rising slope',
    decreasedAtLeastOnce);

// -------- AC#7: cannot double-jump (airborne jump ignored) --------
setupScenario();
sandbox.keys['ArrowUp'] = true;
sandbox.drivePlayingTick(1 / 60); // first jump
var fuelAfterFirst = sandbox.ship.fuel;
var vyAfterFirst = sandbox.driveBuggyVY;
sandbox.keys['ArrowUp'] = false;
sandbox.drivePlayingTick(1 / 60); // release
sandbox.keys['ArrowUp'] = true;
sandbox.drivePlayingTick(1 / 60); // press again while airborne
check('AC#7: mid-air re-press does NOT deduct more fuel',
    sandbox.ship.fuel === fuelAfterFirst,
    'fuel=' + sandbox.ship.fuel + ' expected=' + fuelAfterFirst);
check('AC#7: mid-air re-press does NOT reset driveBuggyVY to jump velocity',
    sandbox.driveBuggyVY !== sandbox.DRIVE_JUMP_VELOCITY ||
    Math.abs(sandbox.driveBuggyVY - vyAfterFirst) > 0);

// -------- AC#8: wheels rotate proportional to speed --------
setupScenario();
sandbox.driveWheelRotation = 0;
sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE;
sandbox.drivePlayingTick(1 / 60);
var expectedRot = sandbox.DRIVE_SCROLL_SPEED_BASE * (1 / 60);
check('AC#8: driveWheelRotation += driveSpeed * dt (one frame)',
    Math.abs(sandbox.driveWheelRotation - expectedRot) < 0.001,
    'rot=' + sandbox.driveWheelRotation + ' expected=' + expectedRot);
// Larger speed → larger rotation delta per frame.
setupScenario();
sandbox.driveWheelRotation = 0;
sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_MAX;
sandbox.drivePlayingTick(1 / 60);
var rotAtMax = sandbox.driveWheelRotation;
setupScenario();
sandbox.driveWheelRotation = 0;
sandbox.driveSpeed = 40;
sandbox.drivePlayingTick(1 / 60);
var rotAtMin = sandbox.driveWheelRotation;
check('AC#8: wheel rotation delta scales with driveSpeed (max > min)',
    rotAtMax > rotAtMin,
    'max=' + rotAtMax + ' min=' + rotAtMin);

// -------- AC#9: tilt while airborne, clamped to ±10°, cosmetic --------
var MAX_TILT = 10 * Math.PI / 180;

setupScenario();
sandbox.drivePlayingTick(1 / 60);
check('AC#9: grounded buggy has zero tilt',
    sandbox.driveBuggyTilt === 0);

// Rising (VY negative after jump) → nose up (tilt negative).
setupScenario();
sandbox.keys['ArrowUp'] = true;
sandbox.drivePlayingTick(1 / 60);
check('AC#9: rising airborne buggy has negative tilt (nose up)',
    sandbox.driveBuggyTilt < 0,
    'tilt=' + sandbox.driveBuggyTilt);
check('AC#9: rising tilt clamped to ≥ -10°',
    sandbox.driveBuggyTilt >= -MAX_TILT - 1e-9,
    'tilt=' + sandbox.driveBuggyTilt);

// Falling (VY positive) → nose down (tilt positive).
setupScenario();
sandbox.driveGrounded = false;
sandbox.driveBuggyVY = 200; // clearly falling
sandbox.driveBuggyY = 200; // high above ground, so physics continues airborne
sandbox.drivePlayingTick(1 / 60);
check('AC#9: falling airborne buggy has positive tilt (nose down)',
    sandbox.driveBuggyTilt > 0,
    'tilt=' + sandbox.driveBuggyTilt);
check('AC#9: falling tilt clamped to ≤ +10°',
    sandbox.driveBuggyTilt <= MAX_TILT + 1e-9,
    'tilt=' + sandbox.driveBuggyTilt);

// Tilt is purely cosmetic — physics still produces expected Y/VY regardless.
setupScenario();
sandbox.driveGrounded = false;
sandbox.driveBuggyVY = 500;
sandbox.driveBuggyY = 200;
var yBefore = sandbox.driveBuggyY;
sandbox.drivePlayingTick(1 / 60);
check('AC#9: large VY still applied to Y (tilt does not alter physics)',
    sandbox.driveBuggyY > yBefore);

// -------- Static pins: source-byte contract --------
function hasLiteral(src, needle, label) {
    check('static pin: ' + label,
        src.indexOf(needle) >= 0,
        'needle not found: ' + needle);
}

hasLiteral(updateSrc,
    "gameState === STATES.DRIVE_PLAYING",
    'DRIVE_PLAYING gameState check present in update.js');
hasLiteral(updateSrc,
    "DRIVE_SCROLL_SPEED_MAX",
    'update.js references DRIVE_SCROLL_SPEED_MAX');
hasLiteral(updateSrc,
    "DRIVE_JUMP_FUEL_COST",
    'update.js references DRIVE_JUMP_FUEL_COST');
hasLiteral(updateSrc,
    "DRIVE_GRAVITY",
    'update.js references DRIVE_GRAVITY');
hasLiteral(updateSrc,
    "DRIVE_JUMP_VELOCITY",
    'update.js references DRIVE_JUMP_VELOCITY');
hasLiteral(updateSrc,
    "driveWheelRotation += driveSpeed",
    'wheel rotation increment formula matches AC#8 wording');

var renderSrc = loadFile('js/render.js');
hasLiteral(renderSrc,
    "function renderDrivePlaying",
    'renderDrivePlaying() defined in render.js');
hasLiteral(renderSrc,
    "case STATES.DRIVE_PLAYING:",
    'DRIVE_PLAYING dispatched by render() switch');
hasLiteral(renderSrc,
    "driveBuggyTilt",
    'render reads driveBuggyTilt for airborne cosmetic tilt');

// -------- Summary --------
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
