// US-014 (Code Breaker): Wire PR data into brick labels.
//
// Loads js/config.js + js/update.js helpers into a vm sandbox and verifies
// buildBreakoutBrickLabelPool()'s PR-data integration + setupBreakoutWorld()
// populates breakoutBrickLabelPool and uses it for per-brick labels.
//
// Acceptance criteria mapped (.chief/prds/codebreaker/prd.md US-014):
//   AC#1  PR file paths (e.g. auth.js) mixed into the brick label pool.
//   AC#2  Refactor-related keyword phrases from the PR title (e.g. "remove
//         jQuery", "update deps") mixed into the brick label pool.
//   AC#3  Falls back to the default BREAKOUT_BRICK_LABEL_POOL when no PR
//         data is available.
//   AC#4  Labels are purely cosmetic — no gameplay impact (hp / maxHp /
//         coords / colour are untouched by label identity).
//
// Run:  node tests/smoke-breakout-us014.js
// Exits 0 on full pass, 1 on any failure.

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
var configSrc = loadFile('js/config.js');

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

// ===== Sandbox =====
var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array, Number: Number, String: String,
    Boolean: Boolean, JSON: JSON, Date: Date, RegExp: RegExp,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    keys: {},
    landedPRTitle: '',
    levelCommits: [],
    currentLevel: 0,
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(configSrc, sandbox, { filename: 'js/config.js' });

var buildSrc = extractFunction(updateSrc, 'function buildBreakoutBrickLabelPool(');
var setupSrc = extractFunction(updateSrc, 'function setupBreakoutWorld(');
var clearSrc = extractFunction(updateSrc, 'function clearBreakoutState(');

check('update.js: buildBreakoutBrickLabelPool defined', !!buildSrc);
check('update.js: setupBreakoutWorld defined', !!setupSrc);
check('update.js: clearBreakoutState defined', !!clearSrc);

vm.runInContext(buildSrc, sandbox, { filename: 'buildBreakoutBrickLabelPool' });
vm.runInContext(setupSrc, sandbox, { filename: 'setupBreakoutWorld' });
vm.runInContext(clearSrc, sandbox, { filename: 'clearBreakoutState' });

// ===== AC#1 File paths from PR title =====
sandbox.landedPRTitle = 'Fix auth.js and update user.js for OAuth flow';
sandbox.levelCommits = [];
var pool1 = sandbox.buildBreakoutBrickLabelPool();
check('AC#1 pool includes auth.js from PR title',
    pool1.indexOf('auth.js') !== -1, 'pool tail=' + JSON.stringify(pool1.slice(-6)));
check('AC#1 pool includes user.js from PR title',
    pool1.indexOf('user.js') !== -1, 'pool tail=' + JSON.stringify(pool1.slice(-6)));
check('AC#1 pool still contains default labels',
    pool1.indexOf('// TODO') !== -1 && pool1.indexOf('console.log') !== -1);
check('AC#1 pool is strictly larger than default when PR data provided',
    pool1.length > sandbox.BREAKOUT_BRICK_LABEL_POOL.length,
    'pool.length=' + pool1.length + ' default=' + sandbox.BREAKOUT_BRICK_LABEL_POOL.length);

// ===== AC#1 File paths from commit messages =====
sandbox.landedPRTitle = '';
sandbox.levelCommits = [
    { hash: 'abc1234', message: 'update api.go', date: '', author: '' },
    { hash: '9876543', message: 'rewrite store.ts', date: '', author: '' },
];
var pool2 = sandbox.buildBreakoutBrickLabelPool();
check('AC#1 pool includes api.go from commit message',
    pool2.indexOf('api.go') !== -1, 'pool tail=' + JSON.stringify(pool2.slice(-6)));
check('AC#1 pool includes store.ts from commit message',
    pool2.indexOf('store.ts') !== -1, 'pool tail=' + JSON.stringify(pool2.slice(-6)));

// ===== AC#2 Refactor-related keyword phrases from PR title =====
sandbox.landedPRTitle = 'Remove jQuery and update deps for v3 migration';
sandbox.levelCommits = [];
var pool3 = sandbox.buildBreakoutBrickLabelPool();
check('AC#2 pool includes "remove jQuery" keyword phrase (lowercased)',
    pool3.indexOf('remove jquery') !== -1, 'pool tail=' + JSON.stringify(pool3.slice(-6)));
check('AC#2 pool includes "update deps" keyword phrase (lowercased)',
    pool3.indexOf('update deps') !== -1, 'pool tail=' + JSON.stringify(pool3.slice(-6)));

sandbox.landedPRTitle = 'Refactor payment service and migrate database';
sandbox.levelCommits = [];
var pool4 = sandbox.buildBreakoutBrickLabelPool();
check('AC#2 pool picks up "refactor <word>" phrase',
    pool4.indexOf('refactor payment') !== -1, 'pool tail=' + JSON.stringify(pool4.slice(-6)));
check('AC#2 pool picks up "migrate <word>" phrase',
    pool4.indexOf('migrate database') !== -1, 'pool tail=' + JSON.stringify(pool4.slice(-6)));

// ===== AC#3 Fallback to default pool with no PR data =====
sandbox.landedPRTitle = '';
sandbox.levelCommits = [];
var pool5 = sandbox.buildBreakoutBrickLabelPool();
check('AC#3 empty PR data yields default pool only',
    pool5.length === sandbox.BREAKOUT_BRICK_LABEL_POOL.length,
    'pool.length=' + pool5.length + ' default=' + sandbox.BREAKOUT_BRICK_LABEL_POOL.length);
check('AC#3 empty PR data pool equals default pool contents',
    JSON.stringify(pool5) === JSON.stringify(sandbox.BREAKOUT_BRICK_LABEL_POOL));

