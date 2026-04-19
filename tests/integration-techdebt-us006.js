// US-006 (Tech Debt Blaster): Runtime integration test for bullet firing
// inside the TECHDEBT_PLAYING block.
//
// Extracts the `if (gameState === STATES.TECHDEBT_PLAYING) { ... }` body
// from js/update.js verbatim and replays it in a vm sandbox. Verifies AC:
//   - Space fires a bullet from the ship's nose along the facing direction
//   - Bullets travel at TECHDEBT_BULLET_SPEED along that vector
//   - Cooldown of TECHDEBT_BULLET_COOLDOWN gates the fire rate
//   - Bullets expire after TECHDEBT_BULLET_LIFETIME seconds
//   - Bullets wrap around all four screen edges
//   - The shoot sound is played when a bullet is fired (and only then)
//
// Run:  node tests/integration-techdebt-us006.js
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
    console.log(tag + ' \u2014 ' + name + (!ok && detail ? ' :: ' + detail : ''));
    if (ok) passed++; else failed++;
}

function loadFile(rel) {
    return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

var soundCalls = { shoot: 0, thrustStart: 0, thrustStop: 0 };
var sandbox = {
    console: console,
    Math: Math, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean,
    canvas: { width: 800, height: 600 },
    window: { addEventListener: function () {} },
    keys: {},
    // SHIP_SIZE lives in collision.js in the real app — stub here to match.
    SHIP_SIZE: 40,
    stopThrustSound: function () { soundCalls.thrustStop++; },
    startThrustSound: function () { soundCalls.thrustStart++; },
    playTechdebtShootSound: function () { soundCalls.shoot++; },
    spawnBugWave: function () {},
    setupMissileWorld: function () {},
    setupTechdebtWorld: function () {},
    resetShip: function () {},
    resetWind: function () {},
    generateTerrain: function () {},
    getLevelConfig: function () { return { gravity: 0.05 }; },
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(loadFile('js/config.js'), sandbox, { filename: 'js/config.js' });

// Extract the TECHDEBT_PLAYING block from update.js (brace-walk).
var updateSrc = loadFile('js/update.js');
var sig = 'if (gameState === STATES.TECHDEBT_PLAYING) {';
var startIdx = updateSrc.indexOf(sig);
if (startIdx < 0) {
    check('update.js contains TECHDEBT_PLAYING block', false, 'signature not found');
    process.exit(1);
}
var openBrace = updateSrc.indexOf('{', startIdx + sig.length - 1);
var depth = 0, closeBrace = -1;
for (var i = openBrace; i < updateSrc.length; i++) {
    if (updateSrc[i] === '{') depth++;
    else if (updateSrc[i] === '}') { depth--; if (depth === 0) { closeBrace = i; break; } }
}
var playBlock = updateSrc.slice(startIdx, closeBrace + 1);
var playReplay = new vm.Script('(function () {\n' + playBlock + '\n}).call(this);',
    { filename: 'techdebt-playing-extracted' });

function freshShip(over) {
    var s = {
        x: 400, y: 300,
        vx: 0, vy: 0,
        angle: 0,
        rotationSpeed: sandbox.ROTATION_SPEED,
        thrusting: false,
        rotating: null,
        fuel: sandbox.FUEL_MAX
    };
    if (over) for (var k in over) s[k] = over[k];
    return s;
}

function reset(over) {
    sandbox.techdebtBullets = [];
    sandbox.techdebtBulletCooldownTimer = 0;
    sandbox.keys = (over && over.keys) ? over.keys : {};
    sandbox.gameState = sandbox.STATES.TECHDEBT_PLAYING;
    sandbox.dt = (over && over.dt !== undefined) ? over.dt : 0.016;
    sandbox.ship = freshShip(over && over.ship);
    soundCalls.shoot = 0;
}

function tick(over) {
    if (over && over.keys !== undefined) sandbox.keys = over.keys;
    if (over && over.dt !== undefined) sandbox.dt = over.dt;
    playReplay.runInContext(sandbox);
}

// --- AC: Pressing Space fires a bullet from the nose along the facing dir ---
reset({ keys: { ' ': true }, ship: { angle: 0, x: 400, y: 300 } });
tick();
check('Space + angle=0 spawns exactly one bullet',
    sandbox.techdebtBullets.length === 1,
    'bullets: ' + sandbox.techdebtBullets.length);
var b0 = sandbox.techdebtBullets[0];
// At angle=0 nose points up (-Y). Expect vx ~ 0, vy ~ -TECHDEBT_BULLET_SPEED.
check('bullet vx == 0 at angle=0',
    Math.abs(b0.vx) < 1e-9,
    'vx: ' + b0.vx);
check('bullet vy == -TECHDEBT_BULLET_SPEED at angle=0',
    Math.abs(b0.vy - (-sandbox.TECHDEBT_BULLET_SPEED)) < 1e-9,
    'vy: ' + b0.vy);
// Spawn offset: nose of ship is SHIP_SIZE*0.6 ahead along facing vector.
// NOTE: bullets are also advanced one tick in the same frame they spawn
// (matches the invader bullets ordering), so the expected position is
// spawn + v * dt. dt defaults to 0.016 in runTick.
var expectNoseY = 300 + (-1) * sandbox.SHIP_SIZE * 0.6
    + (-sandbox.TECHDEBT_BULLET_SPEED) * 0.016;
check('bullet spawns at nose offset (y) along -Y from ship center',
    Math.abs(b0.y - expectNoseY) < 1e-6,
    'y: ' + b0.y + ' expected: ' + expectNoseY);
check('bullet spawns at ship.x (dx=0) at angle=0',
    Math.abs(b0.x - 400) < 1e-6,
    'x: ' + b0.x);
check('firing plays the shoot sound exactly once',
    soundCalls.shoot === 1,
    'shoot calls: ' + soundCalls.shoot);

// Firing at angle = π/2 fires to the right.
reset({ keys: { ' ': true }, ship: { angle: Math.PI / 2, x: 400, y: 300 } });
tick();
var b1 = sandbox.techdebtBullets[0];
check('angle=π/2: bullet vx ~ +TECHDEBT_BULLET_SPEED',
    Math.abs(b1.vx - sandbox.TECHDEBT_BULLET_SPEED) < 1e-6,
    'vx: ' + b1.vx);
check('angle=π/2: bullet vy ~ 0',
    Math.abs(b1.vy) < 1e-6,
    'vy: ' + b1.vy);

// --- AC: Bullets travel at TECHDEBT_BULLET_SPEED in a straight line ---
// Spawn a bullet pointing along +X, tick forward, expect x to advance by v*dt
// and y unchanged.
reset({});
sandbox.techdebtBullets.push({ x: 100, y: 300, vx: sandbox.TECHDEBT_BULLET_SPEED, vy: 0, age: 0 });
tick({ dt: 0.1 });
var b2 = sandbox.techdebtBullets[0];
check('bullet advances by vx * dt along straight line',
    Math.abs(b2.x - (100 + sandbox.TECHDEBT_BULLET_SPEED * 0.1)) < 1e-9,
    'x: ' + b2.x);
check('bullet y is unchanged under (vx>0, vy=0) motion',
    Math.abs(b2.y - 300) < 1e-9,
    'y: ' + b2.y);
check('bullet.age incremented by dt',
    Math.abs(b2.age - 0.1) < 1e-9,
    'age: ' + b2.age);

// --- AC: Cooldown of TECHDEBT_BULLET_COOLDOWN between shots ---
// Held-space across many frames at small dt → fire rate is gated, not unlimited.
reset({ keys: { ' ': true } });
for (var f = 0; f < 10; f++) tick({ dt: 0.01 });
// 10 frames * 0.01s = 0.10s elapsed; cooldown is 0.18s → expect only 1 shot.
check('holding Space for 0.10s (< cooldown) fires only once',
    sandbox.techdebtBullets.length === 1,
    'bullets: ' + sandbox.techdebtBullets.length);

reset({ keys: { ' ': true } });
// Simulate 0.5s elapsed — at cooldown=0.18s this should yield ceil(0.5/0.18)=3 shots max.
for (var f2 = 0; f2 < 50; f2++) tick({ dt: 0.01 });
var shots = sandbox.techdebtBullets.length;
check('held Space for 0.50s fires ≥ 2 but ≤ 1 + floor(0.50/cooldown)',
    shots >= 2 && shots <= 1 + Math.floor(0.5 / sandbox.TECHDEBT_BULLET_COOLDOWN) + 1,
    'shots: ' + shots + ' cooldown: ' + sandbox.TECHDEBT_BULLET_COOLDOWN);

// Cooldown decrements in a frame where Space is NOT held.
reset({});
sandbox.techdebtBulletCooldownTimer = 0.10;
tick({ keys: {}, dt: 0.05 });
check('cooldown timer decremented by dt when Space not held',
    Math.abs(sandbox.techdebtBulletCooldownTimer - 0.05) < 1e-9,
    'timer: ' + sandbox.techdebtBulletCooldownTimer);

// Cooldown never goes negative.
reset({});
sandbox.techdebtBulletCooldownTimer = 0.01;
tick({ keys: {}, dt: 0.5 });
check('cooldown timer clamps at 0 (never negative)',
    sandbox.techdebtBulletCooldownTimer === 0,
    'timer: ' + sandbox.techdebtBulletCooldownTimer);

// --- AC: Bullets expire after TECHDEBT_BULLET_LIFETIME seconds ---
reset({});
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: -1, age: 0 });
// Tick until age exceeds lifetime. Use dt that makes total > lifetime.
tick({ keys: {}, dt: sandbox.TECHDEBT_BULLET_LIFETIME + 0.01 });
check('bullet removed from array when age >= TECHDEBT_BULLET_LIFETIME',
    sandbox.techdebtBullets.length === 0,
    'bullets: ' + sandbox.techdebtBullets.length);

