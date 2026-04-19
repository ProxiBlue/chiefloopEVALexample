// US-014 (Feature Drive): Runtime integration test for sound effects.
//
// Loads js/config.js + the real DRIVE_TRANSITION and DRIVE_PLAYING tick
// blocks from js/update.js into a vm sandbox and verifies each US-014 AC
// against the actual runtime behavior. Audio functions are stubbed with
// call counters so the tests assert firing frequency without depending on
// Web Audio API. Static source-byte pins cover the audio.js function
// definitions and the AC-specific waveshape wording.
//
// Run:  node tests/integration-drive-us014.js
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

// --- FX stub counters ---
var fxCalls;
var lastEngineSpeed = null;
function resetFxCalls() {
    fxCalls = {
        startDriveEngineSound: 0,
        stopDriveEngineSound: 0,
        updateDriveEngineSound: 0,
        playDriveJumpSound: 0,
        playDriveLandingSound: 0,
        playDriveGapFallSound: 0,
        playDriveRockHitSound: 0,
        playDrivePickupSound: 0,
        playDriveBoostSound: 0,
        playDriveCompleteSound: 0,
        stopThrustSound: 0,
        playExplosionSound: 0,
        startScreenShake: 0,
        spawnExplosion: 0,
        spawnCelebration: 0,
        updateCelebration: 0,
        spawnDriveSparkBurst: 0,
        spawnDrivePickupSparkle: 0,
        spawnDriveDustPuff: 0,
    };
    lastEngineSpeed = null;
}
resetFxCalls();

var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean, Infinity: Infinity,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    SHIP_SIZE: 40,
    FUEL_MAX: 100,
    startDriveEngineSound: function () { fxCalls.startDriveEngineSound++; },
    stopDriveEngineSound: function () { fxCalls.stopDriveEngineSound++; },
    updateDriveEngineSound: function (speed) {
        fxCalls.updateDriveEngineSound++;
        lastEngineSpeed = speed;
    },
    playDriveJumpSound: function () { fxCalls.playDriveJumpSound++; },
    playDriveLandingSound: function () { fxCalls.playDriveLandingSound++; },
    playDriveGapFallSound: function () { fxCalls.playDriveGapFallSound++; },
    playDriveRockHitSound: function () { fxCalls.playDriveRockHitSound++; },
    playDrivePickupSound: function () { fxCalls.playDrivePickupSound++; },
    playDriveBoostSound: function () { fxCalls.playDriveBoostSound++; },
    playDriveCompleteSound: function () { fxCalls.playDriveCompleteSound++; },
    stopThrustSound: function () { fxCalls.stopThrustSound++; },
    playExplosionSound: function () { fxCalls.playExplosionSound++; },
    startScreenShake: function () { fxCalls.startScreenShake++; },
    spawnExplosion: function () { fxCalls.spawnExplosion++; },
    spawnCelebration: function () { fxCalls.spawnCelebration++; },
    updateCelebration: function () { fxCalls.updateCelebration++; },
    spawnDriveSparkBurst: function () { fxCalls.spawnDriveSparkBurst++; },
    spawnDrivePickupSparkle: function () { fxCalls.spawnDrivePickupSparkle++; },
    spawnDriveDustPuff: function () { fxCalls.spawnDriveDustPuff++; },
    clearDriveState: function () {},
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

var updateSrc = loadFile('js/update.js');

// Extract DRIVE_TRANSITION body and wrap as a callable tick.
var transitionBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.DRIVE_TRANSITION) {',
    'DRIVE_TRANSITION body'
);
vm.runInContext(
    'function driveTransitionTick(dt) {\n' + transitionBody + '\n}',
    sandbox,
    { filename: 'DRIVE_TRANSITION-extracted' }
);
check('driveTransitionTick extracted + evaluated',
    typeof sandbox.driveTransitionTick === 'function');

// Extract DRIVE_PLAYING body and wrap as a callable tick.
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

// -------- Harness helpers --------
function flatRoad(n) {
    var segs = [];
    for (var i = 0; i < n; i++) {
        segs.push({ x: i * 20, y: 450, type: 'ground', label: null });
    }
    return segs;
}
function withGapAt(segs, segIdx, width) {
    for (var i = 0; i < width; i++) {
        segs[segIdx + i].type = 'gap';
    }
    return segs;
}