// ===== AC#3 Missing levelCommits doesn't crash =====
sandbox.landedPRTitle = '';
sandbox.levelCommits = undefined;
var pool6 = sandbox.buildBreakoutBrickLabelPool();
check('AC#3 undefined levelCommits falls back to default pool',
    pool6.length === sandbox.BREAKOUT_BRICK_LABEL_POOL.length);

// ===== AC#1/#2/#3 setupBreakoutWorld wires the pool into brick labels =====
sandbox.landedPRTitle = 'Fix auth.js and update deps';
sandbox.levelCommits = [{ hash: 'aaaa', message: 'patch user.js', date: '', author: '' }];
sandbox.currentLevel = 0;
sandbox.setupBreakoutWorld();
check('setupBreakoutWorld populated breakoutBrickLabelPool',
    Array.isArray(sandbox.breakoutBrickLabelPool) &&
    sandbox.breakoutBrickLabelPool.length > sandbox.BREAKOUT_BRICK_LABEL_POOL.length,
    'pool.length=' + (sandbox.breakoutBrickLabelPool ?
        sandbox.breakoutBrickLabelPool.length : 'undef'));
check('round pool contains PR filename',
    sandbox.breakoutBrickLabelPool.indexOf('auth.js') !== -1);
check('round pool contains commit filename',
    sandbox.breakoutBrickLabelPool.indexOf('user.js') !== -1);
check('round pool contains keyword phrase',
    sandbox.breakoutBrickLabelPool.indexOf('update deps') !== -1);
check('bricks spawned',
    Array.isArray(sandbox.breakoutBricks) && sandbox.breakoutBricks.length > 0,
    'bricks=' + (sandbox.breakoutBricks ? sandbox.breakoutBricks.length : 'undef'));
check('every brick label is drawn from the round pool',
    sandbox.breakoutBricks.every(function (b) {
        return sandbox.breakoutBrickLabelPool.indexOf(b.label) !== -1;
    }));

// With a deliberately PR-rich setup, at least ONE brick should receive a
// PR-derived label across the full grid (probabilistic but effectively
// guaranteed: default pool ~60 entries + 3 extras; rows * cols ~= 3*10 = 30).
// We also seed many commit files so collision odds are high.
sandbox.landedPRTitle = 'Fix auth.js user.js cart.js checkout.js';
sandbox.levelCommits = [
    { hash: 'a', message: 'login.js', date: '', author: '' },
    { hash: 'b', message: 'signup.js', date: '', author: '' },
    { hash: 'c', message: 'logout.js', date: '', author: '' },
];
sandbox.currentLevel = 4;
sandbox.setupBreakoutWorld();
var prDerived = ['auth.js', 'user.js', 'cart.js', 'checkout.js',
                 'login.js', 'signup.js', 'logout.js'];
var hit = sandbox.breakoutBricks.some(function (b) {
    return prDerived.indexOf(b.label) !== -1;
});
check('AC#1 at least one brick gets a PR-derived file label across the grid',
    hit, 'labels=' + JSON.stringify(
        sandbox.breakoutBricks.slice(0, 6).map(function (b) { return b.label; })));

// ===== AC#4 Labels are purely cosmetic =====
// Walk every brick and assert the gameplay fields (hp, maxHp, w, h, coords)
// exist and are valid regardless of label contents. Inject a label that would
// be suspicious if somehow parsed as code/HP.
sandbox.landedPRTitle = 'Fix auth.js — HP 999';
sandbox.levelCommits = [];
sandbox.currentLevel = 0;
sandbox.setupBreakoutWorld();
var allValid = sandbox.breakoutBricks.every(function (b) {
    return (b.hp === 1 || b.hp === 2 || b.hp === 3) &&
           b.maxHp === b.hp &&
           typeof b.w === 'number' && b.w > 0 &&
           typeof b.h === 'number' && b.h > 0 &&
           typeof b.x === 'number' && typeof b.y === 'number' &&
           typeof b.color === 'string' && b.color.charAt(0) === '#';
});
check('AC#4 every brick has valid hp/maxHp/w/h/x/y/color regardless of label',
    allValid);
check('AC#4 no brick has HP = 999 despite the sneaky PR title label',
    sandbox.breakoutBricks.every(function (b) { return b.hp <= 3; }));

// ===== AC#4 Source-level: setupBreakoutWorld does not branch on label =====
check('AC#4 setupBreakoutWorld does not read brick.label for gameplay decisions',
    !/\bb(?:rick)?\.label\s*(?:===|!==|==|!=|<|>)/.test(setupSrc),
    'label should never appear in a gameplay comparison');
check('AC#4 buildBreakoutBrickLabelPool returns an Array',
    Array.isArray(sandbox.buildBreakoutBrickLabelPool()));

// ===== Source-level: setup uses the per-round pool (not the default) =====
check('setupBreakoutWorld uses breakoutBrickLabelPool for label selection',
    /breakoutBrickLabelPool\[\s*Math\.floor\s*\(\s*Math\.random/.test(setupSrc),
    'expected to index the round pool directly');
check('setupBreakoutWorld assigns breakoutBrickLabelPool = buildBreakoutBrickLabelPool()',
    /breakoutBrickLabelPool\s*=\s*buildBreakoutBrickLabelPool\s*\(\s*\)/.test(setupSrc));
check('clearBreakoutState resets breakoutBrickLabelPool',
    /breakoutBrickLabelPool\s*=\s*\[\s*\]/.test(clearSrc));

// ===== config.js has breakoutBrickLabelPool module-level var =====
check('config.js declares breakoutBrickLabelPool module-level var',
    /var\s+breakoutBrickLabelPool\s*=/.test(configSrc));

console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed > 0 ? 1 : 0);
