// --- Render Module ---
// Extracted from IIFE: all screen rendering functions and HUD drawing logic

// Hit-box for ProxiBlue branding on the Game Over screen; set on each render
// frame while the leaderboard is visible, read by the canvas click handler.
var proxiblueBrandHitBox = null;

function renderMenu() {
    var cx = canvas.width / 2;
    var baseY = canvas.height / 2 - 120;

    // Fan-creation disclaimer (bottom of screen, visually secondary)
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('This is a fan-made game compilation by ProxiBlue. It is not official or associated with Mage-OS.', cx, canvas.height - 16);

    // Draw ship logo on menu (Mage-OS "M" logo)
    drawShip(cx, baseY, 0, 60, false, null, false);

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

    // ProxiBlue branding — subtle, unobtrusive
    ctx.fillStyle = '#667';
    ctx.font = '12px monospace';
    ctx.fillText('Crafted with \u2615 by ProxiBlue', cx, controlsY + 94);

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
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, ship.thrusting, ship.rotating, false);

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

    // Wind indicator — centered bottom of screen with blow icon
    if (wind.maxStrength > 0) {
        var windCX = canvas.width / 2;
        var windCY = canvas.height - 58;
        var windStr = Math.abs(wind.strength);
        var windDir = wind.strength >= 0 ? 1 : -1; // 1 = right, -1 = left
        var windPct = wind.maxStrength > 0 ? windStr / wind.maxStrength : 0;

        // Strength number above icon
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        var windColor = windPct > 0.6 ? '#f44336' : windPct > 0.3 ? '#FFC107' : '#4FC3F7';
        ctx.fillStyle = windColor;
        ctx.fillText(windStr.toFixed(1) + ' m/s', windCX, windCY - 28);

        // Wind blow icon — three wavy lines that flip direction (2x size)
        ctx.save();
        ctx.translate(windCX, windCY);
        if (windDir < 0) {
            ctx.scale(-1, 1);
        }

        var iconAlpha = 0.4 + windPct * 0.6;
        ctx.strokeStyle = 'rgba(79, 195, 247, ' + iconAlpha + ')';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        // Three wavy airflow lines at different vertical offsets (doubled spacing)
        var waveOffsets = [-12, 0, 12];
        var waveLen = 24 + windPct * 16;
        var waveAmp = 4 + windPct * 4;
        for (var wi = 0; wi < waveOffsets.length; wi++) {
            var wy = waveOffsets[wi];
            var wx = -waveLen + wi * 6;
            ctx.beginPath();
            ctx.moveTo(wx, wy);
            ctx.quadraticCurveTo(wx + waveLen * 0.25, wy - waveAmp, wx + waveLen * 0.5, wy);
            ctx.quadraticCurveTo(wx + waveLen * 0.75, wy + waveAmp, wx + waveLen, wy);
            ctx.stroke();
            // Arrow tip at the end of each wave
            ctx.beginPath();
            ctx.moveTo(wx + waveLen, wy);
            ctx.lineTo(wx + waveLen - 8, wy - 5);
            ctx.moveTo(wx + waveLen, wy);
            ctx.lineTo(wx + waveLen - 8, wy + 5);
            ctx.stroke();
        }

        ctx.restore();

        // "CALM" label when wind is near zero
        if (windStr < 0.1) {
            ctx.fillStyle = '#4FC3F7';
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('CALM', windCX, windCY + 5);
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
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null, false);

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
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, true, null, false);

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
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, true, null, false);

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
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null, false);

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
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, true, thrusterDir, false);

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
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null, false);

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
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null, false);

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
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, ship.thrusting, ship.rotating, ship.retroThrusting);

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
    ctx.fillText('SPACE to shoot | Arrows / WASD to thrust', canvas.width / 2, canvas.height - 30);
}

function renderInvaderComplete() {
    // Draw terrain
    drawTerrain();

    // Draw ship
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null, false);

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

    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, ship.thrusting, ship.rotating, false);
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
    var left = b.x - b.width / 2;

    // Destroyed buildings render as a low jagged rubble silhouette (AC#2).
    // Rubble uses #444 per AC.
    if (b.destroyed) {
        var rubbleH = 8;
        var rubbleTop = b.baseY - rubbleH;
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.moveTo(left, b.baseY);
        ctx.lineTo(left, rubbleTop + 2);
        ctx.lineTo(left + b.width * 0.2, rubbleTop + 5);
        ctx.lineTo(left + b.width * 0.4, rubbleTop);
        ctx.lineTo(left + b.width * 0.6, rubbleTop + 4);
        ctx.lineTo(left + b.width * 0.8, rubbleTop + 1);
        ctx.lineTo(left + b.width, rubbleTop + 3);
        ctx.lineTo(left + b.width, b.baseY);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.stroke();
        return;
    }

    // Healthy silhouette: bright green (#00cc88) rectangle. AC#2.
    var top = b.baseY - b.height;
    ctx.fillStyle = '#00cc88';
    ctx.fillRect(left, top, b.width, b.height);
    ctx.strokeStyle = '#00794d';
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, b.width - 1, b.height - 1);

    if (b.label) {
        ctx.fillStyle = '#ECEFF1';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(b.label, b.x, top - 4);
    }
}

