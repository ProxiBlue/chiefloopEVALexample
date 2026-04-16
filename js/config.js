// --- Game States ---
var STATES = {
    MENU: 'menu',
    PLAYING: 'playing',
    LANDED: 'landed',
    CRASHED: 'crashed',
    GAMEOVER: 'gameover',
    INVADER_LIFTOFF: 'invader_liftoff',
    INVADER_TRANSITION: 'invader_transition',
    INVADER_PLAYING: 'invader_playing',
    INVADER_COMPLETE: 'invader_complete',
    INVADER_RETURN: 'invader_return'
};

var gameState = STATES.MENU;

// --- Score ---
var score = 0;

// --- Level Configuration (endless scaling) ---
function getLevelConfig(level) {
    // Gravity: starts at 1.6, increases by 0.2 per level, caps at 5.0
    var gravity = Math.min(1.6 + level * 0.2, 5.0);
    // Pad count: starts at 3, decreases by 1 every 2 levels, minimum 1
    var padCount = Math.max(1, 3 - Math.floor(level / 2));
    // Wind: starts at 0, increases by 0.75 per level, caps at 8.0
    var maxWind = Math.min(level * 0.75, 8.0);
    return { gravity: gravity, padCount: padCount, maxWind: maxWind };
}
var currentLevel = 0;

// --- Physics Constants ---
var GRAVITY = getLevelConfig(currentLevel).gravity;  // m/s^2, configurable per level
var THRUST_POWER = GRAVITY * 2.5;  // 2.5x gravity so thrust clearly overcomes gravity
var PIXELS_PER_METER = 50;  // scale factor: 1 m/s = 50 px/s
var ROTATION_SPEED = 3;     // radians per second

// --- Wind ---
var wind = {
    strength: 0,        // current wind strength in m/s^2 (positive = right, negative = left)
    maxStrength: 0,     // max wind strength for current level
    gustTimer: 0,       // time until next gust change
    gustInterval: 2,    // seconds between gust changes (randomized)
    targetStrength: 0   // wind lerps toward this value
};

function resetWind() {
    wind.maxStrength = getLevelConfig(currentLevel).maxWind || 0;
    wind.strength = 0;
    wind.targetStrength = 0;
    wind.gustTimer = 1 + Math.random() * 2;
}

// --- PR-based Landing Pad Configuration ---
var MAX_PADS_PER_LEVEL = 5;     // PRs per level batch (5 per batch)
var PR_PAD_WIDTHS = {           // pad width by PR type
    security: 1,                // narrow (hardest)
    bugfix: 2,                  // medium
    feature: 3,                 // wide (easiest)
    other: 2                    // medium
};
var PR_PAD_POINTS = {           // points by PR type (inverse of difficulty)
    security: 200,              // hardest = most points
    bugfix: 100,
    feature: 50,
    other: 100
};
var PR_TYPE_MULTIPLIERS = {     // score multiplier by PR type
    security: 3,
    bugfix: 2,
    feature: 1,
    other: 1
};
var PR_TYPE_COLORS = {          // pad color by PR type
    security: '#DC143C',        // crimson/red
    bugfix: '#FFB300',          // amber/yellow
    feature: '#00BCD4',         // cyan/blue
    other: '#9E9E9E'            // gray
};

// --- Ship / Fuel Constants ---
var FUEL_MAX = 100;         // fuel units per level
var FUEL_BURN_RATE = 10;    // fuel units consumed per second while thrusting

// --- Invader Liftoff Animation ---
var LIFTOFF_RISE_SPEED = 120;       // pixels per second during vertical rise
var LIFTOFF_ROTATION_DURATION = 1;  // seconds for the 90-degree rotation
var invaderLiftoffPhase = 'rising'; // 'rising' or 'rotating'
var invaderLiftoffRotationTimer = 0; // elapsed time in rotation phase