// And a bullet whose age is still below lifetime is NOT removed.
reset({});
sandbox.techdebtBullets.push({ x: 400, y: 300, vx: 0, vy: -1, age: 0 });
tick({ keys: {}, dt: sandbox.TECHDEBT_BULLET_LIFETIME * 0.5 });
check('bullet persists while age < TECHDEBT_BULLET_LIFETIME',
    sandbox.techdebtBullets.length === 1,
    'bullets: ' + sandbox.techdebtBullets.length);

// --- AC: Bullets wrap around all four screen edges ---
reset({});
sandbox.techdebtBullets.push({ x: 799, y: 300, vx: sandbox.TECHDEBT_BULLET_SPEED, vy: 0, age: 0 });
tick({ keys: {}, dt: 0.1 });
check('bullet exits right edge → wraps to left',
    sandbox.techdebtBullets[0].x < sandbox.canvas.width * 0.5,
    'x: ' + sandbox.techdebtBullets[0].x);

reset({});
sandbox.techdebtBullets.push({ x: 1, y: 300, vx: -sandbox.TECHDEBT_BULLET_SPEED, vy: 0, age: 0 });
tick({ keys: {}, dt: 0.1 });
check('bullet exits left edge → wraps to right',
    sandbox.techdebtBullets[0].x > sandbox.canvas.width * 0.5,
    'x: ' + sandbox.techdebtBullets[0].x);

