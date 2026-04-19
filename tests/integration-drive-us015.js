// US-015 (Feature Drive): Runtime integration test for PR-data-driven label
// and road-length shaping in `setupDriveWorld`.
//
// Evaluates the real `setupDriveWorld()` extracted from js/update.js inside a
// vm sandbox (alongside js/config.js). Verifies every US-015 acceptance
// criterion:
//   AC#1  Road length scales by `1 + linesChanged/500` (capped at 2x) when PR
//         data has linesChanged; falls back to the level-based formula when
//         no PR data is present. The MAX cap is also respected.
//   AC#2  Obstacle (rock) labels mix in failed check names + reviewer comment
//         snippets when PR data provides them; default pool is used otherwise.
//   AC#3  Pickup labels include reviewer-formatted strings (`LGTM @handle`,
//         `approved by @handle`) and an approval count (`N/M approved`) when
//         PR data provides reviewers/approvals; default pool is used otherwise.
//   AC#4  Destination banner truncates landedPRTitle to 40 chars (render.js
//         emits `landedPRTitle.length > 40 ? slice(0,37)+'...' : title`) and
//         falls back to "FEATURE COMPLETE". Verified via static pin on
//         render.js + runtime-style string assertion matching the same logic.
//   AC#5  Labels are purely cosmetic: the obstacle count target formula
//         (`floor(roadLength * obstacleDensity)`) and pickup count target
//         formula (`floor(roadLength * DRIVE_PICKUP_DENSITY)`) do not
//         reference the label pool. Exercised by running with/without PR
//         labels at the same level and asserting non-label state (counts,
//         positions, segment types) is determined solely by roadLength +
//         density — i.e., swapping label pools cannot influence gameplay.
//
// Run:  node tests/integration-drive-us015.js
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

