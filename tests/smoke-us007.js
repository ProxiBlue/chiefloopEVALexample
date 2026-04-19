// US-007: No-regression smoke test for the invader mini-game thruster physics.
//
// Extracts the real INVADER_PLAYING block from js/update.js and replays it in a
// vm sandbox seeded by js/config.js, stepping the simulation frame-by-frame with
// controlled `keys` input so every acceptance criterion is exercised against
// the actual shipped bytes (same pattern as smoke-us015.js).
//
// Acceptance criteria mapped:
//   AC#1  Right → accelerates right with ship.thrusting = true; release → drifts + drag.
//   AC#2  Left → ship.retroThrusting = true, vx decreases.
//   AC#3  Up → main thrust, vy decreases; Down → retro thrust, vy increases.
//   AC#4  Ship bounces off canvas edges (velocity zeroed at boundary, position clamped).
//   AC#5  No fuel consumed during invader movement.
//   AC#6  Ship-alien collision triggers INVADER_COMPLETE.
//   AC#7  Bullet firing with Space still works while moving.
//   AC#8  drawShip() receives `false` for retroThrusting in all non-invader contexts.
//   AC#9  Bugfix mini-game uses normal lander physics (no invaderVX/retroThrusting).
//   AC#10 Missile command is crosshair-based (no ship movement via invader physics).
//   AC#11 Lander drawShip() still passes ship.thrusting / ship.rotating / false.
//   AC#12 Thrust sound fires with correct mode on press; stops on release.
//
// Run:  node tests/smoke-us007.js
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

// ----- Sound-call capture: every startThrustSound / stopThrustSound / playShootSound is logged -----
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
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    keys: {},
    startThrustSound: function (mode) { soundLog.push({ fn: 'startThrustSound', mode: mode || 'main' }); },
    stopThrustSound: function () { soundLog.push({ fn: 'stopThrustSound' }); },
    playShootSound: function () { soundLog.push({ fn: 'playShootSound' }); },
    playExplosionSound: function () { soundLog.push({ fn: 'playExplosionSound' }); },
    playAlienDestroySound: function () { soundLog.push({ fn: 'playAlienDestroySound' }); },
    spawnExplosion: function () { soundLog.push({ fn: 'spawnExplosion' }); },
    spawnAlienExplosion: function () { soundLog.push({ fn: 'spawnAlienExplosion' }); },
    updateAlienExplosions: function () {},
    startScreenShake: function () {},
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Load config.js — real STATES, INVADER_* constants, BULLET_*, TERRAIN_FLAT_Y_RATIO, etc.
vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });
// SHIP_SIZE lives in js/collision.js (not config.js); seed it with the real value
// so the invader body's canvas-bound clamp (`SHIP_SIZE`) resolves.
sandbox.SHIP_SIZE = 40;

// Sanity: confirm the constants the physics block relies on are present & correct.
check('config.js: STATES.INVADER_PLAYING exists',
    sandbox.STATES && sandbox.STATES.INVADER_PLAYING === 'invader_playing');
check('config.js: INVADER_THRUST_POWER = 300',
    sandbox.INVADER_THRUST_POWER === 300);
check('config.js: INVADER_RETRO_POWER = 250',
    sandbox.INVADER_RETRO_POWER === 250);
check('config.js: INVADER_DRAG < 1 (per-frame drag coefficient)',
    typeof sandbox.INVADER_DRAG === 'number' && sandbox.INVADER_DRAG > 0 && sandbox.INVADER_DRAG < 1);
check('config.js: INVADER_MAX_SPEED > 0',
    typeof sandbox.INVADER_MAX_SPEED === 'number' && sandbox.INVADER_MAX_SPEED > 0);

// Seed the globals the INVADER_PLAYING block mutates / reads.
sandbox.gameState = sandbox.STATES.INVADER_PLAYING;
sandbox.dt = 1 / 60;
sandbox.ship = {
    x: 400, y: 300, vx: 0, vy: 0,
    invaderVX: 0, invaderVY: 0,
    angle: 0, thrusting: false, retroThrusting: false,
    rotating: null, fuel: 100
};
sandbox.bullets = [];
sandbox.aliens = [];
sandbox.aliensSpawned = true;
sandbox.aliensDestroyed = 0;
sandbox.invaderScore = 0;
sandbox.bulletCooldownTimer = 0;
sandbox.invaderCompleteTimer = 0;

