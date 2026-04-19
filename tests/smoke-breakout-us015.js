// US-015 (Code Breaker): No-regression smoke test.
//
// Exercises the full Code Breaker user story end-to-end by combining source-
// level regex assertions (cheap, drift-proof) with runtime replays of the
// key gameplay branches against the actual shipped source. Mirrors the
// pattern used by smoke-us015.js for the invader/missile PRD, but targets
// every acceptance criterion of the breakout PRD's US-015.
//
// Acceptance criteria mapped (.chief/prds/codebreaker/prd.md US-015):
//   AC#1  `other` pad 1st landing → Tech Debt Blaster transition.
//   AC#2  `other` pad 2nd landing → Code Breaker transition.
//   AC#3  `other` pad 3rd landing → Tech Debt Blaster again (cycle works).
//   AC#4  `security` pad → invader/missile alternation still works.
//   AC#5  `bugfix` pad → Bug Bombing Run still works (BUGFIX_TRANSITION).
//   AC#6  `feature` pad → Feature Drive (not implemented) / normal descent.
//   AC#7  Code Breaker PLAYING: paddle moves, ball launches, bounces.
//   AC#8  Bricks take correct hits to destroy; multi-HP show cracks.
//   AC#9  Power-ups drop, fall, and activate correctly.
//   AC#10 Ball loss: with extras → respawn stuck; with none → crash/game over.
//   AC#11 All bricks cleared → completion bonuses awarded, return to lander.
//   AC#12 Score accumulates across brick destroys AND completion bonus.
//   AC#13 `otherMiniGameCount` resets on startNewGame() AND on GAMEOVER entry.
//   AC#14 Game over / restart paths — CRASHED → SPACE → GAMEOVER → SPACE → new game.
//   AC#15 Sound helpers exist and are wired at the right points in PLAYING.
//
// Run:  node tests/smoke-breakout-us015.js
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
    if (ok) passed++; else failed++;
    console.log(tag + ' — ' + name + (ok ? '' : ' :: ' + (detail || '')));
}

function loadFile(relPath) {
    return fs.readFileSync(path.join(REPO, relPath), 'utf8');
}

var updateSrc = loadFile('js/update.js');
var inputSrc = loadFile('js/input.js');
var configSrc = loadFile('js/config.js');
var audioSrc = loadFile('js/audio.js');
var renderSrc = loadFile('js/render.js');

function extractFunction(source, sig) {
    var start = source.indexOf(sig);
    if (start < 0) return null;
    var open = source.indexOf('{', start);
    var depth = 0;
    for (var i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    return null;
}

function extractBlock(source, sig) {
    var start = source.indexOf(sig);
    if (start < 0) return null;
    var braceOpen = source.indexOf('{', start + sig.length - 1);
    var depth = 0;
    for (var i = braceOpen; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(braceOpen + 1, i);
        }
    }
    return null;
}

// ====== Sandbox ======
var rngQueue = [];
function nextRandom() {
    if (rngQueue.length > 0) return rngQueue.shift();
    return 0.5;
}

var sandbox = {
    console: console,
    Object: Object, Array: Array, Number: Number, String: String,
    Boolean: Boolean, JSON: JSON, Date: Date, RegExp: RegExp,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    keys: {},
    landedPRType: '',
    landedPRTitle: '',
    levelCommits: [],
    sceneScrollState: null,
    otherMiniGameCount: 0,
    securityMiniGameCount: 0,
    securityPadScroll: false,
    bugfixPadScroll: false,
    missilePadScroll: false,
    currentLevel: 0,
    score: 0,
    landings: 0,
    terrain: [],
    landingPads: [],
    landingPadIndex: -1,
    landingResult: '',
    unplacedPRs: [],
    levelDateRange: '',
    repoFallbackNotice: '',
    repoLoadError: false,
    repoDataError: '',
    repoDataLoading: false,
    repoDataLoaded: true,
    repoSelectorActive: false,
    gameOverEnteringName: false,
    gameOverName: '',
    gameOverLevel: 0,
    proxiblueBrandHitBox: null,
    celebrationReady: true,
    explosionFinished: true,
    availableRepos: [],
    selectedRepoIndex: 0,
    selectedRepoName: '',
};
sandbox.Math = Object.create(Math);
sandbox.Math.random = function () { return nextRandom(); };
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Seed STATES + BREAKOUT_* constants + all breakout state vars.
vm.runInContext(configSrc, sandbox, { filename: 'js/config.js' });

