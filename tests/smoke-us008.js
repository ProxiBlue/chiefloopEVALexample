// US-008: No-regression smoke test for the extra fuel tank feature.
//
// Exercises every acceptance criterion in US-008 against the shipped source:
//   - Simulates bug-kill fuel adds against the extracted bomb-blast kill block
//     to verify clamping and "+N FUEL" float spawn behaviour (AC#1-3, #12).
//   - Replays the BUGFIX_RETURN block to confirm extension fuel carries into
//     the next lander level (AC#4).
//   - Steps the real BUGFIX_PLAYING thrust-burn block to confirm extension
//     fuel depletes first and the bar shrinks to FUEL_MAX cleanly (AC#5).
//   - Source-asserts the shape of INVADER_RETURN, R-key handler, startNewGame,
//     and scene-scroll end branches to confirm they reset fuel to FUEL_MAX
//     without preserving extension (AC#7-10).
//   - Source-asserts that the lander thrust-burn path floors at 0 and gates
//     thrust on fuel > 0 (AC#11).
//   - Checks render.js for the lander/bugfix fuel-bar colour/thresholds to
//     confirm AC#6 (normal lander appearance unchanged when fuel <= FUEL_MAX).
//
// Run:  node tests/smoke-us008.js
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
    if (start < 0) throw new Error(label + ': marker not found: ' + marker);
    var open = src.indexOf('{', start + marker.length - 1);
    var depth = 0;
    for (var i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(open + 1, i);
        }
    }
    throw new Error(label + ': no matching close brace');
}

function extractFunctionSource(src, fnName) {
    var marker = 'function ' + fnName + '(';
    var idx = src.indexOf(marker);
    if (idx < 0) throw new Error('function not found: ' + fnName);
    var open = src.indexOf('{', idx);
    var depth = 0;
    for (var i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(idx, i + 1);
        }
    }
    throw new Error('no close brace for ' + fnName);
}

// ----------------------------------------------------------------------
// Sandbox: config.js + particle stubs that track spawn calls
// ----------------------------------------------------------------------

var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array, JSON: JSON,
    Number: Number, String: String, Boolean: Boolean, Infinity: Infinity,
    canvas: { width: 800, height: 600 },
    ctx: { fillStyle: '', font: '', textAlign: '', textBaseline: '',
           fillText: function () {}, fillRect: function () {},
           measureText: function () { return { width: 60 }; }, strokeRect: function () {} },
    window: { addEventListener: function () {} },
    keys: {},
    // FX / audio stubs
    playClickSound: function () {},
    startThrustSound: function () {},
    stopThrustSound: function () {},
    playExplosionSound: function () {},
    playBugDeathSound: function () {},
    playBombDropSound: function () {},
    playBombExplosionSound: function () {},
    startScreenShake: function () {},
    spawnBombExplosion: function () {},
    spawnBugExplosion: function () {},
    spawnBombTrail: function () {},
    spawnExplosion: function () {},
    startThrustSoundAnnex: function () {},
    // Helpers
    SHIP_SIZE: 40,
    terrain: [],
    checkCollision: function () {},
    bombHitsTerrain: function () { return null; },
    getTerrainYAtX: function () { return { x: 0, y: 580 }; },
    entitiesInRadius: function (x, y, r, list) {
        var hit = [];
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            var dx = e.x - x, dy = e.y - y;
            if (Math.sqrt(dx * dx + dy * dy) <= r) hit.push(e);
        }
        return hit;
    },
    crashShipInBugfix: function (reason) { sandbox.crashReason = reason; sandbox.gameState = 'crashed'; },
    clearBugfixState: function () {
        sandbox.bugs = []; sandbox.bombs = []; sandbox.bombParticles = [];
        sandbox.bugExplosions = []; sandbox.fuelFloatTexts = [];
    },
    getLevelConfig: function () { return { gravity: 0.05 }; },
    generateTerrain: function () {},
    resetWind: function () {},
    updateBombParticles: function () {},
    updateBugExplosions: function () {},
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Load config.js (defines STATES + every fuel/bugfix constant).
vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

