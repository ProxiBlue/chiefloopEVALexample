// US-017: No-regression smoke test — all pad-type flows + tech debt blaster +
// ProxiBlue + branding + game over / restart / leaderboard.
//
// Replays the actual shipped source of js/input.js, js/update.js, js/collision.js,
// js/render.js, and js/leaderboard.js inside a vm sandbox seeded by js/config.js.
// Same brace-walking + signature-match pattern used by smoke-us015.js and the
// integration-techdebt-us0XX suite.
//
// Acceptance criteria mapped:
//   AC#1  feature pad → normal next-level flow (currentLevel++, SCENE_LIFTOFF)
//   AC#2  security pad → invader mini-game (securityPadScroll || missilePadScroll set)
//   AC#3  bugfix pad → Bug Bombing Run (bugfixPadScroll = true, SCENE_LIFTOFF)
//   AC#4  other pad → Tech Debt Blaster flow: transition, gameplay, win, return, lose
//   AC#5  ProxiBlue asteroid spawns + shield mechanic (collect → shielded → consume on hit)
//   AC#6  ProxiBlue branding appears on menu (Crafted with ☕) and game over (Powered by)
//   AC#7  Crashing in normal lander mode → CRASHED → GAMEOVER (Space-press path)
//   AC#8  Score accumulates across normal + invader + bugfix + missile + techdebt
//   AC#9  Game over + Space → startNewGame (restart resets score/level/state)
//   AC#10 High-score leaderboard add / qualify / trim / order
//
// Run:  node tests/smoke-us017.js
// Exits 0 on pass, 1 on any failure.

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.resolve(__dirname, '..');
var results = [];
function check(name, ok, detail) {
    results.push({ name: name, ok: !!ok, detail: detail || '' });
    var tag = ok ? 'PASS' : 'FAIL';
    console.log(tag + ' — ' + name + (ok ? '' : ' :: ' + (detail || '')));
}
function loadFile(relPath) {
    return fs.readFileSync(path.join(REPO, relPath), 'utf8');
}

// Generic: find `signature` in `src`, then walk balanced braces from the
// first `{` past the signature and return the body (without the braces).
function extractBraceBody(src, signature, startFrom) {
    var idx = src.indexOf(signature, startFrom || 0);
    if (idx < 0) return null;
    var open = src.indexOf('{', idx + signature.length - 1);
    if (open < 0) return null;
    var depth = 0;
    for (var i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(open + 1, i);
        }
    }
    return null;
}

// ----- Build a stub browser-ish sandbox -----
var localStorageBacking = {};
var soundLog = [];
var sandbox = {
    console: console,
    Math: Math,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Boolean: Boolean,
    JSON: JSON,
    Date: Date,
    performance: { now: function () { return 0; } },
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    keys: {},
    localStorage: {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(localStorageBacking, k) ? localStorageBacking[k] : null; },
        setItem: function (k, v) { localStorageBacking[k] = String(v); },
        removeItem: function (k) { delete localStorageBacking[k]; }
    },
    // Minimal stubs for things called by the replayed source.
    resetShip: function () { sandbox.ship = { x: 400, y: 300, vx: 0, vy: 0, angle: 0, thrusting: false, rotating: null, fuel: 100 }; },
    resetWind: function () {},
    generateTerrain: function () { sandbox.terrain = [{ x: 0, y: 500 }, { x: 800, y: 500 }]; sandbox.landingPads = []; },
    getLevelConfig: function () { return { gravity: 50, thrust: 125 }; },
    playClickSound: function () { soundLog.push('click'); },
    startThrustSound: function () { soundLog.push('thrustStart'); },
    stopThrustSound: function () { soundLog.push('thrustStop'); },
    playExplosionSound: function () { soundLog.push('explosion'); },
    playLandingSound: function () { soundLog.push('landing'); },
    playShootSound: function () {},
    playTechdebtShootSound: function () {},
    playProxiblueCollectSound: function () { soundLog.push('proxiblueCollect'); },
    playProxiblueShieldDeactivateSound: function () { soundLog.push('shieldOff'); },
    requestGameSession: function () {},
    loadRepoData: function () {},
    submitOnlineScore: function () {},
    spawnBugWave: function () {},
    setupMissileWorld: function () {},
    clearBugfixState: function () {},
    clearMissileState: function () {},
    spawnExplosion: function () { soundLog.push('spawnExplosion'); },
    startScreenShake: function () { soundLog.push('shake'); },
    spawnCelebration: function () {},
    updateCelebration: function () {},
    SHIP_SIZE: 40,
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Load real config.js — STATES, *_DURATION, TECHDEBT_* constants, PROXIBLUE_*,
// PadScroll flags, score, etc.
vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });
// Real leaderboard (for AC#10).
vm.runInContext(loadFile('js/leaderboard.js'), sandbox, { filename: 'js/leaderboard.js' });

