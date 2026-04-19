// US-011 (Feature Drive): Runtime integration test for destination arrival +
// DRIVE_COMPLETE. Loads js/config.js + the real DRIVE_PLAYING tick block + the
// real DRIVE_COMPLETE handler from js/update.js into a vm sandbox and verifies
// each acceptance criterion. Static pins cover the render-side contract
// (renderDriveComplete, wheel retract formula, results banner, dispatch case).
//
// Run:  node tests/integration-drive-us011.js
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

// FX-side stub counters — assert celebration + jingle fire exactly once on
// arrival, sparkles/rocks don't fire spuriously in DRIVE_COMPLETE.
var fxCalls;
function resetFxCalls() {
    fxCalls = {
        spawnCelebration: 0,
        lastSpawnCelebration: null,
        playDriveCompleteSound: 0,
        updateCelebration: 0,
        stopThrustSound: 0,
        // sparkle/rock path stubs (kept as no-ops — we don't trigger them in
        // these scenarios but the tick block references them unconditionally
        // in the grounded branch).
        spawnDriveSparkBurst: 0,
        startScreenShake: 0,
        playDriveRockHitSound: 0,
        spawnDrivePickupSparkle: 0,
        playDrivePickupSound: 0,
        playDriveBoostSound: 0,
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
    FUEL_MAX: 100,
    spawnCelebration: function (x, y) {
        fxCalls.spawnCelebration++;
        fxCalls.lastSpawnCelebration = { x: x, y: y };
    },
    updateCelebration: function (dt) { fxCalls.updateCelebration++; },
    playDriveCompleteSound: function () { fxCalls.playDriveCompleteSound++; },
    stopThrustSound: function () { fxCalls.stopThrustSound++; },
    // Other FX functions the tick body references.
    spawnDriveSparkBurst: function () { fxCalls.spawnDriveSparkBurst++; },
    startScreenShake: function () { fxCalls.startScreenShake++; },
    playDriveRockHitSound: function () { fxCalls.playDriveRockHitSound++; },
    spawnDrivePickupSparkle: function () { fxCalls.spawnDrivePickupSparkle++; },
    playDrivePickupSound: function () { fxCalls.playDrivePickupSound++; },
    playDriveBoostSound: function () { fxCalls.playDriveBoostSound++; },
    spawnExplosion: function () {},
    playExplosionSound: function () {},
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

var completeBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.DRIVE_COMPLETE) {',
    'DRIVE_COMPLETE body'
);
vm.runInContext(
    'function driveCompleteTick(dt) {\n' + completeBody + '\n}',
    sandbox,
    { filename: 'DRIVE_COMPLETE-extracted' }
);

check('drivePlayingTick extracted + evaluated',
    typeof sandbox.drivePlayingTick === 'function');
check('driveCompleteTick extracted + evaluated',
    typeof sandbox.driveCompleteTick === 'function');

// -------- Harness: flat N-segment road --------
function buildFlatRoad(n) {
    var segs = [];
    for (var i = 0; i < n; i++) {
        segs.push({ x: i * 20, y: 450, type: 'ground', label: null });
    }
    return segs;
}

function resetArrivalScenario(roadLen, startScroll, fuel) {
    resetFxCalls();
    sandbox.driveRoadSegments = buildFlatRoad(Math.ceil(roadLen / 20) + 20);
    sandbox.driveRoadLength = roadLen;
    sandbox.driveScrollX = startScroll;
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
    sandbox.driveCompleteTimer = 0;
    sandbox.driveCompleteFuelBonus = 0;
    sandbox.driveCompleteTotalBonus = 0;
    sandbox.driveObstacles = [];
    sandbox.drivePickups = [];
    sandbox.driveParticles = [];
    sandbox.landingResult = null;
    sandbox.score = 0;
    sandbox.keys = {};
    sandbox.ship = { fuel: fuel };
    sandbox.gameState = sandbox.STATES.DRIVE_PLAYING;
}

// -------- AC#1: arrival detection at driveScrollX + buggyScreenX >= driveRoadLength --------
(function () {
    // Buggy sits one frame away from the destination. buggyScreenX = 200
    // (canvas.width * 0.25 at 800px). Put scrollX so arrival fires this tick.
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.drivePlayingTick(1 / 60);
    check('AC#1: buggy at/past destination → gameState = DRIVE_COMPLETE',
        sandbox.gameState === sandbox.STATES.DRIVE_COMPLETE,
        'gameState=' + sandbox.gameState);
    check('AC#1: driveScrollX + 200 >= driveRoadLength on arrival',
        sandbox.driveScrollX + 200 >= sandbox.driveRoadLength,
        'scrollX=' + sandbox.driveScrollX + ' roadLen=' + sandbox.driveRoadLength);
    check('AC#1: driveCompleteTimer reset to 0 on arrival',
        sandbox.driveCompleteTimer === 0);
})();

// -------- AC#1: does NOT trigger before arrival --------
(function () {
    // Position the buggy so even after 10 frames of base-speed scroll it's
    // still short of the destination (scroll/frame ≈ 2px at 120 px/s).
    var roadLen = 3000;
    resetArrivalScenario(roadLen, 1000, 20);
    for (var f = 0; f < 60; f++) sandbox.drivePlayingTick(1 / 60);
    check('AC#1: before arrival → gameState stays DRIVE_PLAYING',
        sandbox.gameState === sandbox.STATES.DRIVE_PLAYING,
        'gameState=' + sandbox.gameState);
    check('AC#1: before arrival → driveScrollX + 200 < driveRoadLength',
        sandbox.driveScrollX + 200 < sandbox.driveRoadLength);
    check('AC#1: before arrival → spawnCelebration NOT called',
        fxCalls.spawnCelebration === 0);
    check('AC#1: before arrival → playDriveCompleteSound NOT called',
        fxCalls.playDriveCompleteSound === 0);
})();

// -------- AC (scoring): completion + fuel bonus added to driveScore AND score --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.score = 500; // preexisting score (pickups banked earlier)
    sandbox.driveScore = 150;
    var preScore = sandbox.score;
    var preDriveScore = sandbox.driveScore;
    var preFuel = sandbox.ship.fuel;
    sandbox.drivePlayingTick(1 / 60);
    var expectedFuelBonus = Math.floor(preFuel) * sandbox.DRIVE_POINTS_FUEL_BONUS_MULTIPLIER;
    var expectedTotalBonus = sandbox.DRIVE_POINTS_COMPLETION + expectedFuelBonus;
    check('Scoring: completion bonus (DRIVE_POINTS_COMPLETION) is 200',
        sandbox.DRIVE_POINTS_COMPLETION === 200);
    check('Scoring: fuel bonus = floor(ship.fuel) * DRIVE_POINTS_FUEL_BONUS_MULTIPLIER',
        sandbox.driveCompleteFuelBonus === expectedFuelBonus,
        'got=' + sandbox.driveCompleteFuelBonus + ' expected=' + expectedFuelBonus);
    check('Scoring: driveCompleteTotalBonus = completion + fuel',
        sandbox.driveCompleteTotalBonus === expectedTotalBonus,
        'got=' + sandbox.driveCompleteTotalBonus + ' expected=' + expectedTotalBonus);
    check('Scoring: driveScore += total bonus',
        sandbox.driveScore === preDriveScore + expectedTotalBonus,
        'driveScore=' + sandbox.driveScore);
    check('Scoring: global score += total bonus',
        sandbox.score === preScore + expectedTotalBonus,
        'score=' + sandbox.score);
})();