// ===== Extract and replay the INVADER_PLAYING block =====
var updateSrc = loadFile('js/update.js');
var invaderSig = 'if (gameState === STATES.INVADER_PLAYING) {';
// Multiple occurrences; pick the one inside updateGame, not the guard before it.
var invaderMatches = [];
var pos = 0;
while ((pos = updateSrc.indexOf(invaderSig, pos)) !== -1) {
    invaderMatches.push(pos);
    pos += invaderSig.length;
}
// The physics block is the first one after the `Invader playing:` comment marker.
var comment = updateSrc.indexOf('// Invader playing:');
var invaderStart = -1;
for (var mi = 0; mi < invaderMatches.length; mi++) {
    if (invaderMatches[mi] > comment) { invaderStart = invaderMatches[mi]; break; }
}
check('update.js: INVADER_PLAYING physics block located',
    invaderStart > 0, 'invaderStart: ' + invaderStart);

var braceOpen = updateSrc.indexOf('{', invaderStart + invaderSig.length - 1);
var depth = 0, braceClose = -1;
for (var i = braceOpen; i < updateSrc.length; i++) {
    if (updateSrc[i] === '{') depth++;
    else if (updateSrc[i] === '}') {
        depth--;
        if (depth === 0) { braceClose = i; break; }
    }
}
var invaderBody = updateSrc.slice(braceOpen + 1, braceClose);
check('update.js: INVADER_PLAYING body contains thrust+retro physics',
    invaderBody.indexOf('INVADER_THRUST_POWER') >= 0 &&
    invaderBody.indexOf('INVADER_RETRO_POWER') >= 0 &&
    invaderBody.indexOf('INVADER_DRAG') >= 0 &&
    invaderBody.indexOf('retroThrusting') >= 0);

var invaderReplay = new vm.Script('(function () {\n' + invaderBody + '\n}).call(this);', { filename: 'invader-body' });

function stepFrames(n) {
    for (var k = 0; k < n; k++) invaderReplay.runInContext(sandbox);
}

function resetShipForTest() {
    sandbox.ship.x = 400; sandbox.ship.y = 300;
    sandbox.ship.invaderVX = 0; sandbox.ship.invaderVY = 0;
    sandbox.ship.thrusting = false; sandbox.ship.retroThrusting = false;
    sandbox.ship.fuel = 100;
    sandbox.bullets = [];
    sandbox.aliens = [];
    sandbox.bulletCooldownTimer = 0;
    sandbox.keys = {};
    soundLog = [];
    // Required so the aliens-empty end-condition doesn't immediately trigger.
    sandbox.aliensSpawned = false;
}

// ===== AC#1 Right → accelerates right with main thruster; release → drifts, drag slows =====
resetShipForTest();
sandbox.keys = { 'ArrowRight': true };
stepFrames(10);
check('AC#1 Right pressed: ship.invaderVX > 0 (accelerates right)',
    sandbox.ship.invaderVX > 0,
    'invaderVX: ' + sandbox.ship.invaderVX);
check('AC#1 Right pressed: ship.thrusting = true (main thruster flame)',
    sandbox.ship.thrusting === true);
check('AC#1 Right pressed: ship.x advanced from 400',
    sandbox.ship.x > 400, 'ship.x: ' + sandbox.ship.x);
check('AC#1 Right pressed: startThrustSound("main") called',
    soundLog.some(function (s) { return s.fn === 'startThrustSound' && s.mode === 'main'; }));

var vxAfterPress = sandbox.ship.invaderVX;
var xAfterPress = sandbox.ship.x;
sandbox.keys = {};
soundLog = [];
stepFrames(10);
check('AC#1 Released: ship.thrusting = false (no thrust flag without input)',
    sandbox.ship.thrusting === false && sandbox.ship.retroThrusting === false);
