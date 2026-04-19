// US-016 (Feature Drive PRD): No-regression smoke test.
//
// Purpose: Verify that all previously-shipped flows still work after the
// full Feature Drive PRD (US-001 … US-015) has landed. This is NOT a
// property test — it is a single harness that exercises each major flow
// end-to-end inside a vm sandbox against the real source of js/config.js
// and the real DRIVE_TRANSITION / DRIVE_PLAYING / DRIVE_COMPLETE /
// DRIVE_RETURN blocks from js/update.js. It also replays the real
// SCENE_SCROLL end-branch for pad-type routing and checks leaderboard +
// new-game state reset via the leaderboard.js + input.js sources.
//
// Acceptance Criteria coverage (US-016):
//   AC#1  feature  → Feature Drive (wheel anim, driving, arrival OR crash).
//   AC#2  security → invader/missile alternation still works.
//   AC#3  bugfix   → Bug Bombing Run still works.
//   AC#4  other    → Tech Debt Blaster still works.
//   AC#5  Crash during Feature Drive (gap) → STATES.CRASHED.
//   AC#6  Arrival  → DRIVE_COMPLETE bonus, DRIVE_RETURN → STATES.PLAYING.
//   AC#7  Score accumulates across pickups + completion across levels.
//   AC#8  Game over + restart: CRASHED + Space → GAMEOVER, startNewGame resets.
//   AC#9  High-score leaderboard works (isHighScore + addToLeaderboard).
//   AC#10 Fuel consumption on jump (−5) + pickup restores (+3 fuel, points).
//   AC#11 Rock collision deducts fuel (−10) but DOES NOT crash the buggy.
//
// Run:  node tests/smoke-drive-us016.js
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
    if (start < 0) throw new Error(label + ': marker not found: ' + marker);
    var open = src.indexOf('{', start + marker.length - 1);
    var depth = 0;
    for (var i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(open + 1, i);
        }
    }
    throw new Error(label + ': no matching close brace');
}

function extractFunctionSource(src, fnName) {
    var marker = 'function ' + fnName + '(';
    var idx = src.indexOf(marker);
    if (idx < 0) throw new Error('function not found: ' + fnName);
    var open = src.indexOf('{', idx);
    var depth = 0;
    for (var i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(idx, i + 1);
        }
    }
    throw new Error('no close brace for ' + fnName);
}

// ----------------------------------------------------------------------
// Sandbox: load config.js + stubs for all FX functions called by the
// DRIVE_* tick blocks. All audio/FX calls are either typeof-guarded or
// stubbed here; counters track calls for assertions where needed.
// ----------------------------------------------------------------------

var fxCalls;
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
        startThrustSound: 0,
        playExplosionSound: 0,
        playClickSound: 0,
        startScreenShake: 0,
        spawnExplosion: 0,
        spawnCelebration: 0,
        updateCelebration: 0,
        spawnDriveSparkBurst: 0,
        spawnDrivePickupSparkle: 0,
        spawnDriveDustPuff: 0,
        resetShip: 0,
        resetWind: 0,
        generateTerrain: 0,
        requestGameSession: 0,
    };
}
resetFxCalls();

// localStorage shim for leaderboard.js
var fakeStorage = {};
var localStorageShim = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(fakeStorage, k) ? fakeStorage[k] : null; },
    setItem: function (k, v) { fakeStorage[k] = String(v); },
    removeItem: function (k) { delete fakeStorage[k]; },
    clear: function () { fakeStorage = {}; },
};