// -------- AC (scoring): fuel bonus respects Math.floor (partial fuel) --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 17.9);
    sandbox.drivePlayingTick(1 / 60);
    check('Scoring: fuel bonus uses floor() of ship.fuel (17.9 → 17)',
        sandbox.driveCompleteFuelBonus === 17 * sandbox.DRIVE_POINTS_FUEL_BONUS_MULTIPLIER,
        'got=' + sandbox.driveCompleteFuelBonus);
})();

// -------- AC (scoring): fuel=0 → only completion bonus, no fuel bonus --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 0);
    sandbox.drivePlayingTick(1 / 60);
    check('Scoring: fuel=0 → fuel bonus = 0',
        sandbox.driveCompleteFuelBonus === 0);
    check('Scoring: fuel=0 → total bonus = DRIVE_POINTS_COMPLETION only',
        sandbox.driveCompleteTotalBonus === sandbox.DRIVE_POINTS_COMPLETION);
})();

// -------- AC: celebration particles fire on entry --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.drivePlayingTick(1 / 60);
    check('Celebration: spawnCelebration called exactly once on arrival',
        fxCalls.spawnCelebration === 1,
        'calls=' + fxCalls.spawnCelebration);
    check('Celebration: spawnCelebration called at buggy screen position',
        fxCalls.lastSpawnCelebration &&
        Math.abs(fxCalls.lastSpawnCelebration.x - 200) < 0.01,
        'x=' + (fxCalls.lastSpawnCelebration && fxCalls.lastSpawnCelebration.x));
})();