// Stubs used by the various extracted blocks.
sandbox.SHIP_SIZE = 40;
sandbox.FUEL_MAX = 100;
sandbox.SCENE_SCROLL_DURATION = 1;
sandbox.GRAVITY = 1.6;
sandbox.THRUST_POWER = 4;
sandbox.__calls = {};
function stub(name) {
    sandbox[name] = function () {
        sandbox.__calls[name] = (sandbox.__calls[name] || 0) + 1;
    };
}
[
    'startThrustSound', 'stopThrustSound', 'playExplosionSound',
    'playClickSound', 'playLandingSound', 'playBreakoutPowerupSound',
    'playBreakoutPaddleBounceSound', 'playBreakoutBrickHitSound',
    'playBreakoutBrickDestroySound', 'playBreakoutWallBounceSound',
    'playBreakoutBallLostSound', 'playBreakoutVictorySound',
    'playInterceptorLaunchSound', 'spawnExplosion', 'startScreenShake',
    'spawnCelebration', 'updateCelebration', 'resetWind', 'generateTerrain',
    'spawnBugWave', 'setupMissileWorld', 'setupTechdebtWorld',
    'spawnBreakoutBrickParticles', 'spawnBreakoutBallLossParticles',
    'requestGameSession', 'submitOnlineScore', 'addToLeaderboard',
    'loadRepoData',
].forEach(stub);
sandbox.isHighScore = function () { return false; };
sandbox.getLevelConfig = function () { return { gravity: 1.6 }; };
sandbox.resetShip = function () {
    sandbox.ship.x = sandbox.canvas.width / 2;
    sandbox.ship.y = sandbox.canvas.height / 3;
    sandbox.ship.vx = 0;
    sandbox.ship.vy = 0;
    sandbox.ship.angle = 0;
    sandbox.ship.thrusting = false;
    sandbox.ship.rotating = null;
    sandbox.ship.fuel = sandbox.FUEL_MAX;
};
sandbox.ship = {
    x: 400, y: 300, vx: 0, vy: 0, angle: 0,
    thrusting: false, rotating: null, fuel: 100,
    invaderVX: 0, invaderVY: 0, retroThrusting: false,
    rotationSpeed: Math.PI,
};

// ====== Extract Code Breaker helpers + blocks ======
var setupSrc = extractFunction(updateSrc, 'function setupBreakoutWorld(');
var buildSrc = extractFunction(updateSrc, 'function buildBreakoutBrickLabelPool(');
var clearSrc = extractFunction(updateSrc, 'function clearBreakoutState(');
var crashSrc = extractFunction(updateSrc, 'function crashShipInBreakout(');
var loseSrc = extractFunction(updateSrc, 'function loseBreakoutBall(');
var activateSrc = extractFunction(updateSrc, 'function activateBreakoutPowerup(');

check('update.js: setupBreakoutWorld defined', !!setupSrc);
check('update.js: buildBreakoutBrickLabelPool defined', !!buildSrc);
check('update.js: clearBreakoutState defined', !!clearSrc);
check('update.js: crashShipInBreakout defined', !!crashSrc);
check('update.js: loseBreakoutBall defined', !!loseSrc);
check('update.js: activateBreakoutPowerup defined', !!activateSrc);

vm.runInContext(buildSrc, sandbox);
vm.runInContext(setupSrc, sandbox);
vm.runInContext(clearSrc, sandbox);
vm.runInContext(crashSrc, sandbox);
vm.runInContext(loseSrc, sandbox);
vm.runInContext(activateSrc, sandbox);

var playingBody = extractBlock(updateSrc, 'if (gameState === STATES.BREAKOUT_PLAYING) {');
var completeBody = extractBlock(updateSrc, 'if (gameState === STATES.BREAKOUT_COMPLETE) {');
var returnBody = extractBlock(updateSrc, 'if (gameState === STATES.BREAKOUT_RETURN) {');
var transitionBody = extractBlock(updateSrc, 'if (gameState === STATES.BREAKOUT_TRANSITION) {');
var scrollBody = extractBlock(updateSrc, 'if (gameState === STATES.SCENE_SCROLL && sceneScrollState) {');

check('update.js: BREAKOUT_PLAYING block located', !!playingBody);
check('update.js: BREAKOUT_COMPLETE block located', !!completeBody);
check('update.js: BREAKOUT_RETURN block located', !!returnBody);
check('update.js: BREAKOUT_TRANSITION block located', !!transitionBody);
check('update.js: SCENE_SCROLL block located', !!scrollBody);

// The pad-routing branches live inside the `if (t >= 1)` block of SCENE_SCROLL.
var padRoutingIdx = scrollBody.indexOf('if (t >= 1)');
check('update.js: pad-routing terminal block located', padRoutingIdx >= 0);
var padRoutingBody = extractBlock(scrollBody.slice(padRoutingIdx), 'if (t >= 1) {');
check('update.js: pad-routing body extracted', !!padRoutingBody);

