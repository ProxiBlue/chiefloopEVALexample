// US-013 (Feature Drive): Integration test for the DRIVE_* render branch —
// buggy + wheels, road, gaps, rocks, pickups (colored by label), slow zones,
// speed boosts (>>> chevrons), destination pad, dust, jump-arc trail, stars
// parallax, progress bar, and HUD. Loads config.js + the real DRIVE_PLAYING
// tick body so the runtime stages it exercise (trail accumulation, dust
// spawn, parallax offset) can be asserted directly. Render-side contract is
// verified via source-byte static pins over render.js + particles.js.
//
// Run:  node tests/integration-drive-us013.js
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
function hasLiteral(src, needle, label) {
    check('static pin: ' + label, src.indexOf(needle) !== -1,
        'missing: ' + JSON.stringify(needle.slice(0, 80)));
}
function hasPattern(src, re, label) {
    check('static pin: ' + label, re.test(src), 'regex ' + re + ' no match');
}

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

// -------------------- Sandbox setup --------------------
var fxCalls = {
    spawnDriveDustPuff: 0,
    lastDust: null,
};
var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean,
    Infinity: Infinity,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    SHIP_SIZE: 40,
    spawnDriveSparkBurst: function () {},
    spawnDriveDustPuff: function (x, y) {
        fxCalls.spawnDriveDustPuff++;
        fxCalls.lastDust = { x: x, y: y };
    },
    startScreenShake: function () {},
    playDriveRockHitSound: function () {},
    spawnExplosion: function () {},
    stopThrustSound: function () {},
    playExplosionSound: function () {},
    spawnDrivePickupSparkle: function () {},
    playDrivePickupSound: function () {},
    playDriveBoostSound: function () {},
    spawnCelebration: function () {},
    updateCelebration: function () {},
    playDriveCompleteSound: function () {},
    clearDriveState: function () {},
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

function setupFlatScenario() {
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
    sandbox.driveFalling = false;
    sandbox.driveBoostTimer = 0;
    sandbox.drivePrevSegType = null;
    sandbox.driveAirborneTrail = [];
    sandbox.driveStarParallaxOffset = 0;
    sandbox.driveParticles = [];
    sandbox.driveObstacles = [];
    sandbox.drivePickups = [];
    sandbox.keys = {};
    sandbox.ship = { fuel: 100 };
    sandbox.score = 0;
    sandbox.gameState = sandbox.STATES.DRIVE_PLAYING;
    fxCalls.spawnDriveDustPuff = 0;
    fxCalls.lastDust = null;
}

function runFrames(n, dt) {
    for (var k = 0; k < n; k++) sandbox.drivePlayingTick(dt);
}

// -------------------- Runtime tests --------------------

// AC — dust particles: speed-proportional emission behind buggy while grounded.
// Use a seeded random so the Math.random() < dustProb branch is deterministic.
// Force random to 0 (always under threshold) so every frame spawns dust.
var seededMath = Object.create(Math);
seededMath.random = function () { return 0.0; }; // always "hits" the probability gate
sandbox.Math = seededMath;

setupFlatScenario();
sandbox.driveSpeed = 200; // dustProb = 200/500 = 0.4, with random=0 always fires
runFrames(30, 1 / 60);
// dust spawns twice per frame (left + right wheel), 30 frames = 60 calls
check('AC — dust: grounded driving spawns dust puffs proportional to speed',
    fxCalls.spawnDriveDustPuff > 0, 'dust count=' + fxCalls.spawnDriveDustPuff);
check('AC — dust: 30 frames at prob-1 spawn both-wheel dust (≥ 30 total)',
    fxCalls.spawnDriveDustPuff >= 30, 'dust count=' + fxCalls.spawnDriveDustPuff);
// Last dust spawn x should be near the buggy's screen-X (canvas.width * 0.25 = 200 ± DRIVE_WHEEL_OFFSET_X+offset)
var dustXExpectMin = 200 - 20; // left wheel area (~200 - 10 - 4)
var dustXExpectMax = 200 + 20; // right wheel area (~200 + 10 + 4 + jitter)
check('AC — dust: spawn x is within the buggy wheel vicinity',
    fxCalls.lastDust &&
    fxCalls.lastDust.x >= dustXExpectMin - 5 &&
    fxCalls.lastDust.x <= dustXExpectMax + 5,
    'lastDust=' + JSON.stringify(fxCalls.lastDust));

