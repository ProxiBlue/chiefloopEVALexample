// US-009: Runtime integration test for wave progression + win/lose conditions.
//
// This test loads js/config.js + js/update.js into a vm sandbox and directly
// calls setupMissileWorld(), spawnMissileWave(), and the MISSILE_COMPLETE /
// MISSILE_RETURN blocks to verify:
//   AC#1 Wave count formula across a range of levels
//   AC#3 Ammo is NOT regenerated between waves (spawnMissileWave leaves ammo
//        untouched)
//   AC#5 Win condition (all waves drained + building alive) → MISSILE_COMPLETE
//   AC#6 Lose condition (no buildings AND no batteries) → CRASHED
//   AC#7 Partial missileScore intercept credit sticks in `score` on loss
//
// Run:  node tests/integration-us009.js

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

// ---- Sandbox ----
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
    currentLevel: 0,
    ship: { x: 400, y: 300, vx: 0, vy: 0, angle: 0, thrusting: false, rotating: null, fuel: 100 },
    terrain: [],
    wind: { strength: 0, maxStrength: 0, targetStrength: 0, gustTimer: 0 },
    landingPads: [],
    // Stubs for helpers the update code reaches for during setup / state changes.
    resetShip: function () { sandbox.ship.x = 400; sandbox.ship.y = 300; },
    resetWind: function () {},
    generateTerrain: function () {
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

// Load update.js but stub out references to helpers we don't have (audio etc
// are already stubbed on the sandbox). update.js also declares a global
// `update` function; we mostly use its helpers.
vm.runInContext(loadFile('js/update.js'), sandbox, { filename: 'js/update.js' });

// ---- AC#1: wave count formula ----
function waveTotalForLevel(level) {
    sandbox.currentLevel = level;
    sandbox.setupMissileWorld();
    return sandbox.missileWaveTotal;
}

check('AC#1 level 0 → 1 wave', waveTotalForLevel(0) === 1, 'got ' + sandbox.missileWaveTotal);
check('AC#1 level 2 → 1 wave',  waveTotalForLevel(2) === 1, 'got ' + sandbox.missileWaveTotal);
check('AC#1 level 3 → 2 waves', waveTotalForLevel(3) === 2, 'got ' + sandbox.missileWaveTotal);
check('AC#1 level 5 → 2 waves', waveTotalForLevel(5) === 2, 'got ' + sandbox.missileWaveTotal);
check('AC#1 level 6 → 3 waves', waveTotalForLevel(6) === 3, 'got ' + sandbox.missileWaveTotal);
check('AC#1 level 12 → 3 waves (cap)', waveTotalForLevel(12) === 3, 'got ' + sandbox.missileWaveTotal);
check('AC#1 level 99 → 3 waves (cap)', waveTotalForLevel(99) === 3, 'got ' + sandbox.missileWaveTotal);

// ---- AC#3: battery ammo is NOT regenerated between waves ----
sandbox.currentLevel = 6;            // 3-wave round for a good multi-wave test
sandbox.setupMissileWorld();
// Drain the first battery's ammo to 0 and the second to 2, simulate wave 1 done.
sandbox.missileBatteries[0].ammo = 0;
sandbox.missileBatteries[1].ammo = 2;
var ammoBefore = sandbox.missileBatteries.map(function (b) { return b.ammo; });
sandbox.spawnMissileWave(); // simulate wave N spawn (should NOT touch ammo)
var ammoAfter = sandbox.missileBatteries.map(function (b) { return b.ammo; });
check('AC#3 spawnMissileWave does not regenerate ammo',
      JSON.stringify(ammoBefore) === JSON.stringify(ammoAfter),
      'before=' + JSON.stringify(ammoBefore) + ' after=' + JSON.stringify(ammoAfter));

// ---- Extract the MISSILE_PLAYING win/lose resolution block ----
var updateSrc = loadFile('js/update.js');
var playingSig = 'if (gameState === STATES.MISSILE_PLAYING) {';
var playingStart = updateSrc.indexOf(playingSig);
if (playingStart < 0) {
    check('extracted MISSILE_PLAYING block', false, 'signature not found');
} else {
    var depth = 0;
    var i = playingStart + playingSig.length - 1; // points at the opening `{`
    var startBody = i + 1;
    depth = 1;
    i++;
    while (i < updateSrc.length && depth > 0) {
        var ch = updateSrc[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
    }
    var block = updateSrc.slice(startBody, i - 1);
    check('extracted MISSILE_PLAYING block', block.length > 0);

    // ---- AC#5 Win path: level 0 (1 wave). Drain wave then tick the block. ----
    sandbox.currentLevel = 0;
    sandbox.setupMissileWorld();
    sandbox.gameState = sandbox.STATES.MISSILE_PLAYING;
    // Fake that wave 1 spawned and fully drained.
    sandbox.missileWaveCurrent = 1;
    sandbox.missileWaveSpawnQueue = [];
    sandbox.missileIncoming = [];
    sandbox.missileInterceptors = [];
    sandbox.missileExplosions = [];
    sandbox.score = 10; // baseline from earlier flight
    sandbox.missileScore = 50; // pretend 2 interceptions happened
    // All buildings alive, 1 battery destroyed (still OK).
    sandbox.missileBatteries[0].destroyed = true;
    sandbox.missileBatteries[0].ammo = 0;
    sandbox.dt = 0.016; // one frame
    // Replay the block body with dt bound.
    var runner = new Function('dt', block);
    vm.runInContext('var __playing_runner = (' + runner.toString() + ');', sandbox);
    sandbox.__playing_runner(sandbox.dt);
    check('AC#5 win: gameState = MISSILE_COMPLETE',
          sandbox.gameState === sandbox.STATES.MISSILE_COMPLETE,
          'got ' + sandbox.gameState);
    check('AC#5 win: missileEndBonus > 0 (surviving buildings + unused ammo)',
          sandbox.missileEndBonus > 0,
          'bonus=' + sandbox.missileEndBonus);
    check('AC#5 win: end bonus added to global score',
          sandbox.score === 10 + 50 + sandbox.missileEndBonus - 50,
          'score=' + sandbox.score + ' missileEndBonus=' + sandbox.missileEndBonus);

    // ---- AC#6 Lose path: destroy all buildings AND all batteries, tick. ----
    sandbox.currentLevel = 0;
    sandbox.setupMissileWorld();
    sandbox.gameState = sandbox.STATES.MISSILE_PLAYING;
    sandbox.missileWaveCurrent = 1;
    sandbox.score = 120;             // accumulated intercept credit pre-loss
    sandbox.missileScore = 75;
    for (var di = 0; di < sandbox.missileBuildings.length; di++) {
        sandbox.missileBuildings[di].destroyed = true;
    }
    for (var di2 = 0; di2 < sandbox.missileBatteries.length; di2++) {
        sandbox.missileBatteries[di2].destroyed = true;
        sandbox.missileBatteries[di2].ammo = 0;
    }
    sandbox.__playing_runner(sandbox.dt);
    check('AC#6 lose: gameState = CRASHED',
          sandbox.gameState === sandbox.STATES.CRASHED,
          'got ' + sandbox.gameState);
    check('AC#7 lose: partial score (120) preserved in `score`',
          sandbox.score === 120,
          'score=' + sandbox.score);

    // ---- AC#6 edge: all waves done but no buildings alive → lose ----
    sandbox.currentLevel = 6; // 3 waves
    sandbox.setupMissileWorld();
    sandbox.gameState = sandbox.STATES.MISSILE_PLAYING;
    sandbox.missileWaveCurrent = sandbox.missileWaveTotal;
    sandbox.missileWaveSpawnQueue = [];
    sandbox.missileIncoming = [];
    sandbox.score = 0;
    // Destroy every building, leave batteries alive.
    for (var bi = 0; bi < sandbox.missileBuildings.length; bi++) {
        sandbox.missileBuildings[bi].destroyed = true;
    }
    sandbox.__playing_runner(sandbox.dt);
    check('AC#6 edge: waves done + no buildings → CRASHED',
          sandbox.gameState === sandbox.STATES.CRASHED,
          'got ' + sandbox.gameState);
}

// ---- AC#4: announce timer set on spawn ----
sandbox.currentLevel = 0;
sandbox.setupMissileWorld();
sandbox.missileWaveAnnounceTimer = 0;
sandbox.spawnMissileWave();
check('AC#4 announce timer set to MISSILE_WAVE_ANNOUNCE_DURATION on wave spawn',
      sandbox.missileWaveAnnounceTimer === sandbox.MISSILE_WAVE_ANNOUNCE_DURATION,
      'timer=' + sandbox.missileWaveAnnounceTimer + ' expected=' + sandbox.MISSILE_WAVE_ANNOUNCE_DURATION);
check('AC#4 missileWaveCurrent increments on spawn (for the banner text)',
      sandbox.missileWaveCurrent === 1,
      'current=' + sandbox.missileWaveCurrent);

// ---- Summary ----
var failed = results.filter(function (r) { return !r.ok; });
console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed.');
process.exit(failed.length === 0 ? 0 : 1);
