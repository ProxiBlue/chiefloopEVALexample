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

function startNewGame() {
    currentLevel = 0;
    unplacedPRs = [];
    levelDateRange = '';
    levelCommits = [];
    repoFallbackNotice = '';
    score = 0;
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
                addToLeaderboard(name, score);
            }
            // Submit to online leaderboard asynchronously (fire-and-forget).
            // All positive scores are eligible regardless of local ranking.
            if (score > 0 && typeof submitOnlineScore === 'function') {
                submitOnlineScore(name, score);
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
            if (landedPRType === 'security') {
                // Security pad: route to Space Invaders interlude
                invaderLiftoffPhase = 'rising';
                invaderLiftoffRotationTimer = 0;
                ship.thrusting = false;
                ship.rotating = null;
                ship.vx = 0;
                ship.vy = 0;
                gameState = STATES.INVADER_LIFTOFF;
            } else {
                // Normal pad: liftoff animation before advancing to next level
                ship.thrusting = false;
                ship.rotating = null;
                ship.vx = 0;
                ship.vy = 0;
                gameState = STATES.SCENE_LIFTOFF;
            }
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