check('AC#1 Released: ship drifts forward (x keeps increasing)',
    sandbox.ship.x > xAfterPress);
check('AC#1 Released: drag reduces velocity toward zero',
    Math.abs(sandbox.ship.invaderVX) < Math.abs(vxAfterPress),
    'vxAfter=' + vxAfterPress + ' now=' + sandbox.ship.invaderVX);
check('AC#1 Released: stopThrustSound called (no thrust = sound stops)',
    soundLog.some(function (s) { return s.fn === 'stopThrustSound'; }));

// ===== AC#2 Left → retro (blue-white front-of-M) =====
resetShipForTest();
sandbox.keys = { 'ArrowLeft': true };
stepFrames(10);
check('AC#2 Left pressed: ship.invaderVX < 0 (moves left)',
    sandbox.ship.invaderVX < 0,
    'invaderVX: ' + sandbox.ship.invaderVX);
check('AC#2 Left pressed: ship.retroThrusting = true (retro flames shown)',
    sandbox.ship.retroThrusting === true);
check('AC#2 Left pressed: ship.thrusting = false (not main)',
    sandbox.ship.thrusting === false);
check('AC#2 Left pressed: startThrustSound("retro") dispatched (audibly distinct)',
    soundLog.some(function (s) { return s.fn === 'startThrustSound' && s.mode === 'retro'; }));

// Verify the retro flame render block in ship.js uses the blue-white gradient
// at the two top tips of the M (SVG coords 0,30.8 and 160.2,30.8).
var shipSrc = loadFile('js/ship.js');
check('AC#2 Retro flame: ship.js renders #88CCFF → #FFFFFF gradient',
    shipSrc.indexOf("'#88CCFF'") >= 0 && shipSrc.indexOf("'#FFFFFF'") >= 0);
check('AC#2 Retro flame: fires from SVG top tips 30.8 (front-of-M)',
    /30\.8\s*\*\s*jny/.test(shipSrc));
check('AC#2 Retro flame: gated by retroThrusting parameter',
    /if\s*\(\s*retroThrusting\s*\)/.test(shipSrc));

// ===== AC#3 Up → main thrust; Down → retro thrust =====
resetShipForTest();
sandbox.keys = { 'ArrowUp': true };
stepFrames(10);
check('AC#3 Up pressed: ship.invaderVY < 0 (moves up)',
    sandbox.ship.invaderVY < 0, 'invaderVY: ' + sandbox.ship.invaderVY);
check('AC#3 Up pressed: ship.thrusting = true (main thruster)',
    sandbox.ship.thrusting === true);
check('AC#3 Up pressed: ship.retroThrusting = false',
    sandbox.ship.retroThrusting === false);

resetShipForTest();
sandbox.keys = { 'ArrowDown': true };
stepFrames(10);
check('AC#3 Down pressed: ship.invaderVY > 0 (moves down)',
    sandbox.ship.invaderVY > 0, 'invaderVY: ' + sandbox.ship.invaderVY);
check('AC#3 Down pressed: ship.retroThrusting = true (retro flames)',
    sandbox.ship.retroThrusting === true);
check('AC#3 Down pressed: ship.thrusting = false',
    sandbox.ship.thrusting === false);

// Diagonal (Up+Left) should light BOTH main and retro flames simultaneously.
resetShipForTest();
sandbox.keys = { 'ArrowUp': true, 'ArrowLeft': true };
stepFrames(5);
check('AC#3 Up+Left pressed: both thrusting and retroThrusting true',
    sandbox.ship.thrusting === true && sandbox.ship.retroThrusting === true);
check('AC#3 Up+Left pressed: vx < 0 and vy < 0 (diagonal up-left)',
    sandbox.ship.invaderVX < 0 && sandbox.ship.invaderVY < 0);

// ===== AC#4 Bounces off canvas edges — velocity zeroed, position clamped =====
// Right edge
resetShipForTest();
sandbox.ship.x = sandbox.canvas.width - sandbox.SHIP_SIZE - 5;
sandbox.ship.invaderVX = sandbox.INVADER_MAX_SPEED;
sandbox.keys = { 'ArrowRight': true };
stepFrames(30);
check('AC#4 Right edge: ship.x clamped to canvas.width - SHIP_SIZE',
    sandbox.ship.x === sandbox.canvas.width - sandbox.SHIP_SIZE,
    'ship.x: ' + sandbox.ship.x);
