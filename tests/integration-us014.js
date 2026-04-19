// US-014: Runtime integration test for PR-data-backed labels.
//
// Loads js/config.js + js/update.js into a vm sandbox and exercises:
//   AC#1 Building labels: extract filenames from landedPRTitle / levelCommits,
//        pad with generic fallbacks, truncate to MISSILE_BUILDING_COUNT.
//   AC#2 Missile labels: per-round pool mixes branch name + commit hashes.
//   AC#3 Labels are cosmetic (don't affect gameplay state arrays).
//
// Run:  node tests/integration-us014.js

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.resolve(__dirname, '..');
var failed = 0;
var passed = 0;
function check(name, ok, detail) {
    var tag = ok ? 'PASS' : 'FAIL';
    if (ok) passed++; else failed++;
    console.log(tag + ' — ' + name + (ok ? '' : ' :: ' + (detail || '')));
}

var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array, Number: Number, String: String,
    Boolean: Boolean, JSON: JSON, Date: Date,
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
    resetShip: function () {},
    resetWind: function () {},
    generateTerrain: function () { sandbox.terrain = [{ x: 0, y: 500 }, { x: 800, y: 500 }]; sandbox.landingPads = []; },
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

// ---- AC#1 Building labels: PR title filename extraction ----
sandbox.landedPRTitle = 'Fix GraphQL API by pinning webonyx/graphql-php version in composer.json';
sandbox.levelCommits = [];
var labels = sandbox.collectMissileBuildingLabels(sandbox.MISSILE_BUILDING_COUNT);
check('AC#1 returns exactly MISSILE_BUILDING_COUNT labels',
      labels.length === sandbox.MISSILE_BUILDING_COUNT,
      'got ' + labels.length + ' expected ' + sandbox.MISSILE_BUILDING_COUNT);
check('AC#1 extracts filename from PR title',
      labels.indexOf('composer.json') !== -1,
      'labels=' + JSON.stringify(labels));

// ---- AC#1 Fallback list matches AC literals ----
sandbox.landedPRTitle = '';
sandbox.levelCommits = [];
var fbLabels = sandbox.collectMissileBuildingLabels(6);
var expectedFallback = ['main.go', 'auth.ts', 'handler.js', 'config.yaml', 'schema.sql', 'index.html'];
check('AC#1 fallback list exactly matches AC literals',
      JSON.stringify(fbLabels) === JSON.stringify(expectedFallback),
      'got ' + JSON.stringify(fbLabels));

// ---- AC#1 Truncate to MISSILE_BUILDING_COUNT when sources abundant ----
sandbox.landedPRTitle = 'Refactor auth.py and handler.ts and config.yaml and main.go and app.rb and schema.sql and index.html and router.tsx';
sandbox.levelCommits = [];
var truncLabels = sandbox.collectMissileBuildingLabels(4);
check('AC#1 truncates to requested count', truncLabels.length === 4, 'got ' + truncLabels.length);

// ---- AC#1 Pad with fallback when sources dry up ----
sandbox.landedPRTitle = 'Refactor auth.py and handler.ts';
sandbox.levelCommits = [];
var padLabels = sandbox.collectMissileBuildingLabels(6);
check('AC#1 pads short sources to requested count', padLabels.length === 6, 'got ' + padLabels.length);
check('AC#1 extracted filenames are in result',
      padLabels.indexOf('auth.py') !== -1 && padLabels.indexOf('handler.ts') !== -1,
      'labels=' + JSON.stringify(padLabels));

// ---- AC#1 Extracts from levelCommits messages ----
sandbox.landedPRTitle = '';
sandbox.levelCommits = [
    { hash: 'abc1234deadbeef', message: 'update api.go', date: '', author: '' },
    { hash: '9876543fedcba00', message: 'rewrite store.ts', date: '', author: '' }
];
var lcLabels = sandbox.collectMissileBuildingLabels(6);
check('AC#1 extracts from levelCommits messages',
      lcLabels.indexOf('api.go') !== -1 && lcLabels.indexOf('store.ts') !== -1,
      'labels=' + JSON.stringify(lcLabels));

