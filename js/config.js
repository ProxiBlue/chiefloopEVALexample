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
    MISSILE_RETURN: 'missile_return',
    TECHDEBT_TRANSITION: 'techdebt_transition',
    TECHDEBT_PLAYING: 'techdebt_playing',
    TECHDEBT_COMPLETE: 'techdebt_complete',
    TECHDEBT_RETURN: 'techdebt_return',
    BREAKOUT_TRANSITION: 'breakout_transition',
    BREAKOUT_PLAYING: 'breakout_playing',
    BREAKOUT_COMPLETE: 'breakout_complete',
    BREAKOUT_RETURN: 'breakout_return',
    DRIVE_TRANSITION: 'drive_transition',
    DRIVE_PLAYING: 'drive_playing',
    DRIVE_COMPLETE: 'drive_complete',
    DRIVE_RETURN: 'drive_return'
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
    wind.gustTimer = 6 + Math.random() * 10;
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
var MISSILE_BATTERY_AMMO = 15;            // interceptors available per battery
var MISSILE_INTERCEPTOR_SPEED = 350;      // interceptor travel speed in px/s
var MISSILE_INTERCEPTOR_BLAST_RADIUS = 40; // blast radius of interceptor detonation in pixels

// --- Missile Incoming Configuration ---
var MISSILE_INCOMING_BASE_COUNT = 5;      // base count of incoming missiles
var MISSILE_INCOMING_PER_LEVEL = 1;       // extra incoming missiles per level
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

// --- Tech Debt Blaster Mini-Game Transition ---
var TECHDEBT_TRANSITION_DURATION = 1.5;   // seconds — brief starfield zoom effect
var TECHDEBT_COMPLETE_DELAY = 2.0;        // seconds to show results before returning

// --- Tech Debt Asteroid Configuration ---
var TECHDEBT_ASTEROID_BASE_COUNT = 6;     // base count of large asteroids
var TECHDEBT_ASTEROID_PER_LEVEL = 3;      // extra asteroids per level
var TECHDEBT_ASTEROID_MAX = 24;           // hard cap on asteroids per round

// --- Tech Debt Asteroid Size Tiers ---
var TECHDEBT_SIZE_LARGE = 40;             // large asteroid radius in px
var TECHDEBT_SIZE_MEDIUM = 20;            // medium asteroid radius in px
var TECHDEBT_SIZE_SMALL = 10;             // small asteroid radius in px

// --- Tech Debt Asteroid Speed ---
var TECHDEBT_SPEED_BASE = 40;             // base drift speed in px/s
var TECHDEBT_SPEED_PER_LEVEL = 5;         // additional speed per level in px/s
var TECHDEBT_SPEED_VARIANCE = 15;         // +/- speed variance per asteroid in px/s

// --- Tech Debt Scoring ---
var TECHDEBT_POINTS_LARGE = 20;           // points for destroying a large asteroid
var TECHDEBT_POINTS_MEDIUM = 50;          // points for destroying a medium asteroid
var TECHDEBT_POINTS_SMALL = 100;          // points for destroying a small asteroid (hardest)

// --- Tech Debt Bullet Configuration ---
var TECHDEBT_BULLET_SPEED = 400;          // bullet travel speed in px/s
var TECHDEBT_BULLET_LIFETIME = 1.5;       // seconds before a bullet expires
var TECHDEBT_BULLET_COOLDOWN = 0.18;      // seconds between shots

// --- Tech Debt Ship Configuration ---
var TECHDEBT_SHIP_DRAG = 0.98;            // per-frame drag — slight deceleration for control feel
var TECHDEBT_SHIP_MAX_SPEED = 250;        // ship velocity cap in px/s
var TECHDEBT_SHIP_RADIUS = 15;            // ship collision radius in px (circle-circle vs asteroids, AC US-009)

// --- ProxiBlue Power-Up Configuration ---
var PROXIBLUE_SPAWN_CHANCE = 0.125;       // 1 in 8 chance at spawn-time to replace a tech-debt asteroid with a ProxiBlue power-up
var PROXIBLUE_SHIELD_DURATION = 8;        // seconds the shield stays active
var PROXIBLUE_POINTS = 150;               // points awarded when collected
var PROXIBLUE_SHIELD_FLASH_DURATION = 0.3; // seconds a blue shield-absorb flash stays on screen (US-009)
var PROXIBLUE_COLOR = '#1976D2';          // canonical ProxiBlue blue — shield flash + shield ring + ProxiBlue asteroid fill

