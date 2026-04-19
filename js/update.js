// --- Game Update & Physics ---

// Spawn a wave of aliens off-screen to the right
function spawnAlienWave() {
    aliens = [];
    bullets = [];
    aliensSpawned = true;
    invaderScore = 0;
    aliensDestroyed = 0;
    bulletCooldownTimer = 0;

    // Randomly pick formation type
    alienFormation = Math.random() < 0.5 ? 'grid' : 'random';

    var startX = canvas.width + ALIEN_SPAWN_MARGIN;
    var flatY = canvas.height * TERRAIN_FLAT_Y_RATIO;
    // Vertical play area: from 60px (below HUD) to flatY - margin
    var topY = 80;
    var bottomY = flatY - 40;
    var areaHeight = bottomY - topY;

    if (alienFormation === 'grid') {
        var rows = ALIEN_GRID_ROWS_MIN + Math.floor(Math.random() * (ALIEN_GRID_ROWS_MAX - ALIEN_GRID_ROWS_MIN + 1));
        var cols = ALIEN_GRID_COLS_MIN + Math.floor(Math.random() * (ALIEN_GRID_COLS_MAX - ALIEN_GRID_COLS_MIN + 1));
        // Center the grid vertically in the play area
        var gridHeight = (rows - 1) * ALIEN_GRID_SPACING_Y;
        var gridTopY = topY + (areaHeight - gridHeight) / 2;

        for (var r = 0; r < rows; r++) {
            // Alternate alien type per row for visual variety
            var type = r % 3; // 0, 1, 2 — three sprite variants
            for (var c = 0; c < cols; c++) {
                aliens.push({
                    x: startX + c * ALIEN_GRID_SPACING_X,
                    y: gridTopY + r * ALIEN_GRID_SPACING_Y,
                    type: type
                });
            }
        }
    } else {
        // Random scattered formation
        var count = ALIEN_RANDOM_MIN + Math.floor(Math.random() * (ALIEN_RANDOM_MAX - ALIEN_RANDOM_MIN + 1));
        var randTopY = topY + (areaHeight - ALIEN_RANDOM_HEIGHT) / 2;
        if (randTopY < topY) randTopY = topY;

        for (var i = 0; i < count; i++) {
            aliens.push({
                x: startX + Math.random() * ALIEN_RANDOM_WIDTH,
                y: randTopY + Math.random() * Math.min(ALIEN_RANDOM_HEIGHT, areaHeight),
                type: Math.floor(Math.random() * 3)
            });
        }
    }

    invaderTotalAliens = aliens.length;
}

// Spawn a wave of bugs along the current terrain surface for the bugfix mini-game
function spawnBugWave() {
    bugs = [];
    bombs = [];
    bombParticles = [];
    bugExplosions = [];
    bugfixScore = 0;
    bugsKilled = 0;
    bugfixFuelBonus = 0;

    var count = 3 + currentLevel * 2;
    bugsTotal = count;

    for (var i = 0; i < count; i++) {
        var x = BUGFIX_BUG_SIZE + Math.random() * (canvas.width - 2 * BUGFIX_BUG_SIZE);
        var hit = getTerrainYAtX(x);
        var surfaceY = hit ? hit.y : canvas.height * TERRAIN_FLAT_Y_RATIO;
        var y = surfaceY - BUGFIX_BUG_SIZE / 2;
        var isHigh = Math.random() < 0.5;
        var speed = BUGFIX_BUG_BASE_SPEED + currentLevel * BUGFIX_BUG_SPEED_PER_LEVEL
                    + (Math.random() * 2 - 1) * BUGFIX_BUG_SPEED_VARIANCE;
        var direction = Math.random() < 0.5 ? -1 : 1;
        bugs.push({
            x: x,
            y: y,
            vx: direction * speed,
            color: isHigh ? BUGFIX_BUG_COLOR_HIGH : BUGFIX_BUG_COLOR_LOW,
            points: isHigh ? BUGFIX_BUG_POINTS_HIGH : BUGFIX_BUG_POINTS_LOW,
            animFrame: 0,
            animTimer: 0
        });
    }
}

// Route the ship to STATES.CRASHED via the same FX+sound pipeline as the
// shared terrain-collision crash (see checkCollision's else branch). Used by
// the bugfix lose paths (US-009): ship-vs-bug touch and ship-in-bomb-blast.
function crashShipInBugfix(reason) {
    ship.vx = 0;
    ship.vy = 0;
    ship.thrusting = false;
    landingResult = reason;
    spawnExplosion(ship.x, ship.y);
    startScreenShake();
    stopThrustSound();
    playExplosionSound();
    gameState = STATES.CRASHED;
}

// Route the ship to STATES.CRASHED from the missile mini-game (US-009 lose path).
// Mirrors crashShipInBugfix but names the reason "All defenses destroyed" so the
// crash screen explains why the player lost without having control of the ship.
function crashShipInMissile(reason) {
    ship.vx = 0;
    ship.vy = 0;
    ship.thrusting = false;
    landingResult = reason;
    spawnExplosion(ship.x, ship.y);
    startScreenShake();
    stopThrustSound();
    playExplosionSound();
    gameState = STATES.CRASHED;
}

// Route the ship to STATES.CRASHED from the Code Breaker mini-game (US-009 lose
// path — all balls lost with no extras). Mirrors crashShipInBugfix/Missile so
// the crash FX pipeline stays identical. Partial breakoutScore already
// accumulated into `score` stays — we don't subtract it here.
function crashShipInBreakout(reason) {
    ship.vx = 0;
    ship.vy = 0;
    ship.thrusting = false;
    ship.rotating = null;
    stopThrustSound();
    breakoutCompletionBonus = 0;
    breakoutCompleteTimer = 0;
    gameState = STATES.BREAKOUT_COMPLETE;
}

// US-009: Handle a Code Breaker ball loss (all balls off-screen). Cancels any
// active timed power-up (Wide / Fire). If extra balls are banked, decrement
// and respawn the primary on the paddle (stuck). Otherwise routes to CRASHED.
function loseBreakoutBall() {
    if (typeof playBreakoutBallLostSound === 'function') {
        playBreakoutBallLostSound();
    }
    if (breakoutActivePowerup === 'wide') {
        breakoutPaddleWidth = BREAKOUT_PADDLE_WIDTH;
        if (breakoutPaddleX + breakoutPaddleWidth > canvas.width) {
            breakoutPaddleX = canvas.width - breakoutPaddleWidth;
        }
    }
    breakoutActivePowerup = null;
    breakoutPowerupTimer = 0;

    if (breakoutExtraBalls > 0) {
        breakoutExtraBalls -= 1;
        breakoutBalls = [];
        breakoutBallStuck = true;
        breakoutBallVX = 0;
        breakoutBallVY = 0;
        breakoutBallX = breakoutPaddleX + breakoutPaddleWidth / 2;
        breakoutBallY = canvas.height - BREAKOUT_PADDLE_Y_OFFSET
                      - SHIP_SIZE / 2 - BREAKOUT_BALL_RADIUS;
    } else {
        crashShipInBreakout('Ball lost');
    }
}

// Route the ship to STATES.CRASHED from the tech-debt mini-game (US-009 lose path).
// Mirrors crashShipInBugfix/crashShipInMissile so the crash FX pipeline stays
// identical to other mini-games. Partial techdebtScore already accumulated into
// `score` during the round stays — we don't subtract it here.
function crashShipInTechdebt(reason) {
    ship.vx = 0;
    ship.vy = 0;
    ship.thrusting = false;
    spawnExplosion(ship.x, ship.y);
    startScreenShake();
    stopThrustSound();
    playExplosionSound();
    // Skip crash screen — go straight to complete with partial score
    techdebtFuelBonus = 0;
    techdebtCompleteTimer = 0;
    gameState = STATES.TECHDEBT_COMPLETE;
}

// Reset all per-round missile-command state — entities, particle bursts, wave
// counters, and UI timers. Called on (a) crash from MISSILE_PLAYING (loss-path
// cleanup) and (b) MISSILE_RETURN transition (next-level fresh state).
function clearMissileState() {
    missileIncoming = [];
    missileInterceptors = [];
    missileExplosions = [];
    missileBuildings = [];
    missileBatteries = [];
    missileDestructionParticles = [];
    missileWaveSpawnQueue = [];
    missileScore = 0;
    missilesIntercepted = 0;
    missilesTotal = 0;
    missileWaveCurrent = 0;
    missileWaveTotal = 0;
    missileWaveTimer = 0;
    missileInterWaveTimer = 0;
    missileWaveAnnounceTimer = 0;
    missileCompleteTimer = 0;
    missileEndBonus = 0;
    missileBuildingSurvivors = 0;
    missileAmmoBonusPoints = 0;
    missileReturnRotationTimer = 0;
}

// Reset all per-round bugfix state — entities, particle bursts, and counters.
// Called on (a) crash from BUGFIX_PLAYING (loss-path cleanup, US-010 AC#5) and
// (b) BUGFIX_RETURN transition (next-level fresh state).
function clearBugfixState() {
    bugs = [];
    bombs = [];
    bombParticles = [];
    bugExplosions = [];
    bugsKilled = 0;
    bugsTotal = 0;
    bugfixFuelBonus = 0;
}

// Reset all per-round tech-debt state — entities, counters, cooldowns, and
// shield flags. Called from TECHDEBT_RETURN so the next round (or the normal
// PLAYING state) starts with a clean slate. setupTechdebtWorld() also resets
// most of these on entry; this helper makes the cleanup explicit at exit time
// (mirrors clearBugfixState / clearMissileState).
function clearTechdebtState() {
    techdebtAsteroids = [];
    techdebtBullets = [];
    techdebtParticles = [];
    techdebtAliens = [];
    techdebtAlienBullets = [];
    asteroidsDestroyed = 0;
    asteroidsTotal = 0;
    techdebtCompleteTimer = 0;
    techdebtFuelBonus = 0;
    techdebtTransitionTimer = 0;
    techdebtBulletCooldownTimer = 0;
    proxiblueShieldActive = false;
    proxiblueShieldTimer = 0;
    proxiblueShieldFlashTimer = 0;
}

// Reset all per-round Code Breaker entities + timers + display bonuses. Called
// from BREAKOUT_RETURN (next-level cleanup) and the BREAKOUT_PLAYING loss path
// (CRASHED entry) so the crash/gameover screens don't render stale bricks /
// balls / power-ups / particles from the dead round. breakoutScore is NOT
// reset here — it was already banked into the global `score` by the US-007
// brick-destruction path, and setupBreakoutWorld() re-zeroes it on the next
// round entry. Same reasoning for ball X/Y position (setupBreakoutWorld seeds
// them on entry).
function clearBreakoutState() {
    breakoutBricks = [];
    breakoutPowerups = [];
    breakoutParticles = [];
    breakoutBalls = [];
    breakoutBallTrail = [];
    breakoutBrickLabelPool = [];
    breakoutBricksDestroyed = 0;
    breakoutBricksTotal = 0;
    breakoutCompleteTimer = 0;
    breakoutTransitionTimer = 0;
    breakoutReturnRotationTimer = 0;
    breakoutCompletionBonus = 0;
    breakoutExtraBallBonus = 0;
    breakoutExtraBalls = 0;
    breakoutPaddleYPos = 0;
    breakoutActivePowerup = null;
    breakoutPowerupTimer = 0;
    breakoutShootBullets = [];
    breakoutShootTimer = 0;
    breakoutPaddleWidth = BREAKOUT_PADDLE_WIDTH;
    breakoutBallVX = 0;
    breakoutBallVY = 0;
    breakoutBallStuck = true;
}

// Reset all per-round Feature Drive state — arrays, counters, physics vars,
// and display bonuses. Called from DRIVE_RETURN (next-level cleanup) and the
// DRIVE_PLAYING loss path (CRASHED entry via gap fall) so the crash/gameover
// screens don't render stale segments / obstacles / pickups / particles from
// the dead round. setupDriveWorld() also resets most of these on entry; this
// helper makes the cleanup explicit at exit time (mirrors clearBugfixState /
// clearTechdebtState / clearBreakoutState).
function clearDriveState() {
    driveRoadSegments = [];
    driveObstacles = [];
    drivePickups = [];
    driveParticles = [];
    driveScrollX = 0;
    driveSpeed = 0;
    driveBuggyY = 0;
    driveBuggyVY = 0;
    driveGrounded = true;
    driveWheelRotation = 0;
    driveBuggyTilt = 0;
    drivePrevJumpKey = false;
    driveFalling = false;
    driveBoostTimer = 0;
    drivePrevSegType = null;
    driveScore = 0;
    drivePickupsCollected = 0;
    driveDistance = 0;
    driveRoadLength = 0;
    driveCompleteTimer = 0;
    driveTransitionTimer = 0;
    driveCompleteFuelBonus = 0;
    driveCompleteTotalBonus = 0;
    driveAirborneTrail = [];
    driveStarParallaxOffset = 0;
}

// Build the per-round Code Breaker brick-label pool (US-014). Starts from the
// default BREAKOUT_BRICK_LABEL_POOL and mixes in PR-derived flavour: filenames
// from landedPRTitle + levelCommits messages, plus refactor-related keyword
// phrases from the PR title (e.g. "remove jQuery", "update deps"). When no PR
// data is available, returns the default pool unchanged. Purely cosmetic.
function buildBreakoutBrickLabelPool() {
    var pool = BREAKOUT_BRICK_LABEL_POOL.slice();
    var fileRe = /[\w\-]+\.[a-zA-Z]{1,5}/g;
    var kwRe = /\b(?:refactor|remove|update|delete|migrate|upgrade|cleanup|deprecate|replace|rewrite)\s+[\w\-+.#]+/gi;
    if (typeof landedPRTitle === 'string' && landedPRTitle) {
        var fm = landedPRTitle.match(fileRe);
        if (fm) {
            for (var i = 0; i < fm.length; i++) {
                if (pool.indexOf(fm[i]) === -1) pool.push(fm[i]);
            }
        }
        var km = landedPRTitle.match(kwRe);
        if (km) {
            for (var j = 0; j < km.length; j++) {
                var kw = km[j].toLowerCase();
                if (pool.indexOf(kw) === -1) pool.push(kw);
            }
        }
    }
    if (typeof levelCommits !== 'undefined' && levelCommits && levelCommits.length) {
        for (var ci = 0; ci < levelCommits.length && ci < 12; ci++) {
            var c = levelCommits[ci];
            if (c && typeof c.message === 'string' && c.message) {
                var cfm = c.message.match(fileRe);
                if (cfm) {
                    for (var k = 0; k < cfm.length; k++) {
                        if (pool.indexOf(cfm[k]) === -1) pool.push(cfm[k]);
                    }
                }
            }
        }
    }
    return pool;
}

// Best-effort filename extraction for missile-command building labels.
// Order per AC#4: landedPRTitle -> levelCommits messages -> generic fallbacks.
// Returns exactly `count` labels (pads with fallback list when sources dry up).
function collectMissileBuildingLabels(count) {
    var labels = [];
    var fileRe = /[\w\-]+\.[a-zA-Z]{1,5}/g;
    var sources = [];
    if (typeof landedPRTitle === 'string' && landedPRTitle) {
        sources.push(landedPRTitle);
    }
    if (typeof levelCommits !== 'undefined' && levelCommits && levelCommits.length) {
        for (var ci = 0; ci < levelCommits.length && sources.length < 20; ci++) {
            var c = levelCommits[ci];
            if (c && typeof c.message === 'string') sources.push(c.message);
        }
    }
    for (var si = 0; si < sources.length && labels.length < count; si++) {
        var matches = sources[si].match(fileRe);
        if (!matches) continue;
        for (var mi = 0; mi < matches.length && labels.length < count; mi++) {
            if (labels.indexOf(matches[mi]) === -1) labels.push(matches[mi]);
        }
    }
    var fallback = ['main.go', 'auth.ts', 'handler.js', 'config.yaml', 'schema.sql', 'index.html'];
    for (var fi = 0; labels.length < count && fi < fallback.length; fi++) {
        if (labels.indexOf(fallback[fi]) === -1) labels.push(fallback[fi]);
    }
    return labels.slice(0, count);
}

// Build the per-round missile-label pool (AC-missile). Starts from the shared
// MISSILE_INCOMING_LABEL_POOL and mixes in PR-derived flavour: branch name
// extracted from landedPRTitle ("Merge pull request #N from owner/branch"
// pattern) and short (7-char) commit hashes from levelCommits. Purely cosmetic.
function buildMissileIncomingLabelPool() {
    var pool = MISSILE_INCOMING_LABEL_POOL.slice();
    if (typeof landedPRTitle === 'string' && landedPRTitle) {
        var branchMatch = landedPRTitle.match(/from\s+[\w\-.]+\/([\w\-.\/]+)/);
        if (branchMatch && branchMatch[1]) pool.push(branchMatch[1]);
    }
    if (typeof levelCommits !== 'undefined' && levelCommits && levelCommits.length) {
        for (var ci = 0; ci < levelCommits.length && ci < 8; ci++) {
            var c = levelCommits[ci];
            if (c && typeof c.hash === 'string' && c.hash.length >= 7) {
                pool.push(c.hash.slice(0, 7));
            }
        }
    }
    return pool;
}

// Initialize tech-debt asteroid field on entry to TECHDEBT_TRANSITION.
// Resets per-round counters + state arrays (AC: techdebtScore, asteroidsDestroyed,
// arrays all reset at entry), then spawns `count` LARGE asteroids at random edge
// positions with ≥TECHDEBT_SAFE_SPAWN_RADIUS distance from canvas center. Each
// asteroid gets a random label from TECHDEBT_LABEL_POOL; ~1 in
// PROXIBLUE_SPAWN_CHANCE is replaced with a ProxiBlue power-up asteroid.
function setupTechdebtWorld() {
    techdebtAsteroids = [];
    techdebtBullets = [];
    techdebtParticles = [];
    techdebtScore = 0;
    asteroidsDestroyed = 0;
    techdebtCompleteTimer = 0;
    techdebtFuelBonus = 0;
    techdebtBulletCooldownTimer = 0;
    proxiblueShieldActive = false;
    proxiblueShieldTimer = 0;
    proxiblueShieldFlashTimer = 0;

    var count = Math.min(
        TECHDEBT_ASTEROID_MAX,
        TECHDEBT_ASTEROID_BASE_COUNT + currentLevel * TECHDEBT_ASTEROID_PER_LEVEL
    );
    // Total destroyable units per large asteroid = 1 large + 2 mediums + 4 smalls = 7.
    // Set once at spawn time so the HUD progress bar can render against a stable denominator.
    asteroidsTotal = count * 7;

    var centerX = canvas.width / 2;
    var centerY = canvas.height / 2;
    var baseSpeed = TECHDEBT_SPEED_BASE + currentLevel * TECHDEBT_SPEED_PER_LEVEL;

    for (var i = 0; i < count; i++) {
        // Pick a random edge (0=top, 1=right, 2=bottom, 3=left) and a random
        // point along it. Retry up to 8 times if the pick lands inside the safe
        // radius (unlikely given an 800×600 canvas vs. 120px radius but be
        // defensive against future canvas-size changes).
        var px, py;
        for (var tries = 0; tries < 8; tries++) {
            var edge = Math.floor(Math.random() * 4);
            if (edge === 0) {            // top
                px = Math.random() * canvas.width;
                py = TECHDEBT_SIZE_LARGE;
            } else if (edge === 1) {     // right
                px = canvas.width - TECHDEBT_SIZE_LARGE;
                py = Math.random() * canvas.height;
            } else if (edge === 2) {     // bottom
                px = Math.random() * canvas.width;
                py = canvas.height - TECHDEBT_SIZE_LARGE;
            } else {                     // left
                px = TECHDEBT_SIZE_LARGE;
                py = Math.random() * canvas.height;
            }
            var sdx = px - centerX;
            var sdy = py - centerY;
            if (Math.sqrt(sdx * sdx + sdy * sdy) >= TECHDEBT_SAFE_SPAWN_RADIUS) break;
        }

        // Give the asteroid a gentle drift. Direction biased inward but
        // jittered so the field doesn't look like a homing missile swarm.
        var inwardAngle = Math.atan2(centerY - py, centerX - px);
        var angle = inwardAngle + (Math.random() - 0.5) * Math.PI;
        var speed = baseSpeed + (Math.random() * 2 - 1) * TECHDEBT_SPEED_VARIANCE;
        if (speed < 10) speed = 10;

        var isProxiblue = Math.random() < PROXIBLUE_SPAWN_CHANCE;
        var label = isProxiblue
            ? 'ProxiBlue'
            : TECHDEBT_LABEL_POOL[Math.floor(Math.random() * TECHDEBT_LABEL_POOL.length)];

        // Per-asteroid random silhouette (US-014 AC#2 — "jagged circles, 8-10
        // vertices with random radial offsets, classic Asteroids look"). Stored
        // at spawn so the shape is stable frame-to-frame while rotating, but
        // distinct across the field.
        var shapeN = 8 + Math.floor(Math.random() * 3); // 8..10
        var shapeArr = [];
        for (var sv = 0; sv < shapeN; sv++) {
            shapeArr.push(0.7 + Math.random() * 0.5); // 0.7..1.2 radial multiplier
        }

        // ProxiBlue power-ups always spawn at MEDIUM size (US-012 AC#2) — not
        // too easy, not too hard to hit. Normal tech-debt asteroids are LARGE.
        var hasAlien = !isProxiblue && Math.random() < TECHDEBT_ALIEN_CHANCE;
        techdebtAsteroids.push({
            x: px,
            y: py,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: isProxiblue ? TECHDEBT_SIZE_MEDIUM : TECHDEBT_SIZE_LARGE,
            sizeTier: isProxiblue ? 'medium' : 'large',
            label: label,
            isProxiblue: isProxiblue,
            hasAlien: hasAlien,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() * 2 - 1),
            shape: shapeArr
        });
    }
}