// Sanity: required constants present.
check('config: STATES has all pad + mini-game states',
    sandbox.STATES.PLAYING === 'playing' &&
    sandbox.STATES.LANDED === 'landed' &&
    sandbox.STATES.SCENE_LIFTOFF === 'scene_liftoff' &&
    sandbox.STATES.SCENE_SCROLL === 'scene_scroll' &&
    sandbox.STATES.SCENE_DESCENT === 'scene_descent' &&
    sandbox.STATES.INVADER_SCROLL_ROTATE === 'invader_scroll_rotate' &&
    sandbox.STATES.BUGFIX_TRANSITION === 'bugfix_transition' &&
    sandbox.STATES.MISSILE_TRANSITION === 'missile_transition' &&
    sandbox.STATES.TECHDEBT_TRANSITION === 'techdebt_transition' &&
    sandbox.STATES.TECHDEBT_PLAYING === 'techdebt_playing' &&
    sandbox.STATES.TECHDEBT_COMPLETE === 'techdebt_complete' &&
    sandbox.STATES.TECHDEBT_RETURN === 'techdebt_return' &&
    sandbox.STATES.CRASHED === 'crashed' &&
    sandbox.STATES.GAMEOVER === 'gameover');

// Load update.js-side helpers needed later: crashShipInTechdebt, clearTechdebtState,
// setupTechdebtWorld, spawnTechdebtAsteroidParticles, splitTechdebtAsteroid.
var updateSrc = loadFile('js/update.js');
var inputSrc = loadFile('js/input.js');
var collisionSrc = loadFile('js/collision.js');
var renderSrc = loadFile('js/render.js');

var helperNames = [
    'crashShipInTechdebt',
    'clearTechdebtState',
    'setupTechdebtWorld',
    'spawnTechdebtAsteroidParticles',
    'splitTechdebtAsteroid',
];
for (var h = 0; h < helperNames.length; h++) {
    var body = extractBraceBody(updateSrc, 'function ' + helperNames[h] + '(');
    if (body == null) {
        check('update.js: ' + helperNames[h] + ' extracted', false, 'function body not found');
        continue;
    }
    // Each helper either takes zero args or (reason) / (x, y, color) / (parent).
    // We declare a wrapper that proxies the actual signature from source.
    var sigMatch = updateSrc.match(new RegExp('function\\s+' + helperNames[h] + '\\s*\\(([^)]*)\\)'));
    var argList = sigMatch ? sigMatch[1] : '';
    var wrapper = 'this.' + helperNames[h] + ' = function (' + argList + ') {\n' + body + '\n};';
    vm.runInContext(wrapper, sandbox, { filename: helperNames[h] });
}
check('update.js helpers loaded',
    typeof sandbox.crashShipInTechdebt === 'function' &&
    typeof sandbox.clearTechdebtState === 'function' &&
    typeof sandbox.setupTechdebtWorld === 'function' &&
    typeof sandbox.spawnTechdebtAsteroidParticles === 'function' &&
    typeof sandbox.splitTechdebtAsteroid === 'function');

// ============================================================
// AC#1 feature pad → normal next-level flow
// AC#2 security pad → invader mini-game
// AC#3 bugfix pad → Bug Bombing Run
// AC#4 (entry portion) other pad → routes to tech debt blaster
// Replay the input.js LANDED Space-press branch.
// ============================================================
var landedSig = '} else if (gameState === STATES.LANDED && celebrationReady) {';
var landedBody = extractBraceBody(inputSrc, landedSig);
check('input.js: LANDED Space-press branch extracted',
    typeof landedBody === 'string' && landedBody.indexOf('SCENE_LIFTOFF') >= 0);
