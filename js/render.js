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

function renderSceneLiftoff() {
    drawTerrain();

    // Show thrust flame during rise for both normal and security pad (invader) paths
    // 5th param = true enables main thrust flame visual (no fuel cost)
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, true, null);

    // Status text
    ctx.fillStyle = '#4FC3F7';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    if (securityPadScroll) {
        ctx.fillText('SECURITY THREAT DETECTED', canvas.width / 2, 60);
    } else {
        ctx.fillText('LAUNCHING TO NEXT MISSION', canvas.width / 2, 60);
    }
}

function renderSceneDescent() {
    drawTerrain();

    // Ship descends with thrust flame visible
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, true, null);

    // Status text
    ctx.fillStyle = '#4FC3F7';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DESCENDING TO POSITION', canvas.width / 2, 60);

    // Level indicator
    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.fillText('Level ' + (currentLevel + 1), canvas.width / 2, 90);
}

function renderSceneCountdown() {
    drawTerrain();

    // Ship visible but no thrust during countdown
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null);

    // Determine which number to show (3, 2, 1)
    var step = Math.floor(sceneCountdownTimer / SCENE_COUNTDOWN_STEP_DURATION);
    var number = 3 - step; // 3, 2, 1
    if (number < 1) number = 1;

    // Large centered countdown number with high contrast
    var cx = canvas.width / 2;
    var cy = canvas.height / 2;

    // Glow effect behind the number
    ctx.save();
    ctx.shadowColor = '#4FC3F7';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 120px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('' + number, cx, cy);
    ctx.restore();

    // Solid number on top
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 120px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('' + number, cx, cy);

    // Reset textBaseline
    ctx.textBaseline = 'alphabetic';

    // Level indicator
    ctx.fillStyle = '#4FC3F7';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GET READY', cx, 60);

    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.fillText('Level ' + (currentLevel + 1), cx, 90);
}

function drawTerrainAtOffset(terrainPoints, pads, offsetX) {
    if (terrainPoints.length === 0) return;

    // Draw filled terrain polygon
    ctx.beginPath();
    ctx.moveTo(terrainPoints[0].x + offsetX, terrainPoints[0].y);
    for (var i = 1; i < terrainPoints.length; i++) {
        ctx.lineTo(terrainPoints[i].x + offsetX, terrainPoints[i].y);
    }
    ctx.lineTo(terrainPoints[terrainPoints.length - 1].x + offsetX, canvas.height);
    ctx.lineTo(terrainPoints[0].x + offsetX, canvas.height);
    ctx.closePath();
    ctx.fillStyle = '#444';
    ctx.fill();

    // Stroke the top surface
    ctx.beginPath();
    ctx.moveTo(terrainPoints[0].x + offsetX, terrainPoints[0].y);
    for (var i = 1; i < terrainPoints.length; i++) {
        ctx.lineTo(terrainPoints[i].x + offsetX, terrainPoints[i].y);
    }
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw landing pads with glow
    var pulseAlpha = 0.5 + 0.5 * Math.sin(animTime * 3);
    var glowScale = Math.max(1, Math.min(canvas.width, canvas.height) / 800);
    for (var p = 0; p < pads.length; p++) {
        var pad = pads[p];
        if (pad.index >= 0 && pad.index < terrainPoints.length) {
            var padStart = terrainPoints[pad.index];
            var padEnd = terrainPoints[pad.index + pad.width] || terrainPoints[terrainPoints.length - 1];
            var padColor = PR_TYPE_COLORS[pad.prType] || PR_TYPE_COLORS.other;

            // Outer glow
            ctx.save();
            ctx.shadowColor = padColor;
            ctx.shadowBlur = (20 + 12 * pulseAlpha) * glowScale;
            ctx.beginPath();
            ctx.moveTo(padStart.x + offsetX, padStart.y);
            ctx.lineTo(padEnd.x + offsetX, padEnd.y);
            ctx.strokeStyle = padColor;
            ctx.globalAlpha = 0.25 + 0.2 * pulseAlpha;
            ctx.lineWidth = 6 * glowScale;
            ctx.stroke();
            ctx.restore();

            // Inner glow
            ctx.save();
            ctx.shadowColor = padColor;
            ctx.shadowBlur = (10 + 8 * pulseAlpha) * glowScale;
            ctx.beginPath();
            ctx.moveTo(padStart.x + offsetX, padStart.y);
            ctx.lineTo(padEnd.x + offsetX, padEnd.y);
            ctx.strokeStyle = padColor;
            ctx.globalAlpha = 0.6 + 0.4 * pulseAlpha;
            ctx.lineWidth = 4 * glowScale;
            ctx.stroke();
            ctx.restore();

            // Solid pad line
            ctx.beginPath();
            ctx.moveTo(padStart.x + offsetX, padStart.y);
            ctx.lineTo(padEnd.x + offsetX, padEnd.y);
            ctx.strokeStyle = padColor;
            ctx.lineWidth = 3 * glowScale;
            ctx.stroke();

            // Point value label
            var midX = (padStart.x + padEnd.x) / 2 + offsetX;
            ctx.fillStyle = padColor;
            ctx.font = 'bold ' + Math.round(12 * glowScale) + 'px sans-serif';
            ctx.textAlign = 'center';
            var padMultiplier = PR_TYPE_MULTIPLIERS[pad.prType] || 1;
            var labelText = pad.points + 'pts';
            if (padMultiplier > 1) {
                labelText += ' x' + padMultiplier;
            }
            ctx.fillText(labelText, midX, padStart.y - 8);

            // PR label below pad
            var padLabel = '';
            if (pad.prNumber) {
                padLabel = 'PR #' + pad.prNumber;
            } else if (pad.prHash) {
                padLabel = pad.prHash;
            }
            if (padLabel) {
                ctx.save();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.font = Math.round(9 * glowScale) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(padLabel, midX, padStart.y + 14 * glowScale);
                ctx.restore();
            }
        }
    }
}