// --- Tech Debt Spawn Geometry ---
var TECHDEBT_SAFE_SPAWN_RADIUS = 120;     // minimum px from canvas center an asteroid may spawn (keeps safe distance from ship)

// --- Hidden Aliens in Asteroids ---
var TECHDEBT_ALIEN_CHANCE = 0.15;         // chance a large asteroid contains a hidden alien
var TECHDEBT_ALIEN_SPEED = 120;           // alien escape speed in px/s
var TECHDEBT_ALIEN_SHOOT_INTERVAL = 1.5;  // seconds between alien shots
var TECHDEBT_ALIEN_BULLET_SPEED = 200;    // alien bullet speed in px/s
var TECHDEBT_ALIEN_SIZE = 16;             // alien sprite size in px
var TECHDEBT_ALIEN_POINTS = 75;           // points for destroying an escaped alien
var TECHDEBT_ALIEN_LIFETIME = 8;          // seconds before alien escapes off-screen
var techdebtAliens = [];                  // active escaped aliens
var techdebtAlienBullets = [];            // active alien bullets

// --- Tech Debt Asteroid Label Pool ---
// Pulled at spawn time for each non-ProxiBlue asteroid. Purely cosmetic flavour
// ripped straight from everyday tech-debt vocabulary.
var TECHDEBT_LABEL_POOL = [
    '@deprecated',
    'TODO',
    '// HACK',
    'FIXME',
    'legacy_',
    'any',
    'stringly-typed',
    'node_modules',
    '*.min.js',
    'eval()',
    '!important',
    'margin: -9999px',
    'setTimeout(0)',
    'var x = x || {}'
];

// --- Tech Debt State Arrays ---
var techdebtAsteroids = [];               // active asteroids on screen
var techdebtBullets = [];                 // active bullets in flight
var techdebtParticles = [];               // visual particles from destroyed asteroids

// --- Tech Debt Per-Game Counters ---
var techdebtScore = 0;                    // bonus points earned during tech debt phase
var asteroidsDestroyed = 0;               // count of asteroids destroyed this round
var asteroidsTotal = 0;                   // total asteroids to destroy this round
var techdebtCompleteTimer = 0;            // elapsed time in TECHDEBT_COMPLETE state
var techdebtFuelBonus = 0;                // fuel-remaining bonus awarded on win (shown in TECHDEBT_COMPLETE)
var techdebtTransitionTimer = 0;          // elapsed time in TECHDEBT_TRANSITION state
var techdebtBulletCooldownTimer = 0;      // seconds remaining before the ship can fire its next bullet

// --- ProxiBlue Shield State ---
var proxiblueShieldActive = false;        // true while shield power-up is protecting ship
var proxiblueShieldTimer = 0;             // seconds remaining on active shield
var proxiblueShieldFlashTimer = 0;        // seconds remaining on the blue shield-absorb flash effect (US-009)

// --- Code Breaker Mini-Game Transition ---
var BREAKOUT_TRANSITION_DURATION = 1.5;   // seconds — transition into mini-game
var BREAKOUT_COMPLETE_DELAY = 2.0;        // seconds to show results before returning
var BREAKOUT_PADDLE_FLIP_DURATION = 0.5;  // seconds — M ship flips 180° with ease-in-out (US-004)
var BREAKOUT_BRICK_CASCADE_DELAY = 0.1;   // seconds between brick rows appearing top-to-bottom (US-004)

// --- Code Breaker Brick Configuration ---
var BREAKOUT_COLS = 10;                   // columns of bricks
var BREAKOUT_ROWS_BASE = 4;               // base row count at level 0
var BREAKOUT_ROWS_PER_LEVEL = 0.5;        // 1 extra row every 2 levels (floor(level * 0.5))
var BREAKOUT_ROWS_MAX = 8;                // hard cap on rows
var BREAKOUT_BRICK_HEIGHT = 20;           // brick height in px
var BREAKOUT_BRICK_GAP = 4;               // gap between bricks in px
var BREAKOUT_BRICK_TOP_OFFSET = 60;       // px from top of canvas to first brick row (below HUD)
// Brick width depends on live canvas size — read at build-time via this helper.
function getBreakoutBrickWidth() {
    return canvas.width / BREAKOUT_COLS - BREAKOUT_BRICK_GAP;
}

