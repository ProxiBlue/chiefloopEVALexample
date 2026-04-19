// US-013 (Code Breaker): Retro sound effects for the Breakout experience.
//
// Pure STATIC source-analysis test. Reads the modified js/*.js files as
// plain strings and verifies each acceptance criterion's audio definition
// and wire-up are present. No eval, no require of project sources, no vm.
//
// Acceptance criteria mapped (.chief/prds/codebreaker/prd.md US-013):
//   AC#1  Ball-paddle bounce — square wave, 440Hz, 0.05s; wired into both
//         primary-ball and extra-ball paddle-collision branches.
//   AC#2  Ball-brick hit (no destroy) — 660Hz, 0.04s; wired into the brick
//         "damaged" branch for primary + extra balls.
//   AC#3  Brick destroyed — short bandpass-filtered noise burst, 0.1s; pitch
//         varies per call. Wired into the brick "hp <= 0" branch.
//   AC#4  Ball-wall bounce — 220Hz, 0.02s; quiet tick. Wired into the
//         left/right/top wall-reflection branches for primary + extra balls.
//   AC#5  Power-up collected — ascending two-note chime (existing
//         playBreakoutPowerupSound, wired in activateBreakoutPowerup).
//   AC#6  Ball lost — sine frequency sweep 400→100Hz, 0.3s; wired into
//         loseBreakoutBall.
//   AC#7  All bricks cleared — three ascending sine notes; wired into the
//         BREAKOUT_COMPLETE entry branch.
//   AC#8  All sounds via Web Audio API; fresh nodes per call so rapid
//         bounces don't share state (no glitches).
//
// Run:  node tests/smoke-breakout-us013.js
// Exits 0 on full pass, 1 on any failure.

'use strict';

var fs = require('fs');
var path = require('path');

var REPO = path.resolve(__dirname, '..');

function readSource(relPath) {
    return fs.readFileSync(path.join(REPO, relPath), 'utf8');
}

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

// Locate a top-level `if (gameState === STATES.NAME ...) { ... }` block.
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
console.log(' US-013 (breakout) SMOKE TEST');
console.log('========================================');

var audioSrc = readSource('js/audio.js');
var updateSrc = readSource('js/update.js');
var playingBlock = sliceStateBlock(updateSrc, 'BREAKOUT_PLAYING');
check('BREAKOUT_PLAYING block exists in update.js', playingBlock !== null);