function resetDriveState(road) {
    resetFxCalls();
    sandbox.driveRoadSegments = road;
    sandbox.driveRoadLength = road.length * 20;
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
    sandbox.driveAirborneTrail = [];
    sandbox.driveStarParallaxOffset = 0;
    sandbox.driveTransitionTimer = 0;
    sandbox.driveCompleteTimer = 0;
    sandbox.driveCompleteFuelBonus = 0;
    sandbox.driveCompleteTotalBonus = 0;
    sandbox.landingResult = null;
    sandbox.score = 0;
    sandbox.keys = {};
    sandbox.ship = { fuel: 50 };
    sandbox.gameState = sandbox.STATES.DRIVE_PLAYING;
}

// ============================================================
// AC#1: Engine hum — start/update/stop lifecycle
// ============================================================

// Entering DRIVE_PLAYING from DRIVE_TRANSITION fires startDriveEngineSound.
(function () {
    resetFxCalls();
    sandbox.gameState = sandbox.STATES.DRIVE_TRANSITION;
    sandbox.driveTransitionTimer = 0;
    // Step one tick past duration so the flip fires.
    sandbox.driveTransitionTick(sandbox.DRIVE_TRANSITION_DURATION + 0.1);
    check('AC#1: DRIVE_TRANSITION → DRIVE_PLAYING flip calls startDriveEngineSound',
        sandbox.gameState === sandbox.STATES.DRIVE_PLAYING &&
        fxCalls.startDriveEngineSound === 1,
        'gameState=' + sandbox.gameState + ' startCalls=' + fxCalls.startDriveEngineSound);
    check('AC#1: startDriveEngineSound does NOT fire before transition timer elapses',
        (function () {
            resetFxCalls();
            sandbox.gameState = sandbox.STATES.DRIVE_TRANSITION;
            sandbox.driveTransitionTimer = 0;
            sandbox.driveTransitionTick(0.5);
            return fxCalls.startDriveEngineSound === 0 &&
                   sandbox.gameState === sandbox.STATES.DRIVE_TRANSITION;
        })());
})();

// Engine pitch updates every DRIVE_PLAYING tick with current driveSpeed.
(function () {
    resetDriveState(flatRoad(400));
    sandbox.drivePlayingTick(1 / 60);
    check('AC#1: updateDriveEngineSound fires each DRIVE_PLAYING tick',
        fxCalls.updateDriveEngineSound === 1,
        'updateCalls=' + fxCalls.updateDriveEngineSound);
    check('AC#1: updateDriveEngineSound receives driveSpeed as its arg',
        typeof lastEngineSpeed === 'number' &&
        Math.abs(lastEngineSpeed - sandbox.driveSpeed) < 0.001,
        'lastEngineSpeed=' + lastEngineSpeed + ' driveSpeed=' + sandbox.driveSpeed);
})();

// Engine pitch changes track speed changes (accelerate → higher arg, brake
// → lower arg). Proves pitch varies with speed (AC#1 "Pitch varies with speed").
(function () {
    resetDriveState(flatRoad(400));
    sandbox.keys['ArrowRight'] = true;
    for (var f = 0; f < 30; f++) sandbox.drivePlayingTick(1 / 60);
    var acceleratedSpeed = lastEngineSpeed;
    sandbox.keys['ArrowRight'] = false;
    sandbox.keys['ArrowLeft'] = true;
    for (var f2 = 0; f2 < 60; f2++) sandbox.drivePlayingTick(1 / 60);
    var brakedSpeed = lastEngineSpeed;
    check('AC#1: pitch/speed argument rises while accelerating',
        acceleratedSpeed > sandbox.DRIVE_SCROLL_SPEED_BASE,
        'acceleratedSpeed=' + acceleratedSpeed +
        ' base=' + sandbox.DRIVE_SCROLL_SPEED_BASE);
    check('AC#1: pitch/speed argument falls when braking',
        brakedSpeed < acceleratedSpeed,
        'brakedSpeed=' + brakedSpeed + ' accel=' + acceleratedSpeed);
})();

