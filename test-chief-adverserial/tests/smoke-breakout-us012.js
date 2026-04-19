// US-012 (Code Breaker): Render paddle, ball, bricks, power-ups, and HUD.
//
// Acceptance criteria mapped (.chief/prds/codebreaker/prd.md):
//   AC#1  js/render.js contains a BREAKOUT_* rendering branch.
//   AC#2  Paddle: M upside-down, scaled to BREAKOUT_PADDLE_WIDTH, orange
//         (#f26322), with a faint glow below the paddle.
//   AC#3  Ball: white circle with a short trail (3-4 previous positions at
//         decreasing opacity); fireball state renders red/orange with a flame
//         trail.
//   AC#4  Bricks: rounded rects with BREAKOUT_BRICK_GAP spacing; colours
//         #4CAF50/#FFC107/#F44336; labels in monospace; damaged bricks show a
//         diagonal crack overlay.
//   AC#5  Power-ups: small rounded rects, colour-coded, with letter + label.
//   AC#6  Particles: brick destruction spawns a burst; ball loss spawns a
//         downward shower.
//   AC#7  Background: starfield only (no terrain).
//   AC#8  HUD during BREAKOUT_*: bricks remaining, extra balls, active
//         power-up (with timer bar if timed), score. Replaces the altitude
//         panel. Wired for transition/playing/complete/return.
//
// Run:  node tests/smoke-breakout-us012.js
// Exits 0 on pass, 1 on any failure.

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.resolve(__dirname, '..');
var results = [];
function check(name, ok, detail) {
    results.push({ name: name, ok: !!ok, detail: detail || '' });
    console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name +
        (ok ? '' : ' :: ' + (detail || '')));
}

function loadFile(relPath) {
    return fs.readFileSync(path.join(REPO, relPath), 'utf8');
}

var configSrc = loadFile('js/config.js');
var updateSrc = loadFile('js/update.js');
var renderSrc = loadFile('js/render.js');

// ===== AC#1 — BREAKOUT_* states are routed in render() switch =====
check('AC#1 render.js: switch has case STATES.BREAKOUT_TRANSITION',
    /case\s+STATES\.BREAKOUT_TRANSITION\s*:/.test(renderSrc));
check('AC#1 render.js: switch has case STATES.BREAKOUT_PLAYING',
    /case\s+STATES\.BREAKOUT_PLAYING\s*:/.test(renderSrc));
check('AC#1 render.js: switch has case STATES.BREAKOUT_COMPLETE',
    /case\s+STATES\.BREAKOUT_COMPLETE\s*:/.test(renderSrc));
check('AC#1 render.js: switch has case STATES.BREAKOUT_RETURN',
    /case\s+STATES\.BREAKOUT_RETURN\s*:/.test(renderSrc));