function drawInvaderTerrainAtOffset(terrainPoints, offsetX) {
    if (terrainPoints.length === 0) return;

    // Draw filled terrain with dark green tint
    ctx.beginPath();
    ctx.moveTo(terrainPoints[0].x + offsetX, terrainPoints[0].y);
    for (var i = 1; i < terrainPoints.length; i++) {
        ctx.lineTo(terrainPoints[i].x + offsetX, terrainPoints[i].y);
    }
    ctx.lineTo(terrainPoints[terrainPoints.length - 1].x + offsetX, canvas.height);
    ctx.lineTo(terrainPoints[0].x + offsetX, canvas.height);
    ctx.closePath();
    ctx.fillStyle = '#1a3a1a';
    ctx.fill();

    // Stroke the top surface in green
    ctx.beginPath();
    ctx.moveTo(terrainPoints[0].x + offsetX, terrainPoints[0].y);
    for (var i = 1; i < terrainPoints.length; i++) {
        ctx.lineTo(terrainPoints[i].x + offsetX, terrainPoints[i].y);
    }
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw grid lines on the terrain surface
    var flatY = terrainPoints[0].y;
    var startX = terrainPoints[0].x + offsetX;
    var endX = terrainPoints[terrainPoints.length - 1].x + offsetX;
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.3)';
    ctx.lineWidth = 1;

    // Vertical grid lines
    var gridSpacing = 60;
    for (var gx = Math.ceil(startX / gridSpacing) * gridSpacing; gx <= endX; gx += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(gx, flatY);
        ctx.lineTo(gx, canvas.height);
        ctx.stroke();
    }

    // Horizontal grid lines
    for (var gy = flatY + gridSpacing; gy < canvas.height; gy += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(startX, gy);
        ctx.lineTo(endX, gy);
        ctx.stroke();
    }
}

