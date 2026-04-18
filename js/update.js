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
                snapOldPads.push({ index: p.index, width: p.width, points: p.points, prType: p.prType, prNumber: p.prNumber, prTitle: p.prTitle, prHash: p.prHash, prAuthor: p.prAuthor, prMergedDate: p.prMergedDate });
            }

            var snapNewTerrain;
            var snapNewPads;

            if (securityPadScroll) {
                // Security pad: generate flat invader-style terrain (no level advance)
                var flatY = canvas.height * TERRAIN_FLAT_Y_RATIO;
                snapNewTerrain = [];
                for (var i = 0; i < terrain.length; i++) {
                    snapNewTerrain.push({ x: terrain[i].x, y: flatY });
                }
                snapNewPads = []; // No landing pads on invader terrain
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
                    snapNewPads.push({ index: p.index, width: p.width, points: p.points, prType: p.prType, prNumber: p.prNumber, prTitle: p.prTitle, prHash: p.prHash, prAuthor: p.prAuthor, prMergedDate: p.prMergedDate });
                }
            }
            // Atomically set scroll state as a frozen object (ship.x preserved for smooth transition)
            sceneScrollState = createSceneScrollState(snapOldTerrain, snapOldPads, snapNewTerrain, snapNewPads, securityPadScroll, bugfixPadScroll, ship.x);
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
        // Invader path: stay at canvas.height/2 (INVADER_SCROLL_ROTATE expects center)
        var scrollCenterY = canvas.height / 2;
        if (!sceneScrollState.isInvaderScroll) {
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
            terrain = [];
            for (var i = 0; i < newT.length; i++) {
                terrain.push({ x: newT[i].x, y: newT[i].y });
            }
            landingPads = [];
            for (var i = 0; i < newP.length; i++) {
                var p = newP[i];
                landingPads.push({ index: p.index, width: p.width, points: p.points, prType: p.prType, prNumber: p.prNumber, prTitle: p.prTitle, prHash: p.prHash, prAuthor: p.prAuthor, prMergedDate: p.prMergedDate });
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
                ship.thrusting = false;
                ship.rotating = null;
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
                ship.fuel = FUEL_MAX;
                bugfixTransitionTimer = 0;
                spawnBugWave();
                gameState = STATES.BUGFIX_TRANSITION;
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
                // Fuel carries over from previous level — do NOT reset
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
            gameState = STATES.INVADER_PLAYING;
        }
    }

    // Invader playing: move aliens, handle bullets, detect collisions
    if (gameState === STATES.INVADER_PLAYING) {
        // --- Ship 4-directional movement (direct, no physics) ---
        var flatY = canvas.height * TERRAIN_FLAT_Y_RATIO;
        var movingUp = !!(keys['ArrowUp'] || keys['w'] || keys['W']);
        var movingDown = !!(keys['ArrowDown'] || keys['s'] || keys['S']);
        var movingLeft = !!(keys['ArrowLeft'] || keys['a'] || keys['A']);
        var movingRight = !!(keys['ArrowRight'] || keys['d'] || keys['D']);
        if (movingUp) {
            ship.y -= INVADER_MOVE_SPEED * dt;
        }
        if (movingDown) {
            ship.y += INVADER_MOVE_SPEED * dt;
        }
        if (movingLeft) {
            ship.x -= INVADER_MOVE_SPEED * dt;
        }
        if (movingRight) {
            ship.x += INVADER_MOVE_SPEED * dt;
        }
        // Clamp to canvas bounds
        if (ship.y < 80) ship.y = 80;
        if (ship.y > flatY - 40) ship.y = flatY - 40;
        if (ship.x < SHIP_SIZE) ship.x = SHIP_SIZE;
        if (ship.x > canvas.width - SHIP_SIZE) ship.x = canvas.width - SHIP_SIZE;

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

        // --- Update alien explosion particles ---
        updateAlienExplosions(dt);

        // --- End condition: all aliens gone (destroyed or scrolled off) ---
        if (aliensSpawned && aliens.length === 0) {
            // Wave complete — transition to results screen
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
            gameState = STATES.PLAYING;
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
        // US-009 will refine the bugfix-specific lose condition; this wires the detection path.
        checkCollision();

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

            // Terrain collision: bomb y reached terrain height at its x
            var hit = getTerrainYAtX(bomb.x);
            if (hit && bomb.y >= hit.y) {
                spawnBombExplosion(bomb.x, hit.y);
                bombs.splice(bi, 1);
                continue;
            }

            // Bug proximity: within blast radius of any bug
            var exploded = false;
            for (var gi = 0; gi < bugs.length; gi++) {
                var bug = bugs[gi];
                var dx = bomb.x - bug.x;
                var dy = bomb.y - bug.y;
                if (dx * dx + dy * dy <= BUGFIX_BOMB_BLAST_RADIUS * BUGFIX_BOMB_BLAST_RADIUS) {
                    spawnBombExplosion(bomb.x, bomb.y);
                    bombs.splice(bi, 1);
                    exploded = true;
                    break;
                }
            }
            if (exploded) continue;
        }

        // Update bomb particle lifetimes (trail + explosion share bombParticles)
        updateBombParticles(dt);
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
                wind.gustTimer = 1.5 + Math.random() * 2.5;
            }
            // Smoothly lerp toward target
            wind.strength += (wind.targetStrength - wind.strength) * dt * 2;
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
