// US-009 (Feature Drive): Runtime integration test for pickup collection.
// Loads js/config.js + the real DRIVE_PLAYING tick block from js/update.js
// into a vm sandbox and verifies each acceptance criterion of pickup
// collection — plus static pins proving the source wires up the sparkle
// burst, chime sound, score, fuel restore, counter, and label rendering.
//
// Run:  node tests/integration-drive-us009.js
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

// FX-side stub counters — assert sparkle/chime fire on pickup collection.
var fxCalls;
function resetFxCalls() {
    fxCalls = {
        spawnDrivePickupSparkle: 0,
        playDrivePickupSound: 0,
        spawnDriveSparkBurst: 0,
        startScreenShake: 0,
        playDriveRockHitSound: 0,
        lastSparkle: null,
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
    spawnDrivePickupSparkle: function (x, y) {
        fxCalls.spawnDrivePickupSparkle++;
        fxCalls.lastSparkle = { x: x, y: y };
    },
    playDrivePickupSound: function () { fxCalls.playDrivePickupSound++; },
    // US-008 stubs (rock hit path — kept as no-ops since US-009 scenarios don't hit rocks).
    spawnDriveSparkBurst: function () { fxCalls.spawnDriveSparkBurst++; },
    spawnDriveDustPuff: function () {},
    startScreenShake: function () { fxCalls.startScreenShake++; },
    playDriveRockHitSound: function () { fxCalls.playDriveRockHitSound++; },
    // US-007 pipeline stubs.
    spawnExplosion: function () {},
    stopThrustSound: function () {},
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
check('drivePlayingTick extracted + evaluated',
    typeof sandbox.drivePlayingTick === 'function');

// -------- Test harness: flat 500-segment road (no rocks, no gaps) --------
function buildFlatRoad(total) {
    var segs = [];
    for (var i = 0; i < total; i++) {
        segs.push({ x: i * 20, y: 450, type: 'ground', label: null });
    }
    return segs;
}

function makePickup(worldX, worldY, label) {
    return {
        x: worldX,
        y: worldY,
        size: sandbox.DRIVE_PICKUP_SIZE,
        label: label || 'LGTM',
        collected: false
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
    sandbox.drivePickupsCollected = 0;
    sandbox.driveObstacles = [];
    sandbox.drivePickups = [];
    sandbox.driveParticles = [];
    sandbox.landingResult = null;
    sandbox.score = 5000;
    sandbox.keys = {};
    sandbox.ship = { fuel: 50 };
    sandbox.gameState = sandbox.STATES.DRIVE_PLAYING;
}

// Buggy world-X = driveScrollX + canvas.width*0.25 = 0 + 200 = 200.
// Ground-level pickup for an AABB hit: place at world-X 200 with Y near
// ground (buggy occupies [driveBuggyY - SHIP_SIZE/2, driveBuggyY + OFFSET_Y]
// = [430, 468] on flat Y=450 terrain).

// -------- AC#2: grounded buggy AABB overlap → collected --------
resetScenario();
sandbox.drivePickups.push(makePickup(200, 440, 'LGTM'));
var countBefore = sandbox.drivePickups.length;
sandbox.drivePlayingTick(1 / 60);
check('AC#2: buggy bounding box overlaps pickup → collected (removed from drivePickups)',
    sandbox.drivePickups.length === 0,
    'pickups before=' + countBefore + ' after=' + sandbox.drivePickups.length);

// -------- AC#3: DRIVE_PICKUP_POINTS awarded to driveScore + global score --------
resetScenario();
sandbox.drivePickups.push(makePickup(200, 440, 'LGTM'));
var driveScoreBefore = sandbox.driveScore;
var scoreBefore = sandbox.score;
sandbox.drivePlayingTick(1 / 60);
check('AC#3: driveScore += DRIVE_PICKUP_POINTS on collection',
    sandbox.driveScore === driveScoreBefore + sandbox.DRIVE_PICKUP_POINTS,
    'before=' + driveScoreBefore + ' after=' + sandbox.driveScore +
    ' (points=' + sandbox.DRIVE_PICKUP_POINTS + ')');
check('AC#3: global score += DRIVE_PICKUP_POINTS on collection',
    sandbox.score === scoreBefore + sandbox.DRIVE_PICKUP_POINTS,
    'before=' + scoreBefore + ' after=' + sandbox.score);

// -------- AC#3: DRIVE_PICKUP_FUEL_RESTORE added to fuel --------
resetScenario();
sandbox.ship.fuel = 50;
sandbox.drivePickups.push(makePickup(200, 440, 'LGTM'));
sandbox.drivePlayingTick(1 / 60);
check('AC#3: ship.fuel restored by DRIVE_PICKUP_FUEL_RESTORE',
    sandbox.ship.fuel === 50 + sandbox.DRIVE_PICKUP_FUEL_RESTORE,
    'after=' + sandbox.ship.fuel +
    ' (expected ' + (50 + sandbox.DRIVE_PICKUP_FUEL_RESTORE) + ')');

// -------- AC#3: fuel restore capped at FUEL_MAX + FUEL_EXTENSION_MAX --------
// Per US-005, the hard cap across all fuel-modifying code is the extended
// maximum (FUEL_MAX + FUEL_EXTENSION_MAX). Drive pickups are a non-bugfix
// fuel source but still must not exceed the absolute cap.
var HARD_CAP = sandbox.FUEL_MAX + sandbox.FUEL_EXTENSION_MAX;
resetScenario();
sandbox.ship.fuel = HARD_CAP; // already at absolute cap
sandbox.drivePickups.push(makePickup(200, 440, 'LGTM'));
sandbox.drivePlayingTick(1 / 60);
check('AC#3: fuel cannot exceed FUEL_MAX + FUEL_EXTENSION_MAX when already at cap',
    sandbox.ship.fuel === HARD_CAP,
    'fuel=' + sandbox.ship.fuel + ' HARD_CAP=' + HARD_CAP);

// near-cap: ensures we clamp, not just preserve
resetScenario();
sandbox.ship.fuel = HARD_CAP - 1; // HARD_CAP-1 + 3 would overshoot
sandbox.drivePickups.push(makePickup(200, 440, 'LGTM'));
sandbox.drivePlayingTick(1 / 60);
check('AC#3: fuel restore clamps to absolute cap (not cap + overflow)',
    sandbox.ship.fuel === HARD_CAP,
    'fuel=' + sandbox.ship.fuel + ' HARD_CAP=' + HARD_CAP);

// -------- AC#4: sparkle particle effect plays at pickup location --------
resetScenario();
sandbox.drivePickups.push(makePickup(200, 440, 'LGTM'));
sandbox.drivePlayingTick(1 / 60);
check('AC#4: spawnDrivePickupSparkle called exactly once on collection',
    fxCalls.spawnDrivePickupSparkle === 1,
    'sparkle calls=' + fxCalls.spawnDrivePickupSparkle);
// Sparkle position = pup.x - driveScrollX at the *moment of collection*. The
// tick advances driveScrollX = driveSpeed * dt before the collision check, so
// sparkle.x = 200 - (driveSpeed/60) ≈ 198 at base speed. Y = pup.y exactly.
check('AC#4: sparkle position = pickup screen-X (world-X - driveScrollX)',
    fxCalls.lastSparkle &&
    Math.abs(fxCalls.lastSparkle.x - (200 - sandbox.driveScrollX)) < 0.5 &&
    Math.abs(fxCalls.lastSparkle.y - 440) < 0.01,
    'lastSparkle=' + JSON.stringify(fxCalls.lastSparkle) +
    ' scrollX=' + sandbox.driveScrollX);

// With a non-zero scroll, sparkle screen-X must be world-X - scrollX.
resetScenario();
sandbox.driveScrollX = 300;
// buggy world-X now = 300 + 200 = 500; place pickup at 500
sandbox.drivePickups.push(makePickup(500, 440, 'LGTM'));
sandbox.drivePlayingTick(1 / 60);
check('AC#4: sparkle screen-X reflects driveScrollX (buggy at 25% screen)',
    fxCalls.lastSparkle &&
    Math.abs(fxCalls.lastSparkle.x - (500 - sandbox.driveScrollX)) < 0.5,
    'lastSparkle=' + JSON.stringify(fxCalls.lastSparkle));

// -------- AC#5: chime sound plays on collection --------
resetScenario();
sandbox.drivePickups.push(makePickup(200, 440, 'LGTM'));
sandbox.drivePlayingTick(1 / 60);
check('AC#5: playDrivePickupSound called exactly once on collection',
    fxCalls.playDrivePickupSound === 1,
    'sound calls=' + fxCalls.playDrivePickupSound);

// -------- AC#6: drivePickupsCollected incremented --------
resetScenario();
sandbox.drivePickups.push(makePickup(200, 440, 'LGTM'));
sandbox.drivePlayingTick(1 / 60);
check('AC#6: drivePickupsCollected incremented by 1 on collection',
    sandbox.drivePickupsCollected === 1,
    'drivePickupsCollected=' + sandbox.drivePickupsCollected);

// Multiple pickups collected in one session → counter sums correctly.
resetScenario();
sandbox.drivePickups.push(makePickup(200, 440, 'LGTM'));
sandbox.drivePlayingTick(1 / 60);
// shift scroll so a new pickup is under the buggy at world-X ~500
sandbox.driveScrollX = 300;
sandbox.drivePickups.push(makePickup(500, 440, 'approved'));
sandbox.drivePlayingTick(1 / 60);
check('AC#6: drivePickupsCollected accumulates across collections',
    sandbox.drivePickupsCollected === 2,
    'drivePickupsCollected=' + sandbox.drivePickupsCollected);

// -------- AC#1: pickups exist at varying heights after world setup --------
// Extract and run the real setupDriveWorld() to confirm AC#1 placements.
var setupBlock = extractBlock(updateSrc, 'function setupDriveWorld()', 'setupDriveWorld');
vm.runInContext(setupBlock, sandbox, { filename: 'setupDriveWorld-extracted' });
sandbox.currentLevel = 3;
sandbox.driveRoadLength = 0;
sandbox.driveBuggyY = 0;
sandbox.driveBuggyVY = 0;
sandbox.driveGrounded = true;
sandbox.driveScrollX = 0;
sandbox.driveSpeed = 0;
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
check('AC#1: setupDriveWorld produces at least some pickups',
    Array.isArray(sandbox.drivePickups) && sandbox.drivePickups.length > 0,
    'count=' + (sandbox.drivePickups && sandbox.drivePickups.length));

// For each pickup, heightOffset above its segment ground is in [20, 80].
// Low pickups are drive-through (~20-30px above ground); elevated pickups
// require a jump (~55-80px above ground). Presence of BOTH bands verifies
// the varying-height AC.
var anyLow = false;
var anyHigh = false;
var segmentWidth = 20;
for (var i = 0; i < sandbox.drivePickups.length; i++) {
    var p = sandbox.drivePickups[i];
    var segIdx = Math.floor(p.x / segmentWidth);
    if (segIdx < 0) segIdx = 0;
    if (segIdx > sandbox.driveRoadSegments.length - 1) {
        segIdx = sandbox.driveRoadSegments.length - 1;
    }
    var segY = sandbox.driveRoadSegments[segIdx].y;
    var offset = segY - p.y;
    if (offset >= 20 && offset <= 30) anyLow = true;
    if (offset >= 55 && offset <= 80) anyHigh = true;
}
check('AC#1: some pickups at ground-level (20-30px above terrain, easy to collect)',
    anyLow,
    'no low-offset pickups found');
check('AC#1: some pickups elevated (55-80px above terrain, require a jump)',
    anyHigh,
    'no elevated-offset pickups found');

// -------- AC#7: pickup.label exists and is from the pool --------
// Check the setupDriveWorld-produced pickups BEFORE further mutating the
// sandbox (resetScenario wipes drivePickups).
var PICKUP_POOL = [
    'LGTM', '+1', 'approved', 'ship it!', 'CI passed',
    'tests green', 'looks good', 'no comments', 'reviewed', 'merged'
];
var allFromPool = sandbox.drivePickups.length > 0;
var sampleLabels = [];
for (var j = 0; j < sandbox.drivePickups.length; j++) {
    var lbl = sandbox.drivePickups[j].label;
    sampleLabels.push(lbl);
    if (PICKUP_POOL.indexOf(lbl) < 0) {
        allFromPool = false;
    }
}
check('AC#7: every pickup has a label from the pickup pool (PRD §9)',
    allFromPool,
    'labels=' + sampleLabels.slice(0, 5).join(','));

// -------- AC#2: airborne overlap also collects (elevated pickups) --------
resetScenario();
// Buggy mid-jump at Y=400; elevated pickup at Y=400 (AABB overlap).
sandbox.driveBuggyY = 400;
sandbox.driveBuggyVY = -50;
sandbox.driveGrounded = false;
sandbox.drivePickups.push(makePickup(200, 400, 'approved'));
sandbox.drivePlayingTick(1 / 60);
check('AC#2: airborne buggy overlapping elevated pickup → collected',
    sandbox.drivePickups.length === 0,
    'pickups=' + sandbox.drivePickups.length);

// -------- Guard: distant pickup not yet in range → no collection FX --------
resetScenario();
// buggy world-X = 200 (scrollX=0); pickup at world-X 800, far away.
sandbox.drivePickups.push(makePickup(800, 440, 'LGTM'));
sandbox.drivePlayingTick(1 / 60);
check('Guard: far-away pickup does not trigger collection FX',
    fxCalls.spawnDrivePickupSparkle === 0 &&
    fxCalls.playDrivePickupSound === 0 &&
    sandbox.drivePickups.length === 1 &&
    sandbox.drivePickupsCollected === 0,
    'sparkle=' + fxCalls.spawnDrivePickupSparkle +
    ' sound=' + fxCalls.playDrivePickupSound +
    ' count=' + sandbox.drivePickups.length);

// -------- Guard: collected pickup is not collected again on subsequent frame --------
resetScenario();
sandbox.drivePickups.push(makePickup(200, 440, 'LGTM'));
sandbox.drivePlayingTick(1 / 60);
var sparkleAfterFirst = fxCalls.spawnDrivePickupSparkle;
var driveScoreAfterFirst = sandbox.driveScore;
// run more frames — pickup is already spliced, so no repeat collection
for (var ff = 0; ff < 30; ff++) sandbox.drivePlayingTick(1 / 60);
check('Guard: collected pickup spliced and never re-collected',
    fxCalls.spawnDrivePickupSparkle === sparkleAfterFirst &&
    sandbox.driveScore === driveScoreAfterFirst &&
    sandbox.drivePickupsCollected === 1,
    'sparkleRepeat=' + (fxCalls.spawnDrivePickupSparkle - sparkleAfterFirst) +
    ' scoreDelta=' + (sandbox.driveScore - driveScoreAfterFirst));

// -------- Guard: pickup above airborne reach stays uncollected --------
resetScenario();
// Pickup far above the buggy — buggyBottom = 450 + 18 = 468;
// pickupTop at y=50 (way above). No AABB overlap.
sandbox.drivePickups.push(makePickup(200, 50, 'LGTM'));
sandbox.drivePlayingTick(1 / 60);
check('Guard: pickup well above buggy bounding box is NOT collected',
    sandbox.drivePickups.length === 1 &&
    sandbox.drivePickupsCollected === 0,
    'count=' + sandbox.drivePickups.length +
    ' collected=' + sandbox.drivePickupsCollected);

// -------- Static pins: source-byte contract --------
function hasLiteral(src, needle, label) {
    check('static pin: ' + label,
        src.indexOf(needle) >= 0,
        'needle not found: ' + needle);
}
hasLiteral(updateSrc, 'DRIVE_PICKUP_POINTS',
    'update.js awards DRIVE_PICKUP_POINTS on collection');
hasLiteral(updateSrc, 'DRIVE_PICKUP_FUEL_RESTORE',
    'update.js restores DRIVE_PICKUP_FUEL_RESTORE on collection');
hasLiteral(updateSrc, 'drivePickupsCollected++',
    'update.js increments drivePickupsCollected on collection');
hasLiteral(updateSrc, 'spawnDrivePickupSparkle',
    'update.js spawns sparkle burst on collection');
hasLiteral(updateSrc, 'playDrivePickupSound',
    'update.js plays pickup chime on collection');
hasLiteral(updateSrc, 'drivePickups.splice',
    'update.js splices collected pickups from drivePickups');
hasLiteral(updateSrc, 'FUEL_MAX',
    'update.js clamps fuel restore at FUEL_MAX');
hasLiteral(updateSrc, 'driveScore += DRIVE_PICKUP_POINTS',
    'update.js adds points to driveScore');
hasLiteral(updateSrc, 'score += DRIVE_PICKUP_POINTS',
    'update.js adds points to global score');

var configSrc = loadFile('js/config.js');
hasLiteral(configSrc, 'DRIVE_PICKUP_POINTS',
    'config.js declares DRIVE_PICKUP_POINTS');
hasLiteral(configSrc, 'DRIVE_PICKUP_FUEL_RESTORE',
    'config.js declares DRIVE_PICKUP_FUEL_RESTORE');
hasLiteral(configSrc, 'drivePickupsCollected',
    'config.js declares drivePickupsCollected counter');

var audioSrc = loadFile('js/audio.js');
hasLiteral(audioSrc, 'function playDrivePickupSound',
    'audio.js defines playDrivePickupSound');

var renderSrc = loadFile('js/render.js');
hasLiteral(renderSrc, 'pu.label',
    'render.js renders the pickup label beside the pickup icon');
hasLiteral(renderSrc, 'drivePickups',
    'render.js iterates drivePickups to draw them');

// -------- Summary --------
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
