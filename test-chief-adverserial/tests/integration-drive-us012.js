// US-012 (Feature Drive): Runtime integration test for DRIVE_COMPLETE →
// DRIVE_RETURN → next level. Loads js/config.js + the real DRIVE_PLAYING tick
// block + the real DRIVE_COMPLETE handler + the real DRIVE_RETURN handler +
// the real clearDriveState() helper from js/update.js into a vm sandbox and
// verifies each acceptance criterion.
//
// ACs covered:
//   AC#1: After DRIVE_COMPLETE_DELAY, transition to DRIVE_RETURN.
//   AC#2: DRIVE_RETURN calls resetShip(), generateTerrain(), currentLevel++,
//         clears all drive arrays/state, transitions to STATES.PLAYING.
//   AC#3: Ship returns to normal flight (no wheels) with full fuel on the
//         new level.
//   AC#4: Loss path (fell into gap) uses the existing CRASHED flow — all
//         drive state cleared.
//
// Run:  node tests/integration-drive-us012.js
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

function extractBlock(src, fnSig, label) {
    var start = src.indexOf(fnSig);
    if (start < 0) {
        check(label + ' present', false, fnSig + ' not found');
        process.exit(1);
    }
    var open = src.indexOf('{', start);
    var depth = 0;
    for (var i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    check(label + ' matching brace', false, 'no close brace for ' + fnSig);
    process.exit(1);
}

// Call-count stubs. DRIVE_RETURN calls resetShip() / resetWind() /
// generateTerrain() / getLevelConfig(); we verify each is invoked exactly
// once during the transition and record state so AC#2/AC#3 can assert.
var fxCalls;
function resetFxCalls() {
    fxCalls = {
        resetShip: 0,
        resetWind: 0,
        generateTerrain: 0,
        getLevelConfig: 0,
        lastGetLevelConfigLevel: null,
        spawnCelebration: 0,
        updateCelebration: 0,
        playDriveCompleteSound: 0,
        stopThrustSound: 0,
        spawnExplosion: 0,
        startScreenShake: 0,
        playExplosionSound: 0,
        spawnDriveSparkBurst: 0,
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
    // Normal-flight helpers invoked by DRIVE_RETURN.
    resetShip: function () {
        fxCalls.resetShip++;
        // Reproduce the essential bits of resetShip() for AC#3: full fuel,
        // centered + upright, zero velocity/angle.
        sandbox.ship = {
            x: sandbox.canvas.width / 2,
            y: 80,
            vx: 0,
            vy: 0,
            angle: 0,
            fuel: sandbox.FUEL_MAX,
            thrusting: false,
            rotating: null,
            rotationSpeed: 2.5,
        };
    },
    resetWind: function () { fxCalls.resetWind++; },
    generateTerrain: function () { fxCalls.generateTerrain++; },
    getLevelConfig: function (level) {
        fxCalls.getLevelConfig++;
        fxCalls.lastGetLevelConfigLevel = level;
        return { gravity: 1.6 };
    },
    // Feature-Drive FX stubs (unchanged from prior US-011 test shape).
    spawnCelebration: function () { fxCalls.spawnCelebration++; },
    updateCelebration: function () { fxCalls.updateCelebration++; },
    playDriveCompleteSound: function () { fxCalls.playDriveCompleteSound++; },
    stopThrustSound: function () { fxCalls.stopThrustSound++; },
    // Gap-fall / crash FX — needed for AC#4.
    spawnExplosion: function () { fxCalls.spawnExplosion++; },
    startScreenShake: function () { fxCalls.startScreenShake++; },
    playExplosionSound: function () { fxCalls.playExplosionSound++; },
    // Rock/pickup/boost FX (referenced inside grounded/airborne branches).
    spawnDriveSparkBurst: function () { fxCalls.spawnDriveSparkBurst++; },
    spawnDriveDustPuff: function () {},
    playDriveRockHitSound: function () { fxCalls.playDriveRockHitSound++; },
    spawnDrivePickupSparkle: function () { fxCalls.spawnDrivePickupSparkle++; },
    playDrivePickupSound: function () { fxCalls.playDrivePickupSound++; },
    playDriveBoostSound: function () { fxCalls.playDriveBoostSound++; },
    // Initial level-global state read by DRIVE_RETURN.
    PIXELS_PER_METER: 50,
    GRAVITY: 1.6,
    THRUST_POWER: 4.0,
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

// config.js defines getLevelConfig() and resetWind() — our stubs from the
// sandbox initializer got shadowed. Re-install the counting stubs now that
// config.js has finished loading so AC#2 can observe the call counts.
sandbox.getLevelConfig = function (level) {
    fxCalls.getLevelConfig++;
    fxCalls.lastGetLevelConfigLevel = level;
    return { gravity: 1.6 };
};
sandbox.resetWind = function () { fxCalls.resetWind++; };

var updateSrc = loadFile('js/update.js');

// Extract and evaluate clearDriveState() into the sandbox.
var clearDriveStateSrc = extractBlock(
    updateSrc,
    'function clearDriveState()',
    'clearDriveState'
);
vm.runInContext(clearDriveStateSrc, sandbox, { filename: 'clearDriveState-extracted' });

check('clearDriveState extracted + evaluated',
    typeof sandbox.clearDriveState === 'function');

// DRIVE_PLAYING tick body → function drivePlayingTick(dt).
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

// DRIVE_COMPLETE handler body → function driveCompleteTick(dt).
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

// DRIVE_RETURN handler body → function driveReturnTick().
var returnBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.DRIVE_RETURN) {',
    'DRIVE_RETURN body'
);
vm.runInContext(
    'function driveReturnTick() {\n' + returnBody + '\n}',
    sandbox,
    { filename: 'DRIVE_RETURN-extracted' }
);

check('drivePlayingTick extracted + evaluated',
    typeof sandbox.drivePlayingTick === 'function');
check('driveCompleteTick extracted + evaluated',
    typeof sandbox.driveCompleteTick === 'function');
check('driveReturnTick extracted + evaluated',
    typeof sandbox.driveReturnTick === 'function');

// -------- Harness --------
function buildFlatRoad(n) {
    var segs = [];
    for (var i = 0; i < n; i++) {
        segs.push({ x: i * 20, y: 450, type: 'ground', label: null });
    }
    return segs;
}

function primeCompleteState(fuel, extraScore, extraDriveScore) {
    // Build a dead-round drive state: buggy at pad, arrival already fired,
    // arrays populated so we can assert they get cleared.
    resetFxCalls();
    var roadLen = 3000;
    sandbox.driveRoadSegments = buildFlatRoad(Math.ceil(roadLen / 20) + 20);
    sandbox.driveRoadLength = roadLen;
    sandbox.driveScrollX = roadLen - 200 + 5;
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
    sandbox.driveScore = extraDriveScore || 0;
    sandbox.drivePickupsCollected = 0;
    sandbox.driveCompleteTimer = 0;
    sandbox.driveCompleteFuelBonus = 0;
    sandbox.driveCompleteTotalBonus = 0;
    // Populate obstacles/pickups/particles so we can assert clearDriveState
    // wipes them on the RETURN transition.
    sandbox.driveObstacles = [
        { x: 400, y: 450, type: 'rock', size: 15, label: 'legacy code' },
    ];
    sandbox.drivePickups = [
        { x: 800, y: 420, size: 14, label: 'CI green' },
    ];
    sandbox.driveParticles = [
        { x: 10, y: 20, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, color: '#fff' },
    ];
    sandbox.landingResult = null;
    sandbox.score = extraScore || 0;
    sandbox.keys = {};
    sandbox.ship = { fuel: fuel };
    sandbox.currentLevel = 3;
    sandbox.gameState = sandbox.STATES.DRIVE_PLAYING;
    // Trigger the arrival branch (flips to DRIVE_COMPLETE + banks bonuses).
    sandbox.drivePlayingTick(1 / 60);
}

// -------- AC#1: DRIVE_COMPLETE → DRIVE_RETURN after DRIVE_COMPLETE_DELAY --------
(function () {
    primeCompleteState(20, 0, 0);
    check('AC#1 precondition: arrival flipped to DRIVE_COMPLETE',
        sandbox.gameState === sandbox.STATES.DRIVE_COMPLETE,
        'gameState=' + sandbox.gameState);
    check('AC#1 precondition: driveCompleteTimer starts at 0',
        sandbox.driveCompleteTimer === 0);

    var dt = 1 / 60;
    var ticks = 0;
    var maxTicks = 500;
    while (sandbox.gameState === sandbox.STATES.DRIVE_COMPLETE && ticks < maxTicks) {
        sandbox.driveCompleteTick(dt);
        ticks++;
    }
    check('AC#1: DRIVE_COMPLETE advances to DRIVE_RETURN once driveCompleteTimer >= DRIVE_COMPLETE_DELAY',
        sandbox.gameState === sandbox.STATES.DRIVE_RETURN,
        'gameState=' + sandbox.gameState + ' timer=' + sandbox.driveCompleteTimer);
    check('AC#1: transition occurred at/after DRIVE_COMPLETE_DELAY seconds',
        sandbox.driveCompleteTimer >= sandbox.DRIVE_COMPLETE_DELAY,
        'timer=' + sandbox.driveCompleteTimer + ' delay=' + sandbox.DRIVE_COMPLETE_DELAY);
    check('AC#1: DRIVE_COMPLETE_DELAY is 2.0 seconds',
        sandbox.DRIVE_COMPLETE_DELAY === 2.0);
    var expectedTicks = Math.ceil(sandbox.DRIVE_COMPLETE_DELAY / dt);
    check('AC#1: transition fires around expected tick count (≈120 at 60fps)',
        Math.abs(ticks - expectedTicks) <= 2,
        'ticks=' + ticks + ' expected=' + expectedTicks);

    // AC#1 negative: before the delay elapses, state stays DRIVE_COMPLETE.
    primeCompleteState(20, 0, 0);
    for (var f = 0; f < 30; f++) sandbox.driveCompleteTick(dt); // 0.5s < 2.0s
    check('AC#1: before DRIVE_COMPLETE_DELAY elapsed → state stays DRIVE_COMPLETE',
        sandbox.gameState === sandbox.STATES.DRIVE_COMPLETE,
        'gameState=' + sandbox.gameState);
})();

// -------- AC#2 + AC#3: DRIVE_RETURN clears state, advances level, resets ship --------
(function () {
    primeCompleteState(17, 250, 100);
    // Tick DRIVE_COMPLETE until DRIVE_RETURN entry.
    var dt = 1 / 60;
    while (sandbox.gameState === sandbox.STATES.DRIVE_COMPLETE) {
        sandbox.driveCompleteTick(dt);
    }
    check('AC#2 precondition: entered DRIVE_RETURN',
        sandbox.gameState === sandbox.STATES.DRIVE_RETURN);

    // Snapshot level + state before DRIVE_RETURN runs.
    var preLevel = sandbox.currentLevel;
    var preResetShipCalls = fxCalls.resetShip;
    var preGenerateTerrainCalls = fxCalls.generateTerrain;
    // Drive arrays should NOT yet be cleared (DRIVE_COMPLETE doesn't clear them).
    check('AC#2 precondition: drive arrays populated before DRIVE_RETURN',
        sandbox.driveRoadSegments.length > 0);

    sandbox.driveReturnTick();

    // AC#2: currentLevel++.
    check('AC#2: currentLevel incremented by 1',
        sandbox.currentLevel === preLevel + 1,
        'pre=' + preLevel + ' post=' + sandbox.currentLevel);
    // AC#2: resetShip() called.
    check('AC#2: resetShip() called exactly once',
        fxCalls.resetShip === preResetShipCalls + 1,
        'calls=' + fxCalls.resetShip);
    // AC#2: generateTerrain() called.
    check('AC#2: generateTerrain() called exactly once',
        fxCalls.generateTerrain === preGenerateTerrainCalls + 1,
        'calls=' + fxCalls.generateTerrain);
    // AC#2: all drive arrays cleared.
    check('AC#2: driveRoadSegments cleared',
        sandbox.driveRoadSegments.length === 0);
    check('AC#2: driveObstacles cleared',
        sandbox.driveObstacles.length === 0);
    check('AC#2: drivePickups cleared',
        sandbox.drivePickups.length === 0);
    check('AC#2: driveParticles cleared',
        sandbox.driveParticles.length === 0);
    // AC#2: all drive state primitives reset to initial values.
    check('AC#2: driveScrollX reset to 0',
        sandbox.driveScrollX === 0);
    check('AC#2: driveSpeed reset to 0',
        sandbox.driveSpeed === 0);
    check('AC#2: driveBuggyY reset to 0',
        sandbox.driveBuggyY === 0);
    check('AC#2: driveBuggyVY reset to 0',
        sandbox.driveBuggyVY === 0);
    check('AC#2: driveGrounded reset to true',
        sandbox.driveGrounded === true);
    check('AC#2: driveFalling reset to false',
        sandbox.driveFalling === false);
    check('AC#2: driveBoostTimer reset to 0',
        sandbox.driveBoostTimer === 0);
    check('AC#2: drivePrevSegType reset to null',
        sandbox.drivePrevSegType === null);
    check('AC#2: drivePrevJumpKey reset to false',
        sandbox.drivePrevJumpKey === false);
    check('AC#2: driveScore reset to 0',
        sandbox.driveScore === 0);
    check('AC#2: drivePickupsCollected reset to 0',
        sandbox.drivePickupsCollected === 0);
    check('AC#2: driveRoadLength reset to 0',
        sandbox.driveRoadLength === 0);
    check('AC#2: driveCompleteTimer reset to 0',
        sandbox.driveCompleteTimer === 0);
    check('AC#2: driveCompleteFuelBonus reset to 0',
        sandbox.driveCompleteFuelBonus === 0);
    check('AC#2: driveCompleteTotalBonus reset to 0',
        sandbox.driveCompleteTotalBonus === 0);
    // AC#2: flipped to STATES.PLAYING.
    check('AC#2: gameState flipped to PLAYING',
        sandbox.gameState === sandbox.STATES.PLAYING,
        'gameState=' + sandbox.gameState);

    // AC#3: ship returned to normal flight with full fuel.
    check('AC#3: ship.fuel restored to FUEL_MAX after resetShip()',
        sandbox.ship.fuel === sandbox.FUEL_MAX,
        'fuel=' + sandbox.ship.fuel);
    check('AC#3: ship.angle upright (0) after resetShip()',
        sandbox.ship.angle === 0);
    check('AC#3: ship.vx zeroed after resetShip()',
        sandbox.ship.vx === 0);
    check('AC#3: ship.vy zeroed after resetShip()',
        sandbox.ship.vy === 0);
    // "No wheels" — the wheels are a render-time concept tied to DRIVE_PLAYING /
    // DRIVE_COMPLETE. Once gameState is PLAYING, the render switch never calls
    // renderDrive*, so wheels are not drawn. Verify gameState guards this.
    check('AC#3: gameState === PLAYING (render switch selects normal lander, no wheels)',
        sandbox.gameState === sandbox.STATES.PLAYING);
    // Extra: driveWheelRotation is reset for the next round too.
    check('AC#3: driveWheelRotation reset (stale wheel state cannot persist)',
        sandbox.driveWheelRotation === 0);

    // Level-scaling plumbing mirrors other RETURN states.
    check('AC#2: getLevelConfig called with new currentLevel',
        fxCalls.getLevelConfig >= 1 &&
        fxCalls.lastGetLevelConfigLevel === sandbox.currentLevel,
        'lastLevel=' + fxCalls.lastGetLevelConfigLevel);
    check('AC#2: resetWind() called (mirrors other RETURN states)',
        fxCalls.resetWind === 1);
})();

// -------- AC#4: Loss path (gap fall) uses CRASHED flow + clears drive state --------
(function () {
    resetFxCalls();
    // Flat road with a gap at segment 20 (x=400).
    var segs = buildFlatRoad(200);
    segs[20].type = 'gap';
    segs[20].y = 450;

    sandbox.driveRoadSegments = segs;
    sandbox.driveRoadLength = 4000;
    sandbox.driveScrollX = 400 - 200;   // buggy screen-X 200 places its world-X at segment 20
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
    sandbox.driveScore = 75;
    sandbox.drivePickupsCollected = 2;
    sandbox.driveCompleteTimer = 0;
    sandbox.driveCompleteFuelBonus = 0;
    sandbox.driveCompleteTotalBonus = 0;
    sandbox.driveObstacles = [
        { x: 1000, y: 450, type: 'rock', size: 15, label: 'legacy' },
    ];
    sandbox.drivePickups = [
        { x: 1500, y: 420, size: 14, label: 'green tests' },
    ];
    sandbox.driveParticles = [
        { x: 10, y: 20, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, color: '#fff' },
    ];
    sandbox.landingResult = null;
    sandbox.score = 500;
    sandbox.keys = {};
    sandbox.ship = { fuel: 25 };
    sandbox.currentLevel = 2;
    sandbox.gameState = sandbox.STATES.DRIVE_PLAYING;

    // Tick until driveFalling commits + buggy drops past canvas.height.
    var dt = 1 / 60;
    var safety = 600;
    while (
        sandbox.gameState === sandbox.STATES.DRIVE_PLAYING &&
        safety-- > 0
    ) {
        sandbox.drivePlayingTick(dt);
    }

    check('AC#4: gap fall ends in STATES.CRASHED',
        sandbox.gameState === sandbox.STATES.CRASHED,
        'gameState=' + sandbox.gameState);
    check('AC#4: landingResult set to "Fell into a gap"',
        sandbox.landingResult === 'Fell into a gap',
        'got=' + sandbox.landingResult);
    // All drive state cleared on CRASHED.
    check('AC#4: driveRoadSegments cleared after crash',
        sandbox.driveRoadSegments.length === 0);
    check('AC#4: driveObstacles cleared after crash',
        sandbox.driveObstacles.length === 0);
    check('AC#4: drivePickups cleared after crash',
        sandbox.drivePickups.length === 0);
    check('AC#4: driveParticles cleared after crash',
        sandbox.driveParticles.length === 0);
    check('AC#4: driveFalling reset to false after crash cleanup',
        sandbox.driveFalling === false);
    check('AC#4: driveScore reset to 0 after crash cleanup',
        sandbox.driveScore === 0);
    check('AC#4: driveRoadLength reset to 0 after crash cleanup',
        sandbox.driveRoadLength === 0);
    check('AC#4: drivePickupsCollected reset to 0 after crash cleanup',
        sandbox.drivePickupsCollected === 0);
    check('AC#4: crash FX pipeline fires (existing CRASHED flow)',
        fxCalls.spawnExplosion === 1 &&
        fxCalls.startScreenShake === 1 &&
        fxCalls.playExplosionSound === 1 &&
        fxCalls.stopThrustSound >= 1);
    // currentLevel must NOT advance on the loss path — DRIVE_RETURN is the
    // only branch that increments it, and the CRASHED path doesn't touch it.
    check('AC#4: currentLevel unchanged by crash path',
        sandbox.currentLevel === 2,
        'currentLevel=' + sandbox.currentLevel);
    // Global score preserved (partial bonuses stay banked per US-007).
    check('AC#4: global score preserved (no mutation on crash)',
        sandbox.score === 500,
        'score=' + sandbox.score);
})();

// -------- Static source pins: confirm update.js wires the handler correctly --------
(function () {
    var src = updateSrc;
    check('Static pin: clearDriveState() defined in update.js',
        /function\s+clearDriveState\s*\(\s*\)\s*\{/.test(src));
    check('Static pin: DRIVE_COMPLETE handler transitions to DRIVE_RETURN at/after DRIVE_COMPLETE_DELAY',
        /driveCompleteTimer\s*>=\s*DRIVE_COMPLETE_DELAY[\s\S]{0,120}gameState\s*=\s*STATES\.DRIVE_RETURN/
            .test(src));
    check('Static pin: DRIVE_RETURN handler present',
        /if\s*\(\s*gameState\s*===\s*STATES\.DRIVE_RETURN\s*\)\s*\{/.test(src));
    check('Static pin: DRIVE_RETURN calls clearDriveState()',
        /STATES\.DRIVE_RETURN[\s\S]{0,600}clearDriveState\s*\(\s*\)/.test(src));
    check('Static pin: DRIVE_RETURN increments currentLevel',
        /STATES\.DRIVE_RETURN[\s\S]{0,600}currentLevel\+\+/.test(src));
    check('Static pin: DRIVE_RETURN calls resetShip()',
        /STATES\.DRIVE_RETURN[\s\S]{0,600}resetShip\s*\(\s*\)/.test(src));
    check('Static pin: DRIVE_RETURN calls generateTerrain()',
        /STATES\.DRIVE_RETURN[\s\S]{0,600}generateTerrain\s*\(\s*\)/.test(src));
    check('Static pin: DRIVE_RETURN flips to STATES.PLAYING',
        /STATES\.DRIVE_RETURN[\s\S]{0,800}gameState\s*=\s*STATES\.PLAYING/.test(src));
    check('Static pin: gap-fall CRASHED branch calls clearDriveState()',
        /landingResult\s*=\s*['"]Fell into a gap['"][\s\S]{0,400}clearDriveState\s*\(\s*\)/.test(src));
    // clearDriveState resets every drive state primitive + array we tested.
    var cds = src.slice(src.indexOf('function clearDriveState()'),
        src.indexOf('function clearDriveState()') + 1400);
    check('Static pin: clearDriveState resets driveRoadSegments',
        /driveRoadSegments\s*=\s*\[\]/.test(cds));
    check('Static pin: clearDriveState resets driveObstacles',
        /driveObstacles\s*=\s*\[\]/.test(cds));
    check('Static pin: clearDriveState resets drivePickups',
        /drivePickups\s*=\s*\[\]/.test(cds));
    check('Static pin: clearDriveState resets driveParticles',
        /driveParticles\s*=\s*\[\]/.test(cds));
    check('Static pin: clearDriveState resets driveFalling',
        /driveFalling\s*=\s*false/.test(cds));
    check('Static pin: clearDriveState resets driveCompleteTimer',
        /driveCompleteTimer\s*=\s*0/.test(cds));
})();

// -------- Summary --------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