// Engine stops on arrival.
(function () {
    resetDriveState(flatRoad(50));
    sandbox.driveScrollX = sandbox.driveRoadLength - sandbox.canvas.width * 0.25 - 1;
    // One tick should cross arrival threshold.
    sandbox.drivePlayingTick(1 / 60);
    check('AC#1: arrival fires stopDriveEngineSound',
        fxCalls.stopDriveEngineSound === 1 &&
        sandbox.gameState === sandbox.STATES.DRIVE_COMPLETE,
        'stopCalls=' + fxCalls.stopDriveEngineSound +
        ' gameState=' + sandbox.gameState);
})();

// Engine stops on gap-fall crash.
(function () {
    resetDriveState(withGapAt(flatRoad(50), 11, 5));
    sandbox.driveScrollX = 0;
    sandbox.driveSpeed = 200;
    // Simulate until the buggy falls off the canvas bottom.
    for (var f = 0; f < 180 && sandbox.gameState === sandbox.STATES.DRIVE_PLAYING; f++) {
        sandbox.drivePlayingTick(1 / 60);
    }
    check('AC#1: gap-fall crash fires stopDriveEngineSound',
        fxCalls.stopDriveEngineSound === 1 &&
        sandbox.gameState === sandbox.STATES.CRASHED,
        'stopCalls=' + fxCalls.stopDriveEngineSound +
        ' gameState=' + sandbox.gameState);
    check('AC#1: gap-fall crash also fires the legacy stopThrustSound pipeline',
        fxCalls.stopThrustSound === 1,
        'stopThrustCalls=' + fxCalls.stopThrustSound);
})();

// ============================================================
// AC#2: Jump whoosh
// ============================================================

(function () {
    resetDriveState(flatRoad(400));
    sandbox.ship.fuel = 50;
    sandbox.keys[' '] = true;
    sandbox.drivePlayingTick(1 / 60);
    check('AC#2: jump fires playDriveJumpSound exactly once on edge',
        fxCalls.playDriveJumpSound === 1,
        'jumpCalls=' + fxCalls.playDriveJumpSound);
    // Holding the key must NOT re-fire the jump sound (edge-triggered).
    for (var f = 0; f < 10; f++) sandbox.drivePlayingTick(1 / 60);
    check('AC#2: jump sound does not re-fire while key is held (edge-triggered)',
        fxCalls.playDriveJumpSound === 1,
        'jumpCalls=' + fxCalls.playDriveJumpSound);
})();

// Jump at fuel=0 must NOT play the sound (same guard as the jump itself).
(function () {
    resetDriveState(flatRoad(400));
    sandbox.ship.fuel = 0;
    sandbox.keys[' '] = true;
    sandbox.drivePlayingTick(1 / 60);
    check('AC#2: no jump sound when fuel is 0 (jump is gated)',
        fxCalls.playDriveJumpSound === 0,
        'jumpCalls=' + fxCalls.playDriveJumpSound);
})();

// ============================================================
// AC#3: Landing thud
// ============================================================

(function () {
    resetDriveState(flatRoad(400));
    sandbox.ship.fuel = 50;
    // Do a jump and wait for the buggy to come back down.
    sandbox.keys[' '] = true;
    sandbox.drivePlayingTick(1 / 60);
    sandbox.keys[' '] = false;
    for (var f = 0; f < 200 && !sandbox.driveGrounded; f++) {
        sandbox.drivePlayingTick(1 / 60);
    }
    check('AC#3: buggy re-grounds after jump',
        sandbox.driveGrounded === true,
        'driveGrounded=' + sandbox.driveGrounded);
    check('AC#3: landing fires playDriveLandingSound exactly once',
        fxCalls.playDriveLandingSound === 1,
        'landingCalls=' + fxCalls.playDriveLandingSound);
    // Continuing to drive grounded must NOT re-fire landing sound.
    for (var f2 = 0; f2 < 20; f2++) sandbox.drivePlayingTick(1 / 60);
    check('AC#3: landing sound does not repeat while grounded',
        fxCalls.playDriveLandingSound === 1,
        'landingCalls=' + fxCalls.playDriveLandingSound);
})();