// ---- AC#2 Missile label pool includes branch name ----
sandbox.landedPRTitle = 'Merge pull request #211 from mage-os/rhoerr-fix-graphql\n\nFix GraphQL API';
sandbox.levelCommits = [];
var pool1 = sandbox.buildMissileIncomingLabelPool();
check('AC#2 pool contains base entries',
      pool1.indexOf('CONFLICT') !== -1 && pool1.indexOf('merge failed') !== -1);
check('AC#2 branch name mixed into pool',
      pool1.indexOf('rhoerr-fix-graphql') !== -1,
      'pool=' + JSON.stringify(pool1.slice(-5)));

// ---- AC#2 Missile label pool includes commit hashes ----
sandbox.landedPRTitle = '';
sandbox.levelCommits = [
    { hash: '2e733648455ff9970ac10d24420345c26a6af73f', message: 'x', date: '', author: '' },
    { hash: 'c26b4eebad53828344f4111d428b4543b3545c2a', message: 'y', date: '', author: '' }
];
var pool2 = sandbox.buildMissileIncomingLabelPool();
check('AC#2 short commit hash (7 chars) mixed into pool',
      pool2.indexOf('2e73364') !== -1 && pool2.indexOf('c26b4ee') !== -1,
      'pool tail=' + JSON.stringify(pool2.slice(-5)));

// ---- AC#2 Empty PR data → pool is just the base constant ----
sandbox.landedPRTitle = '';
sandbox.levelCommits = [];
var pool3 = sandbox.buildMissileIncomingLabelPool();
check('AC#2 empty PR data yields base pool only',
      pool3.length === sandbox.MISSILE_INCOMING_LABEL_POOL.length,
      'got ' + pool3.length + ' base=' + sandbox.MISSILE_INCOMING_LABEL_POOL.length);

// ---- AC#2 setupMissileWorld seeds missileRoundLabelPool for the round ----
sandbox.landedPRTitle = 'Merge pull request #5 from org/feature-branch-x';
sandbox.levelCommits = [{ hash: 'deadbee000000', message: 'z', date: '', author: '' }];
sandbox.currentLevel = 0;
sandbox.setupMissileWorld();
check('AC#2 setupMissileWorld populates missileRoundLabelPool',
      Array.isArray(sandbox.missileRoundLabelPool) && sandbox.missileRoundLabelPool.length > sandbox.MISSILE_INCOMING_LABEL_POOL.length,
      'pool.length=' + (sandbox.missileRoundLabelPool ? sandbox.missileRoundLabelPool.length : 'undefined'));
check('AC#2 round pool has branch name and hash',
      sandbox.missileRoundLabelPool.indexOf('feature-branch-x') !== -1 &&
      sandbox.missileRoundLabelPool.indexOf('deadbee') !== -1,
      'pool=' + JSON.stringify(sandbox.missileRoundLabelPool.slice(-4)));

// ---- AC#2 spawnMissileWave assigns labels drawn from the round pool ----
sandbox.spawnMissileWave();
var queueLabels = sandbox.missileWaveSpawnQueue.map(function (e) { return e.label; });
check('AC#2 spawnMissileWave assigns a label to each queued missile',
      queueLabels.length > 0 && queueLabels.every(function (l) { return typeof l === 'string' && l.length > 0; }),
      'labels=' + JSON.stringify(queueLabels));
check('AC#2 every spawned label is drawn from the round pool',
      queueLabels.every(function (l) { return sandbox.missileRoundLabelPool.indexOf(l) !== -1; }),
      'labels=' + JSON.stringify(queueLabels));

// ---- AC#3 Labels are cosmetic (don't gate gameplay) ----
// Verify missile buildings have `.label` and `.destroyed` separately — destruction
// is driven purely by the `destroyed` flag, labels never block intercepts.
var b0 = sandbox.missileBuildings[0];
check('AC#3 building has both label (cosmetic) and destroyed (gameplay)',
      typeof b0.label === 'string' && typeof b0.destroyed === 'boolean',
      'b0=' + JSON.stringify(b0));

console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed > 0 ? 1 : 0);