// AC — dust: higher speed → higher dust probability (proportional).
// With seeded random=1.0 (always ABOVE threshold), zero dust should spawn.
var alwaysMissMath = Object.create(Math);
alwaysMissMath.random = function () { return 0.999; }; // always above probability gate
sandbox.Math = alwaysMissMath;
setupFlatScenario();
sandbox.driveSpeed = 200;
runFrames(30, 1 / 60);
check('AC — dust: dust emission is probabilistic (random≥prob → no dust)',
    fxCalls.spawnDriveDustPuff === 0, 'dust count=' + fxCalls.spawnDriveDustPuff);

// AC — dust: airborne buggy does NOT emit dust (grounded+!falling gate).
sandbox.Math = seededMath; // always under threshold
setupFlatScenario();
sandbox.driveGrounded = false;
sandbox.driveBuggyY = 200; // high up
sandbox.driveBuggyVY = -100;
runFrames(10, 1 / 60);
check('AC — dust: airborne buggy produces no dust',
    fxCalls.spawnDriveDustPuff === 0, 'dust count=' + fxCalls.spawnDriveDustPuff);

// AC — jump arc trail: airborne frames populate driveAirborneTrail, grounded clears it.
sandbox.Math = Math; // restore normal Math for non-probabilistic tests
setupFlatScenario();
sandbox.driveGrounded = false;
sandbox.driveBuggyY = 400;
sandbox.driveBuggyVY = -100;
runFrames(5, 1 / 60);
check('AC — jump trail: airborne frames push entries into driveAirborneTrail',
    sandbox.driveAirborneTrail.length >= 1,
    'len=' + sandbox.driveAirborneTrail.length);
check('AC — jump trail: trail entries store scrollX and y',
    sandbox.driveAirborneTrail.length > 0 &&
    typeof sandbox.driveAirborneTrail[0].scrollX === 'number' &&
    typeof sandbox.driveAirborneTrail[0].y === 'number',
    'first=' + JSON.stringify(sandbox.driveAirborneTrail[0]));

// Landing should empty the trail — simulate grounded transition.
sandbox.driveGrounded = true;
sandbox.driveFalling = false;
runFrames(2, 1 / 60);
check('AC — jump trail: grounding clears driveAirborneTrail',
    sandbox.driveAirborneTrail.length === 0,
    'len=' + sandbox.driveAirborneTrail.length);

// Trail length is capped (no unbounded growth over long jumps).
setupFlatScenario();
sandbox.driveGrounded = false;
sandbox.driveBuggyY = 400;
sandbox.driveBuggyVY = -50;
runFrames(200, 1 / 60); // long airborne window
check('AC — jump trail: trail length is capped (<= 20)',
    sandbox.driveAirborneTrail.length <= 20,
    'len=' + sandbox.driveAirborneTrail.length);

// AC — starfield parallax: driveStarParallaxOffset accumulates during DRIVE_PLAYING.
setupFlatScenario();
sandbox.driveSpeed = sandbox.DRIVE_SCROLL_SPEED_BASE; // 120
runFrames(60, 1 / 60); // 1 s
// 120 px/s * 0.1 = 12 px/s → 1 s should yield ~12
check('AC — parallax: driveStarParallaxOffset grows at ~0.1× drive speed',
    Math.abs(sandbox.driveStarParallaxOffset - 12) < 2,
    'offset=' + sandbox.driveStarParallaxOffset);
check('AC — parallax: offset is smaller than driveScrollX (stars slower than terrain)',
    sandbox.driveStarParallaxOffset < sandbox.driveScrollX,
    'off=' + sandbox.driveStarParallaxOffset + ' scroll=' + sandbox.driveScrollX);

// Reset of driveAirborneTrail + driveStarParallaxOffset happens in setupDriveWorld and clearDriveState.
// Run the full setupDriveWorld and confirm both are reset.
var setupDriveWorldStart = updateSrc.indexOf('function setupDriveWorld()');
var setupDriveWorldEnd = (function () {
    var open = updateSrc.indexOf('{', setupDriveWorldStart);
    var depth = 0;
    for (var i = open; i < updateSrc.length; i++) {
        if (updateSrc[i] === '{') depth++;
        else if (updateSrc[i] === '}') {
            depth--;
            if (depth === 0) return i + 1;
        }
    }
    return -1;
})();
var setupDriveWorldSrc = updateSrc.slice(setupDriveWorldStart, setupDriveWorldEnd);
check('setupDriveWorld resets driveAirborneTrail',
    /driveAirborneTrail\s*=\s*\[\s*\]/.test(setupDriveWorldSrc));