function drawMissileBattery(bat) {
    // AC#3: triangular/dome silhouette. Bright green active, dark grey destroyed.
    // Ammo count displayed above when active.
    var bodyW = 32;
    var bodyH = 18;
    var apexY = bat.y - bodyH;
    var leftX = bat.x - bodyW / 2;
    var rightX = bat.x + bodyW / 2;

    if (bat.destroyed) {
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.moveTo(leftX, bat.y);
        ctx.lineTo(leftX + bodyW * 0.3, bat.y - 4);
        ctx.lineTo(bat.x - 2, bat.y - 2);
        ctx.lineTo(bat.x + 3, bat.y - 5);
        ctx.lineTo(rightX - bodyW * 0.25, bat.y - 3);
        ctx.lineTo(rightX, bat.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.stroke();
        return;
    }

    // Dome: filled triangle with rounded top.
    ctx.fillStyle = '#00cc88';
    ctx.strokeStyle = '#00794d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftX, bat.y);
    ctx.lineTo(leftX + 4, apexY + 6);
    ctx.quadraticCurveTo(bat.x, apexY - 4, rightX - 4, apexY + 6);
    ctx.lineTo(rightX, bat.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Ammo count above the dome.
    ctx.fillStyle = '#ECEFF1';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(bat.ammo), bat.x, apexY - 4);
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

    // Bright red head (AC#5).
    ctx.fillStyle = '#ff2200';
    ctx.beginPath();
    ctx.arc(inc.x, inc.y, 3, 0, Math.PI * 2);
    ctx.fill();

    if (inc.label) {
        ctx.save();
        ctx.fillStyle = '#ff8a80';
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
    // AC#6: interceptor detonation → translucent cyan/white expanding-shrinking
    // circle. AC#7 impact (building/battery struck) → red/orange tint.
    if (exp.kind === 'impact') {
        ctx.globalAlpha = 0.7 * (1 - p);
        ctx.fillStyle = '#ff8a00';
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0 * (1 - p);
        ctx.strokeStyle = '#ff3300';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        ctx.globalAlpha = 0.6 * (1 - p);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0 * (1 - p);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

function drawMissileDestructionParticles() {
    if (!missileDestructionParticles.length) return;
    ctx.save();
    for (var i = 0; i < missileDestructionParticles.length; i++) {
        var p = missileDestructionParticles[i];
        var alpha = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * alpha), 0, Math.PI * 2);
        ctx.fill();
    }
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
    drawMissileDestructionParticles();
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

    // AC#9 HUD: wave indicator, missiles remaining in wave, buildings
    // surviving, ammo total across batteries, score. Replaces altitude/velocity.
    var buildingsAlive = 0;
    for (var bi = 0; bi < missileBuildings.length; bi++) {
        if (!missileBuildings[bi].destroyed) buildingsAlive++;
    }
    var ammoTotal = 0;
    for (var ai = 0; ai < missileBatteries.length; ai++) {
        if (!missileBatteries[ai].destroyed) ammoTotal += missileBatteries[ai].ammo;
    }
    var missilesLeftInWave = missileIncoming.length +
        (typeof missileWaveSpawnQueue !== 'undefined' ? missileWaveSpawnQueue.length : 0);

    ctx.fillStyle = '#ECEFF1';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('WAVE ' + missileWaveCurrent + ' / ' + missileWaveTotal, 20, 24);
    ctx.fillText('Missiles left: ' + missilesLeftInWave, 20, 44);
    ctx.fillText('Buildings: ' + buildingsAlive + ' / ' + MISSILE_BUILDING_COUNT, 20, 64);
    ctx.fillText('Ammo: ' + ammoTotal, 20, 84);
    ctx.fillText('Score: ' + missileScore, 20, 104);

    ctx.textAlign = 'right';
    ctx.fillText('Arrows to aim · Space to fire', canvas.width - 20, 24);

    // "WAVE N/M" banner (AC#4). Visible while missileWaveAnnounceTimer > 0 —
    // set on each spawnMissileWave() call and ticked down in the update block.
    if (missileWaveAnnounceTimer > 0) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('WAVE ' + missileWaveCurrent + ' / ' + missileWaveTotal,
                     canvas.width / 2, 80);
    }
}

// Results screen shown after all waves cleared with at least one building
// surviving (AC#5). Lingering explosions/particles continue to tick via the
// MISSILE_COMPLETE update block so the scene finishes its effects cleanly.
function renderMissileComplete() {
    drawMissileWorld();

    var cx = canvas.width / 2;
    var cy = canvas.height / 2;

    ctx.fillStyle = '#4CAF50';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CODEBASE DEFENDED!', cx, cy - 90);

    ctx.fillStyle = '#E0E0E0';
    ctx.font = '20px sans-serif';
    ctx.fillText('Missiles intercepted: ' + missilesIntercepted + ' / ' + missilesTotal,
                 cx, cy - 45);
    ctx.fillText('Buildings surviving: ' + missileBuildingSurvivors + ' / ' + MISSILE_BUILDING_COUNT,
                 cx, cy - 18);
    ctx.fillText('Ammo bonus: +' + missileAmmoBonusPoints + ' pts',
                 cx, cy + 9);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Total bonus: +' + missileEndBonus + ' pts', cx, cy + 45);

    ctx.fillStyle = '#888';
    ctx.font = '18px sans-serif';
    ctx.fillText('Returning to mission...', cx, cy + 80);
}

// Missile return: ship rotates counter-clockwise from π/2 (sideways) back to 0
// (upright) over MISSILE_RETURN_ROTATION_DURATION seconds before the state
// machine advances to PLAYING. Mirrors renderInvaderReturn.
function renderMissileReturn() {
    drawTerrain();
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null, false);

    ctx.fillStyle = '#4FC3F7';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RETURNING TO MISSION', canvas.width / 2, 60);

    if (missileEndBonus > 0) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('Bonus: +' + missileEndBonus + ' pts', canvas.width / 2, 95);
    }
}