check('AC#4 Right edge: ship.invaderVX zeroed at boundary',
    sandbox.ship.invaderVX === 0,
    'invaderVX: ' + sandbox.ship.invaderVX);

// Left edge
resetShipForTest();
sandbox.ship.x = sandbox.SHIP_SIZE + 5;
sandbox.ship.invaderVX = -sandbox.INVADER_MAX_SPEED;
sandbox.keys = { 'ArrowLeft': true };
stepFrames(30);
check('AC#4 Left edge: ship.x clamped to SHIP_SIZE',
    sandbox.ship.x === sandbox.SHIP_SIZE,
    'ship.x: ' + sandbox.ship.x);
check('AC#4 Left edge: ship.invaderVX zeroed at boundary',
    sandbox.ship.invaderVX === 0);

// Top edge (y < 80)
resetShipForTest();
sandbox.ship.y = 100;
sandbox.ship.invaderVY = -sandbox.INVADER_MAX_SPEED;
sandbox.keys = { 'ArrowUp': true };
stepFrames(30);
check('AC#4 Top edge: ship.y clamped to 80 (HUD margin)',
    sandbox.ship.y === 80, 'ship.y: ' + sandbox.ship.y);
check('AC#4 Top edge: ship.invaderVY zeroed at boundary',
    sandbox.ship.invaderVY === 0);

// Bottom edge (y > flatY - 40)
resetShipForTest();
var flatY = sandbox.canvas.height * sandbox.TERRAIN_FLAT_Y_RATIO;
sandbox.ship.y = flatY - 50;
sandbox.ship.invaderVY = sandbox.INVADER_MAX_SPEED;
sandbox.keys = { 'ArrowDown': true };
stepFrames(30);
check('AC#4 Bottom edge: ship.y clamped to flatY - 40',
    Math.abs(sandbox.ship.y - (flatY - 40)) < 0.0001, 'ship.y: ' + sandbox.ship.y);
check('AC#4 Bottom edge: ship.invaderVY zeroed at boundary',
    sandbox.ship.invaderVY === 0);

// Velocity magnitude is clamped to INVADER_MAX_SPEED (not per-axis).
resetShipForTest();
sandbox.ship.invaderVX = sandbox.INVADER_MAX_SPEED;
sandbox.ship.invaderVY = sandbox.INVADER_MAX_SPEED;
sandbox.keys = {};
stepFrames(2);
var speed = Math.sqrt(sandbox.ship.invaderVX * sandbox.ship.invaderVX + sandbox.ship.invaderVY * sandbox.ship.invaderVY);
check('AC#4 Velocity-magnitude clamp: sqrt(vx²+vy²) ≤ INVADER_MAX_SPEED (no √2·MAX diagonal)',
    speed <= sandbox.INVADER_MAX_SPEED + 0.0001,
    'speed: ' + speed);

// ===== AC#5 No fuel consumed during invader movement =====
resetShipForTest();
sandbox.ship.fuel = 100;
sandbox.keys = { 'ArrowUp': true, 'ArrowRight': true };
stepFrames(120); // 2 seconds of constant thrust
check('AC#5 Fuel unchanged after 2s of Up+Right thrust (no fuel consumed in invader mode)',
    sandbox.ship.fuel === 100, 'fuel: ' + sandbox.ship.fuel);
check('AC#5 INVADER_PLAYING body never decrements ship.fuel',
    invaderBody.indexOf('ship.fuel') === -1);

// ===== AC#6 Ship-alien collision → INVADER_COMPLETE =====
resetShipForTest();
sandbox.aliensSpawned = true;
sandbox.ship.x = 400; sandbox.ship.y = 300;
// Plant an alien right on the ship.
sandbox.aliens = [{ x: 400, y: 300 }];
sandbox.keys = {};
stepFrames(1);
check('AC#6 Ship-alien collision: gameState → INVADER_COMPLETE',
    sandbox.gameState === sandbox.STATES.INVADER_COMPLETE,
    'gameState: ' + sandbox.gameState);