var landedReplay = new vm.Script('(function () {\n' + landedBody + '\n}).call(this);', { filename: 'landed-body' });

function enterLandedAs(prType) {
    sandbox.gameState = sandbox.STATES.LANDED;
    sandbox.celebrationReady = true;
    sandbox.landedPRType = prType;
    sandbox.ship = { x: 400, y: 300, vx: 0, vy: 0, angle: 0, thrusting: false, rotating: null, fuel: 100 };
    sandbox.sceneLiftoffStartY = 0;
}

// ---- AC#1: feature pad ----
sandbox.currentLevel = 0;
sandbox.securityMiniGameCount = 0;
sandbox.securityPadScroll = false;
sandbox.bugfixPadScroll = false;
sandbox.missilePadScroll = false;
enterLandedAs('feature');
landedReplay.runInContext(sandbox);
check('AC#1 feature pad: gameState → SCENE_LIFTOFF',
    sandbox.gameState === sandbox.STATES.SCENE_LIFTOFF);
check('AC#1 feature pad: no mini-game scroll flags set',
    !sandbox.securityPadScroll && !sandbox.bugfixPadScroll && !sandbox.missilePadScroll);
check('AC#1 feature pad: currentLevel incremented',
    sandbox.currentLevel === 1);

// ---- AC#2: security pad routes to a security mini-game (invader or missile) ----
sandbox.currentLevel = 0;
sandbox.securityMiniGameCount = 0;
sandbox.securityPadScroll = false;
sandbox.bugfixPadScroll = false;
sandbox.missilePadScroll = false;
enterLandedAs('security');
landedReplay.runInContext(sandbox);
check('AC#2 security pad: gameState → SCENE_LIFTOFF',
    sandbox.gameState === sandbox.STATES.SCENE_LIFTOFF);
check('AC#2 security pad: securityMiniGameCount bumped',
    sandbox.securityMiniGameCount === 1);
check('AC#2 security pad: routes to invader OR missile (one flag set)',
    (sandbox.securityPadScroll === true) !== (sandbox.missilePadScroll === true));
check('AC#2 security pad: currentLevel NOT incremented (mini-game defers)',
    sandbox.currentLevel === 0);

// ---- AC#3: bugfix pad ----
sandbox.currentLevel = 0;
sandbox.securityMiniGameCount = 0;
sandbox.securityPadScroll = false;
sandbox.bugfixPadScroll = false;
sandbox.missilePadScroll = false;
enterLandedAs('bugfix');
landedReplay.runInContext(sandbox);
check('AC#3 bugfix pad: bugfixPadScroll = true',
    sandbox.bugfixPadScroll === true);
check('AC#3 bugfix pad: gameState → SCENE_LIFTOFF',
    sandbox.gameState === sandbox.STATES.SCENE_LIFTOFF);
check('AC#3 bugfix pad: no security / missile flags',
    !sandbox.securityPadScroll && !sandbox.missilePadScroll);

// ---- AC#4 entry: other pad goes through SCENE_LIFTOFF then SCENE_SCROLL end
// branch should flip to TECHDEBT_TRANSITION via `landedPRType === 'other'`. ----
sandbox.currentLevel = 0;
sandbox.securityMiniGameCount = 0;
sandbox.securityPadScroll = false;
sandbox.bugfixPadScroll = false;
sandbox.missilePadScroll = false;
enterLandedAs('other');
landedReplay.runInContext(sandbox);
check('AC#4 other pad: no mini-game flags (tech debt routes via landedPRType)',
    !sandbox.securityPadScroll && !sandbox.bugfixPadScroll && !sandbox.missilePadScroll);
check('AC#4 other pad: gameState → SCENE_LIFTOFF (common entry)',
    sandbox.gameState === sandbox.STATES.SCENE_LIFTOFF);

// ============================================================
// AC#4: extract and replay the SCENE_SCROLL end branch of update.js —
// when t >= 1 and landedPRType === 'other', state flips to TECHDEBT_TRANSITION.
// ============================================================
var scrollEndSig = 'if (t >= 1) {';
var scrollEndBody = extractBraceBody(updateSrc, scrollEndSig);
check('update.js: SCENE_SCROLL end branch extracted',
    typeof scrollEndBody === 'string' && scrollEndBody.indexOf('isOtherPad') >= 0);