// ===== AC#1 — Ball-paddle bounce =====
header('AC#1 — ball-paddle bounce: 440Hz square blip, 0.05s');
var paddleFn = sliceFunction(audioSrc, 'playBreakoutPaddleBounceSound');
check('playBreakoutPaddleBounceSound defined', paddleFn !== null);
check('AC#1 uses square wave', /osc\.type\s*=\s*['"]square['"]/.test(paddleFn || ''));
check('AC#1 sets 440Hz',
    /setValueAtTime\s*\(\s*440\s*,/.test(paddleFn || ''));
check('AC#1 stops within ~0.05-0.06s',
    /osc\.stop\s*\(\s*t\s*\+\s*0\.0[56]/.test(paddleFn || ''));
// Wire-up: primary ball (inside paddle-collision block)
check('AC#1 wired into primary-ball paddle-collision branch',
    /breakoutBallY\s*=\s*paddleTop\s*-\s*BREAKOUT_BALL_RADIUS;\s*[\s\S]{0,200}?playBreakoutPaddleBounceSound\s*\(/.test(playingBlock || ''));
// Wire-up: extra ball paddle-collision branch
check('AC#1 wired into extra-ball paddle-collision branch',
    /eb\.y\s*=\s*paddleTopXb\s*-\s*BREAKOUT_BALL_RADIUS;\s*[\s\S]{0,200}?playBreakoutPaddleBounceSound\s*\(/.test(playingBlock || ''));

// ===== AC#2 — Brick hit (non-destroy) =====
header('AC#2 — brick hit (non-destroy): 660Hz, 0.04s');
var brickHitFn = sliceFunction(audioSrc, 'playBreakoutBrickHitSound');
check('playBreakoutBrickHitSound defined', brickHitFn !== null);
check('AC#2 uses square wave', /osc\.type\s*=\s*['"]square['"]/.test(brickHitFn || ''));
check('AC#2 sets 660Hz',
    /setValueAtTime\s*\(\s*660\s*,/.test(brickHitFn || ''));
check('AC#2 stops within ~0.04-0.05s',
    /osc\.stop\s*\(\s*t\s*\+\s*0\.0[45]/.test(brickHitFn || ''));
// Wire-up: inside the "brick damaged" else-branch (flashTimer set, hp > 0).
check('AC#2 wired into primary-ball "damaged" branch',
    /brick\.flashTimer\s*=\s*0\.12;\s*[\s\S]{0,200}?playBreakoutBrickHitSound\s*\(/.test(playingBlock || ''));
check('AC#2 wired into extra-ball "damaged" branch',
    /ebBrick\.flashTimer\s*=\s*0\.12;\s*[\s\S]{0,200}?playBreakoutBrickHitSound\s*\(/.test(playingBlock || ''));

// ===== AC#3 — Brick destroyed =====
header('AC#3 — brick destroyed: noise burst w/ bandpass, 0.1s, pitch variety');
var destroyFn = sliceFunction(audioSrc, 'playBreakoutBrickDestroySound');
check('playBreakoutBrickDestroySound defined', destroyFn !== null);
check('AC#3 uses bandpass filter',
    /type\s*=\s*['"]bandpass['"]/.test(destroyFn || ''));
check('AC#3 sources audio via createNoiseBuffer',
    /createNoiseBuffer\s*\(/.test(destroyFn || ''));
check('AC#3 uses Math.random for pitch variety',
    /Math\.random\s*\(\)/.test(destroyFn || ''));
check('AC#3 stops within ~0.10-0.12s',
    /noise\.stop\s*\(\s*t\s*\+\s*0\.1[0-2]/.test(destroyFn || ''));
// Wire-up: inside the "brick destroyed" branch (after spawnBreakoutBrickParticles).
check('AC#3 wired into primary-ball destroy branch',
    /spawnBreakoutBrickParticles\s*\([\s\S]{0,200}?\);\s*[\s\S]{0,200}?playBreakoutBrickDestroySound\s*\(/.test(playingBlock || ''));
// Both occurrences: count by matching the call
var destroyCalls = (playingBlock || '').match(/playBreakoutBrickDestroySound\s*\(/g) || [];
check('AC#3 destroy-sound hook fires in both primary + extra-ball branches',
    destroyCalls.length >= 2, 'matches=' + destroyCalls.length);

// ===== AC#4 — Ball-wall bounce =====
header('AC#4 — ball-wall bounce: 220Hz tick, 0.02s');
var wallFn = sliceFunction(audioSrc, 'playBreakoutWallBounceSound');
check('playBreakoutWallBounceSound defined', wallFn !== null);
check('AC#4 sets 220Hz',
    /setValueAtTime\s*\(\s*220\s*,/.test(wallFn || ''));
check('AC#4 stops within ~0.02-0.03s',
    /osc\.stop\s*\(\s*t\s*\+\s*0\.0[23]/.test(wallFn || ''));
// Low gain so it's "quiet"
check('AC#4 low gain (<= 0.06) for "quiet" tick',
    /linearRampToValueAtTime\s*\(\s*0\.0[0-6]/.test(wallFn || ''));
// Wire-up: both primary and extra-ball wall-reflection blocks.
check('AC#4 wired into primary-ball wall-reflection branch',
    /pbWallBounced[\s\S]{0,200}?playBreakoutWallBounceSound\s*\(/.test(playingBlock || ''));
check('AC#4 wired into extra-ball wall-reflection branch',
    /ebWallBounced[\s\S]{0,200}?playBreakoutWallBounceSound\s*\(/.test(playingBlock || ''));

// ===== AC#5 — Power-up collected =====
header('AC#5 — power-up collected: ascending two-note chime (existing)');
var powerupFn = sliceFunction(audioSrc, 'playBreakoutPowerupSound');
check('playBreakoutPowerupSound defined', powerupFn !== null);
check('AC#5 has two notes at ascending frequencies',
    /freq:\s*660[\s\S]*?freq:\s*990/.test(powerupFn || ''));
check('AC#5 wired in activateBreakoutPowerup',
    /playBreakoutPowerupSound\s*\(/.test(sliceFunction(updateSrc, 'activateBreakoutPowerup') || ''));

// ===== AC#6 — Ball lost =====
header('AC#6 — ball lost: 400→100Hz sine sweep, 0.3s');
var ballLostFn = sliceFunction(audioSrc, 'playBreakoutBallLostSound');
check('playBreakoutBallLostSound defined', ballLostFn !== null);
check('AC#6 uses sine wave',
    /osc\.type\s*=\s*['"]sine['"]/.test(ballLostFn || ''));
check('AC#6 starts at 400Hz',
    /setValueAtTime\s*\(\s*400\s*,/.test(ballLostFn || ''));
check('AC#6 sweeps to 100Hz',
    /exponentialRampToValueAtTime\s*\(\s*100\s*,\s*t\s*\+\s*0\.3\s*\)/.test(ballLostFn || ''));
check('AC#6 total duration ~0.3s',
    /osc\.stop\s*\(\s*t\s*\+\s*0\.3/.test(ballLostFn || ''));
check('AC#6 wired in loseBreakoutBall',
    /playBreakoutBallLostSound\s*\(/.test(sliceFunction(updateSrc, 'loseBreakoutBall') || ''));

// ===== AC#7 — Victory (all bricks cleared) =====
header('AC#7 — victory: three ascending notes');
var victoryFn = sliceFunction(audioSrc, 'playBreakoutVictorySound');
check('playBreakoutVictorySound defined', victoryFn !== null);
// Three notes = C5, E5, G5 (523.25, 659.25, 783.99). The test keys on the
// array literal — pattern matches the landing/chime arrangement.
check('AC#7 has three ascending note frequencies',
    /523\.25[\s\S]*?659\.25[\s\S]*?783\.99/.test(victoryFn || ''));
check('AC#7 uses sine wave (reuses landing chime pattern)',
    /osc\.type\s*=\s*['"]sine['"]/.test(victoryFn || ''));
// Wire-up: inside the BREAKOUT_PLAYING win branch (after spawnCelebration).
check('AC#7 wired in BREAKOUT_PLAYING win branch',
    /spawnCelebration\s*\([\s\S]{0,300}?\);\s*[\s\S]{0,200}?playBreakoutVictorySound\s*\(/.test(playingBlock || ''));

// ===== AC#8 — Web Audio + no glitches on rapid bounces =====
header('AC#8 — Web Audio; fresh nodes per call (rapid-bounce safe)');
var fns = [paddleFn, brickHitFn, destroyFn, wallFn, ballLostFn, victoryFn];
var fnNames = [
    'playBreakoutPaddleBounceSound',
    'playBreakoutBrickHitSound',
    'playBreakoutBrickDestroySound',
    'playBreakoutWallBounceSound',
    'playBreakoutBallLostSound',
    'playBreakoutVictorySound'
];
fns.forEach(function (fn, i) {
    var name = fnNames[i];
    check('AC#8 ' + name + ': uses ensureAudioCtx()',
        /ensureAudioCtx\s*\(\)/.test(fn || ''));
    check('AC#8 ' + name + ': creates its own gain node',
        /createGain\s*\(\)/.test(fn || ''));
    check('AC#8 ' + name + ': creates its own source node',
        /createOscillator\s*\(\)|createBufferSource\s*\(\)/.test(fn || ''));
});
// No shared module-level state for per-event sounds (no shared oscillator refs
// like thrustOsc). Cross-check: the new functions don't write to module-level
// variables that persist between calls.
check('AC#8 no shared oscillator state leaks across paddle-bounce calls',
    !/^\s*(var|let)\s+paddleBounceOsc/m.test(audioSrc));
check('AC#8 no shared oscillator state leaks across wall-bounce calls',
    !/^\s*(var|let)\s+wallBounceOsc/m.test(audioSrc));

// ===== summary =====
console.log('\n========================================');
console.log(' RESULTS: ' + passed + ' passed, ' + failed + ' failed');
console.log('========================================');
if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
}
process.exit(0);