function renderSceneScroll() {
    if (!sceneScrollState) return;

    // Calculate scroll progress from encapsulated state
    var t = Math.min(sceneScrollState.timer / SCENE_SCROLL_DURATION, 1);
    var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    var scrollOffset = eased * canvas.width;

    // Clip to prevent terrain drawing outside canvas
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.clip();

    // Draw old terrain scrolling left
    drawTerrainAtOffset(sceneScrollState.oldTerrain, sceneScrollState.oldPads, -scrollOffset);

    // Draw new terrain entering from right
    if (sceneScrollState.isInvaderScroll) {
        drawInvaderTerrainAtOffset(sceneScrollState.newTerrain, canvas.width - scrollOffset);
    } else {
        drawTerrainAtOffset(sceneScrollState.newTerrain, sceneScrollState.newPads, canvas.width - scrollOffset);
    }

    ctx.restore();

    // Draw ship with thrust flame + side thrusters for both normal and security pad (invader) paths
    // 5th param = true: main thrust flame visible during scroll
    // 6th param = thrusterDir: side thrusters fire in direction of horizontal travel
    var thrusterDir = (sceneScrollState.shipStartX < canvas.width / 2) ? 'right' : 'left';
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, true, thrusterDir);

    // Status text
    ctx.fillStyle = '#4FC3F7';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    if (sceneScrollState.isInvaderScroll) {
        ctx.fillText('SECURITY THREAT DETECTED', canvas.width / 2, 60);
    } else {
        ctx.fillText('APPROACHING NEXT MISSION', canvas.width / 2, 60);
        // Level indicator
        ctx.fillStyle = '#fff';
        ctx.font = '16px monospace';
        ctx.fillText('Level ' + (currentLevel + 1), canvas.width / 2, 90);
    }
}

function renderInvaderScrollRotate() {
    drawTerrain();

    // Draw ship rotating (no thrust during rotation)
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null);

    // Status text
    ctx.fillStyle = '#4FC3F7';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ENGAGING DEFENSE MODE', canvas.width / 2, 60);
}

function renderInvaderTransition() {
    // Draw terrain (it's being interpolated each frame by update)
    drawTerrain();

    // Draw ship at its current position (rotated sideways from liftoff)
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null);

    // Status text
    ctx.fillStyle = '#4FC3F7';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PREPARING BATTLEFIELD', canvas.width / 2, 60);
}

// --- Alien Sprite Drawing ---
// Three classic Space Invaders-style pixel-art aliens rendered on canvas
// Each is drawn centered at (x, y) within a size x size bounding box

function drawAlien(x, y, size, type) {
    var s = size / 11; // each alien is on an 11x8-ish pixel grid
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);

    if (type === 0) {
        // Type 0: Classic "crab" alien — green
        ctx.fillStyle = '#4CAF50';
        // Row 0
        ctx.fillRect(3*s, 0, s, s);
        ctx.fillRect(7*s, 0, s, s);
        // Row 1
        ctx.fillRect(4*s, s, s, s);
        ctx.fillRect(6*s, s, s, s);
        // Row 2
        ctx.fillRect(3*s, 2*s, 5*s, s);
        // Row 3
        ctx.fillRect(2*s, 3*s, 2*s, s);
        ctx.fillRect(5*s, 3*s, s, s);
        ctx.fillRect(7*s, 3*s, 2*s, s);
        // Row 4
        ctx.fillRect(1*s, 4*s, 9*s, s);
        // Row 5
        ctx.fillRect(1*s, 5*s, s, s);
        ctx.fillRect(3*s, 5*s, 5*s, s);
        ctx.fillRect(9*s, 5*s, s, s);
        // Row 6
        ctx.fillRect(1*s, 6*s, s, s);
        ctx.fillRect(3*s, 6*s, s, s);
        ctx.fillRect(7*s, 6*s, s, s);
        ctx.fillRect(9*s, 6*s, s, s);
        // Row 7 (legs)
        ctx.fillRect(2*s, 7*s, s, s);
        ctx.fillRect(4*s, 7*s, s, s);
        ctx.fillRect(6*s, 7*s, s, s);
        ctx.fillRect(8*s, 7*s, s, s);
    } else if (type === 1) {
        // Type 1: Classic "squid" alien — magenta/purple
        ctx.fillStyle = '#E040FB';
        // Row 0
        ctx.fillRect(5*s, 0, s, s);
        // Row 1
        ctx.fillRect(4*s, s, 3*s, s);
        // Row 2
        ctx.fillRect(3*s, 2*s, 5*s, s);
        // Row 3
        ctx.fillRect(2*s, 3*s, 2*s, s);
        ctx.fillRect(5*s, 3*s, s, s);
        ctx.fillRect(7*s, 3*s, 2*s, s);
        // Row 4
        ctx.fillRect(2*s, 4*s, 7*s, s);
        // Row 5
        ctx.fillRect(3*s, 5*s, s, s);
        ctx.fillRect(5*s, 5*s, s, s);
        ctx.fillRect(7*s, 5*s, s, s);
        // Row 6
        ctx.fillRect(2*s, 6*s, 2*s, s);
        ctx.fillRect(7*s, 6*s, 2*s, s);
        // Row 7
        ctx.fillRect(1*s, 7*s, s, s);
        ctx.fillRect(9*s, 7*s, s, s);
    } else {
        // Type 2: Classic "octopus" alien — cyan
        ctx.fillStyle = '#00BCD4';
        // Row 0
        ctx.fillRect(4*s, 0, 3*s, s);
        // Row 1
        ctx.fillRect(2*s, s, 7*s, s);
        // Row 2
        ctx.fillRect(1*s, 2*s, 9*s, s);
        // Row 3
        ctx.fillRect(1*s, 3*s, 2*s, s);
        ctx.fillRect(4*s, 3*s, s, s);
        ctx.fillRect(6*s, 3*s, s, s);
        ctx.fillRect(8*s, 3*s, 2*s, s);
        // Row 4
        ctx.fillRect(1*s, 4*s, 9*s, s);
        // Row 5
        ctx.fillRect(2*s, 5*s, 3*s, s);
        ctx.fillRect(6*s, 5*s, 3*s, s);
        // Row 6
        ctx.fillRect(1*s, 6*s, 2*s, s);
        ctx.fillRect(8*s, 6*s, 2*s, s);
        // Row 7
        ctx.fillRect(3*s, 7*s, 2*s, s);
        ctx.fillRect(6*s, 7*s, 2*s, s);
    }

    ctx.restore();
}