check('AC#6 Ship-alien collision: playExplosionSound dispatched',
    soundLog.some(function (s) { return s.fn === 'playExplosionSound'; }));
check('AC#6 Ship-alien collision: stopThrustSound called before transition (cleanup)',
    soundLog.some(function (s) { return s.fn === 'stopThrustSound'; }));
check('AC#6 Ship-alien collision: thrust flags cleared',
    sandbox.ship.thrusting === false && sandbox.ship.retroThrusting === false);

// Reset gameState so subsequent replays run the INVADER_PLAYING body again.
sandbox.gameState = sandbox.STATES.INVADER_PLAYING;

// ===== AC#7 Bullet firing with Space while moving =====
resetShipForTest();
sandbox.ship.x = 200; sandbox.ship.y = 300;
sandbox.aliens = []; sandbox.aliensSpawned = false;
sandbox.keys = { 'ArrowRight': true, ' ': true };
stepFrames(1);
check('AC#7 Space while moving: bullet pushed into bullets[]',
    sandbox.bullets.length === 1,
    'bullets: ' + sandbox.bullets.length);
check('AC#7 Space while moving: playShootSound called',
    soundLog.some(function (s) { return s.fn === 'playShootSound'; }));
check('AC#7 Space while moving: ship still accelerated (vx > 0)',
    sandbox.ship.invaderVX > 0);
// Cooldown: a second bullet the very next frame should NOT fire (BULLET_COOLDOWN > dt).
var bulletsAfterFirst = sandbox.bullets.length;
stepFrames(1);
check('AC#7 Bullet cooldown enforced (no fire next frame)',
    sandbox.bullets.length === bulletsAfterFirst);
// After BULLET_COOLDOWN seconds, a second bullet may fire.
var framesForCooldown = Math.ceil(sandbox.BULLET_COOLDOWN / sandbox.dt) + 1;
stepFrames(framesForCooldown);
check('AC#7 After cooldown elapses: another bullet fires while Space held + moving',
    sandbox.bullets.length >= bulletsAfterFirst + 1);

// ===== AC#8 All non-invader drawShip() call sites pass `false` for retroThrusting =====
var renderSrc = loadFile('js/render.js');
// Collect every drawShip(...) call and count the 7th argument.
var drawShipRegex = /drawShip\(\s*([^;]*?)\);/g;
var drawShipCalls = [];
var dsm;
while ((dsm = drawShipRegex.exec(renderSrc)) !== null) {
    drawShipCalls.push(dsm[1].replace(/\s+/g, ' ').trim());
}
check('AC#8 render.js: expected number of drawShip() call sites (>= 14)',
    drawShipCalls.length >= 14,
    'found ' + drawShipCalls.length);

var retroLive = drawShipCalls.filter(function (args) {
    // 7th arg is the last comma-separated token. Look for ship.retroThrusting.
    return /ship\.retroThrusting/.test(args);
});
var retroFalse = drawShipCalls.filter(function (args) {
    return /,\s*false\s*$/.test(args);
});
check('AC#8 Exactly one drawShip() passes ship.retroThrusting (the INVADER_PLAYING site)',
    retroLive.length === 1,
    'sites: ' + retroLive.length);
check('AC#8 Remaining drawShip() sites explicitly pass `false` (not undefined)',
    retroFalse.length === drawShipCalls.length - 1,
    'false=' + retroFalse.length + ' of ' + drawShipCalls.length);

// ===== AC#9 Bugfix mini-game uses normal lander physics (no invader constants) =====
// Bugfix block is inside updateGame() — locate by state token.
var bugfixBlockStart = updateSrc.indexOf("gameState === STATES.BUGFIX_PLAYING");
check('update.js: BUGFIX_PLAYING state block present',
    bugfixBlockStart > 0);