// Initialize Code Breaker world on entry to BREAKOUT_TRANSITION. Resets
// per-round state (score, counters, arrays) and builds the brick grid sized
// to `currentLevel`. Each brick carries its cascade-reveal timestamp so the
// renderer can stagger row appearance without extra timers (US-004 AC).
function setupBreakoutWorld() {
    breakoutBricks = [];
    breakoutPowerups = [];
    breakoutParticles = [];
    breakoutBalls = [];
    breakoutBallTrail = [];
    breakoutScore = 0;
    breakoutBricksDestroyed = 0;
    breakoutBricksTotal = 0;
    breakoutCompleteTimer = 0;
    breakoutCompletionBonus = 0;
    breakoutExtraBallBonus = 0;
    breakoutExtraBalls = 0;
    breakoutBallVX = 0;
    breakoutBallVY = 0;
    breakoutBallStuck = true;
    breakoutPaddleWidth = BREAKOUT_PADDLE_WIDTH;
    breakoutActivePowerup = null;
    breakoutPowerupTimer = 0;

    // Paddle sits BREAKOUT_PADDLE_Y_OFFSET px above canvas bottom, centered.
    var paddleCenterX = canvas.width / 2;
    breakoutPaddleX = paddleCenterX - BREAKOUT_PADDLE_WIDTH / 2;
    breakoutBallX = paddleCenterX;
    breakoutBallY = canvas.height - BREAKOUT_PADDLE_Y_OFFSET - BREAKOUT_PADDLE_HEIGHT - BREAKOUT_BALL_RADIUS;

    breakoutBrickLabelPool = buildBreakoutBrickLabelPool();

    var rows = Math.min(
        BREAKOUT_ROWS_MAX,
        Math.floor(BREAKOUT_ROWS_BASE + Math.floor(currentLevel / 2) * BREAKOUT_ROWS_PER_LEVEL)
    );
    var brickW = getBreakoutBrickWidth();
    var gap = BREAKOUT_BRICK_GAP;
    var hp1Edge = BREAKOUT_BRICK_HP_1_CHANCE;
    var hp2Edge = BREAKOUT_BRICK_HP_1_CHANCE + BREAKOUT_BRICK_HP_2_CHANCE;

    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < BREAKOUT_COLS; col++) {
            var r = Math.random();
            var hp = (r < hp1Edge) ? 1 : (r < hp2Edge) ? 2 : 3;
            var color = hp === 3 ? BREAKOUT_BRICK_COLOR_HP3
                      : hp === 2 ? BREAKOUT_BRICK_COLOR_HP2
                      : BREAKOUT_BRICK_COLOR_HP1;
            var label = breakoutBrickLabelPool[
                Math.floor(Math.random() * breakoutBrickLabelPool.length)
            ];
            breakoutBricks.push({
                x: col * (brickW + gap) + gap / 2,
                y: BREAKOUT_BRICK_TOP_OFFSET + row * (BREAKOUT_BRICK_HEIGHT + gap),
                w: brickW,
                h: BREAKOUT_BRICK_HEIGHT,
                hp: hp,
                maxHp: hp,
                label: label,
                color: color,
                row: row,
                revealAt: row * BREAKOUT_BRICK_CASCADE_DELAY
            });
        }
    }
    breakoutBricksTotal = breakoutBricks.length;
}

// Spawn a 6-10 particle burst at (x,y) in the brick's colour when a brick is
// destroyed in Code Breaker (US-007). Particles drift outward and fade over
// ~0.3-0.7s. Follows the same shape as spawnTechdebtAsteroidParticles below.
function spawnBreakoutBrickParticles(x, y, color) {
    var count = 6 + Math.floor(Math.random() * 5); // 6..10 inclusive
    for (var i = 0; i < count; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 60 + Math.random() * 140;
        var life = 0.3 + Math.random() * 0.4;
        breakoutParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: life,
            maxLife: life,
            size: 1.5 + Math.random() * 2,
            color: color
        });
    }
}

// US-012: Downward shower spawned when a Code Breaker ball exits the bottom of
// the canvas. Particles drift downward (vy > 0) with a small horizontal jitter
// and fade over ~0.5-1.0s, signalling the lost ball without blocking play for
// the remaining balls.
function spawnBreakoutBallLossParticles(x, y) {
    var count = 10 + Math.floor(Math.random() * 6); // 10..15
    for (var i = 0; i < count; i++) {
        var jitter = (Math.random() - 0.5) * 80;
        var life = 0.5 + Math.random() * 0.5;
        breakoutParticles.push({
            x: x,
            y: y,
            vx: jitter,
            vy: 80 + Math.random() * 140,
            life: life,
            maxLife: life,
            size: 2 + Math.random() * 2,
            color: '#ECEFF1'
        });
    }
}

// Apply a caught Code Breaker power-up's effect (US-008). Extra Ball and
// Multi-Ball are instant; Wide Paddle and Fireball run timed effects that
// replace any active timed power-up. Plays a short ascending chime.
function activateBreakoutPowerup(type) {
    if (typeof playBreakoutPowerupSound === 'function') {
        playBreakoutPowerupSound();
    }
    if (type === 'extra') {
        breakoutExtraBalls += 1;
        return;
    }
    if (type === 'multi') {
        // Spawn 2 extra balls at ±BREAKOUT_MULTIBALL_ANGLE_OFFSET from the
        // primary ball's current direction. If the primary ball is stuck
        // (zero velocity) default to straight up.
        var mbSpeed = Math.sqrt(
            breakoutBallVX * breakoutBallVX + breakoutBallVY * breakoutBallVY
        );
        if (mbSpeed === 0) {
            mbSpeed = Math.min(
                BREAKOUT_BALL_SPEED_MAX,
                BREAKOUT_BALL_SPEED_BASE + currentLevel * BREAKOUT_BALL_SPEED_PER_LEVEL
            );
        }
        var mbBase = (breakoutBallVX === 0 && breakoutBallVY === 0)
            ? -Math.PI / 2
            : Math.atan2(breakoutBallVY, breakoutBallVX);
        for (var side = -1; side <= 1; side += 2) {
            var mbAngle = mbBase + side * BREAKOUT_MULTIBALL_ANGLE_OFFSET;
            breakoutBalls.push({
                x: breakoutBallX,
                y: breakoutBallY,
                vx: Math.cos(mbAngle) * mbSpeed,
                vy: Math.sin(mbAngle) * mbSpeed
            });
        }
        return;
    }
    // Timed power-ups (Wide / Fire) — replace any existing timer. Revert the
    // paddle if the previous timed effect was Wide and the new one is not.
    if (breakoutActivePowerup === 'wide' && type !== 'wide') {
        breakoutPaddleWidth = BREAKOUT_PADDLE_WIDTH;
        if (breakoutPaddleX + breakoutPaddleWidth > canvas.width) {
            breakoutPaddleX = canvas.width - breakoutPaddleWidth;
        }
    }
    if (type === 'wide') {
        breakoutPaddleWidth = BREAKOUT_PADDLE_WIDTH * BREAKOUT_POWERUP_WIDE_MULTIPLIER;
        if (breakoutPaddleX + breakoutPaddleWidth > canvas.width) {
            breakoutPaddleX = canvas.width - breakoutPaddleWidth;
        }
        breakoutPowerupTimer = BREAKOUT_POWERUP_WIDE_DURATION;
        breakoutActivePowerup = 'wide';
    } else if (type === 'fire') {
        breakoutPowerupTimer = BREAKOUT_POWERUP_FIRE_DURATION;
        breakoutActivePowerup = 'fire';
    } else if (type === 'shoot') {
        breakoutPowerupTimer = BREAKOUT_SHOOT_DURATION;
        breakoutActivePowerup = 'shoot';
        breakoutShootTimer = 0;
        breakoutShootBullets = [];
    }
}

// Spawn a brief 4-8 particle burst at (x,y) using the given colour. Particles
// drift outward in random directions and fade over ~0.25-0.6s. Used for the
// hit feedback when bullets destroy or split tech-debt asteroids (US-008 AC#4).
function spawnTechdebtAsteroidParticles(x, y, color) {
    var count = 4 + Math.floor(Math.random() * 5); // 4..8 inclusive
    for (var i = 0; i < count; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 60 + Math.random() * 140;
        var life = 0.25 + Math.random() * 0.35;
        techdebtParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: life,
            maxLife: life,
            size: 1.5 + Math.random() * 2,
            color: color
        });
    }
}

// Spawn the two child asteroids when a large/medium is destroyed (US-008 AC).
// Children fly off perpendicular to the parent's velocity (one each side) so
// the split reads visually. Smalls have no children — caller skips this fn for
// `small` tier. ProxiBlue asteroids never split (AC + US-012), caller filters.
function splitTechdebtAsteroid(parent) {
    var nextTier, nextSize;
    if (parent.sizeTier === 'large') {
        nextTier = 'medium';
        nextSize = TECHDEBT_SIZE_MEDIUM;
    } else if (parent.sizeTier === 'medium') {
        nextTier = 'small';
        nextSize = TECHDEBT_SIZE_SMALL;
    } else {
        return; // small tier — destroyed, no children
    }
    var pmag = Math.sqrt(parent.vx * parent.vx + parent.vy * parent.vy) || 1;
    // Unit vector perpendicular to the parent's velocity.
    var perpx = -parent.vy / pmag;
    var perpy = parent.vx / pmag;
    var childSpeed = nextTier === 'small' ? pmag * 2.0 : pmag * 1.5;
    for (var s = -1; s <= 1; s += 2) {
        // Direction = small forward bias + perpendicular split + jitter.
        var jitter = (Math.random() - 0.5) * 0.4;
        var dirx = (parent.vx / pmag) * 0.4 + perpx * s + jitter;
        var diry = (parent.vy / pmag) * 0.4 + perpy * s + jitter;
        var dmag = Math.sqrt(dirx * dirx + diry * diry) || 1;
        // Per-asteroid silhouette (US-014 AC#2) — inlined for the same reason
        // as in setupTechdebtWorld: 8-10 random radial offsets.
        var childShapeN = 8 + Math.floor(Math.random() * 3);
        var childShape = [];
        for (var csv = 0; csv < childShapeN; csv++) {
            childShape.push(0.7 + Math.random() * 0.5);
        }
        techdebtAsteroids.push({
            x: parent.x,
            y: parent.y,
            vx: (dirx / dmag) * childSpeed,
            vy: (diry / dmag) * childSpeed,
            size: nextSize,
            sizeTier: nextTier,
            label: parent.label,
            isProxiblue: false,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() * 2 - 1),
            shape: childShape
        });
    }
}

// Initialize missile-command battlefield state on entry to MISSILE_TRANSITION.
// Resets all counters + arrays (AC#8), snapshots terrain for the flatten
// animation (AC#2), positions the crosshair at center (AC#6), and seeds
// batteries (AC#5) + buildings with filename labels (AC#3, AC#4).
function setupMissileWorld() {
    missileScore = 0;
    missilesIntercepted = 0;
    missilesTotal = 0;
    missileWaveCurrent = 0;
    missileWaveTotal = Math.min(
        MISSILE_WAVE_COUNT_MAX,
        MISSILE_WAVE_COUNT_BASE + Math.floor(currentLevel / 3) * MISSILE_WAVE_COUNT_PER_LEVEL
    );
    missileWaveTimer = 0;
    missileWaveSpawnQueue = [];
    missileInterWaveTimer = 0;
    missileWaveAnnounceTimer = 0;
    missileCompleteTimer = 0;
    missileEndBonus = 0;
    missileBuildingSurvivors = 0;
    missileAmmoBonusPoints = 0;
    missileReturnRotationTimer = 0;
    missileIncoming = [];
    missileInterceptors = [];
    missileExplosions = [];
    missileBuildings = [];
    missileBatteries = [];
    missileDestructionParticles = [];
    missileRoundLabelPool = buildMissileIncomingLabelPool();

    missileCrosshairX = canvas.width / 2;
    missileCrosshairY = canvas.height / 2;

    terrainOriginalPoints = [];
    for (var ti = 0; ti < terrain.length; ti++) {
        terrainOriginalPoints.push(terrain[ti].y);
    }

    var flatY = canvas.height * TERRAIN_FLAT_Y_RATIO;

    var batteryXs = [];
    for (var bi = 0; bi < MISSILE_BATTERY_COUNT; bi++) {
        var bx = canvas.width * (bi + 1) / (MISSILE_BATTERY_COUNT + 1);
        batteryXs.push(bx);
        missileBatteries.push({
            x: bx,
            y: flatY,
            ammo: MISSILE_BATTERY_AMMO,
            destroyed: false
        });
    }

    var labels = collectMissileBuildingLabels(MISSILE_BUILDING_COUNT);
    var gaps = MISSILE_BATTERY_COUNT - 1;
    var perGap = Math.floor(MISSILE_BUILDING_COUNT / gaps);
    var remainder = MISSILE_BUILDING_COUNT - perGap * gaps;
    var labelIdx = 0;
    var heightRange = MISSILE_BUILDING_MAX_HEIGHT - MISSILE_BUILDING_MIN_HEIGHT;
    for (var gi = 0; gi < gaps; gi++) {
        var leftX = batteryXs[gi];
        var rightX = batteryXs[gi + 1];
        var countInGap = perGap + (gi < remainder ? 1 : 0);
        for (var bIdx = 0; bIdx < countInGap; bIdx++) {
            var frac = (bIdx + 1) / (countInGap + 1);
            var x = leftX + (rightX - leftX) * frac;
            var targetHeight = MISSILE_BUILDING_MIN_HEIGHT + Math.floor(Math.random() * (heightRange + 1));
            missileBuildings.push({
                x: x,
                baseY: flatY,
                width: MISSILE_BUILDING_WIDTH,
                targetHeight: targetHeight,
                height: 0,
                label: labels[labelIdx] || '',
                destroyed: false
            });
            labelIdx++;
        }
    }
}

// Initialize Feature Drive world on entry to DRIVE_TRANSITION. Resets
// per-round state + arrays, generates the side-scrolling road (segments + a
// destination pad at the end), and scatters gaps, slow zones, speed boosts,
// rocks, and pickups along the road per the US-005 procedural-generation
// spec. Road length scales with currentLevel per the PRD formula. Safe
// zones of 200px at the start and end are kept clear of any hazards.
function setupDriveWorld() {
    driveScrollX = 0;
    driveSpeed = 0;
    driveBuggyVY = 0;
    driveGrounded = true;
    driveWheelRotation = 0;
    driveBuggyTilt = 0;
    drivePrevJumpKey = false;
    driveFalling = false;
    driveBoostTimer = 0;
    drivePrevSegType = null;
    driveScore = 0;
    drivePickupsCollected = 0;
    driveDistance = 0;
    driveCompleteTimer = 0;
    driveCompleteFuelBonus = 0;
    driveCompleteTotalBonus = 0;
    driveAirborneTrail = [];
    driveStarParallaxOffset = 0;
    driveRoadSegments = [];
    driveObstacles = [];
    drivePickups = [];
    driveParticles = [];

    driveRoadLength = Math.min(
        DRIVE_ROAD_MAX_LENGTH,
        DRIVE_ROAD_BASE_LENGTH + currentLevel * DRIVE_ROAD_PER_LEVEL
    );

    // US-015: if the landed pad has PR data (linesChanged > 0), scale the road
    // length by `1 + linesChanged/500`, capped at 2x. Bigger PRs = longer
    // drives. Fallback to level-based length when no PR data.
    var _prLines = (typeof landedPRLinesChanged === 'number') ? landedPRLinesChanged : 0;
    if (_prLines > 0) {
        var prScale = Math.min(2, 1 + _prLines / 500);
        driveRoadLength = Math.min(DRIVE_ROAD_MAX_LENGTH, Math.floor(driveRoadLength * prScale));
    }

    var segmentWidth = 20;
    var segmentCount = Math.ceil(driveRoadLength / segmentWidth);
    var groundYCenter = canvas.height * 0.82;
    var groundYMin = canvas.height * 0.75;
    var groundYMax = canvas.height * 0.88;
    var currentY = groundYCenter;
    for (var si = 0; si < segmentCount; si++) {
        var drift = (Math.random() - 0.5) * 6;
        if (Math.random() < 0.08) drift = 0; // occasional flat stretches
        currentY += drift;
        if (currentY < groundYMin) currentY = groundYMin;
        if (currentY > groundYMax) currentY = groundYMax;
        driveRoadSegments.push({
            x: si * segmentWidth,
            y: currentY,
            type: 'ground',
            label: null
        });
    }

    driveBuggyY = driveRoadSegments.length > 0
        ? driveRoadSegments[0].y
        : groundYCenter;

    var safeStart = 200;
    var safeEnd = driveRoadLength - 200;
    var minSpacing = 80;

    // Spacing is tracked across two independent layers:
    //   - `occupiedGround`: gaps, slow zones, speed boosts, rocks. These all
    //     sit on the terrain surface and must stay out of each other's way
    //     so layouts remain jumpable (per PRD tech considerations).
    //   - `occupiedAir`: pickups. Pickups float above the terrain and can
    //     coexist laterally with ground features (a pickup may hover over a
    //     rock); they only need spacing against each other.
    var occupiedGround = [];
    var occupiedAir = [];
    function canPlaceIn(list, x1, x2) {
        var lo = x1 - minSpacing;
        var hi = x2 + minSpacing;
        for (var k = 0; k < list.length; k++) {
            var r = list[k];
            if (!(hi < r.x1 || lo > r.x2)) return false;
        }
        return true;
    }
    function markSegmentsRange(x1, x2, type, label) {
        var startIdx = Math.max(0, Math.floor(x1 / segmentWidth));
        var endIdx = Math.min(driveRoadSegments.length - 1, Math.floor((x2 - 0.001) / segmentWidth));
        for (var i = startIdx; i <= endIdx; i++) {
            driveRoadSegments[i].type = type;
            driveRoadSegments[i].label = label;
        }
        occupiedGround.push({ x1: x1, x2: x2, kind: type });
    }

    // --- Gaps: frequency scales with level (AC). Widths in [MIN, MAX].
    var gapFrequency = Math.min(0.004, 0.0015 + currentLevel * 0.0003);
    var gapTarget = Math.floor(driveRoadLength * gapFrequency);
    var gapAttemptCap = Math.max(1, gapTarget) * 10;
    var gapsPlaced = 0;
    var gapAttempts = 0;
    while (gapsPlaced < gapTarget && gapAttempts < gapAttemptCap) {
        gapAttempts++;
        var gWidth = DRIVE_GAP_MIN_WIDTH + Math.random() * (DRIVE_GAP_MAX_WIDTH - DRIVE_GAP_MIN_WIDTH);
        var gMaxStart = safeEnd - gWidth;
        if (gMaxStart <= safeStart) break;
        var gStart = safeStart + Math.random() * (gMaxStart - safeStart);
        var gEnd = gStart + gWidth;
        if (!canPlaceIn(occupiedGround, gStart, gEnd)) continue;
        markSegmentsRange(gStart, gEnd, 'gap', null);
        gapsPlaced++;
    }


    // --- Slow zones: darker/hatched stretches. Label pool per AC.
    var slowLabels = ['// TODO', 'tech debt'];
    var slowTarget = Math.max(1, Math.floor(driveRoadLength * 0.0008));
    var slowAttemptCap = slowTarget * 10;
    var slowsPlaced = 0;
    var slowAttempts = 0;
    while (slowsPlaced < slowTarget && slowAttempts < slowAttemptCap) {
        slowAttempts++;
        var sWidth = 80 + Math.random() * 60;
        var sMaxStart = safeEnd - sWidth;
        if (sMaxStart <= safeStart) break;
        var sStart = safeStart + Math.random() * (sMaxStart - safeStart);
        var sEnd = sStart + sWidth;
        if (!canPlaceIn(occupiedGround, sStart, sEnd)) continue;
        markSegmentsRange(sStart, sEnd, 'slow', slowLabels[Math.floor(Math.random() * slowLabels.length)]);
        slowsPlaced++;
    }

    // --- Speed boosts: chevron stretches. Label pool per AC.
    var boostLabels = ['CI passed', 'tests green'];
    var boostTarget = Math.max(1, Math.floor(driveRoadLength * 0.0008));
    var boostAttemptCap = boostTarget * 10;
    var boostsPlaced = 0;
    var boostAttempts = 0;
    while (boostsPlaced < boostTarget && boostAttempts < boostAttemptCap) {
        boostAttempts++;
        var bWidth = 80 + Math.random() * 60;
        var bMaxStart = safeEnd - bWidth;
        if (bMaxStart <= safeStart) break;
        var bStart = safeStart + Math.random() * (bMaxStart - safeStart);
        var bEnd = bStart + bWidth;
        if (!canPlaceIn(occupiedGround, bStart, bEnd)) continue;
        markSegmentsRange(bStart, bEnd, 'boost', boostLabels[Math.floor(Math.random() * boostLabels.length)]);
        boostsPlaced++;
    }

    // --- Rocks: only on plain ground segments. Full obstacle label pool.
    var rockLabels = [
        'edge case', 'null check', 'off-by-one', 'race condition',
        'deprecated API', 'legacy code', 'flaky test', 'merge conflict',
        'missing test', 'type error', 'lint warning', 'circular dep',
        'memory leak', 'N+1 query'
    ];
    // US-015: mix in PR-specific obstacle labels when available (failed check
    // names + reviewer comment snippets). Labels are purely cosmetic.
    var _prChecks = (typeof landedPRChecks !== 'undefined' && Array.isArray(landedPRChecks)) ? landedPRChecks : [];
    var _prComments = (typeof landedPRComments !== 'undefined' && Array.isArray(landedPRComments)) ? landedPRComments : [];
    for (var rci = 0; rci < _prChecks.length; rci++) {
        if (typeof _prChecks[rci] === 'string' && _prChecks[rci]) {
            rockLabels.push(_prChecks[rci]);
        }
    }
    for (var rmi = 0; rmi < _prComments.length; rmi++) {
        if (typeof _prComments[rmi] === 'string' && _prComments[rmi]) {
            rockLabels.push(_prComments[rmi]);
        }
    }
    var obstacleDensity = Math.min(
        DRIVE_OBSTACLE_DENSITY_MAX,
        DRIVE_OBSTACLE_DENSITY_BASE + currentLevel * DRIVE_OBSTACLE_DENSITY_PER_LEVEL
    );
    var obstacleTarget = Math.floor(driveRoadLength * obstacleDensity);
    var obstaclesPlaced = 0;
    var obstacleAttempts = 0;
    var obstacleAttemptCap = Math.max(1, obstacleTarget) * 8;
    while (obstaclesPlaced < obstacleTarget && obstacleAttempts < obstacleAttemptCap) {
        obstacleAttempts++;
        var owx = safeStart + Math.random() * (safeEnd - safeStart);
        if (!canPlaceIn(occupiedGround, owx - DRIVE_ROCK_SIZE, owx + DRIVE_ROCK_SIZE)) continue;
        var oSegIdx = Math.floor(owx / segmentWidth);
        if (oSegIdx < 0 || oSegIdx >= driveRoadSegments.length) continue;
        var oSeg = driveRoadSegments[oSegIdx];
        if (oSeg.type !== 'ground') continue;
        driveObstacles.push({
            type: 'rock',
            x: owx,
            y: oSeg.y,
            size: DRIVE_ROCK_SIZE,
            label: rockLabels[Math.floor(Math.random() * rockLabels.length)]
        });
        occupiedGround.push({ x1: owx - DRIVE_ROCK_SIZE, x2: owx + DRIVE_ROCK_SIZE, kind: 'rock' });
        obstaclesPlaced++;
    }

    // --- Pickups: varying heights. Full pickup label pool. Floating above
    // the terrain; half are low (drive-through) and half elevated (require a
    // jump) so the mix naturally produces a jump-or-skip decision.
    var pickupLabels = [
        'LGTM', '+1', 'approved', 'ship it!', 'CI passed',
        'tests green', 'looks good', 'no comments', 'reviewed', 'merged'
    ];
    // US-015: mix in PR reviewer names + approval status when available.
    // E.g. `LGTM @alice`, `approved by @bob`, `2/2 approved`. Falls back to
    // the default pool when no PR data is attached.
    var _prReviewers = (typeof landedPRReviewers !== 'undefined' && Array.isArray(landedPRReviewers)) ? landedPRReviewers : [];
    var _prApprovals = (typeof landedPRApprovals === 'number') ? landedPRApprovals : 0;
    for (var pri = 0; pri < _prReviewers.length; pri++) {
        var handle = _prReviewers[pri];
        if (typeof handle !== 'string' || !handle) continue;
        var at = handle.charAt(0) === '@' ? handle : ('@' + handle);
        pickupLabels.push('LGTM ' + at);
        pickupLabels.push('approved by ' + at);
    }
    if (_prApprovals > 0) {
        var reviewerCount = _prReviewers.length > 0 ? _prReviewers.length : _prApprovals;
        pickupLabels.push(_prApprovals + '/' + reviewerCount + ' approved');
    }
    var pickupTarget = Math.floor(driveRoadLength * DRIVE_PICKUP_DENSITY);
    var pickupsPlaced = 0;
    var pickupAttempts = 0;
    var pickupAttemptCap = Math.max(1, pickupTarget) * 8;
    while (pickupsPlaced < pickupTarget && pickupAttempts < pickupAttemptCap) {
        pickupAttempts++;
        var pwx = safeStart + Math.random() * (safeEnd - safeStart);
        if (!canPlaceIn(occupiedAir, pwx - DRIVE_PICKUP_SIZE, pwx + DRIVE_PICKUP_SIZE)) continue;
        var pSegIdx = Math.floor(pwx / segmentWidth);
        if (pSegIdx < 0 || pSegIdx >= driveRoadSegments.length) continue;
        var pSeg = driveRoadSegments[pSegIdx];
        if (pSeg.type === 'gap') continue;
        var heightOffset = Math.random() < 0.5
            ? (20 + Math.random() * 10)   // low — collect while driving
            : (55 + Math.random() * 25);  // elevated — need a jump
        drivePickups.push({
            x: pwx,
            y: pSeg.y - heightOffset,
            size: DRIVE_PICKUP_SIZE,
            label: pickupLabels[Math.floor(Math.random() * pickupLabels.length)],
            collected: false
        });
        occupiedAir.push({ x1: pwx - DRIVE_PICKUP_SIZE, x2: pwx + DRIVE_PICKUP_SIZE, kind: 'pickup' });
        pickupsPlaced++;
    }
}