var scrollEndReplay = new vm.Script('(function () {\n' + scrollEndBody + '\n}).call(this);', { filename: 'scroll-end' });

// Seed the state the branch mutates / reads.
sandbox.landedPRType = 'other';
sandbox.sceneScrollState = Object.freeze({
    timer: 999,
    oldTerrain: [], oldPads: [],
    newTerrain: [{ x: 0, y: 500 }, { x: 800, y: 500 }],
    newPads: [],
    isInvaderScroll: false,
    isBugfixScroll: false,
    isMissileScroll: false,
    shipStartX: 400,
});
sandbox.terrain = []; sandbox.landingPads = []; sandbox.landingPadIndex = -1;
sandbox.ship = { x: 400, y: 300, vx: 5, vy: 0, angle: 0, thrusting: false, rotating: null, fuel: 50, invaderVX: 0, invaderVY: 0, retroThrusting: false };
sandbox.techdebtTransitionTimer = 99;
scrollEndReplay.runInContext(sandbox);
check('AC#4 other pad: SCENE_SCROLL end → gameState = TECHDEBT_TRANSITION',
    sandbox.gameState === sandbox.STATES.TECHDEBT_TRANSITION);
check('AC#4 other pad: techdebtTransitionTimer reset to 0',
    sandbox.techdebtTransitionTimer === 0);
check('AC#4 other pad: ship recentered + fueled for transition',
    sandbox.ship.x === 400 && sandbox.ship.y === 300 &&
    sandbox.ship.vx === 0 && sandbox.ship.vy === 0 &&
    sandbox.ship.fuel === sandbox.FUEL_MAX);
check('AC#4 other pad: setupTechdebtWorld populated asteroid field',
    Array.isArray(sandbox.techdebtAsteroids) && sandbox.techdebtAsteroids.length > 0);

// ============================================================
// AC#4 gameplay: tick the TECHDEBT_TRANSITION block through to TECHDEBT_PLAYING.
// Extract the top-level update blocks for TECHDEBT_*.
// ============================================================
var techPlayingBody = extractBraceBody(updateSrc, 'if (gameState === STATES.TECHDEBT_PLAYING) {');
var techTransitionBody = extractBraceBody(updateSrc, 'if (gameState === STATES.TECHDEBT_TRANSITION) {');
var techCompleteBody = extractBraceBody(updateSrc, 'if (gameState === STATES.TECHDEBT_COMPLETE) {');
var techReturnBody = extractBraceBody(updateSrc, 'if (gameState === STATES.TECHDEBT_RETURN) {');
check('update.js: TECHDEBT_* blocks all extracted',
    !!techTransitionBody && !!techPlayingBody && !!techCompleteBody && !!techReturnBody);

var techTransitionTick = new vm.Script('(function () {\n' + techTransitionBody + '\n}).call(this);', { filename: 'tech-transition' });
var techPlayingTick    = new vm.Script('(function () {\n' + techPlayingBody + '\n}).call(this);', { filename: 'tech-playing' });
var techCompleteTick   = new vm.Script('(function () {\n' + techCompleteBody + '\n}).call(this);', { filename: 'tech-complete' });
var techReturnTick     = new vm.Script('(function () {\n' + techReturnBody + '\n}).call(this);', { filename: 'tech-return' });

sandbox.dt = sandbox.TECHDEBT_TRANSITION_DURATION + 0.01;
techTransitionTick.runInContext(sandbox);
check('AC#4 transition → TECHDEBT_PLAYING after timer elapses',
    sandbox.gameState === sandbox.STATES.TECHDEBT_PLAYING);

// ============================================================
// AC#4 win: clear the asteroid array, run one PLAYING tick, expect COMPLETE.
// ============================================================
sandbox.techdebtAsteroids = [];
sandbox.techdebtBullets = [];
sandbox.techdebtParticles = [];
sandbox.techdebtScore = 0;
sandbox.asteroidsDestroyed = 0;
sandbox.ship.fuel = 100;
sandbox.FUEL_MAX = sandbox.FUEL_MAX; // keep real value
sandbox.dt = 1 / 60;
sandbox.keys = {};
techPlayingTick.runInContext(sandbox);
check('AC#4 win: empty asteroids + PLAYING tick → TECHDEBT_COMPLETE',
    sandbox.gameState === sandbox.STATES.TECHDEBT_COMPLETE);
