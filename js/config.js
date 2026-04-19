// --- Game States ---
var STATES = {
    MENU: 'menu',
    PLAYING: 'playing',
    LANDED: 'landed',
    CRASHED: 'crashed',
    GAMEOVER: 'gameover',
    SCENE_LIFTOFF: 'scene_liftoff',
    SCENE_SCROLL: 'scene_scroll',
    SCENE_DESCENT: 'scene_descent',
    SCENE_COUNTDOWN: 'scene_countdown',
    INVADER_SCROLL_ROTATE: 'invader_scroll_rotate',
    INVADER_TRANSITION: 'invader_transition',
    INVADER_PLAYING: 'invader_playing',
    INVADER_COMPLETE: 'invader_complete',
    INVADER_RETURN: 'invader_return',
    BUGFIX_TRANSITION: 'bugfix_transition',
    BUGFIX_PLAYING: 'bugfix_playing',
    BUGFIX_COMPLETE: 'bugfix_complete',
    BUGFIX_RETURN: 'bugfix_return',
    MISSILE_TRANSITION: 'missile_transition',
    MISSILE_PLAYING: 'missile_playing',
    MISSILE_COMPLETE: 'missile_complete',
    MISSILE_RETURN: 'missile_return'
};

var gameState = STATES.MENU;

// --- Score ---
var score = 0;
var landings = 0; // successful landings (mini-games completed)

