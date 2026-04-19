// US-011: Runtime integration test for MISSILE_RETURN → next level flow.
//
// Verifies that MISSILE_RETURN mirrors INVADER_RETURN:
//   AC#1 rotates ship back 90° counter-clockwise over
//        MISSILE_RETURN_ROTATION_DURATION (π/2 → 0, eased)
//   AC#1 on completion: clears missile arrays, increments currentLevel, resets
//        wind + terrain, transitions to STATES.PLAYING
//   AC#2 ship.fuel is refilled (resetShip) so the next level starts with full fuel
//   AC#3 loss path uses CRASHED via crashShipInMissile + clearMissileState
//        clears all missile arrays
//   AC#4 reuses the invader return transition structure (ship.angle formula
//        matches INVADER_RETURN)
//
// Run:  node tests/integration-us011.js

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

var generateTerrainCount = 0;
var resetShipCount = 0;
var resetWindCount = 0;

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
    landedPRTitle: '',
    levelCommits: [],
    currentLevel: 4,
    ship: { x: 400, y: 300, vx: 0, vy: 0, angle: Math.PI / 2, thrusting: false, rotating: null, fuel: 0 },
    terrain: [],
    wind: { strength: 0, maxStrength: 0, targetStrength: 0, gustTimer: 0 },
    landingPads: [],
    resetShip: function () {
        resetShipCount++;
        sandbox.ship.x = 400;
        sandbox.ship.y = 300;
        sandbox.ship.vx = 0;
        sandbox.ship.vy = 0;
        sandbox.ship.angle = 0;
        sandbox.ship.fuel = 100;
    },
    resetWind: function () { resetWindCount++; },
    generateTerrain: function () {
        generateTerrainCount++;
        sandbox.terrain = [{ x: 0, y: 500 }, { x: 800, y: 500 }];
        sandbox.landingPads = [];
    },
    spawnExplosion: function () {},
    startScreenShake: function () {},
    stopThrustSound: function () {},
    playExplosionSound: function () {},
    playLaunchSound: function () {},
    playDestructionSound: function () {},
    getLevelConfig: function () { return { gravity: 1.0 }; },
    terrainOriginalPoints: []
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function loadFile(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });
vm.runInContext(loadFile('js/update.js'), sandbox, { filename: 'js/update.js' });

// config.js declares its own `resetWind` function which overwrote our stub.
// Re-stub it so we can spy on calls from the MISSILE_RETURN block.
sandbox.resetWind = function () { resetWindCount++; };

// Constant sanity: MISSILE_RETURN_ROTATION_DURATION mirrors invader duration.
check('MISSILE_RETURN_ROTATION_DURATION defined',
      typeof sandbox.MISSILE_RETURN_ROTATION_DURATION === 'number' && sandbox.MISSILE_RETURN_ROTATION_DURATION > 0,
      'value=' + sandbox.MISSILE_RETURN_ROTATION_DURATION);
check('MISSILE_RETURN_ROTATION_DURATION matches INVADER_RETURN_ROTATION_DURATION (reuse)',
      sandbox.MISSILE_RETURN_ROTATION_DURATION === sandbox.INVADER_RETURN_ROTATION_DURATION,
      'missile=' + sandbox.MISSILE_RETURN_ROTATION_DURATION + ' invader=' + sandbox.INVADER_RETURN_ROTATION_DURATION);