reset({});
sandbox.techdebtBullets.push({ x: 400, y: 599, vx: 0, vy: sandbox.TECHDEBT_BULLET_SPEED, age: 0 });
tick({ keys: {}, dt: 0.1 });
check('bullet exits bottom edge → wraps to top',
    sandbox.techdebtBullets[0].y < sandbox.canvas.height * 0.5,
    'y: ' + sandbox.techdebtBullets[0].y);

reset({});
sandbox.techdebtBullets.push({ x: 400, y: 1, vx: 0, vy: -sandbox.TECHDEBT_BULLET_SPEED, age: 0 });
tick({ keys: {}, dt: 0.1 });
check('bullet exits top edge → wraps to bottom',
    sandbox.techdebtBullets[0].y > sandbox.canvas.height * 0.5,
    'y: ' + sandbox.techdebtBullets[0].y);

// --- AC: after wrap, bullet stays in [0, canvas.size) (no off-canvas) ---
reset({});
sandbox.techdebtBullets.push({ x: 700, y: 500, vx: 300, vy: 300, age: 0 });
tick({ keys: {}, dt: 0.5 });
check('after wrap, bullet.x in [0, canvas.width)',
    sandbox.techdebtBullets[0].x >= 0 && sandbox.techdebtBullets[0].x < sandbox.canvas.width,
    'x: ' + sandbox.techdebtBullets[0].x);
check('after wrap, bullet.y in [0, canvas.height)',
    sandbox.techdebtBullets[0].y >= 0 && sandbox.techdebtBullets[0].y < sandbox.canvas.height,
    'y: ' + sandbox.techdebtBullets[0].y);

// --- AC: thrust sound is NOT played for bullets (shoot sound is separate) ---
// Fire with Space only (no Up). Verify startThrustSound is not invoked.
soundCalls.thrustStart = 0;
reset({ keys: { ' ': true } });
tick();
check('Space (no Up) does NOT invoke startThrustSound',
    soundCalls.thrustStart === 0,
    'thrustStart: ' + soundCalls.thrustStart);
check('Space does invoke playTechdebtShootSound',
    soundCalls.shoot === 1,
    'shoot: ' + soundCalls.shoot);

// --- AC: bullet.x/y from firing is at ship's nose (offset by sin/cos * size*0.6) ---
reset({ keys: { ' ': true }, ship: { angle: Math.PI / 2, x: 400, y: 300 } });
tick();
var b3 = sandbox.techdebtBullets[0];
// Same one-tick-advance caveat as above.
var expectNoseX = 400 + sandbox.SHIP_SIZE * 0.6
    + sandbox.TECHDEBT_BULLET_SPEED * 0.016;
check('angle=π/2: bullet spawns to ship.x + SHIP_SIZE*0.6 along +X',
    Math.abs(b3.x - expectNoseX) < 1e-6,
    'x: ' + b3.x + ' expected: ' + expectNoseX);
check('angle=π/2: bullet y is at ship.y (cos(π/2)=0 → no Y offset)',
    Math.abs(b3.y - 300) < 1e-6,
    'y: ' + b3.y);

console.log('\n' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
