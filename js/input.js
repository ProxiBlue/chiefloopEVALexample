// --- Input Handling ---
var keys = {};

window.addEventListener('keydown', function (e) {
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
    }
    if (gameState === STATES.GAMEOVER && gameOverEnteringName && e.key === 'Backspace') {
        e.preventDefault();
    }
    handleKeyPress(e.key);
});

window.addEventListener('keyup', function (e) {
    keys[e.key] = false;
});

// ProxiBlue branding link — hit-test canvas clicks against the box stored by
// renderGameOver so the text-only branding is clickable without DOM overlay.
canvas.addEventListener('click', function (e) {
    var rect = canvas.getBoundingClientRect();
    var cxp = e.clientX - rect.left;
    var cyp = e.clientY - rect.top;
    // ProxiBlue branding on game over screen
    if (gameState === STATES.GAMEOVER && proxiblueBrandHitBox) {
        var b = proxiblueBrandHitBox;
        if (cxp >= b.x && cxp <= b.x + b.w && cyp >= b.y && cyp <= b.y + b.h) {
            window.open('https://github.com/ProxiBlue/chiefloopEVALexample/tree/main/test-chief-adverserial', '_blank');
        }
    }
});

function startNewGame() {
    currentLevel = 0;
    unplacedPRs = [];
    levelDateRange = '';
    levelCommits = [];
    repoFallbackNotice = '';
    score = 0;
    landings = 0;
    securityPadScroll = false;
    bugfixPadScroll = false;
    missilePadScroll = false;
    securityMiniGameCount = 0;
    otherMiniGameCount = 0;
    GRAVITY = getLevelConfig(currentLevel).gravity;
    THRUST_POWER = GRAVITY * 2.5;
    resetShip();
    resetWind();
    generateTerrain();
    gameState = STATES.PLAYING;
    // Request a one-time-use session token for online score submission.
    // Fire-and-forget: if this fails, the game works fine — scores just
    // won't be submitted online. The token is consumed by submitOnlineScore().
    if (typeof requestGameSession === 'function') {
        requestGameSession();
    }
}