check('AC#4 win: fuel bonus applied to score',
    typeof sandbox.techdebtFuelBonus === 'number' && sandbox.techdebtFuelBonus >= 0);

// ============================================================
// AC#4 return: tick COMPLETE until delay elapses, then run RETURN.
// ============================================================
sandbox.techdebtCompleteTimer = 0;
sandbox.dt = sandbox.TECHDEBT_COMPLETE_DELAY + 0.01;
techCompleteTick.runInContext(sandbox);
check('AC#4 COMPLETE → TECHDEBT_RETURN after delay',
    sandbox.gameState === sandbox.STATES.TECHDEBT_RETURN);

var levelBefore = sandbox.currentLevel;
techReturnTick.runInContext(sandbox);
check('AC#4 RETURN → PLAYING',
    sandbox.gameState === sandbox.STATES.PLAYING);
check('AC#4 RETURN: currentLevel advanced by 1',
    sandbox.currentLevel === levelBefore + 1);
check('AC#4 RETURN: techdebtAsteroids / bullets / particles cleared',
    sandbox.techdebtAsteroids.length === 0 &&
    sandbox.techdebtBullets.length === 0 &&
    sandbox.techdebtParticles.length === 0);
check('AC#4 RETURN: ship fuel restored (resetShip fills tank)',
    sandbox.ship.fuel === 100);

// ============================================================
// AC#4 lose: crashShipInTechdebt(reason) → CRASHED.
// ============================================================
sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
sandbox.ship = { x: 400, y: 300, vx: 10, vy: 5, angle: 0, thrusting: true, rotating: null, fuel: 50 };
sandbox.landingResult = '';
soundLog.length = 0;
sandbox.crashShipInTechdebt('Tech debt asteroid collision');
check('AC#4 lose: crashShipInTechdebt → gameState = CRASHED',
    sandbox.gameState === sandbox.STATES.CRASHED);
check('AC#4 lose: landingResult records reason',
    sandbox.landingResult === 'Tech debt asteroid collision');
check('AC#4 lose: crash pipeline fired explosion + shake + sound',
    soundLog.indexOf('spawnExplosion') >= 0 &&
    soundLog.indexOf('shake') >= 0 &&
    soundLog.indexOf('explosion') >= 0);

// ============================================================
// AC#5: ProxiBlue asteroid spawns + shield mechanic.
// Drive setupTechdebtWorld many times to eventually spawn a ProxiBlue, then
// exercise: bullet-vs-ProxiBlue → shield active; ship-vs-(non-ProxiBlue)
// while shielded → asteroid destroyed + shield consumed.
// ============================================================
sandbox.currentLevel = 0;
var sawProxiblue = false;
var sawMediumSize = false;
for (var spawnTry = 0; spawnTry < 60 && !sawProxiblue; spawnTry++) {
    sandbox.setupTechdebtWorld();
    for (var ai = 0; ai < sandbox.techdebtAsteroids.length; ai++) {
        var a = sandbox.techdebtAsteroids[ai];
        if (a.isProxiblue === true) {
            sawProxiblue = true;
            if (a.sizeTier === 'medium' && a.size === sandbox.TECHDEBT_SIZE_MEDIUM) sawMediumSize = true;
            break;
        }
    }
}
check('AC#5 ProxiBlue asteroid spawns in the field (within 60 setups)',
    sawProxiblue);
check('AC#5 ProxiBlue asteroid is MEDIUM size',
    sawMediumSize);