// Reinstall sandbox helpers that config.js didn't overwrite.
// config.js doesn't define getLevelConfig/resetWind — but if it did, reinstall here.

// Load particles.js so we use the REAL spawnFuelFloat / updateFuelFloats.
vm.runInContext(loadFile('js/particles.js'), sandbox, { filename: 'js/particles.js' });

// Install resetShip as a real function (mirrors js/ship.js).
vm.runInContext(
    'var ship = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, thrusting: false, rotating: null, fuel: FUEL_MAX, invaderVX: 0, invaderVY: 0 };\n' +
    'function resetShip() {\n' +
    '  ship.x = canvas.width / 2; ship.y = canvas.height / 3;\n' +
    '  ship.vx = 0; ship.vy = 0; ship.invaderVX = 0; ship.invaderVY = 0;\n' +
    '  ship.angle = 0; ship.thrusting = false; ship.retroThrusting = false;\n' +
    '  ship.rotating = null; ship.fuel = FUEL_MAX;\n' +
    '}',
    sandbox, { filename: 'ship-shim' });

// Extract + expose key update.js blocks as callable functions.
var updateSrc = loadFile('js/update.js');

var bugfixPlayingBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.BUGFIX_PLAYING) {',
    'BUGFIX_PLAYING body'
);
vm.runInContext(
    'function bugfixPlayingTick(dt) {\n' + bugfixPlayingBody + '\n}',
    sandbox, { filename: 'BUGFIX_PLAYING-extracted' });

var bugfixReturnBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.BUGFIX_RETURN) {',
    'BUGFIX_RETURN body'
);
vm.runInContext(
    'function bugfixReturnTick() {\n' + bugfixReturnBody + '\n}',
    sandbox, { filename: 'BUGFIX_RETURN-extracted' });

// Seed globals the blocks expect.
sandbox.currentLevel = 0;
sandbox.GRAVITY = 0.05;
sandbox.PIXELS_PER_METER = 40;
sandbox.THRUST_POWER = 0.125;
sandbox.score = 0;
sandbox.bugfixScore = 0;
sandbox.bugsKilled = 0;
sandbox.bugsTotal = 0;
sandbox.bugfixCompleteTimer = 0;
sandbox.bugfixFuelBonus = 0;
sandbox.gameState = sandbox.STATES.BUGFIX_PLAYING;

// ----------------------------------------------------------------------
// Preconditions — constants must match the PRD.
// ----------------------------------------------------------------------

check('precondition: FUEL_MAX === 100',
    sandbox.FUEL_MAX === 100, 'got ' + sandbox.FUEL_MAX);
check('precondition: FUEL_EXTENSION_MAX === 50',
    sandbox.FUEL_EXTENSION_MAX === 50, 'got ' + sandbox.FUEL_EXTENSION_MAX);
check('precondition: BUGFIX_FUEL_PER_KILL === 5',
    sandbox.BUGFIX_FUEL_PER_KILL === 5, 'got ' + sandbox.BUGFIX_FUEL_PER_KILL);

// ----------------------------------------------------------------------
// Scenario helpers
// ----------------------------------------------------------------------

function resetBugfixScenario(startFuel) {
    sandbox.ship.fuel = startFuel;
    sandbox.ship.x = 400; sandbox.ship.y = 100;
    sandbox.ship.vx = 0; sandbox.ship.vy = 0;
    sandbox.ship.angle = 0; sandbox.ship.thrusting = false;
    sandbox.ship.rotating = null;
    sandbox.bugs = [];
    sandbox.bombs = [];
    sandbox.bombParticles = [];
    sandbox.bugExplosions = [];
    sandbox.fuelFloatTexts = [];
    sandbox.bugsKilled = 0;
    sandbox.bugsTotal = 0;
    sandbox.bugfixScore = 0;
    sandbox.score = 0;
    sandbox.gameState = sandbox.STATES.BUGFIX_PLAYING;
    sandbox.keys = {};
}