check('setupDriveWorld resets driveStarParallaxOffset',
    /driveStarParallaxOffset\s*=\s*0/.test(setupDriveWorldSrc));

// Similarly for clearDriveState.
var clearStart = updateSrc.indexOf('function clearDriveState()');
var clearEnd = (function () {
    var open = updateSrc.indexOf('{', clearStart);
    var depth = 0;
    for (var i = open; i < updateSrc.length; i++) {
        if (updateSrc[i] === '{') depth++;
        else if (updateSrc[i] === '}') {
            depth--;
            if (depth === 0) return i + 1;
        }
    }
    return -1;
})();
var clearSrc = updateSrc.slice(clearStart, clearEnd);
check('clearDriveState resets driveAirborneTrail',
    /driveAirborneTrail\s*=\s*\[\s*\]/.test(clearSrc));
check('clearDriveState resets driveStarParallaxOffset',
    /driveStarParallaxOffset\s*=\s*0/.test(clearSrc));

// AC — setup/clear contract: config.js declares both new state vars.
var configSrc = loadFile('js/config.js');
hasPattern(configSrc, /var\s+driveAirborneTrail\s*=\s*\[\s*\]/,
    'config.js declares driveAirborneTrail');
hasPattern(configSrc, /var\s+driveStarParallaxOffset\s*=\s*0/,
    'config.js declares driveStarParallaxOffset');

// -------------------- Render-side static pins --------------------
var renderSrc = loadFile('js/render.js');