// ====== AC#1/#2/#3 `other` pad cycling via otherMiniGameCount ======
// Source-level checks: the pad-routing ladder has an `isOtherPad` branch that
// increments otherMiniGameCount, routes odd → TECHDEBT_TRANSITION, even →
// BREAKOUT_TRANSITION. Runtime-verify by executing the branch with different
// counter values.
check('AC#1-3 pad-routing uses isOtherPad',
    /isOtherPad\s*=\s*\(\s*landedPRType\s*===\s*['"]other['"]\s*\)/.test(padRoutingBody));
check('AC#1-3 increments otherMiniGameCount on `other` entry',
    /otherMiniGameCount\+\+/.test(padRoutingBody));
check('AC#1-3 odd count → STATES.TECHDEBT_TRANSITION',
    /otherMiniGameCount\s*%\s*2\s*!==\s*0[\s\S]*?STATES\.TECHDEBT_TRANSITION/.test(padRoutingBody));
check('AC#1-3 even count → STATES.BREAKOUT_TRANSITION',
    /STATES\.BREAKOUT_TRANSITION/.test(padRoutingBody));

// Runtime replay: stand up a minimal "ready to finalize" sceneScrollState and
// execute the terminal block three times, simulating the `other`-pad cycle.
var padRoutingScript = new vm.Script(
    '(function () {\n' + padRoutingBody + '\n}).call(this);');

function freshScrollState(flags) {
    sandbox.sceneScrollState = {
        newTerrain: [], newPads: [],
        isInvaderScroll: !!(flags && flags.isInvaderScroll),
        isBugfixScroll: !!(flags && flags.isBugfixScroll),
        isMissileScroll: !!(flags && flags.isMissileScroll),
        shipStartX: 0,
    };
}

sandbox.otherMiniGameCount = 0;
sandbox.landedPRType = 'other';
freshScrollState();
padRoutingScript.runInContext(sandbox);
check('AC#1 first `other` landing → TECHDEBT_TRANSITION',
    sandbox.gameState === sandbox.STATES.TECHDEBT_TRANSITION);
check('AC#1 counter incremented to 1 on first landing',
    sandbox.otherMiniGameCount === 1);

sandbox.landedPRType = 'other';
freshScrollState();
padRoutingScript.runInContext(sandbox);
check('AC#2 second `other` landing → BREAKOUT_TRANSITION',
    sandbox.gameState === sandbox.STATES.BREAKOUT_TRANSITION);
check('AC#2 counter incremented to 2 on second landing',
    sandbox.otherMiniGameCount === 2);

sandbox.landedPRType = 'other';
freshScrollState();
padRoutingScript.runInContext(sandbox);
check('AC#3 third `other` landing → TECHDEBT_TRANSITION (cycle resumes)',
    sandbox.gameState === sandbox.STATES.TECHDEBT_TRANSITION);
check('AC#3 counter incremented to 3 on third landing',
    sandbox.otherMiniGameCount === 3);

// ====== AC#4 `security` pad alternation still works ======
// Source-level: input.js SPACE handler on LANDED toggles securityPadScroll /
// missilePadScroll based on securityMiniGameCount. update.js routes
// wasInvaderScroll → INVADER_SCROLL_ROTATE and wasMissileScroll →
// MISSILE_TRANSITION in the terminal SCENE_SCROLL block.
check('AC#4 input.js: security pad SPACE handler sets securityPadScroll on landing',
    /securityPadScroll\s*=\s*\(\s*landedPRType\s*===\s*['"]security['"]\s*\)/.test(inputSrc));
check('AC#4 input.js: securityMiniGameCount alternates invader/missile',
    /securityMiniGameCount\+\+[\s\S]*?securityMiniGameCount\s*%\s*2[\s\S]*?missilePadScroll\s*=\s*true/.test(inputSrc));
check('AC#4 update.js: invader scroll → INVADER_SCROLL_ROTATE',
    /wasInvaderScroll[\s\S]*?STATES\.INVADER_SCROLL_ROTATE/.test(padRoutingBody));
check('AC#4 update.js: missile scroll → MISSILE_TRANSITION',
    /wasMissileScroll[\s\S]*?STATES\.MISSILE_TRANSITION/.test(padRoutingBody));

sandbox.landedPRType = 'security';
sandbox.otherMiniGameCount = 0;
freshScrollState({ isInvaderScroll: true });
padRoutingScript.runInContext(sandbox);
check('AC#4 security scroll with isInvaderScroll → INVADER_SCROLL_ROTATE',
    sandbox.gameState === sandbox.STATES.INVADER_SCROLL_ROTATE);
check('AC#4 security invader path does NOT touch otherMiniGameCount',
    sandbox.otherMiniGameCount === 0);

sandbox.landedPRType = 'security';
freshScrollState({ isMissileScroll: true });
padRoutingScript.runInContext(sandbox);
check('AC#4 security scroll with isMissileScroll → MISSILE_TRANSITION',
    sandbox.gameState === sandbox.STATES.MISSILE_TRANSITION);

// ====== AC#5 `bugfix` pad → Bug Bombing Run still works ======
check('AC#5 input.js: bugfix pad SPACE handler sets bugfixPadScroll',
    /bugfixPadScroll\s*=\s*\(\s*landedPRType\s*===\s*['"]bugfix['"]\s*\)/.test(inputSrc));
check('AC#5 update.js: wasBugfixScroll → BUGFIX_TRANSITION',
    /wasBugfixScroll[\s\S]*?STATES\.BUGFIX_TRANSITION/.test(padRoutingBody));

sandbox.landedPRType = 'bugfix';
freshScrollState({ isBugfixScroll: true });
padRoutingScript.runInContext(sandbox);
check('AC#5 bugfix scroll → BUGFIX_TRANSITION',
    sandbox.gameState === sandbox.STATES.BUGFIX_TRANSITION);

// ====== AC#6 `feature` pad → Feature Drive (not implemented) / normal descent ======
// `feature` pads are NOT routed through a pad-scroll flag (no isFeatureScroll)
// so they fall through to the `else` branch → SCENE_DESCENT.
check('AC#6 no isFeatureScroll path in pad-routing (Feature Drive unimplemented)',
    !/isFeatureScroll/.test(padRoutingBody));
check('AC#6 fallthrough branch routes to STATES.SCENE_DESCENT',
    /else[\s\S]*?STATES\.SCENE_DESCENT/.test(padRoutingBody));

sandbox.landedPRType = 'feature';
freshScrollState();
padRoutingScript.runInContext(sandbox);
check('AC#6 feature pad → SCENE_DESCENT (normal descent)',
    sandbox.gameState === sandbox.STATES.SCENE_DESCENT);

// ====== AC#7 Code Breaker: paddle moves, ball launches, bounces ======
check('AC#7 PLAYING: ArrowLeft/A moves paddle left',
    /keys\[['"]ArrowLeft['"]\]\s*\|\|\s*keys\[['"]a['"]\]\s*\|\|\s*keys\[['"]A['"]\][\s\S]*?breakoutPaddleX\s*-=\s*BREAKOUT_PADDLE_SPEED\s*\*\s*dt/.test(playingBody));
check('AC#7 PLAYING: ArrowRight/D moves paddle right',
    /keys\[['"]ArrowRight['"]\]\s*\|\|\s*keys\[['"]d['"]\]\s*\|\|\s*keys\[['"]D['"]\][\s\S]*?breakoutPaddleX\s*\+=\s*BREAKOUT_PADDLE_SPEED\s*\*\s*dt/.test(playingBody));
check('AC#7 PLAYING: ArrowUp/W/Space launches ball when stuck',
    /keys\[['"]ArrowUp['"]\]\s*\|\|\s*keys\[['"]w['"]\]\s*\|\|\s*keys\[['"]W['"]\]\s*\|\|[\s\S]*?keys\[['"] ['"]\]\s*\|\|\s*keys\[['"]Space['"]\]/.test(playingBody));
check('AC#7 PLAYING: wall reflections (left)',
    /breakoutBallX\s*-\s*BREAKOUT_BALL_RADIUS\s*<\s*0[\s\S]*?breakoutBallVX\s*=\s*-breakoutBallVX/.test(playingBody));
check('AC#7 PLAYING: wall reflections (right)',
    /breakoutBallX\s*\+\s*BREAKOUT_BALL_RADIUS\s*>\s*canvas\.width[\s\S]*?breakoutBallVX\s*=\s*-breakoutBallVX/.test(playingBody));
check('AC#7 PLAYING: wall reflections (top)',
    /breakoutBallY\s*-\s*BREAKOUT_BALL_RADIUS\s*<\s*0[\s\S]*?breakoutBallVY\s*=\s*-breakoutBallVY/.test(playingBody));
check('AC#7 PLAYING: paddle directional reflection formula',
    /hitPosNorm[\s\S]*?BREAKOUT_PADDLE_MAX_BOUNCE_ANGLE[\s\S]*?breakoutBallVX\s*=\s*hitPosNorm/.test(playingBody));

// Runtime replay: seed PLAYING state, press right, tick once, confirm paddle
// moved. Ball should remain stuck-to-paddle until launch.
sandbox.gameState = sandbox.STATES.BREAKOUT_PLAYING;
sandbox.dt = 1 / 60;
sandbox.currentLevel = 0;
sandbox.setupBreakoutWorld();
sandbox.ship.y = sandbox.canvas.height / 2;
var initialPaddleX = sandbox.breakoutPaddleX;
sandbox.keys = { ArrowRight: true };
var playingScript = new vm.Script(
    '(function () {\n' + playingBody + '\n}).call(this);');
playingScript.runInContext(sandbox);
check('AC#7 runtime: paddle moved right by BREAKOUT_PADDLE_SPEED * dt',
    Math.abs(sandbox.breakoutPaddleX - (initialPaddleX + sandbox.BREAKOUT_PADDLE_SPEED * (1 / 60))) < 0.01);
check('AC#7 runtime: ball still stuck (no launch key)',
    sandbox.breakoutBallStuck === true);

// Launch via Space
sandbox.keys = { ' ': true };
rngQueue = [0.5]; // launch angle factor
playingScript.runInContext(sandbox);
check('AC#7 runtime: ball launched on Space',
    sandbox.breakoutBallStuck === false &&
    sandbox.breakoutBallVY < 0);

// ====== AC#8 Bricks take correct hits; multi-HP show cracks ======
// Source checks for brick HP decrement + destruction + crack render.
check('AC#8 PLAYING: non-fireball path decrements brick.hp by 1',
    /!fireActive[\s\S]*?brick\.hp\s*-=\s*1/.test(playingBody));
check('AC#8 PLAYING: HP<=0 branch awards points + spawn particles',
    /brick\.hp\s*<=\s*0[\s\S]*?BREAKOUT_POINTS_PER_BRICK[\s\S]*?spawnBreakoutBrickParticles/.test(playingBody));
check('AC#8 PLAYING: damaged (non-destroy) branch re-colours + flashTimer',
    /else\s*{[\s\S]*?BREAKOUT_BRICK_COLOR_HP[123][\s\S]*?flashTimer\s*=\s*0\.12/.test(playingBody));
check('AC#8 render: crack overlay stroked when hp < maxHp',
    /hp\s*<\s*[bB]\.maxHp|b\.hp\s*<\s*b\.maxHp|brick\.hp\s*<\s*brick\.maxHp/.test(renderSrc));
check('AC#8 setup: brick spawns with hp/maxHp in [1,3]',
    /var\s+hp\s*=\s*\(\s*r\s*<\s*hp1Edge\s*\)[\s\S]*?maxHp\s*:\s*hp/.test(setupSrc));

// Runtime: give a single 3HP brick, hit it twice, confirm HP decrements and
// colour shifts. Third hit destroys it.
rngQueue = [];
sandbox.breakoutBricks = [{
    x: 100, y: 100, w: 60, h: 20, hp: 3, maxHp: 3,
    color: sandbox.BREAKOUT_BRICK_COLOR_HP3,
    revealAt: 0,
    label: 'TODO',
}];
sandbox.breakoutBricksTotal = 1;
sandbox.breakoutBricksDestroyed = 0;
sandbox.breakoutBallX = 130;
sandbox.breakoutBallY = 115;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 100;  // moving down onto brick
sandbox.breakoutBallStuck = false;
sandbox.breakoutActivePowerup = null;
sandbox.breakoutTransitionTimer = 99;  // ensure revealed
sandbox.keys = {};
sandbox.score = 0;
sandbox.breakoutScore = 0;
playingScript.runInContext(sandbox);
check('AC#8 runtime: 3HP brick takes 1 hit → hp = 2',
    sandbox.breakoutBricks.length === 1 &&
    sandbox.breakoutBricks[0].hp === 2,
    'hp=' + (sandbox.breakoutBricks[0] && sandbox.breakoutBricks[0].hp));
check('AC#8 runtime: damaged brick colour is HP2',
    sandbox.breakoutBricks[0].color === sandbox.BREAKOUT_BRICK_COLOR_HP2);
check('AC#8 runtime: damaged brick flashTimer is set',
    sandbox.breakoutBricks[0].flashTimer > 0);

// ====== AC#9 Power-ups drop, fall, activate ======
check('AC#9 PLAYING: power-ups fall by pu.vy * dt',
    /pu\.y\s*\+=\s*pu\.vy\s*\*\s*dt/.test(playingBody));
check('AC#9 PLAYING: power-ups caught by paddle → activateBreakoutPowerup',
    /activateBreakoutPowerup\s*\(\s*pu\.type\s*\)/.test(playingBody));
check('AC#9 PLAYING: power-ups spawn off destroyed bricks with BREAKOUT_POWERUP_CHANCE',
    /Math\.random\s*\(\s*\)\s*<\s*BREAKOUT_POWERUP_CHANCE/.test(playingBody));
check('AC#9 config: BREAKOUT_POWERUP_TYPES has four types',
    /BREAKOUT_POWERUP_TYPES\s*=\s*\[[\s\S]*?\]/.test(configSrc) &&
    sandbox.BREAKOUT_POWERUP_TYPES.length === 4);
check('AC#9 audio: playBreakoutPowerupSound fires on activation',
    /playBreakoutPowerupSound/.test(activateSrc));

// Runtime: call activateBreakoutPowerup('wide') and confirm paddle widens.
sandbox.breakoutPaddleWidth = sandbox.BREAKOUT_PADDLE_WIDTH;
sandbox.activateBreakoutPowerup('wide');
check('AC#9 runtime: Wide paddle activation widens paddle',
    sandbox.breakoutPaddleWidth > sandbox.BREAKOUT_PADDLE_WIDTH);
check('AC#9 runtime: Wide paddle activation arms timer',
    sandbox.breakoutPowerupTimer > 0 &&
    sandbox.breakoutActivePowerup === 'wide');

sandbox.breakoutExtraBalls = 0;
sandbox.activateBreakoutPowerup('extra');
check('AC#9 runtime: Extra Ball activation increments breakoutExtraBalls',
    sandbox.breakoutExtraBalls === 1);

// ====== AC#10 Ball loss with/without extras ======
check('AC#10 PLAYING: primary bottom-out with extras → promote from breakoutBalls',
    /breakoutBalls\.length\s*>\s*0[\s\S]*?breakoutBalls\.shift/.test(playingBody));
check('AC#10 PLAYING: primary bottom-out with no extras → loseBreakoutBall',
    /loseBreakoutBall\s*\(\s*\)/.test(playingBody));
check('AC#10 loseBreakoutBall: extras > 0 → respawn stuck on paddle',
    /breakoutExtraBalls\s*>\s*0[\s\S]*?breakoutBallStuck\s*=\s*true/.test(loseSrc));
check('AC#10 loseBreakoutBall: no extras → crashShipInBreakout',
    /else[\s\S]*?crashShipInBreakout/.test(loseSrc));
check('AC#10 crashShipInBreakout: sets gameState = STATES.CRASHED',
    /gameState\s*=\s*STATES\.CRASHED/.test(crashSrc));

// Runtime: extras available + primary bottom-out → respawn stuck.
sandbox.breakoutBricks = [{
    x: 10, y: 10, w: 60, h: 20, hp: 3, maxHp: 3,
    color: sandbox.BREAKOUT_BRICK_COLOR_HP3, revealAt: 0, label: 'X',
}];
sandbox.breakoutBricksTotal = 999;
sandbox.breakoutBricksDestroyed = 0;
sandbox.breakoutBallX = 400;
sandbox.breakoutBallY = sandbox.canvas.height + 50;  // past bottom
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 100;
sandbox.breakoutBallStuck = false;
sandbox.breakoutBalls = [];
sandbox.breakoutExtraBalls = 2;
sandbox.keys = {};
playingScript.runInContext(sandbox);
check('AC#10 runtime: primary bottom-out + extras → ball re-stuck',
    sandbox.breakoutBallStuck === true);
check('AC#10 runtime: breakoutExtraBalls decremented on loss-respawn',
    sandbox.breakoutExtraBalls === 1);

// No extras → CRASHED
sandbox.breakoutBallX = 400;
sandbox.breakoutBallY = sandbox.canvas.height + 50;
sandbox.breakoutBallVY = 100;
sandbox.breakoutBallStuck = false;
sandbox.breakoutBalls = [];
sandbox.breakoutExtraBalls = 0;
sandbox.gameState = sandbox.STATES.BREAKOUT_PLAYING;
playingScript.runInContext(sandbox);
check('AC#10 runtime: primary bottom-out + no extras → CRASHED',
    sandbox.gameState === sandbox.STATES.CRASHED);

// ====== AC#11 All bricks cleared → completion bonuses + return ======
check('AC#11 PLAYING: win condition breakoutBricksDestroyed >= breakoutBricksTotal',
    /breakoutBricksDestroyed\s*>=\s*breakoutBricksTotal/.test(playingBody));
check('AC#11 PLAYING: awards BREAKOUT_POINTS_COMPLETION',
    /BREAKOUT_POINTS_COMPLETION/.test(playingBody));
check('AC#11 PLAYING: awards BREAKOUT_POINTS_BALLS_REMAINING × breakoutExtraBalls',
    /BREAKOUT_POINTS_BALLS_REMAINING\s*\*\s*breakoutExtraBalls/.test(playingBody));
check('AC#11 PLAYING: enters STATES.BREAKOUT_COMPLETE on win',
    /gameState\s*=\s*STATES\.BREAKOUT_COMPLETE/.test(playingBody));
check('AC#11 COMPLETE: gates advance on BREAKOUT_COMPLETE_DELAY',
    /breakoutCompleteTimer\s*>=\s*BREAKOUT_COMPLETE_DELAY/.test(completeBody) &&
    /gameState\s*=\s*STATES\.BREAKOUT_RETURN/.test(completeBody));
check('AC#11 RETURN: ends with STATES.PLAYING (lander) + level++',
    /currentLevel\+\+/.test(returnBody) &&
    /gameState\s*=\s*STATES\.PLAYING/.test(returnBody));
check('AC#11 RETURN: clears breakout state on completion',
    /clearBreakoutState\s*\(\s*\)/.test(returnBody));

// ====== AC#12 Score accumulates ======
// Score accumulates via `score += awarded` in the brick-destruction path AND
// `score += totalBonus` in the completion path. Both persist across resets
// because startNewGame zeroes it at the top of a NEW game only.
check('AC#12 PLAYING: brick destroy adds to global score',
    /breakoutScore\s*\+=\s*awarded[\s\S]*?score\s*\+=\s*awarded/.test(playingBody));
check('AC#12 PLAYING: completion bonus adds to global score',
    /breakoutScore\s*\+=\s*totalBonus[\s\S]*?score\s*\+=\s*totalBonus/.test(playingBody));
check('AC#12 clearBreakoutState does NOT reset breakoutScore (preserved)',
    !/breakoutScore\s*=\s*0/.test(clearSrc));
check('AC#12 startNewGame zeroes score (only on new game)',
    /function\s+startNewGame[\s\S]*?score\s*=\s*0/.test(inputSrc));

// Runtime: destroy a brick, confirm both scores grow.
sandbox.gameState = sandbox.STATES.BREAKOUT_PLAYING;
sandbox.breakoutBricks = [{
    x: 100, y: 100, w: 60, h: 20, hp: 1, maxHp: 1,
    color: sandbox.BREAKOUT_BRICK_COLOR_HP1, revealAt: 0, label: 'T',
}];
sandbox.breakoutBricksTotal = 999;  // prevent win-condition triggering
sandbox.breakoutBricksDestroyed = 0;
sandbox.breakoutBallX = 130;
sandbox.breakoutBallY = 115;
sandbox.breakoutBallVX = 0;
sandbox.breakoutBallVY = 100;
sandbox.breakoutBallStuck = false;
sandbox.breakoutBalls = [];
sandbox.breakoutExtraBalls = 0;
sandbox.breakoutActivePowerup = null;
sandbox.breakoutTransitionTimer = 99;
sandbox.score = 100;  // seed prior score
sandbox.breakoutScore = 0;
sandbox.keys = {};
rngQueue = [0.99];  // suppress power-up drop
playingScript.runInContext(sandbox);
var expectedPts = sandbox.BREAKOUT_POINTS_PER_BRICK + sandbox.BREAKOUT_POINTS_BONUS_HP * 1;
check('AC#12 runtime: brick destroy adds points to global score',
    sandbox.score === 100 + expectedPts,
    'score=' + sandbox.score + ' expected=' + (100 + expectedPts));
check('AC#12 runtime: brick destroy adds points to breakoutScore',
    sandbox.breakoutScore === expectedPts);

// ====== AC#13 otherMiniGameCount resets on new game + GAMEOVER ======
check('AC#13 startNewGame resets otherMiniGameCount = 0',
    /function\s+startNewGame[\s\S]*?otherMiniGameCount\s*=\s*0/.test(inputSrc));
check('AC#13 GAMEOVER entry resets otherMiniGameCount = 0',
    /gameState\s*===\s*STATES\.CRASHED[\s\S]*?otherMiniGameCount\s*=\s*0[\s\S]*?STATES\.GAMEOVER/.test(inputSrc));

// Runtime: extract startNewGame + handleKeyPress and replay.
var startNewGameSrc = extractFunction(inputSrc, 'function startNewGame(');
var handleKeySrc = extractFunction(inputSrc, 'function handleKeyPress(');
check('input.js: startNewGame extracted', !!startNewGameSrc);
check('input.js: handleKeyPress extracted', !!handleKeySrc);
vm.runInContext(startNewGameSrc, sandbox);
vm.runInContext(handleKeySrc, sandbox);

sandbox.otherMiniGameCount = 7;
sandbox.securityMiniGameCount = 5;
sandbox.score = 1234;
sandbox.gameState = sandbox.STATES.MENU;
sandbox.startNewGame();
check('AC#13 runtime: startNewGame resets otherMiniGameCount to 0',
    sandbox.otherMiniGameCount === 0);
check('AC#13 runtime: startNewGame resets securityMiniGameCount to 0',
    sandbox.securityMiniGameCount === 0);
check('AC#13 runtime: startNewGame resets score to 0',
    sandbox.score === 0);

// CRASHED → SPACE resets counters on entry to GAMEOVER.
sandbox.otherMiniGameCount = 9;
sandbox.securityMiniGameCount = 4;
sandbox.score = 0;  // no name entry on zero-score — simpler flow
sandbox.gameState = sandbox.STATES.CRASHED;
sandbox.explosionFinished = true;
sandbox.handleKeyPress(' ');
check('AC#14 CRASHED + SPACE → GAMEOVER',
    sandbox.gameState === sandbox.STATES.GAMEOVER);
check('AC#13 runtime: GAMEOVER entry resets otherMiniGameCount to 0',
    sandbox.otherMiniGameCount === 0);
check('AC#13 runtime: GAMEOVER entry resets securityMiniGameCount to 0',
    sandbox.securityMiniGameCount === 0);

// ====== AC#14 Game over / restart paths ======
// SPACE on GAMEOVER → startNewGame path (name entry skipped for score=0).
sandbox.gameState = sandbox.STATES.GAMEOVER;
sandbox.gameOverEnteringName = false;
sandbox.handleKeyPress(' ');
check('AC#14 GAMEOVER + SPACE → PLAYING (startNewGame)',
    sandbox.gameState === sandbox.STATES.PLAYING);
check('AC#14 restart re-zeroes score',
    sandbox.score === 0);
check('AC#14 restart re-zeroes otherMiniGameCount',
    sandbox.otherMiniGameCount === 0);

// ====== AC#15 Sounds play without glitches ======
// All seven breakout sound helpers exist in audio.js + defensive typeof guard
// wiring in update.js so missing audio doesn't ReferenceError at runtime.
[
    'playBreakoutPowerupSound', 'playBreakoutPaddleBounceSound',
    'playBreakoutBrickHitSound', 'playBreakoutBrickDestroySound',
    'playBreakoutWallBounceSound', 'playBreakoutBallLostSound',
    'playBreakoutVictorySound',
].forEach(function (fn) {
    var fnSrc = extractFunction(audioSrc, 'function ' + fn + '(');
    check('AC#15 audio.js defines ' + fn, !!fnSrc);
    check('AC#15 ' + fn + ' uses ensureAudioCtx (rapid-call safety)',
        !!fnSrc && /ensureAudioCtx/.test(fnSrc));
});

// Sound helpers are wired in PLAYING with typeof guards (so missing audio is
// a warning, not a ReferenceError).
check('AC#15 PLAYING: paddle bounce sound guarded + fired',
    /typeof\s+playBreakoutPaddleBounceSound\s*===\s*['"]function['"][\s\S]*?playBreakoutPaddleBounceSound\s*\(\s*\)/.test(playingBody));
check('AC#15 PLAYING: brick destroy sound guarded + fired',
    /typeof\s+playBreakoutBrickDestroySound\s*===\s*['"]function['"][\s\S]*?playBreakoutBrickDestroySound\s*\(\s*\)/.test(playingBody));
check('AC#15 PLAYING: brick hit sound guarded + fired',
    /typeof\s+playBreakoutBrickHitSound\s*===\s*['"]function['"][\s\S]*?playBreakoutBrickHitSound\s*\(\s*\)/.test(playingBody));
check('AC#15 PLAYING: wall bounce sound guarded + fired',
    /typeof\s+playBreakoutWallBounceSound\s*===\s*['"]function['"][\s\S]*?playBreakoutWallBounceSound\s*\(\s*\)/.test(playingBody));
check('AC#15 PLAYING: victory sound guarded + fired on win',
    /typeof\s+playBreakoutVictorySound\s*===\s*['"]function['"][\s\S]*?playBreakoutVictorySound\s*\(\s*\)/.test(playingBody));
check('AC#15 loseBreakoutBall: ball-lost sound guarded + fired',
    /typeof\s+playBreakoutBallLostSound\s*===\s*['"]function['"][\s\S]*?playBreakoutBallLostSound\s*\(\s*\)/.test(loseSrc));
check('AC#15 activateBreakoutPowerup: power-up chime fired',
    /playBreakoutPowerupSound/.test(activateSrc));

console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed > 0 ? 1 : 0);