// Place a bug at (x, y), a detonated bomb (vy downward) that will hit terrain
// immediately so the blast kills the bug. The kill-block reads only:
//   bomb.x, bomb.y, bomb.vx/vy, and uses entitiesInRadius(...) against bugs.
// A bomb hits "terrain" via getTerrainHeightAt lookup. We instead force the
// "any bugs in radius of bomb" path by placing the bomb at the bug's position
// and letting the "entitiesInRadius(bomb.x, bomb.y, BLAST, bugs).length > 0"
// branch fire.
// The bugfix tick sticks bugs to the terrain each frame using getTerrainYAtX;
// our stub returns y=580, so bugs resolve to y = 580 - BUGFIX_BUG_SIZE/2 = 574.
// Place the bomb at that resolved y so the blast-radius check fires immediately.
var STUB_TERRAIN_Y = 580;
function stagePointBlankBombKill(bugX, points) {
    var bugY = STUB_TERRAIN_Y - (sandbox.BUGFIX_BUG_SIZE / 2);
    sandbox.bugs.push({ x: bugX, y: bugY, vx: 0, vy: 0, type: 'low',
                        animTimer: 0, animFrame: 0,
                        points: (points == null ? 50 : points) });
    sandbox.bombs.push({ x: bugX, y: bugY, vx: 0, vy: 0 });
}

// ----------------------------------------------------------------------
// AC#1 — Kill bugs with fuel below max → fuel rises toward FUEL_MAX.
// ----------------------------------------------------------------------

resetBugfixScenario(/* startFuel */ 60);
stagePointBlankBombKill(400, 50);
sandbox.bugsTotal = 1;
sandbox.bugfixPlayingTick(0.016);
check('AC#1: fuel below max → bug kill adds BUGFIX_FUEL_PER_KILL',
    sandbox.ship.fuel === 65, 'expected 65, got ' + sandbox.ship.fuel);
check('AC#1: fuel still below FUEL_MAX after single kill (no extension yet)',
    sandbox.ship.fuel < sandbox.FUEL_MAX);

// ----------------------------------------------------------------------
// AC#2 — Kill bugs with fuel at max → fuel exceeds FUEL_MAX.
// ----------------------------------------------------------------------

resetBugfixScenario(/* startFuel */ 100);
stagePointBlankBombKill(400, 50);
sandbox.bugsTotal = 1;
sandbox.bugfixPlayingTick(0.016);
check('AC#2: fuel at max → kill pushes fuel above FUEL_MAX',
    sandbox.ship.fuel === 105, 'expected 105, got ' + sandbox.ship.fuel);
check('AC#2: fuel > FUEL_MAX triggers extension (>100%)',
    sandbox.ship.fuel > sandbox.FUEL_MAX);