function renderInvaderPlaying() {
    // Draw terrain (flat ground from transition)
    drawTerrain();

    // Draw ship at its current position (rotated sideways)
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null);

    // Draw all bullets as short laser-line segments
    ctx.strokeStyle = BULLET_COLOR;
    ctx.lineWidth = 3;
    ctx.shadowColor = BULLET_COLOR;
    ctx.shadowBlur = 6;
    for (var i = 0; i < bullets.length; i++) {
        ctx.beginPath();
        ctx.moveTo(bullets[i].x - BULLET_SIZE, bullets[i].y);
        ctx.lineTo(bullets[i].x, bullets[i].y);
        ctx.stroke();
        // Bright core
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bullets[i].x - BULLET_SIZE + 2, bullets[i].y);
        ctx.lineTo(bullets[i].x - 1, bullets[i].y);
        ctx.stroke();
        // Reset for next bullet
        ctx.strokeStyle = BULLET_COLOR;
        ctx.lineWidth = 3;
    }
    ctx.shadowBlur = 0;

    // Draw all aliens
    for (var i = 0; i < aliens.length; i++) {
        drawAlien(aliens[i].x, aliens[i].y, ALIEN_SIZE, aliens[i].type);
    }

    // Draw alien explosion particles
    drawAlienExplosions();

    // HUD — invader-specific (hides lander info: altitude, speeds, fuel bar)
    ctx.fillStyle = '#4FC3F7';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DEFEND AGAINST SECURITY THREATS', canvas.width / 2, 40);

    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + (score + invaderScore), 10, 25);

    // Invader bonus points (running total for this wave)
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('Bonus: +' + invaderScore + ' pts', 10, 45);

    // Aliens remaining count
    ctx.fillStyle = '#ccc';
    ctx.font = '14px monospace';
    ctx.fillText('Aliens Remaining: ' + aliens.length, 10, 65);

    // Controls hint
    ctx.fillStyle = '#555';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE to shoot | Arrow keys / WASD to move', canvas.width / 2, canvas.height - 30);
}