function extractBlock(src, signature, label) {
    var start = src.indexOf(signature);
    if (start < 0) {
        check(label + ' signature present', false, signature + ' not found');
        process.exit(1);
    }
    var open = src.indexOf('{', start + signature.length - 1);
    var depth = 0, close = -1;
    for (var i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    return src.slice(start, close + 1);
}

var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean,
    canvas: { width: 800, height: 600 },
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

// Declare the landedPR* globals into the sandbox AFTER config.js — they live in
// particles.js in the real build, but setupDriveWorld only reads them by name,
// so per-scenario assignment is sufficient.
vm.runInContext(
    'var landedPRLinesChanged = 0;' +
    'var landedPRReviewers = [];' +
    'var landedPRApprovals = 0;' +
    'var landedPRChecks = [];' +
    'var landedPRComments = [];' +
    'var landedPRTitle = "";',
    sandbox, { filename: 'landedPR-globals-init' });

var updateSrc = loadFile('js/update.js');
var setupFnSrc = extractBlock(updateSrc, 'function setupDriveWorld() {', 'setupDriveWorld');
vm.runInContext(setupFnSrc, sandbox, { filename: 'setupDriveWorld-extracted' });
check('setupDriveWorld evaluated into sandbox',
    typeof sandbox.setupDriveWorld === 'function');

// Install deterministic Math.random so obstacle/pickup placement produces a
// predictable label distribution.
function makeSeededMath(seed) {
    var state = seed;
    var m = Object.create(Math);
    m.random = function () {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
    return m;
}

function run(prData, opts) {
    opts = opts || {};
    sandbox.Math = makeSeededMath(opts.seed || 1);
    sandbox.currentLevel = opts.level || 1;
    sandbox.ship = { x: 400, y: 300, vx: 0, vy: 0, angle: 0, fuel: 100 };
    sandbox.landedPRLinesChanged = prData.linesChanged || 0;
    sandbox.landedPRReviewers = prData.reviewers || [];
    sandbox.landedPRApprovals = prData.approvals || 0;
    sandbox.landedPRChecks = prData.checks || [];
    sandbox.landedPRComments = prData.comments || [];
    sandbox.landedPRTitle = prData.title || '';
    sandbox.setupDriveWorld();
}

// -----------------------------------------------------------------------------
// AC#1: Road length scaling
// -----------------------------------------------------------------------------
// Baseline: level 1, no PR data → base = 3000 + 1*500 = 3500.
run({}, { level: 1 });
var baseLen = sandbox.driveRoadLength;
check('AC#1a fallback road length matches level-based formula (no PR data)',
    baseLen === 3500, 'got ' + baseLen + ', expected 3500');

// With linesChanged = 500 → scale = 1 + 500/500 = 2.0 (also the cap).
run({ linesChanged: 500 }, { level: 1 });
check('AC#1b linesChanged=500 → road length scaled by 2x (cap)',
    sandbox.driveRoadLength === Math.min(8000, Math.floor(3500 * 2)),
    'got ' + sandbox.driveRoadLength);

// With linesChanged = 250 → scale = 1 + 250/500 = 1.5.
run({ linesChanged: 250 }, { level: 1 });
check('AC#1c linesChanged=250 → road length scaled by 1.5x',
    sandbox.driveRoadLength === Math.floor(3500 * 1.5),
    'got ' + sandbox.driveRoadLength);

// With linesChanged = 2000 (huge PR) → scale clamped to 2x.
run({ linesChanged: 2000 }, { level: 1 });
check('AC#1d linesChanged=2000 → scale capped at 2x (not 5x)',
    sandbox.driveRoadLength === Math.floor(3500 * 2),
    'got ' + sandbox.driveRoadLength);

// With linesChanged = 0 → no scaling (same as fallback).
run({ linesChanged: 0 }, { level: 1 });
check('AC#1e linesChanged=0 → no scaling, level-based fallback',
    sandbox.driveRoadLength === 3500);

// Level 10 + linesChanged = 2000 → base would be 8000 (capped at MAX); scale×2
// but final length is clamped to DRIVE_ROAD_MAX_LENGTH (8000).
run({ linesChanged: 2000 }, { level: 10 });
check('AC#1f DRIVE_ROAD_MAX_LENGTH cap still respected under PR scaling',
    sandbox.driveRoadLength === 8000,
    'got ' + sandbox.driveRoadLength);

// Negative / bogus linesChanged → treated as no scaling.
run({ linesChanged: -100 }, { level: 1 });
check('AC#1g negative linesChanged ignored (no scaling)',
    sandbox.driveRoadLength === 3500);

// -----------------------------------------------------------------------------
// AC#2: Obstacle labels
// -----------------------------------------------------------------------------
// No PR data → only default-pool labels on rocks.
var DEFAULT_ROCK_POOL = {
    'edge case': 1, 'null check': 1, 'off-by-one': 1, 'race condition': 1,
    'deprecated API': 1, 'legacy code': 1, 'flaky test': 1, 'merge conflict': 1,
    'missing test': 1, 'type error': 1, 'lint warning': 1, 'circular dep': 1,
    'memory leak': 1, 'N+1 query': 1
};
run({}, { level: 1, seed: 42 });
var defaultOnly = true;
var defaultRocks = sandbox.driveObstacles.slice();
for (var i = 0; i < defaultRocks.length; i++) {
    if (!DEFAULT_ROCK_POOL[defaultRocks[i].label]) { defaultOnly = false; break; }
}
check('AC#2a no PR data → rock labels come from default pool only',
    defaultOnly && defaultRocks.length > 0,
    'rocks: ' + defaultRocks.length);

// With PR checks + comments → default labels still in the pool, but some rocks
// should draw from the PR-derived labels. We seed deterministically and run
// enough rocks that at least one PR-label rock is almost certain.
run({
    checks: ['eslint', 'type-check', 'phpunit'],
    comments: ['services/payment.php', 'please add tests']
}, { level: 1, seed: 42 });
var prLabels = { 'eslint': 1, 'type-check': 1, 'phpunit': 1, 'services/payment.php': 1, 'please add tests': 1 };
var hasPRLabeledRock = false;
var rockLabelsSeen = {};
for (var i = 0; i < sandbox.driveObstacles.length; i++) {
    var lab = sandbox.driveObstacles[i].label;
    rockLabelsSeen[lab] = (rockLabelsSeen[lab] || 0) + 1;
    if (prLabels[lab]) hasPRLabeledRock = true;
}
check('AC#2b PR checks + comments are mixed into the rock label pool',
    hasPRLabeledRock,
    'rocks=' + sandbox.driveObstacles.length + ', seen=' + JSON.stringify(rockLabelsSeen));

// Every rock's label must be from the combined pool (no stray labels).
var COMBINED_ROCK_POOL = Object.assign({}, DEFAULT_ROCK_POOL, prLabels);
var allRocksInCombined = true;
for (var i = 0; i < sandbox.driveObstacles.length; i++) {
    if (!COMBINED_ROCK_POOL[sandbox.driveObstacles[i].label]) {
        allRocksInCombined = false; break;
    }
}
check('AC#2c every rock label is from the default+PR pool',
    allRocksInCombined);

// Static pin: update.js pushes check strings into rockLabels when
// landedPRChecks/landedPRComments are present.
var updateSrcText = loadFile('js/update.js');
check('AC#2d static: rockLabels.push from landedPRChecks',
    /rockLabels\.push\(\s*_prChecks\[/.test(updateSrcText)
    || /rockLabels\.push\(\s*landedPRChecks\[/.test(updateSrcText));
check('AC#2e static: rockLabels.push from landedPRComments',
    /rockLabels\.push\(\s*_prComments\[/.test(updateSrcText)
    || /rockLabels\.push\(\s*landedPRComments\[/.test(updateSrcText));

// -----------------------------------------------------------------------------
// AC#3: Pickup labels
// -----------------------------------------------------------------------------
var DEFAULT_PICKUP_POOL = {
    'LGTM': 1, '+1': 1, 'approved': 1, 'ship it!': 1, 'CI passed': 1,
    'tests green': 1, 'looks good': 1, 'no comments': 1, 'reviewed': 1, 'merged': 1
};
run({}, { level: 1, seed: 7 });
var defaultPickupsOnly = true;
for (var i = 0; i < sandbox.drivePickups.length; i++) {
    if (!DEFAULT_PICKUP_POOL[sandbox.drivePickups[i].label]) {
        defaultPickupsOnly = false; break;
    }
}
check('AC#3a no PR data → pickup labels from default pool only',
    defaultPickupsOnly && sandbox.drivePickups.length > 0);

// With reviewers + approvals → `LGTM @alice`, `approved by @alice`,
// `approved by @bob`, `2/2 approved` all present in the pool.
run({
    reviewers: ['alice', 'bob'],
    approvals: 2,
    linesChanged: 400
}, { level: 1, seed: 7 });
var pickupLabelsSeen = {};
for (var i = 0; i < sandbox.drivePickups.length; i++) {
    pickupLabelsSeen[sandbox.drivePickups[i].label] =
        (pickupLabelsSeen[sandbox.drivePickups[i].label] || 0) + 1;
}
// With many pickups, at least one PR-labeled pickup should appear.
var prPickupLabels = ['LGTM @alice', 'approved by @alice', 'LGTM @bob', 'approved by @bob', '2/2 approved'];
var anyPRPickup = false;
for (var i = 0; i < prPickupLabels.length; i++) {
    if (pickupLabelsSeen[prPickupLabels[i]]) { anyPRPickup = true; break; }
}
check('AC#3b reviewers + approvals are mixed into pickup label pool',
    anyPRPickup,
    'pickups=' + sandbox.drivePickups.length + ', seen=' + JSON.stringify(pickupLabelsSeen));

// All pickup labels must be drawn from the combined pool.
var COMBINED_PICKUP_POOL = Object.assign({}, DEFAULT_PICKUP_POOL);
for (var i = 0; i < prPickupLabels.length; i++) COMBINED_PICKUP_POOL[prPickupLabels[i]] = 1;
var allPickupsInCombined = true;
for (var i = 0; i < sandbox.drivePickups.length; i++) {
    if (!COMBINED_PICKUP_POOL[sandbox.drivePickups[i].label]) {
        allPickupsInCombined = false; break;
    }
}
check('AC#3c every pickup label is from the default+PR pool',
    allPickupsInCombined);

// Reviewer handle already starting with `@` is not double-prefixed.
run({ reviewers: ['@charlie'] }, { level: 1, seed: 7 });
var sawCharlie = false;
for (var i = 0; i < sandbox.drivePickups.length; i++) {
    if (sandbox.drivePickups[i].label === 'LGTM @charlie'
        || sandbox.drivePickups[i].label === 'approved by @charlie') {
        sawCharlie = true; break;
    }
}
check('AC#3d reviewer already prefixed `@` is not doubled (no "@@charlie")',
    sawCharlie && !/@@charlie/.test(JSON.stringify(sandbox.drivePickups)));

// Static pins: update.js generates `LGTM ` + `@X` and `approved by ` + `@X`.
check('AC#3e static: pickupLabels.push "LGTM @<handle>"',
    /pickupLabels\.push\(\s*'LGTM '\s*\+/.test(updateSrcText));
check('AC#3f static: pickupLabels.push "approved by @<handle>"',
    /pickupLabels\.push\(\s*'approved by '\s*\+/.test(updateSrcText));
check('AC#3g static: pickupLabels.push "<N>/<M> approved" when approvals > 0',
    /pickupLabels\.push\(\s*_prApprovals\s*\+\s*'\/'\s*\+\s*reviewerCount\s*\+\s*' approved'\)/.test(updateSrcText));

// -----------------------------------------------------------------------------
// AC#4: Destination banner
// -----------------------------------------------------------------------------
var renderSrc = loadFile('js/render.js');
check('AC#4a static: banner uses landedPRTitle',
    /if\s*\(typeof landedPRTitle === 'string' && landedPRTitle\.length > 0\)/.test(renderSrc));
check('AC#4b static: banner falls back to "FEATURE COMPLETE"',
    /bannerText = 'FEATURE COMPLETE';/.test(renderSrc));
check('AC#4c static: banner truncates to 40 chars via 37-slice + "..."',
    /landedPRTitle\.length > 40/.test(renderSrc) && /\.slice\(0,\s*37\)\s*\+\s*'\.\.\.'/.test(renderSrc));

// Verify truncation logic by replicating it directly (the render fn writes to
// canvas ctx, so a runtime replay isn't ergonomic — we re-run the reference
// formula to prove a correct result shape for a long title).
function bannerFor(title) {
    if (typeof title === 'string' && title.length > 0) {
        return title.length > 40 ? title.slice(0, 37) + '...' : title;
    }
    return 'FEATURE COMPLETE';
}
check('AC#4d runtime: 40-char title passes through untruncated',
    bannerFor('x'.repeat(40)) === 'x'.repeat(40));
check('AC#4e runtime: 41-char title → 37 chars + "..." (total 40)',
    bannerFor('a'.repeat(41)) === 'a'.repeat(37) + '...'
    && bannerFor('a'.repeat(41)).length === 40);
check('AC#4f runtime: empty/absent title → FEATURE COMPLETE',
    bannerFor('') === 'FEATURE COMPLETE' && bannerFor(null) === 'FEATURE COMPLETE');
var longTitle = 'Fix customer group extension attributes when multi-site is enabled and shared across regions';
check('AC#4g runtime: long real-world title truncated to exactly 40 chars',
    bannerFor(longTitle).length === 40
    && bannerFor(longTitle).slice(-3) === '...');

// -----------------------------------------------------------------------------
// AC#5: Labels are purely cosmetic (no gameplay effect)
// -----------------------------------------------------------------------------
// Run twice with identical seed + level + linesChanged but different label
// pools: counts, segment types, and obstacle/pickup positions must be
// byte-identical (labels may differ). This proves the pool is consumed only at
// the `.label` assignment step — nothing else about the world depends on it.
function snapshotCosmetic(obstacles, pickups, segments) {
    var obs = obstacles.map(function (o) { return { x: o.x, y: o.y, type: o.type, size: o.size }; });
    var pks = pickups.map(function (p) { return { x: p.x, y: p.y, size: p.size, collected: p.collected }; });
    var segs = segments.map(function (s) { return { x: s.x, y: s.y, type: s.type }; });
    return JSON.stringify({ obs: obs, pks: pks, segs: segs });
}

run({}, { level: 2, seed: 99 });
var shapeA = snapshotCosmetic(sandbox.driveObstacles, sandbox.drivePickups, sandbox.driveRoadSegments);
var roadLenA = sandbox.driveRoadLength;

run({
    checks: ['custom-check-that-only-changes-labels'],
    comments: ['another-cosmetic-label'],
    reviewers: ['reviewer1'],
    approvals: 1
}, { level: 2, seed: 99 });
var shapeB = snapshotCosmetic(sandbox.driveObstacles, sandbox.drivePickups, sandbox.driveRoadSegments);
var roadLenB = sandbox.driveRoadLength;

check('AC#5a label pool swap does not change obstacle/pickup positions or segment types',
    shapeA === shapeB);
check('AC#5b label pool swap does not change road length (no linesChanged)',
    roadLenA === roadLenB);

// But swapping linesChanged DOES change road length (sanity: only linesChanged
// controls length, not labels).
run({
    checks: ['custom-check-that-only-changes-labels'],
    comments: ['another-cosmetic-label'],
    reviewers: ['reviewer1'],
    approvals: 1,
    linesChanged: 500
}, { level: 2, seed: 99 });
check('AC#5c linesChanged DOES change road length (AC#1 companion)',
    sandbox.driveRoadLength !== roadLenB);

// -----------------------------------------------------------------------------
// Structural pins on update.js setupDriveWorld
// -----------------------------------------------------------------------------
check('pin: setupDriveWorld scales driveRoadLength via landedPRLinesChanged',
    /landedPRLinesChanged[\s\S]*?Math\.min\(2,\s*1\s*\+\s*[\w_]*\s*\/\s*500\)/.test(updateSrcText));
check('pin: setupDriveWorld clamps scaled length at DRIVE_ROAD_MAX_LENGTH',
    /driveRoadLength\s*=\s*Math\.min\(DRIVE_ROAD_MAX_LENGTH,\s*Math\.floor\(driveRoadLength\s*\*\s*prScale\)\)/.test(updateSrcText));

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
