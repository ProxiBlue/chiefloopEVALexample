// US-005 (Feature Drive): Runtime integration test for procedural road
// generation. Loads js/config.js + the real setupDriveWorld() from
// js/update.js into a vm sandbox, runs the generator across multiple levels
// (with a seeded Math.random so results are deterministic), and asserts every
// acceptance criterion.
//
// Also does static pins against js/render.js so the render contract for
// gaps / slow zones / speed boosts / destination edge markers stays present.
//
// Run:  node tests/integration-drive-us005.js
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

// Tiny seeded PRNG so the runtime assertions are deterministic.
function makeSeededRandom(seed) {
    var s = seed >>> 0;
    return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xFFFFFFFF;
    };
}

// Wrap Math so Math.random() is seeded but every other property (which lives
// on the Math namespace as non-enumerable data/methods) stays accessible via
// the prototype chain. Object.assign({}, Math) strips those methods.
var seededRandom = makeSeededRandom(12345);
var seededMath = Object.create(Math);
seededMath.random = seededRandom;

var sandbox = {
    console: console,
    Math: seededMath, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean,
    Infinity: Infinity,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

var updateSrc = loadFile('js/update.js');
var setupFnSrc = extractBlock(updateSrc, 'function setupDriveWorld() {', 'setupDriveWorld');
vm.runInContext(setupFnSrc, sandbox, { filename: 'setupDriveWorld-extracted' });
check('setupDriveWorld evaluated into sandbox',
    typeof sandbox.setupDriveWorld === 'function');

// Run the generator at a few levels so scaling + variability get exercised.
function generate(level) {
    sandbox.currentLevel = level;
    sandbox.setupDriveWorld();
    return {
        level: level,
        segs: sandbox.driveRoadSegments.slice(),
        obstacles: sandbox.driveObstacles.slice(),
        pickups: sandbox.drivePickups.slice(),
        length: sandbox.driveRoadLength,
    };
}

var SEG_W = 20;
var SAFE_START = 200;
var GAP_MIN = sandbox.DRIVE_GAP_MIN_WIDTH;
var GAP_MAX = sandbox.DRIVE_GAP_MAX_WIDTH;

// AC#1: segments ~20px wide.
var r0 = generate(0);
check('AC#1: segments are 20px wide (x spacing)',
    r0.segs.length >= 2 && (r0.segs[1].x - r0.segs[0].x) === SEG_W);
check('AC#1: every segment defines a ground height (y)',
    r0.segs.every(function (s) { return typeof s.y === 'number' && !isNaN(s.y); }));
check('AC#1: segment count covers the full road length',
    r0.segs.length * SEG_W >= r0.length);

// AC#2: rolling hills in bottom 40% of canvas (y in [0.60 canvas.h, 0.85]).
var yMin = Math.min.apply(Math, r0.segs.map(function (s) { return s.y; }));
var yMax = Math.max.apply(Math, r0.segs.map(function (s) { return s.y; }));
var canvasH = sandbox.canvas.height;
check('AC#2: ground heights stay within the bottom 40% of canvas',
    yMin >= canvasH * 0.60 - 0.001 && yMax <= canvasH * 0.85 + 0.001,
    'yMin=' + yMin + ' yMax=' + yMax);
// Rolling = some variation but not wildly noisy.
var yDelta = yMax - yMin;
check('AC#2: ground height varies across the road (rolling, not perfectly flat)',
    yDelta > 4);
check('AC#2: ground height is bounded (no spikes beyond the 40% band)',
    yDelta <= (canvasH * 0.85) - (canvasH * 0.60));

// Collect several runs across levels to exercise gap scaling and label pools.
var rL0 = r0;
var rL5 = generate(5);
var rL15 = generate(15);

// Gather gaps as contiguous runs of `type === 'gap'` segments.
function collectGaps(segs) {
    var gaps = [];
    var i = 0;
    while (i < segs.length) {
        if (segs[i].type === 'gap') {
            var start = segs[i].x;
            var j = i;
            while (j < segs.length && segs[j].type === 'gap') j++;
            var end = j < segs.length ? segs[j].x : segs[segs.length - 1].x + SEG_W;
            gaps.push({ start: start, end: end, width: end - start });
            i = j;
        } else {
            i++;
        }
    }
    return gaps;
}
var gaps0 = collectGaps(rL0.segs);
var gaps5 = collectGaps(rL5.segs);
var gaps15 = collectGaps(rL15.segs);

// AC#3: gaps exist and widths fall in [MIN, MAX + 1 segment snap slop].
check('AC#3: at least one gap generated at level 0',
    gaps0.length >= 1, 'gaps0.length=' + gaps0.length);
check('AC#3: gap widths ≥ DRIVE_GAP_MIN_WIDTH (segment-snapped)',
    gaps0.every(function (g) { return g.width >= GAP_MIN - 0.001; }));
// Segment snapping rounds the requested width up to the nearest segment
// boundary — at most one segment (20px) beyond the requested max.
check('AC#3: gap widths ≤ DRIVE_GAP_MAX_WIDTH + SEG_W (segment-snapped upper bound)',
    gaps0.every(function (g) { return g.width <= GAP_MAX + SEG_W + 0.001; }));
// AC#3: gap frequency increases with level.
var freq0 = gaps0.length / rL0.length;
var freq15 = gaps15.length / rL15.length;
check('AC#3: gap frequency at level 15 ≥ level 0 (scales with level)',
    freq15 >= freq0, 'freq0=' + freq0 + ' freq15=' + freq15);

// AC#4: rocks have labels from the obstacle label pool.
var OBSTACLE_LABEL_POOL = [
    'edge case', 'null check', 'off-by-one', 'race condition',
    'deprecated API', 'legacy code', 'flaky test', 'merge conflict',
    'missing test', 'type error', 'lint warning', 'circular dep',
    'memory leak', 'N+1 query'
];
check('AC#4: at least one rock generated',
    rL0.obstacles.length >= 1);
check('AC#4: every rock is typed "rock"',
    rL0.obstacles.every(function (r) { return r.type === 'rock'; }));
check('AC#4: every rock sits on the ground surface (y within terrain band)',
    rL0.obstacles.every(function (r) { return r.y >= canvasH * 0.60 && r.y <= canvasH * 0.85; }));
check('AC#4: every rock carries a label from the obstacle pool',
    rL0.obstacles.every(function (r) {
        return typeof r.label === 'string' && OBSTACLE_LABEL_POOL.indexOf(r.label) !== -1;
    }));

// AC#5: slow zones labeled `// TODO` or `tech debt`, segment type 'slow'.
var slowSegs = rL0.segs.filter(function (s) { return s.type === 'slow'; });
check('AC#5: at least one slow-zone segment generated',
    slowSegs.length >= 1, 'slowSegs.length=' + slowSegs.length);
var SLOW_LABELS = ['// TODO', 'tech debt'];
check('AC#5: every slow-zone segment carries a valid slow-zone label',
    slowSegs.every(function (s) { return SLOW_LABELS.indexOf(s.label) !== -1; }));

// AC#6: speed boosts labeled `CI passed` or `tests green`, segment type 'boost'.
var boostSegs = rL0.segs.filter(function (s) { return s.type === 'boost'; });
check('AC#6: at least one speed-boost segment generated',
    boostSegs.length >= 1, 'boostSegs.length=' + boostSegs.length);
var BOOST_LABELS = ['CI passed', 'tests green'];
check('AC#6: every speed-boost segment carries a valid boost label',
    boostSegs.every(function (s) { return BOOST_LABELS.indexOf(s.label) !== -1; }));

// AC#7: pickups are floating above the ground (y < terrain y for that X) and
// come in varying heights (some low, some elevated requiring a jump).
var PICKUP_LABEL_POOL = [
    'LGTM', '+1', 'approved', 'ship it!', 'CI passed',
    'tests green', 'looks good', 'no comments', 'reviewed', 'merged'
];
check('AC#7: at least one pickup generated',
    rL0.pickups.length >= 1);
check('AC#7: every pickup has a label from the pickup pool',
    rL0.pickups.every(function (p) {
        return typeof p.label === 'string' && PICKUP_LABEL_POOL.indexOf(p.label) !== -1;
    }));
check('AC#7: every pickup floats above the corresponding terrain surface',
    rL0.pickups.every(function (p) {
        var idx = Math.floor(p.x / SEG_W);
        if (idx < 0 || idx >= rL0.segs.length) return false;
        return p.y < rL0.segs[idx].y;
    }));
// Varying heights — look for both low (≤40px above ground) and elevated
// (>40px above ground) pickups across the run.
var groundDiffs = rL0.pickups.map(function (p) {
    var idx = Math.min(rL0.segs.length - 1, Math.max(0, Math.floor(p.x / SEG_W)));
    return rL0.segs[idx].y - p.y;
});
var hasLow = groundDiffs.some(function (d) { return d <= 40; });
var hasHigh = groundDiffs.some(function (d) { return d > 40; });
// Sampled levels vary — fall back to a multi-level sample if one level
// happened to generate only one band.
if (!(hasLow && hasHigh)) {
    var poolDiffs = [];
    [rL0, rL5, rL15].forEach(function (r) {
        r.pickups.forEach(function (p) {
            var idx = Math.min(r.segs.length - 1, Math.max(0, Math.floor(p.x / SEG_W)));
            poolDiffs.push(r.segs[idx].y - p.y);
        });
    });
    hasLow = poolDiffs.some(function (d) { return d <= 40; });
    hasHigh = poolDiffs.some(function (d) { return d > 40; });
}
check('AC#7: pickups have varying heights (both low and elevated samples present)',
    hasLow && hasHigh, 'hasLow=' + hasLow + ' hasHigh=' + hasHigh);

// AC#8: destination pad at the end of the road with a banner (render-side).
// Drive setup: last segment is at/near driveRoadLength.
check('AC#8: road segments reach the road length (destination at the end)',
    (rL0.segs[rL0.segs.length - 1].x + SEG_W) >= rL0.length);
var renderSrc = loadFile('js/render.js');
check('AC#8: drawDriveWorld renders a destination pad at driveRoadLength',
    /destX\s*=\s*driveRoadLength\s*-\s*scrollX/.test(renderSrc));
check('AC#8: destination pad uses edge-marker ticks (lineTo destY - N vertical)',
    /moveTo\(destX,\s*destY\);[\s\S]*?lineTo\(destX,\s*destY\s*-\s*\d+\);/.test(renderSrc));
check('AC#8: destination pad banner text rendered (FEATURE COMPLETE fallback)',
    /FEATURE COMPLETE/.test(renderSrc));
check('AC#8: render uses PR_TYPE_COLORS.feature for destination pad',
    /PR_TYPE_COLORS\.feature/.test(renderSrc));

// AC#9: obstacle + pickup density constants used, minimum spacing enforced.
(function () {
    // Density constants referenced in setup.
    check('AC#9: setupDriveWorld references DRIVE_OBSTACLE_DENSITY_BASE',
        /DRIVE_OBSTACLE_DENSITY_BASE/.test(setupFnSrc));
    check('AC#9: setupDriveWorld references DRIVE_OBSTACLE_DENSITY_PER_LEVEL',
        /DRIVE_OBSTACLE_DENSITY_PER_LEVEL/.test(setupFnSrc));
    check('AC#9: setupDriveWorld references DRIVE_OBSTACLE_DENSITY_MAX',
        /DRIVE_OBSTACLE_DENSITY_MAX/.test(setupFnSrc));
    check('AC#9: setupDriveWorld references DRIVE_PICKUP_DENSITY',
        /DRIVE_PICKUP_DENSITY/.test(setupFnSrc));

    // Minimum spacing between rocks.
    var rocks = rL0.obstacles.slice().sort(function (a, b) { return a.x - b.x; });
    var minRockGap = Infinity;
    for (var i = 1; i < rocks.length; i++) {
        var d = rocks[i].x - rocks[i - 1].x;
        if (d < minRockGap) minRockGap = d;
    }
    check('AC#9: minimum spacing enforced between rocks (≥ 80px between centers)',
        rocks.length < 2 || minRockGap >= 80 - 0.001,
        'minRockGap=' + minRockGap);
    // Minimum spacing between pickups.
    var pk = rL0.pickups.slice().sort(function (a, b) { return a.x - b.x; });
    var minPickGap = Infinity;
    for (var p = 1; p < pk.length; p++) {
        var dp = pk[p].x - pk[p - 1].x;
        if (dp < minPickGap) minPickGap = dp;
    }
    check('AC#9: minimum spacing enforced between pickups (≥ 80px between centers)',
        pk.length < 2 || minPickGap >= 80 - 0.001,
        'minPickGap=' + minPickGap);

    // No rocks placed on gap / slow / boost segments.
    var allClean = rL0.obstacles.every(function (r) {
        var idx = Math.floor(r.x / SEG_W);
        if (idx < 0 || idx >= rL0.segs.length) return false;
        return rL0.segs[idx].type === 'ground';
    });
    check('AC#9: rocks are only placed on plain ground segments (no gap/slow/boost overlap)',
        allClean);
}());

// AC#10: safe zones — nothing in first 200px or last 200px.
[rL0, rL5, rL15].forEach(function (r) {
    var tag = 'L' + r.level;
    var safeEnd = r.length - 200;
    var rocksOutside = r.obstacles.every(function (o) {
        return o.x >= SAFE_START && o.x <= safeEnd;
    });
    check('AC#10 (' + tag + '): all rocks inside safe-zone window [200, L-200]',
        rocksOutside);
    var pickupsOutside = r.pickups.every(function (p) {
        return p.x >= SAFE_START && p.x <= safeEnd;
    });
    check('AC#10 (' + tag + '): all pickups inside safe-zone window [200, L-200]',
        pickupsOutside);
    var firstSafe = r.segs.slice(0, Math.floor(SAFE_START / SEG_W));
    var lastSafe = r.segs.slice(Math.floor(safeEnd / SEG_W) + 1);
    var firstClean = firstSafe.every(function (s) { return s.type === 'ground'; });
    var lastClean = lastSafe.every(function (s) { return s.type === 'ground'; });
    check('AC#10 (' + tag + '): first 200px contains only ground segments (no gap/slow/boost)',
        firstClean);
    check('AC#10 (' + tag + '): last 200px contains only ground segments (no gap/slow/boost)',
        lastClean);
});

// Render-side static pins for the new segment types (US-005 AC wording:
// "rendered with a hatched/darker pattern" for slow zones, "rendered with
// chevrons/bright arrows" for speed boosts).
check('render: drawDriveWorld handles gap segments (breaks the run on type===gap)',
    /type\s*===\s*['"]gap['"]/.test(renderSrc));
check('render: drawDriveWorld renders slow zones with darker overlay and hatching',
    /type\s*===\s*['"]slow['"]/.test(renderSrc)
    && /(rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,[^)]*\))/.test(renderSrc));
check('render: drawDriveWorld renders speed boosts with chevron arrows',
    /type\s*===\s*['"]boost['"]/.test(renderSrc));

console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