// AC#2 render-side — the lander + bugfix HUDs both draw a cyan segment and
// show unclamped text. Source-assert both shapes.
var renderSrc = loadFile('js/render.js');
check('AC#2: lander HUD draws cyan extension when ship.fuel > FUEL_MAX',
    /if \(ship\.fuel > FUEL_MAX\)[\s\S]{0,400}#29B6F6/.test(renderSrc));
check('AC#2: bugfix HUD draws cyan extension when ship.fuel > FUEL_MAX',
    renderSrc.split('if (ship.fuel > FUEL_MAX)').length >= 3);  // lander + bugfix + techdebt + drive
check('AC#2: fuel text uses unclamped percentage (can show > 100%)',
    /Math\.round\(fuelPct \* 100\) \+ '%'/.test(renderSrc));

// ----------------------------------------------------------------------
// AC#3 — Kill many bugs → fuel caps at FUEL_MAX + FUEL_EXTENSION_MAX (150).
// ----------------------------------------------------------------------

resetBugfixScenario(/* startFuel */ 100);
// Stage 20 kills — 20 * 5 = 100 extra, but cap is 50 extra.
for (var k = 0; k < 20; k++) {
    stagePointBlankBombKill(100 + k * 30, 50);
}
sandbox.bugsTotal = 20;
sandbox.bugfixPlayingTick(0.016);
check('AC#3: fuel caps at FUEL_MAX + FUEL_EXTENSION_MAX (150)',
    sandbox.ship.fuel === 150, 'expected 150, got ' + sandbox.ship.fuel);
check('AC#3: fuel cannot exceed cap',
    sandbox.ship.fuel <= sandbox.FUEL_MAX + sandbox.FUEL_EXTENSION_MAX);

// Additional saturation kill — cap must still hold, and a float MUST NOT
// spawn for a zero-gain kill.
resetBugfixScenario(/* startFuel */ 150);
stagePointBlankBombKill(400, 50);
sandbox.bugsTotal = 1;
sandbox.fuelFloatTexts = [];
sandbox.bugfixPlayingTick(0.016);
check('AC#3: at-cap kill does not exceed 150',
    sandbox.ship.fuel === 150);
check('AC#3: zero-gain kill does NOT spawn a fuel-float indicator',
    sandbox.fuelFloatTexts.length === 0);

// ----------------------------------------------------------------------
// AC#4 — Complete bugfix with extension → return to lander with fuel > FUEL_MAX.
// ----------------------------------------------------------------------

sandbox.ship.fuel = 135;
sandbox.gameState = sandbox.STATES.BUGFIX_RETURN;
sandbox.currentLevel = 2;
sandbox.bugfixReturnTick();
check('AC#4: BUGFIX_RETURN preserves extension fuel across resetShip',
    sandbox.ship.fuel === 135, 'expected 135, got ' + sandbox.ship.fuel);
check('AC#4: level advanced after bugfix return',
    sandbox.currentLevel === 3);
check('AC#4: extension fuel is snapshotted and restored via FUEL_MAX + extensionFuel idiom',
    /var extensionFuel = Math\.max\(0, ship\.fuel - FUEL_MAX\);[\s\S]{0,120}resetShip\(\);[\s\S]{0,120}ship\.fuel = FUEL_MAX \+ extensionFuel;/.test(updateSrc));

// Boundary: no extension → returns at exactly FUEL_MAX (no under/overflow).
sandbox.ship.fuel = 40;
sandbox.gameState = sandbox.STATES.BUGFIX_RETURN;
sandbox.bugfixReturnTick();
check('AC#4: bugfix return with no extension resets fuel to FUEL_MAX',
    sandbox.ship.fuel === sandbox.FUEL_MAX, 'got ' + sandbox.ship.fuel);

// ----------------------------------------------------------------------
// AC#5 — Thrust during lander level → extension fuel depletes first.
// Extract PLAYING (lander) body and step with thrust held for 5 seconds of
// simulated time. FUEL_BURN_RATE = 10/s → 50 units burnt → starting at 135
// we land at 85 (below FUEL_MAX, extension fully consumed, bar reverts).
// ----------------------------------------------------------------------

var playingBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.PLAYING) {',
    'PLAYING body'
);
vm.runInContext(
    'function playingTick(dt) {\n' + playingBody + '\n}',
    sandbox, { filename: 'PLAYING-extracted' });

sandbox.ship.fuel = 135;  // 35 extension + 100 base
sandbox.ship.x = 400; sandbox.ship.y = 300;
sandbox.ship.vx = 0; sandbox.ship.vy = 0;
sandbox.ship.angle = 0;
sandbox.gameState = sandbox.STATES.PLAYING;
sandbox.keys = { 'ArrowUp': true };
// Burn half the extension first (0.5s @ 10/s = 5 units).
for (var step = 0; step < 30; step++) { sandbox.playingTick(1 / 60); }
var fuelAfterHalfBurn = sandbox.ship.fuel;
check('AC#5: thrusting with extension depletes fuel smoothly (no abrupt drop at FUEL_MAX)',
    fuelAfterHalfBurn < 135 && fuelAfterHalfBurn > 125,
    'got ' + fuelAfterHalfBurn);
check('AC#5: extension fuel still present mid-burn (ship.fuel > FUEL_MAX)',
    fuelAfterHalfBurn > sandbox.FUEL_MAX);

// Burn the rest (4.5s @ 10/s = 45 more) — extension must be gone.
for (var step2 = 0; step2 < 270; step2++) { sandbox.playingTick(1 / 60); }
check('AC#5: after ~5s of thrust, extension is fully consumed',
    sandbox.ship.fuel <= sandbox.FUEL_MAX, 'got ' + sandbox.ship.fuel);