var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array, JSON: JSON,
    Number: Number, String: String, Boolean: Boolean, Infinity: Infinity,
    canvas: { width: 800, height: 600 },
    ctx: { fillStyle: '', font: '', textAlign: '', fillText: function () {} },
    window: { addEventListener: function () {} },
    localStorage: localStorageShim,
    SHIP_SIZE: 40,
    FUEL_MAX: 100,
    // FX/audio stubs
    startDriveEngineSound: function () { fxCalls.startDriveEngineSound++; },
    stopDriveEngineSound: function () { fxCalls.stopDriveEngineSound++; },
    updateDriveEngineSound: function () { fxCalls.updateDriveEngineSound++; },
    playDriveJumpSound: function () { fxCalls.playDriveJumpSound++; },
    playDriveLandingSound: function () { fxCalls.playDriveLandingSound++; },
    playDriveGapFallSound: function () { fxCalls.playDriveGapFallSound++; },
    playDriveRockHitSound: function () { fxCalls.playDriveRockHitSound++; },
    playDrivePickupSound: function () { fxCalls.playDrivePickupSound++; },
    playDriveBoostSound: function () { fxCalls.playDriveBoostSound++; },
    playDriveCompleteSound: function () { fxCalls.playDriveCompleteSound++; },
    stopThrustSound: function () { fxCalls.stopThrustSound++; },
    startThrustSound: function () { fxCalls.startThrustSound++; },
    playExplosionSound: function () { fxCalls.playExplosionSound++; },
    playClickSound: function () { fxCalls.playClickSound++; },
    startScreenShake: function () { fxCalls.startScreenShake++; },
    spawnExplosion: function () { fxCalls.spawnExplosion++; },
    spawnCelebration: function () { fxCalls.spawnCelebration++; },
    updateCelebration: function () { fxCalls.updateCelebration++; },
    spawnDriveSparkBurst: function () { fxCalls.spawnDriveSparkBurst++; },
    spawnDrivePickupSparkle: function () { fxCalls.spawnDrivePickupSparkle++; },
    spawnDriveDustPuff: function () { fxCalls.spawnDriveDustPuff++; },
    // Level/ship/terrain stubs used by SCENE_SCROLL end branch + DRIVE_RETURN
    resetShip: function () {
        fxCalls.resetShip++;
        sandbox.ship = {
            x: sandbox.canvas.width / 2,
            y: sandbox.canvas.height / 2,
            vx: 0, vy: 0, angle: 0,
            thrusting: false, retroThrusting: false,
            rotating: null,
            fuel: sandbox.FUEL_MAX,
            invaderVX: 0, invaderVY: 0,
        };
    },
    resetWind: function () { fxCalls.resetWind++; },
    generateTerrain: function () { fxCalls.generateTerrain++; },
    getLevelConfig: function () { return { gravity: 0.05 }; },
    requestGameSession: function () { fxCalls.requestGameSession++; },
    // Setup stubs — SCENE_SCROLL end branch calls these when routing into the
    // corresponding mini-game. We stub them so routing-only assertions don't
    // depend on the real world-setup logic.
    setupMissileWorld: function () {},
    setupTechdebtWorld: function () {},
    setupBreakoutWorld: function () {},
    setupDriveWorld: function () {},
    spawnBugWave: function () {},
    // Leaderboard/online stubs
    submitOnlineScore: function () {},
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Load config.js first (defines STATES + all DRIVE_* constants).
vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

// config.js also defines `resetWind` and `getLevelConfig` — they overwrite
// my stubs when config.js loads. Re-install them with counters AFTER config
// so DRIVE_RETURN / startNewGame call-counting works (per Codebase Pattern:
// "Sandbox stubs for functions defined in js/config.js must be installed
// AFTER vm.runInContext(loadFile('js/config.js')) runs").
sandbox.resetWind = function () { fxCalls.resetWind++; };
sandbox.getLevelConfig = function () { return { gravity: 0.05 }; };

// Sanity: all four DRIVE_* states are present (proves US-001 still landed).
check('US-001 regression: STATES.DRIVE_TRANSITION defined',
    sandbox.STATES && sandbox.STATES.DRIVE_TRANSITION === 'drive_transition');
check('US-001 regression: STATES.DRIVE_PLAYING defined',
    sandbox.STATES && sandbox.STATES.DRIVE_PLAYING === 'drive_playing');
check('US-001 regression: STATES.DRIVE_COMPLETE defined',
    sandbox.STATES && sandbox.STATES.DRIVE_COMPLETE === 'drive_complete');
check('US-001 regression: STATES.DRIVE_RETURN defined',
    sandbox.STATES && sandbox.STATES.DRIVE_RETURN === 'drive_return');

// US-002 regression: core config constants still present with expected values
// (spot-check — the ones this test relies on for other assertions).
check('US-002 regression: DRIVE_JUMP_FUEL_COST === 5',
    sandbox.DRIVE_JUMP_FUEL_COST === 5);
check('US-002 regression: DRIVE_ROCK_FUEL_COST === 10',
    sandbox.DRIVE_ROCK_FUEL_COST === 10);
check('US-002 regression: DRIVE_PICKUP_POINTS === 50',
    sandbox.DRIVE_PICKUP_POINTS === 50);
check('US-002 regression: DRIVE_PICKUP_FUEL_RESTORE === 3',
    sandbox.DRIVE_PICKUP_FUEL_RESTORE === 3);
check('US-002 regression: DRIVE_POINTS_COMPLETION === 200',
    sandbox.DRIVE_POINTS_COMPLETION === 200);