// Feature Drive US-008: short yellow/orange spark burst on rock impact. (x,y)
// is a screen-space point (the buggy's on-screen position) — spark particles
// live in screen space and fade over ~0.25-0.5s.
function spawnDriveSparkBurst(x, y) {
    var colors = ['#FFEB3B', '#FFC107', '#FF9800', '#FFFFFF'];
    for (var i = 0; i < 14; i++) {
        var angle = -Math.PI + Math.random() * Math.PI; // upward hemisphere
        var speed = 80 + Math.random() * 180;
        var life = 0.25 + Math.random() * 0.25;
        driveParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: life,
            maxLife: life,
            size: 1.5 + Math.random() * 2,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

// Feature Drive US-013: small dust puff kicked up behind the buggy while
// driving on the ground. Short-lived tan/gray particle with a slight upward
// drift so it appears to kick out from under the wheel before settling back.
// Intensity is controlled by emission rate in the DRIVE_PLAYING tick.
function spawnDriveDustPuff(x, y) {
    var colors = ['#8b7355', '#a08868', '#9c9178', '#c0b090'];
    var angle = -Math.PI + (Math.random() * 0.6 - 0.3) - Math.PI * 0.15;
    var speed = 20 + Math.random() * 40;
    var life = 0.3 + Math.random() * 0.25;
    driveParticles.push({
        x: x + (Math.random() - 0.5) * 4,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: life,
        maxLife: life,
        size: 1 + Math.random() * 1.5,
        color: colors[Math.floor(Math.random() * colors.length)]
    });
}

// Feature Drive US-009: sparkle burst at pickup collection. Omnidirectional
// green/cyan/white spray at (x,y) screen-space, lighter + longer-lived than
// the rock spark burst so the "collected" read is distinct from "hit".
function spawnDrivePickupSparkle(x, y) {
    var colors = ['#4CAF50', '#8BC34A', '#9cf', '#FFFFFF'];
    for (var i = 0; i < 12; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 40 + Math.random() * 120;
        var life = 0.35 + Math.random() * 0.35;
        driveParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: life,
            maxLife: life,
            size: 1.5 + Math.random() * 2,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

// Red/orange debris burst for a destroyed building or battery (AC#2). Emits a
// fan of particles with downward gravity so they settle like rubble.
function spawnMissileDestructionBurst(x, y) {
    var colors = ['#FF3B30', '#FF6B00', '#FF8A00', '#FFB300', '#E53935', '#D84315'];
    for (var i = 0; i < 28; i++) {
        var angle = -Math.PI + Math.random() * Math.PI; // upward hemisphere
        var speed = 60 + Math.random() * 180;
        var life = 0.5 + Math.random() * 0.6;
        missileDestructionParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: life,
            maxLife: life,
            size: 2 + Math.random() * 3,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

// Cyan/white burst for an interceptor detonation (AC#7). Reuses the same
// particle array + renderer as the destruction burst — only the color palette
// and radial-360° dispersal differ.
function spawnMissileInterceptorBurst(x, y) {
    var colors = ['#ffffff', '#b3e5fc', '#81d4fa', '#00e5ff', '#00bcd4', '#26c6da'];
    for (var i = 0; i < 22; i++) {
        var angle = Math.random() * Math.PI * 2; // full sphere
        var speed = 80 + Math.random() * 160;
        var life = 0.35 + Math.random() * 0.45;
        missileDestructionParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: life,
            maxLife: life,
            size: 1.5 + Math.random() * 2.5,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

// Spawn a single wave of incoming missiles. Each missile gets a random spawn X
// along the top of the screen, a random live building or battery as its target
// (locked at spawn), a per-missile speed around the level-scaled base, and a
// stagger delay in [0, 2) seconds. Entries sit in `missileWaveSpawnQueue` until
// their delay elapses, then get promoted into `missileIncoming` (see the
// MISSILE_PLAYING update block). Label per missile is pulled from
// `MISSILE_INCOMING_LABEL_POOL` (PRD section 8).
function spawnMissileWave() {
    var count = Math.min(
        MISSILE_INCOMING_MAX,
        MISSILE_INCOMING_BASE_COUNT + currentLevel * MISSILE_INCOMING_PER_LEVEL
    );

    // Gather live targets: buildings (aim for roof midpoint) + batteries.
    // Each target carries its origin array + index so impact resolution can mark
    // the exact entry destroyed without a second proximity search.
    var targets = [];
    for (var bi = 0; bi < missileBuildings.length; bi++) {
        var b = missileBuildings[bi];
        if (b.destroyed) continue;
        targets.push({ x: b.x, y: b.baseY - b.targetHeight / 2, kind: 'building', idx: bi });
    }
    for (var gi = 0; gi < missileBatteries.length; gi++) {
        var bat = missileBatteries[gi];
        if (bat.destroyed) continue;
        targets.push({ x: bat.x, y: bat.y, kind: 'battery', idx: gi });
    }
    if (targets.length === 0) return;

    var baseSpeed = MISSILE_INCOMING_BASE_SPEED + currentLevel * MISSILE_INCOMING_SPEED_PER_LEVEL;

    for (var m = 0; m < count; m++) {
        var delay = Math.random() * 2;
        var spawnX = Math.random() * canvas.width;
        var spawnY = 0;
        var target = targets[Math.floor(Math.random() * targets.length)];
        var speed = baseSpeed + (Math.random() * 2 - 1) * MISSILE_INCOMING_SPEED_VARIANCE;
        if (speed < 10) speed = 10;
        var dx = target.x - spawnX;
        var dy = target.y - spawnY;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var pool = (typeof missileRoundLabelPool !== 'undefined' && missileRoundLabelPool && missileRoundLabelPool.length)
            ? missileRoundLabelPool
            : MISSILE_INCOMING_LABEL_POOL;
        var label = pool[Math.floor(Math.random() * pool.length)];
        missileWaveSpawnQueue.push({
            delay: delay,
            originX: spawnX,
            originY: spawnY,
            targetX: target.x,
            targetY: target.y,
            targetKind: target.kind,
            targetIdx: target.idx,
            vx: (dx / dist) * speed,
            vy: (dy / dist) * speed,
            totalDist: dist,
            label: label
        });
    }

    missilesTotal += count;
    missileWaveTimer = 0;
    missileWaveCurrent++;
    missileWaveAnnounceTimer = MISSILE_WAVE_ANNOUNCE_DURATION;
}

function update(dt) {
    // Update animation timer for pad glow pulse
    animTime += dt;

    // Track whether we're in invader mode for visual polish
    invaderMode = (gameState === STATES.INVADER_SCROLL_ROTATE ||
                   gameState === STATES.INVADER_TRANSITION ||
                   gameState === STATES.INVADER_PLAYING ||
                   gameState === STATES.INVADER_COMPLETE ||
                   gameState === STATES.INVADER_RETURN);

    // Scroll stars during invader mode
    updateStars(dt);

    // Update screen shake timer
    if (screenShake > 0) {
        screenShake -= dt;
        if (screenShake < 0) screenShake = 0;
    }

    // Update explosion particles during crash
    if (gameState === STATES.CRASHED) {
        stopThrustSound();
        updateExplosion(dt);
    }

    // Update celebration particles during landed
    if (gameState === STATES.LANDED) {
        updateCelebration(dt);
    }

    // Scene liftoff animation: rise to vertical center then begin horizontal scroll
    // Uses eased deceleration and horizontal blend for seamless transition to scroll
    // Thrust sound plays for both normal and invader (security pad) paths
    if (gameState === STATES.SCENE_LIFTOFF) {
        // Ensure thrust sound is active during liftoff (both normal and security pad paths)
        startThrustSound();
        // Set thrusting flag so ship state reflects visual thrust flame
        ship.thrusting = true;
        var targetY = canvas.height / 2;
        var totalDist = sceneLiftoffStartY - targetY;
        if (totalDist <= 0) totalDist = 1;
        var progress = 1 - ((ship.y - targetY) / totalDist);
        if (progress < 0) progress = 0;
        if (progress > 1) progress = 1;

        // Eased vertical speed: decelerates as ship nears center
        var speedFactor = 1 - progress * 0.7;
        if (speedFactor < 0.15) speedFactor = 0.15;
        ship.y -= SCENE_LIFTOFF_RISE_SPEED * speedFactor * dt;

        // In last 30% of rise, blend horizontal movement toward center
        if (progress > 0.7) {
            var blendFactor = (progress - 0.7) / 0.3;
            ship.x += (canvas.width / 2 - ship.x) * blendFactor * 2 * dt;
        }

        if (ship.y <= targetY) {
            ship.y = targetY;
            // Snapshot current terrain before generating new level
            var snapOldTerrain = [];
            for (var i = 0; i < terrain.length; i++) {
                snapOldTerrain.push({ x: terrain[i].x, y: terrain[i].y });
            }
            var snapOldPads = [];
            for (var i = 0; i < landingPads.length; i++) {
                var p = landingPads[i];
                snapOldPads.push({ index: p.index, width: p.width, points: p.points, prType: p.prType, prNumber: p.prNumber, prTitle: p.prTitle, prHash: p.prHash, prAuthor: p.prAuthor, prMergedDate: p.prMergedDate, prLinesChanged: p.prLinesChanged, prReviewers: p.prReviewers, prApprovals: p.prApprovals, prChecks: p.prChecks, prComments: p.prComments });
            }

            var snapNewTerrain;
            var snapNewPads;

            if (securityPadScroll || missilePadScroll) {
                // Security pad (invader OR missile command): flat terrain, no pads, no level advance
                var flatY = canvas.height * TERRAIN_FLAT_Y_RATIO;
                snapNewTerrain = [];
                for (var i = 0; i < terrain.length; i++) {
                    snapNewTerrain.push({ x: terrain[i].x, y: flatY });
                }
                snapNewPads = []; // No landing pads on mini-game terrain
            } else {
                // Normal pad: level already incremented at spacebar press — apply config and generate terrain
                GRAVITY = getLevelConfig(currentLevel).gravity;
                THRUST_POWER = GRAVITY * 2.5;
                resetWind();
                generateTerrain();
                snapNewTerrain = [];
                for (var i = 0; i < terrain.length; i++) {
                    snapNewTerrain.push({ x: terrain[i].x, y: terrain[i].y });
                }
                snapNewPads = [];
                for (var i = 0; i < landingPads.length; i++) {
                    var p = landingPads[i];
                    snapNewPads.push({ index: p.index, width: p.width, points: p.points, prType: p.prType, prNumber: p.prNumber, prTitle: p.prTitle, prHash: p.prHash, prAuthor: p.prAuthor, prMergedDate: p.prMergedDate, prLinesChanged: p.prLinesChanged, prReviewers: p.prReviewers, prApprovals: p.prApprovals, prChecks: p.prChecks, prComments: p.prComments });
                }
            }
            // Atomically set scroll state as a frozen object (ship.x preserved for smooth transition)
            sceneScrollState = createSceneScrollState(snapOldTerrain, snapOldPads, snapNewTerrain, snapNewPads, securityPadScroll, bugfixPadScroll, missilePadScroll, ship.x);
            gameState = STATES.SCENE_SCROLL;
        }
    }

    // Scene scroll: horizontal terrain transition
    // Thrust sound + visuals active for both normal and invader (security pad) paths
    if (gameState === STATES.SCENE_SCROLL && sceneScrollState) {
        // Ensure thrust sound continues during scroll (both normal and security pad paths)
        startThrustSound();
        // Set thrusting flag and side thruster direction for visual rendering
        ship.thrusting = true;
        var shipStartX = sceneScrollState.shipStartX;
        // Side thrusters show during horizontal scroll (direction matches travel)
        ship.rotating = (shipStartX < canvas.width / 2) ? 'right' : 'left';
        // Timer is tracked via a new object since sceneScrollState is frozen
        var scrollTimer = sceneScrollState.timer + dt;
        var t = Math.min(scrollTimer / SCENE_SCROLL_DURATION, 1);

        // Eased progress for synchronized terrain/ship movement
        var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        // Ship flies across: from starting X to center (synchronized with terrain scroll)
        ship.x = shipStartX + (canvas.width / 2 - shipStartX) * eased;

        // Y: smooth arc from center toward target altitude
        // Normal path: descend toward canvas.height/3 (covers 85% during scroll)
        // Invader + missile paths: stay at canvas.height/2 (mini-game entries expect center)
        var scrollCenterY = canvas.height / 2;
        if (!sceneScrollState.isInvaderScroll && !sceneScrollState.isMissileScroll) {
            var scrollTargetY = canvas.height / 3;
            ship.y = scrollCenterY + (scrollTargetY - scrollCenterY) * 0.85 * eased;
        } else {
            ship.y = scrollCenterY;
        }

        // Bank angle: smooth bell curve peaking at mid-scroll, direction depends on travel
        var bankDirection = (shipStartX < canvas.width / 2) ? 1 : -1;
        ship.angle = bankDirection * SCENE_SCROLL_BANK_ANGLE * Math.sin(t * Math.PI);

        if (t >= 1) {
            // Scroll complete — finalize new terrain from the frozen snapshot
            var newT = sceneScrollState.newTerrain;
            var newP = sceneScrollState.newPads;
            var wasInvaderScroll = sceneScrollState.isInvaderScroll;
            var wasBugfixScroll = sceneScrollState.isBugfixScroll;
            var wasMissileScroll = sceneScrollState.isMissileScroll;
            // Detect `other` pad directly from the just-landed pad's prType (set in
            // collision.js from landedPad.prType when the ship touched down) rather
            // than a pre-computed routing flag — acceptance criterion for US-003.
            var isOtherPad = (landedPRType === 'other');
            var isChorePad = (landedPRType === 'chore');
            var isFeaturePad = (landedPRType === 'feature');
            terrain = [];
            for (var i = 0; i < newT.length; i++) {
                terrain.push({ x: newT[i].x, y: newT[i].y });
            }
            landingPads = [];
            for (var i = 0; i < newP.length; i++) {
                var p = newP[i];
                landingPads.push({ index: p.index, width: p.width, points: p.points, prType: p.prType, prNumber: p.prNumber, prTitle: p.prTitle, prHash: p.prHash, prAuthor: p.prAuthor, prMergedDate: p.prMergedDate, prLinesChanged: p.prLinesChanged, prReviewers: p.prReviewers, prApprovals: p.prApprovals, prChecks: p.prChecks, prComments: p.prComments });
            }
            landingPadIndex = landingPads.length > 0 ? landingPads[0].index : -1;
            // Atomically clear scroll state
            sceneScrollState = null;

            if (wasInvaderScroll) {
                // Security pad: rotate ship 90° then enter invader gameplay
                ship.x = canvas.width / 2;
                ship.y = canvas.height / 2;
                ship.angle = 0;
                ship.vx = 0;
                ship.vy = 0;
                ship.invaderVX = 0;
                ship.invaderVY = 0;
                ship.thrusting = false;
                ship.retroThrusting = false;
                ship.rotating = null;
                stopThrustSound();
                ship.fuel = FUEL_MAX;
                invaderScrollRotateTimer = 0;
                gameState = STATES.INVADER_SCROLL_ROTATE;
            } else if (wasBugfixScroll) {
                // Bugfix pad: enter bugfix transition directly (no 90° rotation)
                ship.x = canvas.width / 2;
                ship.y = canvas.height / 2;
                ship.angle = 0;
                ship.vx = 0;
                ship.vy = 0;
                ship.thrusting = false;
                ship.rotating = null;
                stopThrustSound();
                ship.fuel = FUEL_MAX;
                bugfixTransitionTimer = 0;
                spawnBugWave();
                gameState = STATES.BUGFIX_TRANSITION;
            } else if (wasMissileScroll) {
                // Security pad (even count): enter missile command transition
                ship.x = canvas.width / 2;
                ship.y = canvas.height / 2;
                ship.angle = 0;
                ship.vx = 0;
                ship.vy = 0;
                ship.thrusting = false;
                ship.rotating = null;
                stopThrustSound();
                ship.fuel = FUEL_MAX;
                missileTransitionTimer = 0;
                setupMissileWorld();
                gameState = STATES.MISSILE_TRANSITION;
            } else if (isOtherPad) {
                // Other pads → Tech Debt Blaster (asteroids), 50% chance
                if (Math.random() < 0.5) {
                    ship.x = canvas.width / 2;
                    ship.y = canvas.height / 2;
                    ship.angle = 0;
                    ship.vx = 0;
                    ship.vy = 0;
                    ship.thrusting = false;
                    ship.rotating = null;
                    stopThrustSound();
                    ship.fuel = FUEL_MAX;
                    techdebtTransitionTimer = 0;
                    setupTechdebtWorld();
                    gameState = STATES.TECHDEBT_TRANSITION;
                } else {
                    sceneDescentStartY = ship.y;
                    sceneDescentTargetY = canvas.height / 3;
                    sceneDescentTimer = 0;
                    ship.x = canvas.width / 2;
                    ship.y = sceneDescentStartY;
                    ship.angle = 0;
                    ship.vx = 0;
                    ship.vy = 0;
                    ship.thrusting = false;
                    ship.rotating = null;
                    stopThrustSound();
                    ship.fuel = FUEL_MAX;
                    gameState = STATES.SCENE_DESCENT;
                }
            } else if (isChorePad) {
                // Chore pads → Code Breaker (breakout), 50% chance
                if (Math.random() < 0.5) {
                    ship.x = canvas.width / 2;
                    ship.y = canvas.height / 2;
                    ship.angle = 0;
                    ship.vx = 0;
                    ship.vy = 0;
                    ship.thrusting = false;
                    ship.rotating = null;
                    stopThrustSound();
                    ship.fuel = FUEL_MAX;
                    breakoutTransitionTimer = 0;
                    setupBreakoutWorld();
                    gameState = STATES.BREAKOUT_TRANSITION;
                } else {
                    sceneDescentStartY = ship.y;
                    sceneDescentTargetY = canvas.height / 3;
                    sceneDescentTimer = 0;
                    ship.x = canvas.width / 2;
                    ship.y = sceneDescentStartY;
                    ship.angle = 0;
                    ship.vx = 0;
                    ship.vy = 0;
                    ship.thrusting = false;
                    ship.rotating = null;
                    stopThrustSound();
                    ship.fuel = FUEL_MAX;
                    gameState = STATES.SCENE_DESCENT;
                }
            } else if (isFeaturePad) {
                // Feature pad: enter Feature Drive transition directly (no
                // pre-computed scroll flag — detection is via landedPRType).
                ship.x = canvas.width / 2;
                ship.y = canvas.height / 2;
                ship.angle = 0;
                ship.vx = 0;
                ship.vy = 0;
                ship.thrusting = false;
                ship.rotating = null;
                stopThrustSound();
                ship.fuel = FUEL_MAX;
                driveTransitionTimer = 0;
                setupDriveWorld();
                gameState = STATES.DRIVE_TRANSITION;
            } else {
                // Normal pad: begin final descent settle from current position
                sceneDescentStartY = ship.y;
                sceneDescentTargetY = canvas.height / 3;
                sceneDescentTimer = 0;
                ship.x = canvas.width / 2;
                ship.y = sceneDescentStartY;
                ship.angle = 0;
                ship.vx = 0;
                ship.vy = 0;
                ship.thrusting = false;
                ship.rotating = null;
                stopThrustSound();
                ship.fuel = FUEL_MAX;
                gameState = STATES.SCENE_DESCENT;
            }
        } else {
            // Update timer by replacing the frozen object atomically
            sceneScrollState = Object.freeze({
                timer: scrollTimer,
                oldTerrain: sceneScrollState.oldTerrain,
                oldPads: sceneScrollState.oldPads,
                newTerrain: sceneScrollState.newTerrain,
                newPads: sceneScrollState.newPads,
                isInvaderScroll: sceneScrollState.isInvaderScroll,
                isBugfixScroll: sceneScrollState.isBugfixScroll,
                isMissileScroll: sceneScrollState.isMissileScroll,
                shipStartX: sceneScrollState.shipStartX
            });
        }
    }

    // Scene descent: ship descends from center to starting altitude
    if (gameState === STATES.SCENE_DESCENT) {
        sceneDescentTimer += dt;
        var t = Math.min(sceneDescentTimer / SCENE_DESCENT_DURATION, 1);
        // Ease in-out for smooth descent
        var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        ship.y = sceneDescentStartY + (sceneDescentTargetY - sceneDescentStartY) * eased;
        ship.x = canvas.width / 2;

        if (t >= 1) {
            ship.y = sceneDescentTargetY;
            // Freeze ship before countdown
            ship.vx = 0;
            ship.vy = 0;
            ship.thrusting = false;
            ship.rotating = null;
            sceneCountdownTimer = 0;
            stopThrustSound();
            gameState = STATES.SCENE_COUNTDOWN;
        }
    }

    // Scene countdown: 3-2-1 overlay before giving control
    if (gameState === STATES.SCENE_COUNTDOWN) {
        sceneCountdownTimer += dt;
        // No physics, no gravity, no wind — ship stays frozen
        var totalDuration = SCENE_COUNTDOWN_STEP_DURATION * 3;
        if (sceneCountdownTimer >= totalDuration) {
            // Ensure zero velocity when control returns
            ship.vx = 0;
            ship.vy = 0;
            gameState = STATES.PLAYING;
        }
    }

    // Invader scroll rotate: 90-degree clockwise rotation after security pad scroll
    if (gameState === STATES.INVADER_SCROLL_ROTATE) {
        invaderScrollRotateTimer += dt;
        var t = Math.min(invaderScrollRotateTimer / INVADER_SCROLL_ROTATE_DURATION, 1);
        // Ease in-out for smooth rotation
        var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        ship.angle = eased * (Math.PI / 2);

        if (t >= 1) {
            ship.angle = Math.PI / 2;
            // Terrain is already flat from scroll — snapshot for INVADER_TRANSITION compatibility
            terrainOriginalPoints = [];
            for (var i = 0; i < terrain.length; i++) {
                terrainOriginalPoints.push(terrain[i].y);
            }
            terrainTransitionTimer = 0;
            gameState = STATES.INVADER_TRANSITION;
        }
    }

    // Invader terrain transition: flatten terrain over time
    if (gameState === STATES.INVADER_TRANSITION) {
        terrainTransitionTimer += dt;
        var t = Math.min(terrainTransitionTimer / TERRAIN_TRANSITION_DURATION, 1);
        // Ease in-out for smooth flattening
        var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        var flatY = canvas.height * TERRAIN_FLAT_Y_RATIO;

        for (var i = 0; i < terrain.length; i++) {
            terrain[i].y = terrainOriginalPoints[i] + (flatY - terrainOriginalPoints[i]) * eased;
        }

        if (t >= 1) {
            // Ensure terrain is exactly flat
            for (var i = 0; i < terrain.length; i++) {
                terrain[i].y = flatY;
            }
            // Spawn alien wave before entering playing state
            spawnAlienWave();
            stopThrustSound();
            ship.invaderVX = 0;
            ship.invaderVY = 0;
            ship.thrusting = false;
            ship.retroThrusting = false;
            gameState = STATES.INVADER_PLAYING;
        }
    }

    // Invader playing: move aliens, handle bullets, detect collisions
    if (gameState === STATES.INVADER_PLAYING) {
        // --- Ship thruster-based physics (velocity + drag + inertia) ---
        var flatY = canvas.height * TERRAIN_FLAT_Y_RATIO;
        var movingUp = !!(keys['ArrowUp'] || keys['w'] || keys['W']);
        var movingDown = !!(keys['ArrowDown'] || keys['s'] || keys['S']);
        var movingLeft = !!(keys['ArrowLeft'] || keys['a'] || keys['A']);
        var movingRight = !!(keys['ArrowRight'] || keys['d'] || keys['D']);

        var wantsMainThrust = movingUp || movingRight;
        var wantsRetroThrust = movingDown || movingLeft;

        if (movingUp)    ship.invaderVY -= INVADER_THRUST_POWER * dt;
        if (movingRight) ship.invaderVX += INVADER_THRUST_POWER * dt;
        if (movingDown)  ship.invaderVY += INVADER_RETRO_POWER * dt;
        if (movingLeft)  ship.invaderVX -= INVADER_RETRO_POWER * dt;

        ship.thrusting = wantsMainThrust;
        ship.retroThrusting = wantsRetroThrust;

        if (ship.thrusting) {
            startThrustSound('main');
        } else if (ship.retroThrusting) {
            startThrustSound('retro');
        } else {
            stopThrustSound();
        }

        // Drag
        ship.invaderVX *= INVADER_DRAG;
        ship.invaderVY *= INVADER_DRAG;

        // Clamp velocity magnitude
        var speed = Math.sqrt(ship.invaderVX * ship.invaderVX + ship.invaderVY * ship.invaderVY);
        if (speed > INVADER_MAX_SPEED) {
            var scale = INVADER_MAX_SPEED / speed;
            ship.invaderVX *= scale;
            ship.invaderVY *= scale;
        }

        // Position update
        ship.x += ship.invaderVX * dt;
        ship.y += ship.invaderVY * dt;

        // Clamp to canvas bounds; zero the velocity component in the direction of the bound
        if (ship.y < 80) { ship.y = 80; ship.invaderVY = 0; }
        if (ship.y > flatY - 40) { ship.y = flatY - 40; ship.invaderVY = 0; }
        if (ship.x < SHIP_SIZE) { ship.x = SHIP_SIZE; ship.invaderVX = 0; }
        if (ship.x > canvas.width - SHIP_SIZE) { ship.x = canvas.width - SHIP_SIZE; ship.invaderVX = 0; }

        // --- Bullet firing (Space key) ---
        bulletCooldownTimer -= dt;
        if (bulletCooldownTimer < 0) bulletCooldownTimer = 0;
        var wantsFire = !!(keys[' '] || keys['Space']);
        if (wantsFire && bulletCooldownTimer <= 0) {
            // Fire bullet from the nose of the ship (ship faces right at angle PI/2)
            bullets.push({ x: ship.x + SHIP_SIZE * 0.6, y: ship.y });
            bulletCooldownTimer = BULLET_COOLDOWN;
            playShootSound();
        }

        // --- Update bullets ---
        for (var i = bullets.length - 1; i >= 0; i--) {
            bullets[i].x += BULLET_SPEED * dt;
            // Remove bullets that go off-screen right
            if (bullets[i].x > canvas.width + 20) {
                bullets.splice(i, 1);
            }
        }

        // --- Move aliens leftward ---
        for (var i = aliens.length - 1; i >= 0; i--) {
            aliens[i].x -= ALIEN_SPEED * dt;
            // Remove alien when fully off the left edge
            if (aliens[i].x < -ALIEN_SIZE) {
                aliens.splice(i, 1);
            }
        }

        // --- Bullet-Alien collision detection ---
        for (var b = bullets.length - 1; b >= 0; b--) {
            var bx = bullets[b].x;
            var by = bullets[b].y;
            var hit = false;
            for (var a = aliens.length - 1; a >= 0; a--) {
                var ax = aliens[a].x;
                var ay = aliens[a].y;
                var halfSize = ALIEN_SIZE / 2;
                // Simple AABB collision
                if (bx >= ax - halfSize && bx <= ax + halfSize &&
                    by >= ay - halfSize && by <= ay + halfSize) {
                    // Spawn explosion at alien position
                    spawnAlienExplosion(ax, ay);
                    playAlienDestroySound();
                    // Destroy alien
                    aliens.splice(a, 1);
                    aliensDestroyed++;
                    invaderScore += ALIEN_POINTS;
                    hit = true;
                    break;
                }
            }
            if (hit) {
                bullets.splice(b, 1);
            }
        }

        // --- Ship-Alien collision: contact ends the mini-game ---
        var shipHalfSize = SHIP_SIZE * 0.5;
        for (var a = aliens.length - 1; a >= 0; a--) {
            var ax = aliens[a].x;
            var ay = aliens[a].y;
            var halfSize = ALIEN_SIZE / 2;
            if (ship.x + shipHalfSize > ax - halfSize && ship.x - shipHalfSize < ax + halfSize &&
                ship.y + shipHalfSize > ay - halfSize && ship.y - shipHalfSize < ay + halfSize) {
                spawnExplosion(ship.x, ship.y);
                playExplosionSound();
                ship.thrusting = false;
                ship.retroThrusting = false;
                stopThrustSound();
                invaderCompleteTimer = 0;
                gameState = STATES.INVADER_COMPLETE;
                break;
            }
        }

        // --- Update alien explosion particles ---
        updateAlienExplosions(dt);

        // --- End condition: all aliens gone (destroyed or scrolled off) ---
        if (gameState === STATES.INVADER_PLAYING && aliensSpawned && aliens.length === 0) {
            // Wave complete — transition to results screen
            ship.thrusting = false;
            ship.retroThrusting = false;
            stopThrustSound();
            invaderCompleteTimer = 0;
            gameState = STATES.INVADER_COMPLETE;
        }
    }

    // Invader complete: show results, then return to normal gameplay
    if (gameState === STATES.INVADER_COMPLETE) {
        updateAlienExplosions(dt);
        invaderCompleteTimer += dt;
        if (invaderCompleteTimer >= INVADER_COMPLETE_DELAY) {
            // Add invader bonus points to player's total score
            score += invaderScore;
            // Return to normal gameplay — start return rotation
            invaderReturnRotationTimer = 0;
            gameState = STATES.INVADER_RETURN;
        }
    }

    // Invader return: rotate ship back to vertical, then reset and resume normal gameplay
    if (gameState === STATES.INVADER_RETURN) {
        invaderReturnRotationTimer += dt;
        var t = Math.min(invaderReturnRotationTimer / INVADER_RETURN_ROTATION_DURATION, 1);
        // Ease in-out for smooth rotation
        var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        // Rotate from PI/2 (facing right) back to 0 (facing up)
        ship.angle = (Math.PI / 2) * (1 - eased);

        if (t >= 1) {
            // Clean up invader state
            aliens = [];
            bullets = [];
            alienExplosions = [];
            aliensSpawned = false;
            bulletCooldownTimer = 0;

            // Advance to next level
            currentLevel++;
            GRAVITY = getLevelConfig(currentLevel).gravity;
            THRUST_POWER = GRAVITY * 2.5;
            resetShip();
            resetWind();
            generateTerrain();
            sceneCountdownTimer = 0;
            gameState = STATES.SCENE_COUNTDOWN;
        }
    }

    // Bugfix transition: brief intro between landing and bugfix gameplay
    if (gameState === STATES.BUGFIX_TRANSITION) {
        bugfixTransitionTimer += dt;
        if (bugfixTransitionTimer >= BUGFIX_TRANSITION_DURATION) {
            gameState = STATES.BUGFIX_PLAYING;
        }
    }

    // Bugfix playing: normal lander physics (gravity + thrust + rotation) without wind.
    // Top clamp (y >= 0) prevents the ship from escaping the play area upward.
    if (gameState === STATES.BUGFIX_PLAYING) {
        var rotatingLeft = !!(keys['ArrowLeft'] || keys['a'] || keys['A']);
        var rotatingRight = !!(keys['ArrowRight'] || keys['d'] || keys['D']);
        if (rotatingLeft) {
            ship.angle -= ship.rotationSpeed * dt;
        }
        if (rotatingRight) {
            ship.angle += ship.rotationSpeed * dt;
        }
        ship.rotating = rotatingLeft ? 'left' : rotatingRight ? 'right' : null;

        ship.vy += GRAVITY * PIXELS_PER_METER * dt;

        var wantsThrust = !!(keys['ArrowUp'] || keys['w'] || keys['W']);
        ship.thrusting = wantsThrust && ship.fuel > 0;
        if (ship.thrusting) {
            ship.fuel -= FUEL_BURN_RATE * dt;
            if (ship.fuel < 0) ship.fuel = 0;
            ship.vx += Math.sin(ship.angle) * THRUST_POWER * PIXELS_PER_METER * dt;
            ship.vy += -Math.cos(ship.angle) * THRUST_POWER * PIXELS_PER_METER * dt;
            startThrustSound();
        } else {
            stopThrustSound();
        }

        ship.x += ship.vx * dt;
        ship.y += ship.vy * dt;

        if (ship.x < 0) {
            ship.x = 0;
            ship.vx = 0;
        } else if (ship.x > canvas.width) {
            ship.x = canvas.width;
            ship.vx = 0;
        }
        if (ship.y < 0) {
            ship.y = 0;
            ship.vy = 0;
        }

        // Terrain collision — reuse shared checkCollision (routes to CRASHED on impact).
        checkCollision();

        // Ship-vs-bug collision (US-009): any remaining bug touching the ship
        // crashes it. Guard on gameState in case checkCollision already routed
        // to CRASHED/LANDED this tick.
        if (gameState === STATES.BUGFIX_PLAYING) {
            var shipBugR = (SHIP_SIZE / 2) + (BUGFIX_BUG_SIZE / 2);
            if (entitiesInRadius(ship.x, ship.y, shipBugR, bugs).length > 0) {
                crashShipInBugfix('Hit a bug');
            }
        }

        // Bugs: walk along terrain surface, reverse at edges (terrain bounds or steep delta),
        // re-stick y to terrain each frame, tick 2-frame shuffle animation.
        var terrainMinX = terrain.length > 0 ? terrain[0].x : 0;
        var terrainMaxX = terrain.length > 0 ? terrain[terrain.length - 1].x : canvas.width;
        var animPeriod = 1 / BUGFIX_BUG_ANIM_FPS;
        for (var ui = 0; ui < bugs.length; ui++) {
            var bg = bugs[ui];
            var nextX = bg.x + bg.vx * dt;
            var currentHit = getTerrainYAtX(bg.x);
            var nextHit = getTerrainYAtX(nextX);
            var reverse = false;
            if (nextX <= terrainMinX || nextX >= terrainMaxX || !nextHit) {
                reverse = true;
            } else if (currentHit && Math.abs(nextHit.y - currentHit.y) > BUGFIX_BUG_EDGE_STEEPNESS) {
                reverse = true;
            }
            if (reverse) {
                bg.vx = -bg.vx;
            } else {
                bg.x = nextX;
            }
            var surfaceHit = getTerrainYAtX(bg.x);
            var bugSurfaceY = surfaceHit ? surfaceHit.y : canvas.height * TERRAIN_FLAT_Y_RATIO;
            bg.y = bugSurfaceY - BUGFIX_BUG_SIZE / 2;

            bg.animTimer += dt;
            if (bg.animTimer >= animPeriod) {
                bg.animFrame = bg.animFrame === 0 ? 1 : 0;
                bg.animTimer -= animPeriod;
            }
        }

        // Bombs: gravity integration, trail particles, terrain + bug-blast explosions,
        // silent removal off-canvas. Iterate back-to-front so splice is safe.
        for (var bi = bombs.length - 1; bi >= 0; bi--) {
            var bomb = bombs[bi];
            bomb.vy += GRAVITY * BUGFIX_BOMB_GRAVITY_SCALE * PIXELS_PER_METER * dt;
            bomb.x += bomb.vx * dt;
            bomb.y += bomb.vy * dt;

            // Trail particle behind the bomb each frame
            spawnBombTrail(bomb.x, bomb.y);

            // Off-canvas (bottom or sides) — remove silently, no explosion
            if (bomb.x < 0 || bomb.x > canvas.width || bomb.y > canvas.height) {
                bombs.splice(bi, 1);
                continue;
            }

            // Determine explosion center: terrain contact → at terrain y; bug in radius → at bomb.
            var blastX = null;
            var blastY = null;
            var terrainHit = bombHitsTerrain(bomb, terrain);
            if (terrainHit) {
                blastX = terrainHit.x;
                blastY = terrainHit.y;
            } else if (entitiesInRadius(bomb.x, bomb.y, BUGFIX_BOMB_BLAST_RADIUS, bugs).length > 0) {
                blastX = bomb.x;
                blastY = bomb.y;
            }

            if (blastX !== null) {
                spawnBombExplosion(blastX, blastY);
                // Kill all bugs within blast radius of the explosion center
                var killed = entitiesInRadius(blastX, blastY, BUGFIX_BOMB_BLAST_RADIUS, bugs);
                for (var gj = bugs.length - 1; gj >= 0; gj--) {
                    if (killed.indexOf(bugs[gj]) !== -1) {
                        var victim = bugs[gj];
                        bugfixScore += victim.points;
                        score += victim.points;
                        bugsKilled++;
                        ship.fuel = Math.min(ship.fuel + BUGFIX_FUEL_PER_KILL, FUEL_MAX + FUEL_EXTENSION_MAX);
                        spawnBugExplosion(victim.x, victim.y);
                        bugs.splice(gj, 1);
                    }
                }
                // Ship-in-blast (US-009): self-bombing risk. If the ship is
                // within blast radius of the detonation center, crash it.
                if (gameState === STATES.BUGFIX_PLAYING && entitiesInRadius(blastX, blastY, BUGFIX_BOMB_BLAST_RADIUS, [ship]).length > 0) {
                    crashShipInBugfix('Caught in own bomb blast');
                }
                bombs.splice(bi, 1);
                continue;
            }
        }

        // Update bomb particle lifetimes (trail + explosion share bombParticles)
        updateBombParticles(dt);
        // Update bug-death explosion particles
        updateBugExplosions(dt);

        // Win condition: all bugs cleared → enter BUGFIX_COMPLETE with fuel-remaining bonus.
        // Per AC: random per-game choice between BUGFIX_FUEL_BONUS_LOW / _HIGH as multiplier on (fuel / FUEL_MAX).
        // Guard on gameState === BUGFIX_PLAYING + transition FIRST so the bonus cannot double-apply
        // if this block is re-entered in the same tick (defence against a multi-bomb salvo exploit).
        if (gameState === STATES.BUGFIX_PLAYING && bugsTotal > 0 && bugsKilled >= bugsTotal) {
            gameState = STATES.BUGFIX_COMPLETE;
            bugfixCompleteTimer = 0;
            var fuelMult = Math.random() < 0.5 ? BUGFIX_FUEL_BONUS_LOW : BUGFIX_FUEL_BONUS_HIGH;
            var fuelBonus = Math.round(fuelMult * (ship.fuel / FUEL_MAX));
            bugfixFuelBonus = fuelBonus;
            bugfixScore += fuelBonus;
            score += fuelBonus;
        }

        // Loss-path cleanup (US-010 AC#5): any path that left BUGFIX_PLAYING via
        // CRASHED this tick (terrain via checkCollision, ship-vs-bug, self-blast)
        // clears bugfix entities + counters so the crash/gameover screens don't
        // render stale bugs/bombs/particles from the dead round.
        if (gameState === STATES.CRASHED) {
            clearBugfixState();
        }
    }

    // Bugfix complete: brief results window (bugs cleared, fuel bonus already
    // accrued on win), then transition to BUGFIX_RETURN. Particle bursts continue
    // to tick so explosions finish visually during the delay.
    if (gameState === STATES.BUGFIX_COMPLETE) {
        updateBombParticles(dt);
        updateBugExplosions(dt);
        bugfixCompleteTimer += dt;
        if (bugfixCompleteTimer >= BUGFIX_COMPLETE_DELAY) {
            gameState = STATES.BUGFIX_RETURN;
        }
    }

    // Bugfix return: clear mini-game state, advance to next level, reset ship +
    // wind + terrain, then resume normal flight. Mirrors INVADER_RETURN's tail
    // (without the rotation animation — bugfix entry had no 90° rotation either).
    if (gameState === STATES.BUGFIX_RETURN) {
        clearBugfixState();
        currentLevel++;
        GRAVITY = getLevelConfig(currentLevel).gravity;
        THRUST_POWER = GRAVITY * 2.5;
        var extensionFuel = Math.max(0, ship.fuel - FUEL_MAX);
        resetShip();
        ship.fuel = FUEL_MAX + extensionFuel;
        resetWind();
        generateTerrain();
        sceneCountdownTimer = 0;
        gameState = STATES.SCENE_COUNTDOWN;
    }

    // Missile transition: combined 90° ship rotation + terrain flatten + building
    // rise animation. Terrain is already flat at entry (security-pad scroll gives
    // flat terrain) so the flatten lerp is a safe no-op — matches invader flow.
    if (gameState === STATES.MISSILE_TRANSITION) {
        missileTransitionTimer += dt;
        var t = Math.min(missileTransitionTimer / MISSILE_TRANSITION_DURATION, 1);
        var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        ship.angle = eased * (Math.PI / 2);

        var flatY = canvas.height * TERRAIN_FLAT_Y_RATIO;
        for (var i = 0; i < terrain.length; i++) {
            var origY = terrainOriginalPoints[i] != null ? terrainOriginalPoints[i] : flatY;
            terrain[i].y = origY + (flatY - origY) * eased;
        }

        for (var j = 0; j < missileBuildings.length; j++) {
            missileBuildings[j].height = missileBuildings[j].targetHeight * eased;
        }

        if (t >= 1) {
            ship.angle = Math.PI / 2;
            for (var i = 0; i < terrain.length; i++) {
                terrain[i].y = flatY;
            }
            for (var j = 0; j < missileBuildings.length; j++) {
                missileBuildings[j].height = missileBuildings[j].targetHeight;
            }
            // Kick off wave 1 at MISSILE_PLAYING entry so the stagger clock and
            // spawn queue are already primed when the playing block first ticks.
            spawnMissileWave();
            gameState = STATES.MISSILE_PLAYING;
        }
    }

    // Missile playing: player aims crosshair with arrow keys, fires interceptors
    // with Space. Wave progression, win, and lose conditions are all resolved
    // here (US-009). See tail of this block for the wave-complete / all-destroyed
    // branches that route to MISSILE_COMPLETE or CRASHED.
    if (gameState === STATES.MISSILE_PLAYING) {
        // Decrement the "WAVE N/M" announce banner so it naturally disappears
        // after MISSILE_WAVE_ANNOUNCE_DURATION seconds.
        if (missileWaveAnnounceTimer > 0) {
            missileWaveAnnounceTimer -= dt;
            if (missileWaveAnnounceTimer < 0) missileWaveAnnounceTimer = 0;
        }

        var aimLeft  = !!(keys['ArrowLeft']  || keys['a'] || keys['A']);
        var aimRight = !!(keys['ArrowRight'] || keys['d'] || keys['D']);
        var aimUp    = !!(keys['ArrowUp']    || keys['w'] || keys['W']);
        var aimDown  = !!(keys['ArrowDown']  || keys['s'] || keys['S']);
        if (aimLeft)  missileCrosshairX -= MISSILE_CROSSHAIR_SPEED * dt;
        if (aimRight) missileCrosshairX += MISSILE_CROSSHAIR_SPEED * dt;
        if (aimUp)    missileCrosshairY -= MISSILE_CROSSHAIR_SPEED * dt;
        if (aimDown)  missileCrosshairY += MISSILE_CROSSHAIR_SPEED * dt;
        if (missileCrosshairX < 0) missileCrosshairX = 0;
        if (missileCrosshairX > canvas.width) missileCrosshairX = canvas.width;
        if (missileCrosshairY < 0) missileCrosshairY = 0;
        if (missileCrosshairY > canvas.height) missileCrosshairY = canvas.height;

        // Wave spawning: promote queued missiles to live once their stagger delay
        // elapses, then advance live missiles along their frozen trajectories.
        // Missiles that reach their target are removed (impact explosion +
        // building/battery damage belongs to US-008).
        missileWaveTimer += dt;
        for (var qi = missileWaveSpawnQueue.length - 1; qi >= 0; qi--) {
            var q = missileWaveSpawnQueue[qi];
            if (missileWaveTimer >= q.delay) {
                missileIncoming.push({
                    originX: q.originX,
                    originY: q.originY,
                    x: q.originX,
                    y: q.originY,
                    targetX: q.targetX,
                    targetY: q.targetY,
                    targetKind: q.targetKind,
                    targetIdx: q.targetIdx,
                    vx: q.vx,
                    vy: q.vy,
                    totalDist: q.totalDist,
                    label: q.label
                });
                missileWaveSpawnQueue.splice(qi, 1);
            }
        }
        for (var iI = missileIncoming.length - 1; iI >= 0; iI--) {
            var im = missileIncoming[iI];
            im.x += im.vx * dt;
            im.y += im.vy * dt;
            var idx = im.x - im.originX;
            var idy = im.y - im.originY;
            var itrav = Math.sqrt(idx * idx + idy * idy);
            // AC#1: detonate when within 5px of target Y (or arrived by distance).
            if (Math.abs(im.y - im.targetY) <= 5 || itrav >= im.totalDist) {
                missileExplosions.push({
                    x: im.targetX,
                    y: im.targetY,
                    timer: 0,
                    duration: 0.5,
                    maxRadius: MISSILE_INTERCEPTOR_BLAST_RADIUS,
                    radius: 0,
                    kind: 'impact'
                });
                // Mark the specific target destroyed (AC#2, AC#3). Stays destroyed
                // for the remainder of the mini-game (AC#4) since setupMissileWorld
                // is only called on mini-game entry, never between waves.
                var hit = false;
                if (im.targetKind === 'building' &&
                    typeof im.targetIdx === 'number' &&
                    missileBuildings[im.targetIdx] &&
                    !missileBuildings[im.targetIdx].destroyed) {
                    missileBuildings[im.targetIdx].destroyed = true;
                    hit = true;
                } else if (im.targetKind === 'battery' &&
                    typeof im.targetIdx === 'number' &&
                    missileBatteries[im.targetIdx] &&
                    !missileBatteries[im.targetIdx].destroyed) {
                    missileBatteries[im.targetIdx].destroyed = true;
                    missileBatteries[im.targetIdx].ammo = 0; // AC#3: remaining ammo lost
                    hit = true;
                }
                if (hit) {
                    spawnMissileDestructionBurst(im.targetX, im.targetY);
                    // US-013 AC#3: deeper, lower-pitched explosion for incoming
                    // missile impacts on buildings/batteries — distinct from the
                    // interceptor detonation thud and the intercept pop.
                    if (typeof playMissileImpactSound === 'function') playMissileImpactSound();
                }
                missileIncoming.splice(iI, 1);
            }
        }

        // Advance interceptors along their locked trajectories. When an interceptor
        // reaches (or passes) its target coordinates, it detonates — spawning an
        // explosion that expands then shrinks over ~0.5s. Detonations destroy any
        // incoming missile whose position falls inside the blast radius.
        for (var ii = missileInterceptors.length - 1; ii >= 0; ii--) {
            var inter = missileInterceptors[ii];
            inter.x += inter.vx * dt;
            inter.y += inter.vy * dt;
            var rdx = inter.x - inter.launchX;
            var rdy = inter.y - inter.launchY;
            var travelled = Math.sqrt(rdx * rdx + rdy * rdy);
            if (travelled >= inter.totalDist) {
                missileExplosions.push({
                    x: inter.targetX,
                    y: inter.targetY,
                    timer: 0,
                    duration: 1.0,
                    maxRadius: MISSILE_INTERCEPTOR_BLAST_RADIUS,
                    radius: 0,
                    kind: 'interceptor'
                });
                spawnMissileInterceptorBurst(inter.targetX, inter.targetY);
                // US-013 AC#2: soft thud/boom on interceptor detonation.
                if (typeof playInterceptorDetonationSound === 'function') playInterceptorDetonationSound();
                missileInterceptors.splice(ii, 1);
            }
        }

        // Age explosions; compute current radius as an expand-then-shrink envelope
        // over [0, duration]. Check collisions against incoming missiles whose
        // centres fall within the current radius. (Incoming missiles arrive in a
        // later story — the check is a safe no-op until then.)
        for (var ei = missileExplosions.length - 1; ei >= 0; ei--) {
            var exp = missileExplosions[ei];
            exp.timer += dt;
            var p = exp.timer / exp.duration;
            if (p >= 1) {
                missileExplosions.splice(ei, 1);
                continue;
            }
            // Expand to maxRadius at p=0.5, shrink back toward 0 at p=1.
            var env = p < 0.5 ? (p / 0.5) : (1 - (p - 0.5) / 0.5);
            exp.radius = exp.maxRadius * env;
            // Only interceptor blasts destroy incoming missiles + credit the player.
            // Impact blasts (enemy missile hitting its target) must NOT credit the
            // player with interception and must NOT chain-delete other incoming.
            if (exp.kind !== 'impact') {
                for (var mi = missileIncoming.length - 1; mi >= 0; mi--) {
                    var inc = missileIncoming[mi];
                    var ix = inc.x - exp.x;
                    var iy = inc.y - exp.y;
                    if (Math.sqrt(ix * ix + iy * iy) <= exp.radius) {
                        missileIncoming.splice(mi, 1);
                        missilesIntercepted++;
                        missileScore += MISSILE_POINTS_PER_INTERCEPT;
                        // Credit global score now so partial progress survives a
                        // later loss (AC#7: partial missileScore stays in score
                        // even on loss).
                        score += MISSILE_POINTS_PER_INTERCEPT;
                        // US-013 AC#4: satisfying mid-frequency pop on intercept.
                        if (typeof playMissileInterceptedSound === 'function') playMissileInterceptedSound();
                    }
                }
            }
        }

        // Age destruction debris particles (building/battery impacts). Simple
        // ballistic motion + gravity + life countdown; splice on life <= 0.
        for (var dpi = missileDestructionParticles.length - 1; dpi >= 0; dpi--) {
            var dp = missileDestructionParticles[dpi];
            dp.x += dp.vx * dt;
            dp.y += dp.vy * dt;
            dp.vy += 220 * dt;
            dp.life -= dt;
            if (dp.life <= 0) missileDestructionParticles.splice(dpi, 1);
        }

        // Wave progression: once the current wave has been fully consumed
        // (spawn queue empty AND no live incoming remaining) and more waves are
        // configured for this round, wait MISSILE_WAVE_DELAY seconds of idle
        // time then spawn the next wave. `missileInterWaveTimer` resets on each
        // successful spawn so subsequent waves observe the same gap. Batteries
        // do NOT regenerate ammo between waves (AC#3: ammo is scarce).
        if (missileWaveCurrent > 0 &&
            missileWaveCurrent < missileWaveTotal &&
            missileWaveSpawnQueue.length === 0 &&
            missileIncoming.length === 0) {
            // US-013 AC#5: wave complete chime — play once on the first tick
            // after the wave drains. Detected by `missileInterWaveTimer === 0`
            // BEFORE the increment; spawnMissileWave resets the timer to 0
            // when the next wave fires, so subsequent drains chime again.
            if (missileInterWaveTimer === 0 && typeof playWaveCompleteChime === 'function') {
                playWaveCompleteChime();
            }
            missileInterWaveTimer += dt;
            if (missileInterWaveTimer >= MISSILE_WAVE_DELAY) {
                missileInterWaveTimer = 0;
                spawnMissileWave();
            }
        }

        // Win / lose resolution (AC#5, AC#6). `anyBuildingAlive` drives both:
        // - no buildings AND no batteries → immediate loss (nothing left to do)
        // - all waves drained AND any building alive → win
        // - all waves drained AND no building alive → loss (spec: win requires
        //   a surviving building; otherwise even if batteries remain the city
        //   is lost).
        // Any missileScore already credited to `score` stays (AC#7) because the
        // interception branch above writes directly to `score` on each kill, and
        // `clearMissileState()` only clears the mini-game-local counters.
        var anyBuildingAlive = false;
        for (var bCheck = 0; bCheck < missileBuildings.length; bCheck++) {
            if (!missileBuildings[bCheck].destroyed) { anyBuildingAlive = true; break; }
        }
        var anyBatteryAlive = false;
        for (var gCheck = 0; gCheck < missileBatteries.length; gCheck++) {
            if (!missileBatteries[gCheck].destroyed) { anyBatteryAlive = true; break; }
        }
        var allWavesDrained =
            missileWaveCurrent >= missileWaveTotal &&
            missileWaveSpawnQueue.length === 0 &&
            missileIncoming.length === 0;
        if ((!anyBuildingAlive && !anyBatteryAlive) || (allWavesDrained && !anyBuildingAlive)) {
            // Lost — skip crash, go straight to complete with partial score
            missileBuildingSurvivors = 0;
            missileAmmoBonusPoints = 0;
            missileEndBonus = 0;
            missileCompleteTimer = 0;
            gameState = STATES.MISSILE_COMPLETE;
        } else if (allWavesDrained && anyBuildingAlive) {
            // Award end-of-round bonus (surviving buildings + unused ammo) once,
            // then transition to MISSILE_COMPLETE for the brief results screen.
            var survivors = 0;
            for (var sCheck = 0; sCheck < missileBuildings.length; sCheck++) {
                if (!missileBuildings[sCheck].destroyed) survivors++;
            }
            var remainingAmmo = 0;
            for (var aCheck = 0; aCheck < missileBatteries.length; aCheck++) {
                var batC = missileBatteries[aCheck];
                if (!batC.destroyed) remainingAmmo += batC.ammo;
            }
            missileBuildingSurvivors = survivors;
            missileAmmoBonusPoints = remainingAmmo * MISSILE_AMMO_BONUS_MULTIPLIER;
            missileEndBonus =
                survivors * MISSILE_POINTS_PER_BUILDING_SURVIVING +
                missileAmmoBonusPoints;
            missileScore += missileEndBonus;
            score += missileEndBonus;
            missileCompleteTimer = 0;
            // US-013 AC#5: chime also fires on the FINAL wave drain (the
            // intermediate wave-progression branch above only fires for waves
            // [1, missileWaveTotal-1]; this win branch covers wave N → win).
            if (typeof playWaveCompleteChime === 'function') playWaveCompleteChime();
            gameState = STATES.MISSILE_COMPLETE;
        }
    }

    // Missile complete: brief results window (waves cleared, intercept count,
    // bonus breakdown), then transition to MISSILE_RETURN. Particle/explosion
    // ticks continue so any lingering effects finish visually during the delay.
    if (gameState === STATES.MISSILE_COMPLETE) {
        for (var epi = missileExplosions.length - 1; epi >= 0; epi--) {
            var exC = missileExplosions[epi];
            exC.timer += dt;
            var pC = exC.timer / exC.duration;
            if (pC >= 1) { missileExplosions.splice(epi, 1); continue; }
            var envC = pC < 0.5 ? (pC / 0.5) : (1 - (pC - 0.5) / 0.5);
            exC.radius = exC.maxRadius * envC;
        }
        for (var dpC = missileDestructionParticles.length - 1; dpC >= 0; dpC--) {
            var dpE = missileDestructionParticles[dpC];
            dpE.x += dpE.vx * dt;
            dpE.y += dpE.vy * dt;
            dpE.vy += 220 * dt;
            dpE.life -= dt;
            if (dpE.life <= 0) missileDestructionParticles.splice(dpC, 1);
        }
        missileCompleteTimer += dt;
        if (missileCompleteTimer >= MISSILE_COMPLETE_DELAY) {
            missileReturnRotationTimer = 0;
            gameState = STATES.MISSILE_RETURN;
        }
    }

    // Missile return: rotate ship back from π/2 (facing right) to 0 (facing up)
    // over MISSILE_RETURN_ROTATION_DURATION seconds, then clear mini-game state,
    // advance to the next level, reset ship + wind + terrain, and resume normal
    // flight. Mirrors INVADER_RETURN byte-for-byte (AC#4 "reuse as much of the
    // invader return transition code as possible") swapping the invader-state
    // cleanup for clearMissileState().
    if (gameState === STATES.MISSILE_RETURN) {
        missileReturnRotationTimer += dt;
        var tMR = Math.min(missileReturnRotationTimer / MISSILE_RETURN_ROTATION_DURATION, 1);
        var easedMR = tMR < 0.5 ? 2 * tMR * tMR : 1 - Math.pow(-2 * tMR + 2, 2) / 2;
        ship.angle = (Math.PI / 2) * (1 - easedMR);

        if (tMR >= 1) {
            clearMissileState();
            currentLevel++;
            GRAVITY = getLevelConfig(currentLevel).gravity;
            THRUST_POWER = GRAVITY * 2.5;
            resetShip();
            resetWind();
            generateTerrain();
            sceneCountdownTimer = 0;
            gameState = STATES.SCENE_COUNTDOWN;
        }
    }

    // Feature Drive transition: brief intro window between landing on a
    // feature pad and driving gameplay. Ship is already centered + upright
    // from the SCENE_SCROLL end branch; this block just ticks the timer and
    // advances to DRIVE_PLAYING when it elapses. World setup is deferred to
    // a later story.
    if (gameState === STATES.DRIVE_TRANSITION) {
        driveTransitionTimer += dt;
        if (driveTransitionTimer >= DRIVE_TRANSITION_DURATION) {
            gameState = STATES.DRIVE_PLAYING;
            // US-014 AC#1: kick the continuous engine hum the moment driving
            // starts. updateDriveEngineSound ramps pitch with speed each tick.
            if (typeof startDriveEngineSound === 'function') {
                startDriveEngineSound();
            }
        }
    }

    // Feature Drive gameplay (US-006): buggy physics. Road auto-scrolls at
    // DRIVE_SCROLL_SPEED_BASE; player accelerates (right/D) up to
    // DRIVE_SCROLL_SPEED_MAX, brakes (left/A) down to a floor of 40 px/s.
    // Jump (up/W/space, edge-triggered via drivePrevJumpKey) applies
    // DRIVE_JUMP_VELOCITY and costs DRIVE_JUMP_FUEL_COST; disallowed when
    // airborne or fuel=0. Gravity integrates driveBuggyVY while airborne;
    // landing snaps Y to the segment ground and re-grounds. Wheels spin
    // proportional to speed; cosmetic tilt derives from VY while airborne,
    // clamped to ±10°.
    if (gameState === STATES.DRIVE_PLAYING) {
        var accelKey = !!(keys['ArrowRight'] || keys['d'] || keys['D']);
        var brakeKey = !!(keys['ArrowLeft'] || keys['a'] || keys['A']);
        var jumpKey = !!(keys['ArrowUp'] || keys['w'] || keys['W'] ||
                         keys[' '] || keys['Space']);

        // US-010: detect current segment type at frame start (pre-scroll)
        // for slow/boost zone effects. Boost is edge-triggered: entering a
        // 'boost' segment kicks driveSpeed by +DRIVE_BOOST_FACTOR and starts
        // a DRIVE_BOOST_DURATION timer. Slow is positional: while OVER a
        // 'slow' segment, max speed caps at MAX*(1-DRIVE_SLOW_FACTOR) and
        // the buggy decelerates toward that cap if currently faster. Latest
        // zone wins — entering 'slow' cancels any active boost.
        var preDriveSegmentWidth = 20;
        var preBuggyScreenX = canvas.width * 0.25;
        var preBuggyWorldX = driveScrollX + preBuggyScreenX;
        var preSegIdx = Math.floor(preBuggyWorldX / preDriveSegmentWidth);
        if (preSegIdx < 0) preSegIdx = 0;
        if (preSegIdx > driveRoadSegments.length - 1) preSegIdx = driveRoadSegments.length - 1;
        var currSegType = driveRoadSegments.length > 0
            ? driveRoadSegments[preSegIdx].type
            : null;

        if (currSegType === 'boost' && drivePrevSegType !== 'boost') {
            driveSpeed *= (1 + DRIVE_BOOST_FACTOR);
            driveBoostTimer = DRIVE_BOOST_DURATION;
            if (typeof playDriveBoostSound === 'function') {
                playDriveBoostSound();
            }
        }
        if (currSegType === 'slow' && drivePrevSegType !== 'slow') {
            driveBoostTimer = 0;
        }
        drivePrevSegType = currSegType;

        if (driveBoostTimer > 0) {
            driveBoostTimer -= dt;
            if (driveBoostTimer < 0) driveBoostTimer = 0;
        }

        // Effective max for this tick. Boost overrides slow.
        var driveEffectiveMax = DRIVE_SCROLL_SPEED_MAX;
        if (driveBoostTimer > 0) {
            driveEffectiveMax = DRIVE_SCROLL_SPEED_MAX * (1 + DRIVE_BOOST_FACTOR);
        } else if (currSegType === 'slow') {
            driveEffectiveMax = DRIVE_SCROLL_SPEED_MAX * (1 - DRIVE_SLOW_FACTOR);
        }

        // Relax target — hold boosted speed during boost; in a slow zone,
        // relax target is capped at the effective max so the buggy doesn't
        // creep above its slow cap when no input is given.
        var driveRelaxTarget;
        if (driveBoostTimer > 0) {
            driveRelaxTarget = DRIVE_SCROLL_SPEED_BASE * (1 + DRIVE_BOOST_FACTOR);
        } else if (currSegType === 'slow') {
            driveRelaxTarget = Math.min(DRIVE_SCROLL_SPEED_BASE, driveEffectiveMax);
        } else {
            driveRelaxTarget = DRIVE_SCROLL_SPEED_BASE;
        }

        if (accelKey) {
            driveSpeed += DRIVE_ACCELERATION * dt;
        } else if (brakeKey) {
            driveSpeed -= DRIVE_BRAKE_DECEL * dt;
        } else {
            if (driveSpeed < driveRelaxTarget) {
                driveSpeed = Math.min(
                    driveRelaxTarget,
                    driveSpeed + DRIVE_ACCELERATION * dt
                );
            } else if (driveSpeed > driveRelaxTarget) {
                driveSpeed = Math.max(
                    driveRelaxTarget,
                    driveSpeed - DRIVE_BRAKE_DECEL * dt
                );
            }
        }
        // US-010: smooth decel toward the effective cap if currently faster
        // (covers entering a slow zone above its cap, or boost expiring with
        // residual speed above MAX). One-frame brake step keeps the
        // transition perceptible rather than instant.
        if (driveSpeed > driveEffectiveMax) {
            driveSpeed = Math.max(
                driveEffectiveMax,
                driveSpeed - DRIVE_BRAKE_DECEL * dt
            );
        }
        if (driveSpeed < 40) driveSpeed = 40;

        // Edge-triggered jump: fire only on rising edge so holding the key
        // doesn't repeat-jump the instant we land.
        if (jumpKey && !drivePrevJumpKey && driveGrounded && ship.fuel > 0) {
            driveBuggyVY = DRIVE_JUMP_VELOCITY;
            driveGrounded = false;
            ship.fuel -= DRIVE_JUMP_FUEL_COST;
            if (ship.fuel < 0) ship.fuel = 0;
            // US-014 AC#2: jump whoosh.
            if (typeof playDriveJumpSound === 'function') {
                playDriveJumpSound();
            }
        }
        drivePrevJumpKey = jumpKey;

        driveScrollX += driveSpeed * dt;

        var driveSegmentWidth = 20;
        var buggyScreenX = canvas.width * 0.25;
        var buggyWorldX = driveScrollX + buggyScreenX;
        var segIdx = Math.floor(buggyWorldX / driveSegmentWidth);
        if (segIdx < 0) segIdx = 0;
        if (segIdx > driveRoadSegments.length - 1) segIdx = driveRoadSegments.length - 1;
        var groundY = driveRoadSegments.length > 0
            ? driveRoadSegments[segIdx].y
            : driveBuggyY;

        // US-007: commit to a gap fall once the buggy is over a gap segment
        // and at/below the gap's edge Y. `driveFalling` persists so scroll
        // carrying the buggy past the gap can't re-ground it — the buggy
        // plummets straight off the bottom of the canvas.
        var overGap = driveRoadSegments.length > 0 &&
                      driveRoadSegments[segIdx].type === 'gap';
        if (overGap && !driveFalling && driveBuggyY + DRIVE_WHEEL_OFFSET_Y >= groundY) {
            driveFalling = true;
            driveGrounded = false;
            // US-014 AC#7: descending tone as the buggy commits to the fall.
            // Fired once at commit (not per frame) — the oscillator sweep
            // spans the typical canvas-exit window.
            if (typeof playDriveGapFallSound === 'function') {
                playDriveGapFallSound();
            }
        }

        if (driveFalling) {
            driveBuggyVY += DRIVE_GRAVITY * dt;
            driveBuggyY += driveBuggyVY * dt;
        } else if (driveGrounded) {
            driveBuggyY = groundY - DRIVE_WHEEL_OFFSET_Y;
            driveBuggyVY = 0;
        } else {
            driveBuggyVY += DRIVE_GRAVITY * dt;
            driveBuggyY += driveBuggyVY * dt;
            if (driveBuggyY + DRIVE_WHEEL_OFFSET_Y >= groundY && driveBuggyVY >= 0) {
                driveBuggyY = groundY - DRIVE_WHEEL_OFFSET_Y;
                driveBuggyVY = 0;
                driveGrounded = true;
                // US-014 AC#3: soft thud on landing after a jump.
                if (typeof playDriveLandingSound === 'function') {
                    playDriveLandingSound();
                }
            }
        }

        driveWheelRotation += driveSpeed * dt;

        if (driveGrounded) {
            driveBuggyTilt = 0;
        } else {
            var MAX_DRIVE_TILT = 10 * Math.PI / 180;
            var tiltRaw = (driveBuggyVY / Math.abs(DRIVE_JUMP_VELOCITY)) * MAX_DRIVE_TILT;
            if (tiltRaw > MAX_DRIVE_TILT) tiltRaw = MAX_DRIVE_TILT;
            if (tiltRaw < -MAX_DRIVE_TILT) tiltRaw = -MAX_DRIVE_TILT;
            driveBuggyTilt = tiltRaw;
        }

        driveDistance = driveScrollX;

        // US-013 visual FX: dust, jump-arc trail, and slow-parallax starfield.
        // Dust puffs behind the buggy while grounded — probabilistic rate
        // scales with speed so a faster buggy kicks up a denser trail. Use
        // screen-space coordinates (they live in the driveParticles array
        // which is ticked below and drawn in screen space).
        if (driveGrounded && !driveFalling && driveSpeed > 0) {
            var dustProb = driveSpeed / 500;
            if (Math.random() < dustProb) {
                var dustScreenX = buggyScreenX - DRIVE_WHEEL_OFFSET_X - 4;
                var dustScreenY = driveBuggyY + DRIVE_WHEEL_OFFSET_Y - 2;
                spawnDriveDustPuff(dustScreenX, dustScreenY);
            }
            if (Math.random() < dustProb) {
                var dustScreenX2 = buggyScreenX + DRIVE_WHEEL_OFFSET_X + 4;
                var dustScreenY2 = driveBuggyY + DRIVE_WHEEL_OFFSET_Y - 2;
                spawnDriveDustPuff(dustScreenX2, dustScreenY2);
            }
        }

        // Jump-arc trail — store recent airborne {scrollX, y} so the renderer
        // can project them back to screen space (the buggy's screen X is
        // fixed; as scroll advances, trail dots drift leftward behind it).
        // Clear the trail when grounded so landing doesn't leave a stale arc.
        if (!driveGrounded && !driveFalling) {
            driveAirborneTrail.push({ scrollX: driveScrollX, y: driveBuggyY });
            if (driveAirborneTrail.length > 20) {
                driveAirborneTrail.shift();
            }
        } else if (driveGrounded && driveAirborneTrail.length > 0) {
            driveAirborneTrail = [];
        }

        // Starfield parallax offset — accumulates at 10% of the scroll rate so
        // stars drift leftward much slower than terrain, selling depth.
        driveStarParallaxOffset += driveSpeed * 0.1 * dt;

        // US-014 AC#1: engine hum pitch scales with speed each tick.
        if (typeof updateDriveEngineSound === 'function') {
            updateDriveEngineSound(driveSpeed);
        }

        // US-008: Rock collision. Only checks when grounded — airborne buggy
        // clears rocks. On hit: spawn spark burst + screen shake + play clang,
        // deduct DRIVE_ROCK_FUEL_COST from fuel (clamped at 0), destroy the
        // rock (splice). Hitting a rock at fuel 0 is a no-op penalty — the
        // buggy continues driving, and fuel-zero already gates jump above so
        // the player coasts to the finish or the next gap.
        if (driveGrounded && !driveFalling) {
            var buggyHalfW = SHIP_SIZE / 2;
            var buggyTop = driveBuggyY - SHIP_SIZE / 2;
            var buggyBottom = driveBuggyY + DRIVE_WHEEL_OFFSET_Y;
            for (var rIdx = driveObstacles.length - 1; rIdx >= 0; rIdx--) {
                var rk = driveObstacles[rIdx];
                if (rk.type !== 'rock') continue;
                var rockLeft = rk.x - rk.size / 2;
                var rockRight = rk.x + rk.size / 2;
                var rockTop = rk.y - rk.size;
                var rockBottom = rk.y;
                var buggyLeft = buggyWorldX - buggyHalfW;
                var buggyRight = buggyWorldX + buggyHalfW;
                if (buggyRight < rockLeft || buggyLeft > rockRight) continue;
                if (buggyBottom < rockTop || buggyTop > rockBottom) continue;
                driveObstacles.splice(rIdx, 1);
                ship.fuel -= DRIVE_ROCK_FUEL_COST;
                if (ship.fuel < 0) ship.fuel = 0;
                spawnDriveSparkBurst(buggyScreenX, rk.y - rk.size / 2);
                startScreenShake();
                if (typeof playDriveRockHitSound === 'function') {
                    playDriveRockHitSound();
                }
            }
        }

        // US-009: Pickup collection. Ground-level + elevated pickups sit at
        // pu.y (center) with pu.size as the sprite bound. A pickup is collected
        // when the buggy's AABB (SHIP_SIZE wide × SHIP_SIZE/2 above + wheel
        // offset below the center) overlaps the pickup's AABB — whether the
        // buggy is grounded OR airborne (elevated pickups need a jump). Reverse
        // iterate + splice so multiple same-frame overlaps are safe. Each
        // collection awards DRIVE_PICKUP_POINTS to driveScore and global score,
        // restores DRIVE_PICKUP_FUEL_RESTORE (capped at FUEL_MAX), increments
        // drivePickupsCollected, spawns a sparkle burst at the pickup's screen
        // position, and plays a pleasant chime.
        var pickupBuggyHalfW = SHIP_SIZE / 2;
        var pickupBuggyTop = driveBuggyY - SHIP_SIZE / 2;
        var pickupBuggyBottom = driveBuggyY + DRIVE_WHEEL_OFFSET_Y;
        var pickupBuggyLeft = buggyWorldX - pickupBuggyHalfW;
        var pickupBuggyRight = buggyWorldX + pickupBuggyHalfW;
        for (var puIdx = drivePickups.length - 1; puIdx >= 0; puIdx--) {
            var pup = drivePickups[puIdx];
            if (pup.collected) continue;
            var puLeft = pup.x - pup.size / 2;
            var puRight = pup.x + pup.size / 2;
            var puTop = pup.y - pup.size / 2;
            var puBottom = pup.y + pup.size / 2;
            if (pickupBuggyRight < puLeft || pickupBuggyLeft > puRight) continue;
            if (pickupBuggyBottom < puTop || pickupBuggyTop > puBottom) continue;
            pup.collected = true;
            drivePickups.splice(puIdx, 1);
            driveScore += DRIVE_PICKUP_POINTS;
            score += DRIVE_PICKUP_POINTS;
            ship.fuel = Math.min(ship.fuel + DRIVE_PICKUP_FUEL_RESTORE, FUEL_MAX + FUEL_EXTENSION_MAX);
            drivePickupsCollected++;
            var puScreenX = pup.x - driveScrollX;
            spawnDrivePickupSparkle(puScreenX, pup.y);
            if (typeof playDrivePickupSound === 'function') {
                playDrivePickupSound();
            }
        }

        // US-008: tick spark particles. Simple drift + fade; light gravity so
        // sparks arc downward like debris. Splice when life reaches 0.
        for (var spi = driveParticles.length - 1; spi >= 0; spi--) {
            var sp = driveParticles[spi];
            sp.x += sp.vx * dt;
            sp.y += sp.vy * dt;
            sp.vy += 160 * dt;
            sp.life -= dt;
            if (sp.life <= 0) driveParticles.splice(spi, 1);
        }

        // US-007: once the buggy has dropped fully below the canvas bottom,
        // spawn the crash FX and route through the shared CRASHED flow.
        // Partial score already banked into global `score` (via pickups /
        // other drive rewards) stays put — we don't subtract anything here.
        if (driveFalling && driveBuggyY > canvas.height) {
            spawnExplosion(buggyScreenX, canvas.height - 10);
            startScreenShake();
            stopThrustSound();
            // US-014 AC#1: kill the continuous engine hum on crash so it
            // doesn't bleed into the CRASHED/GAMEOVER screens.
            if (typeof stopDriveEngineSound === 'function') {
                stopDriveEngineSound();
            }
            playExplosionSound();
            clearDriveState();
            driveCompleteTimer = 0;
            driveCompleteTotalBonus = 0;
            driveCompleteFuelBonus = 0;
            gameState = STATES.DRIVE_COMPLETE;
        }

        // US-011: destination arrival. Trigger the moment the buggy's world-X
        // reaches driveRoadLength. Award completion bonus + fuel bonus (points
        // per remaining fuel unit) into driveScore and global score. Fire the
        // shared celebration particle system, stop the thrust loop, play the
        // victory jingle, and flip to DRIVE_COMPLETE. The buggy's deceleration
        // and wheel retract animation run in the DRIVE_COMPLETE handler.
        if (!driveFalling && gameState === STATES.DRIVE_PLAYING &&
            driveScrollX + buggyScreenX >= driveRoadLength) {
            var driveFuelBonus = Math.floor(ship.fuel) * DRIVE_POINTS_FUEL_BONUS_MULTIPLIER;
            var driveTotalBonus = DRIVE_POINTS_COMPLETION + driveFuelBonus;
            driveScore += driveTotalBonus;
            score += driveTotalBonus;
            driveCompleteFuelBonus = driveFuelBonus;
            driveCompleteTotalBonus = driveTotalBonus;
            driveCompleteTimer = 0;
            stopThrustSound();
            // US-014 AC#1: stop the engine hum on arrival — the buggy is
            // coasting to rest on the destination pad.
            if (typeof stopDriveEngineSound === 'function') {
                stopDriveEngineSound();
            }
            spawnCelebration(buggyScreenX, driveBuggyY - SHIP_SIZE * 0.3);
            if (typeof playDriveCompleteSound === 'function') {
                playDriveCompleteSound();
            }
            gameState = STATES.DRIVE_COMPLETE;
        }
    }

    // Feature Drive complete (US-011): hold the results screen for
    // DRIVE_COMPLETE_DELAY seconds. Buggy decelerates to a stop at
    // DRIVE_BRAKE_DECEL; scroll continues advancing during that decel so the
    // buggy visually slides to rest on the destination pad. Wheel retract
    // animation is purely a render concern driven by driveCompleteTimer.
    // Celebration sparkles + spark particles continue ticking so they finish
    // out visually. DRIVE_RETURN routing is deferred to US-012.
    if (gameState === STATES.DRIVE_COMPLETE) {
        if (driveSpeed > 0) {
            driveSpeed -= DRIVE_BRAKE_DECEL * dt;
            if (driveSpeed < 0) driveSpeed = 0;
        }
        driveScrollX += driveSpeed * dt;
        driveWheelRotation += driveSpeed * dt;

        // Spark particles from rock hits / pickup sparkles — finish out.
        for (var dcPi = driveParticles.length - 1; dcPi >= 0; dcPi--) {
            var dcPp = driveParticles[dcPi];
            dcPp.x += dcPp.vx * dt;
            dcPp.y += dcPp.vy * dt;
            dcPp.vy += 160 * dt;
            dcPp.life -= dt;
            if (dcPp.life <= 0) driveParticles.splice(dcPi, 1);
        }
        updateCelebration(dt);
        driveCompleteTimer += dt;
        if (driveCompleteTimer >= DRIVE_COMPLETE_DELAY) {
            gameState = STATES.DRIVE_RETURN;
        }
    }

    // Feature Drive return (US-012): clear all per-round drive state, advance
    // the level, reset the ship (full fuel, upright, centered) + wind +
    // terrain, then resume normal flight. Mirrors BUGFIX_RETURN / TECHDEBT_RETURN
    // tail shape — the DRIVE_COMPLETE handler already finished the wheel-retract
    // animation and the buggy slide-to-rest, so no animation runs here.
    if (gameState === STATES.DRIVE_RETURN) {
        clearDriveState();
        currentLevel++;
        GRAVITY = getLevelConfig(currentLevel).gravity;
        THRUST_POWER = GRAVITY * 2.5;
        resetShip();
        resetWind();
        generateTerrain();
        sceneCountdownTimer = 0;
        gameState = STATES.SCENE_COUNTDOWN;
    }

    // Tech debt transition: brief intro window between landing and asteroid
    // gameplay. Ship is already centered + upright from the SCENE_SCROLL end
    // branch and the asteroid field was seeded there via setupTechdebtWorld(),
    // so all this block does is tick the timer and advance to TECHDEBT_PLAYING
    // when it elapses. The terrain fade-out + "TECH DEBT INCOMING..." flash
    // are purely render concerns (see renderTechdebtTransition in render.js).
    if (gameState === STATES.TECHDEBT_TRANSITION) {
        techdebtTransitionTimer += dt;
        if (techdebtTransitionTimer >= TECHDEBT_TRANSITION_DURATION) {
            gameState = STATES.TECHDEBT_PLAYING;
        }
    }

    // Code Breaker transition (US-004): M ship flips 180° over
    // BREAKOUT_PADDLE_FLIP_DURATION with ease-in-out and slides down to
    // BREAKOUT_PADDLE_Y_OFFSET from the canvas bottom (centered horizontally).
    // Bricks cascade in row-by-row (handled by renderer via per-brick revealAt).
    // The ball rides on top of the paddle, stationary, throughout the flip.
    // When the timer reaches BREAKOUT_TRANSITION_DURATION we hand off to
    // BREAKOUT_PLAYING. setupBreakoutWorld() ran at entry so arrays/counters
    // are already reset.
    if (gameState === STATES.BREAKOUT_TRANSITION) {
        breakoutTransitionTimer += dt;

        var flipT = Math.min(1, breakoutTransitionTimer / BREAKOUT_PADDLE_FLIP_DURATION);
        // easeInOutCubic — smooth start and end of the flip
        var eased = flipT < 0.5
            ? 4 * flipT * flipT * flipT
            : 1 - Math.pow(-2 * flipT + 2, 3) / 2;
        ship.angle = 0;

        // paddle top = canvas.height - Y_OFFSET; ship.y is the center of the
        // M, so lift by halfH so the flipped M's top edge lands at Y_OFFSET.
        var startY = canvas.height / 2;
        var targetY = canvas.height - BREAKOUT_PADDLE_Y_OFFSET - SHIP_SIZE / 2;
        ship.x = canvas.width / 2;
        ship.y = startY + eased * (targetY - startY);

        // Paddle hitbox (consumed by later stories) stays centered under the M.
        breakoutPaddleX = ship.x - breakoutPaddleWidth / 2;
        // Ball sits stationary on top of the paddle and rides along during flip.
        breakoutBallX = ship.x;
        breakoutBallY = ship.y - SHIP_SIZE / 2 - BREAKOUT_BALL_RADIUS;
        breakoutBallVX = 0;
        breakoutBallVY = 0;

        if (breakoutTransitionTimer >= BREAKOUT_TRANSITION_DURATION) {
            gameState = STATES.BREAKOUT_PLAYING;
        }
    }

    // Code Breaker playing (US-005 paddle movement): Left/A and Right/D move
    // the paddle at BREAKOUT_PADDLE_SPEED px/s, clamped to canvas bounds. No
    // fuel, no gravity, no vertical motion — the paddle only slides along its
    // fixed Y. While `breakoutBallStuck` is true the ball rides on top of the
    // paddle; Up/W/Space launches it straight up at the level-scaled speed.
    // Brick collisions and ball bouncing are future stories.
    if (gameState === STATES.BREAKOUT_PLAYING) {
        var paddleLeft = !!(keys['ArrowLeft'] || keys['a'] || keys['A']);
        var paddleRight = !!(keys['ArrowRight'] || keys['d'] || keys['D']);
        var paddleUp = !!(keys['ArrowUp'] || keys['w'] || keys['W']);
        var paddleDown = !!(keys['ArrowDown'] || keys['s'] || keys['S']);
        if (paddleLeft) {
            breakoutPaddleX -= BREAKOUT_PADDLE_SPEED * dt;
        }
        if (paddleRight) {
            breakoutPaddleX += BREAKOUT_PADDLE_SPEED * dt;
        }
        if (breakoutPaddleX < 0) {
            breakoutPaddleX = 0;
        }
        if (breakoutPaddleX + breakoutPaddleWidth > canvas.width) {
            breakoutPaddleX = canvas.width - breakoutPaddleWidth;
        }

        // Vertical paddle movement — limited range near bottom of screen
        var paddleMinY = canvas.height * 0.65;
        var paddleMaxY = canvas.height - BREAKOUT_PADDLE_Y_OFFSET - SHIP_SIZE / 2;
        if (!breakoutPaddleYPos) breakoutPaddleYPos = paddleMaxY;
        if (paddleUp) {
            breakoutPaddleYPos -= BREAKOUT_PADDLE_SPEED * 0.6 * dt;
        }
        if (paddleDown) {
            breakoutPaddleYPos += BREAKOUT_PADDLE_SPEED * 0.6 * dt;
        }
        if (breakoutPaddleYPos < paddleMinY) breakoutPaddleYPos = paddleMinY;
        if (breakoutPaddleYPos > paddleMaxY) breakoutPaddleYPos = paddleMaxY;

        // Show rotation thrusters when moving left/right
        ship.rotating = paddleLeft ? 'left' : paddleRight ? 'right' : null;
        ship.thrusting = paddleUp;
        ship.retroThrusting = paddleDown;

        // Keep the flipped M sprite aligned with the paddle hitbox.
        ship.x = breakoutPaddleX + breakoutPaddleWidth / 2;
        ship.y = breakoutPaddleYPos;
        ship.angle = 0;

        if (breakoutBallStuck) {
            breakoutBallX = ship.x;
            breakoutBallY = ship.y - SHIP_SIZE / 2 - BREAKOUT_BALL_RADIUS;
            breakoutBallVX = 0;
            breakoutBallVY = 0;
            var wantsLaunch = !!(keys[' '] || keys['Space']);
            if (wantsLaunch) {
                var launchSpeed = Math.min(
                    BREAKOUT_BALL_SPEED_MAX,
                    BREAKOUT_BALL_SPEED_BASE + currentLevel * BREAKOUT_BALL_SPEED_PER_LEVEL
                );
                // Random angle in [60°, 120°] from horizontal — mostly up with ±30° spread.
                var launchAngle = Math.PI / 3 + Math.random() * (Math.PI / 3);
                breakoutBallVX = launchSpeed * Math.cos(launchAngle);
                breakoutBallVY = -launchSpeed * Math.sin(launchAngle);
                breakoutBallStuck = false;
            }
        } else {
            // US-008: power-up update runs FIRST so pills spawned by this
            // frame's brick destruction stay at their brick-centre spawn point
            // for one tick (matches existing tests and feels right visually).
            var paddleTopPu = ship.y - SHIP_SIZE / 2;
            var paddleBottomPu = ship.y + SHIP_SIZE / 2;
            for (var puIdx = breakoutPowerups.length - 1; puIdx >= 0; puIdx--) {
                var pu = breakoutPowerups[puIdx];
                pu.y += pu.vy * dt;
                var puLeft = pu.x - pu.size / 2;
                var puRight = pu.x + pu.size / 2;
                var puTop = pu.y - pu.size / 2;
                var puBottom = pu.y + pu.size / 2;
                if (puTop > canvas.height) {
                    breakoutPowerups.splice(puIdx, 1);
                    continue;
                }
                if (puBottom >= paddleTopPu && puTop <= paddleBottomPu &&
                    puRight >= breakoutPaddleX &&
                    puLeft <= breakoutPaddleX + breakoutPaddleWidth) {
                    activateBreakoutPowerup(pu.type);
                    breakoutPowerups.splice(puIdx, 1);
                }
            }

            // Tick down the active timed power-up; revert when zero.
            if (breakoutActivePowerup !== null && breakoutPowerupTimer > 0) {
                breakoutPowerupTimer -= dt;
                if (breakoutPowerupTimer <= 0) {
                    breakoutPowerupTimer = 0;
                    if (breakoutActivePowerup === 'wide') {
                        breakoutPaddleWidth = BREAKOUT_PADDLE_WIDTH;
                        if (breakoutPaddleX + breakoutPaddleWidth > canvas.width) {
                            breakoutPaddleX = canvas.width - breakoutPaddleWidth;
                        }
                    }
                    if (breakoutActivePowerup === 'shoot') {
                        breakoutShootBullets = [];
                    }
                    breakoutActivePowerup = null;
                }
            }

            // Shoot power-up: Space fires bullets upward from ship
            if (breakoutActivePowerup === 'shoot') {
                breakoutShootTimer -= dt;
                if (breakoutShootTimer < 0) breakoutShootTimer = 0;
                var wantsShoot = !!(keys[' '] || keys['Space']);
                if (wantsShoot && breakoutShootTimer <= 0) {
                    breakoutShootBullets.push({
                        x: ship.x - 8,
                        y: ship.y - SHIP_SIZE / 2,
                        vy: -BREAKOUT_SHOOT_SPEED
                    });
                    breakoutShootBullets.push({
                        x: ship.x + 8,
                        y: ship.y - SHIP_SIZE / 2,
                        vy: -BREAKOUT_SHOOT_SPEED
                    });
                    breakoutShootTimer = BREAKOUT_SHOOT_COOLDOWN;
                    if (typeof playShootSound === 'function') playShootSound();
                }
            }
            // Update and collide shoot bullets vs bricks
            for (var sbIdx = breakoutShootBullets.length - 1; sbIdx >= 0; sbIdx--) {
                var sb = breakoutShootBullets[sbIdx];
                sb.y += sb.vy * dt;
                if (sb.y < 0) {
                    breakoutShootBullets.splice(sbIdx, 1);
                    continue;
                }
                for (var sbi = 0; sbi < breakoutBricks.length; sbi++) {
                    var sbrick = breakoutBricks[sbi];
                    if (sb.x >= sbrick.x && sb.x <= sbrick.x + sbrick.w &&
                        sb.y >= sbrick.y && sb.y <= sbrick.y + sbrick.h) {
                        sbrick.hp -= 1;
                        if (sbrick.hp <= 0) {
                            var sbPts = BREAKOUT_POINTS_PER_BRICK + BREAKOUT_POINTS_BONUS_HP * sbrick.maxHp;
                            breakoutScore += sbPts;
                            score += sbPts;
                            breakoutBricksDestroyed += 1;
                            spawnBreakoutBrickParticles(sbrick.x + sbrick.w / 2, sbrick.y + sbrick.h / 2, sbrick.color);
                            if (typeof playBreakoutBrickDestroySound === 'function') playBreakoutBrickDestroySound();
                            breakoutBricks.splice(sbi, 1);
                        } else {
                            sbrick.color = sbrick.hp === 3 ? BREAKOUT_BRICK_COLOR_HP3
                                         : sbrick.hp === 2 ? BREAKOUT_BRICK_COLOR_HP2
                                         : BREAKOUT_BRICK_COLOR_HP1;
                            sbrick.flashTimer = 0.12;
                        }
                        breakoutShootBullets.splice(sbIdx, 1);
                        break;
                    }
                }
            }

            // Integrate ball motion.
            breakoutBallX += breakoutBallVX * dt;
            breakoutBallY += breakoutBallVY * dt;

            // US-012: record the ball's recent positions for the render trail.
            // FIFO — newest at index 0, trim to BREAKOUT_BALL_TRAIL_LEN entries.
            breakoutBallTrail.unshift({ x: breakoutBallX, y: breakoutBallY });
            if (breakoutBallTrail.length > BREAKOUT_BALL_TRAIL_LEN) {
                breakoutBallTrail.length = BREAKOUT_BALL_TRAIL_LEN;
            }

            // Left / right / top wall reflections.
            var pbWallBounced = false;
            if (breakoutBallX - BREAKOUT_BALL_RADIUS < 0) {
                breakoutBallX = BREAKOUT_BALL_RADIUS;
                breakoutBallVX = -breakoutBallVX;
                pbWallBounced = true;
            } else if (breakoutBallX + BREAKOUT_BALL_RADIUS > canvas.width) {
                breakoutBallX = canvas.width - BREAKOUT_BALL_RADIUS;
                breakoutBallVX = -breakoutBallVX;
                pbWallBounced = true;
            }
            if (breakoutBallY - BREAKOUT_BALL_RADIUS < 0) {
                breakoutBallY = BREAKOUT_BALL_RADIUS;
                breakoutBallVY = -breakoutBallVY;
                pbWallBounced = true;
            }
            if (pbWallBounced && typeof playBreakoutWallBounceSound === 'function') {
                playBreakoutWallBounceSound();
            }

            // Paddle collision — reflect + directional control via hit position.
            // Bounce angle follows the standard Breakout formula:
            //   hitPosNorm in [-1, 1]; vX = hitPosNorm * speed * sin(maxAngle);
            //   vY = -sqrt(speed² - vX²) so magnitude is preserved.
            var paddleTop = ship.y - SHIP_SIZE / 2;
            var paddleBottom = ship.y + SHIP_SIZE / 2;
            if (breakoutBallVY > 0 &&
                breakoutBallY + BREAKOUT_BALL_RADIUS >= paddleTop &&
                breakoutBallY - BREAKOUT_BALL_RADIUS <= paddleBottom &&
                breakoutBallX >= breakoutPaddleX &&
                breakoutBallX <= breakoutPaddleX + breakoutPaddleWidth) {
                var ballSpeed = Math.sqrt(
                    breakoutBallVX * breakoutBallVX + breakoutBallVY * breakoutBallVY
                );
                var paddleCenterX = breakoutPaddleX + breakoutPaddleWidth / 2;
                var hitPosNorm = (breakoutBallX - paddleCenterX) / (breakoutPaddleWidth / 2);
                if (hitPosNorm > 1) hitPosNorm = 1;
                if (hitPosNorm < -1) hitPosNorm = -1;
                var maxAngleComponent = ballSpeed * Math.sin(BREAKOUT_PADDLE_MAX_BOUNCE_ANGLE);
                breakoutBallVX = hitPosNorm * maxAngleComponent;
                breakoutBallVY = -Math.sqrt(
                    Math.max(0, ballSpeed * ballSpeed - breakoutBallVX * breakoutBallVX)
                );
                breakoutBallY = paddleTop - BREAKOUT_BALL_RADIUS;
                if (typeof playBreakoutPaddleBounceSound === 'function') {
                    playBreakoutPaddleBounceSound();
                }
            }

            // Brick collisions (US-007): AABB ball-vs-brick, first-hit only.
            // Face resolved by smaller axis overlap; direction gate prevents a
            // second flip on the next tick if the ball is already travelling
            // away (mirrors the paddle-collision pattern from US-006).
            // US-008: when Fireball is active the ball passes through — no
            // reflection, bricks die in one hit, loop keeps scanning so a
            // single frame can destroy multiple adjacent bricks.
            var fireActive = (breakoutActivePowerup === 'fire');
            var ballLeft = breakoutBallX - BREAKOUT_BALL_RADIUS;
            var ballRight = breakoutBallX + BREAKOUT_BALL_RADIUS;
            var ballTop = breakoutBallY - BREAKOUT_BALL_RADIUS;
            var ballBottom = breakoutBallY + BREAKOUT_BALL_RADIUS;
            for (var bi = 0; bi < breakoutBricks.length; bi++) {
                var brick = breakoutBricks[bi];
                if (brick.revealAt > breakoutTransitionTimer) continue;
                var bLeft = brick.x;
                var bRight = brick.x + brick.w;
                var bTop = brick.y;
                var bBottom = brick.y + brick.h;
                if (ballRight < bLeft || ballLeft > bRight ||
                    ballBottom < bTop || ballTop > bBottom) continue;

                if (!fireActive) {
                    var overlapX = Math.min(ballRight, bRight) - Math.max(ballLeft, bLeft);
                    var overlapY = Math.min(ballBottom, bBottom) - Math.max(ballTop, bTop);
                    if (overlapX < overlapY) {
                        // Hit a left/right face — reflect VX.
                        if (breakoutBallX < (bLeft + bRight) / 2) {
                            if (breakoutBallVX > 0) breakoutBallVX = -breakoutBallVX;
                            breakoutBallX = bLeft - BREAKOUT_BALL_RADIUS;
                        } else {
                            if (breakoutBallVX < 0) breakoutBallVX = -breakoutBallVX;
                            breakoutBallX = bRight + BREAKOUT_BALL_RADIUS;
                        }
                    } else {
                        // Hit a top/bottom face — reflect VY.
                        if (breakoutBallY < (bTop + bBottom) / 2) {
                            if (breakoutBallVY > 0) breakoutBallVY = -breakoutBallVY;
                            breakoutBallY = bTop - BREAKOUT_BALL_RADIUS;
                        } else {
                            if (breakoutBallVY < 0) breakoutBallVY = -breakoutBallVY;
                            breakoutBallY = bBottom + BREAKOUT_BALL_RADIUS;
                        }
                    }
                    brick.hp -= 1;
                } else {
                    // Fireball: instant kill regardless of HP; no reflection.
                    brick.hp = 0;
                }

                if (brick.hp <= 0) {
                    var awarded = BREAKOUT_POINTS_PER_BRICK +
                                  BREAKOUT_POINTS_BONUS_HP * brick.maxHp;
                    breakoutScore += awarded;
                    score += awarded;
                    breakoutBricksDestroyed += 1;
                    spawnBreakoutBrickParticles(
                        brick.x + brick.w / 2,
                        brick.y + brick.h / 2,
                        brick.color
                    );
                    if (typeof playBreakoutBrickDestroySound === 'function') {
                        playBreakoutBrickDestroySound();
                    }
                    if (Math.random() < BREAKOUT_POWERUP_CHANCE) {
                        var puDef = BREAKOUT_POWERUP_TYPES[
                            Math.floor(Math.random() * BREAKOUT_POWERUP_TYPES.length)
                        ];
                        breakoutPowerups.push({
                            x: brick.x + brick.w / 2,
                            y: brick.y + brick.h / 2,
                            vy: BREAKOUT_POWERUP_FALL_SPEED,
                            size: BREAKOUT_POWERUP_SIZE,
                            type: puDef.type,
                            letter: puDef.letter,
                            label: puDef.label,
                            color: puDef.color
                        });
                    }
                    breakoutBricks.splice(bi, 1);
                    bi--; // array shifted left; re-check this index

                    // Ball speed ramps per brick destroyed (capped).
                    var curSpeed = Math.sqrt(
                        breakoutBallVX * breakoutBallVX +
                        breakoutBallVY * breakoutBallVY
                    );
                    if (curSpeed > 0) {
                        var newSpeed = Math.min(
                            BREAKOUT_BALL_SPEED_MAX,
                            curSpeed + BREAKOUT_BALL_SPEED_INCREMENT
                        );
                        var scale = newSpeed / curSpeed;
                        breakoutBallVX *= scale;
                        breakoutBallVY *= scale;
                    }
                } else {
                    brick.color = brick.hp === 3 ? BREAKOUT_BRICK_COLOR_HP3
                                : brick.hp === 2 ? BREAKOUT_BRICK_COLOR_HP2
                                : BREAKOUT_BRICK_COLOR_HP1;
                    brick.flashTimer = 0.12;
                    if (typeof playBreakoutBrickHitSound === 'function') {
                        playBreakoutBrickHitSound();
                    }
                }

                // Only one brick per collision event for normal play.
                // Fireball passes through — keep scanning adjacent bricks.
                if (!fireActive) break;
            }

            // Decay brick flash timers (set on damaged hits above).
            for (var fi = 0; fi < breakoutBricks.length; fi++) {
                if (breakoutBricks[fi].flashTimer > 0) {
                    breakoutBricks[fi].flashTimer -= dt;
                    if (breakoutBricks[fi].flashTimer < 0) {
                        breakoutBricks[fi].flashTimer = 0;
                    }
                }
            }

            // Update brick-burst particles: drift, fade, expire.
            for (var bpIdx = breakoutParticles.length - 1; bpIdx >= 0; bpIdx--) {
                var bp = breakoutParticles[bpIdx];
                bp.x += bp.vx * dt;
                bp.y += bp.vy * dt;
                bp.life -= dt;
                if (bp.life <= 0) breakoutParticles.splice(bpIdx, 1);
            }

            // US-008: physics for additional balls spawned by Multi-Ball. Each
            // extra ball behaves identically to the primary one — walls,
            // paddle, bricks — but lives in `breakoutBalls` so lifecycle
            // (spawn / lose) is independent of the primary.
            var paddleTopXb = canvas.height - BREAKOUT_PADDLE_Y_OFFSET;
            var paddleBottomXb = paddleTopXb + BREAKOUT_PADDLE_HEIGHT;
            for (var ebIdx = breakoutBalls.length - 1; ebIdx >= 0; ebIdx--) {
                var eb = breakoutBalls[ebIdx];
                eb.x += eb.vx * dt;
                eb.y += eb.vy * dt;
                // US-012: trail for each extra ball (same render treatment as
                // the primary). Initialise lazily since Multi-Ball spawns
                // extras without the trail field.
                if (!eb.trail) eb.trail = [];
                eb.trail.unshift({ x: eb.x, y: eb.y });
                if (eb.trail.length > BREAKOUT_BALL_TRAIL_LEN) {
                    eb.trail.length = BREAKOUT_BALL_TRAIL_LEN;
                }
                var ebWallBounced = false;
                if (eb.x - BREAKOUT_BALL_RADIUS < 0) {
                    eb.x = BREAKOUT_BALL_RADIUS;
                    eb.vx = -eb.vx;
                    ebWallBounced = true;
                } else if (eb.x + BREAKOUT_BALL_RADIUS > canvas.width) {
                    eb.x = canvas.width - BREAKOUT_BALL_RADIUS;
                    eb.vx = -eb.vx;
                    ebWallBounced = true;
                }
                if (eb.y - BREAKOUT_BALL_RADIUS < 0) {
                    eb.y = BREAKOUT_BALL_RADIUS;
                    eb.vy = -eb.vy;
                    ebWallBounced = true;
                }
                if (ebWallBounced && typeof playBreakoutWallBounceSound === 'function') {
                    playBreakoutWallBounceSound();
                }
                // Paddle bounce — same formula as primary ball.
                if (eb.vy > 0 &&
                    eb.y + BREAKOUT_BALL_RADIUS >= paddleTopXb &&
                    eb.y - BREAKOUT_BALL_RADIUS <= paddleBottomXb &&
                    eb.x >= breakoutPaddleX &&
                    eb.x <= breakoutPaddleX + breakoutPaddleWidth) {
                    var ebSpeed = Math.sqrt(eb.vx * eb.vx + eb.vy * eb.vy);
                    var ebPaddleCenter = breakoutPaddleX + breakoutPaddleWidth / 2;
                    var ebHitNorm = (eb.x - ebPaddleCenter) / (breakoutPaddleWidth / 2);
                    if (ebHitNorm > 1) ebHitNorm = 1;
                    if (ebHitNorm < -1) ebHitNorm = -1;
                    var ebMaxComp = ebSpeed * Math.sin(BREAKOUT_PADDLE_MAX_BOUNCE_ANGLE);
                    eb.vx = ebHitNorm * ebMaxComp;
                    eb.vy = -Math.sqrt(Math.max(0, ebSpeed * ebSpeed - eb.vx * eb.vx));
                    eb.y = paddleTopXb - BREAKOUT_BALL_RADIUS;
                    if (typeof playBreakoutPaddleBounceSound === 'function') {
                        playBreakoutPaddleBounceSound();
                    }
                }
                // Brick collision — same face-detection + destroy pipeline as
                // the primary ball, honoring the active Fireball power-up.
                var ebFire = (breakoutActivePowerup === 'fire');
                var ebL = eb.x - BREAKOUT_BALL_RADIUS;
                var ebR = eb.x + BREAKOUT_BALL_RADIUS;
                var ebT = eb.y - BREAKOUT_BALL_RADIUS;
                var ebB = eb.y + BREAKOUT_BALL_RADIUS;
                for (var ebbi = 0; ebbi < breakoutBricks.length; ebbi++) {
                    var ebBrick = breakoutBricks[ebbi];
                    if (ebBrick.revealAt > breakoutTransitionTimer) continue;
                    var ebbL = ebBrick.x;
                    var ebbR = ebBrick.x + ebBrick.w;
                    var ebbT = ebBrick.y;
                    var ebbB = ebBrick.y + ebBrick.h;
                    if (ebR < ebbL || ebL > ebbR || ebB < ebbT || ebT > ebbB) continue;
                    if (!ebFire) {
                        var ebOX = Math.min(ebR, ebbR) - Math.max(ebL, ebbL);
                        var ebOY = Math.min(ebB, ebbB) - Math.max(ebT, ebbT);
                        if (ebOX < ebOY) {
                            if (eb.x < (ebbL + ebbR) / 2) {
                                if (eb.vx > 0) eb.vx = -eb.vx;
                                eb.x = ebbL - BREAKOUT_BALL_RADIUS;
                            } else {
                                if (eb.vx < 0) eb.vx = -eb.vx;
                                eb.x = ebbR + BREAKOUT_BALL_RADIUS;
                            }
                        } else {
                            if (eb.y < (ebbT + ebbB) / 2) {
                                if (eb.vy > 0) eb.vy = -eb.vy;
                                eb.y = ebbT - BREAKOUT_BALL_RADIUS;
                            } else {
                                if (eb.vy < 0) eb.vy = -eb.vy;
                                eb.y = ebbB + BREAKOUT_BALL_RADIUS;
                            }
                        }
                        ebBrick.hp -= 1;
                    } else {
                        ebBrick.hp = 0;
                    }
                    if (ebBrick.hp <= 0) {
                        var ebAwarded = BREAKOUT_POINTS_PER_BRICK +
                                        BREAKOUT_POINTS_BONUS_HP * ebBrick.maxHp;
                        breakoutScore += ebAwarded;
                        score += ebAwarded;
                        breakoutBricksDestroyed += 1;
                        spawnBreakoutBrickParticles(
                            ebBrick.x + ebBrick.w / 2,
                            ebBrick.y + ebBrick.h / 2,
                            ebBrick.color
                        );
                        if (typeof playBreakoutBrickDestroySound === 'function') {
                            playBreakoutBrickDestroySound();
                        }
                        if (Math.random() < BREAKOUT_POWERUP_CHANCE) {
                            var ebPuDef = BREAKOUT_POWERUP_TYPES[
                                Math.floor(Math.random() * BREAKOUT_POWERUP_TYPES.length)
                            ];
                            breakoutPowerups.push({
                                x: ebBrick.x + ebBrick.w / 2,
                                y: ebBrick.y + ebBrick.h / 2,
                                vy: BREAKOUT_POWERUP_FALL_SPEED,
                                size: BREAKOUT_POWERUP_SIZE,
                                type: ebPuDef.type,
                                letter: ebPuDef.letter,
                                label: ebPuDef.label,
                                color: ebPuDef.color
                            });
                        }
                        breakoutBricks.splice(ebbi, 1);
                        ebbi--;
                        var ebCurSpeed = Math.sqrt(eb.vx * eb.vx + eb.vy * eb.vy);
                        if (ebCurSpeed > 0) {
                            var ebNewSpeed = Math.min(
                                BREAKOUT_BALL_SPEED_MAX,
                                ebCurSpeed + BREAKOUT_BALL_SPEED_INCREMENT
                            );
                            var ebScale = ebNewSpeed / ebCurSpeed;
                            eb.vx *= ebScale;
                            eb.vy *= ebScale;
                        }
                    } else {
                        ebBrick.color = ebBrick.hp === 3 ? BREAKOUT_BRICK_COLOR_HP3
                                      : ebBrick.hp === 2 ? BREAKOUT_BRICK_COLOR_HP2
                                      : BREAKOUT_BRICK_COLOR_HP1;
                        ebBrick.flashTimer = 0.12;
                        if (typeof playBreakoutBrickHitSound === 'function') {
                            playBreakoutBrickHitSound();
                        }
                    }
                    if (!ebFire) break;
                }
                // Bottom-out: drop this extra ball from the array. Primary-ball
                // loss + lives handling belongs to US-009.
                if (eb.y - BREAKOUT_BALL_RADIUS > canvas.height) {
                    // US-012: downward particle shower marks the lost ball.
                    spawnBreakoutBallLossParticles(eb.x, canvas.height);
                    breakoutBalls.splice(ebIdx, 1);
                }
            }

            // US-009: Ball loss detection. Each ball (primary + every Multi-Ball
            // extra) is independent — losing one does not end the round. Only
            // when the last ball on screen exits the bottom do we trigger the
            // ball-loss check. Extras that bottomed out this frame have already
            // been spliced out of `breakoutBalls` by the loop above, so if the
            // primary also bottoms out here and the array is empty, no balls
            // remain on screen.
            if (breakoutBallY - BREAKOUT_BALL_RADIUS > canvas.height) {
                // US-012: downward particle shower at the point the ball fell
                // off-screen — fires for every bottom-out, whether another
                // ball is promoted to primary or the round ends.
                spawnBreakoutBallLossParticles(breakoutBallX, canvas.height);
                if (breakoutBalls.length > 0) {
                    // A multi-ball is still on screen — promote it to primary so
                    // physics continues on a live ball and the round stays alive.
                    var promoted = breakoutBalls.shift();
                    breakoutBallX = promoted.x;
                    breakoutBallY = promoted.y;
                    breakoutBallVX = promoted.vx;
                    breakoutBallVY = promoted.vy;
                    breakoutBallTrail = [];
                } else {
                    breakoutBallTrail = [];
                    loseBreakoutBall();
                }
            }

            // US-010: Win condition. When every brick spawned this round has
            // been destroyed, enter BREAKOUT_COMPLETE, award the completion
            // bonus plus per-extra-ball bonus, and fire celebration particles.
            // Guard on BREAKOUT_PLAYING so loseBreakoutBall()'s CRASHED route
            // above cannot double-enter this branch in the same tick.
            if (gameState === STATES.BREAKOUT_PLAYING &&
                breakoutBricksTotal > 0 &&
                breakoutBricksDestroyed >= breakoutBricksTotal) {
                breakoutCompletionBonus = BREAKOUT_POINTS_COMPLETION;
                breakoutExtraBallBonus =
                    BREAKOUT_POINTS_BALLS_REMAINING * breakoutExtraBalls;
                var totalBonus = breakoutCompletionBonus + breakoutExtraBallBonus;
                breakoutScore += totalBonus;
                score += totalBonus;
                breakoutCompleteTimer = 0;
                gameState = STATES.BREAKOUT_COMPLETE;
                stopThrustSound();
                spawnCelebration(
                    breakoutPaddleX + breakoutPaddleWidth / 2,
                    canvas.height - BREAKOUT_PADDLE_Y_OFFSET - SHIP_SIZE / 2
                );
                if (typeof playBreakoutVictorySound === 'function') {
                    playBreakoutVictorySound();
                }
            }
        }

        // Loss-path cleanup (US-011 AC#4): if the ball-loss / no-extras branch
        // above flipped us to CRASHED this tick, wipe all breakout state so
        // the CRASHED → GAMEOVER → new-run flow doesn't render stale bricks /
        // balls / power-ups / particles from the dead round. Mirrors the
        // equivalent BUGFIX_PLAYING guard at the tail of that block.
        if (gameState === STATES.CRASHED) {
            clearBreakoutState();
        }
    }

    // Code Breaker complete (US-010): hold the results screen for
    // BREAKOUT_COMPLETE_DELAY seconds. Keep brick-burst particles + the
    // shared celebration sparkles ticking so they finish out visually.
    // Advance to BREAKOUT_RETURN once the delay elapses; the rotation timer
    // is zeroed here so the flip animation starts from t=0 (US-011).
    if (gameState === STATES.BREAKOUT_COMPLETE) {
        for (var bcPIdx = breakoutParticles.length - 1; bcPIdx >= 0; bcPIdx--) {
            var bcPar = breakoutParticles[bcPIdx];
            bcPar.x += bcPar.vx * dt;
            bcPar.y += bcPar.vy * dt;
            bcPar.life -= dt;
            if (bcPar.life <= 0) breakoutParticles.splice(bcPIdx, 1);
        }
        updateCelebration(dt);
        breakoutCompleteTimer += dt;
        if (breakoutCompleteTimer >= BREAKOUT_COMPLETE_DELAY) {
            breakoutReturnRotationTimer = 0;
            gameState = STATES.BREAKOUT_RETURN;
        }
    }

    // Code Breaker return (US-011): reverse the 180° paddle flip from
    // BREAKOUT_TRANSITION over BREAKOUT_PADDLE_FLIP_DURATION (0.5s) with the
    // same easeInOutCubic curve, then clear all breakout state, advance the
    // level, reset the ship (full fuel) + wind + terrain, and resume normal
    // flight. Mirrors INVADER_RETURN / MISSILE_RETURN's animation-then-reset
    // shape, but uses the breakout flip duration instead.
    if (gameState === STATES.BREAKOUT_RETURN) {
        breakoutReturnRotationTimer += dt;
        var tBR = Math.min(breakoutReturnRotationTimer / BREAKOUT_PADDLE_FLIP_DURATION, 1);
        // easeInOutCubic — same curve used on the way in for visual symmetry
        var easedBR = tBR < 0.5
            ? 4 * tBR * tBR * tBR
            : 1 - Math.pow(-2 * tBR + 2, 3) / 2;
        // Rotate back from π (upside-down paddle) to 0 (upright nose-up ship)
        ship.angle = 0;

        if (tBR >= 1) {
            clearBreakoutState();
            currentLevel++;
            GRAVITY = getLevelConfig(currentLevel).gravity;
            THRUST_POWER = GRAVITY * 2.5;
            resetShip();
            resetWind();
            generateTerrain();
            sceneCountdownTimer = 0;
            gameState = STATES.SCENE_COUNTDOWN;
        }
    }

    // Tech debt playing: Asteroids-style ship physics (US-005).
    // - Left/Right (or A/D) rotate using the existing ROTATION_SPEED.
    // - Up (or W) applies thrust in the ship's facing direction; thrust
    //   consumes fuel at FUEL_BURN_RATE. When fuel hits 0 thrust is disabled
    //   but the player can still rotate (and shoot, in a later story).
    // - Zero-G: no gravity, no wind. Only drag (TECHDEBT_SHIP_DRAG, per-frame
    //   multiplier) decelerates the ship; max speed is clamped to
    //   TECHDEBT_SHIP_MAX_SPEED.
    // - Ship wraps around all four screen edges.
    if (gameState === STATES.TECHDEBT_PLAYING) {
        var rotatingLeft = !!(keys['ArrowLeft'] || keys['a'] || keys['A']);
        var rotatingRight = !!(keys['ArrowRight'] || keys['d'] || keys['D']);
        if (rotatingLeft) {
            ship.angle -= ship.rotationSpeed * dt;
        }
        if (rotatingRight) {
            ship.angle += ship.rotationSpeed * dt;
        }
        ship.rotating = rotatingLeft ? 'left' : rotatingRight ? 'right' : null;

        var wantsThrust = !!(keys['ArrowUp'] || keys['w'] || keys['W']);
        var wantsRetro = !!(keys['ArrowDown'] || keys['s'] || keys['S']);
        ship.thrusting = wantsThrust;
        ship.retroThrusting = wantsRetro;
        if (ship.thrusting) {
            var accel = THRUST_POWER * PIXELS_PER_METER * dt;
            ship.vx += Math.sin(ship.angle) * accel;
            ship.vy += -Math.cos(ship.angle) * accel;
            startThrustSound();
        } else if (ship.retroThrusting) {
            var retroAccel = THRUST_POWER * PIXELS_PER_METER * dt * 0.8;
            ship.vx -= Math.sin(ship.angle) * retroAccel;
            ship.vy -= -Math.cos(ship.angle) * retroAccel;
            startThrustSound();
        } else {
            ship.retroThrusting = false;
            stopThrustSound();
        }

        // Per-frame drag — keeps the ship controllable without killing momentum.
        ship.vx *= TECHDEBT_SHIP_DRAG;
        ship.vy *= TECHDEBT_SHIP_DRAG;

        // Clamp velocity magnitude to TECHDEBT_SHIP_MAX_SPEED.
        var speedSq = ship.vx * ship.vx + ship.vy * ship.vy;
        var maxSq = TECHDEBT_SHIP_MAX_SPEED * TECHDEBT_SHIP_MAX_SPEED;
        if (speedSq > maxSq) {
            var scale = TECHDEBT_SHIP_MAX_SPEED / Math.sqrt(speedSq);
            ship.vx *= scale;
            ship.vy *= scale;
        }

        ship.x += ship.vx * dt;
        ship.y += ship.vy * dt;

        // Toroidal wrap on all four edges.
        if (ship.x < 0) ship.x += canvas.width;
        else if (ship.x >= canvas.width) ship.x -= canvas.width;
        if (ship.y < 0) ship.y += canvas.height;
        else if (ship.y >= canvas.height) ship.y -= canvas.height;

        // --- Bullet firing (Space key) ---
        // Cooldown gates rapid fire. Nose offset mirrors drawShip's nose
        // geometry: at angle=0 the nose points up (-Y), so shift by
        // (sin(angle), -cos(angle)) * SHIP_SIZE * 0.6.
        techdebtBulletCooldownTimer -= dt;
        if (techdebtBulletCooldownTimer < 0) techdebtBulletCooldownTimer = 0;
        var wantsFire = !!(keys[' '] || keys['Space']);
        if (wantsFire && techdebtBulletCooldownTimer <= 0) {
            var noseDx = Math.sin(ship.angle);
            var noseDy = -Math.cos(ship.angle);
            techdebtBullets.push({
                x: ship.x + noseDx * SHIP_SIZE * 0.6,
                y: ship.y + noseDy * SHIP_SIZE * 0.6,
                vx: noseDx * TECHDEBT_BULLET_SPEED,
                vy: noseDy * TECHDEBT_BULLET_SPEED,
                age: 0
            });
            techdebtBulletCooldownTimer = TECHDEBT_BULLET_COOLDOWN;
            playTechdebtShootSound();
        }

        // --- Update bullets: advance, expire, wrap ---
        for (var bi = techdebtBullets.length - 1; bi >= 0; bi--) {
            var b = techdebtBullets[bi];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.age += dt;
            if (b.age >= TECHDEBT_BULLET_LIFETIME) {
                techdebtBullets.splice(bi, 1);
                continue;
            }
            if (b.x < 0) b.x += canvas.width;
            else if (b.x >= canvas.width) b.x -= canvas.width;
            if (b.y < 0) b.y += canvas.height;
            else if (b.y >= canvas.height) b.y -= canvas.height;
        }

        // --- Update asteroids: drift at constant velocity, rotate, wrap ---
        // No acceleration, no drag — vx/vy set at spawn never change here.
        // Same toroidal wrap semantics as ship/bullets (>= so x === width wraps to 0).
        for (var ai = 0; ai < techdebtAsteroids.length; ai++) {
            var a = techdebtAsteroids[ai];
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            a.rotation += a.rotationSpeed * dt;
            if (a.x < 0) a.x += canvas.width;
            else if (a.x >= canvas.width) a.x -= canvas.width;
            if (a.y < 0) a.y += canvas.height;
            else if (a.y >= canvas.height) a.y -= canvas.height;
        }

        // --- Bullet vs asteroid collision (US-008 + US-012) ---
        // Circle-vs-point check: bullet is a point, asteroid is a circle of
        // radius `a.size`. On hit:
        //   - Normal: award score + asteroidsDestroyed, spawn a brown particle
        //     burst, split the asteroid by tier (large→2 medium, medium→2
        //     small, small→destroyed), and consume the bullet.
        //   - ProxiBlue: award PROXIBLUE_POINTS, activate shield (or reset its
        //     timer to full if already active — AC#7), spawn a blue particle
        //     burst at collection point, play the activation chime, remove the
        //     asteroid WITHOUT splitting, consume the bullet. ProxiBlue does
        //     NOT increment asteroidsDestroyed — it's collected, not cleared.
        for (var bIdx = techdebtBullets.length - 1; bIdx >= 0; bIdx--) {
            var bul = techdebtBullets[bIdx];
            for (var aIdx = techdebtAsteroids.length - 1; aIdx >= 0; aIdx--) {
                var ast = techdebtAsteroids[aIdx];
                var ddx = bul.x - ast.x;
                var ddy = bul.y - ast.y;
                if (ddx * ddx + ddy * ddy <= ast.size * ast.size) {
                    if (ast.isProxiblue) {
                        techdebtScore += PROXIBLUE_POINTS;
                        score += PROXIBLUE_POINTS;
                        proxiblueShieldActive = true;
                        proxiblueShieldTimer = PROXIBLUE_SHIELD_DURATION;
                        spawnTechdebtAsteroidParticles(ast.x, ast.y, '#4488ff');
                        playProxiblueCollectSound();
                        techdebtAsteroids.splice(aIdx, 1);
                        techdebtBullets.splice(bIdx, 1);
                        break;
                    }
                    var pts;
                    if (ast.sizeTier === 'large') pts = TECHDEBT_POINTS_LARGE;
                    else if (ast.sizeTier === 'medium') pts = TECHDEBT_POINTS_MEDIUM;
                    else pts = TECHDEBT_POINTS_SMALL;
                    techdebtScore += pts;
                    score += pts;
                    asteroidsDestroyed++;
                    spawnTechdebtAsteroidParticles(ast.x, ast.y, '#888');
                    // Spawn hidden alien if asteroid contained one
                    if (ast.hasAlien) {
                        var escAngle = Math.random() * Math.PI * 2;
                        techdebtAliens.push({
                            x: ast.x,
                            y: ast.y,
                            vx: Math.cos(escAngle) * TECHDEBT_ALIEN_SPEED,
                            vy: Math.sin(escAngle) * TECHDEBT_ALIEN_SPEED,
                            shootTimer: TECHDEBT_ALIEN_SHOOT_INTERVAL * 0.5,
                            life: TECHDEBT_ALIEN_LIFETIME
                        });
                    }
                    techdebtAsteroids.splice(aIdx, 1);
                    splitTechdebtAsteroid(ast);
                    techdebtBullets.splice(bIdx, 1);
                    break; // one bullet, one asteroid
                }
            }
        }

        // --- Ship vs asteroid collision (US-009 + US-012) ---
        // Circle-circle: ship radius TECHDEBT_SHIP_RADIUS vs asteroid radius a.size.
        //   - Normal asteroid, shielded: absorb hit, destroy (no split) and
        //     award tier points, then drop the shield + play a blue flash.
        //   - Normal asteroid, unshielded: route through the shared CRASHED flow.
        //   - ProxiBlue asteroid, unshielded: still crashes the ship (US-012
        //     AC#6 — "you must shoot it, not ram it").
        //   - ProxiBlue asteroid, shielded: pass through untouched — the
        //     player still has to shoot it to collect. Preserves the power-up
        //     so the shield isn't wasted ramming it.
        for (var shipAIdx = techdebtAsteroids.length - 1; shipAIdx >= 0; shipAIdx--) {
            var shipAst = techdebtAsteroids[shipAIdx];
            var sdx = ship.x - shipAst.x;
            var sdy = ship.y - shipAst.y;
            var combined = TECHDEBT_SHIP_RADIUS + shipAst.size;
            if (sdx * sdx + sdy * sdy <= combined * combined) {
                if (shipAst.isProxiblue) {
                    if (proxiblueShieldActive) {
                        // Shield up: pass through, do not collect or consume.
                        continue;
                    }
                    crashShipInTechdebt('ProxiBlue collision');
                    break;
                }
                if (proxiblueShieldActive) {
                    var shieldPts;
                    if (shipAst.sizeTier === 'large') shieldPts = TECHDEBT_POINTS_LARGE;
                    else if (shipAst.sizeTier === 'medium') shieldPts = TECHDEBT_POINTS_MEDIUM;
                    else shieldPts = TECHDEBT_POINTS_SMALL;
                    techdebtScore += shieldPts;
                    score += shieldPts;
                    asteroidsDestroyed++;
                    spawnTechdebtAsteroidParticles(shipAst.x, shipAst.y, PROXIBLUE_COLOR);
                    techdebtAsteroids.splice(shipAIdx, 1);
                    proxiblueShieldActive = false;
                    proxiblueShieldTimer = 0;
                    proxiblueShieldFlashTimer = PROXIBLUE_SHIELD_FLASH_DURATION;
                    break; // shield is consumed — no more hits this frame
                } else {
                    crashShipInTechdebt('Tech debt asteroid collision');
                    break; // ship is dead — stop processing further asteroids
                }
            }
        }

        // --- Update particles: drift, fade, expire ---
        for (var pIdx = techdebtParticles.length - 1; pIdx >= 0; pIdx--) {
            var par = techdebtParticles[pIdx];
            par.x += par.vx * dt;
            par.y += par.vy * dt;
            par.life -= dt;
            if (par.life <= 0) techdebtParticles.splice(pIdx, 1);
        }

        // --- Shield timer decay (US-012) ---
        // Active shield counts down every frame. When the timer hits 0 the
        // shield expires naturally (distinct from the US-009 absorb path,
        // which consumes the shield on an asteroid hit).
        if (proxiblueShieldActive) {
            proxiblueShieldTimer -= dt;
            if (proxiblueShieldTimer <= 0) {
                proxiblueShieldTimer = 0;
                proxiblueShieldActive = false;
                playProxiblueShieldDeactivateSound();
            }
        }

        // --- Shield flash decay ---
        if (proxiblueShieldFlashTimer > 0) {
            proxiblueShieldFlashTimer -= dt;
            if (proxiblueShieldFlashTimer < 0) proxiblueShieldFlashTimer = 0;
        }

        // --- Hidden alien update ---
        for (var alIdx = techdebtAliens.length - 1; alIdx >= 0; alIdx--) {
            var alien = techdebtAliens[alIdx];
            alien.x += alien.vx * dt;
            alien.y += alien.vy * dt;
            alien.life -= dt;
            alien.shootTimer -= dt;
            // Wrap around screen edges
            if (alien.x < 0) alien.x += canvas.width;
            else if (alien.x >= canvas.width) alien.x -= canvas.width;
            if (alien.y < 0) alien.y += canvas.height;
            else if (alien.y >= canvas.height) alien.y -= canvas.height;
            // Shoot at player
            if (alien.shootTimer <= 0) {
                alien.shootTimer = TECHDEBT_ALIEN_SHOOT_INTERVAL;
                var adx = ship.x - alien.x;
                var ady = ship.y - alien.y;
                var adist = Math.sqrt(adx * adx + ady * ady) || 1;
                techdebtAlienBullets.push({
                    x: alien.x,
                    y: alien.y,
                    vx: (adx / adist) * TECHDEBT_ALIEN_BULLET_SPEED,
                    vy: (ady / adist) * TECHDEBT_ALIEN_BULLET_SPEED,
                    life: 4
                });
            }
            // Remove if lifetime expired
            if (alien.life <= 0) {
                techdebtAliens.splice(alIdx, 1);
                continue;
            }
            // Check if player bullet hits alien
            for (var abIdx = techdebtBullets.length - 1; abIdx >= 0; abIdx--) {
                var ab = techdebtBullets[abIdx];
                var abdx = ab.x - alien.x;
                var abdy = ab.y - alien.y;
                if (abdx * abdx + abdy * abdy <= TECHDEBT_ALIEN_SIZE * TECHDEBT_ALIEN_SIZE) {
                    techdebtScore += TECHDEBT_ALIEN_POINTS;
                    score += TECHDEBT_ALIEN_POINTS;
                    spawnTechdebtAsteroidParticles(alien.x, alien.y, '#4CAF50');
                    if (typeof playAlienDestroySound === 'function') playAlienDestroySound();
                    techdebtAliens.splice(alIdx, 1);
                    techdebtBullets.splice(abIdx, 1);
                    break;
                }
            }
        }
        // --- Alien bullet update ---
        for (var abIdx2 = techdebtAlienBullets.length - 1; abIdx2 >= 0; abIdx2--) {
            var aBullet = techdebtAlienBullets[abIdx2];
            aBullet.x += aBullet.vx * dt;
            aBullet.y += aBullet.vy * dt;
            aBullet.life -= dt;
            if (aBullet.life <= 0) {
                techdebtAlienBullets.splice(abIdx2, 1);
                continue;
            }
            // Hit player check
            var ahdx = aBullet.x - ship.x;
            var ahdy = aBullet.y - ship.y;
            if (ahdx * ahdx + ahdy * ahdy <= TECHDEBT_SHIP_RADIUS * TECHDEBT_SHIP_RADIUS) {
                if (proxiblueShieldActive) {
                    proxiblueShieldActive = false;
                    proxiblueShieldTimer = 0;
                    proxiblueShieldFlashTimer = PROXIBLUE_SHIELD_FLASH_DURATION;
                } else {
                    crashShipInTechdebt('Hit by alien fire');
                }
                techdebtAlienBullets.splice(abIdx2, 1);
            }
        }

        // --- Win condition ---
        // All asteroids AND aliens must be cleared
        if (gameState === STATES.TECHDEBT_PLAYING && techdebtAsteroids.length === 0 && techdebtAliens.length === 0) {
            gameState = STATES.TECHDEBT_COMPLETE;
            techdebtCompleteTimer = 0;
            var fuelBonus = Math.round((ship.fuel / FUEL_MAX) * 200);
            techdebtFuelBonus = fuelBonus;
            techdebtScore += fuelBonus;
            score += fuelBonus;
            stopThrustSound();
            spawnCelebration(ship.x, ship.y - SHIP_SIZE * 0.3);
        }

        // Loss-path cleanup (US-011 AC#4): if the ship-vs-asteroid collision
        // above routed us to CRASHED this tick, clear mini-game entities so
        // the crash/gameover screens don't render stale asteroids/bullets/
        // particles from the dead round. Mirrors BUGFIX_PLAYING's tail cleanup.
        if (gameState === STATES.CRASHED) {
            clearTechdebtState();
        }
    }

    // Tech debt complete: brief results window (asteroids destroyed, fuel bonus),
    // then transition to TECHDEBT_RETURN. Particles + celebration tick so the
    // last flashes of the round finish visually during the delay.
    if (gameState === STATES.TECHDEBT_COMPLETE) {
        for (var tcPIdx = techdebtParticles.length - 1; tcPIdx >= 0; tcPIdx--) {
            var tcPar = techdebtParticles[tcPIdx];
            tcPar.x += tcPar.vx * dt;
            tcPar.y += tcPar.vy * dt;
            tcPar.life -= dt;
            if (tcPar.life <= 0) techdebtParticles.splice(tcPIdx, 1);
        }
        updateCelebration(dt);
        techdebtCompleteTimer += dt;
        if (techdebtCompleteTimer >= TECHDEBT_COMPLETE_DELAY) {
            gameState = STATES.TECHDEBT_RETURN;
        }
    }

    // Tech debt return: clear mini-game state, advance to next level, reset
    // ship + wind + terrain, then resume normal flight. Mirrors BUGFIX_RETURN's
    // tail (no rotation animation — techdebt entry kept the ship upright).
    if (gameState === STATES.TECHDEBT_RETURN) {
        clearTechdebtState();
        currentLevel++;
        GRAVITY = getLevelConfig(currentLevel).gravity;
        THRUST_POWER = GRAVITY * 2.5;
        resetShip();
        resetWind();
        generateTerrain();
        sceneCountdownTimer = 0;
        gameState = STATES.SCENE_COUNTDOWN;
    }

    if (gameState === STATES.PLAYING) {
        // Ship rotation
        var rotatingLeft = !!(keys['ArrowLeft'] || keys['a'] || keys['A']);
        var rotatingRight = !!(keys['ArrowRight'] || keys['d'] || keys['D']);
        if (rotatingLeft) {
            ship.angle -= ship.rotationSpeed * dt;
        }
        if (rotatingRight) {
            ship.angle += ship.rotationSpeed * dt;
        }
        // Track rotation direction for rendering (left takes priority if both pressed)
        ship.rotating = rotatingLeft ? 'left' : rotatingRight ? 'right' : null;

        // Wind — update gusts and apply horizontal force
        if (wind.maxStrength > 0) {
            wind.gustTimer -= dt;
            if (wind.gustTimer <= 0) {
                // Pick a new random target wind strength and direction
                wind.targetStrength = (Math.random() * 2 - 1) * wind.maxStrength;
                wind.gustTimer = 6 + Math.random() * 10;
            }
            // Slowly lerp toward target for gradual wind shifts
            wind.strength += (wind.targetStrength - wind.strength) * dt * 0.5;
            // Apply wind as horizontal acceleration
            ship.vx += wind.strength * PIXELS_PER_METER * dt;
        }

        // Gravity — accelerates downward (positive Y is down in canvas)
        ship.vy += GRAVITY * PIXELS_PER_METER * dt;

        // Thrust — applied in the direction the ship is facing (nose = -Y when angle=0)
        // Only main thrust consumes fuel; rotation jets are cosmetic and free.
        var wantsThrust = !!(keys['ArrowUp'] || keys['w'] || keys['W']);
        ship.thrusting = wantsThrust && ship.fuel > 0;
        if (ship.thrusting) {
            // Fuel consumed ONLY by main thrust — rotation jets (ship.rotating) never touch fuel
            ship.fuel -= FUEL_BURN_RATE * dt;
            if (ship.fuel < 0) ship.fuel = 0;
            ship.vx += Math.sin(ship.angle) * THRUST_POWER * PIXELS_PER_METER * dt;
            ship.vy += -Math.cos(ship.angle) * THRUST_POWER * PIXELS_PER_METER * dt;
            startThrustSound();
        } else {
            stopThrustSound();
        }

        // Update position
        ship.x += ship.vx * dt;
        ship.y += ship.vy * dt;

        // Clamp left/right edges — ship cannot leave the viewport
        if (ship.x < 0) {
            ship.x = 0;
            ship.vx = 0;
        } else if (ship.x > canvas.width) {
            ship.x = canvas.width;
            ship.vx = 0;
        }

        // Check for terrain collision
        checkCollision();
    }
}