function renderInvaderComplete() {
    // Draw terrain
    drawTerrain();

    // Draw ship
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null);

    // Draw any remaining alien explosion particles
    drawAlienExplosions();

    // Results overlay
    var cx = canvas.width / 2;
    var cy = canvas.height / 2;

    ctx.fillStyle = '#4CAF50';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WAVE COMPLETE!', cx, cy - 60);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('Aliens Destroyed: ' + aliensDestroyed + ' / ' + invaderTotalAliens, cx, cy - 15);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Bonus: +' + invaderScore + ' pts', cx, cy + 25);

    ctx.fillStyle = '#888';
    ctx.font = '18px sans-serif';
    ctx.fillText('Returning to mission...', cx, cy + 65);
}

// --- Bug Sprite Drawing ---
// 12px pixel-art bug rendered on a 6x6 grid. Two-frame shuffle animation:
// frame 0 and frame 1 alternate leg positions to create a walking effect.
function drawBug(x, y, size, color, frame) {
    var s = size / 6;
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.fillStyle = color;

    // Body (rows 0-3) — oval-ish blob
    ctx.fillRect(s, 0, 4 * s, s);         // row 0: .####.
    ctx.fillRect(0, s, 6 * s, s);          // row 1: ######
    ctx.fillRect(0, 2 * s, 6 * s, s);      // row 2: ######
    ctx.fillRect(s, 3 * s, 4 * s, s);      // row 3: .####.

    // Legs (rows 4-5) — 3 per side, positions swap by frame
    if (frame === 0) {
        // row 4: #....#   (outer legs out)
        ctx.fillRect(0, 4 * s, s, s);
        ctx.fillRect(5 * s, 4 * s, s, s);
        // row 5: .#..#.   (inner legs tucked)
        ctx.fillRect(s, 5 * s, s, s);
        ctx.fillRect(4 * s, 5 * s, s, s);
    } else {
        // row 4: .#..#.   (legs swap)
        ctx.fillRect(s, 4 * s, s, s);
        ctx.fillRect(4 * s, 4 * s, s, s);
        // row 5: #....#
        ctx.fillRect(0, 5 * s, s, s);
        ctx.fillRect(5 * s, 5 * s, s, s);
    }

    ctx.restore();
}

