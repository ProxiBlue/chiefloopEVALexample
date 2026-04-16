// --- Game States ---
var STATES = {
    MENU: 'menu',
    PLAYING: 'playing',
    LANDED: 'landed',
    CRASHED: 'crashed',
    GAMEOVER: 'gameover',
    SCENE_LIFTOFF: 'scene_liftoff',
    SCENE_SCROLL: 'scene_scroll',
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

// --- Scene Liftoff Animation (after normal landing) ---
var SCENE_LIFTOFF_RISE_SPEED = 120; // pixels per second during vertical rise

// --- Scene Scroll (horizontal terrain transition between levels) ---
var SCENE_SCROLL_DURATION = 2.5;    // seconds for the horizontal scroll
// Scroll state is encapsulated in a single object to prevent partial mutation.
// null when no scroll is active; a frozen object during SCENE_SCROLL.
var sceneScrollState = null;        // { timer, oldTerrain, oldPads, newTerrain, newPads }

function createSceneScrollState(oldTerrain, oldPads, newTerrain, newPads) {
    return Object.freeze({
        timer: 0,
        oldTerrain: oldTerrain,
        oldPads: oldPads,
        newTerrain: newTerrain,
        newPads: newPads
    });
}

// --- Invader Liftoff Animation ---
var LIFTOFF_RISE_SPEED = 120;       // pixels per second during vertical rise
var LIFTOFF_ROTATION_DURATION = 1;  // seconds for the 90-degree rotation
var invaderLiftoffPhase = 'rising'; // 'rising' or 'rotating'
var invaderLiftoffRotationTimer = 0; // elapsed time in rotation phase

// --- Invader Terrain Transition ---
var TERRAIN_TRANSITION_DURATION = 1.5; // seconds to flatten terrain
var TERRAIN_FLAT_Y_RATIO = 0.87;       // flat ground at 87% of canvas height
var terrainTransitionTimer = 0;         // elapsed time in transition
var terrainOriginalPoints = [];         // snapshot of terrain Y values before flattening

// --- Invader Player Movement ---
var INVADER_MOVE_SPEED = 200;           // pixels per second (direct movement, all 4 directions)

// --- Alien Wave Configuration ---
var ALIEN_SPEED = 120;                  // pixels per second (leftward)
var ALIEN_SIZE = 28;                    // pixel size of each alien sprite
var ALIEN_SPAWN_MARGIN = 50;            // extra px off-screen right before spawning

// Grid formation bounds
var ALIEN_GRID_ROWS_MIN = 3;
var ALIEN_GRID_ROWS_MAX = 5;
var ALIEN_GRID_COLS_MIN = 5;
var ALIEN_GRID_COLS_MAX = 8;
var ALIEN_GRID_SPACING_X = 50;          // horizontal spacing between grid aliens
var ALIEN_GRID_SPACING_Y = 44;          // vertical spacing between grid rows

// Random formation bounds
var ALIEN_RANDOM_MIN = 15;
var ALIEN_RANDOM_MAX = 30;
var ALIEN_RANDOM_WIDTH = 350;           // width of the rectangular spawn area
var ALIEN_RANDOM_HEIGHT = 300;          // height of the rectangular spawn area

// --- Alien Wave State ---
var aliens = [];                        // array of { x, y, type } objects
var alienFormation = 'grid';            // 'grid' or 'random' — chosen at spawn time
var aliensSpawned = false;              // whether wave has been spawned this round

// --- Bullet Configuration ---
var BULLET_SPEED = 500;                 // pixels per second (rightward)
var BULLET_SIZE = 10;                   // length of laser-line segment
var BULLET_COOLDOWN = 0.22;             // seconds between shots (~4.5 per second)
var BULLET_COLOR = '#F37121';           // orange — matches ship color theme

// --- Bullet State ---
var bullets = [];                       // array of { x, y } objects
var bulletCooldownTimer = 0;            // time remaining before next shot

// --- Invader Scoring ---
var ALIEN_POINTS = 100;                 // points per alien destroyed
var invaderScore = 0;                   // bonus points earned during invader phase
var aliensDestroyed = 0;                // count of aliens destroyed this wave
var invaderTotalAliens = 0;             // total aliens spawned this wave

// --- Alien Explosion Particles ---
var alienExplosions = [];               // array of particle groups from destroyed aliens

// --- Invader Phase Completion ---
var INVADER_COMPLETE_DELAY = 2.0;       // seconds to show results before returning
var invaderCompleteTimer = 0;           // elapsed time in INVADER_COMPLETE state

// --- Invader Return Transition ---
var INVADER_RETURN_ROTATION_DURATION = 1; // seconds for 90-degree counter-clockwise rotation
var invaderReturnRotationTimer = 0;       // elapsed time in return rotation

// --- Invader Visual Polish ---
var STAR_SCROLL_SPEED = 30;               // pixels per second leftward during invader states
var invaderMode = false;                  // true when in any INVADER_* state (controls visual style)