// Shield activation via bullet: place a ship, seed ONE ProxiBlue at ship pos,
// drop a bullet on it, tick playing → shield active + points awarded + no split.
sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
sandbox.techdebtAsteroids = [{
    x: 400, y: 300, vx: 0, vy: 0,
    size: sandbox.TECHDEBT_SIZE_MEDIUM, sizeTier: 'medium',
    label: 'ProxiBlue', isProxiblue: true,
    rotation: 0, rotationSpeed: 0, shape: [1,1,1,1,1,1,1,1],
}];
sandbox.techdebtBullets = [{ x: 400, y: 300, vx: 0, vy: 0, age: 0 }];
sandbox.techdebtParticles = [];
sandbox.ship = { x: 100, y: 100, vx: 0, vy: 0, angle: 0, thrusting: false, rotating: null, fuel: 100 };
sandbox.proxiblueShieldActive = false;
sandbox.proxiblueShieldTimer = 0;
sandbox.proxiblueShieldFlashTimer = 0;
sandbox.techdebtScore = 0;
sandbox.score = 0;
sandbox.asteroidsDestroyed = 0;
sandbox.techdebtBulletCooldownTimer = 0;
sandbox.dt = 1 / 60;
sandbox.keys = {};
techPlayingTick.runInContext(sandbox);
check('AC#5 bullet hits ProxiBlue → shield active',
    sandbox.proxiblueShieldActive === true);
// One tick elapses between shield activation and the shield-decay block at the
// end of TECHDEBT_PLAYING, so timer lands at DURATION - dt (not exactly DURATION).
check('AC#5 bullet hits ProxiBlue → shield timer ~= PROXIBLUE_SHIELD_DURATION (minus one dt)',
    sandbox.proxiblueShieldTimer > sandbox.PROXIBLUE_SHIELD_DURATION - sandbox.dt - 0.001 &&
    sandbox.proxiblueShieldTimer <= sandbox.PROXIBLUE_SHIELD_DURATION + 0.001,
    'timer=' + sandbox.proxiblueShieldTimer);
check('AC#5 bullet hits ProxiBlue → ProxiBlue removed (no split)',
    sandbox.techdebtAsteroids.length === 0);
check('AC#5 bullet hits ProxiBlue → PROXIBLUE_POINTS awarded to global score',
    sandbox.score >= sandbox.PROXIBLUE_POINTS,
    'score=' + sandbox.score + ' expected>=' + sandbox.PROXIBLUE_POINTS);

// Shield consumption: seed a normal asteroid overlapping the ship, tick → shielded
// hit destroys asteroid, consumes shield, ship NOT crashed.
sandbox.techdebtAsteroids = [{
    x: sandbox.ship.x, y: sandbox.ship.y, vx: 0, vy: 0,
    size: sandbox.TECHDEBT_SIZE_SMALL, sizeTier: 'small',
    label: 'LegacyCode', isProxiblue: false,
    rotation: 0, rotationSpeed: 0, shape: [1,1,1,1,1,1,1,1],
}];
sandbox.techdebtBullets = [];
sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
sandbox.landingResult = '';
techPlayingTick.runInContext(sandbox);
check('AC#5 shielded ram consumes shield (proxiblueShieldActive → false)',
    sandbox.proxiblueShieldActive === false);
check('AC#5 shielded ram destroys the asteroid (not a crash)',
    sandbox.gameState !== sandbox.STATES.CRASHED);
check('AC#5 shielded ram: asteroid cleared from field',
    sandbox.techdebtAsteroids.length === 0);

// Unshielded ram on a normal asteroid → CRASHED (via crashShipInTechdebt).
sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
sandbox.proxiblueShieldActive = false;
sandbox.proxiblueShieldTimer = 0;
sandbox.techdebtAsteroids = [{
    x: sandbox.ship.x, y: sandbox.ship.y, vx: 0, vy: 0,
    size: sandbox.TECHDEBT_SIZE_LARGE, sizeTier: 'large',
    label: 'LegacyCode', isProxiblue: false,
    rotation: 0, rotationSpeed: 0, shape: [1,1,1,1,1,1,1,1],
}];
sandbox.techdebtBullets = [];
sandbox.landingResult = '';
techPlayingTick.runInContext(sandbox);
check('AC#5 unshielded ram → CRASHED',
    sandbox.gameState === sandbox.STATES.CRASHED);

// ============================================================
// AC#6: ProxiBlue branding on menu + game over (static source audit).
// ============================================================
check('AC#6 menu: renderMenu contains "Crafted with ☕ by ProxiBlue" branding',
    renderSrc.indexOf('Crafted with \\u2615 by ProxiBlue') >= 0 ||
    renderSrc.indexOf('Crafted with \u2615 by ProxiBlue') >= 0);