function renderInvaderReturn() {
    // Draw terrain (still flat from invader phase)
    drawTerrain();

    // Draw ship rotating back to vertical
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null, false);

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

// --- Tech Debt Blaster drawing helpers ---

// Draw one tech-debt asteroid: rocky 8-sided polygon rotated by a.rotation, with
// the asteroid's label overlaid at center (label is unrotated for readability).
// ProxiBlue power-up variants use a cyan palette + canvas shadow glow.
function drawTechdebtAsteroid(a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rotation);

    // US-014 AC#2: jagged silhouette with 8-10 vertices and random radial
    // offsets (stored per-asteroid on `a.shape` at spawn so the shape is
    // stable frame-to-frame while being distinct across the field). Fallback
    // to a deterministic 8-vertex shape if shape data is missing (defensive
    // against test fixtures that construct asteroids directly).
    var shape = a.shape;
    if (!shape || !shape.length) {
        shape = [];
        for (var si = 0; si < 8; si++) {
            shape.push(0.82 + 0.28 * Math.abs(Math.sin(si * 2.3 + 1.1)));
        }
    }
    var pts = shape.length;
    ctx.beginPath();
    for (var i = 0; i < pts; i++) {
        var ang = (i / pts) * Math.PI * 2;
        var rr = a.size * shape[i];
        var ppx = Math.cos(ang) * rr;
        var ppy = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(ppx, ppy);
        else ctx.lineTo(ppx, ppy);
    }
    ctx.closePath();

    if (a.isProxiblue) {
        // US-014 AC#4: ProxiBlue asteroids rendered in `#4488ff` with a
        // glow/pulse effect. Pulse the shadowBlur over time so the asteroid
        // visibly breathes, making it easy for the player to spot as a
        // collectible power-up. Drive the pulse from performance.now() so
        // every ProxiBlue pulses in sync without per-entity timer state.
        var pulseT = (typeof performance !== 'undefined' && performance.now)
            ? performance.now() * 0.001
            : Date.now() * 0.001;
        var pulse = 0.5 + 0.5 * Math.sin(pulseT * 4); // 0..1
        ctx.shadowColor = '#4488ff';
        ctx.shadowBlur = 14 + pulse * 14; // 14..28 px
        ctx.fillStyle = '#4488ff';
    } else {
        // US-014 AC#2: normal asteroids are `#888` grey (classic Asteroids look).
        ctx.fillStyle = '#888';
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = a.isProxiblue ? '#81D4FA' : '#aaa';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Label orbiting around the asteroid like a sign, spinning slowly
    if (a.label && a.size >= TECHDEBT_SIZE_SMALL) {
        ctx.save();
        ctx.translate(a.x, a.y);
        var labelRadius = a.size + 8;
        var fontSize = a.size >= TECHDEBT_SIZE_LARGE ? 11 : 9;
        ctx.font = 'bold ' + fontSize + 'px monospace';
        ctx.fillStyle = a.isProxiblue ? '#FFFFFF' : '#ECEFF1';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var chars = a.label.split('');
        var arcSpan = Math.min(chars.length * 0.2, Math.PI * 1.2);
        var startAngle = a.rotation * 0.3 - arcSpan / 2;
        for (var ci = 0; ci < chars.length; ci++) {
            var charAngle = startAngle + (ci / Math.max(chars.length - 1, 1)) * arcSpan;
            var cx2 = Math.cos(charAngle) * labelRadius;
            var cy2 = Math.sin(charAngle) * labelRadius;
            ctx.save();
            ctx.translate(cx2, cy2);
            ctx.rotate(charAngle + Math.PI / 2);
            ctx.fillText(chars[ci], 0, 0);
            ctx.restore();
        }
        ctx.restore();
    }
}

function renderTechdebtTransition() {
    // US-014 AC#7/#8: background is pure starfield (already drawn by render()
    // before this function runs) — no terrain drawn during TECHDEBT_* states.

    // Asteroids behind the ship so the ship reads as the focal point.
    for (var i = 0; i < techdebtAsteroids.length; i++) {
        drawTechdebtAsteroid(techdebtAsteroids[i]);
    }

    // Ship rendered upright at canvas center (already positioned by update).
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null, false);

    // HUD panel (asteroids remaining, fuel, score, shield status).
    drawTechdebtHUD();

    // AC: brief "TECH DEBT INCOMING..." text flashes during transition.
    // ~3 Hz flash matches renderMissileTransition's cadence for consistency.
    var flashOn = Math.floor(techdebtTransitionTimer * 6) % 2 === 0;
    if (flashOn) {
        ctx.fillStyle = '#F37121';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('TECH DEBT INCOMING...', canvas.width / 2, 60);
    }
}