// Extract the MISSILE_RETURN block body so we can replay it against the sandbox.
var updateSrc = loadFile('js/update.js');
var retSig = 'if (gameState === STATES.MISSILE_RETURN) {';
var retStart = updateSrc.indexOf(retSig);
if (retStart < 0) {
    check('extracted MISSILE_RETURN block', false, 'signature not found');
} else {
    var depth = 1;
    var i = retStart + retSig.length;
    var startBody = i;
    while (i < updateSrc.length && depth > 0) {
        var ch = updateSrc[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
    }
    var block = updateSrc.slice(startBody, i - 1);
    check('extracted MISSILE_RETURN block', block.length > 0);

    // Compile the block as a function so we can tick it with a controlled dt.
    var runner = new Function('dt', block);
    vm.runInContext('var __return_runner = (' + runner.toString() + ');', sandbox);

    // ---- AC#1 rotation: seed state matching MISSILE_COMPLETE → MISSILE_RETURN ----
    sandbox.currentLevel = 4;
    sandbox.setupMissileWorld();
    // Pretend the mini-game ended in a win: populate some entities so we can
    // verify clearMissileState empties them.
    sandbox.missileIncoming = [{}, {}];
    sandbox.missileInterceptors = [{}];
    sandbox.missileExplosions = [{}];
    sandbox.missileDestructionParticles = [{}, {}, {}];
    sandbox.missileEndBonus = 250;
    sandbox.ship.angle = Math.PI / 2;   // set by MISSILE_TRANSITION end
    sandbox.ship.fuel = 0;              // drained during missile phase
    sandbox.gameState = sandbox.STATES.MISSILE_RETURN;
    sandbox.missileReturnRotationTimer = 0;

    var levelBefore = sandbox.currentLevel;
    generateTerrainCount = 0;
    resetShipCount = 0;
    resetWindCount = 0;

    // Tick 1: mid-rotation (dt = 25% of duration)
    sandbox.__return_runner(sandbox.MISSILE_RETURN_ROTATION_DURATION * 0.25);
    check('AC#1 mid-rotation: gameState still MISSILE_RETURN',
          sandbox.gameState === sandbox.STATES.MISSILE_RETURN,
          'got ' + sandbox.gameState);
    check('AC#1 mid-rotation: ship.angle between 0 and π/2 (counter-clockwise)',
          sandbox.ship.angle > 0 && sandbox.ship.angle < Math.PI / 2,
          'angle=' + sandbox.ship.angle);
    check('AC#1 mid-rotation: level NOT yet incremented',
          sandbox.currentLevel === levelBefore,
          'level=' + sandbox.currentLevel);

    // Tick 2: push past the full duration to trigger completion.
    sandbox.__return_runner(sandbox.MISSILE_RETURN_ROTATION_DURATION);
    check('AC#1 on completion: gameState → PLAYING',
          sandbox.gameState === sandbox.STATES.PLAYING,
          'got ' + sandbox.gameState);
    check('AC#1 on completion: currentLevel incremented by 1',
          sandbox.currentLevel === levelBefore + 1,
          'was=' + levelBefore + ' now=' + sandbox.currentLevel);
    check('AC#1 on completion: all missile arrays cleared',
          sandbox.missileIncoming.length === 0 &&
          sandbox.missileInterceptors.length === 0 &&
          sandbox.missileExplosions.length === 0 &&
          sandbox.missileDestructionParticles.length === 0 &&
          sandbox.missileBuildings.length === 0 &&
          sandbox.missileBatteries.length === 0 &&
          sandbox.missileWaveSpawnQueue.length === 0,
          'incoming=' + sandbox.missileIncoming.length +
          ' interceptors=' + sandbox.missileInterceptors.length +
          ' explosions=' + sandbox.missileExplosions.length +
          ' particles=' + sandbox.missileDestructionParticles.length +
          ' buildings=' + sandbox.missileBuildings.length +
          ' batteries=' + sandbox.missileBatteries.length +
          ' spawnQueue=' + sandbox.missileWaveSpawnQueue.length);
    check('AC#1 on completion: generateTerrain called (new terrain)',
          generateTerrainCount === 1,
          'count=' + generateTerrainCount);
    check('AC#1 on completion: resetWind called',
          resetWindCount === 1,
          'count=' + resetWindCount);
    check('AC#2 on completion: resetShip called (ship returns to normal flight, full fuel)',
          resetShipCount === 1 && sandbox.ship.fuel === 100,
          'resetCount=' + resetShipCount + ' fuel=' + sandbox.ship.fuel);
}

// ---- AC#3 loss path: CRASHED + all missile state cleared ----
sandbox.currentLevel = 2;
sandbox.setupMissileWorld();
sandbox.missileIncoming = [{}, {}, {}];
sandbox.missileInterceptors = [{}];
sandbox.missileExplosions = [{}, {}];
sandbox.missileDestructionParticles = [{}];
sandbox.missileEndBonus = 0;
sandbox.landingResult = '';
sandbox.crashShipInMissile('All defenses destroyed');
sandbox.clearMissileState();
check('AC#3 loss path: gameState = CRASHED',
      sandbox.gameState === sandbox.STATES.CRASHED,
      'got ' + sandbox.gameState);
check('AC#3 loss path: landingResult includes reason',
      typeof sandbox.landingResult === 'string' && sandbox.landingResult.indexOf('defense') !== -1 || sandbox.landingResult.indexOf('All') !== -1,
      'landingResult=' + sandbox.landingResult);
check('AC#3 loss path: all missile state cleared on cleanup',
      sandbox.missileIncoming.length === 0 &&
      sandbox.missileInterceptors.length === 0 &&
      sandbox.missileExplosions.length === 0 &&
      sandbox.missileDestructionParticles.length === 0 &&
      sandbox.missileBuildings.length === 0 &&
      sandbox.missileBatteries.length === 0 &&
      sandbox.missileWaveCurrent === 0 &&
      sandbox.missileWaveTotal === 0,
      'incoming=' + sandbox.missileIncoming.length +
      ' interceptors=' + sandbox.missileInterceptors.length +
      ' explosions=' + sandbox.missileExplosions.length +
      ' particles=' + sandbox.missileDestructionParticles.length +
      ' buildings=' + sandbox.missileBuildings.length +
      ' batteries=' + sandbox.missileBatteries.length +
      ' waveCurrent=' + sandbox.missileWaveCurrent +
      ' waveTotal=' + sandbox.missileWaveTotal);

// ---- AC#4 code-structure check: verify rotation formula byte-matches INVADER_RETURN pattern ----
var missileRetBlock = updateSrc.slice(
    updateSrc.indexOf('if (gameState === STATES.MISSILE_RETURN) {'),
    updateSrc.indexOf('if (gameState === STATES.PLAYING) {'));
check('AC#4 reuses invader rotation formula: ship.angle = (π/2) * (1 - eased)',
      /ship\.angle\s*=\s*\(Math\.PI\s*\/\s*2\)\s*\*\s*\(\s*1\s*-\s*eased/.test(missileRetBlock),
      'block did not contain the expected ship.angle formula');
check('AC#4 reuses invader easing formula (ease-in-out cubic)',
      /<\s*0\.5\s*\?\s*2\s*\*\s*\w+\s*\*\s*\w+\s*:\s*1\s*-\s*Math\.pow\(-2\s*\*\s*\w+\s*\+\s*2/.test(missileRetBlock),
      'easing formula mismatch');

// ---- Summary ----
var failed = results.filter(function (r) { return !r.ok; });
console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed.');
process.exit(failed.length === 0 ? 0 : 1);
