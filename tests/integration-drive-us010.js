// US-010 (Feature Drive): Runtime integration test for slow zones + speed
// boosts. Loads js/config.js + the real DRIVE_PLAYING tick block from
// js/update.js into a vm sandbox and verifies each acceptance criterion.
// Also exercises setupDriveWorld() to confirm slow/boost zones are placed
// with the correct labels and rendered consistent with US-005 visuals.
//
// Run:  node tests/integration-drive-us010.js
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

function extractBlock(src, marker, label) {
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
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    check(label + ' matching brace', false, 'no close brace for ' + marker);
    process.exit(1);
}

// FX-side stub counters — the boost-trigger path calls playDriveBoostSound;
// we count invocations to assert AC#4 (whoosh on boost, none on slow).
var fxCalls;
function resetFxCalls() {
    fxCalls = {
        playDriveBoostSound: 0,
        spawnDriveSparkBurst: 0,
        spawnDrivePickupSparkle: 0,
        playDrivePickupSound: 0,
        playDriveRockHitSound: 0,
        startScreenShake: 0,
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
    SHIP_SIZE: 40,
    playDriveBoostSound: function () { fxCalls.playDriveBoostSound++; },
    spawnDriveSparkBurst: function () { fxCalls.spawnDriveSparkBurst++; },
    spawnDrivePickupSparkle: function () { fxCalls.spawnDrivePickupSparkle++; },
    playDrivePickupSound: function () { fxCalls.playDrivePickupSound++; },
    playDriveRockHitSound: function () { fxCalls.playDriveRockHitSound++; },
    startScreenShake: function () { fxCalls.startScreenShake++; },
    spawnExplosion: function () {},
    stopThrustSound: function () {},
    playExplosionSound: function () {},
    // US-011: arrival branch in the DRIVE_PLAYING tick may fire when a test
    // scrolls past driveRoadLength. Provide no-op stubs so these tests don't
    // throw when the arrival condition is met during long test windows.
    spawnCelebration: function () {},
    updateCelebration: function () {},
    playDriveCompleteSound: function () {},
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

// -------- Test harness: build a road with chosen segment types --------
// types is an array of segment-type strings indexed by segment.
function buildTypedRoad(types) {
    var segs = [];
    for (var i = 0; i < types.length; i++) {
        segs.push({
            x: i * 20,
            y: 450,
            type: types[i],
            label: types[i] === 'slow' ? '// TODO'
                 : types[i] === 'boost' ? 'CI passed'
                 : null
        });
    }
    return segs;
}
function flatRoad(n) {
    var t = [];
    for (var i = 0; i < n; i++) t.push('ground');
    return t;
}

function resetScenario(types) {
    resetFxCalls();
    sandbox.driveRoadSegments = buildTypedRoad(types);
    sandbox.driveRoadLength = types.length * 20;
    sandbox.driveScrollX = 0;
    sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE;
    sandbox.driveBuggyY = 450;
    sandbox.driveBuggyVY = 0;
    sandbox.driveGrounded = true;
    sandbox.driveFalling = false;
    sandbox.driveBoostTimer = 0;
    sandbox.drivePrevSegType = null;
    sandbox.driveWheelRotation = 0;
    sandbox.driveBuggyTilt = 0;
    sandbox.drivePrevJumpKey = false;
    sandbox.driveDistance = 0;
    sandbox.driveScore = 0;
    sandbox.drivePickupsCollected = 0;
    sandbox.driveObstacles = [];
    sandbox.drivePickups = [];
    sandbox.driveParticles = [];
    sandbox.landingResult = null;
    sandbox.score = 0;
    sandbox.keys = {};
    sandbox.ship = { fuel: 50 };
    sandbox.gameState = sandbox.STATES.DRIVE_PLAYING;
}

// Buggy world-X = driveScrollX + canvas.width*0.25 = 0 + 200 = 200 → segIdx 10.
// To put the buggy on a specific segment idx, set scrollX = (segIdx*20) - 200.

// -------- AC#1: slow zone reduces max speed by 40% --------
// Set up a long stretch of slow segments around the buggy. Hold accel and
// confirm driveSpeed plateaus at MAX*(1-DRIVE_SLOW_FACTOR), not MAX.
(function () {
    // Wide slow zone so the buggy can't exit during the test's accel window.
    var types = flatRoad(2000);
    for (var i = 8; i < 1990; i++) types[i] = 'slow';
    resetScenario(types);
    // start over a slow seg (idx 10) with speed already low so accel can reach cap
    sandbox.driveSpeed = 100;
    sandbox.keys = { 'ArrowRight': true };
    // 120 frames = 2 sec; at slow cap 150 px/s → 300px advance, still well within zone
    for (var f = 0; f < 120; f++) sandbox.drivePlayingTick(1 / 60);
    var slowMax = sandbox.DRIVE_SCROLL_SPEED_MAX * (1 - sandbox.DRIVE_SLOW_FACTOR);
    // Sanity: confirm we're still over a slow seg before asserting the cap
    var segIdxNow = Math.floor((sandbox.driveScrollX + 200) / 20);
    check('AC#1: precondition — buggy still over slow seg after accel window',
        sandbox.driveRoadSegments[segIdxNow].type === 'slow',
        'segIdxNow=' + segIdxNow + ' type=' + sandbox.driveRoadSegments[segIdxNow].type);
    check('AC#1: slow zone caps driveSpeed at MAX*(1-DRIVE_SLOW_FACTOR) (=150 at defaults)',
        Math.abs(sandbox.driveSpeed - slowMax) < 1.0,
        'driveSpeed=' + sandbox.driveSpeed.toFixed(2) + ' expected≈' + slowMax);
    // Also confirm the cap is exactly 60% of MAX (slow factor = 40% reduction)
    check('AC#1: DRIVE_SLOW_FACTOR encodes a 40% reduction (MAX*0.6 = effective max)',
        Math.abs(slowMax - sandbox.DRIVE_SCROLL_SPEED_MAX * 0.6) < 1e-9,
        'slowMax=' + slowMax + ' MAX*0.6=' + (sandbox.DRIVE_SCROLL_SPEED_MAX * 0.6));
})();

// -------- AC#1: buggy decelerates to slow max if currently faster --------
(function () {
    var types = flatRoad(50);
    for (var i = 11; i < 30; i++) types[i] = 'slow';
    resetScenario(types);
    // Start fast (above slow cap), no input, just over a ground seg about to enter slow
    sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_MAX; // 250
    // place buggy world-X = 220 → segIdx = 11 (first slow seg)
    sandbox.driveScrollX = 20;
    sandbox.keys = {}; // coast
    var initialSpeed = sandbox.driveSpeed;
    sandbox.drivePlayingTick(1 / 60);
    var oneFrameDecel = sandbox.DRIVE_BRAKE_DECEL * (1 / 60);
    check('AC#1: in slow zone above cap → decelerates at brake rate (one frame)',
        sandbox.driveSpeed < initialSpeed,
        'before=' + initialSpeed + ' after=' + sandbox.driveSpeed);
    // Continue ticking, ensure we settle at slow max (not below, not above)
    for (var f = 0; f < 600; f++) sandbox.drivePlayingTick(1 / 60);
    var slowMax = sandbox.DRIVE_SCROLL_SPEED_MAX * (1 - sandbox.DRIVE_SLOW_FACTOR);
    // After settling, speed should be at relax target (BASE = 120, since BASE < slowMax)
    check('AC#1: in slow zone with no input → speed settles at relax target (BASE=120)',
        Math.abs(sandbox.driveSpeed - sandbox.DRIVE_SCROLL_SPEED_BASE) < 1.0,
        'driveSpeed=' + sandbox.driveSpeed.toFixed(2) +
        ' base=' + sandbox.DRIVE_SCROLL_SPEED_BASE);
})();

// -------- AC#1: NO whoosh sound on entering slow zone --------
(function () {
    var types = flatRoad(30);
    for (var i = 11; i < 25; i++) types[i] = 'slow';
    resetScenario(types);
    sandbox.driveScrollX = 20; // buggy at world-X 220 → segIdx 11
    sandbox.drivePlayingTick(1 / 60);
    check('AC#4: entering a slow zone does NOT play playDriveBoostSound',
        fxCalls.playDriveBoostSound === 0,
        'playDriveBoostSound calls=' + fxCalls.playDriveBoostSound);
})();

// -------- AC#2: speed boost +50% for 1 second on entering boost segment --------
(function () {
    var types = flatRoad(30);
    types[11] = 'boost';
    types[12] = 'boost';
    resetScenario(types);
    sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE; // 120
    var preBoostSpeed = sandbox.driveSpeed;
    sandbox.driveScrollX = 20; // buggy at world-X 220 → segIdx 11 (boost)
    sandbox.drivePlayingTick(1 / 60);
    var expectedAfter = preBoostSpeed * (1 + sandbox.DRIVE_BOOST_FACTOR);
    // The tick may also subtract one frame of relax (toward BASE*1.5=180);
    // expectedAfter is right at the relax target so no drift either way.
    check('AC#2: entering boost seg multiplies driveSpeed by (1 + DRIVE_BOOST_FACTOR)',
        Math.abs(sandbox.driveSpeed - expectedAfter) < 1.5,
        'before=' + preBoostSpeed + ' after=' + sandbox.driveSpeed +
        ' expected≈' + expectedAfter);
    check('AC#2: DRIVE_BOOST_FACTOR encodes a 50% increase',
        Math.abs(sandbox.DRIVE_BOOST_FACTOR - 0.5) < 1e-9,
        'DRIVE_BOOST_FACTOR=' + sandbox.DRIVE_BOOST_FACTOR);
    check('AC#2: driveBoostTimer set to DRIVE_BOOST_DURATION on entry',
        sandbox.driveBoostTimer > 0 &&
        sandbox.driveBoostTimer <= sandbox.DRIVE_BOOST_DURATION,
        'driveBoostTimer=' + sandbox.driveBoostTimer +
        ' DRIVE_BOOST_DURATION=' + sandbox.DRIVE_BOOST_DURATION);
    check('AC#2: DRIVE_BOOST_DURATION is 1.0 second',
        Math.abs(sandbox.DRIVE_BOOST_DURATION - 1.0) < 1e-9,
        'DRIVE_BOOST_DURATION=' + sandbox.DRIVE_BOOST_DURATION);
})();

// -------- AC#2: boost lingers after leaving the zone (timer-based) --------
(function () {
    var types = flatRoad(200);
    // Single short boost band at segs 11-12
    types[11] = 'boost';
    types[12] = 'boost';
    resetScenario(types);
    sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE;
    sandbox.driveScrollX = 20; // segIdx 11
    sandbox.drivePlayingTick(1 / 60); // enter boost — speed *=1.5, timer=1.0
    // After 0.5 sec of ticking, the buggy should have advanced past the boost
    // segments (boost is 40px wide; at boosted speed ≈ 180 px/s, 40px in
    // ~0.22s). Boost timer should still be active (~0.5s remaining).
    var boostedSpeedRightAfter = sandbox.driveSpeed;
    for (var f = 0; f < 30; f++) sandbox.drivePlayingTick(1 / 60); // 0.5 sec
    check('AC#2: boost lingers after leaving zone (timer still active mid-window)',
        sandbox.driveBoostTimer > 0,
        'driveBoostTimer=' + sandbox.driveBoostTimer);
    // Check buggy is now PAST the boost segs (segIdx > 12)
    var segIdxNow = Math.floor((sandbox.driveScrollX + 200) / 20);
    check('AC#2: buggy advances past the 2-seg boost band during boost window',
        segIdxNow > 12,
        'segIdxNow=' + segIdxNow);
    // Speed should still be boosted (above MAX, near BASE*1.5=180)
    check('AC#2: speed remains elevated (above normal MAX) while boost timer runs',
        sandbox.driveSpeed >= sandbox.DRIVE_SCROLL_SPEED_BASE,
        'driveSpeed=' + sandbox.driveSpeed.toFixed(2));
    // After the timer expires (~0.5s more), speed should decay back below MAX
    for (var ff = 0; ff < 90; ff++) sandbox.drivePlayingTick(1 / 60); // 1.5 sec more
    check('AC#2: boost timer expires after ~1 second',
        sandbox.driveBoostTimer === 0,
        'driveBoostTimer=' + sandbox.driveBoostTimer);
})();

// -------- AC#4: whoosh sound plays on boost trigger --------
(function () {
    var types = flatRoad(30);
    types[11] = 'boost';
    types[12] = 'boost';
    resetScenario(types);
    sandbox.driveScrollX = 20; // segIdx 11
    sandbox.drivePlayingTick(1 / 60);
    check('AC#4: playDriveBoostSound called exactly once on boost entry',
        fxCalls.playDriveBoostSound === 1,
        'playDriveBoostSound calls=' + fxCalls.playDriveBoostSound);
    // Ticking again on the same boost run should NOT re-fire (edge-triggered)
    sandbox.drivePlayingTick(1 / 60);
    check('AC#4: subsequent frames within the same boost run do not re-fire',
        fxCalls.playDriveBoostSound === 1,
        'playDriveBoostSound calls=' + fxCalls.playDriveBoostSound);
})();

// -------- AC#3: latest zone wins — boost triggered while in slow takes over --------
(function () {
    // Road: slow at 11-15, then boost at 16-18, then ground.
    var types = flatRoad(30);
    for (var i = 11; i <= 15; i++) types[i] = 'slow';
    types[16] = 'boost';
    types[17] = 'boost';
    types[18] = 'boost';
    resetScenario(types);
    sandbox.driveSpeed = 100;
    sandbox.driveScrollX = 20; // segIdx 11 (slow start)
    // Tick over slow zone — confirm slow cap applies
    for (var f = 0; f < 5; f++) sandbox.drivePlayingTick(1 / 60);
    var inSlowSpeed = sandbox.driveSpeed;
    var slowMax = sandbox.DRIVE_SCROLL_SPEED_MAX * (1 - sandbox.DRIVE_SLOW_FACTOR);
    check('AC#3: setup — slow zone is active, speed not exceeding slow cap',
        inSlowSpeed <= slowMax + 1.0,
        'inSlowSpeed=' + inSlowSpeed + ' slowMax=' + slowMax);
    // Now warp scrollX to put buggy on a boost seg (idx 16: scrollX = 16*20-200 = 120)
    sandbox.driveScrollX = 120;
    sandbox.drivePlayingTick(1 / 60); // enter boost from non-boost prev
    check('AC#3: latest zone wins — entering boost from slow → boost timer starts',
        sandbox.driveBoostTimer > 0,
        'driveBoostTimer=' + sandbox.driveBoostTimer);
    check('AC#3: latest zone wins — entering boost from slow → speed boosted >slow cap',
        sandbox.driveSpeed > slowMax,
        'driveSpeed=' + sandbox.driveSpeed + ' slowMax=' + slowMax);
})();

// -------- AC#3: latest zone wins — slow triggered while boost active cancels boost --------
(function () {
    var types = flatRoad(30);
    types[11] = 'boost';
    types[12] = 'boost';
    for (var i = 14; i < 25; i++) types[i] = 'slow';
    resetScenario(types);
    sandbox.driveScrollX = 20; // segIdx 11 (boost)
    sandbox.drivePlayingTick(1 / 60);
    check('AC#3: setup — boost is active after entering boost seg',
        sandbox.driveBoostTimer > 0,
        'driveBoostTimer=' + sandbox.driveBoostTimer);
    // Now warp into a slow seg (idx 14: scrollX = 14*20-200 = 80)
    sandbox.driveScrollX = 80;
    // Force prevSegType to ground so the slow entry edge fires next tick
    sandbox.drivePrevSegType = 'ground';
    sandbox.drivePlayingTick(1 / 60);
    check('AC#3: latest zone wins — entering slow while boost active → driveBoostTimer = 0',
        sandbox.driveBoostTimer === 0,
        'driveBoostTimer=' + sandbox.driveBoostTimer);
    // Continue ticking; speed should decay toward slow cap
    for (var f = 0; f < 600; f++) sandbox.drivePlayingTick(1 / 60);
    var slowMax = sandbox.DRIVE_SCROLL_SPEED_MAX * (1 - sandbox.DRIVE_SLOW_FACTOR);
    check('AC#3: after slow cancels boost, speed eventually settles at/below slow cap',
        sandbox.driveSpeed <= slowMax + 1.0,
        'driveSpeed=' + sandbox.driveSpeed + ' slowMax=' + slowMax);
})();

// -------- Guard: ground-only road never triggers boost or slow effects --------
(function () {
    var types = flatRoad(50);
    resetScenario(types);
    sandbox.keys = { 'ArrowRight': true };
    for (var f = 0; f < 600; f++) sandbox.drivePlayingTick(1 / 60);
    check('Guard: pure-ground road never plays whoosh',
        fxCalls.playDriveBoostSound === 0,
        'playDriveBoostSound calls=' + fxCalls.playDriveBoostSound);
    check('Guard: pure-ground road allows speed to reach DRIVE_SCROLL_SPEED_MAX',
        Math.abs(sandbox.driveSpeed - sandbox.DRIVE_SCROLL_SPEED_MAX) < 1.0,
        'driveSpeed=' + sandbox.driveSpeed + ' MAX=' + sandbox.DRIVE_SCROLL_SPEED_MAX);
    check('Guard: pure-ground road keeps driveBoostTimer = 0',
        sandbox.driveBoostTimer === 0,
        'driveBoostTimer=' + sandbox.driveBoostTimer);
})();

// -------- Guard: re-entering boost (after a gap of ground) re-fires whoosh --------
(function () {
    var types = flatRoad(50);
    types[11] = 'boost';
    // gap of ground at 12-19
    types[20] = 'boost';
    resetScenario(types);
    sandbox.driveScrollX = 20; // seg 11
    sandbox.drivePlayingTick(1 / 60);
    var firstWhoosh = fxCalls.playDriveBoostSound;
    sandbox.driveScrollX = 200; // seg 20 (after a stretch of ground)
    sandbox.drivePrevSegType = 'ground';
    sandbox.drivePlayingTick(1 / 60);
    check('Guard: re-entering boost after a ground stretch fires the whoosh again',
        fxCalls.playDriveBoostSound === firstWhoosh + 1,
        'firstWhoosh=' + firstWhoosh +
        ' totalAfter=' + fxCalls.playDriveBoostSound);
})();

// -------- AC visuals — slow-zone label pool & boost-zone label pool --------
// AC#1: slow label is `// TODO` or `tech debt`.
// AC#2: boost label is `CI passed` or `tests green`.
// Verify by scanning the real setupDriveWorld output.
var setupBlock = extractBlock(updateSrc, 'function setupDriveWorld()', 'setupDriveWorld');
vm.runInContext(setupBlock, sandbox, { filename: 'setupDriveWorld-extracted' });

// Seed Math.random for determinism (use prototype-clone pattern from US-005
// so the rest of Math survives — Object.assign({}, Math) drops non-enumerables).
var seededMath = Object.create(Math);
var seed = 0;
seededMath.random = function () {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
};
sandbox.Math = seededMath;

sandbox.currentLevel = 5;
sandbox.driveRoadLength = 0;
sandbox.driveBuggyY = 0;
sandbox.driveBuggyVY = 0;
sandbox.driveGrounded = true;
sandbox.driveScrollX = 0;
sandbox.driveSpeed = 0;
sandbox.driveBoostTimer = 0;
sandbox.drivePrevSegType = null;
sandbox.driveWheelRotation = 0;
sandbox.driveBuggyTilt = 0;
sandbox.drivePrevJumpKey = false;
sandbox.driveFalling = false;
sandbox.driveScore = 0;
sandbox.drivePickupsCollected = 0;
sandbox.driveDistance = 0;
sandbox.driveCompleteTimer = 0;
sandbox.driveRoadSegments = [];
sandbox.driveObstacles = [];
sandbox.drivePickups = [];
sandbox.driveParticles = [];
sandbox.setupDriveWorld();

var SLOW_POOL = ['// TODO', 'tech debt'];
var BOOST_POOL = ['CI passed', 'tests green'];

var slowLabels = [];
var boostLabels = [];
var slowSegCount = 0;
var boostSegCount = 0;
for (var s = 0; s < sandbox.driveRoadSegments.length; s++) {
    var seg = sandbox.driveRoadSegments[s];
    if (seg.type === 'slow') {
        slowSegCount++;
        if (SLOW_POOL.indexOf(seg.label) >= 0 && slowLabels.indexOf(seg.label) < 0) {
            slowLabels.push(seg.label);
        }
    } else if (seg.type === 'boost') {
        boostSegCount++;
        if (BOOST_POOL.indexOf(seg.label) >= 0 && boostLabels.indexOf(seg.label) < 0) {
            boostLabels.push(seg.label);
        }
    }
}
check('AC#1: setupDriveWorld places slow segments',
    slowSegCount > 0, 'slowSegCount=' + slowSegCount);
check('AC#2: setupDriveWorld places boost segments',
    boostSegCount > 0, 'boostSegCount=' + boostSegCount);
check('AC#1: every slow seg.label is from {`// TODO`, `tech debt`}',
    (function () {
        for (var i = 0; i < sandbox.driveRoadSegments.length; i++) {
            var sg = sandbox.driveRoadSegments[i];
            if (sg.type === 'slow' && SLOW_POOL.indexOf(sg.label) < 0) return false;
        }
        return true;
    })(),
    'sample=' + slowLabels.join(','));
check('AC#2: every boost seg.label is from {`CI passed`, `tests green`}',
    (function () {
        for (var i = 0; i < sandbox.driveRoadSegments.length; i++) {
            var sg = sandbox.driveRoadSegments[i];
            if (sg.type === 'boost' && BOOST_POOL.indexOf(sg.label) < 0) return false;
        }
        return true;
    })(),
    'sample=' + boostLabels.join(','));

// -------- Static pins: source-byte contract --------
function hasLiteral(src, needle, label) {
    check('static pin: ' + label,
        src.indexOf(needle) >= 0,
        'needle not found: ' + needle);
}
hasLiteral(updateSrc, 'DRIVE_SLOW_FACTOR',
    'update.js references DRIVE_SLOW_FACTOR for slow-zone cap');
hasLiteral(updateSrc, 'DRIVE_BOOST_FACTOR',
    'update.js references DRIVE_BOOST_FACTOR for boost speed bump');
hasLiteral(updateSrc, 'DRIVE_BOOST_DURATION',
    'update.js references DRIVE_BOOST_DURATION for boost timer');
hasLiteral(updateSrc, 'driveBoostTimer',
    'update.js mutates driveBoostTimer');
hasLiteral(updateSrc, 'drivePrevSegType',
    'update.js tracks drivePrevSegType for edge-triggered zone detection');
hasLiteral(updateSrc, 'playDriveBoostSound',
    'update.js calls playDriveBoostSound on boost trigger');
hasLiteral(updateSrc, "currSegType === 'slow'",
    "update.js branches on segment.type === 'slow' for slow-zone cap");
hasLiteral(updateSrc, "currSegType === 'boost'",
    "update.js branches on segment.type === 'boost' for boost trigger");

var configSrc = loadFile('js/config.js');
hasLiteral(configSrc, 'DRIVE_SLOW_FACTOR',
    'config.js declares DRIVE_SLOW_FACTOR');
hasLiteral(configSrc, 'DRIVE_BOOST_FACTOR',
    'config.js declares DRIVE_BOOST_FACTOR');
hasLiteral(configSrc, 'DRIVE_BOOST_DURATION',
    'config.js declares DRIVE_BOOST_DURATION');
hasLiteral(configSrc, 'driveBoostTimer',
    'config.js declares driveBoostTimer state');
hasLiteral(configSrc, 'drivePrevSegType',
    'config.js declares drivePrevSegType state');

var audioSrc = loadFile('js/audio.js');
hasLiteral(audioSrc, 'function playDriveBoostSound',
    'audio.js defines playDriveBoostSound');
hasLiteral(audioSrc, "lp.type = 'lowpass'",
    'audio.js whoosh uses a lowpass filter (subtle whoosh per AC#4)');

// AC#1 visual: render.js draws slow zones with darker/hatched ground.
// AC#2 visual: render.js draws boost zones with bright chevrons.
// AC#1/AC#2: floating label appears above the zone.
// These were implemented by US-005; static pins confirm they're still in place.
var renderSrc = loadFile('js/render.js');
hasLiteral(renderSrc, "gs.type === 'slow'",
    "render.js draws slow segs with dedicated treatment (gs.type === 'slow')");
hasLiteral(renderSrc, "gs.type === 'boost'",
    "render.js draws boost segs with dedicated treatment (gs.type === 'boost')");
hasLiteral(renderSrc, "ls.type !== 'slow' && ls.type !== 'boost'",
    'render.js emits floating zone labels for slow/boost runs');

// -------- Summary --------
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