function renderTechdebtPlaying() {
    // Open starfield only — no terrain. Stars are already drawn by render()
    // before this function runs.
    for (var i = 0; i < techdebtAsteroids.length; i++) {
        drawTechdebtAsteroid(techdebtAsteroids[i]);
    }

    // Draw bullets as short bright orange line segments oriented along
    // their travel direction. Matches the invader bullet colour (#F37121).
    if (techdebtBullets.length > 0) {
        ctx.save();
        ctx.strokeStyle = BULLET_COLOR;
        ctx.lineWidth = 3;
        ctx.shadowColor = BULLET_COLOR;
        ctx.shadowBlur = 6;
        for (var bi = 0; bi < techdebtBullets.length; bi++) {
            var b = techdebtBullets[bi];
            var mag = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
            var dx = (b.vx / mag) * BULLET_SIZE;
            var dy = (b.vy / mag) * BULLET_SIZE;
            ctx.beginPath();
            ctx.moveTo(b.x - dx, b.y - dy);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Hit-burst particles from destroyed/split asteroids (US-008). Fade with
    // remaining life so the burst looks like dust scattering then settling.
    if (techdebtParticles.length > 0) {
        ctx.save();
        for (var pi = 0; pi < techdebtParticles.length; pi++) {
            var p = techdebtParticles[pi];
            var alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, ship.thrusting, ship.rotating, ship.retroThrusting || false);

    // Shield ring around the ship (US-013 AC#1). Translucent blue circle,
    // radius ~25px, pulsing alpha driven by a sine on the shield timer so the
    // ring breathes while active.
    if (proxiblueShieldActive) {
        var pulse = 0.35 + 0.25 * Math.sin(proxiblueShieldTimer * 6);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#4488ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, 25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = Math.max(0, pulse - 0.2);
        ctx.fillStyle = '#4488ff';
        ctx.fill();
        ctx.restore();
    }

    // Blue shield-absorb flash (US-009). Full-screen blue tint fading over
    // PROXIBLUE_SHIELD_FLASH_DURATION so the player gets clear feedback that
    // the shield just absorbed an asteroid hit.
    if (proxiblueShieldFlashTimer > 0) {
        var flashAlpha = Math.min(1, proxiblueShieldFlashTimer / PROXIBLUE_SHIELD_FLASH_DURATION) * 0.5;
        ctx.save();
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = PROXIBLUE_COLOR;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    drawTechdebtShieldHUD();
    drawTechdebtHUD();
}

// US-014 AC#9: tech-debt HUD panel — replaces the lander's altitude/velocity
// panel with mini-game-specific info: asteroids remaining, fuel, score, and
// shield status. Rendered at top-left across all TECHDEBT_* states for
// visual continuity with the existing HUD placement.
function drawTechdebtHUD() {
    var fuelPct = ship.fuel / FUEL_MAX;
    var asteroidsRemaining = techdebtAsteroids.length;

    ctx.save();
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Asteroids remaining
    ctx.fillStyle = '#fff';
    ctx.fillText('Asteroids: ' + asteroidsRemaining, 10, 25);

    // Score (global score incl. tech-debt contributions)
    ctx.fillStyle = '#FFD700';
    ctx.fillText('Score: ' + score, 10, 45);

    // Shield status (replaces the altitude/velocity readout; detailed
    // countdown bar lives in drawTechdebtShieldHUD at the bottom-left).
    if (proxiblueShieldActive) {
        ctx.fillStyle = '#4488ff';
        ctx.fillText('Shield: ACTIVE ' + proxiblueShieldTimer.toFixed(1) + 's', 10, 65);
    } else {
        ctx.fillStyle = '#888';
        ctx.fillText('Shield: OFF', 10, 65);
    }

    // Fuel bar (same visual language as the lander HUD for consistency).
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
    ctx.fillRect(fuelBarX, fuelBarY, fuelBarW * Math.max(0, Math.min(1, fuelPct)), fuelBarH);

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(fuelBarX, fuelBarY, fuelBarW, fuelBarH);

    ctx.fillStyle = '#fff';
    ctx.fillText('Fuel: ' + Math.round(fuelPct * 100) + '%', fuelBarX + fuelBarW + 8, fuelBarY + 12);

    ctx.restore();
}

// US-013 AC#2: HUD shield indicator — shows "🛡 ProxiBlue" label in #4488ff
// plus a small countdown bar that depletes over PROXIBLUE_SHIELD_DURATION.
// Rendered only while the shield is active; disappears cleanly when it expires.
function drawTechdebtShieldHUD() {
    if (!proxiblueShieldActive) return;

    var barW = 120;
    var barH = 8;
    var barX = 10;
    var barY = canvas.height - 40;
    var labelY = barY - 6;
    var pct = Math.max(0, Math.min(1, proxiblueShieldTimer / PROXIBLUE_SHIELD_DURATION));

    ctx.save();

    ctx.fillStyle = '#4488ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('\uD83D\uDEE1 ProxiBlue', barX, labelY);

    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = '#4488ff';
    ctx.fillRect(barX, barY, barW * pct, barH);

    ctx.strokeStyle = '#4488ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.restore();
}

function renderTechdebtComplete() {
    // Keep the play field visible underneath so celebration particles read in
    // context. Trailing particles + ship remain on screen as they fade.
    if (techdebtParticles.length > 0) {
        ctx.save();
        for (var pi = 0; pi < techdebtParticles.length; pi++) {
            var p = techdebtParticles[pi];
            var alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null, false);

    // Reuse the shared celebration particle system (spawned on entry in update.js).
    drawCelebration();

    // Keep the HUD panel visible on the results screen so the player can see
    // their final fuel/score state alongside the breakdown overlay.
    drawTechdebtHUD();

    // Results overlay (US-014 AC#10 — "TECH DEBT CLEARED!" + score breakdown).
    var cx = canvas.width / 2;
    var cy = canvas.height / 2;

    ctx.fillStyle = '#4CAF50';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TECH DEBT CLEARED!', cx, cy - 75);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('Asteroids Destroyed: ' + asteroidsDestroyed, cx, cy - 30);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Fuel Bonus: +' + techdebtFuelBonus + ' pts', cx, cy + 5);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Score: ' + score, cx, cy + 40);

    ctx.fillStyle = '#888';
    ctx.font = '18px sans-serif';
    ctx.fillText('Returning to mission...', cx, cy + 80);
}

// US-012: render a short trail behind a Code Breaker ball at decreasing
// opacity. During Fireball the trail swaps to a red/orange flame palette. The
// newest position (index 0) is brightest; oldest fades to invisible.
function drawBreakoutBallTrail(trail, fireActive) {
    if (!trail || trail.length === 0) return;
    ctx.save();
    for (var ti = trail.length - 1; ti >= 0; ti--) {
        var t = trail[ti];
        var fade = 1 - (ti + 1) / (BREAKOUT_BALL_TRAIL_LEN + 1);
        ctx.globalAlpha = Math.max(0, fade * 0.7);
        if (fireActive) {
            // Alternate flame colours for a 2-tone flicker.
            ctx.fillStyle = (ti % 2 === 0) ? '#FF6F00' : '#FFC107';
        } else {
            ctx.fillStyle = '#fff';
        }
        var r = BREAKOUT_BALL_RADIUS * (1 - ti * 0.15);
        if (r < 1) r = 1;
        ctx.beginPath();
        ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

// US-012: Code Breaker HUD — replaces the lander's altitude/velocity panel
// while any BREAKOUT_* state is active. Shows bricks remaining, extra balls,
// the active power-up + a timer bar for timed effects, and the global score.
function drawBreakoutHUD() {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    var bricksLeft = breakoutBricks.length;
    var x = 10;

    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('Bricks: ' + bricksLeft, x, 25);
    ctx.fillText('Extra Balls: ' + breakoutExtraBalls, x, 45);

    if (breakoutActivePowerup) {
        var puColor;
        var puDuration = 0;
        var puLabel;
        if (breakoutActivePowerup === 'fire') {
            puColor = '#F44336';
            puDuration = BREAKOUT_POWERUP_FIRE_DURATION;
            puLabel = 'FIREBALL';
        } else if (breakoutActivePowerup === 'wide') {
            puColor = '#4CAF50';
            puDuration = BREAKOUT_POWERUP_WIDE_DURATION;
            puLabel = 'WIDE PADDLE';
        } else {
            puColor = '#ccc';
            puLabel = breakoutActivePowerup.toUpperCase();
        }
        ctx.fillStyle = puColor;
        ctx.fillText('Power: ' + puLabel, x, 65);

        if (puDuration > 0) {
            var barW = 120, barH = 8;
            var barY = 72;
            var fill = Math.max(0, Math.min(1, breakoutPowerupTimer / puDuration));
            ctx.fillStyle = '#333';
            ctx.fillRect(x, barY, barW, barH);
            ctx.fillStyle = puColor;
            ctx.fillRect(x, barY, barW * fill, barH);
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, barY, barW, barH);
        }
    }

    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('Score: ' + score, x, 100);
    ctx.restore();
}

// Shared Code Breaker world draw: bricks (gated by per-row revealAt so the
// cascade naturally plays during BREAKOUT_TRANSITION and all rows are visible
// during BREAKOUT_PLAYING), the flipped M paddle, and the stationary ball.
// Terrain is intentionally not drawn — background is pure starfield (already
// drawn by render() before this fn runs).
function drawBreakoutWorld() {
    // Bricks (US-012: rounded rect per AC; crack overlay when hp < maxHp).
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var brickRadius = 4;
    for (var i = 0; i < breakoutBricks.length; i++) {
        var b = breakoutBricks[i];
        if (b.revealAt > breakoutTransitionTimer) continue;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.moveTo(b.x + brickRadius, b.y);
        ctx.lineTo(b.x + b.w - brickRadius, b.y);
        ctx.quadraticCurveTo(b.x + b.w, b.y, b.x + b.w, b.y + brickRadius);
        ctx.lineTo(b.x + b.w, b.y + b.h - brickRadius);
        ctx.quadraticCurveTo(b.x + b.w, b.y + b.h, b.x + b.w - brickRadius, b.y + b.h);
        ctx.lineTo(b.x + brickRadius, b.y + b.h);
        ctx.quadraticCurveTo(b.x, b.y + b.h, b.x, b.y + b.h - brickRadius);
        ctx.lineTo(b.x, b.y + brickRadius);
        ctx.quadraticCurveTo(b.x, b.y, b.x + brickRadius, b.y);
        ctx.closePath();
        ctx.fill();
        // Flash overlay on bricks that took non-lethal damage (US-007).
        if (b.flashTimer > 0) {
            ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.8, b.flashTimer / 0.12) + ')';
            ctx.fill();
        }
        // US-012: diagonal crack overlay on damaged (hp < maxHp) bricks.
        if (b.hp < b.maxHp) {
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(b.x + 4, b.y + b.h - 4);
            ctx.lineTo(b.x + b.w - 4, b.y + 4);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.font = '8px monospace';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    }
    ctx.restore();

    // Brick-burst particles (US-007): faded per remaining life.
    if (breakoutParticles.length > 0) {
        ctx.save();
        for (var pi = 0; pi < breakoutParticles.length; pi++) {
            var p = breakoutParticles[pi];
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // US-012: faint glow below the paddle adds visual polish. Radial gradient
    // centred on the paddle's bottom edge, fading outward — sits behind the
    // paddle sprite so the M reads cleanly on top.
    var glowCenterX = breakoutPaddleX + breakoutPaddleWidth / 2;
    var glowY = canvas.height - BREAKOUT_PADDLE_Y_OFFSET + BREAKOUT_PADDLE_HEIGHT / 2;
    var glowRadius = breakoutPaddleWidth;
    ctx.save();
    var paddleGlow = ctx.createRadialGradient(
        glowCenterX, glowY, 2,
        glowCenterX, glowY, glowRadius
    );
    paddleGlow.addColorStop(0, 'rgba(242, 99, 34, 0.35)');
    paddleGlow.addColorStop(1, 'rgba(242, 99, 34, 0)');
    ctx.fillStyle = paddleGlow;
    ctx.fillRect(glowCenterX - glowRadius, glowY - 8,
                 glowRadius * 2, glowRadius + 12);
    ctx.restore();

    // Paddle = M ship drawn at its current (animated) angle + position. Size
    // tracks the live `breakoutPaddleWidth` (may be scaled by the Wide
    // power-up in US-008) so the sprite matches the hitbox exactly.
    var paddleDrawSize = breakoutPaddleWidth / LOGO_DRAW_RATIO;
    drawShip(ship.x, ship.y, ship.angle, paddleDrawSize, false, null, false);

    // US-012: ball trails (primary + extras) — fireball swaps to a flame palette.
    var fireOn = (breakoutActivePowerup === 'fire');
    drawBreakoutBallTrail(breakoutBallTrail, fireOn);
    for (var eti = 0; eti < breakoutBalls.length; eti++) {
        drawBreakoutBallTrail(breakoutBalls[eti].trail, fireOn);
    }

    // Primary ball — stationary on the paddle at launch, bouncing otherwise.
    // When Fireball is active, swap to a red core so the buff is visible.
    var ballFill = fireOn ? '#F44336' : '#fff';
    ctx.save();
    ctx.fillStyle = ballFill;
    ctx.beginPath();
    ctx.arc(breakoutBallX, breakoutBallY, BREAKOUT_BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    // Additional balls spawned by Multi-Ball (US-008).
    for (var ebi = 0; ebi < breakoutBalls.length; ebi++) {
        var eBall = breakoutBalls[ebi];
        ctx.beginPath();
        ctx.arc(eBall.x, eBall.y, BREAKOUT_BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // Falling power-up pills (US-008). Rounded rect with letter on top and
    // label below; colour-coded by type.
    if (breakoutPowerups.length > 0) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (var pui = 0; pui < breakoutPowerups.length; pui++) {
            var pup = breakoutPowerups[pui];
            var pupW = pup.size * 2.5;
            var pupH = pup.size;
            var pupX = pup.x - pupW / 2;
            var pupY = pup.y - pupH / 2;
            var pupR = Math.min(pupH / 2, 8);
            ctx.fillStyle = pup.color;
            ctx.beginPath();
            ctx.moveTo(pupX + pupR, pupY);
            ctx.lineTo(pupX + pupW - pupR, pupY);
            ctx.quadraticCurveTo(pupX + pupW, pupY, pupX + pupW, pupY + pupR);
            ctx.lineTo(pupX + pupW, pupY + pupH - pupR);
            ctx.quadraticCurveTo(pupX + pupW, pupY + pupH, pupX + pupW - pupR, pupY + pupH);
            ctx.lineTo(pupX + pupR, pupY + pupH);
            ctx.quadraticCurveTo(pupX, pupY + pupH, pupX, pupY + pupH - pupR);
            ctx.lineTo(pupX, pupY + pupR);
            ctx.quadraticCurveTo(pupX, pupY, pupX + pupR, pupY);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.font = 'bold 11px monospace';
            ctx.fillText(pup.letter, pup.x - pupW / 2 + pupH / 2, pup.y);
            ctx.font = '9px monospace';
            ctx.fillText(pup.label, pup.x + pupH / 2, pup.y);
        }
        ctx.restore();
    }
}

// Draw the side-scrolling drive world: terrain strip (filled polygon + surface
// line), rocks, pickups, and the destination pad at world-X = driveRoadLength.
// Translates world coordinates to screen via `- driveScrollX`. Shared by the
// transition and (future) playing renderers so the world reads identically
// across those states.
function drawDriveWorld() {
    if (driveRoadSegments.length === 0) {
        return;
    }
    var scrollX = driveScrollX;
    var segW = 20;
    var firstIdx = Math.max(0, Math.floor(scrollX / segW) - 1);
    var lastIdx = Math.min(
        driveRoadSegments.length - 1,
        Math.ceil((scrollX + canvas.width) / segW) + 1
    );

    ctx.save();
    ctx.fillStyle = '#444';
    ctx.beginPath();
    var sFirst = driveRoadSegments[firstIdx];
    ctx.moveTo(sFirst.x - scrollX, canvas.height);
    ctx.lineTo(sFirst.x - scrollX, sFirst.y);
    for (var fi = firstIdx; fi <= lastIdx; fi++) {
        var fs = driveRoadSegments[fi];
        ctx.lineTo(fs.x - scrollX, fs.y);
        ctx.lineTo(fs.x - scrollX + segW, fs.y);
    }
    var sLast = driveRoadSegments[lastIdx];
    ctx.lineTo(sLast.x - scrollX + segW, canvas.height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#777';
    ctx.lineWidth = 2;
    ctx.beginPath();
    var surfFirst = driveRoadSegments[firstIdx];
    ctx.moveTo(surfFirst.x - scrollX, surfFirst.y);
    for (var gi = firstIdx; gi <= lastIdx; gi++) {
        var gs = driveRoadSegments[gi];
        ctx.lineTo(gs.x - scrollX, gs.y);
        ctx.lineTo(gs.x - scrollX + segW, gs.y);
    }
    ctx.stroke();
    ctx.restore();

    // Rocks
    for (var ri = 0; ri < driveObstacles.length; ri++) {
        var rock = driveObstacles[ri];
        var rx = rock.x - scrollX;
        if (rx < -60 || rx > canvas.width + 60) continue;
        ctx.save();
        ctx.fillStyle = '#996633';
        ctx.beginPath();
        ctx.moveTo(rx - rock.size / 2, rock.y);
        ctx.lineTo(rx + rock.size / 2, rock.y);
        ctx.lineTo(rx, rock.y - rock.size);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // Pickups — simple rotating diamonds
    var spin = (typeof driveTransitionTimer === 'number' ? driveTransitionTimer : 0) * 2;
    for (var pi = 0; pi < drivePickups.length; pi++) {
        var pu = drivePickups[pi];
        if (pu.collected) continue;
        var px = pu.x - scrollX;
        if (px < -40 || px > canvas.width + 40) continue;
        ctx.save();
        ctx.translate(px, pu.y);
        ctx.rotate(spin);
        ctx.fillStyle = '#4CAF50';
        ctx.shadowColor = '#4CAF50';
        ctx.shadowBlur = 6;
        ctx.fillRect(-pu.size / 2, -pu.size / 2, pu.size, pu.size);
        ctx.restore();
    }

    // Destination pad at end of road
    var destX = driveRoadLength - scrollX;
    if (destX >= -120 && destX <= canvas.width + 120) {
        var destSegIdx = driveRoadSegments.length - 1;
        var destY = driveRoadSegments[destSegIdx].y;
        var padWidth = 80;
        var padColor = PR_TYPE_COLORS.feature;

        ctx.save();
        ctx.shadowColor = padColor;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = padColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(destX, destY);
        ctx.lineTo(destX + padWidth, destY);
        ctx.stroke();
        ctx.restore();

        var bannerText;
        if (typeof landedPRTitle === 'string' && landedPRTitle.length > 0) {
            bannerText = landedPRTitle.length > 40
                ? landedPRTitle.slice(0, 37) + '...'
                : landedPRTitle;
        } else {
            bannerText = 'FEATURE COMPLETE';
        }
        ctx.save();
        ctx.fillStyle = '#FFEB3B';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(bannerText, destX + padWidth / 2, destY - 18);
        ctx.restore();
    }
}

// DRIVE_TRANSITION — intro beat between landing and driving. Camera sits at
// scroll=0 so the buggy renders at canvas.width * 0.25 (giving forward
// visibility per AC). Two wheels scale from 0 to DRIVE_WHEEL_RADIUS with a
// cubic ease-out over the first 0.5s, then stay at full size. A flashing
// "DEPLOY FEATURE!" banner runs throughout the transition window.
function renderDriveTransition() {
    drawDriveWorld();

    var buggyScreenX = canvas.width * 0.25;
    var buggyScreenY = driveBuggyY;

    drawShip(buggyScreenX, buggyScreenY, 0, SHIP_SIZE, false, null, false);

    var wheelT = Math.min(driveTransitionTimer / 0.5, 1);
    var eased = 1 - Math.pow(1 - wheelT, 3);
    var wheelRadius = DRIVE_WHEEL_RADIUS * eased;
    if (wheelRadius > 0.5) {
        var wheelLX = buggyScreenX - DRIVE_WHEEL_OFFSET_X;
        var wheelRX = buggyScreenX + DRIVE_WHEEL_OFFSET_X;
        var wheelY = buggyScreenY + DRIVE_WHEEL_OFFSET_Y;

        ctx.save();
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.arc(wheelLX, wheelY, wheelRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(wheelRX, wheelY, wheelRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(wheelLX, wheelY, Math.max(1, wheelRadius * 0.35), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(wheelRX, wheelY, Math.max(1, wheelRadius * 0.35), 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        var spokeAng = driveWheelRotation;
        var cx = Math.cos(spokeAng) * wheelRadius;
        var sy = Math.sin(spokeAng) * wheelRadius;
        ctx.beginPath();
        ctx.moveTo(wheelLX - cx, wheelY - sy);
        ctx.lineTo(wheelLX + cx, wheelY + sy);
        ctx.moveTo(wheelRX - cx, wheelY - sy);
        ctx.lineTo(wheelRX + cx, wheelY + sy);
        ctx.stroke();
        ctx.restore();
    }

    var flashOn = Math.floor(driveTransitionTimer * 6) % 2 === 0;
    if (flashOn) {
        ctx.save();
        ctx.fillStyle = '#F37121';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('DEPLOY FEATURE!', canvas.width / 2, 40);
        ctx.restore();
    }
}

function renderBreakoutTransition() {
    drawBreakoutWorld();
    drawBreakoutHUD();

    // Flashing "CLEAR THE TECH DEBT!" banner (~3 Hz) — matches the cadence of
    // renderTechdebtTransition / renderMissileTransition for consistency.
    var flashOn = Math.floor(breakoutTransitionTimer * 6) % 2 === 0;
    if (flashOn) {
        ctx.save();
        ctx.fillStyle = '#F37121';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('CLEAR THE TECH DEBT!', canvas.width / 2, 20);
        ctx.restore();
    }
}

function renderBreakoutPlaying() {
    drawBreakoutWorld();
    drawBreakoutHUD();
}

// US-012: Code Breaker return — the M ship eases back to upright before the
// state machine advances to PLAYING. Keep the HUD visible for continuity.
function renderBreakoutReturn() {
    drawShip(ship.x, ship.y, ship.angle, SHIP_SIZE, false, null, false);
    drawBreakoutHUD();

    ctx.save();
    ctx.fillStyle = '#4FC3F7';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RETURNING TO MISSION', canvas.width / 2, 60);
    ctx.restore();
}

// US-010: "TECH DEBT CLEARED!" results overlay. Draws the cleared field
// underneath (fading brick-burst particles + flipped paddle) plus celebration
// sparkles, then the score breakdown per the AC. Mirrors renderTechdebtComplete.
function renderBreakoutComplete() {
    drawBreakoutWorld();
    drawBreakoutHUD();
    drawCelebration();

    var cx = canvas.width / 2;
    var cy = canvas.height / 2;

    ctx.save();
    ctx.textAlign = 'center';

    ctx.fillStyle = '#4CAF50';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('TECH DEBT CLEARED!', cx, cy - 95);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Bricks destroyed: ' + breakoutBricksDestroyed, cx, cy - 50);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(
        'Extra balls remaining: ' + breakoutExtraBalls +
            ' (+' + breakoutExtraBallBonus + ' pts)',
        cx, cy - 20
    );

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(
        'Completion bonus: +' + breakoutCompletionBonus + ' pts',
        cx, cy + 10
    );

    var totalBonus = breakoutCompletionBonus + breakoutExtraBallBonus;
    ctx.fillStyle = '#FFEB3B';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('Total bonus: +' + totalBonus + ' pts', cx, cy + 45);

    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Score: ' + score, cx, cy + 80);

    ctx.fillStyle = '#888';
    ctx.font = '18px sans-serif';
    ctx.fillText('Returning to mission...', cx, cy + 115);

    ctx.restore();
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
    proxiblueBrandHitBox = null;

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

        // ProxiBlue branding — below the high-score table, clickable
        y += 32;
        ctx.fillStyle = '#556';
        ctx.font = '11px monospace';
        var brandText = 'Powered by ProxiBlue \u2014 github.com/ProxiBlue';
        ctx.fillText(brandText, cx, y);
        var bw = ctx.measureText(brandText).width;
        proxiblueBrandHitBox = { x: cx - bw / 2, y: y - 10, w: bw, h: 14 };
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
        case STATES.MISSILE_COMPLETE:
            renderMissileComplete();
            break;
        case STATES.MISSILE_RETURN:
            renderMissileReturn();
            break;
        case STATES.TECHDEBT_TRANSITION:
            renderTechdebtTransition();
            break;
        case STATES.TECHDEBT_PLAYING:
            renderTechdebtPlaying();
            break;
        case STATES.TECHDEBT_COMPLETE:
            renderTechdebtComplete();
            break;
        case STATES.BREAKOUT_TRANSITION:
            renderBreakoutTransition();
            break;
        case STATES.BREAKOUT_PLAYING:
            renderBreakoutPlaying();
            break;
        case STATES.BREAKOUT_COMPLETE:
            renderBreakoutComplete();
            break;
        case STATES.BREAKOUT_RETURN:
            renderBreakoutReturn();
            break;
        case STATES.DRIVE_TRANSITION:
            renderDriveTransition();
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