// --- Code Breaker Brick HP Distribution ---
var BREAKOUT_BRICK_HP_1_CHANCE = 0.6;     // 60% of bricks are 1-hit
var BREAKOUT_BRICK_HP_2_CHANCE = 0.3;     // 30% of bricks are 2-hit
var BREAKOUT_BRICK_HP_3_CHANCE = 0.1;     // 10% of bricks are 3-hit; higher levels shift toward more multi-hit

// --- Code Breaker Brick Colours (by current HP) ---
var BREAKOUT_BRICK_COLOR_HP1 = '#4CAF50'; // green — 1 hit remaining
var BREAKOUT_BRICK_COLOR_HP2 = '#FFC107'; // yellow — 2 hits remaining
var BREAKOUT_BRICK_COLOR_HP3 = '#F44336'; // red — 3 hits remaining

// --- Code Breaker Brick Label Pool (PRD section 8) ---
// Randomly assigned per brick for flavour. Cosmetic only.
var BREAKOUT_BRICK_LABEL_POOL = [
    '// TODO',
    '@deprecated',
    'eval()',
    '!important',
    'var x = x || {}',
    'any',
    'console.log',
    '.innerHTML',
    'document.write',
    'SELECT *',
    'sleep(1000)',
    'goto',
    'magic number',
    'god class',
    'singleton',
    'callback hell',
    'monkey patch',
    'stringly-typed',
    'new Date()',
    'parseInt(x)',
    'regex',
    '== null',
    'catch (e) {}',
    'throw "error"',
    '__proto__',
    'with (obj)',
    'arguments',
    'void 0',
    'NaN === NaN',
    'typeof null',
    '0.1 + 0.2'
];

// --- Code Breaker Ball Configuration ---
var BREAKOUT_BALL_RADIUS = 5;             // ball radius in px
var BREAKOUT_BALL_SPEED_BASE = 320;       // base ball speed in px/s
var BREAKOUT_BALL_SPEED_PER_LEVEL = 20;   // additional ball speed per level in px/s
var BREAKOUT_BALL_SPEED_MAX = 600;        // hard cap on ball speed in px/s
var BREAKOUT_BALL_SPEED_INCREMENT = 8;    // px/s added after each brick hit to ramp tension

// --- Code Breaker Paddle Configuration ---
var BREAKOUT_PADDLE_WIDTH = 80;           // paddle width in px (wider than ship M char for playability)
var BREAKOUT_PADDLE_HEIGHT = 16;          // paddle height in px
var BREAKOUT_PADDLE_SPEED = 400;          // paddle move speed in px/s
var BREAKOUT_PADDLE_Y_OFFSET = 40;        // px from canvas bottom to paddle top
var BREAKOUT_PADDLE_MAX_BOUNCE_ANGLE = Math.PI / 3; // 60° from vertical — angle when ball hits paddle edge (US-006)

// --- Code Breaker Power-Up Configuration ---
var BREAKOUT_POWERUP_CHANCE = 0.15;       // 15% of bricks drop a power-up
var BREAKOUT_POWERUP_FALL_SPEED = 100;    // power-up fall speed in px/s
var BREAKOUT_POWERUP_SIZE = 16;           // power-up sprite size in px

// Power-up timed effect durations and Wide paddle multiplier (US-008).
var BREAKOUT_POWERUP_WIDE_DURATION = 10;  // seconds — Wide Paddle active time
var BREAKOUT_POWERUP_FIRE_DURATION = 5;   // seconds — Fireball active time
var BREAKOUT_POWERUP_WIDE_MULTIPLIER = 1.5; // paddle width +50% while Wide is active
var BREAKOUT_MULTIBALL_ANGLE_OFFSET = Math.PI / 9; // ~20° — Multi-Ball spawn spread

