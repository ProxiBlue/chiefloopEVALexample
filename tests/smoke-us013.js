// US-013: No-regression smoke test.
//
// Pure STATIC source-analysis test. Does not execute, eval, require, vm, or
// otherwise run any project source. For every acceptance criterion, it reads
// the relevant js/*.js file as a plain utf-8 string and verifies the code
// patterns that implement that AC are present at their expected locations.
//
// Run from the repo root:  node tests/smoke-us013.js
// Exits 0 on full pass, 1 on any failure. Per-AC trace is printed inline.
//
// Why static-only: a previous attempt used Node's `vm` to run extracted code
// blocks with interpolation. `vm` is documented as NOT a security boundary,
// and interpolating source text into a template literal is an injection
// vector. This rewrite removes both: the source files are only ever treated
// as data (regex-matched), never parsed as JS, never executed.

'use strict';

var fs = require('fs');
var path = require('path');

var REPO = path.resolve(__dirname, '..');

// Read a project source file as a plain string. We only ever .match / .indexOf
// against these strings — never eval, require, vm.runIn*, new Function, etc.
function readSource(relPath) {
    var full = path.join(REPO, relPath);
    return fs.readFileSync(full, 'utf8');
}

// Locate a top-level `if (gameState === STATES.NAME ...) { ... }` block via
// brace-walking and return the substring. Brace-walking (not regex) tolerates
// nested conditionals and loops inside the block.
function sliceStateBlock(source, stateKey) {
    var sig = 'if (gameState === STATES.' + stateKey;
    var start = source.indexOf(sig);
    if (start < 0) return null;
    var open = source.indexOf('{', start);
    if (open < 0) return null;
    var depth = 0;
    for (var i = open; i < source.length; i++) {
        var ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    return null;
}

// Locate a top-level `function NAME(...) { ... }` body string.
function sliceFunction(source, name) {
    var sig = 'function ' + name + '(';
    var start = source.indexOf(sig);
    if (start < 0) return null;
    var open = source.indexOf('{', start);
    if (open < 0) return null;
    var depth = 0;
    for (var i = open; i < source.length; i++) {
        var ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    return null;
}

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

console.log('========================================');
console.log(' US-013 NO-REGRESSION SMOKE TEST (static)');
console.log('========================================');

// --- Load sources as plain data ---------------------------------------------
var configSrc = readSource('js/config.js');
var collisionSrc = readSource('js/collision.js');
var inputSrc = readSource('js/input.js');
var updateSrc = readSource('js/update.js');
var renderSrc = readSource('js/render.js');

// --- State-machine sanity ----------------------------------------------------

header('STATES — required entries present in js/config.js');
[
    'MENU', 'PLAYING', 'LANDED', 'CRASHED', 'GAMEOVER',
    'SCENE_LIFTOFF', 'SCENE_SCROLL', 'SCENE_DESCENT', 'SCENE_COUNTDOWN',
    'INVADER_SCROLL_ROTATE', 'INVADER_TRANSITION', 'INVADER_PLAYING',
    'INVADER_COMPLETE', 'INVADER_RETURN',
    'BUGFIX_TRANSITION', 'BUGFIX_PLAYING', 'BUGFIX_COMPLETE', 'BUGFIX_RETURN'
].forEach(function (key) {
    var re = new RegExp('\\b' + key + ':\\s*[\'"]');
    check('STATES.' + key + ' declared', re.test(configSrc));
});

// --- AC#1, AC#4: feature / other pad → normal next-level (SCENE_DESCENT) ----

header('AC#1 / AC#4 — feature + other pads route through SCENE_DESCENT');
var sceneScrollBlock = sliceStateBlock(updateSrc, 'SCENE_SCROLL');
check('SCENE_SCROLL block present in update.js', sceneScrollBlock !== null);
// Routing fork uses wasInvaderScroll / wasBugfixScroll / else. feature & other
// hit the else branch → STATES.SCENE_DESCENT.
check('SCENE_SCROLL reads wasInvaderScroll flag', /wasInvaderScroll\s*=\s*sceneScrollState\.isInvaderScroll/.test(sceneScrollBlock));
check('SCENE_SCROLL reads wasBugfixScroll flag', /wasBugfixScroll\s*=\s*sceneScrollState\.isBugfixScroll/.test(sceneScrollBlock));
check('SCENE_SCROLL else → STATES.SCENE_DESCENT', /gameState\s*=\s*STATES\.SCENE_DESCENT/.test(sceneScrollBlock));
// REGRESSION GUARD: fuel must carry over across a normal-pad level transition.
// Extract just the normal-pad else branch by anchoring on the SCENE_DESCENT
// transition and walking backward to its nearest `} else {`.
var descentIdx = sceneScrollBlock.indexOf('STATES.SCENE_DESCENT');
var elseIdx = descentIdx >= 0 ? sceneScrollBlock.lastIndexOf('} else {', descentIdx) : -1;
var normalElseBranch = (elseIdx >= 0 && descentIdx > elseIdx)
    ? sceneScrollBlock.slice(elseIdx, descentIdx)
    : null;
check('SCENE_SCROLL normal-pad else branch isolated', normalElseBranch !== null);
if (normalElseBranch) {
    var stray = normalElseBranch.match(/ship\.fuel\s*=[^;]*/);
    check('REGRESSION: fuel is NOT reset in normal-pad else branch (carry-over)',
        stray === null,
        stray ? '(found: ' + stray[0] + ')' : '');
    check('REGRESSION: explanatory comment preserved',
        /Fuel carries over/.test(normalElseBranch));
}

check('SCENE_DESCENT block present in update.js', sliceStateBlock(updateSrc, 'SCENE_DESCENT') !== null);
check('SCENE_COUNTDOWN block present in update.js', sliceStateBlock(updateSrc, 'SCENE_COUNTDOWN') !== null);

// --- AC#2: security pad → invader mini-game (entry, gameplay, win/lose, return)

header('AC#2 — security pad routes through the full invader mini-game');
check('SCENE_SCROLL wasInvaderScroll → INVADER_SCROLL_ROTATE',
    /wasInvaderScroll[\s\S]*?gameState\s*=\s*STATES\.INVADER_SCROLL_ROTATE/.test(sceneScrollBlock));

// input.js sets the flag from landedPRType === 'security' at spacebar-from-LANDED
check('input.js sets securityPadScroll = (landedPRType === \'security\')',
    /securityPadScroll\s*=\s*\(landedPRType\s*===\s*['"]security['"]\)/.test(inputSrc));

// Each invader phase block must exist
['INVADER_SCROLL_ROTATE', 'INVADER_TRANSITION', 'INVADER_PLAYING', 'INVADER_COMPLETE', 'INVADER_RETURN'].forEach(function (k) {
    var b = sliceStateBlock(updateSrc, k);
    check('update.js block for STATES.' + k, b !== null);
});

var invaderCompleteBlock = sliceStateBlock(updateSrc, 'INVADER_COMPLETE');
check('INVADER_COMPLETE adds invaderScore to global score',
    invaderCompleteBlock && /score\s*\+=\s*invaderScore/.test(invaderCompleteBlock));
check('INVADER_COMPLETE → INVADER_RETURN after delay',
    invaderCompleteBlock && /gameState\s*=\s*STATES\.INVADER_RETURN/.test(invaderCompleteBlock));

var invaderReturnBlock = sliceStateBlock(updateSrc, 'INVADER_RETURN');
check('INVADER_RETURN clears aliens + bullets',
    invaderReturnBlock && /aliens\s*=\s*\[\]/.test(invaderReturnBlock) && /bullets\s*=\s*\[\]/.test(invaderReturnBlock));
check('INVADER_RETURN advances currentLevel',
    invaderReturnBlock && /currentLevel\+\+/.test(invaderReturnBlock));
check('INVADER_RETURN resets ship + wind + terrain',
    invaderReturnBlock && /resetShip\s*\(\s*\)/.test(invaderReturnBlock)
        && /resetWind\s*\(\s*\)/.test(invaderReturnBlock)
        && /generateTerrain\s*\(\s*\)/.test(invaderReturnBlock));
check('INVADER_RETURN → PLAYING',
    invaderReturnBlock && /gameState\s*=\s*STATES\.PLAYING/.test(invaderReturnBlock));

// Gameplay + end condition for invader. By design the invader wave auto-completes
// when all aliens are gone (destroyed OR scrolled off the left edge) — there is
// no separate CRASHED transition from INVADER_PLAYING; that's the original
// pre-bugfix behavior and we verify it has not regressed.
var invaderPlayingBlock = sliceStateBlock(updateSrc, 'INVADER_PLAYING');
check('INVADER_PLAYING: bullet-alien collision increments invaderScore',
    invaderPlayingBlock && /invaderScore\s*\+=\s*ALIEN_POINTS/.test(invaderPlayingBlock));
check('INVADER_PLAYING: end condition → INVADER_COMPLETE when all aliens gone',
    invaderPlayingBlock
        && /aliensSpawned\s*&&\s*aliens\.length\s*===\s*0/.test(invaderPlayingBlock)
        && /gameState\s*=\s*STATES\.INVADER_COMPLETE/.test(invaderPlayingBlock));

// --- AC#3: bugfix pad → Bug Bombing Run flow --------------------------------

header('AC#3 — bugfix pad routes through the new Bug Bombing Run');
check('SCENE_SCROLL wasBugfixScroll → BUGFIX_TRANSITION',
    /wasBugfixScroll[\s\S]*?gameState\s*=\s*STATES\.BUGFIX_TRANSITION/.test(sceneScrollBlock));
check('SCENE_SCROLL wasBugfixScroll calls spawnBugWave()',
    /wasBugfixScroll[\s\S]*?spawnBugWave\s*\(\s*\)[\s\S]*?gameState\s*=\s*STATES\.BUGFIX_TRANSITION/.test(sceneScrollBlock));
check('SCENE_SCROLL wasBugfixScroll refills fuel (ship.fuel = FUEL_MAX)',
    /wasBugfixScroll[\s\S]*?ship\.fuel\s*=\s*FUEL_MAX[\s\S]*?gameState\s*=\s*STATES\.BUGFIX_TRANSITION/.test(sceneScrollBlock));
check('input.js sets bugfixPadScroll = (landedPRType === \'bugfix\')',
    /bugfixPadScroll\s*=\s*\(landedPRType\s*===\s*['"]bugfix['"]\)/.test(inputSrc));

var bugfixTransitionBlock = sliceStateBlock(updateSrc, 'BUGFIX_TRANSITION');
check('BUGFIX_TRANSITION block present', bugfixTransitionBlock !== null);
check('BUGFIX_TRANSITION → BUGFIX_PLAYING after duration',
    bugfixTransitionBlock && /gameState\s*=\s*STATES\.BUGFIX_PLAYING/.test(bugfixTransitionBlock));

var bugfixPlayingBlock = sliceStateBlock(updateSrc, 'BUGFIX_PLAYING');
check('BUGFIX_PLAYING block present', bugfixPlayingBlock !== null);
check('BUGFIX_PLAYING: bomb-kill adds victim.points to both bugfixScore and score',
    bugfixPlayingBlock
        && /bugfixScore\s*\+=\s*victim\.points/.test(bugfixPlayingBlock)
        && /score\s*\+=\s*victim\.points/.test(bugfixPlayingBlock));
check('BUGFIX_PLAYING: win condition uses guarded source-state check',
    bugfixPlayingBlock && /gameState\s*===\s*STATES\.BUGFIX_PLAYING[^\)]*bugsTotal\s*>\s*0[^\)]*bugsKilled\s*>=\s*bugsTotal/.test(bugfixPlayingBlock));
check('BUGFIX_PLAYING: win path → BUGFIX_COMPLETE and adds fuelBonus to score',
    bugfixPlayingBlock
        && /gameState\s*=\s*STATES\.BUGFIX_COMPLETE/.test(bugfixPlayingBlock)
        && /score\s*\+=\s*fuelBonus/.test(bugfixPlayingBlock));
check('BUGFIX_PLAYING: lose path via checkCollision() routes to CRASHED',
    bugfixPlayingBlock && /checkCollision\s*\(\s*\)/.test(bugfixPlayingBlock));
check('BUGFIX_PLAYING: ship-vs-bug crash path (crashShipInBugfix)',
    bugfixPlayingBlock && /crashShipInBugfix\s*\(/.test(bugfixPlayingBlock));
check('BUGFIX_PLAYING: CRASHED branch clears bugfix state on loss',
    bugfixPlayingBlock && /gameState\s*===\s*STATES\.CRASHED[\s\S]*?clearBugfixState\s*\(\s*\)/.test(bugfixPlayingBlock));

var bugfixCompleteBlock = sliceStateBlock(updateSrc, 'BUGFIX_COMPLETE');
check('BUGFIX_COMPLETE block present', bugfixCompleteBlock !== null);
check('BUGFIX_COMPLETE → BUGFIX_RETURN after delay',
    bugfixCompleteBlock && /gameState\s*=\s*STATES\.BUGFIX_RETURN/.test(bugfixCompleteBlock));

var bugfixReturnBlock = sliceStateBlock(updateSrc, 'BUGFIX_RETURN');
check('BUGFIX_RETURN block present', bugfixReturnBlock !== null);
check('BUGFIX_RETURN clears bugfix state',
    bugfixReturnBlock && /clearBugfixState\s*\(\s*\)/.test(bugfixReturnBlock));
check('BUGFIX_RETURN advances currentLevel',
    bugfixReturnBlock && /currentLevel\+\+/.test(bugfixReturnBlock));
check('BUGFIX_RETURN resets ship + wind + terrain',
    bugfixReturnBlock
        && /resetShip\s*\(\s*\)/.test(bugfixReturnBlock)
        && /resetWind\s*\(\s*\)/.test(bugfixReturnBlock)
        && /generateTerrain\s*\(\s*\)/.test(bugfixReturnBlock));
check('BUGFIX_RETURN → PLAYING',
    bugfixReturnBlock && /gameState\s*=\s*STATES\.PLAYING/.test(bugfixReturnBlock));

// Helper functions US-013 relies on
check('js/update.js exports helper: spawnBugWave',
    sliceFunction(updateSrc, 'spawnBugWave') !== null);
check('js/update.js exports helper: spawnAlienWave',
    sliceFunction(updateSrc, 'spawnAlienWave') !== null);
check('js/update.js exports helper: crashShipInBugfix',
    sliceFunction(updateSrc, 'crashShipInBugfix') !== null);
check('js/update.js exports helper: clearBugfixState',
    sliceFunction(updateSrc, 'clearBugfixState') !== null);

// --- AC#5: crashing in normal lander mode → CRASHED → GAMEOVER --------------

header('AC#5 — normal lander crash routes CRASHED → GAMEOVER');
var checkCollisionFn = sliceFunction(collisionSrc, 'checkCollision');
check('collision.js exports checkCollision', checkCollisionFn !== null);
check('checkCollision: crash branch → STATES.CRASHED',
    checkCollisionFn && /gameState\s*=\s*STATES\.CRASHED/.test(checkCollisionFn));
check('checkCollision: crash branch spawnExplosion()',
    checkCollisionFn && /spawnExplosion\s*\(/.test(checkCollisionFn));
check('checkCollision: crash branch startScreenShake()',
    checkCollisionFn && /startScreenShake\s*\(\s*\)/.test(checkCollisionFn));
check('checkCollision: crash branch playExplosionSound()',
    checkCollisionFn && /playExplosionSound\s*\(\s*\)/.test(checkCollisionFn));
check('checkCollision: success branch → STATES.LANDED',
    checkCollisionFn && /gameState\s*=\s*STATES\.LANDED/.test(checkCollisionFn));

// PLAYING block must call checkCollision — otherwise nothing routes to CRASHED.
var playingBlock = sliceStateBlock(updateSrc, 'PLAYING');
check('PLAYING block calls checkCollision()',
    playingBlock && /checkCollision\s*\(\s*\)/.test(playingBlock));

// input.js Space-in-CRASHED path → STATES.GAMEOVER (with name-entry gating)
var handleKeyPressFn = sliceFunction(inputSrc, 'handleKeyPress');
check('input.js exports handleKeyPress', handleKeyPressFn !== null);
check('handleKeyPress: CRASHED + explosionFinished + Space → GAMEOVER',
    handleKeyPressFn
        && /gameState\s*===\s*STATES\.CRASHED\s*&&\s*explosionFinished[\s\S]*?gameState\s*=\s*STATES\.GAMEOVER/.test(handleKeyPressFn));
check('handleKeyPress: positive-score path enables name entry',
    handleKeyPressFn && /score\s*>\s*0[\s\S]*?gameOverEnteringName\s*=\s*true/.test(handleKeyPressFn));
check('handleKeyPress: gameOverLevel = currentLevel + 1',
    handleKeyPressFn && /gameOverLevel\s*=\s*currentLevel\s*\+\s*1/.test(handleKeyPressFn));

// --- AC#6: score accumulates across levels AND across both mini-game types --

header('AC#6 — score accumulation sites intact');
check('checkCollision: successful land adds landedTotalPoints to score',
    checkCollisionFn && /score\s*\+=\s*landedTotalPoints/.test(checkCollisionFn));
check('INVADER_COMPLETE: score += invaderScore',
    invaderCompleteBlock && /score\s*\+=\s*invaderScore/.test(invaderCompleteBlock));
check('BUGFIX_PLAYING: score += victim.points (per-bug kill)',
    bugfixPlayingBlock && /score\s*\+=\s*victim\.points/.test(bugfixPlayingBlock));
check('BUGFIX_PLAYING: score += fuelBonus (win bonus)',
    bugfixPlayingBlock && /score\s*\+=\s*fuelBonus/.test(bugfixPlayingBlock));
// The only reset point is startNewGame (not per-level).
var startNewGameFn = sliceFunction(inputSrc, 'startNewGame');
check('startNewGame: score = 0', startNewGameFn && /score\s*=\s*0/.test(startNewGameFn));
// Score is read by renderer (HUD shows running total).
check('render.js references `score` for HUD',
    /\bscore\b/.test(renderSrc));

// --- AC#7: game over + restart ---------------------------------------------

header('AC#7 — game over → restart clears state cleanly');
check('handleKeyPress: GAMEOVER + !gameOverEnteringName + Space → startNewGame()',
    handleKeyPressFn && /gameState\s*===\s*STATES\.GAMEOVER\s*&&\s*!gameOverEnteringName[\s\S]*?startNewGame\s*\(\s*\)/.test(handleKeyPressFn));
check('startNewGame: resets currentLevel = 0',
    startNewGameFn && /currentLevel\s*=\s*0/.test(startNewGameFn));
check('startNewGame: resets securityPadScroll = false',
    startNewGameFn && /securityPadScroll\s*=\s*false/.test(startNewGameFn));
check('startNewGame: resets bugfixPadScroll = false (REGRESSION — new variant)',
    startNewGameFn && /bugfixPadScroll\s*=\s*false/.test(startNewGameFn));
check('startNewGame: calls resetShip() + resetWind() + generateTerrain()',
    startNewGameFn
        && /resetShip\s*\(\s*\)/.test(startNewGameFn)
        && /resetWind\s*\(\s*\)/.test(startNewGameFn)
        && /generateTerrain\s*\(\s*\)/.test(startNewGameFn));
check('startNewGame: sets gameState = STATES.PLAYING',
    startNewGameFn && /gameState\s*=\s*STATES\.PLAYING/.test(startNewGameFn));

// --- AC#2, AC#3 render parity -----------------------------------------------

header('Render switch has every player-visible state routed');
// render() switch must dispatch every visible state so none shows a blank canvas.
['PLAYING', 'LANDED', 'CRASHED', 'GAMEOVER',
    'SCENE_LIFTOFF', 'SCENE_SCROLL', 'SCENE_DESCENT', 'SCENE_COUNTDOWN',
    'INVADER_SCROLL_ROTATE', 'INVADER_TRANSITION', 'INVADER_PLAYING',
    'INVADER_COMPLETE', 'INVADER_RETURN',
    'BUGFIX_TRANSITION', 'BUGFIX_PLAYING', 'BUGFIX_COMPLETE', 'BUGFIX_RETURN'
].forEach(function (k) {
    var re = new RegExp('case\\s+STATES\\.' + k + '\\s*:');
    check('render.js case STATES.' + k, re.test(renderSrc));
});

// --- Summary ----------------------------------------------------------------

console.log('\n========================================');
console.log(' SUMMARY: ' + passed + ' passed, ' + failed + ' failed');
console.log('========================================');
if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
}
process.exit(0);