check('US-002 regression: DRIVE_POINTS_FUEL_BONUS_MULTIPLIER === 3',
    sandbox.DRIVE_POINTS_FUEL_BONUS_MULTIPLIER === 3);

// ----------------------------------------------------------------------
// Extract real code blocks from js/update.js
// ----------------------------------------------------------------------

var updateSrc = loadFile('js/update.js');

// SCENE_SCROLL end branch (pad-type routing).
var scrollSig = 'if (gameState === STATES.SCENE_SCROLL && sceneScrollState) {';
var scrollStart = updateSrc.indexOf(scrollSig);
var sOpen = updateSrc.indexOf('{', scrollStart + scrollSig.length - 1);
var depth = 0, sClose = -1;
for (var j = sOpen; j < updateSrc.length; j++) {
    if (updateSrc[j] === '{') depth++;
    else if (updateSrc[j] === '}') {
        depth--;
        if (depth === 0) { sClose = j; break; }
    }
}
var scrollBlock = updateSrc.slice(scrollStart, sClose + 1);
var scrollReplay = new vm.Script('(function () {\n' + scrollBlock + '\n}).call(this);',
    { filename: 'SCENE_SCROLL-extracted' });

// DRIVE_TRANSITION tick body.
var transitionBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.DRIVE_TRANSITION) {',
    'DRIVE_TRANSITION body'
);
vm.runInContext(
    'function driveTransitionTick(dt) {\n' + transitionBody + '\n}',
    sandbox, { filename: 'DRIVE_TRANSITION-extracted' });

// DRIVE_PLAYING tick body.
var playingBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.DRIVE_PLAYING) {',
    'DRIVE_PLAYING body'
);
vm.runInContext(
    'function drivePlayingTick(dt) {\n' + playingBody + '\n}',
    sandbox, { filename: 'DRIVE_PLAYING-extracted' });

// DRIVE_COMPLETE tick body.
var completeBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.DRIVE_COMPLETE) {',
    'DRIVE_COMPLETE body'
);
vm.runInContext(
    'function driveCompleteTick(dt) {\n' + completeBody + '\n}',
    sandbox, { filename: 'DRIVE_COMPLETE-extracted' });

// DRIVE_RETURN tick body.
var returnBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.DRIVE_RETURN) {',
    'DRIVE_RETURN body'
);
// Need a wrapped currentLevel, GRAVITY, THRUST_POWER — they are expected
// to be mutable globals in the sandbox.
vm.runInContext(
    'function driveReturnTick() {\n' + returnBody + '\n}',
    sandbox, { filename: 'DRIVE_RETURN-extracted' });

// clearDriveState helper from update.js
vm.runInContext(extractFunctionSource(updateSrc, 'clearDriveState'),
    sandbox, { filename: 'clearDriveState-extracted' });

// Load leaderboard.js into sandbox for AC#9.
vm.runInContext(loadFile('js/leaderboard.js'), sandbox, { filename: 'js/leaderboard.js' });

// Load input.js's startNewGame for AC#8. We only need the function body; the
// rest of input.js wires DOM listeners we can't sandbox without overhead.
vm.runInContext(extractFunctionSource(loadFile('js/input.js'), 'startNewGame'),
    sandbox, { filename: 'startNewGame-extracted' });

// Minimal globals that SCENE_SCROLL and startNewGame touch.
sandbox.unplacedPRs = [];
sandbox.levelDateRange = '';
sandbox.levelCommits = [];
sandbox.repoFallbackNotice = '';
sandbox.landings = 0;
sandbox.securityPadScroll = false;
sandbox.bugfixPadScroll = false;
sandbox.missilePadScroll = false;
sandbox.securityMiniGameCount = 0;
sandbox.otherMiniGameCount = 0;
sandbox.currentLevel = 0;
sandbox.GRAVITY = 0.05;
sandbox.THRUST_POWER = 0.125;
sandbox.score = 0;

// ----------------------------------------------------------------------
// Scenario helpers
// ----------------------------------------------------------------------