// -------- AC: victory jingle plays on entry (and once only) --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.drivePlayingTick(1 / 60);
    check('Jingle: playDriveCompleteSound called exactly once on arrival',
        fxCalls.playDriveCompleteSound === 1,
        'calls=' + fxCalls.playDriveCompleteSound);
    // Tick DRIVE_COMPLETE many frames — jingle MUST NOT re-fire
    for (var f = 0; f < 120; f++) sandbox.driveCompleteTick(1 / 60);
    check('Jingle: does NOT re-fire during DRIVE_COMPLETE ticks',
        fxCalls.playDriveCompleteSound === 1);
})();

// -------- AC: thrust sound stopped on arrival --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.drivePlayingTick(1 / 60);
    check('FX: stopThrustSound called on arrival',
        fxCalls.stopThrustSound === 1);
})();

// -------- AC: buggy decelerates to a stop in DRIVE_COMPLETE --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_MAX; // 250
    sandbox.drivePlayingTick(1 / 60);
    check('Decel: state is DRIVE_COMPLETE after arrival tick',
        sandbox.gameState === sandbox.STATES.DRIVE_COMPLETE);
    var preSpeed = sandbox.driveSpeed;
    sandbox.driveCompleteTick(1 / 60);
    check('Decel: driveSpeed reduces frame-over-frame in DRIVE_COMPLETE',
        sandbox.driveSpeed < preSpeed,
        'before=' + preSpeed + ' after=' + sandbox.driveSpeed);
    // Run enough frames for decel to hit zero (250 / 150 ≈ 1.67 sec → 100 frames at 60fps)
    for (var f = 0; f < 300; f++) sandbox.driveCompleteTick(1 / 60);
    check('Decel: driveSpeed eventually reaches 0 in DRIVE_COMPLETE',
        sandbox.driveSpeed === 0,
        'speed=' + sandbox.driveSpeed);
    check('Decel: driveSpeed never goes negative',
        sandbox.driveSpeed >= 0);
})();

// -------- AC: scrollX continues during decel so buggy slides to rest on pad --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.driveSpeed = 250;
    sandbox.drivePlayingTick(1 / 60);
    var preScroll = sandbox.driveScrollX;
    sandbox.driveCompleteTick(1 / 60);
    check('Decel: driveScrollX advances on first DRIVE_COMPLETE tick',
        sandbox.driveScrollX > preScroll,
        'before=' + preScroll + ' after=' + sandbox.driveScrollX);
    // After full decel, scroll should be static
    for (var f = 0; f < 300; f++) sandbox.driveCompleteTick(1 / 60);
    var settledScroll = sandbox.driveScrollX;
    sandbox.driveCompleteTick(1 / 60);
    check('Decel: after speed=0, driveScrollX stops advancing',
        sandbox.driveScrollX === settledScroll,
        'settled=' + settledScroll + ' after=' + sandbox.driveScrollX);
})();

// -------- AC: driveCompleteTimer increments in DRIVE_COMPLETE --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.drivePlayingTick(1 / 60);
    check('Timer: driveCompleteTimer = 0 on entry',
        sandbox.driveCompleteTimer === 0);
    for (var f = 0; f < 60; f++) sandbox.driveCompleteTick(1 / 60);
    check('Timer: driveCompleteTimer advances by ~1 sec after 60 ticks at 60fps',
        Math.abs(sandbox.driveCompleteTimer - 1) < 0.05,
        'timer=' + sandbox.driveCompleteTimer);
})();

// -------- AC: DRIVE_COMPLETE_DELAY constant is 2.0 seconds --------
(function () {
    check('Delay: DRIVE_COMPLETE_DELAY is 2.0 seconds',
        sandbox.DRIVE_COMPLETE_DELAY === 2.0,
        'delay=' + sandbox.DRIVE_COMPLETE_DELAY);
    // Confirm the timer can reach DRIVE_COMPLETE_DELAY through DRIVE_COMPLETE ticks
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.drivePlayingTick(1 / 60);
    for (var f = 0; f < 130; f++) sandbox.driveCompleteTick(1 / 60);
    check('Delay: driveCompleteTimer reaches DRIVE_COMPLETE_DELAY after ~2s of ticks',
        sandbox.driveCompleteTimer >= sandbox.DRIVE_COMPLETE_DELAY,
        'timer=' + sandbox.driveCompleteTimer);
})();