check('AC#1 render.js: renderBreakoutReturn is defined',
    /function\s+renderBreakoutReturn\s*\(/.test(renderSrc));

// ===== AC#2 — Paddle: upside-down M scaled to BREAKOUT_PADDLE_WIDTH + glow =====
// The renderer draws the ship at the current (animated) ship.angle, and sizes
// it via `breakoutPaddleWidth / LOGO_DRAW_RATIO` so the sprite matches the
// (possibly Wide-scaled) hitbox. The Code Breaker update code pins
// ship.angle = Math.PI during PLAYING, which is the 180° rotation.
check('AC#2 render.js: paddle drawn by drawShip at paddleDrawSize',
    /drawShip\s*\(\s*ship\.x\s*,\s*ship\.y\s*,\s*ship\.angle\s*,\s*paddleDrawSize/.test(renderSrc));
check('AC#2 render.js: paddleDrawSize derives from breakoutPaddleWidth',
    /paddleDrawSize\s*=\s*breakoutPaddleWidth\s*\/\s*LOGO_DRAW_RATIO/.test(renderSrc));
check('AC#2 render.js: paddle glow uses radial gradient centred near paddle',
    /createRadialGradient\s*\([^)]*glowCenterX/.test(renderSrc) ||
    /createRadialGradient[\s\S]*?paddleGlow/.test(renderSrc));
check('AC#2 render.js: paddle glow uses the ship\'s orange hue (rgba)',
    /rgba\(\s*242\s*,\s*99\s*,\s*34/.test(renderSrc));

// ===== AC#3 — Ball + trail + fireball treatment =====
check('AC#3 render.js: drawBreakoutBallTrail helper is defined',
    /function\s+drawBreakoutBallTrail\s*\(/.test(renderSrc));
check('AC#3 render.js: trail fades via globalAlpha based on position index',
    /globalAlpha\s*=\s*[^;]*fade/.test(renderSrc));
check('AC#3 render.js: trail branches to fire palette when fireActive',
    /fireActive\s*\)\s*\{[\s\S]*?'#FF6F00'|fireActive[\s\S]*?'#FFC107'/.test(renderSrc));
check('AC#3 render.js: primary ball white (#fff) when not on fire',
    /fireOn\s*\?\s*'#F44336'\s*:\s*'#fff'/.test(renderSrc));
check('AC#3 config.js: ball trail length is 3..4 (AC-exact range)',
    /BREAKOUT_BALL_TRAIL_LEN\s*=\s*([34])\s*;/.test(configSrc));
check('AC#3 config.js: breakoutBallTrail module-level array present',
    /var\s+breakoutBallTrail\s*=\s*\[\s*\]/.test(configSrc));

// Runtime check: ball trail fills up as physics runs.
var rngQueue = [];
function nextRandom() {
    return rngQueue.length > 0 ? rngQueue.shift() : 0.5;
}
var sandbox = {
    console: console, Object: Object, Array: Array, Number: Number,
    String: String, Boolean: Boolean, JSON: JSON, Date: Date,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    keys: {},
};
sandbox.Math = Object.create(Math);
sandbox.Math.random = nextRandom;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(configSrc, sandbox, { filename: 'js/config.js' });
sandbox.SHIP_SIZE = 40;
sandbox.spawnExplosion = function () {};
sandbox.startScreenShake = function () {};
sandbox.stopThrustSound = function () {};
sandbox.playExplosionSound = function () {};
sandbox.playBreakoutPowerupSound = function () {};
sandbox.spawnCelebration = function () {};
sandbox.updateCelebration = function () {};
sandbox.landingResult = '';

function extractFunction(src, sig) {
    var start = src.indexOf(sig);
    if (start < 0) return null;
    var open = src.indexOf('{', start);
    var depth = 0;
    for (var i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    return null;
}
function extractBlock(src, sig) {
    var start = src.indexOf(sig);
    if (start < 0) return { body: null };
    var open = src.indexOf('{', start + sig.length - 1);
    var depth = 0;
    for (var i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return { body: src.slice(open + 1, i) };
        }
    }
    return { body: null };
}

var particlesSrc = extractFunction(updateSrc, 'function spawnBreakoutBrickParticles(');
var lossParticlesSrc = extractFunction(updateSrc, 'function spawnBreakoutBallLossParticles(');
var activateSrc = extractFunction(updateSrc, 'function activateBreakoutPowerup(');
var crashSrc = extractFunction(updateSrc, 'function crashShipInBreakout(');
var loseSrc = extractFunction(updateSrc, 'function loseBreakoutBall(');
var clearSrc = extractFunction(updateSrc, 'function clearBreakoutState(');

check('AC#6 update.js: spawnBreakoutBallLossParticles() helper defined',
    !!lossParticlesSrc);

if (particlesSrc) vm.runInContext(particlesSrc, sandbox);
if (lossParticlesSrc) vm.runInContext(lossParticlesSrc, sandbox);
if (activateSrc) vm.runInContext(activateSrc, sandbox);
if (crashSrc) vm.runInContext(crashSrc, sandbox);
if (loseSrc) vm.runInContext(loseSrc, sandbox);
if (clearSrc) vm.runInContext(clearSrc, sandbox);

var playing = extractBlock(updateSrc, 'if (gameState === STATES.BREAKOUT_PLAYING) {');
check('update.js: BREAKOUT_PLAYING block located', playing.body !== null);

// Source-level: BREAKOUT_PLAYING integrates ball trail each frame.
check('AC#3 BREAKOUT_PLAYING pushes current position onto breakoutBallTrail',
    /breakoutBallTrail\.unshift\s*\(\s*\{\s*x\s*:\s*breakoutBallX\s*,\s*y\s*:\s*breakoutBallY/.test(playing.body));
check('AC#3 BREAKOUT_PLAYING caps trail to BREAKOUT_BALL_TRAIL_LEN',
    /breakoutBallTrail\.length\s*=\s*BREAKOUT_BALL_TRAIL_LEN/.test(playing.body));
check('AC#3 BREAKOUT_PLAYING pushes extra-ball positions onto per-ball trail',
    /eb\.trail\.unshift/.test(playing.body));

// Runtime replay.
var replay = new vm.Script(
    '(function () {\n' + playing.body + '\n}).call(this);');
function stepFrames(n) {
    for (var k = 0; k < n; k++) {
        if (sandbox.gameState !== sandbox.STATES.BREAKOUT_PLAYING) break;
        replay.runInContext(sandbox);
    }
}
function resetWorld() {
    sandbox.gameState = sandbox.STATES.BREAKOUT_PLAYING;
    sandbox.dt = 1 / 60;
    sandbox.currentLevel = 1;
    sandbox.score = 0;
    sandbox.breakoutScore = 0;
    sandbox.breakoutBricksDestroyed = 0;
    sandbox.breakoutBricksTotal = 3;
    sandbox.breakoutTransitionTimer = sandbox.BREAKOUT_TRANSITION_DURATION;
    sandbox.breakoutBallStuck = false;
    sandbox.breakoutBricks = [];
    sandbox.breakoutPowerups = [];
    sandbox.breakoutParticles = [];
    sandbox.breakoutBalls = [];
    sandbox.breakoutBallTrail = [];
    sandbox.breakoutExtraBalls = 0;
    sandbox.breakoutPaddleWidth = sandbox.BREAKOUT_PADDLE_WIDTH;
    sandbox.breakoutActivePowerup = null;
    sandbox.breakoutPowerupTimer = 0;
    sandbox.breakoutPaddleX =
        (sandbox.canvas.width - sandbox.breakoutPaddleWidth) / 2;
    sandbox.breakoutBallX = sandbox.canvas.width / 2;
    sandbox.breakoutBallY = 300;
    sandbox.breakoutBallVX = 100;
    sandbox.breakoutBallVY = -200;
    sandbox.ship = {
        x: sandbox.breakoutPaddleX + sandbox.breakoutPaddleWidth / 2,
        y: sandbox.canvas.height - sandbox.BREAKOUT_PADDLE_Y_OFFSET -
           sandbox.SHIP_SIZE / 2,
        vx: 0, vy: 0, angle: Math.PI,
        thrusting: false, retroThrusting: false, rotating: null, fuel: 100
    };
    sandbox.keys = {};
    sandbox.landingResult = '';
    rngQueue.length = 0;
}

resetWorld();
stepFrames(2);
check('AC#3 Runtime: breakoutBallTrail populated after 2 frames',
    sandbox.breakoutBallTrail.length === 2);
stepFrames(10);
check('AC#3 Runtime: trail capped at BREAKOUT_BALL_TRAIL_LEN',
    sandbox.breakoutBallTrail.length === sandbox.BREAKOUT_BALL_TRAIL_LEN);

// Multi-ball trail runtime.
resetWorld();
sandbox.breakoutBalls.push({ x: 400, y: 300, vx: 120, vy: -80 });
stepFrames(3);
check('AC#3 Runtime: extra ball has its own trail after stepping',
    sandbox.breakoutBalls.length === 1 &&
    Array.isArray(sandbox.breakoutBalls[0].trail) &&
    sandbox.breakoutBalls[0].trail.length > 0);

// ===== AC#4 — Bricks: rounded, gap, AC-exact HP colours, crack overlay =====
check('AC#4 config.js: HP1 colour = #4CAF50',
    /BREAKOUT_BRICK_COLOR_HP1\s*=\s*'#4CAF50'/.test(configSrc));
check('AC#4 config.js: HP2 colour = #FFC107',
    /BREAKOUT_BRICK_COLOR_HP2\s*=\s*'#FFC107'/.test(configSrc));
check('AC#4 config.js: HP3 colour = #F44336',
    /BREAKOUT_BRICK_COLOR_HP3\s*=\s*'#F44336'/.test(configSrc));
check('AC#4 render.js: bricks use quadraticCurveTo (rounded rect)',
    /brickRadius[\s\S]*?quadraticCurveTo/.test(renderSrc));
check('AC#4 render.js: damaged bricks draw a diagonal crack stroke',
    /b\.hp\s*<\s*b\.maxHp[\s\S]*?moveTo\s*\([^)]+\)\s*;\s*ctx\.lineTo\s*\([^)]+\)\s*;\s*ctx\.stroke/.test(renderSrc));
check('AC#4 render.js: brick labels rendered in monospace',
    /ctx\.font\s*=\s*'\d+px\s*monospace'/.test(renderSrc));

// ===== AC#5 — Power-ups: rounded pills, colour, letter + label =====
check('AC#5 render.js: power-ups use quadraticCurveTo (rounded rect)',
    /pupR[\s\S]*?quadraticCurveTo/.test(renderSrc));
check('AC#5 render.js: power-up fill uses pup.color',
    /ctx\.fillStyle\s*=\s*pup\.color/.test(renderSrc));
check('AC#5 render.js: power-up letter is drawn',
    /fillText\s*\(\s*pup\.letter/.test(renderSrc));
check('AC#5 render.js: power-up label is drawn',
    /fillText\s*\(\s*pup\.label/.test(renderSrc));

// ===== AC#6 — Particles: brick burst + ball-loss shower =====
check('AC#6 update.js: brick destruction calls spawnBreakoutBrickParticles',
    /spawnBreakoutBrickParticles\s*\(/.test(updateSrc));
check('AC#6 update.js: ball bottom-out calls spawnBreakoutBallLossParticles (primary)',
    /breakoutBallY\s*-\s*BREAKOUT_BALL_RADIUS\s*>\s*canvas\.height[\s\S]*?spawnBreakoutBallLossParticles/.test(updateSrc));
check('AC#6 update.js: extra-ball bottom-out calls spawnBreakoutBallLossParticles',
    /eb\.y\s*-\s*BREAKOUT_BALL_RADIUS\s*>\s*canvas\.height[\s\S]*?spawnBreakoutBallLossParticles/.test(updateSrc));
// Runtime: a primary ball crossing bottom spawns loss particles.
resetWorld();
sandbox.breakoutBallY = sandbox.canvas.height + 10;
sandbox.breakoutBallVY = 200;
sandbox.breakoutExtraBalls = 1;
var particlesBefore = sandbox.breakoutParticles.length;
stepFrames(1);
check('AC#6 Runtime: particle shower appears after primary bottoms out',
    sandbox.breakoutParticles.length > particlesBefore);
check('AC#6 Runtime: shower particles travel downward (vy > 0)',
    sandbox.breakoutParticles.every(function (p) { return p.vy > 0; }));

// ===== AC#7 — Background = starfield only (no terrain in BREAKOUT_*) =====
var trans = extractFunction(renderSrc, 'function renderBreakoutTransition(');
var play = extractFunction(renderSrc, 'function renderBreakoutPlaying(');
var complete = extractFunction(renderSrc, 'function renderBreakoutComplete(');
var ret = extractFunction(renderSrc, 'function renderBreakoutReturn(');
check('AC#7 renderBreakoutTransition does not call drawTerrain',
    trans && trans.indexOf('drawTerrain(') < 0);
check('AC#7 renderBreakoutPlaying does not call drawTerrain',
    play && play.indexOf('drawTerrain(') < 0);
check('AC#7 renderBreakoutComplete does not call drawTerrain',
    complete && complete.indexOf('drawTerrain(') < 0);
check('AC#7 renderBreakoutReturn does not call drawTerrain',
    ret && ret.indexOf('drawTerrain(') < 0);

// ===== AC#8 — HUD: bricks / extras / power-up / timer bar / score =====
check('AC#8 render.js: drawBreakoutHUD is defined',
    /function\s+drawBreakoutHUD\s*\(/.test(renderSrc));
check('AC#8 HUD renders bricks-remaining label',
    /fillText\s*\(\s*'Bricks:\s*'\s*\+\s*bricksLeft/.test(renderSrc));
check('AC#8 HUD renders extra-balls count',
    /fillText\s*\(\s*'Extra Balls:\s*'\s*\+\s*breakoutExtraBalls/.test(renderSrc));
check('AC#8 HUD renders global score',
    /fillText\s*\(\s*'Score:\s*'\s*\+\s*score/.test(renderSrc));
check('AC#8 HUD renders active power-up label when set',
    /breakoutActivePowerup[\s\S]*?fillText\s*\(\s*'Power:/.test(renderSrc));
check('AC#8 HUD renders a timer bar using breakoutPowerupTimer / duration',
    /breakoutPowerupTimer\s*\/\s*puDuration/.test(renderSrc));
check('AC#8 renderBreakoutTransition calls drawBreakoutHUD',
    trans && trans.indexOf('drawBreakoutHUD(') >= 0);
check('AC#8 renderBreakoutPlaying calls drawBreakoutHUD',
    play && play.indexOf('drawBreakoutHUD(') >= 0);
check('AC#8 renderBreakoutComplete calls drawBreakoutHUD',
    complete && complete.indexOf('drawBreakoutHUD(') >= 0);
check('AC#8 renderBreakoutReturn calls drawBreakoutHUD',
    ret && ret.indexOf('drawBreakoutHUD(') >= 0);
// HUD replaces altitude/velocity panel — no renderPlaying() forwarding inside
// the breakout render paths.
check('AC#8 Breakout renders do NOT delegate to renderPlaying (altitude panel)',
    (trans && trans.indexOf('renderPlaying(') < 0) &&
    (play && play.indexOf('renderPlaying(') < 0) &&
    (complete && complete.indexOf('renderPlaying(') < 0) &&
    (ret && ret.indexOf('renderPlaying(') < 0));

// ===== Summary =====
var passed = results.filter(function (r) { return r.ok; }).length;
var failed = results.length - passed;
console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed > 0 ? 1 : 0);
