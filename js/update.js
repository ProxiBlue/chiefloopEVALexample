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

function update(dt) {
    // Update animation timer for pad glow pulse
    animTime += dt;

    // Track whether we're in invader mode for visual polish
    invaderMode = (gameState === STATES.INVADER_LIFTOFF ||
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
    if (gameState === STATES.SCENE_LIFTOFF) {
        var targetY = canvas.height / 2;
        ship.y -= SCENE_LIFTOFF_RISE_SPEED * dt;
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
            // Advance to next level and generate new terrain
            currentLevel++;
            GRAVITY = getLevelConfig(currentLevel).gravity;
            THRUST_POWER = GRAVITY * 2.5;
            resetWind();
            generateTerrain();
            // Store the new terrain as the scroll target
            var snapNewTerrain = [];
            for (var i = 0; i < terrain.length; i++) {
                snapNewTerrain.push({ x: terrain[i].x, y: terrain[i].y });
            }
            var snapNewPads = [];
            for (var i = 0; i < landingPads.length; i++) {
                var p = landingPads[i];
                snapNewPads.push({ index: p.index, width: p.width, points: p.points, prType: p.prType, prNumber: p.prNumber, prTitle: p.prTitle, prHash: p.prHash, prAuthor: p.prAuthor, prMergedDate: p.prMergedDate });
            }
            // Atomically set scroll state as a frozen object
            sceneScrollState = createSceneScrollState(snapOldTerrain, snapOldPads, snapNewTerrain, snapNewPads);
            // Center ship horizontally for the scroll
            ship.x = canvas.width / 2;
            gameState = STATES.SCENE_SCROLL;
        }
    }

    // Scene scroll: horizontal terrain transition
    if (gameState === STATES.SCENE_SCROLL && sceneScrollState) {
        // Timer is tracked via a new object since sceneScrollState is frozen
        var scrollTimer = sceneScrollState.timer + dt;
        var t = Math.min(scrollTimer / SCENE_SCROLL_DURATION, 1);

        // Keep ship centered
        ship.x = canvas.width / 2;
        ship.y = canvas.height / 2;

        if (t >= 1) {
            // Scroll complete — finalize new terrain from the frozen snapshot
            var newT = sceneScrollState.newTerrain;
            var newP = sceneScrollState.newPads;
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
            // Begin descent from center to starting altitude
            sceneDescentStartY = canvas.height / 2;
            sceneDescentTargetY = canvas.height / 3;
            sceneDescentTimer = 0;
            ship.x = canvas.width / 2;
            ship.y = sceneDescentStartY;
            ship.angle = 0;
            ship.vx = 0;
            ship.vy = 0;
            ship.thrusting = false;
            ship.rotating = null;
            ship.fuel = FUEL_MAX;
            gameState = STATES.SCENE_DESCENT;
        } else {
            // Update timer by replacing the frozen object atomically
            sceneScrollState = Object.freeze({
                timer: scrollTimer,
                oldTerrain: sceneScrollState.oldTerrain,
                oldPads: sceneScrollState.oldPads,
                newTerrain: sceneScrollState.newTerrain,
                newPads: sceneScrollState.newPads
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

    // Invader liftoff animation: rise then rotate
    if (gameState === STATES.INVADER_LIFTOFF) {
        var targetY = canvas.height / 2;

        if (invaderLiftoffPhase === 'rising') {
            // Move ship upward toward vertical center
            ship.y -= LIFTOFF_RISE_SPEED * dt;
            if (ship.y <= targetY) {
                ship.y = targetY;
                invaderLiftoffPhase = 'rotating';
                invaderLiftoffRotationTimer = 0;
            }
        } else if (invaderLiftoffPhase === 'rotating') {
            // Smoothly rotate 90 degrees clockwise over LIFTOFF_ROTATION_DURATION
            invaderLiftoffRotationTimer += dt;
            var t = Math.min(invaderLiftoffRotationTimer / LIFTOFF_ROTATION_DURATION, 1);
            // Ease in-out for smooth rotation
            var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            ship.angle = eased * (Math.PI / 2);

            if (t >= 1) {
                ship.angle = Math.PI / 2;
                // Snapshot current terrain for interpolation
                terrainOriginalPoints = [];
                for (var i = 0; i < terrain.length; i++) {
                    terrainOriginalPoints.push(terrain[i].y);
                }
                terrainTransitionTimer = 0;
                gameState = STATES.INVADER_TRANSITION;
            }
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