function drawBombs() {
    for (var i = 0; i < bombs.length; i++) {
        var b = bombs[i];
        ctx.fillStyle = '#FFBB44';
        ctx.shadowColor = '#FF9234';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(b.x, b.y, BUGFIX_BOMB_SIZE, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.shadowBlur = 0;
}

function drawBombParticles() {
    for (var i = 0; i < bombParticles.length; i++) {
        var p = bombParticles[i];
        var alpha = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function drawBugExplosions() {
    for (var g = 0; g < bugExplosions.length; g++) {
        var group = bugExplosions[g];
        for (var i = 0; i < group.length; i++) {
            var p = group[i];
            var alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
}

// HUD swap: replaces altitude/velocity/angle panel from renderPlaying with
// bugfix-specific info (bugs remaining, fuel bar, score).
function drawBugfixHUD() {
    var fuelPct = ship.fuel / FUEL_MAX;

    ctx.font = '14px monospace';
    ctx.textAlign = 'left';

    // Bugs remaining
    ctx.fillStyle = '#fff';
    ctx.fillText('Bugs: ' + bugs.length + ' / ' + bugsTotal, 10, 25);

    // Score (current global score + bugfix bonus)
    ctx.fillStyle = '#FFD700';
    ctx.fillText('Score: ' + score, 10, 45);

    // Bugfix bonus running total
    ctx.fillStyle = '#FFD700';
    ctx.fillText('Bonus: +' + bugfixScore + ' pts', 10, 65);

    // Fuel bar
    var fuelBarW = 120;
    var fuelBarH = 14;
    var fuelBarX = 10;
    var fuelBarY = 78;

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
    ctx.fillText('Fuel: ' + Math.round(fuelPct * 100) + '%', fuelBarX + fuelBarW + 8, fuelBarY + 12);

    // Level indicator
    ctx.fillStyle = '#fff';
    ctx.fillText('Level: ' + (currentLevel + 1), 10, fuelBarY + 36);
}

function drawBugfixWorld() {
    drawTerrain();

    for (var i = 0; i < bugs.length; i++) {
        drawBug(bugs[i].x, bugs[i].y, BUGFIX_BUG_SIZE, bugs[i].color, bugs[i].animFrame);
    }

    drawBombs();
    drawBombParticles();
    drawBugExplosions();

    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, ship.thrusting, ship.rotating);
}

function renderBugfixTransition() {
    drawBugfixWorld();
    drawBugfixHUD();

    ctx.fillStyle = '#FFB300';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUGS DETECTED — ELIMINATE THEM', canvas.width / 2, 40);
}

function renderBugfixPlaying() {
    drawBugfixWorld();
    drawBugfixHUD();

    // Controls hint
    ctx.fillStyle = '#555';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE to drop bombs | Arrow keys / WASD to fly', canvas.width / 2, canvas.height - 30);
}

function renderBugfixComplete() {
    drawBugfixWorld();
    drawBugfixHUD();

    // Results overlay
    var cx = canvas.width / 2;
    var cy = canvas.height / 2;

    ctx.fillStyle = '#4CAF50';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUGS CLEARED!', cx, cy - 60);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('Bugs Cleared: ' + bugsKilled + ' / ' + bugsTotal, cx, cy - 15);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Fuel Bonus: +' + bugfixFuelBonus + ' pts', cx, cy + 25);

    ctx.fillStyle = '#888';
    ctx.font = '18px sans-serif';
    ctx.fillText('Returning to mission...', cx, cy + 65);
}

function renderBugfixReturn() {
    drawBugfixWorld();
    drawBugfixHUD();

    ctx.fillStyle = '#4FC3F7';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RETURNING TO MISSION', canvas.width / 2, 40);
}

// --- Missile Command drawing helpers ---

function drawMissileBuilding(b) {
    if (b.height <= 0) return;
    var top = b.baseY - b.height;
    var left = b.x - b.width / 2;

    ctx.fillStyle = '#546E7A';
    ctx.fillRect(left, top, b.width, b.height);
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, b.width - 1, b.height - 1);

    ctx.fillStyle = '#FFEB3B';
    var winW = 4, winH = 4, stepX = 8, stepY = 8;
    for (var wy = top + 6; wy + winH < b.baseY - 2; wy += stepY) {
        for (var wx = left + 4; wx + winW < left + b.width - 4; wx += stepX) {
            ctx.fillRect(wx, wy, winW, winH);
        }
    }

    if (b.label && b.height > 14) {
        ctx.fillStyle = '#ECEFF1';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(b.label, b.x, top - 4);
    }
}

function drawMissileBattery(bat) {
    var bodyW = 30, bodyH = 18;
    var bodyX = bat.x - bodyW / 2;
    var bodyY = bat.y - bodyH;

    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
    ctx.strokeStyle = '#1B5E20';
    ctx.lineWidth = 1;
    ctx.strokeRect(bodyX + 0.5, bodyY + 0.5, bodyW - 1, bodyH - 1);

    ctx.strokeStyle = '#2E7D32';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bat.x, bodyY + bodyH / 2);
    ctx.lineTo(bat.x, bodyY - 10);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(bat.ammo), bat.x, bodyY - 14);
}

function drawMissileCrosshair() {
    var cx = missileCrosshairX;
    var cy = missileCrosshairY;
    var t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    var pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);

    ctx.save();
    ctx.strokeStyle = '#00ff66';
    ctx.globalAlpha = 0.25 + 0.25 * pulse;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 12 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy); ctx.lineTo(cx - 4, cy);
    ctx.moveTo(cx + 4, cy);  ctx.lineTo(cx + 14, cy);
    ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy - 4);
    ctx.moveTo(cx, cy + 4);  ctx.lineTo(cx, cy + 14);
    ctx.stroke();
}

function drawMissileInterceptor(inter) {
    // Bright green trail with a white-hot leading head.
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(inter.launchX, inter.launchY);
    ctx.lineTo(inter.x, inter.y);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(inter.x, inter.y, 2, 0, Math.PI * 2);
    ctx.fill();
}