// Steady-state grounded driving (no jump) must NOT fire landing sound.
(function () {
    resetDriveState(flatRoad(400));
    for (var f = 0; f < 60; f++) sandbox.drivePlayingTick(1 / 60);
    check('AC#3: no landing sound during steady ground driving',
        fxCalls.playDriveLandingSound === 0,
        'landingCalls=' + fxCalls.playDriveLandingSound);
})();

// ============================================================
// AC#7: Gap-fall descending tone (sounds section orders AC#7 before arrival)
// ============================================================

(function () {
    resetDriveState(withGapAt(flatRoad(50), 11, 5));
    // Position the buggy on the first gap segment so commit fires this tick.
    sandbox.driveScrollX = 20; // segIdx = floor((20+200)/20) = 11
    sandbox.drivePlayingTick(1 / 60);
    check('AC#7: gap-fall commit fires playDriveGapFallSound exactly once',
        fxCalls.playDriveGapFallSound === 1 && sandbox.driveFalling === true,
        'gapFallCalls=' + fxCalls.playDriveGapFallSound +
        ' driveFalling=' + sandbox.driveFalling);
    // Subsequent falling frames must not re-fire the gap-fall sound (per frame
    // retrigger would glitch per AC#9 "No glitches during rapid events").
    for (var f = 0; f < 60 && sandbox.driveFalling; f++) {
        sandbox.drivePlayingTick(1 / 60);
    }
    check('AC#7: gap-fall sound does not repeat across subsequent falling frames',
        fxCalls.playDriveGapFallSound === 1,
        'gapFallCalls=' + fxCalls.playDriveGapFallSound);
})();

// Non-gap driving must NEVER fire the descending tone.
(function () {
    resetDriveState(flatRoad(400));
    sandbox.ship.fuel = 100;
    for (var f = 0; f < 200; f++) {
        if (f % 30 === 0) sandbox.keys[' '] = true;
        else sandbox.keys[' '] = false;
        sandbox.drivePlayingTick(1 / 60);
    }
    check('AC#7: gap-fall sound never fires during normal driving + jumps',
        fxCalls.playDriveGapFallSound === 0,
        'gapFallCalls=' + fxCalls.playDriveGapFallSound);
})();

// ============================================================
// AC#4-6, AC#8: existing sounds still integrated (regression guards)
// ============================================================

// AC#4: Rock hit — grounded buggy runs into rock → playDriveRockHitSound.
(function () {
    resetDriveState(flatRoad(400));
    sandbox.driveObstacles = [{
        type: 'rock',
        x: 200 + 20, y: 450, size: 15,
        label: 'NullPointer'
    }];
    sandbox.drivePlayingTick(1 / 60);
    check('AC#4: rock collision still fires playDriveRockHitSound (from US-008)',
        fxCalls.playDriveRockHitSound === 1,
        'rockCalls=' + fxCalls.playDriveRockHitSound);
})();

// AC#5: Pickup collection — overlap → playDrivePickupSound.
(function () {
    resetDriveState(flatRoad(400));
    sandbox.drivePickups = [{
        x: 200 + 20, y: 450, size: 20,
        label: 'LGTM',
        collected: false
    }];
    sandbox.drivePlayingTick(1 / 60);
    check('AC#5: pickup collection still fires playDrivePickupSound (from US-009)',
        fxCalls.playDrivePickupSound === 1,
        'pickupCalls=' + fxCalls.playDrivePickupSound);
})();

// AC#6: Speed boost whoosh — enter boost segment → playDriveBoostSound.
(function () {
    var road = flatRoad(400);
    for (var i = 11; i < 16; i++) {
        road[i].type = 'boost';
        road[i].label = 'CI passed';
    }
    resetDriveState(road);
    sandbox.driveScrollX = 20; // segIdx 11 (first boost seg)
    sandbox.drivePlayingTick(1 / 60);
    check('AC#6: entering boost segment fires playDriveBoostSound',
        fxCalls.playDriveBoostSound === 1,
        'boostCalls=' + fxCalls.playDriveBoostSound);
})();