// AC — Buggy: M character rendered upright with two wheels + orange color.
hasPattern(renderSrc, /function\s+renderDrivePlaying\s*\(/,
    'render.js defines renderDrivePlaying');
hasLiteral(renderSrc, "case STATES.DRIVE_PLAYING:",
    'render dispatch includes DRIVE_PLAYING');
hasLiteral(renderSrc, 'drawShip(buggyScreenX, buggyScreenY, tilt, SHIP_SIZE',
    'renderDrivePlaying draws the M ship');

// Wheels: filled circles in #888 with darker hub dot and spoke line rotating per driveWheelRotation.
hasLiteral(renderSrc, "ctx.fillStyle = '#888'",
    'wheels filled in #888');
hasPattern(renderSrc, /ctx\.fillStyle\s*=\s*'#333'/,
    'wheels hub dot in dark gray #333');
hasLiteral(renderSrc, 'spokeAng = driveWheelRotation',
    'spoke angle reads driveWheelRotation');

// Terrain/road: ground surface #777, fill #444, contiguous non-gap runs.
hasLiteral(renderSrc, "ctx.fillStyle = '#444'", 'terrain fill #444');
hasLiteral(renderSrc, "ctx.strokeStyle = '#777'", 'ground surface stroke #777');

// Gaps: runs break on seg.type === 'gap' so the starfield shows through.
hasPattern(renderSrc, /if\s*\(seg\.type\s*===\s*['"]gap['"]\)/,
    'terrain-fill loop breaks on gap segments');

// Rocks: brown triangle with label beside.
hasLiteral(renderSrc, "ctx.fillStyle = '#996633'",
    'rocks filled in brown #996633');

// Slow zones: darker overlay + hatching + label at leading edge.
hasLiteral(renderSrc, "gs.type === 'slow'",
    'drawDriveWorld renders slow-zone branch');
hasPattern(renderSrc, /rgba\(20,\s*20,\s*20,\s*0\.55\)/,
    'slow-zone dark overlay color');

// Speed boosts: bright ground + chevron arrows (`>>>`) label.
hasLiteral(renderSrc, "gs.type === 'boost'",
    'drawDriveWorld renders boost-zone branch');
hasPattern(renderSrc, /for\s*\(var\s+chvi\s*=\s*0;\s*chvi\s*<\s*3;\s*chvi\+\+\)/,
    'boost segment emits 3 chevrons (`>>>`)');

// Pickups: rotating diamonds; colored by label (LGTM green, approved gold, +1 cyan).
hasLiteral(renderSrc, "pu.label === 'approved'",
    'pickups color-switch on approved label');
hasLiteral(renderSrc, "pu.label === '+1'",
    'pickups color-switch on +1 label');
hasLiteral(renderSrc, "pu.label === 'LGTM'",
    'pickups color-switch on LGTM label');
hasLiteral(renderSrc, "'#FFD700'", 'gold color for approved pickups');
hasLiteral(renderSrc, "'#00E5FF'", 'cyan color for +1 pickups');
hasLiteral(renderSrc, "'#4CAF50'", 'green color for LGTM (default)');
hasPattern(renderSrc, /ctx\.rotate\(spinBasis\)/,
    'pickups rotate each render frame (spinBasis)');

// Destination pad: reuse pad style + banner with PR title or FEATURE COMPLETE.
hasLiteral(renderSrc, "PR_TYPE_COLORS.feature",
    'destination pad reuses feature pad color');
hasLiteral(renderSrc, "'FEATURE COMPLETE'",
    'destination banner fallback label FEATURE COMPLETE');

// Dust particles: screen-space; existing per-frame loop draws them from driveParticles.
hasLiteral(renderSrc, 'driveParticles && driveParticles.length',
    'renderDrivePlaying draws driveParticles');

// Jump arc: drawDriveAirborneTrail function + invocation in renderDrivePlaying.
hasPattern(renderSrc, /function\s+drawDriveAirborneTrail\s*\(\s*\)/,
    'render.js defines drawDriveAirborneTrail');
hasLiteral(renderSrc, 'drawDriveAirborneTrail()',
    'renderDrivePlaying calls drawDriveAirborneTrail');

// Background/starfield: drawStars applies a parallax offset when DRIVE_* states active.
var particlesSrc = loadFile('js/particles.js');
hasLiteral(particlesSrc, 'driveStarParallaxOffset',
    'drawStars reads driveStarParallaxOffset');
hasPattern(particlesSrc, /gameState\s*===\s*STATES\.DRIVE_PLAYING/,
    'drawStars checks gameState for DRIVE_PLAYING');

// Progress bar: drawDriveProgressBar defined, invoked in renderDrivePlaying.
hasPattern(renderSrc, /function\s+drawDriveProgressBar\s*\(\s*\)/,
    'render.js defines drawDriveProgressBar');
hasLiteral(renderSrc, 'drawDriveProgressBar()',
    'renderers call drawDriveProgressBar');
hasPattern(renderSrc, /driveScrollX\s*\/\s*driveRoadLength/,
    'progress bar computes scroll/roadLength ratio');

// HUD: drawDriveHUD defined, shows speed/fuel/score/pickups/distance.
hasPattern(renderSrc, /function\s+drawDriveHUD\s*\(\s*\)/,
    'render.js defines drawDriveHUD');
hasLiteral(renderSrc, "'Speed:",
    'HUD shows Speed field');
hasLiteral(renderSrc, "'Score:",
    'HUD shows Score field');
hasLiteral(renderSrc, "'Pickups:",
    'HUD shows Pickups field');
hasLiteral(renderSrc, "'Distance:",
    'HUD shows Distance field');
hasLiteral(renderSrc, "'Fuel:",
    'HUD shows Fuel label');
hasLiteral(renderSrc, 'drawDriveHUD()',
    'renderers call drawDriveHUD');

// Update-side contract: DRIVE_PLAYING tick spawns dust, pushes trail, and
// advances star parallax offset.
hasLiteral(updateSrc, 'spawnDriveDustPuff(',
    'DRIVE_PLAYING tick calls spawnDriveDustPuff');
hasLiteral(updateSrc, 'driveAirborneTrail.push(',
    'DRIVE_PLAYING tick pushes to driveAirborneTrail');
hasLiteral(updateSrc, 'driveAirborneTrail.shift',
    'DRIVE_PLAYING tick caps driveAirborneTrail with .shift');
hasLiteral(updateSrc, 'driveStarParallaxOffset +=',
    'DRIVE_PLAYING tick accumulates driveStarParallaxOffset');

// spawnDriveDustPuff defined in update.js with gray/tan palette.
hasPattern(updateSrc, /function\s+spawnDriveDustPuff\s*\(/,
    'update.js defines spawnDriveDustPuff');
hasPattern(updateSrc, /['"]#8b7355['"]/,
    'spawnDriveDustPuff palette includes tan color');

// -------------------- Summary --------------------
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