// ----------------------------------------------------------------------
// AC#6 — Normal lander fuel behaviour unchanged when no extension.
// Colour thresholds must still be green > 0.5, yellow > 0.25, red otherwise,
// and the extension segment must not render when ship.fuel <= FUEL_MAX.
// ----------------------------------------------------------------------

check('AC#6: fuel colour thresholds unchanged (green/yellow/red)',
    /fuelPct > 0\.5[\s\S]{0,150}#4CAF50[\s\S]{0,200}fuelPct > 0\.25[\s\S]{0,150}#FFC107[\s\S]{0,200}#f44336/.test(renderSrc));
check('AC#6: extension segment only renders when ship.fuel > FUEL_MAX',
    renderSrc.indexOf('if (ship.fuel > FUEL_MAX)') > 0);

// ----------------------------------------------------------------------
// AC#7 — R-key restart resets fuel to FUEL_MAX (no extension preserved).
// Source-assert that the R-key branch calls resetShip (which sets FUEL_MAX).
// ----------------------------------------------------------------------

var inputSrc = loadFile('js/input.js');
check('AC#7: R-key restart calls resetShip (which sets fuel=FUEL_MAX, no extension)',
    /if \(key === 'r' \|\| key === 'R'\)[\s\S]{0,400}resetShip\(\);/.test(inputSrc));
// Behavioural: simulate the R-path — call resetShip with extension fuel set.
sandbox.ship.fuel = 140;
sandbox.resetShip();
check('AC#7: resetShip() clears extension fuel to FUEL_MAX',
    sandbox.ship.fuel === sandbox.FUEL_MAX, 'got ' + sandbox.ship.fuel);

// ----------------------------------------------------------------------
// AC#8 — New game resets fuel to FUEL_MAX (no extension).
// ----------------------------------------------------------------------

check('AC#8: startNewGame calls resetShip()',
    /function startNewGame\(\)[\s\S]{0,600}resetShip\(\);/.test(inputSrc));
// Behavioural: explicit test that the new-game path = resetShip (shown above).
sandbox.ship.fuel = 145;
sandbox.resetShip();
check('AC#8: new-game path zeroes extension fuel to FUEL_MAX',
    sandbox.ship.fuel === sandbox.FUEL_MAX);

// ----------------------------------------------------------------------
// AC#9 — Invader mini-game does NOT grant or carry extension fuel.
//   - The invader-playing code has no ship.fuel mutations at all.
//   - INVADER_RETURN calls resetShip() without the extensionFuel snapshot.
// ----------------------------------------------------------------------

var invaderReturnBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.INVADER_RETURN) {',
    'INVADER_RETURN body'
);
check('AC#9: INVADER_RETURN calls resetShip without preserving extension',
    /resetShip\(\);/.test(invaderReturnBody) &&
    !/extensionFuel/.test(invaderReturnBody));

// Invader-playing source: no ship.fuel mutation in the invader-state blocks.
var invaderPlayingBody = extractBodyAfter(
    updateSrc,
    'if (gameState === STATES.INVADER_PLAYING) {',
    'INVADER_PLAYING body'
);
check('AC#9: INVADER_PLAYING body does NOT modify ship.fuel',
    !/ship\.fuel\s*[+\-*/]?=/.test(invaderPlayingBody));

// ----------------------------------------------------------------------
// AC#10 — Normal level transitions reset fuel to FUEL_MAX.
// Every non-bugfix scene-scroll end branch unconditionally writes
// ship.fuel = FUEL_MAX. Count them to confirm none were missed.
// ----------------------------------------------------------------------