// AC#8: Arrival victory jingle — playDriveCompleteSound.
(function () {
    resetDriveState(flatRoad(50));
    sandbox.driveScrollX = sandbox.driveRoadLength - sandbox.canvas.width * 0.25 - 1;
    sandbox.drivePlayingTick(1 / 60);
    check('AC#8: arrival fires playDriveCompleteSound (from US-011)',
        fxCalls.playDriveCompleteSound === 1 &&
        sandbox.gameState === sandbox.STATES.DRIVE_COMPLETE,
        'completeCalls=' + fxCalls.playDriveCompleteSound +
        ' gameState=' + sandbox.gameState);
})();

// ============================================================
// AC#9: "No glitches during rapid events" — rapid-fire audio calls don't
// throw or destabilize the tick pipeline. Sustain a busy scenario with
// many stimuli and ensure we complete without error and the state machine
// stays coherent.
// ============================================================

(function () {
    var road = flatRoad(400);
    // Scatter rocks + pickups + boost bands so many FX events fire.
    for (var i = 12; i < 150; i += 3) {
        road[i].type = (i % 9 === 0) ? 'boost' : road[i].type;
        if (i % 9 === 0) road[i].label = 'CI passed';
    }
    resetDriveState(road);
    sandbox.driveObstacles = [];
    sandbox.drivePickups = [];
    for (var r = 0; r < 20; r++) {
        sandbox.driveObstacles.push({
            type: 'rock',
            x: 300 + r * 80, y: 450, size: 15,
            label: 'bug'
        });
    }
    for (var p = 0; p < 20; p++) {
        sandbox.drivePickups.push({
            x: 340 + p * 80, y: 450, size: 20,
            label: 'LGTM',
            collected: false
        });
    }
    sandbox.ship.fuel = 1000;
    sandbox.keys['ArrowRight'] = true;
    var ok = true;
    try {
        for (var f = 0; f < 400; f++) {
            if (f % 10 === 0) sandbox.keys[' '] = true; else sandbox.keys[' '] = false;
            sandbox.drivePlayingTick(1 / 60);
            if (sandbox.gameState !== sandbox.STATES.DRIVE_PLAYING &&
                sandbox.gameState !== sandbox.STATES.DRIVE_COMPLETE) break;
        }
    } catch (e) { ok = false; }
    check('AC#9: 400-frame busy-scenario completes without throwing',
        ok === true);
    check('AC#9: many audio events fired in total (rocks+boost+jumps+engine)',
        fxCalls.updateDriveEngineSound > 10 &&
        (fxCalls.playDriveBoostSound + fxCalls.playDriveRockHitSound +
         fxCalls.playDrivePickupSound + fxCalls.playDriveJumpSound) > 5,
        'updates=' + fxCalls.updateDriveEngineSound +
        ' sum=' + (fxCalls.playDriveBoostSound + fxCalls.playDriveRockHitSound +
                    fxCalls.playDrivePickupSound + fxCalls.playDriveJumpSound));
})();

// ============================================================
// Static source-byte pins — audio.js contract
// ============================================================

function hasLiteral(src, needle, label) {
    check('static pin: ' + label,
        src.indexOf(needle) >= 0,
        'needle not found: ' + needle);
}

var audioSrc = loadFile('js/audio.js');

// AC#1 wording: "reuse/adapt thrust sound at lower volume and higher pitch"
hasLiteral(audioSrc, 'function startDriveEngineSound',
    'audio.js defines startDriveEngineSound');
hasLiteral(audioSrc, 'function stopDriveEngineSound',
    'audio.js defines stopDriveEngineSound');
hasLiteral(audioSrc, 'function updateDriveEngineSound',
    'audio.js defines updateDriveEngineSound for pitch-by-speed variation');
hasLiteral(audioSrc, 'createBrownNoiseBuffer',
    'engine hum reuses the thrust rumble technique (brown noise)');

// AC#2: "Jump: Short upward whoosh (rising oscillator, 0.15s)"
hasLiteral(audioSrc, 'function playDriveJumpSound',
    'audio.js defines playDriveJumpSound');