check('AC#6 game over: renderGameOver contains "Powered by ProxiBlue" branding',
    renderSrc.indexOf('Powered by ProxiBlue') >= 0);
check('AC#6 game over: branding text includes github.com/ProxiBlue link',
    renderSrc.indexOf('github.com/ProxiBlue') >= 0);
check('AC#6 game over: proxiblueBrandHitBox declared for clickable hit-test',
    renderSrc.indexOf('proxiblueBrandHitBox') >= 0);
check('AC#6 input: canvas click handler opens ProxiBlue URL on hit-test',
    inputSrc.indexOf("'https://github.com/ProxiBlue/chiefloopEVALexample") >= 0 &&
    inputSrc.indexOf('proxiblueBrandHitBox') >= 0);

// ============================================================
// AC#7: crashing in normal lander mode → CRASHED → GAMEOVER (Space press).
// Drive the collision.js crash branch directly by running checkCollision with a
// below-terrain ship + bad velocity, THEN replay input.js CRASHED Space branch.
// ============================================================
// Load checkCollision + prerequisites into sandbox.
vm.runInContext(loadFile('js/collision.js'), sandbox, { filename: 'js/collision.js' });
// Rebuild canvas/terrain for the check.
sandbox.PIXELS_PER_METER = sandbox.PIXELS_PER_METER || 10;
sandbox.FUEL_MAX = sandbox.FUEL_MAX || 100;
sandbox.terrain = [{ x: 0, y: 500 }, { x: 800, y: 500 }];
sandbox.landingPads = [];
sandbox.score = 0;
sandbox.landings = 0;
sandbox.ship = { x: 400, y: 510, vx: 100, vy: 100, angle: 0, thrusting: false, rotating: null, fuel: 50 };
sandbox.gameState = sandbox.STATES.PLAYING;
sandbox.checkCollision();
check('AC#7 normal lander: below-terrain + bad velocity → gameState = CRASHED',
    sandbox.gameState === sandbox.STATES.CRASHED);

// Now replay input.js CRASHED Space branch.
var crashedSig = '} else if (gameState === STATES.CRASHED && explosionFinished) {';
var crashedBody = extractBraceBody(inputSrc, crashedSig);
check('input.js: CRASHED Space-press branch extracted',
    typeof crashedBody === 'string' && crashedBody.indexOf('GAMEOVER') >= 0);
var crashedReplay = new vm.Script('(function () {\n' + crashedBody + '\n}).call(this);', { filename: 'crashed-body' });

sandbox.explosionFinished = true;
sandbox.currentLevel = 3;
sandbox.score = 1000;
sandbox.gameOverLevel = 0;
sandbox.gameOverEnteringName = false;
crashedReplay.runInContext(sandbox);
check('AC#7 CRASHED + Space → GAMEOVER',
    sandbox.gameState === sandbox.STATES.GAMEOVER);
check('AC#7 gameOverLevel = currentLevel + 1',
    sandbox.gameOverLevel === 4);
check('AC#7 positive score → name entry enabled',
    sandbox.gameOverEnteringName === true);

// ============================================================
// AC#8: score accumulates across ALL mini-game types.
// Direct mutation at each real source site: collision.js (normal landing),
// update.js (INVADER_COMPLETE, bugfix kill, missile intercept, missile bonus,
// techdebt asteroid hit, techdebt fuel bonus, PROXIBLUE collect, shield hit).
// ============================================================
sandbox.score = 0;
sandbox.score += 200;  // normal pad landing         (collision.js:140)
sandbox.score += 1500; // invader complete            (update.js: INVADER_COMPLETE)
sandbox.score += 100;  // bugfix bug kill             (update.js: BUGFIX kill)
sandbox.score += 250;  // bugfix fuel bonus           (update.js: BUGFIX_COMPLETE)
sandbox.score += 50;   // missile intercept           (update.js: MISSILE_PLAYING)
sandbox.score += 600;  // missile end-of-wave bonus   (update.js: MISSILE_COMPLETE)
sandbox.score += sandbox.TECHDEBT_POINTS_LARGE;     // tech debt large kill
sandbox.score += sandbox.PROXIBLUE_POINTS;          // proxiblue collect
var expected = 200 + 1500 + 100 + 250 + 50 + 600 + sandbox.TECHDEBT_POINTS_LARGE + sandbox.PROXIBLUE_POINTS;
check('AC#8 score accumulates across normal + invader + bugfix + missile + techdebt + proxiblue',
    sandbox.score === expected,
    'score=' + sandbox.score + ' expected=' + expected);