// Power-up type table (PRD section 9). Used to randomly pick a type on drop and
// render the letter/label/colour on the falling pill.
var BREAKOUT_POWERUP_TYPES = [
    { type: 'wide',  letter: 'W', label: 'refactor()', color: '#4CAF50' },
    { type: 'multi', letter: 'M', label: 'fork()',     color: '#FF9800' },
    { type: 'fire',  letter: 'F', label: '--force',    color: '#F44336' },
    { type: 'extra', letter: '+', label: 'git stash',  color: '#00BCD4' },
    { type: 'shoot', letter: 'S', label: 'npm test',   color: '#9C27B0' }
];
var BREAKOUT_SHOOT_DURATION = 8;          // seconds the shoot power-up lasts
var BREAKOUT_SHOOT_COOLDOWN = 0.3;        // seconds between shots
var BREAKOUT_SHOOT_SPEED = 500;           // bullet speed in px/s
var breakoutShootTimer = 0;               // cooldown timer for shooting
var breakoutShootBullets = [];            // active paddle bullets

// --- Code Breaker Scoring ---
var BREAKOUT_POINTS_PER_BRICK = 10;       // base points per brick destroyed
var BREAKOUT_POINTS_BONUS_HP = 5;         // extra points per HP the brick originally had
var BREAKOUT_POINTS_COMPLETION = 300;     // bonus awarded for clearing all bricks
var BREAKOUT_POINTS_BALLS_REMAINING = 50; // bonus per remaining extra ball at completion

// --- Code Breaker Ball / Paddle State ---
var breakoutBallX = 0;                    // active ball X position
var breakoutBallY = 0;                    // active ball Y position
var breakoutBallVX = 0;                   // active ball X velocity (px/s)
var breakoutBallVY = 0;                   // active ball Y velocity (px/s)
var breakoutPaddleX = 0;                  // paddle left-edge X position
var breakoutPaddleYPos = 0;               // paddle Y position (vertical movement)
var breakoutBallStuck = true;             // ball rides on paddle until Up/W/Space launches it
var breakoutExtraBalls = 0;               // bonus balls accumulated from power-ups
var breakoutPaddleWidth = BREAKOUT_PADDLE_WIDTH; // live paddle width (scaled by Wide power-up)
var breakoutActivePowerup = null;         // 'wide' | 'fire' | null — only timed effects live here
var breakoutPowerupTimer = 0;             // seconds remaining on active timed power-up
var breakoutBalls = [];                   // additional balls from Multi-Ball (each: {x,y,vx,vy,trail})

// --- Code Breaker Ball Trail (US-012) ---
var BREAKOUT_BALL_TRAIL_LEN = 4;          // recent positions retained for the trail render
var breakoutBallTrail = [];               // FIFO of {x,y} for the primary ball's trail

// --- Code Breaker State Arrays ---
var breakoutBricks = [];                  // active bricks on the field
var breakoutPowerups = [];                // falling power-ups
var breakoutParticles = [];               // visual particles from destroyed bricks
var breakoutBrickLabelPool = [];          // per-round label pool: default + PR-derived (US-014)

// --- Code Breaker Per-Game Counters ---
var breakoutScore = 0;                    // bonus points earned during breakout phase
var breakoutBricksDestroyed = 0;          // count of bricks destroyed this round
var breakoutBricksTotal = 0;              // total bricks spawned this round
var breakoutCompleteTimer = 0;            // elapsed time in BREAKOUT_COMPLETE state
var breakoutTransitionTimer = 0;          // elapsed time in BREAKOUT_TRANSITION state
var breakoutCompletionBonus = 0;          // BREAKOUT_POINTS_COMPLETION awarded on win (US-010)
var breakoutExtraBallBonus = 0;           // per-extra-ball points banked on win (US-010)
var breakoutReturnRotationTimer = 0;      // elapsed time in BREAKOUT_RETURN flip animation (US-011)

// --- Other Pad Mini-Game Cycling Counter ---
// Increments on each `other` pad landing. Reset to 0 on game over / new game
// (see startNewGame in js/input.js). Odd value -> Tech Debt Blaster,
// even value -> Code Breaker.
var otherMiniGameCount = 0;

// --- Feature Drive Mini-Game Transition ---
var DRIVE_TRANSITION_DURATION = 1.5;      // seconds — wheels animate on, camera shifts
var DRIVE_COMPLETE_DELAY = 2.0;           // seconds to show results before returning

