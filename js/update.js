// --- Game Update & Physics ---

function update(dt) {
    // Update animation timer for pad glow pulse
    animTime += dt;

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
            gameState = STATES.INVADER_PLAYING;
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
