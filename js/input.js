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
}

function handleKeyPress(key) {
    // Handle name entry in game over state
    if (gameState === STATES.GAMEOVER && gameOverEnteringName) {
        if (key === 'Enter') {
            var name = gameOverName.trim() || 'AAA';
            addToLeaderboard(name, score);
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
                gameState = STATES.INVADER_LIFTOFF;
            } else {
                // Normal pad: advance to next level (endless progression)
                currentLevel++;
                GRAVITY = getLevelConfig(currentLevel).gravity;
                THRUST_POWER = GRAVITY * 2.5;
                resetShip();
                resetWind();
                generateTerrain();
                gameState = STATES.PLAYING;
            }
        } else if (gameState === STATES.CRASHED && explosionFinished) {
            gameOverLevel = currentLevel + 1;
            if (isHighScore(score)) {
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