// Read a 2KB window after the bugfix state guard to inspect its physics.
var bugfixBlock = updateSrc.slice(bugfixBlockStart, bugfixBlockStart + 2000);
check('AC#9 Bugfix block does NOT reference invaderVX/invaderVY/retroThrusting',
    bugfixBlock.indexOf('invaderVX') === -1 &&
    bugfixBlock.indexOf('invaderVY') === -1 &&
    bugfixBlock.indexOf('retroThrusting') === -1);
check('AC#9 Bugfix block uses normal ship.vx / ship.vy (lander physics)',
    bugfixBlock.indexOf('ship.vx') >= 0 && bugfixBlock.indexOf('ship.vy') >= 0);

// ===== AC#10 Missile command is crosshair-based (no ship movement) =====
var missilePlayingStart = updateSrc.indexOf("gameState === STATES.MISSILE_PLAYING");
check('update.js: MISSILE_PLAYING state block present',
    missilePlayingStart > 0);
var missileBlock = updateSrc.slice(missilePlayingStart, missilePlayingStart + 4000);
check('AC#10 Missile block references missileCrosshairX/Y (crosshair-based input)',
    missileBlock.indexOf('missileCrosshairX') >= 0 && missileBlock.indexOf('missileCrosshairY') >= 0);
check('AC#10 Missile block does NOT reference invaderVX / retroThrusting / INVADER_THRUST_POWER',
    missileBlock.indexOf('invaderVX') === -1 &&
    missileBlock.indexOf('retroThrusting') === -1 &&
    missileBlock.indexOf('INVADER_THRUST_POWER') === -1);

// ===== AC#11 Lander drawShip() still passes ship.thrusting, ship.rotating, false =====
// The renderPlaying site (normal lander gameplay) is at render.js:129.
check('AC#11 Lander drawShip call passes (ship.thrusting, ship.rotating, false)',
    /drawShip\(ship\.x,\s*ship\.y,\s*ship\.angle,\s*SHIP_SIZE,\s*ship\.thrusting,\s*ship\.rotating,\s*false\)/.test(renderSrc));

// ===== AC#12 Thrust sound plays/stops with the right mode on press/release =====
resetShipForTest();
sandbox.keys = { 'ArrowRight': true };
stepFrames(1);
check('AC#12 Press Right: startThrustSound("main") (main takes priority)',
    soundLog.length >= 1 &&
    soundLog[soundLog.length - 1].fn === 'startThrustSound' &&
    soundLog[soundLog.length - 1].mode === 'main');

soundLog = [];
sandbox.keys = { 'ArrowLeft': true };
stepFrames(1);
check('AC#12 Press Left: startThrustSound("retro") (audibly distinct from main)',
    soundLog.some(function (s) { return s.fn === 'startThrustSound' && s.mode === 'retro'; }));

soundLog = [];
sandbox.keys = { 'ArrowUp': true, 'ArrowDown': true };
stepFrames(1);
check('AC#12 Up+Down: main takes priority in sound gate → startThrustSound("main")',
    soundLog.some(function (s) { return s.fn === 'startThrustSound' && s.mode === 'main'; }));

soundLog = [];
sandbox.keys = {};
stepFrames(1);
check('AC#12 Release all keys: stopThrustSound dispatched (sound stops)',
    soundLog.some(function (s) { return s.fn === 'stopThrustSound'; }));

// Confirm the differentiated thrust-mode profiles exist in audio.js.
var audioSrc = loadFile('js/audio.js');
check('AC#12 audio.js: THRUST_MODE_PROFILES has distinct main vs retro entries',
    /THRUST_MODE_PROFILES\s*=\s*\{[\s\S]*main\s*:\s*\{[\s\S]*retro\s*:\s*\{/.test(audioSrc));
check('AC#12 audio.js: retro profile uses different oscFreq than main',
    /main\s*:\s*\{[^}]*oscFreq:\s*42[^}]*\}/.test(audioSrc) &&
    /retro\s*:\s*\{[^}]*oscFreq:\s*120[^}]*\}/.test(audioSrc));

// ===== Summary =====
var failed = results.filter(function (r) { return !r.ok; }).length;
var passed = results.length - failed;
console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
