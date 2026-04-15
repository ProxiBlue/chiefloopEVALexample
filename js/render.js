// --- Render Module ---
// Extracted from IIFE: all screen rendering functions and HUD drawing logic

function renderMenu() {
    var cx = canvas.width / 2;
    var baseY = canvas.height / 2 - 120;

    // Fan-creation disclaimer (bottom of screen, visually secondary)
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('This is a fan-made game. It is not official or associated with Mage-OS.', cx, canvas.height - 16);

    // Draw ship logo on menu (Mage-OS "M" logo)
    drawShip(cx, baseY, 0, 60);

    // Title
    ctx.fillStyle = '#f26322';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MAGE LANDER', cx, baseY + 100);

    // Show selected repo name below title
    if (selectedRepoName && !repoSelectorActive) {
        ctx.fillStyle = '#4FC3F7';
        ctx.font = '16px monospace';
        ctx.fillText('Repo: ' + selectedRepoName, cx, baseY + 125);
    }

    // Error state — no data files or repo data load failure
    if (repoLoadError) {
        ctx.fillStyle = '#f44336';
        ctx.font = '18px monospace';
        ctx.fillText('No repository data found', cx, baseY + 150);
        ctx.fillStyle = '#ccc';
        ctx.font = '14px monospace';
        ctx.fillText('To fetch data, run:', cx, baseY + 180);
        ctx.fillStyle = '#4FC3F7';
        ctx.font = '13px monospace';
        ctx.fillText('node fetch-github-data.js owner/repo', cx, baseY + 200);
        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.fillText('Then reload this page', cx, baseY + 225);
        return;
    }
    if (repoDataError) {
        ctx.fillStyle = '#f44336';
        ctx.font = '16px monospace';
        ctx.fillText('Error: ' + repoDataError, cx, baseY + 155);
        ctx.fillStyle = '#888';
        ctx.font = '14px monospace';
        ctx.fillText('Press R to retry or select another repo', cx, baseY + 180);
        return;
    }

    // Loading state — repo list
    if (!reposLoaded) {
        ctx.fillStyle = '#888';
        ctx.font = '18px monospace';
        ctx.fillText('Loading repositories...', cx, baseY + 160);
        return;
    }

    // Loading state — repo data
    if (repoDataLoading) {
        ctx.fillStyle = '#4FC3F7';
        ctx.font = '18px monospace';
        var dots = '';
        for (var d = 0; d < ((Date.now() / 500) % 4); d++) dots += '.';
        ctx.fillText('Loading repository data' + dots, cx, baseY + 160);
        return;
    }

    // Repo selector — shown when multiple repos available
    if (repoSelectorActive) {
        ctx.fillStyle = '#ccc';
        ctx.font = '18px monospace';
        ctx.fillText('Select a repository:', cx, baseY + 150);

        var listY = baseY + 180;
        for (var i = 0; i < availableRepos.length; i++) {
            var isSelected = (i === selectedRepoIndex);
            ctx.fillStyle = isSelected ? '#f26322' : '#888';
            ctx.font = isSelected ? 'bold 16px monospace' : '16px monospace';
            var prefix = isSelected ? '> ' : '  ';
            ctx.fillText(prefix + availableRepos[i].name, cx, listY + i * 28);
        }

        ctx.fillStyle = '#888';
        ctx.font = '14px monospace';
        ctx.fillText('Up/Down to navigate, Enter to select', cx, listY + availableRepos.length * 28 + 20);
        return;
    }

    // Controls
    ctx.fillStyle = '#ccc';
    ctx.font = '16px monospace';
    var controlsY = baseY + 145;
    ctx.fillText('Up / W  =  Thrust', cx, controlsY);
    ctx.fillText('Left / A  =  Rotate Left', cx, controlsY + 24);
    ctx.fillText('Right / D  =  Rotate Right', cx, controlsY + 48);
    ctx.fillText('R  =  Restart', cx, controlsY + 72);

    // Fallback notice (when data has no commits or no PRs)
    if (repoFallbackNotice) {
        ctx.fillStyle = '#FFB300';
        ctx.font = '14px monospace';
        ctx.fillText(repoFallbackNotice, cx, controlsY + 110);
    }

    // "Press Space to Start" prompt
    ctx.fillStyle = '#888';
    ctx.font = '20px sans-serif';
    var startPromptY = repoFallbackNotice ? controlsY + 140 : controlsY + 120;
    ctx.fillText('Press SPACE to Start', cx, startPromptY);

    // Leaderboard on start screen
    var board = getLeaderboard();
    if (board.length > 0) {
        drawLeaderboard(cx, controlsY + 150, null);
    }
}