// --- Feature Drive Road Configuration ---
var DRIVE_ROAD_BASE_LENGTH = 3000;        // total scrollable road at level 1 (px)
var DRIVE_ROAD_PER_LEVEL = 500;           // extra road length per level (px)
var DRIVE_ROAD_MAX_LENGTH = 8000;         // cap on road length (px)

// --- Feature Drive Buggy Physics ---
var DRIVE_SCROLL_SPEED_BASE = 120;        // auto-scroll base speed (px/s)
var DRIVE_SCROLL_SPEED_MAX = 250;         // max forward speed (px/s)
var DRIVE_ACCELERATION = 80;              // player speed-up (px/s²)
var DRIVE_BRAKE_DECEL = 150;              // player slow-down (px/s²)
var DRIVE_JUMP_VELOCITY = -280;           // upward impulse on jump (px/s)
var DRIVE_GRAVITY = 500;                  // gravity (px/s²) — stronger than lander for snappy jumps
var DRIVE_JUMP_FUEL_COST = 5;             // fuel consumed per jump

// --- Feature Drive Wheel Configuration ---
var DRIVE_WHEEL_RADIUS = 6;               // wheel radius in px
var DRIVE_WHEEL_OFFSET_X = 10;            // spoke X offset magnitude (-10 left, +10 right) relative to M center
var DRIVE_WHEEL_OFFSET_Y = 18;            // wheel Y offset (bottom of M)

// --- Feature Drive Obstacle Configuration ---
var DRIVE_GAP_MIN_WIDTH = 40;             // minimum gap width in px
var DRIVE_GAP_MAX_WIDTH = 80;             // maximum gap width in px
var DRIVE_ROCK_SIZE = 15;                 // rock obstacle size in px
var DRIVE_OBSTACLE_DENSITY_BASE = 0.03;   // obstacles per px of road at level 1
var DRIVE_OBSTACLE_DENSITY_PER_LEVEL = 0.005; // extra density per level
var DRIVE_OBSTACLE_DENSITY_MAX = 0.08;    // density cap

// --- Feature Drive Pickup Configuration ---
var DRIVE_PICKUP_SIZE = 14;               // pickup sprite size in px
var DRIVE_PICKUP_POINTS = 50;             // points per pickup collected
var DRIVE_PICKUP_FUEL_RESTORE = 3;        // fuel restored per pickup
var DRIVE_PICKUP_DENSITY = 0.01;          // pickups per px of road

// --- Feature Drive Scoring ---
var DRIVE_POINTS_COMPLETION = 200;        // bonus for reaching destination
var DRIVE_POINTS_FUEL_BONUS_MULTIPLIER = 3; // points per remaining fuel unit

// --- Feature Drive State ---
var driveScrollX = 0;                     // camera position
var driveSpeed = 0;                       // current forward speed (px/s)
var driveBuggyY = 0;                      // buggy vertical position
var driveBuggyVY = 0;                     // buggy vertical velocity (px/s)
var driveGrounded = true;                 // whether buggy is on ground
var driveWheelRotation = 0;               // visual wheel spin angle (radians)
var driveBuggyTilt = 0;                   // cosmetic buggy tilt while airborne (radians)
var drivePrevJumpKey = false;             // previous-frame jump-key state (edge detect)
var driveFalling = false;                 // true once buggy has committed to a gap fall (US-007)

// --- Feature Drive State Arrays ---
var driveRoadSegments = [];               // road segment definitions
var driveObstacles = [];                  // active obstacles (gaps, rocks)
var drivePickups = [];                    // active pickups
var driveParticles = [];                  // visual particles (dust, wheel kick-up)

// --- Feature Drive Per-Game Counters ---
var driveScore = 0;                       // bonus points earned during drive phase
var drivePickupsCollected = 0;            // count of pickups collected this round
var driveDistance = 0;                    // distance travelled this round (px)
var driveRoadLength = 0;                  // total road length for this round (px)
var driveCompleteTimer = 0;               // elapsed time in DRIVE_COMPLETE state
var driveTransitionTimer = 0;             // elapsed time in DRIVE_TRANSITION state