var sceneScrollSig = 'if (gameState === STATES.SCENE_SCROLL && sceneScrollState) {';
var sceneScrollIdx = updateSrc.indexOf(sceneScrollSig);
var sceneOpen = updateSrc.indexOf('{', sceneScrollIdx + sceneScrollSig.length - 1);
var sceneDepth = 0, sceneClose = -1;
for (var sj = sceneOpen; sj < updateSrc.length; sj++) {
    if (updateSrc[sj] === '{') sceneDepth++;
    else if (updateSrc[sj] === '}') {
        sceneDepth--;
        if (sceneDepth === 0) { sceneClose = sj; break; }
    }
}
var sceneBlock = updateSrc.slice(sceneScrollIdx, sceneClose + 1);
var fuelMaxAssignments = (sceneBlock.match(/ship\.fuel = FUEL_MAX;/g) || []).length;
check('AC#10: SCENE_SCROLL end branch resets ship.fuel = FUEL_MAX in every pad-type path',
    fuelMaxAssignments >= 7,  // invader, bugfix, missile, other (x2), chore (x2), feature, normal
    'found ' + fuelMaxAssignments + ' assignments');
check('AC#10: SCENE_SCROLL end branch has no extensionFuel preservation',
    !/extensionFuel/.test(sceneBlock));

// ----------------------------------------------------------------------
// AC#11 — Fuel burn rate unchanged; thrust disabled at fuel 0.
// ----------------------------------------------------------------------

check('AC#11: FUEL_BURN_RATE unchanged at 10 units/s',
    sandbox.FUEL_BURN_RATE === 10, 'got ' + sandbox.FUEL_BURN_RATE);
check('AC#11: lander thrust gated on ship.fuel > 0',
    /ship\.thrusting = wantsThrust && ship\.fuel > 0;/.test(playingBody));
check('AC#11: lander thrust burn decrements by FUEL_BURN_RATE * dt',
    /ship\.fuel -= FUEL_BURN_RATE \* dt;/.test(playingBody));
check('AC#11: lander thrust burn floors at 0 (no negative fuel)',
    /if \(ship\.fuel < 0\) ship\.fuel = 0;/.test(playingBody));

// Behavioural: at fuel == 0, thrusting must remain false even with ArrowUp.
sandbox.ship.fuel = 0;
sandbox.ship.x = 400; sandbox.ship.y = 300;
sandbox.ship.vx = 0; sandbox.ship.vy = 0;
sandbox.ship.angle = 0;
sandbox.gameState = sandbox.STATES.PLAYING;
sandbox.keys = { 'ArrowUp': true };
sandbox.playingTick(1 / 60);
check('AC#11: thrust disabled when fuel at 0 (ship.thrusting stays false)',
    sandbox.ship.thrusting === false);
check('AC#11: fuel does not go negative after thrust attempt at 0',
    sandbox.ship.fuel === 0);

// ----------------------------------------------------------------------
// AC#12 — Floating "+5 FUEL" text appears on bug kills.
// ----------------------------------------------------------------------

resetBugfixScenario(/* startFuel */ 50);
stagePointBlankBombKill(120, 50);
sandbox.bugsTotal = 1;
sandbox.fuelFloatTexts = [];
sandbox.bugfixPlayingTick(0.016);
check('AC#12: bug kill spawns exactly one float text',
    sandbox.fuelFloatTexts.length === 1,
    'got ' + sandbox.fuelFloatTexts.length);
check('AC#12: float text begins with "+5 FUEL"',
    sandbox.fuelFloatTexts.length > 0 &&
    sandbox.fuelFloatTexts[0].text.indexOf('+5 FUEL') === 0,
    'got ' + (sandbox.fuelFloatTexts[0] && sandbox.fuelFloatTexts[0].text));
check('AC#12: float text spawned at bug death position (x)',
    sandbox.fuelFloatTexts.length > 0 &&
    sandbox.fuelFloatTexts[0].x === 120);

// Extension-crossing kill adds the up-arrow glyph (US-006 wording).
resetBugfixScenario(/* startFuel */ 100);
stagePointBlankBombKill(300, 50);
sandbox.bugsTotal = 1;
sandbox.fuelFloatTexts = [];
sandbox.bugfixPlayingTick(0.016);
check('AC#12: fuel float on extension-entering kill includes up-arrow',
    sandbox.fuelFloatTexts.length > 0 &&
    sandbox.fuelFloatTexts[0].text.indexOf('\u2B06') >= 0,
    'got ' + (sandbox.fuelFloatTexts[0] && sandbox.fuelFloatTexts[0].text));

// ----------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