function renderPlaying() {
    // Draw terrain
    drawTerrain();

    // Draw ship
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, ship.thrusting, ship.rotating);

    // --- HUD ---
    var vyMs = ship.vy / PIXELS_PER_METER;
    var vxMs = ship.vx / PIXELS_PER_METER;
    var angleDeg = ship.angle % (2 * Math.PI);
    if (angleDeg > Math.PI) angleDeg -= 2 * Math.PI;
    if (angleDeg < -Math.PI) angleDeg += 2 * Math.PI;
    angleDeg = angleDeg * (180 / Math.PI);
    var altitude = getAltitude();
    var fuelPct = ship.fuel / FUEL_MAX;

    ctx.font = '14px monospace';
    ctx.textAlign = 'left';

    // Altitude
    ctx.fillStyle = '#fff';
    ctx.fillText('Alt:     ' + altitude.toFixed(1) + ' m', 10, 25);

    // Vertical velocity — color-coded: green if safe (<2), red if too fast
    ctx.fillStyle = vyMs >= 2 ? '#f44336' : '#4CAF50';
    ctx.fillText('V-Speed: ' + vyMs.toFixed(1) + ' m/s', 10, 45);

    // Horizontal velocity — color-coded: green if safe (<1), red if too fast
    ctx.fillStyle = Math.abs(vxMs) >= 1 ? '#f44336' : '#4CAF50';
    ctx.fillText('H-Speed: ' + vxMs.toFixed(1) + ' m/s', 10, 65);

    // Angle
    ctx.fillStyle = Math.abs(angleDeg) >= 15 ? '#f44336' : '#4CAF50';
    ctx.fillText('Angle:   ' + angleDeg.toFixed(1) + '\u00B0', 10, 85);

    // Fuel bar
    var fuelBarW = 120;
    var fuelBarH = 14;
    var fuelBarX = 10;
    var fuelBarY = 98;

    ctx.fillStyle = '#333';
    ctx.fillRect(fuelBarX, fuelBarY, fuelBarW, fuelBarH);

    var fuelColor;
    if (fuelPct > 0.5) {
        fuelColor = '#4CAF50';
    } else if (fuelPct > 0.25) {
        fuelColor = '#FFC107';
    } else {
        fuelColor = '#f44336';
    }
    ctx.fillStyle = fuelColor;
    ctx.fillRect(fuelBarX, fuelBarY, fuelBarW * fuelPct, fuelBarH);

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(fuelBarX, fuelBarY, fuelBarW, fuelBarH);

    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Fuel: ' + Math.round(fuelPct * 100) + '%', fuelBarX + fuelBarW + 8, fuelBarY + 12);

    // Score, Level, and Repo
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + score, 10, fuelBarY + 36);
    ctx.fillText('Level: ' + (currentLevel + 1), 10, fuelBarY + 56);

    // Repo name in HUD (top-right)
    if (selectedRepoName) {
        ctx.fillStyle = '#4FC3F7';
        ctx.font = '12px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('Repo: ' + selectedRepoName, canvas.width - 10, 25);
        ctx.textAlign = 'left';
    }

    // PR Type Legend (top-right, below repo name)
    var legendX = canvas.width - 10;
    var legendY = 45;
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    var legendTypes = [
        { label: 'Security (3x)', color: PR_TYPE_COLORS.security },
        { label: 'Bug Fix (2x)', color: PR_TYPE_COLORS.bugfix },
        { label: 'Feature (1x)', color: PR_TYPE_COLORS.feature },
        { label: 'Other (1x)', color: PR_TYPE_COLORS.other }
    ];
    for (var li = 0; li < legendTypes.length; li++) {
        var lt = legendTypes[li];
        ctx.fillStyle = lt.color;
        ctx.fillRect(legendX - 8, legendY + li * 16 - 8, 8, 8);
        ctx.fillStyle = '#ccc';
        ctx.fillText(lt.label, legendX - 14, legendY + li * 16);
    }

    // Date range of current level's data
    if (levelDateRange) {
        ctx.fillStyle = '#aaa';
        ctx.font = '11px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(levelDateRange, legendX, legendY + legendTypes.length * 16 + 6);
    }
    ctx.textAlign = 'left';

    // Wind indicator (only shown when wind is active)
    if (wind.maxStrength > 0) {
        var windY = fuelBarY + 76;
        ctx.fillStyle = '#fff';
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Wind:', 10, windY);

        // Draw wind arrow — length proportional to strength, direction shows left/right
        var arrowBaseX = 70;
        var arrowY = windY - 5;
        var maxArrowLen = 60;
        var arrowLen = (wind.strength / wind.maxStrength) * maxArrowLen;
        var absArrowLen = Math.abs(arrowLen);

        if (absArrowLen > 1) {
            var arrowEndX = arrowBaseX + arrowLen;
            // Arrow shaft
            ctx.strokeStyle = '#4FC3F7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(arrowBaseX, arrowY);
            ctx.lineTo(arrowEndX, arrowY);
            ctx.stroke();
            // Arrowhead
            var headDir = arrowLen > 0 ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(arrowEndX, arrowY);
            ctx.lineTo(arrowEndX - headDir * 6, arrowY - 4);
            ctx.lineTo(arrowEndX - headDir * 6, arrowY + 4);
            ctx.closePath();
            ctx.fillStyle = '#4FC3F7';
            ctx.fill();
        } else {
            // Calm — show a dot
            ctx.fillStyle = '#4FC3F7';
            ctx.beginPath();
            ctx.arc(arrowBaseX, arrowY, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // HUD hint
    ctx.fillStyle = '#555';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Arrow keys to steer | UP or W for thrust | Land on pads', canvas.width / 2, canvas.height - 30);
}

function renderLanded() {
    drawTerrain();

    // Ship remains visible on the pad
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false);

    // Draw celebration particles
    drawCelebration();

    // "LANDED SUCCESSFULLY!" title
    ctx.fillStyle = '#4CAF50';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LANDED SUCCESSFULLY!', canvas.width / 2, canvas.height / 2 - 40);

    // Score breakdown displayed prominently
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('+' + landedTotalPoints + ' pts', canvas.width / 2, canvas.height / 2 + 5);

    // Breakdown: pad bonus (with multiplier) + fuel bonus
    ctx.fillStyle = '#ccc';
    ctx.font = '16px sans-serif';
    var padBreakdown = 'Pad: ' + landedPadBasePoints + (landedTypeMultiplier > 1 ? ' x' + landedTypeMultiplier + ' = ' + landedPadPoints : '');
    ctx.fillText(padBreakdown + ' | Fuel bonus: ' + landedFuelBonus, canvas.width / 2, canvas.height / 2 + 30);

    // PR Info Panel on successful landing
    if (landedPRNumber) {
        var panelCx = canvas.width / 2;
        var panelTop = canvas.height / 2 + 48;
        var panelW = 400;
        var panelH = 100;
        var panelLeft = panelCx - panelW / 2;

        // Panel background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(panelLeft, panelTop, panelW, panelH, 8);
        ctx.fill();
        ctx.stroke();

        var lineY = panelTop + 22;

        // Row 1: PR number + type badge
        ctx.font = 'bold 15px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        var prLabel = 'PR #' + landedPRNumber;
        ctx.fillText(prLabel, panelLeft + 14, lineY);

        // Type badge
        if (landedPRType && landedPRType !== 'fallback') {
            var badgeColor = PR_TYPE_COLORS[landedPRType] || PR_TYPE_COLORS.other;
            var badgeText = landedPRType.charAt(0).toUpperCase() + landedPRType.slice(1);
            var prLabelWidth = ctx.measureText(prLabel).width;
            var badgeX = panelLeft + 14 + prLabelWidth + 10;
            ctx.font = 'bold 11px sans-serif';
            var badgeTextWidth = ctx.measureText(badgeText).width;
            // Badge background
            ctx.fillStyle = badgeColor;
            ctx.beginPath();
            ctx.roundRect(badgeX, lineY - 11, badgeTextWidth + 12, 16, 4);
            ctx.fill();
            // Badge text
            ctx.fillStyle = '#000';
            ctx.fillText(badgeText, badgeX + 6, lineY - 0.5);
        }

        // Merge date (right-aligned)
        if (landedPRMergedDate) {
            var mergeDate = new Date(landedPRMergedDate);
            var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            var dateStr = months[mergeDate.getMonth()] + ' ' + mergeDate.getDate() + ', ' + mergeDate.getFullYear();
            ctx.font = '12px sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.textAlign = 'right';
            ctx.fillText(dateStr, panelLeft + panelW - 14, lineY);
        }

        lineY += 22;

        // Row 2: PR title (truncated)
        ctx.font = '13px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.textAlign = 'left';
        var maxTitleW = panelW - 28;
        var displayTitle = landedPRTitle;
        while (displayTitle.length > 0 && ctx.measureText(displayTitle).width > maxTitleW) {
            displayTitle = displayTitle.substring(0, displayTitle.length - 1);
        }
        if (displayTitle.length < landedPRTitle.length) {
            displayTitle = displayTitle.substring(0, displayTitle.length - 3) + '...';
        }
        ctx.fillText(displayTitle, panelLeft + 14, lineY);

        lineY += 20;

        // Row 3: Author
        if (landedPRAuthor) {
            ctx.font = '12px sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.textAlign = 'left';
            ctx.fillText('by ' + landedPRAuthor, panelLeft + 14, lineY);
        }

        // Reset text align for subsequent draws
        ctx.textAlign = 'center';
    }

    // "Press Space for next level" appears after delay
    if (celebrationReady) {
        ctx.fillStyle = '#888';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Press SPACE for next level', canvas.width / 2, canvas.height / 2 + (landedPRNumber ? 170 : 65));
    }
}

function renderCrashed() {
    drawTerrain();

    // During explosion, show particles instead of ship
    if (!explosionFinished) {
        drawExplosion();
    } else {
        // After explosion finishes, show "Crashed!" message
        ctx.fillStyle = '#f44336';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CRASHED!', canvas.width / 2, canvas.height / 2 - 40);

        // Show crash reasons
        if (landingResult) {
            var reasons = landingResult.split('\n');
            ctx.fillStyle = '#ccc';
            ctx.font = '16px sans-serif';
            for (var i = 0; i < reasons.length; i++) {
                ctx.fillText(reasons[i], canvas.width / 2, canvas.height / 2 + i * 22);
            }
        }

        ctx.fillStyle = '#888';
        ctx.font = '20px sans-serif';
        ctx.fillText('Press R to retry | Press SPACE for game over', canvas.width / 2, canvas.height / 2 + (landingResult ? landingResult.split('\n').length * 22 + 15 : 30));
    }
}

function renderGameOver() {
    var cx = canvas.width / 2;
    var y = canvas.height / 2 - 120;

    ctx.fillStyle = '#f44336';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', cx, y);

    y += 40;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('Score: ' + score, cx, y);

    y += 30;
    ctx.fillStyle = '#ccc';
    ctx.font = '18px sans-serif';
    ctx.fillText('Level Reached: ' + gameOverLevel, cx, y);

    y += 30;

    if (gameOverEnteringName) {
        // Name entry prompt
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('NEW HIGH SCORE!', cx, y);
        y += 28;
        ctx.fillStyle = '#ccc';
        ctx.font = '16px sans-serif';
        ctx.fillText('Enter your name:', cx, y);
        y += 28;
        // Draw input box
        var boxW = 200;
        var boxH = 30;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - boxW / 2, y - 20, boxW, boxH);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px monospace';
        var displayName = gameOverName;
        // Blinking cursor
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            displayName += '_';
        }
        ctx.fillText(displayName, cx, y + 2);
        y += 24;
        ctx.fillStyle = '#888';
        ctx.font = '14px sans-serif';
        ctx.fillText('Press ENTER to confirm (max 10 chars)', cx, y);
    } else {
        // Show leaderboard
        y = drawLeaderboard(cx, y, gameOverName.trim() || null);
        y += 15;
        ctx.fillStyle = '#888';
        ctx.font = '20px sans-serif';
        ctx.fillText('Press Space to Play Again', cx, y);
    }
}

function render() {
    // Clear canvas with dark background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw starfield background
    drawStars();

    // Apply screen shake offset
    var shaking = screenShake > 0;
    if (shaking) {
        var shakeX = (Math.random() - 0.5) * 2 * SCREEN_SHAKE_INTENSITY * (screenShake / SCREEN_SHAKE_DURATION);
        var shakeY = (Math.random() - 0.5) * 2 * SCREEN_SHAKE_INTENSITY * (screenShake / SCREEN_SHAKE_DURATION);
        ctx.save();
        ctx.translate(shakeX, shakeY);
    }

    switch (gameState) {
        case STATES.MENU:
            renderMenu();
            break;
        case STATES.PLAYING:
            renderPlaying();
            break;
        case STATES.LANDED:
            renderLanded();
            break;
        case STATES.CRASHED:
            renderCrashed();
            break;
        case STATES.GAMEOVER:
            renderGameOver();
            break;
    }

    // Restore screen shake offset
    if (shaking) {
        ctx.restore();
    }
}