check('static pin: jump sound uses a rising oscillator frequency sweep',
    /playDriveJumpSound[\s\S]*?osc\.frequency\.setValueAtTime\(300[\s\S]*?exponentialRampToValueAtTime\(800/
        .test(audioSrc),
    'jump frequency sweep 300→800 not found in playDriveJumpSound');
check('static pin: jump sound duration is 0.15s (AC#2)',
    /function playDriveJumpSound[\s\S]*?var dur = 0\.15/.test(audioSrc),
    'dur = 0.15 not found in playDriveJumpSound');

// AC#3: "Landing: Soft thud when buggy lands after a jump (low noise burst, 0.1s)"
hasLiteral(audioSrc, 'function playDriveLandingSound',
    'audio.js defines playDriveLandingSound');
check('static pin: landing sound uses a low-pass-filtered noise burst',
    /function playDriveLandingSound[\s\S]*?createNoiseBuffer[\s\S]*?lp\.type = 'lowpass'/
        .test(audioSrc),
    'lowpass noise burst not found in playDriveLandingSound');
check('static pin: landing sound duration is 0.1s (AC#3)',
    /function playDriveLandingSound[\s\S]*?var dur = 0\.1/.test(audioSrc),
    'dur = 0.1 not found in playDriveLandingSound');

// AC#4: "Rock hit: Metallic clang (short noise burst with bandpass filter at ~800Hz)"
//   (already covered by US-008; regression pin)
hasLiteral(audioSrc, 'function playDriveRockHitSound',
    'audio.js defines playDriveRockHitSound (US-008)');

// AC#5: "Pickup collection: Pleasant chime (ascending two-note)"
//   (already covered by US-009; regression pin)
hasLiteral(audioSrc, 'function playDrivePickupSound',
    'audio.js defines playDrivePickupSound (US-009)');

// AC#6: "Speed boost: Quick whoosh (frequency sweep 300→600Hz, 0.2s)"
hasLiteral(audioSrc, 'function playDriveBoostSound',
    'audio.js defines playDriveBoostSound');
check('static pin: boost sound frequency sweep is 300→600Hz per AC#6',
    /playDriveBoostSound[\s\S]*?setValueAtTime\(300[\s\S]*?exponentialRampToValueAtTime\(600/
        .test(audioSrc),
    'boost frequency sweep 300→600 not found');
check('static pin: boost sound duration is 0.2s per AC#6',
    /function playDriveBoostSound[\s\S]*?var dur = 0\.2/.test(audioSrc),
    'boost dur = 0.2 not found');

// AC#7: "Gap fall: Descending tone as buggy falls (frequency sweep downward)"
hasLiteral(audioSrc, 'function playDriveGapFallSound',
    'audio.js defines playDriveGapFallSound');
check('static pin: gap-fall frequency sweep is DOWNWARD (start > end)',
    /playDriveGapFallSound[\s\S]*?setValueAtTime\(600[\s\S]*?exponentialRampToValueAtTime\(60/
        .test(audioSrc),
    'downward sweep 600→60 not found in playDriveGapFallSound');

// AC#8: "Arrival: Victory jingle (reuse/adapt landing chime)"
hasLiteral(audioSrc, 'function playDriveCompleteSound',
    'audio.js defines playDriveCompleteSound (US-011, arrival jingle)');

// ============================================================
// Static source-byte pins — update.js wire-up contract
// ============================================================

hasLiteral(updateSrc, 'startDriveEngineSound()',
    'update.js calls startDriveEngineSound (engine hum start)');
hasLiteral(updateSrc, 'stopDriveEngineSound()',
    'update.js calls stopDriveEngineSound (engine hum stop)');
hasLiteral(updateSrc, 'updateDriveEngineSound(driveSpeed)',
    'update.js calls updateDriveEngineSound(driveSpeed) each tick');
hasLiteral(updateSrc, 'playDriveJumpSound()',
    'update.js calls playDriveJumpSound on jump edge trigger');
hasLiteral(updateSrc, 'playDriveLandingSound()',
    'update.js calls playDriveLandingSound on airborne→grounded transition');
hasLiteral(updateSrc, 'playDriveGapFallSound()',
    'update.js calls playDriveGapFallSound on gap commit');

// -------- Summary --------
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