function flatRoad(n) {
    var segs = [];
    for (var i = 0; i < n; i++) {
        segs.push({ x: i * 20, y: 450, type: 'ground', label: null });
    }
    return segs;
}
function withGapAt(segs, segIdx, width) {
    for (var i = 0; i < width; i++) {
        if (segs[segIdx + i]) segs[segIdx + i].type = 'gap';
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
    sandbox.ship = { x: 400, y: 300, vx: 0, vy: 0, angle: 0, fuel: 50,
        thrusting: false, retroThrusting: false, rotating: null,
        invaderVX: 0, invaderVY: 0 };
    sandbox.gameState = sandbox.STATES.DRIVE_PLAYING;
}

function runScrollEnd(opts) {
    sandbox.gameState = sandbox.STATES.SCENE_SCROLL;
    sandbox.terrain = [{ x: 0, y: 500 }, { x: 800, y: 500 }];
    sandbox.landingPads = [];
    sandbox.sceneScrollState = sandbox.createSceneScrollState(
        [{ x: 0, y: 500 }, { x: 800, y: 500 }],
        [],
        [{ x: 0, y: 522 }, { x: 800, y: 522 }],
        [],
        !!opts.isInvaderScroll,
        !!opts.isBugfixScroll,
        !!opts.isMissileScroll,
        400
    );
    sandbox.ship = {
        x: 400, y: 300, vx: 0, vy: 0, angle: 0,
        thrusting: false, retroThrusting: false, rotating: null,
        fuel: 50, invaderVX: 0, invaderVY: 0,
    };
    sandbox.dt = sandbox.SCENE_SCROLL_DURATION + 0.1;
    sandbox.invaderScrollRotateTimer = 999;
    sandbox.bugfixTransitionTimer = 999;
    sandbox.missileTransitionTimer = 999;
    sandbox.techdebtTransitionTimer = 999;
    sandbox.breakoutTransitionTimer = 999;
    sandbox.driveTransitionTimer = 999;
    sandbox.otherMiniGameCount = opts.otherMiniGameCount != null ? opts.otherMiniGameCount : 0;
    sandbox.landedPRType = opts.landedPRType || '';
    sandbox.landingPadIndex = -1;
    sandbox.sceneDescentStartY = 0;
    sandbox.sceneDescentTargetY = 0;
    sandbox.sceneDescentTimer = 0;
    scrollReplay.runInContext(sandbox);
}

// ======================================================================
// AC#1: Land on a feature pad → Feature Drive triggers
//       (wheel anim transition, driving, arrival or crash).
// ======================================================================

runScrollEnd({ landedPRType: 'feature' });
check('AC#1: feature pad routes to STATES.DRIVE_TRANSITION',
    sandbox.gameState === sandbox.STATES.DRIVE_TRANSITION);
check('AC#1: feature pad resets driveTransitionTimer to 0',
    sandbox.driveTransitionTimer === 0);
check('AC#1: feature pad centers ship (x=400, y=300)',
    sandbox.ship.x === 400 && sandbox.ship.y === 300);
check('AC#1: feature pad refills ship fuel to FUEL_MAX',
    sandbox.ship.fuel === sandbox.FUEL_MAX);

// DRIVE_TRANSITION ticks the timer and flips to DRIVE_PLAYING.
resetFxCalls();
sandbox.gameState = sandbox.STATES.DRIVE_TRANSITION;
sandbox.driveTransitionTimer = 0;
sandbox.driveTransitionTick(sandbox.DRIVE_TRANSITION_DURATION + 0.01);
check('AC#1: DRIVE_TRANSITION advances to DRIVE_PLAYING after duration',
    sandbox.gameState === sandbox.STATES.DRIVE_PLAYING);
check('AC#1: DRIVE_TRANSITION → DRIVE_PLAYING flip starts engine sound (wheel/driving begins)',
    fxCalls.startDriveEngineSound === 1);

// DRIVE_PLAYING advances scrollX when speed > 0 (driving mechanic alive).
resetDriveState(flatRoad(400));
var scrollBefore = sandbox.driveScrollX;
sandbox.drivePlayingTick(1 / 60);
check('AC#1: DRIVE_PLAYING tick advances driveScrollX (auto-scroll works)',
    sandbox.driveScrollX > scrollBefore);

// ======================================================================
// AC#2: Land on a security pad → Invader/Missile alternation.
// ======================================================================

runScrollEnd({ isInvaderScroll: true, landedPRType: 'security' });
check('AC#2: security pad (invader leg) routes to STATES.INVADER_SCROLL_ROTATE',
    sandbox.gameState === sandbox.STATES.INVADER_SCROLL_ROTATE);

runScrollEnd({ isMissileScroll: true, landedPRType: 'security' });
check('AC#2: security pad (missile leg) routes to STATES.MISSILE_TRANSITION',
    sandbox.gameState === sandbox.STATES.MISSILE_TRANSITION);

// ======================================================================
// AC#3: Land on a bugfix pad → Bug Bombing Run.
// ======================================================================

runScrollEnd({ isBugfixScroll: true, landedPRType: 'bugfix' });
check('AC#3: bugfix pad routes to STATES.BUGFIX_TRANSITION',
    sandbox.gameState === sandbox.STATES.BUGFIX_TRANSITION);

// ======================================================================
// AC#4: Land on an 'other' pad → Tech Debt Blaster (or normal descent).
// ======================================================================

// Other-pad routing in update.js guards a mini-game entry on
// Math.random() < 0.5 (falls through to SCENE_DESCENT otherwise). Seed a
// deterministic Math so this test is not flaky — forces into the mini-game
// branch, then flips otherMiniGameCount to route into TECHDEBT_TRANSITION.
// Per Codebase Pattern: use `Object.create(Math)` + override `random` so
// the other Math methods remain (non-enumerable) available.
var realMath = sandbox.Math;
var seededMath = Object.create(realMath);
seededMath.random = function () { return 0.1; }; // < 0.5 → enter mini-game
sandbox.Math = seededMath;
// First landing (count 0 → 1, odd) routes to TECHDEBT_TRANSITION.
runScrollEnd({ landedPRType: 'other', otherMiniGameCount: 0 });
check('AC#4: other pad (count=0, odd landing) → STATES.TECHDEBT_TRANSITION',
    sandbox.gameState === sandbox.STATES.TECHDEBT_TRANSITION);

// Force fallthrough to SCENE_DESCENT via Math.random returning >= 0.5.
seededMath.random = function () { return 0.9; };
runScrollEnd({ landedPRType: 'other', otherMiniGameCount: 0 });
check('AC#4: other pad (Math.random >= 0.5) → STATES.SCENE_DESCENT (normal descent)',
    sandbox.gameState === sandbox.STATES.SCENE_DESCENT);
sandbox.Math = realMath;

// Fallthrough path: landing on a pad with no known pr-type routes to SCENE_DESCENT.
runScrollEnd({ landedPRType: '' });
check('AC#4: normal pad (no flags / no known prType) → STATES.SCENE_DESCENT (fallback)',
    sandbox.gameState === sandbox.STATES.SCENE_DESCENT);

// ======================================================================
// AC#5: Crashing during Feature Drive (fall into a gap) → STATES.CRASHED.
// (US-007 / US-012 flow; engine sound stops, crash FX fire, clearDriveState
// wipes per-round state so the CRASHED screen renders clean.)
// ======================================================================

(function () {
    resetDriveState(withGapAt(flatRoad(50), 11, 5));
    sandbox.driveScrollX = 20;
    sandbox.driveSpeed = 200;
    for (var f = 0; f < 200 && sandbox.gameState === sandbox.STATES.DRIVE_PLAYING; f++) {
        sandbox.drivePlayingTick(1 / 60);
    }
    check('AC#5: falling into a gap transitions to STATES.CRASHED',
        sandbox.gameState === sandbox.STATES.CRASHED);
    check('AC#5: landingResult describes the gap-fall',
        sandbox.landingResult === 'Fell into a gap');
    check('AC#5: gap-fall fires explosion + screen shake',
        fxCalls.spawnExplosion === 1 && fxCalls.startScreenShake >= 1);
    check('AC#5: gap-fall stops engine hum (AC#1 stop pipeline)',
        fxCalls.stopDriveEngineSound === 1 && fxCalls.stopThrustSound === 1);
    check('AC#5: gap-fall sound plays descending tone once',
        fxCalls.playDriveGapFallSound === 1);
    check('AC#5: clearDriveState wiped drive arrays (CRASHED screen renders clean)',
        sandbox.driveRoadSegments.length === 0 &&
        sandbox.driveObstacles.length === 0 &&
        sandbox.drivePickups.length === 0);
})();

// ======================================================================
// AC#6: Reaching the destination pad awards correct score bonus, then
// DRIVE_COMPLETE → DRIVE_RETURN → STATES.PLAYING (normal lander gameplay
// resumes with level advanced).
// ======================================================================

(function () {
    resetDriveState(flatRoad(50));
    // Position the buggy's world-X just short of driveRoadLength so one
    // tick crosses arrival.
    var buggyScreenX = sandbox.canvas.width * 0.25; // 200
    sandbox.driveScrollX = sandbox.driveRoadLength - buggyScreenX - 1;
    sandbox.ship.fuel = 40; // known fuel for bonus math
    sandbox.score = 0;
    sandbox.drivePlayingTick(1 / 60);
    check('AC#6: arrival transitions to STATES.DRIVE_COMPLETE',
        sandbox.gameState === sandbox.STATES.DRIVE_COMPLETE);
    var expectedFuelBonus = 40 * sandbox.DRIVE_POINTS_FUEL_BONUS_MULTIPLIER; // 120
    var expectedTotalBonus = sandbox.DRIVE_POINTS_COMPLETION + expectedFuelBonus; // 200 + 120 = 320
    check('AC#6: arrival awards completion + fuel bonus to driveScore',
        sandbox.driveScore === expectedTotalBonus,
        'driveScore=' + sandbox.driveScore + ' expected=' + expectedTotalBonus);
    check('AC#6: arrival awards same bonus to global score',
        sandbox.score === expectedTotalBonus,
        'score=' + sandbox.score + ' expected=' + expectedTotalBonus);
    check('AC#6: DRIVE_COMPLETE snapshot stores fuel bonus (stable for render)',
        sandbox.driveCompleteFuelBonus === expectedFuelBonus);
    check('AC#6: DRIVE_COMPLETE snapshot stores total bonus',
        sandbox.driveCompleteTotalBonus === expectedTotalBonus);
    check('AC#6: arrival plays completion jingle',
        fxCalls.playDriveCompleteSound === 1);
    check('AC#6: arrival spawns celebration FX',
        fxCalls.spawnCelebration === 1);

    // DRIVE_COMPLETE holds for DRIVE_COMPLETE_DELAY, then advances to DRIVE_RETURN.
    sandbox.driveCompleteTick(sandbox.DRIVE_COMPLETE_DELAY + 0.01);
    check('AC#6: DRIVE_COMPLETE advances to STATES.DRIVE_RETURN after delay',
        sandbox.gameState === sandbox.STATES.DRIVE_RETURN);

    // DRIVE_RETURN: clearDriveState + level++ + resetShip + resetWind +
    // generateTerrain + gameState = STATES.PLAYING.
    resetFxCalls();
    sandbox.currentLevel = 2;
    sandbox.driveReturnTick();
    check('AC#6: DRIVE_RETURN advances to STATES.PLAYING (back to normal gameplay)',
        sandbox.gameState === sandbox.STATES.PLAYING);
    check('AC#6: DRIVE_RETURN increments currentLevel',
        sandbox.currentLevel === 3);
    check('AC#6: DRIVE_RETURN resets ship (resetShip was called)',
        fxCalls.resetShip === 1);
    check('AC#6: DRIVE_RETURN resets wind (resetWind was called)',
        fxCalls.resetWind === 1);
    check('AC#6: DRIVE_RETURN generates new terrain',
        fxCalls.generateTerrain === 1);
    check('AC#6: DRIVE_RETURN clears drive arrays via clearDriveState',
        sandbox.driveRoadSegments.length === 0 &&
        sandbox.drivePickups.length === 0 &&
        sandbox.driveObstacles.length === 0 &&
        sandbox.driveScore === 0);
})();

// ======================================================================
// AC#7: Score accumulates across pickups + completions (and, by proxy,
// across mini-game types — `score` is shared global state that every
// mini-game's reward code adds to, never resets). Verify pickups and
// completion bonus stack into the same global `score` without a reset
// between them inside one drive.
// ======================================================================

(function () {
    resetDriveState(flatRoad(50));
    sandbox.score = 1000; // pretend prior mini-games + landings added 1000
    sandbox.ship.fuel = 30;

    // Stage a pickup directly in front of the buggy at world-X ≈ 220.
    sandbox.drivePickups = [{
        x: 220, y: 450, size: 20,
        label: 'LGTM',
        collected: false,
    }];
    sandbox.drivePlayingTick(1 / 60);
    check('AC#7: picking up awards points to global score (adds DRIVE_PICKUP_POINTS)',
        sandbox.score === 1000 + sandbox.DRIVE_PICKUP_POINTS,
        'score=' + sandbox.score);
    check('AC#7: picking up increments drivePickupsCollected',
        sandbox.drivePickupsCollected === 1);

    // Now send buggy to destination and accumulate completion bonus on top.
    var buggyScreenX = sandbox.canvas.width * 0.25;
    sandbox.driveScrollX = sandbox.driveRoadLength - buggyScreenX - 1;
    var scoreBeforeArrival = sandbox.score;
    var fuelBeforeArrival = sandbox.ship.fuel;
    sandbox.drivePlayingTick(1 / 60);
    var expectedBonus = sandbox.DRIVE_POINTS_COMPLETION +
        Math.floor(fuelBeforeArrival) * sandbox.DRIVE_POINTS_FUEL_BONUS_MULTIPLIER;
    check('AC#7: arrival bonus stacks on top of prior score + pickup',
        sandbox.score === scoreBeforeArrival + expectedBonus,
        'score=' + sandbox.score + ' expected=' + (scoreBeforeArrival + expectedBonus));
    check('AC#7: score never decreased during the drive (cross-mini-game persistence)',
        sandbox.score > 1000);
})();

// ======================================================================
// AC#8: Game over + restart. The CRASHED → GAMEOVER hop lives in
// input.js's handleKeyPress (Space); we test startNewGame resetting
// all the game-wide counters to initial values (level=0, score=0,
// landings=0, mini-game counters=0, gameState=PLAYING).
// ======================================================================

(function () {
    // Simulate a stressed state: several levels played, score accrued,
    // mini-game counters non-zero.
    sandbox.currentLevel = 7;
    sandbox.score = 4200;
    sandbox.landings = 15;
    sandbox.securityMiniGameCount = 3;
    sandbox.otherMiniGameCount = 2;
    sandbox.gameState = sandbox.STATES.GAMEOVER;

    resetFxCalls();
    sandbox.startNewGame();

    check('AC#8: startNewGame resets currentLevel to 0',
        sandbox.currentLevel === 0);
    check('AC#8: startNewGame resets score to 0',
        sandbox.score === 0);
    check('AC#8: startNewGame resets landings to 0',
        sandbox.landings === 0);
    check('AC#8: startNewGame resets securityMiniGameCount to 0',
        sandbox.securityMiniGameCount === 0);
    check('AC#8: startNewGame resets otherMiniGameCount to 0',
        sandbox.otherMiniGameCount === 0);
    check('AC#8: startNewGame transitions to STATES.PLAYING',
        sandbox.gameState === sandbox.STATES.PLAYING);
    check('AC#8: startNewGame calls resetShip',
        fxCalls.resetShip === 1);
    check('AC#8: startNewGame calls resetWind',
        fxCalls.resetWind === 1);
    check('AC#8: startNewGame calls generateTerrain',
        fxCalls.generateTerrain === 1);

    // Static pin: input.js contains the CRASHED → GAMEOVER transition on Space.
    var inputSrc = loadFile('js/input.js');
    check('AC#8: input.js wires CRASHED + Space → GAMEOVER',
        /gameState\s*===\s*STATES\.CRASHED\s*&&\s*explosionFinished[\s\S]*?gameState\s*=\s*STATES\.GAMEOVER/
            .test(inputSrc));
    check('AC#8: input.js wires GAMEOVER (no name entry) + Space → startNewGame',
        /gameState\s*===\s*STATES\.GAMEOVER\s*&&\s*!gameOverEnteringName[\s\S]*?startNewGame\s*\(\s*\)/
            .test(inputSrc));
})();

// ======================================================================
// AC#9: High-score leaderboard works (persist, sort, cap at 10).
// ======================================================================

(function () {
    localStorageShim.clear();

    // Empty board → any positive score is a high score.
    check('AC#9: isHighScore on empty board (any positive score qualifies)',
        sandbox.isHighScore(1));
    check('AC#9: isHighScore rejects 0 (score must be > 0)',
        !sandbox.isHighScore(0));

    // Add entries; board sorts descending and caps at LEADERBOARD_MAX.
    for (var i = 1; i <= 12; i++) {
        sandbox.addToLeaderboard('P' + i, i * 100, i, i);
    }
    var board = sandbox.getLeaderboard();
    check('AC#9: leaderboard caps at LEADERBOARD_MAX (10) entries',
        board.length === 10);
    check('AC#9: leaderboard sorted by score descending',
        board[0].score === 1200 && board[9].score === 300);
    check('AC#9: low score (below board minimum) does NOT qualify as high score',
        !sandbox.isHighScore(200));
    check('AC#9: score above board minimum DOES qualify as high score',
        sandbox.isHighScore(350));
    check('AC#9: leaderboard persists metadata (level + landings)',
        board[0].level === 12 && board[0].landings === 12);
})();

// ======================================================================
// AC#10: Fuel consumption during jumps accurate (−5). Pickups restore
// fuel (+3) and are capped at FUEL_MAX.
// ======================================================================

(function () {
    resetDriveState(flatRoad(400));
    sandbox.ship.fuel = 50;
    var fuelBefore = sandbox.ship.fuel;
    sandbox.keys[' '] = true;
    sandbox.drivePlayingTick(1 / 60);
    check('AC#10: one jump deducts exactly DRIVE_JUMP_FUEL_COST (5) fuel',
        sandbox.ship.fuel === fuelBefore - sandbox.DRIVE_JUMP_FUEL_COST,
        'fuel=' + sandbox.ship.fuel + ' before=' + fuelBefore);
    // Holding the key must NOT re-deduct (edge-triggered jump).
    sandbox.drivePlayingTick(1 / 60);
    sandbox.drivePlayingTick(1 / 60);
    check('AC#10: holding jump does NOT re-deduct fuel (edge-triggered)',
        sandbox.ship.fuel === fuelBefore - sandbox.DRIVE_JUMP_FUEL_COST);
})();

(function () {
    resetDriveState(flatRoad(400));
    sandbox.ship.fuel = 20;
    sandbox.drivePickups = [{
        x: 220, y: 450, size: 20, label: 'LGTM', collected: false,
    }];
    sandbox.drivePlayingTick(1 / 60);
    check('AC#10: pickup adds DRIVE_PICKUP_FUEL_RESTORE (3) fuel',
        sandbox.ship.fuel === 20 + sandbox.DRIVE_PICKUP_FUEL_RESTORE);
})();

(function () {
    // US-005: hard cap is FUEL_MAX + FUEL_EXTENSION_MAX across all fuel-modifying code.
    resetDriveState(flatRoad(400));
    sandbox.ship.fuel = sandbox.FUEL_MAX + sandbox.FUEL_EXTENSION_MAX - 1;
    sandbox.drivePickups = [{
        x: 220, y: 450, size: 20, label: 'LGTM', collected: false,
    }];
    sandbox.drivePlayingTick(1 / 60);
    check('AC#10: pickup restoration caps fuel at FUEL_MAX + FUEL_EXTENSION_MAX',
        sandbox.ship.fuel === sandbox.FUEL_MAX + sandbox.FUEL_EXTENSION_MAX);
})();

(function () {
    // At fuel 0, jump is gated (no fuel deduction, no jump sound).
    resetDriveState(flatRoad(400));
    sandbox.ship.fuel = 0;
    sandbox.keys[' '] = true;
    sandbox.drivePlayingTick(1 / 60);
    check('AC#10: jump gated at fuel 0 (fuel remains 0, no underflow)',
        sandbox.ship.fuel === 0);
    check('AC#10: jump gated at fuel 0 (no jump sound fires)',
        fxCalls.playDriveJumpSound === 0);
    check('AC#10: jump gated at fuel 0 (buggy stays grounded)',
        sandbox.driveGrounded === true);
})();

// ======================================================================
// AC#11: Rock collisions deduct fuel (−10) but DO NOT crash the buggy.
// ======================================================================

(function () {
    resetDriveState(flatRoad(400));
    sandbox.ship.fuel = 50;
    sandbox.driveObstacles = [{
        type: 'rock',
        x: 220, y: 450, size: 15,
        label: 'NullPointer',
    }];
    sandbox.drivePlayingTick(1 / 60);
    check('AC#11: rock hit deducts exactly DRIVE_ROCK_FUEL_COST (10) fuel',
        sandbox.ship.fuel === 50 - sandbox.DRIVE_ROCK_FUEL_COST);
    check('AC#11: rock hit removes the rock from obstacles',
        sandbox.driveObstacles.length === 0);
    check('AC#11: rock hit does NOT transition to CRASHED',
        sandbox.gameState === sandbox.STATES.DRIVE_PLAYING);
    check('AC#11: rock hit fires rock-hit sound',
        fxCalls.playDriveRockHitSound === 1);
    check('AC#11: rock hit fires spark burst + screen shake',
        fxCalls.spawnDriveSparkBurst === 1 && fxCalls.startScreenShake === 1);

    // Continuing after a rock hit keeps the buggy alive and drivable.
    for (var f = 0; f < 20; f++) sandbox.drivePlayingTick(1 / 60);
    check('AC#11: buggy keeps driving after a rock hit (still in DRIVE_PLAYING)',
        sandbox.gameState === sandbox.STATES.DRIVE_PLAYING);
})();

// Fuel clamp at 0 when rock hit would take it negative — still no crash.
(function () {
    resetDriveState(flatRoad(400));
    sandbox.ship.fuel = 3;
    sandbox.driveObstacles = [{
        type: 'rock',
        x: 220, y: 450, size: 15,
        label: 'NullPointer',
    }];
    sandbox.drivePlayingTick(1 / 60);
    check('AC#11: rock hit at low fuel clamps to 0 (no negative fuel)',
        sandbox.ship.fuel === 0);
    check('AC#11: fuel=0 from rock hit STILL does not crash the buggy',
        sandbox.gameState === sandbox.STATES.DRIVE_PLAYING);
})();

// ======================================================================
// Summary
// ======================================================================

console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