// -------- AC: updateCelebration ticks continue in DRIVE_COMPLETE --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.drivePlayingTick(1 / 60);
    var preCelebCalls = fxCalls.updateCelebration;
    for (var f = 0; f < 30; f++) sandbox.driveCompleteTick(1 / 60);
    check('Celebration: updateCelebration is called each DRIVE_COMPLETE tick',
        fxCalls.updateCelebration - preCelebCalls === 30,
        'calls=' + (fxCalls.updateCelebration - preCelebCalls));
})();

// -------- AC: spark particles continue to tick + fade in DRIVE_COMPLETE --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.drivePlayingTick(1 / 60); // → DRIVE_COMPLETE
    // Seed a couple of spark particles as if from earlier rock hits / sparkles
    sandbox.driveParticles.push({
        x: 100, y: 100, vx: 0, vy: 0, life: 0.5, maxLife: 0.5,
        color: '#fff', size: 2
    });
    sandbox.driveParticles.push({
        x: 200, y: 100, vx: 0, vy: 0, life: 0.02, maxLife: 0.5,
        color: '#fff', size: 2
    });
    var preCount = sandbox.driveParticles.length;
    for (var f = 0; f < 60; f++) sandbox.driveCompleteTick(1 / 60);
    check('Particles: spark particles decay/splice during DRIVE_COMPLETE',
        sandbox.driveParticles.length < preCount,
        'before=' + preCount + ' after=' + sandbox.driveParticles.length);
})();

// -------- AC: arrival fires only ONCE even if scroll keeps advancing --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.drivePlayingTick(1 / 60);
    var firstCelebCalls = fxCalls.spawnCelebration;
    var firstJingleCalls = fxCalls.playDriveCompleteSound;
    // If somehow drivePlayingTick is called again (it shouldn't be; we're now
    // in DRIVE_COMPLETE), verify we stay single-fire.
    // Simulate the full DRIVE_COMPLETE window and verify no double-firing.
    for (var f = 0; f < 120; f++) sandbox.driveCompleteTick(1 / 60);
    check('Single-fire: spawnCelebration still exactly 1 after DRIVE_COMPLETE ticks',
        fxCalls.spawnCelebration === firstCelebCalls,
        'calls=' + fxCalls.spawnCelebration);
    check('Single-fire: playDriveCompleteSound still exactly 1 after DRIVE_COMPLETE ticks',
        fxCalls.playDriveCompleteSound === firstJingleCalls,
        'calls=' + fxCalls.playDriveCompleteSound);
})();

// -------- Edge: falling buggy doesn't trigger DRIVE_COMPLETE (gap at end) --------
(function () {
    var roadLen = 3000;
    resetArrivalScenario(roadLen, roadLen - 200 + 5, 20);
    sandbox.driveFalling = true;
    sandbox.driveGrounded = false;
    sandbox.driveBuggyY = 500;
    sandbox.driveBuggyVY = 100;
    sandbox.drivePlayingTick(1 / 60);
    check('Edge: falling buggy at arrival position does NOT trigger DRIVE_COMPLETE',
        sandbox.gameState !== sandbox.STATES.DRIVE_COMPLETE,
        'gameState=' + sandbox.gameState);
})();