// --- Level Configuration (endless scaling) ---
function getLevelConfig(level) {
    // Gravity: starts at 1.6, increases by 0.2 per level, caps at 5.0
    var gravity = Math.min(1.6 + level * 0.2, 5.0);
    // Pad count: starts at 3, decreases by 1 every 2 levels, minimum 1
    var padCount = Math.max(1, 3 - Math.floor(level / 2));
    // Wind: starts at 0, increases by 0.1 per level, caps at 2.0
    var maxWind = Math.min(level * 0.1, 2.0);
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
var sceneLiftoffStartY = 0;         // ship Y when liftoff began (set in input.js)

// --- Scene Descent (ship descends to starting altitude after scroll) ---
var SCENE_DESCENT_DURATION = 0.5;   // seconds for final descent settle (most descent happens during scroll)
var sceneDescentTimer = 0;          // elapsed time in descent
var sceneDescentStartY = 0;         // y position at start of descent (canvas.height / 2)
var sceneDescentTargetY = 0;        // y position at end of descent (canvas.height / 3)

// --- Scene Countdown (3-2-1 before control returns) ---
var SCENE_COUNTDOWN_STEP_DURATION = 0.8; // seconds per countdown number
var sceneCountdownTimer = 0;              // elapsed time in countdown

// --- Scene Scroll (horizontal terrain transition between levels) ---
var SCENE_SCROLL_DURATION = 3.0;    // seconds for the horizontal scroll (absorbs partial descent)
var SCENE_SCROLL_BANK_ANGLE = 0.15; // radians (~8.6°) — max bank angle during scroll
// Scroll state is encapsulated in a single object to prevent partial mutation.
// null when no scroll is active; a frozen object during SCENE_SCROLL.
var sceneScrollState = null;        // { timer, oldTerrain, oldPads, newTerrain, newPads }

function createSceneScrollState(oldTerrain, oldPads, newTerrain, newPads, isInvaderScroll, isBugfixScroll, isMissileScroll, shipStartX) {
    return Object.freeze({
        timer: 0,
        oldTerrain: oldTerrain,
        oldPads: oldPads,
        newTerrain: newTerrain,
        newPads: newPads,
        isInvaderScroll: !!isInvaderScroll,
        isBugfixScroll: !!isBugfixScroll,
        isMissileScroll: !!isMissileScroll,
        shipStartX: shipStartX
    });
}

// --- Security Pad Scroll-to-Invader Transition ---
var securityPadScroll = false;                      // true when scroll is for security pad (invader interlude)
var bugfixPadScroll = false;                        // true when scroll is for bugfix pad (bugfix interlude)
var missilePadScroll = false;                       // true when scroll is for security pad (missile command interlude)
var INVADER_SCROLL_ROTATE_DURATION = 1;             // seconds for 90-degree rotation after scroll
var invaderScrollRotateTimer = 0;                   // elapsed time in rotation after scroll

// --- Invader Liftoff Animation ---

// --- Invader Terrain Transition ---
var TERRAIN_TRANSITION_DURATION = 1.5; // seconds to flatten terrain
var TERRAIN_FLAT_Y_RATIO = 0.87;       // flat ground at 87% of canvas height
var terrainTransitionTimer = 0;         // elapsed time in transition
var terrainOriginalPoints = [];         // snapshot of terrain Y values before flattening

// --- Invader Player Movement ---
var INVADER_MOVE_SPEED = 200;           // pixels per second (direct movement, all 4 directions)

// --- Invader Physics (velocity-based, thruster-driven) ---
var INVADER_THRUST_POWER = 300;         // px/s² — acceleration when thrusting
var INVADER_RETRO_POWER = 250;          // px/s² — slightly weaker retro thrust
var INVADER_DRAG = 0.97;                // per-frame drag to prevent infinite drift
var INVADER_MAX_SPEED = 220;            // px/s — velocity cap

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

// --- Bugfix Mini-Game Transition ---
var BUGFIX_TRANSITION_DURATION = 1.0;     // seconds — analog of invader transition
var BUGFIX_COMPLETE_DELAY = 2.0;          // seconds to show win results before returning

// --- Bugfix Bug Configuration ---
var BUGFIX_BUG_SIZE = 12;                 // pixel size of each bug
var BUGFIX_BUG_BASE_SPEED = 60;           // base bug speed in px/s
var BUGFIX_BUG_SPEED_PER_LEVEL = 10;      // additional bug speed per level in px/s
var BUGFIX_BUG_SPEED_VARIANCE = 20;       // +/- speed variance per bug in px/s
var BUGFIX_BUG_ANIM_FPS = 4;              // shuffle animation frame rate (2-frame toggle)
var BUGFIX_BUG_EDGE_STEEPNESS = 20;       // px delta in terrain height that counts as an "edge" — reverse vx

// --- Bugfix Bomb Configuration ---
var BUGFIX_BOMB_SIZE = 4;                 // bomb radius in pixels
var BUGFIX_BOMB_BLAST_RADIUS = 28;        // blast radius in pixels
var BUGFIX_BOMB_GRAVITY_SCALE = 1.0;      // uses level gravity
var BUGFIX_MAX_BOMB_PARTICLES = 300;      // hard cap on bombParticles[] (trail + explosion combined)

// --- Bugfix Scoring ---
var BUGFIX_BUG_POINTS_LOW = 50;           // points for low-value bug (yellow)
var BUGFIX_BUG_POINTS_HIGH = 100;         // points for high-value bug (red)
var BUGFIX_FUEL_BONUS_LOW = 100;          // fuel bonus (low tier)
var BUGFIX_FUEL_BONUS_HIGH = 200;         // fuel bonus (high tier)

// --- Bugfix Bug Colours ---
var BUGFIX_BUG_COLOR_LOW = '#FFEB3B';     // yellow — low-value bug
var BUGFIX_BUG_COLOR_HIGH = '#F44336';    // red — high-value bug

// --- Bugfix State Arrays ---
var bugs = [];                            // active bugs on screen
var bombs = [];                           // active bombs in flight
var bombParticles = [];                   // visual particles from bomb explosions
var bugExplosions = [];                   // particle groups from destroyed bugs

// --- Bugfix Per-Game Counters ---
var bugfixScore = 0;                      // bonus points earned during bugfix phase
var bugsKilled = 0;                       // count of bugs killed this round
var bugsTotal = 0;                        // total bugs spawned this round
var bugfixFuelBonus = 0;                  // fuel-remaining bonus awarded on win (shown in BUGFIX_COMPLETE)
var bugfixCompleteTimer = 0;              // elapsed time in BUGFIX_COMPLETE state
var bugfixTransitionTimer = 0;            // elapsed time in BUGFIX_TRANSITION state

// --- Missile Command Mini-Game Transition ---
var MISSILE_TRANSITION_DURATION = 1.5;    // seconds — terrain flattens, buildings rise
var MISSILE_COMPLETE_DELAY = 2.0;         // seconds to show results before returning

// --- Missile City / Building Configuration ---
var MISSILE_BUILDING_COUNT = 6;           // number of buildings in the defended city
var MISSILE_BUILDING_WIDTH = 40;          // pixel width of each building
var MISSILE_BUILDING_MIN_HEIGHT = 30;     // minimum building height in pixels
var MISSILE_BUILDING_MAX_HEIGHT = 80;     // maximum building height in pixels

// --- Missile Defense Battery Configuration ---
var MISSILE_BATTERY_COUNT = 3;            // number of defense batteries (left, center, right)
var MISSILE_BATTERY_AMMO = 10;            // interceptors available per battery
var MISSILE_INTERCEPTOR_SPEED = 350;      // interceptor travel speed in px/s
var MISSILE_INTERCEPTOR_BLAST_RADIUS = 40; // blast radius of interceptor detonation in pixels

// --- Missile Incoming Configuration ---
var MISSILE_INCOMING_BASE_COUNT = 6;      // base count of incoming missiles
var MISSILE_INCOMING_PER_LEVEL = 2;       // extra incoming missiles per level
var MISSILE_INCOMING_MAX = 12;            // hard cap on incoming missiles per round
var MISSILE_INCOMING_BASE_SPEED = 40;     // base descent speed in px/s
var MISSILE_INCOMING_SPEED_PER_LEVEL = 8; // additional speed per level in px/s
var MISSILE_INCOMING_SPEED_VARIANCE = 10; // +/- speed variance per missile in px/s

// --- Missile Wave Configuration ---
var MISSILE_WAVE_COUNT_BASE = 1;          // base number of waves per round
var MISSILE_WAVE_COUNT_PER_LEVEL = 1;     // extra wave every 3 levels (applied via floor(level/3))
var MISSILE_WAVE_COUNT_MAX = 3;           // hard cap on waves per round
var MISSILE_WAVE_DELAY = 1.5;             // seconds between waves
var MISSILE_WAVE_ANNOUNCE_DURATION = 1.5; // seconds the "WAVE N/M" banner stays visible

// --- Missile Return Transition (mirrors INVADER_RETURN_ROTATION_DURATION) ---
var MISSILE_RETURN_ROTATION_DURATION = 1; // seconds for 90-degree counter-clockwise rotation
var missileReturnRotationTimer = 0;       // elapsed time in MISSILE_RETURN rotation

// --- Missile Scoring ---
var MISSILE_POINTS_PER_INTERCEPT = 25;            // points per intercepted incoming missile
var MISSILE_POINTS_PER_BUILDING_SURVIVING = 100;  // points per building still standing at end
var MISSILE_AMMO_BONUS_MULTIPLIER = 5;            // points per unused interceptor

// --- Missile Crosshair (player aim reticle) ---
var MISSILE_CROSSHAIR_SPEED = 400;        // crosshair movement speed in px/s
var missileCrosshairX = 0;                // current crosshair X position
var missileCrosshairY = 0;                // current crosshair Y position

// --- Missile State Arrays ---
var missileIncoming = [];                 // active incoming missiles
var missileInterceptors = [];             // active outgoing interceptors
var missileExplosions = [];               // active explosion particle groups
var missileBuildings = [];                // city buildings (defended targets)
var missileBatteries = [];                // defense batteries (ammo + positions)
var missileDestructionParticles = [];     // red/orange debris particles from destroyed buildings/batteries

// --- Missile Per-Game Counters ---
var missileScore = 0;                     // bonus points earned during missile phase
var missilesIntercepted = 0;              // count of incoming missiles intercepted this round
var missilesTotal = 0;                    // total incoming missiles spawned this round
var missileWaveCurrent = 0;               // current wave index (0-based) within this round
var missileWaveTotal = 0;                 // total waves for this round
var missileWaveTimer = 0;                 // seconds elapsed since the current wave started
var missileWaveSpawnQueue = [];           // pending incoming-missile spawns for the current wave
var missileInterWaveTimer = 0;            // seconds elapsed since current wave was fully cleared; gated by MISSILE_WAVE_DELAY to trigger next wave
var missileWaveAnnounceTimer = 0;         // countdown while the "WAVE N/M" banner is visible (>0 = visible)
var missileCompleteTimer = 0;             // elapsed time in MISSILE_COMPLETE state
var missileTransitionTimer = 0;           // elapsed time in MISSILE_TRANSITION state
var missileEndBonus = 0;                  // surviving-building + unused-ammo bonus awarded on win (shown in MISSILE_COMPLETE)
var missileBuildingSurvivors = 0;         // buildings alive at win time (shown in MISSILE_COMPLETE breakdown)
var missileAmmoBonusPoints = 0;           // unused-ammo portion of missileEndBonus (shown in MISSILE_COMPLETE breakdown)

// --- Missile Incoming Label Pool (PRD section 8) ---
// Randomised per incoming missile for flavour — purely cosmetic.
var MISSILE_INCOMING_LABEL_POOL = [
    '<<<<<<< HEAD',
    '=======',
    '>>>>>>> feature/xyz',
    'CONFLICT',
    'merge failed',
    'diverged',
    'cherry-pick',
    'rebase --abort',
    'force push',
    'detached HEAD',
    'unresolved',
    'both modified',
    'accept theirs',
    'accept ours',
    'stash pop',
    'reset --hard',
    'CVE-2024-XXXX',
    '0-day',
    'injection',
    'overflow'
];

// Per-round incoming-missile label pool. Rebuilt on each entry to the
// missile-command mini-game from MISSILE_INCOMING_LABEL_POOL plus PR-derived
// flavour (branch name + short commit hashes). See buildMissileIncomingLabelPool
// in js/update.js. Purely cosmetic (US-014).
var missileRoundLabelPool = [];

// --- Security Mini-Game Cycling Counter ---
// Increments on each security pad landing. Reset to 0 on game over / new game
// (see startNewGame in js/input.js). Odd value -> invaders mini-game,
// even value -> missile command mini-game.
var securityMiniGameCount = 0;