function drawMissileIncoming(inc) {
    // Bright red trail from origin to current position, with a small bright head
    // and a cosmetic label rendered above the head.
    ctx.strokeStyle = '#FF3B30';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(inc.originX, inc.originY);
    ctx.lineTo(inc.x, inc.y);
    ctx.stroke();

    ctx.fillStyle = '#FFCDD2';
    ctx.beginPath();
    ctx.arc(inc.x, inc.y, 3, 0, Math.PI * 2);
    ctx.fill();

    if (inc.label) {
        ctx.save();
        ctx.fillStyle = '#FF8A80';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(inc.label, inc.x + 6, inc.y - 4);
        ctx.restore();
    }
}

function drawMissileExplosion(exp) {
    if (exp.radius <= 0) return;
    var p = exp.timer / exp.duration;
    ctx.save();
    ctx.globalAlpha = 0.85 * (1 - p);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0 * (1 - p);
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawMissileWorld() {
    drawTerrain();
    for (var i = 0; i < missileBuildings.length; i++) {
        drawMissileBuilding(missileBuildings[i]);
    }
    for (var i = 0; i < missileBatteries.length; i++) {
        drawMissileBattery(missileBatteries[i]);
    }
    for (var i = 0; i < missileInterceptors.length; i++) {
        drawMissileInterceptor(missileInterceptors[i]);
    }
    for (var i = 0; i < missileIncoming.length; i++) {
        drawMissileIncoming(missileIncoming[i]);
    }
    for (var i = 0; i < missileExplosions.length; i++) {
        drawMissileExplosion(missileExplosions[i]);
    }
    drawMissileCrosshair();
}

function renderMissileTransition() {
    drawMissileWorld();
    // Ship is intentionally hidden — player will control batteries, not the ship.

    // Flashing "INCOMING MERGE CONFLICTS!" banner (~3 Hz flash)
    var flashOn = Math.floor(missileTransitionTimer * 6) % 2 === 0;
    if (flashOn) {
        ctx.fillStyle = '#F44336';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('INCOMING MERGE CONFLICTS!', canvas.width / 2, 60);
    }
}

function renderMissilePlaying() {
    drawMissileWorld();

    ctx.fillStyle = '#F44336';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MISSILE COMMAND', canvas.width / 2, 30);

    ctx.fillStyle = '#ECEFF1';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Intercepted: ' + missilesIntercepted, 20, 24);
    ctx.fillText('Score: ' + missileScore, 20, 44);

    ctx.textAlign = 'right';
    ctx.fillText('Arrows to aim · Space to fire', canvas.width - 20, 24);
}

function renderInvaderReturn() {
    // Draw terrain (still flat from invader phase)
    drawTerrain();

    // Draw ship rotating back to vertical
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null);

    // Status text
    ctx.fillStyle = '#4FC3F7';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RETURNING TO MISSION', canvas.width / 2, 60);

    // Show bonus points earned
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Bonus: +' + invaderScore + ' pts', canvas.width / 2, 95);
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
        case STATES.SCENE_LIFTOFF:
            renderSceneLiftoff();
            break;
        case STATES.SCENE_SCROLL:
            renderSceneScroll();
            break;
        case STATES.SCENE_DESCENT:
            renderSceneDescent();
            break;
        case STATES.SCENE_COUNTDOWN:
            renderSceneCountdown();
            break;
        case STATES.INVADER_SCROLL_ROTATE:
            renderInvaderScrollRotate();
            break;
        case STATES.INVADER_TRANSITION:
            renderInvaderTransition();
            break;
        case STATES.INVADER_PLAYING:
            renderInvaderPlaying();
            break;
        case STATES.INVADER_COMPLETE:
            renderInvaderComplete();
            break;
        case STATES.INVADER_RETURN:
            renderInvaderReturn();
            break;
        case STATES.BUGFIX_TRANSITION:
            renderBugfixTransition();
            break;
        case STATES.BUGFIX_PLAYING:
            renderBugfixPlaying();
            break;
        case STATES.BUGFIX_COMPLETE:
            renderBugfixComplete();
            break;
        case STATES.BUGFIX_RETURN:
            renderBugfixReturn();
            break;
        case STATES.MISSILE_TRANSITION:
            renderMissileTransition();
            break;
        case STATES.MISSILE_PLAYING:
            renderMissilePlaying();
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