function handleKeyPress(key) {
    // Handle name entry in game over state
    if (gameState === STATES.GAMEOVER && gameOverEnteringName) {
        if (key === 'Enter') {
            var name = gameOverName.trim() || 'AAA';
            // Save to local leaderboard only if it qualifies as a local high score
            if (isHighScore(score)) {
                addToLeaderboard(name, score, gameOverLevel, landings);
            }
            // Submit to online leaderboard asynchronously (fire-and-forget).
            // All positive scores are eligible regardless of local ranking.
            if (score > 0 && typeof submitOnlineScore === 'function') {
                submitOnlineScore(name, score, gameOverLevel, landings);
            }
            gameOverEnteringName = false;
            return;
        } else if (key === 'Backspace') {
            gameOverName = gameOverName.slice(0, -1);
            return;
        } else if (key.length === 1 && gameOverName.length < 10) {
            gameOverName += key;
            return;
        }
        return;
    }

    // Repo selector navigation on menu
    if (gameState === STATES.MENU && repoSelectorActive) {
        if (key === 'ArrowUp') {
            playClickSound();
            selectedRepoIndex = (selectedRepoIndex - 1 + availableRepos.length) % availableRepos.length;
            selectedRepoName = availableRepos[selectedRepoIndex].name;
            return;
        } else if (key === 'ArrowDown') {
            playClickSound();
            selectedRepoIndex = (selectedRepoIndex + 1) % availableRepos.length;
            selectedRepoName = availableRepos[selectedRepoIndex].name;
            return;
        } else if (key === 'Enter') {
            playClickSound();
            selectedRepoName = availableRepos[selectedRepoIndex].name;
            loadRepoData(availableRepos[selectedRepoIndex].file);
            repoSelectorActive = false;
            return;
        }
    }

    // Handle R key for retrying repo data load on error
    if ((key === 'r' || key === 'R') && gameState === STATES.MENU && repoDataError) {
        repoDataError = '';
        if (availableRepos.length > 0) {
            loadRepoData(availableRepos[selectedRepoIndex].file);
        }
        return;
    }

    if (key === ' ') {
        if (gameState === STATES.MENU) {
            if (repoLoadError || repoDataError || repoDataLoading || !repoDataLoaded || repoSelectorActive) return; // can't start without loaded data
            playClickSound();
            startNewGame();
        } else if (gameState === STATES.LANDED && celebrationReady) {
            playClickSound();
            // Both security and non-security pads use the same liftoff + scroll transition
            securityPadScroll = (landedPRType === 'security');
            bugfixPadScroll = (landedPRType === 'bugfix');
            missilePadScroll = false;
            // Security pads alternate mini-games: odd count -> missile command, even -> invaders.
            if (securityPadScroll) {
                securityMiniGameCount++;
                if (securityMiniGameCount % 2 !== 0) {
                    securityPadScroll = false;
                    missilePadScroll = true;
                }
            }
            // Increment level at the start of the transition (non-security only;
            // security pads advance after their mini-game phase)
            if (!securityPadScroll && !missilePadScroll) {
                currentLevel++;
            }
            ship.thrusting = false;
            ship.rotating = null;
            ship.vx = 0;
            ship.vy = 0;
            sceneLiftoffStartY = ship.y;
            startThrustSound();
            gameState = STATES.SCENE_LIFTOFF;
        } else if (gameState === STATES.BUGFIX_PLAYING) {
            // Drop a bomb from the ship's current position with the ship's current velocity.
            // No cooldown, no cap — every Space press drops one bomb (AC#1). Bombs self-clear
            // via gravity/terrain/off-canvas within seconds, so they don't accumulate unbounded.
            bombs.push({ x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy });
        } else if (gameState === STATES.MISSILE_PLAYING) {
            // Pick the battery with the MOST remaining ammo; break ties by proximity
            // of the battery to the crosshair (closest wins). Batteries with 0 ammo
            // are skipped entirely. If none have ammo, the keypress is a no-op.
            var pickedIdx = -1;
            var bestAmmo = -1;
            var bestDist = Infinity;
            for (var i = 0; i < missileBatteries.length; i++) {
                var b = missileBatteries[i];
                if (b.ammo <= 0) continue;
                var dx = b.x - missileCrosshairX;
                var dy = b.y - missileCrosshairY;
                var d = Math.sqrt(dx * dx + dy * dy);
                if (b.ammo > bestAmmo || (b.ammo === bestAmmo && d < bestDist)) {
                    bestAmmo = b.ammo;
                    bestDist = d;
                    pickedIdx = i;
                }
            }
            if (pickedIdx >= 0) {
                var bat = missileBatteries[pickedIdx];
                bat.ammo--;
                // Lock target at fire time (not tracked). Pre-compute unit velocity
                // so the update loop can advance x/y at MISSILE_INTERCEPTOR_SPEED.
                var tdx = missileCrosshairX - bat.x;
                var tdy = missileCrosshairY - bat.y;
                var tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
                missileInterceptors.push({
                    launchX: bat.x,
                    launchY: bat.y,
                    x: bat.x,
                    y: bat.y,
                    targetX: missileCrosshairX,
                    targetY: missileCrosshairY,
                    vx: (tdx / tdist) * MISSILE_INTERCEPTOR_SPEED,
                    vy: (tdy / tdist) * MISSILE_INTERCEPTOR_SPEED,
                    totalDist: tdist
                });
                if (typeof playInterceptorLaunchSound === 'function') playInterceptorLaunchSound();
            }
        } else if (gameState === STATES.MISSILE_TRANSITION) {
            // Transition is an animation — swallow Space so it can't trigger
            // downstream state handlers (e.g. advance, restart) mid-animation.
            return;
        } else if (gameState === STATES.CRASHED && explosionFinished) {
            gameOverLevel = currentLevel + 1;
            if (score > 0) {
                // Always allow name entry for positive scores so the player
                // can submit to the online leaderboard even if the score
                // doesn't crack the local top 10.
                gameOverEnteringName = true;
                gameOverName = '';
            } else {
                gameOverEnteringName = false;
            }
            // US-015 AC#10: game over resets securityMiniGameCount so the next
            // run starts a fresh invader→missile cycle. (Also reset on
            // startNewGame for the menu/restart paths; this entry guarantees
            // the counter is 0 the moment GAMEOVER is reached.)
            securityMiniGameCount = 0;
            otherMiniGameCount = 0;
            stopThrustSound();
            gameState = STATES.GAMEOVER;
        } else if (gameState === STATES.GAMEOVER && !gameOverEnteringName) {
            startNewGame();
        }
    }
    if (key === 'r' || key === 'R') {
        if (gameState === STATES.PLAYING || gameState === STATES.CRASHED || gameState === STATES.LANDED) {
            stopThrustSound();
            playClickSound();
            GRAVITY = getLevelConfig(currentLevel).gravity;
            THRUST_POWER = GRAVITY * 2.5;
            resetShip();
            resetWind();
            gameState = STATES.PLAYING;
        }
    }
}