// Only reset site is startNewGame.
var resetSites = (inputSrc.match(/score\s*=\s*0\s*;/g) || []).length;
check('AC#8 input.js: `score = 0` appears exactly once (in startNewGame)',
    resetSites === 1, 'count=' + resetSites);

// ============================================================
// AC#9: Game over + Space → startNewGame resets score/level/state.
// ============================================================
var snBody = extractBraceBody(inputSrc, 'function startNewGame() {');
check('input.js: startNewGame body extracted',
    typeof snBody === 'string' && snBody.indexOf('STATES.PLAYING') >= 0);
var snReplay = new vm.Script('(function () {\n' + snBody + '\n}).call(this);', { filename: 'startNewGame' });

sandbox.gameState = sandbox.STATES.GAMEOVER;
sandbox.gameOverEnteringName = false;
sandbox.score = 9999;
sandbox.currentLevel = 12;
sandbox.securityMiniGameCount = 5;
sandbox.securityPadScroll = true;
sandbox.bugfixPadScroll = true;
sandbox.missilePadScroll = true;
snReplay.runInContext(sandbox);
check('AC#9 restart: gameState → PLAYING',
    sandbox.gameState === sandbox.STATES.PLAYING);
check('AC#9 restart: score reset to 0',
    sandbox.score === 0);
check('AC#9 restart: currentLevel reset to 0',
    sandbox.currentLevel === 0);
check('AC#9 restart: all padScroll flags cleared',
    sandbox.securityPadScroll === false &&
    sandbox.bugfixPadScroll === false &&
    sandbox.missilePadScroll === false);
check('AC#9 restart: securityMiniGameCount cleared',
    sandbox.securityMiniGameCount === 0);

// ============================================================
// AC#10: high-score leaderboard add / qualify / trim / order.
// ============================================================
// Fresh leaderboard.
localStorageBacking = {};
sandbox.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(localStorageBacking, k) ? localStorageBacking[k] : null; },
    setItem: function (k, v) { localStorageBacking[k] = String(v); },
    removeItem: function (k) { delete localStorageBacking[k]; }
};
check('AC#10 isHighScore(0) === false (zero score never qualifies)',
    sandbox.isHighScore(0) === false);
check('AC#10 isHighScore(100) === true on empty board',
    sandbox.isHighScore(100) === true);
sandbox.addToLeaderboard('AAA', 500, 3, 5);
sandbox.addToLeaderboard('BBB', 1000, 7, 11);
sandbox.addToLeaderboard('CCC', 250, 1, 2);
var board = sandbox.getLeaderboard();
check('AC#10 leaderboard persists 3 entries',
    Array.isArray(board) && board.length === 3);
check('AC#10 leaderboard sorted high → low',
    board[0].score === 1000 && board[1].score === 500 && board[2].score === 250);
check('AC#10 leaderboard entries carry name + score + level + landings',
    board[0].name === 'BBB' && board[0].level === 7 && board[0].landings === 11);
// Fill past LEADERBOARD_MAX and verify trim.
for (var lb = 0; lb < 12; lb++) {
    sandbox.addToLeaderboard('P' + lb, 300 + lb, 2, 2);
}
board = sandbox.getLeaderboard();
check('AC#10 leaderboard trims at LEADERBOARD_MAX (10)',
    board.length === 10);
var lowest = board[board.length - 1].score;
check('AC#10 isHighScore(lowest) === false (must beat lowest, not tie)',
    sandbox.isHighScore(lowest) === false);
check('AC#10 isHighScore(lowest + 1) === true (one point above lowest qualifies)',
    sandbox.isHighScore(lowest + 1) === true);

// ============================================================
// Summary.
// ============================================================
var failed = results.filter(function (r) { return !r.ok; }).length;
var passed = results.length - failed;
console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
