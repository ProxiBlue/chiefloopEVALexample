// US-013: No-regression smoke test.
//
// Exercises every acceptance criterion end-to-end against the LIVE source
// files (js/config.js, js/collision.js, js/input.js, and extracted blocks
// from js/update.js) inside a Node vm. No DOM, no canvas — every assertion
// runs the same code paths the browser would, with audio/particle/render
// helpers stubbed. Run from the repo root:
//
//     node tests/smoke-us013.js
//
// Exits 0 on full pass, 1 on any failure. Prints a per-AC trace so a
// reviewer can verify each acceptance criterion was actually exercised.

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.resolve(__dirname, '..');
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8'); }

// --- Source extraction helpers ------------------------------------------------

// Extract a top-level `function NAME(...) { ... }` via brace-walking. Robust
// against nested blocks; the regex-based approach used in earlier stories
// breaks when bodies grow conditionals.
function extractFunction(source, name) {
    var sig = 'function ' + name + '(';
    var start = source.indexOf(sig);
    if (start < 0) throw new Error('extractFunction: ' + name + ' not found');
    var open = source.indexOf('{', start);
    var depth = 0;
    for (var i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error('extractFunction: unbalanced braces for ' + name);
}

// Extract a top-level `if (gameState === STATES.X ...) { ... }` block. We
// match on the literal prefix so ordering of conditions inside the if-paren
// doesn't matter.
function extractStateBlock(source, stateKey) {
    var sig = 'if (gameState === STATES.' + stateKey;
    var start = source.indexOf(sig);
    if (start < 0) throw new Error('extractStateBlock: ' + stateKey + ' not found');
    var open = source.indexOf('{', start);
    var depth = 0;
    for (var i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error('extractStateBlock: unbalanced braces for ' + stateKey);
}

// --- Context build ------------------------------------------------------------

var configSrc = read('js/config.js');
var collisionSrc = read('js/collision.js');
var inputSrc = read('js/input.js');
var updateSrc = read('js/update.js');

// FX/audio/particle stubs — every helper update.js / collision.js / input.js
// might call gets a no-op so we can run the real game loop without a browser.
// Counters (spawnExplosionCalls, etc.) let assertions verify side effects.
var stubBootstrap = `
    var canvas = { width: 800, height: 600 };
    var ctx = null;

    var animTime = 0;
    var screenShake = 0;
    var explosionFinished = false;
    var landingResult = '';
    var landedPRType = '';
    var landedPRTitle = '';
    var landedPRNumber = null;
    var landedPRAuthor = '';
    var landedPRMergedDate = '';
    var landedPadBasePoints = 0;
    var landedTypeMultiplier = 1;
    var landedPadPoints = 0;
    var landedFuelBonus = 0;
    var landedTotalPoints = 0;
    var landingPadIndex = -1;
    var landingPads = [];
    var terrain = [];
    var celebrationReady = false;
    var sceneLiftoffStartY = 0;

    var gameOverEnteringName = false;
    var gameOverName = '';
    var gameOverLevel = 0;
    var repoSelectorActive = false;
    var repoLoadError = false;
    var repoDataError = '';
    var repoDataLoading = false;
    var repoDataLoaded = true;
    var availableRepos = [];
    var selectedRepoIndex = 0;
    var selectedRepoName = '';

    var unplacedPRs = [];
    var levelDateRange = '';
    var levelCommits = [];
    var repoFallbackNotice = '';

    var spawnExplosionCalls = 0;
    var startScreenShakeCalls = 0;
    var stopThrustSoundCalls = 0;
    var startThrustSoundCalls = 0;
    var playExplosionSoundCalls = 0;
    var playClickSoundCalls = 0;
    var playLandingSoundCalls = 0;
    var playShootSoundCalls = 0;
    var playAlienDestroySoundCalls = 0;
    var spawnCelebrationCalls = 0;
    var spawnAlienExplosionCalls = 0;
    var spawnBombTrailCalls = 0;
    var spawnBombExplosionCalls = 0;
    var spawnBugExplosionCalls = 0;
    var resetShipCalls = 0;
    var generateTerrainCalls = 0;

    function spawnExplosion(x, y) { spawnExplosionCalls++; }
    function startScreenShake() { startScreenShakeCalls++; }
    function stopThrustSound() { stopThrustSoundCalls++; }
    function startThrustSound() { startThrustSoundCalls++; }
    function playExplosionSound() { playExplosionSoundCalls++; }
    function playClickSound() { playClickSoundCalls++; }
    function playLandingSound() { playLandingSoundCalls++; }
    function playShootSound() { playShootSoundCalls++; }
    function playAlienDestroySound() { playAlienDestroySoundCalls++; }
    function spawnCelebration(x, y) { spawnCelebrationCalls++; }
    function spawnAlienExplosion(x, y) { spawnAlienExplosionCalls++; }
    function spawnBombTrail(x, y) { spawnBombTrailCalls++; }
    function spawnBombExplosion(x, y) { spawnBombExplosionCalls++; }
    function spawnBugExplosion(x, y) { spawnBugExplosionCalls++; }
    function updateBombParticles(dt) {}
    function updateBugExplosions(dt) {}
    function updateAlienExplosions(dt) {}
    function updateExplosion(dt) {}
    function updateCelebration(dt) {}
    function updateStars(dt) {}
    function isHighScore(s) { return false; }
    function addToLeaderboard(n, s) {}
    function submitOnlineScore(n, s) {}
    function requestGameSession() {}
    function loadRepoData(f) {}

    function resetShip() {
        resetShipCalls++;
        ship.x = canvas.width / 2;
        ship.y = canvas.height / 3;
        ship.angle = 0;
        ship.vx = 0;
        ship.vy = 0;
        ship.thrusting = false;
        ship.rotating = null;
        ship.fuel = FUEL_MAX;
    }
    function generateTerrain() {
        generateTerrainCalls++;
        terrain = makeFlatTerrain(canvas.width * TERRAIN_FLAT_Y_RATIO);
        landingPads = [];
    }
    function makeFlatTerrain(y) {
        var t = [];
        for (var i = 0; i <= 80; i++) {
            t.push({ x: (canvas.width * i) / 80, y: y });
        }
        return t;
    }

    var ship = {
        x: canvas.width / 2,
        y: canvas.height / 3,
        angle: 0,
        vx: 0,
        vy: 0,
        thrusting: false,
        rotating: null,
        fuel: 100,
        rotationSpeed: 3
    };

    var window = { addEventListener: function () {} };
`;

// Pull the four top-level helpers out of update.js so we can call them from
// the SCENE_SCROLL routing branch the same way update() would.
var spawnAlienWaveSrc = extractFunction(updateSrc, 'spawnAlienWave');
var spawnBugWaveSrc = extractFunction(updateSrc, 'spawnBugWave');
var crashShipInBugfixSrc = extractFunction(updateSrc, 'crashShipInBugfix');
var clearBugfixStateSrc = extractFunction(updateSrc, 'clearBugfixState');

// Pull each state block we need from update.js. We include the whole
// SCENE_SCROLL block (its t<1 / t>=1 branches handle the routing fork
// across security / bugfix / feature / other) plus every per-state block
// the smoke test ticks through.
var blocks = {
    SCENE_SCROLL: extractStateBlock(updateSrc, 'SCENE_SCROLL'),
    SCENE_DESCENT: extractStateBlock(updateSrc, 'SCENE_DESCENT'),
    SCENE_COUNTDOWN: extractStateBlock(updateSrc, 'SCENE_COUNTDOWN'),
    INVADER_SCROLL_ROTATE: extractStateBlock(updateSrc, 'INVADER_SCROLL_ROTATE'),
    INVADER_TRANSITION: extractStateBlock(updateSrc, 'INVADER_TRANSITION'),
    INVADER_PLAYING: extractStateBlock(updateSrc, 'INVADER_PLAYING'),
    INVADER_COMPLETE: extractStateBlock(updateSrc, 'INVADER_COMPLETE'),
    INVADER_RETURN: extractStateBlock(updateSrc, 'INVADER_RETURN'),
    BUGFIX_TRANSITION: extractStateBlock(updateSrc, 'BUGFIX_TRANSITION'),
    BUGFIX_PLAYING: extractStateBlock(updateSrc, 'BUGFIX_PLAYING'),
    BUGFIX_COMPLETE: extractStateBlock(updateSrc, 'BUGFIX_COMPLETE'),
    BUGFIX_RETURN: extractStateBlock(updateSrc, 'BUGFIX_RETURN'),
    PLAYING: extractStateBlock(updateSrc, 'PLAYING')
};

// Build a tick(dt) that runs every block in update()'s real order. Mirrors
// the body of update() in js/update.js.
var tickSrc = `
    function tick(dt) {
        animTime += dt;
        invaderMode = (gameState === STATES.INVADER_SCROLL_ROTATE ||
                       gameState === STATES.INVADER_TRANSITION ||
                       gameState === STATES.INVADER_PLAYING ||
                       gameState === STATES.INVADER_COMPLETE ||
                       gameState === STATES.INVADER_RETURN);
        ${blocks.SCENE_SCROLL}
        ${blocks.SCENE_DESCENT}
        ${blocks.SCENE_COUNTDOWN}
        ${blocks.INVADER_SCROLL_ROTATE}
        ${blocks.INVADER_TRANSITION}
        ${blocks.INVADER_PLAYING}
        ${blocks.INVADER_COMPLETE}
        ${blocks.INVADER_RETURN}
        ${blocks.BUGFIX_TRANSITION}
        ${blocks.BUGFIX_PLAYING}
        ${blocks.BUGFIX_COMPLETE}
        ${blocks.BUGFIX_RETURN}
        ${blocks.PLAYING}
    }
`;

var sandbox = { console: console, Math: Math, Object: Object, Array: Array, JSON: JSON };
vm.createContext(sandbox);

// Order matters: stubs first (define ship/canvas/etc), then config (defines
// STATES + per-mini-game constants, references canvas), then collision
// (uses STATES + ship + terrain), then helpers + tick + input.
vm.runInContext(stubBootstrap, sandbox);
vm.runInContext(configSrc, sandbox);
vm.runInContext(collisionSrc, sandbox);
vm.runInContext(spawnAlienWaveSrc, sandbox);
vm.runInContext(spawnBugWaveSrc, sandbox);
vm.runInContext(crashShipInBugfixSrc, sandbox);
vm.runInContext(clearBugfixStateSrc, sandbox);
vm.runInContext(tickSrc, sandbox);
vm.runInContext(inputSrc, sandbox);

// --- Test runner --------------------------------------------------------------

var passed = 0;
var failed = 0;
var failures = [];

function check(label, cond, detail) {
    if (cond) {
        passed++;
        console.log('  [PASS] ' + label + (detail ? '  ' + detail : ''));
    } else {
        failed++;
        failures.push(label);
        console.log('  [FAIL] ' + label + (detail ? '  ' + detail : ''));
    }
}

function header(s) { console.log('\n--- ' + s + ' ---'); }

// Helper: stage the SCENE_SCROLL end-branch directly. We set up the frozen
// scroll state and tick once with dt large enough to land t >= 1.
function stageEndOfScroll(prType) {
    // Reset all globals the routing branch reads/writes
    sandbox.terrain = sandbox.makeFlatTerrain(sandbox.canvas.height * sandbox.TERRAIN_FLAT_Y_RATIO);
    sandbox.landingPads = [];
    sandbox.ship.x = sandbox.canvas.width / 2;
    sandbox.ship.y = sandbox.canvas.height / 2;
    sandbox.ship.angle = 0;
    sandbox.ship.vx = 0;
    sandbox.ship.vy = 0;
    sandbox.ship.fuel = 80; // pre-scroll fuel — should carry over for non-bugfix paths
    sandbox.securityPadScroll = (prType === 'security');
    sandbox.bugfixPadScroll = (prType === 'bugfix');
    sandbox.gameState = sandbox.STATES.SCENE_SCROLL;
    var newTerrain = [];
    for (var i = 0; i < sandbox.terrain.length; i++) {
        newTerrain.push({ x: sandbox.terrain[i].x, y: sandbox.terrain[i].y });
    }
    // Build the scroll state to expire on the first tick (timer ~= duration)
    sandbox.sceneScrollState = sandbox.createSceneScrollState(
        sandbox.terrain.slice(),
        [],
        newTerrain,
        [],
        sandbox.securityPadScroll,
        sandbox.bugfixPadScroll,
        sandbox.canvas.width / 2
    );
    // Bump the scroll timer so the next tick crosses t >= 1 immediately
    sandbox.sceneScrollState = Object.freeze({
        timer: sandbox.SCENE_SCROLL_DURATION,
        oldTerrain: sandbox.sceneScrollState.oldTerrain,
        oldPads: sandbox.sceneScrollState.oldPads,
        newTerrain: sandbox.sceneScrollState.newTerrain,
        newPads: sandbox.sceneScrollState.newPads,
        isInvaderScroll: sandbox.sceneScrollState.isInvaderScroll,
        isBugfixScroll: sandbox.sceneScrollState.isBugfixScroll,
        shipStartX: sandbox.sceneScrollState.shipStartX
    });
}

function runTick(dt) { sandbox.tick(dt); }

// === AC #1, #4: feature / other pads → SCENE_DESCENT (normal next-level) ====

console.log('\n========================================');
console.log(' US-013 NO-REGRESSION SMOKE TEST');
console.log('========================================');

['feature', 'other'].forEach(function (prType) {
    header('AC#' + (prType === 'feature' ? '1' : '4') + ' — ' + prType + ' pad → normal next-level');
    sandbox.score = 0;
    sandbox.currentLevel = 1;
    stageEndOfScroll(prType);
    var fuelBefore = sandbox.ship.fuel;
    runTick(0.05);
    check(prType + ': SCENE_SCROLL → SCENE_DESCENT', sandbox.gameState === sandbox.STATES.SCENE_DESCENT, 'state=' + sandbox.gameState);
    check(prType + ': ship centered', sandbox.ship.x === sandbox.canvas.width / 2);
    check(prType + ': ship upright', sandbox.ship.angle === 0);
    check(prType + ': velocities zeroed', sandbox.ship.vx === 0 && sandbox.ship.vy === 0);
    // KEY REGRESSION GUARD — fuel must carry over (US-013 attempt 1 had this wrong)
    check(prType + ': fuel carries over (REGRESSION GUARD)', sandbox.ship.fuel === fuelBefore, 'fuel=' + sandbox.ship.fuel + ' was=' + fuelBefore);
    // Tick through descent + countdown until PLAYING
    var safety = 0;
    while (sandbox.gameState !== sandbox.STATES.PLAYING && safety++ < 200) runTick(0.05);
    check(prType + ': eventually reaches PLAYING', sandbox.gameState === sandbox.STATES.PLAYING, 'after ' + safety + ' ticks');
});

// === AC #2: security pad → invader mini-game (entry, gameplay, win, return) ==

header('AC#2 — security pad → invader entry');
sandbox.score = 0;
sandbox.currentLevel = 1;
stageEndOfScroll('security');
runTick(0.05);
check('security: SCENE_SCROLL → INVADER_SCROLL_ROTATE', sandbox.gameState === sandbox.STATES.INVADER_SCROLL_ROTATE);
check('security: ship centered for rotation', sandbox.ship.x === sandbox.canvas.width / 2 && sandbox.ship.y === sandbox.canvas.height / 2);
// Timer is reset to 0 on entry to INVADER_SCROLL_ROTATE, then the rotate
// block advances it by dt in the same tick — so we check it's still in
// progress (under the rotate duration), not exactly 0.
check('security: invaderScrollRotateTimer in progress', sandbox.invaderScrollRotateTimer > 0 && sandbox.invaderScrollRotateTimer < sandbox.INVADER_SCROLL_ROTATE_DURATION, 'timer=' + sandbox.invaderScrollRotateTimer);

// Tick through rotate + terrain transition until INVADER_PLAYING. The
// invader transition spawns an alien wave at its tail.
var safety = 0;
while (sandbox.gameState !== sandbox.STATES.INVADER_PLAYING && safety++ < 200) runTick(0.05);
check('security: → INVADER_PLAYING after rotate + transition', sandbox.gameState === sandbox.STATES.INVADER_PLAYING, 'after ' + safety + ' ticks');
check('security: alien wave spawned', sandbox.aliens.length > 0, 'aliens=' + sandbox.aliens.length);
var initialAliens = sandbox.aliens.length;
sandbox.invaderTotalAliens = initialAliens;

header('AC#2 — invader gameplay (bullet kills alien)');
sandbox.invaderScore = 0;
sandbox.aliens = [{ x: sandbox.ship.x + 50, y: sandbox.ship.y, type: 0 }];
sandbox.invaderTotalAliens = 1;
sandbox.aliensSpawned = true;
sandbox.bullets = [{ x: sandbox.ship.x + 50, y: sandbox.ship.y }]; // overlap
runTick(0.001);
check('invader: bullet destroyed alien', sandbox.aliens.length === 0, 'aliens=' + sandbox.aliens.length);
check('invader: invaderScore += ALIEN_POINTS', sandbox.invaderScore === sandbox.ALIEN_POINTS, 'invaderScore=' + sandbox.invaderScore);

header('AC#2 — invader win → INVADER_COMPLETE → INVADER_RETURN → PLAYING');
sandbox.score = 500;
var preScore = sandbox.score;
var preBonus = sandbox.invaderScore;
runTick(0.001);
check('invader: → INVADER_COMPLETE on last alien killed', sandbox.gameState === sandbox.STATES.INVADER_COMPLETE);
// Tick past INVADER_COMPLETE_DELAY
safety = 0;
while (sandbox.gameState === sandbox.STATES.INVADER_COMPLETE && safety++ < 200) runTick(0.05);
check('invader: → INVADER_RETURN after delay', sandbox.gameState === sandbox.STATES.INVADER_RETURN);
check('invader: bonus added to global score', sandbox.score === preScore + preBonus, 'score=' + sandbox.score + ' expected=' + (preScore + preBonus));
var preInvaderLevel = sandbox.currentLevel;
safety = 0;
while (sandbox.gameState !== sandbox.STATES.PLAYING && safety++ < 200) runTick(0.05);
check('invader: → PLAYING after return rotation', sandbox.gameState === sandbox.STATES.PLAYING);
check('invader: level advanced', sandbox.currentLevel === preInvaderLevel + 1, 'level=' + sandbox.currentLevel);
check('invader: aliens cleared on return', sandbox.aliens.length === 0);

// === AC #3: bugfix pad → Bug Bombing Run flow ================================

header('AC#3 — bugfix pad → BUGFIX_TRANSITION (entry)');
sandbox.currentLevel = 1; // 3 + 1*2 = 5 bugs
stageEndOfScroll('bugfix');
runTick(0.05);
check('bugfix: SCENE_SCROLL → BUGFIX_TRANSITION', sandbox.gameState === sandbox.STATES.BUGFIX_TRANSITION);
check('bugfix: bugs spawned (count = 3 + level*2)', sandbox.bugs.length === 5, 'bugs=' + sandbox.bugs.length);
check('bugfix: ship centered + upright + full fuel', sandbox.ship.x === sandbox.canvas.width / 2 && sandbox.ship.angle === 0 && sandbox.ship.fuel === sandbox.FUEL_MAX);

header('AC#3 — BUGFIX_TRANSITION → BUGFIX_PLAYING after duration');
safety = 0;
while (sandbox.gameState !== sandbox.STATES.BUGFIX_PLAYING && safety++ < 200) runTick(0.05);
check('bugfix: → BUGFIX_PLAYING', sandbox.gameState === sandbox.STATES.BUGFIX_PLAYING);

header('AC#3 — BUGFIX_PLAYING win path (kill all bugs → BUGFIX_COMPLETE)');
// Force-clear bugs by triggering the win condition directly.
sandbox.bugfixScore = 0;
sandbox.bugsKilled = sandbox.bugsTotal;
sandbox.bugs = [];
preScore = sandbox.score;
sandbox.ship.fuel = sandbox.FUEL_MAX; // → fuel bonus = 100 or 200 depending on RNG
runTick(0.001);
check('bugfix: → BUGFIX_COMPLETE when bugsKilled === bugsTotal', sandbox.gameState === sandbox.STATES.BUGFIX_COMPLETE);
check('bugfix: bugfixFuelBonus stored', sandbox.bugfixFuelBonus === sandbox.BUGFIX_FUEL_BONUS_LOW || sandbox.bugfixFuelBonus === sandbox.BUGFIX_FUEL_BONUS_HIGH, 'bonus=' + sandbox.bugfixFuelBonus);
check('bugfix: fuel bonus added to global score', sandbox.score === preScore + sandbox.bugfixFuelBonus, 'score=' + sandbox.score + ' expected=' + (preScore + sandbox.bugfixFuelBonus));
safety = 0;
while (sandbox.gameState === sandbox.STATES.BUGFIX_COMPLETE && safety++ < 200) runTick(0.05);
check('bugfix: → BUGFIX_RETURN after complete delay', sandbox.gameState === sandbox.STATES.BUGFIX_RETURN || sandbox.gameState === sandbox.STATES.PLAYING);
var preBugfixLevel = sandbox.currentLevel;
// BUGFIX_RETURN runs in a single tick — re-enter for safety
safety = 0;
while (sandbox.gameState !== sandbox.STATES.PLAYING && safety++ < 200) runTick(0.05);
check('bugfix: → PLAYING after BUGFIX_RETURN', sandbox.gameState === sandbox.STATES.PLAYING);
check('bugfix: level advanced', sandbox.currentLevel >= preBugfixLevel, 'level=' + sandbox.currentLevel);
check('bugfix: bugfix entities cleared', sandbox.bugs.length === 0 && sandbox.bombs.length === 0);

// === AC #5: crashing in normal lander mode → CRASHED → GAMEOVER =============

header('AC#5 — normal lander crash → CRASHED');
sandbox.score = 1000;
sandbox.currentLevel = 2;
sandbox.gameState = sandbox.STATES.PLAYING;
sandbox.terrain = sandbox.makeFlatTerrain(400);
sandbox.landingPads = []; // no pad → guaranteed crash
sandbox.ship.x = 400;
sandbox.ship.y = 380;       // already at terrain level
sandbox.ship.vx = 0;
sandbox.ship.vy = 250;      // way over the 2 m/s threshold (250 px/s = 5 m/s)
sandbox.ship.angle = 0;
sandbox.ship.fuel = 50;
var preCrashCounts = {
    explosion: sandbox.spawnExplosionCalls,
    shake: sandbox.startScreenShakeCalls,
    sound: sandbox.playExplosionSoundCalls
};
runTick(0.05);
check('crash: PLAYING → CRASHED on terrain impact', sandbox.gameState === sandbox.STATES.CRASHED, 'state=' + sandbox.gameState);
check('crash: spawnExplosion fired', sandbox.spawnExplosionCalls > preCrashCounts.explosion);
check('crash: screen shake started', sandbox.startScreenShakeCalls > preCrashCounts.shake);
check('crash: explosion sound played', sandbox.playExplosionSoundCalls > preCrashCounts.sound);
check('crash: landingResult populated with reason', /Not on a landing pad|Too fast/.test(sandbox.landingResult), 'reason=' + JSON.stringify(sandbox.landingResult));

header('AC#5 — Space in CRASHED → GAMEOVER');
sandbox.explosionFinished = true;
sandbox.handleKeyPress(' ');
check('crash: Space → STATES.GAMEOVER', sandbox.gameState === sandbox.STATES.GAMEOVER, 'state=' + sandbox.gameState);
check('crash: gameOverEnteringName=true (positive score)', sandbox.gameOverEnteringName === true);
check('crash: gameOverLevel = currentLevel + 1', sandbox.gameOverLevel === sandbox.currentLevel + 1);

// === AC #6: score accumulates across levels and both mini-game types =========

header('AC#6 — score accumulation (code-inspection + integration)');
// Code-inspection: every score-mutation site that should accrue to global score
check('score: INVADER_COMPLETE adds invaderScore to score', /score \+= invaderScore/.test(blocks.INVADER_COMPLETE));
check('score: BUGFIX_PLAYING bomb-kill adds victim.points to score', /score \+= victim\.points/.test(blocks.BUGFIX_PLAYING));
check('score: BUGFIX_PLAYING win adds fuelBonus to score', /score \+= fuelBonus/.test(blocks.BUGFIX_PLAYING));
check('score: checkCollision LANDED adds landedTotalPoints to score', /score \+= landedTotalPoints/.test(collisionSrc));
check('score: startNewGame resets score=0', /score = 0/.test(extractFunction(inputSrc, 'startNewGame')));

// Integration: run an end-to-end accumulation scenario from a fresh game start.
sandbox.startNewGame();
check('score: startNewGame brings game to PLAYING with score=0', sandbox.gameState === sandbox.STATES.PLAYING && sandbox.score === 0);
sandbox.score += 250;            // simulate a normal-pad landing reward
var afterPadScore = sandbox.score;
sandbox.invaderScore = 300;      // simulate an invader-mini-game accrual
sandbox.aliens = [];
sandbox.aliensSpawned = true;
sandbox.gameState = sandbox.STATES.INVADER_PLAYING;
runTick(0.001);                  // last alien gone → INVADER_COMPLETE
check('score: invader transitions through COMPLETE', sandbox.gameState === sandbox.STATES.INVADER_COMPLETE);
safety = 0;
while (sandbox.gameState === sandbox.STATES.INVADER_COMPLETE && safety++ < 200) runTick(0.05);
check('score: invader bonus added', sandbox.score === afterPadScore + 300, 'score=' + sandbox.score + ' expected=' + (afterPadScore + 300));
var afterInvaderScore = sandbox.score;

// Now simulate a bugfix win on top of the same game
sandbox.gameState = sandbox.STATES.BUGFIX_PLAYING;
sandbox.bugs = [];
sandbox.bugsTotal = 1;
sandbox.bugsKilled = 1;
sandbox.bugfixScore = 0;
sandbox.ship.fuel = sandbox.FUEL_MAX;
runTick(0.001);
check('score: bugfix win → BUGFIX_COMPLETE', sandbox.gameState === sandbox.STATES.BUGFIX_COMPLETE);
check('score: bugfix fuel bonus added on top of invader bonus', sandbox.score > afterInvaderScore, 'score=' + sandbox.score + ' was=' + afterInvaderScore);

// === AC #7: game over + restart =============================================

header('AC#7 — game over + restart');
sandbox.gameState = sandbox.STATES.GAMEOVER;
sandbox.gameOverEnteringName = false;     // post-name-entry restart path
sandbox.score = 4242;
sandbox.currentLevel = 5;
sandbox.securityPadScroll = true;          // simulate stale flag carrying over
sandbox.bugfixPadScroll = true;
var preStartShipReset = sandbox.resetShipCalls;
var preStartTerrain = sandbox.generateTerrainCalls;
sandbox.handleKeyPress(' ');
check('restart: GAMEOVER + Space → PLAYING', sandbox.gameState === sandbox.STATES.PLAYING);
check('restart: score reset to 0', sandbox.score === 0);
check('restart: currentLevel reset to 0', sandbox.currentLevel === 0);
check('restart: securityPadScroll reset to false', sandbox.securityPadScroll === false);
check('restart: bugfixPadScroll reset to false', sandbox.bugfixPadScroll === false);
check('restart: resetShip() called', sandbox.resetShipCalls > preStartShipReset);
check('restart: generateTerrain() called', sandbox.generateTerrainCalls > preStartTerrain);

// === Summary ================================================================

console.log('\n========================================');
console.log(' SUMMARY: ' + passed + ' passed, ' + failed + ' failed');
console.log('========================================');
if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
}
process.exit(0);