// -------- Static pins (render contract) --------
var renderSrc = loadFile('js/render.js');
check('Pin: renderDriveComplete() defined in render.js',
    /function\s+renderDriveComplete\s*\(\s*\)\s*\{/.test(renderSrc));
check('Pin: render switch dispatches STATES.DRIVE_COMPLETE to renderDriveComplete()',
    /case\s+STATES\.DRIVE_COMPLETE:[\s\S]*?renderDriveComplete\(\)/.test(renderSrc));
check('Pin: renderDriveComplete uses reverse-deploy wheel retract formula (1 - eased)',
    /wheelRadius\s*=\s*DRIVE_WHEEL_RADIUS\s*\*\s*\(\s*1\s*-\s*eased\s*\)/.test(renderSrc));
check('Pin: renderDriveComplete uses cubic ease-out (1 - Math.pow(1 - wheelT, 3))',
    /1\s*-\s*Math\.pow\(\s*1\s*-\s*wheelT\s*,\s*3\s*\)/.test(renderSrc));
check('Pin: renderDriveComplete retract window = 0.5s (driveCompleteTimer / 0.5)',
    /driveCompleteTimer\s*\/\s*0\.5/.test(renderSrc));
check('Pin: renderDriveComplete banner text "FEATURE DEPLOYED!"',
    /FEATURE\s+DEPLOYED!/.test(renderSrc));
check('Pin: renderDriveComplete shows "Distance: 100%"',
    /Distance:\s*100%/.test(renderSrc));
check('Pin: renderDriveComplete shows pickups breakdown',
    /drivePickupsCollected/.test(renderSrc) && /Pickups:/.test(renderSrc));
check('Pin: renderDriveComplete shows fuel bonus breakdown',
    /Fuel\s+bonus/.test(renderSrc) && /driveCompleteFuelBonus/.test(renderSrc));
check('Pin: renderDriveComplete shows total bonus',
    /Total\s+bonus/.test(renderSrc) && /driveCompleteTotalBonus/.test(renderSrc));
check('Pin: renderDriveComplete calls drawCelebration()',
    /function\s+renderDriveComplete[\s\S]*?drawCelebration\(\)[\s\S]*?function/.test(renderSrc));

// -------- Static pins (audio contract) --------
var audioSrc = loadFile('js/audio.js');
check('Pin: playDriveCompleteSound() defined in audio.js',
    /function\s+playDriveCompleteSound\s*\(\s*\)\s*\{/.test(audioSrc));
check('Pin: playDriveCompleteSound uses ascending sine notes (landing chime variation)',
    /playDriveCompleteSound[\s\S]*?523\.25[\s\S]*?659\.25[\s\S]*?783\.99/.test(audioSrc));

// -------- Static pins (update contract) --------
check('Pin: arrival detection at driveScrollX + buggyScreenX >= driveRoadLength',
    /driveScrollX\s*\+\s*buggyScreenX\s*>=\s*driveRoadLength/.test(updateSrc));
check('Pin: DRIVE_COMPLETE handler block exists',
    /if\s*\(\s*gameState\s*===\s*STATES\.DRIVE_COMPLETE\s*\)\s*\{/.test(updateSrc));
check('Pin: arrival awards DRIVE_POINTS_COMPLETION + fuel bonus',
    /DRIVE_POINTS_COMPLETION\s*\+\s*driveFuelBonus/.test(updateSrc));
check('Pin: fuel bonus uses floor(ship.fuel) * DRIVE_POINTS_FUEL_BONUS_MULTIPLIER',
    /Math\.floor\(\s*ship\.fuel\s*\)\s*\*\s*DRIVE_POINTS_FUEL_BONUS_MULTIPLIER/.test(updateSrc));
check('Pin: arrival fires spawnCelebration',
    /if[\s\S]{0,200}driveRoadLength[\s\S]*?spawnCelebration\(/.test(updateSrc));
check('Pin: arrival guards playDriveCompleteSound with typeof',
    /typeof\s+playDriveCompleteSound\s*===\s*['"]function['"]/.test(updateSrc));
check('Pin: DRIVE_COMPLETE handler decelerates driveSpeed with DRIVE_BRAKE_DECEL',
    /if\s*\(\s*gameState\s*===\s*STATES\.DRIVE_COMPLETE\s*\)\s*\{[\s\S]*?driveSpeed\s*-=\s*DRIVE_BRAKE_DECEL\s*\*\s*dt/.test(updateSrc));
check('Pin: DRIVE_COMPLETE handler calls updateCelebration',
    /if\s*\(\s*gameState\s*===\s*STATES\.DRIVE_COMPLETE\s*\)\s*\{[\s\S]*?updateCelebration\(/.test(updateSrc));
check('Pin: setupDriveWorld resets driveCompleteFuelBonus + driveCompleteTotalBonus',
    /driveCompleteFuelBonus\s*=\s*0[\s\S]*?driveCompleteTotalBonus\s*=\s*0/.test(updateSrc));

// -------- Static pins (config contract) --------
var configSrc = loadFile('js/config.js');
check('Pin: DRIVE_COMPLETE_DELAY = 2.0 constant in config.js',
    /DRIVE_COMPLETE_DELAY\s*=\s*2\.0/.test(configSrc));
check('Pin: DRIVE_POINTS_COMPLETION = 200 constant in config.js',
    /DRIVE_POINTS_COMPLETION\s*=\s*200/.test(configSrc));
check('Pin: DRIVE_POINTS_FUEL_BONUS_MULTIPLIER = 3 constant in config.js',
    /DRIVE_POINTS_FUEL_BONUS_MULTIPLIER\s*=\s*3/.test(configSrc));
check('Pin: driveCompleteFuelBonus declared in config.js',
    /var\s+driveCompleteFuelBonus\s*=\s*0/.test(configSrc));
check('Pin: driveCompleteTotalBonus declared in config.js',
    /var\s+driveCompleteTotalBonus\s*=\s*0/.test(configSrc));

// -------- Summary --------
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
