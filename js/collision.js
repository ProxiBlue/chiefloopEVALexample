// --- Collision Detection Module ---
var SHIP_SIZE = 40; // must match the size passed to drawShip in renderPlaying
var landingResult = ''; // stores reason for crash or success message

// Get the two bottom-edge corners of the ship in world coordinates
function getShipBottomEdge() {
    var halfW = SHIP_SIZE * 0.5;
    var halfH = SHIP_SIZE * 0.6;
    var cosA = Math.cos(ship.angle);
    var sinA = Math.sin(ship.angle);
    // Bottom-left in local coords: (-halfW, halfH)
    // Bottom-right in local coords: (halfW, halfH)
    return [
        { x: ship.x + (-halfW * cosA - halfH * sinA), y: ship.y + (-halfW * sinA + halfH * cosA) },
        { x: ship.x + (halfW * cosA - halfH * sinA), y: ship.y + (halfW * sinA + halfH * cosA) }
    ];
}

// Interpolated terrain Y at x across the given terrain points. Returns { y, segIndex } or null if x is out of range.
function getTerrainHeightAt(x, terrainPoints) {
    for (var i = 0; i < terrainPoints.length - 1; i++) {
        var t0 = terrainPoints[i];
        var t1 = terrainPoints[i + 1];
        if (x >= t0.x && x <= t1.x) {
            var t = (x - t0.x) / (t1.x - t0.x);
            return { y: t0.y + t * (t1.y - t0.y), segIndex: i };
        }
    }
    return null;
}

// Back-compat wrapper: uses the global `terrain` array.
function getTerrainYAtX(px) {
    return getTerrainHeightAt(px, terrain);
}

// Returns the terrain contact point { x, y } if the bomb has touched the terrain, else null.
function bombHitsTerrain(bomb, terrainPoints) {
    var hit = getTerrainHeightAt(bomb.x, terrainPoints);
    if (hit && bomb.y >= hit.y) {
        return { x: bomb.x, y: hit.y };
    }
    return null;
}

// Returns entities within radius r of (cx, cy). Squared-distance compare.
function entitiesInRadius(cx, cy, r, entities) {
    var r2 = r * r;
    var result = [];
    for (var i = 0; i < entities.length; i++) {
        var e = entities[i];
        var dx = e.x - cx;
        var dy = e.y - cy;
        if (dx * dx + dy * dy <= r2) {
            result.push(e);
        }
    }
    return result;
}

// Get altitude: distance from ship bottom to terrain directly below
function getAltitude() {
    var bottomEdge = getShipBottomEdge();
    var centerX = (bottomEdge[0].x + bottomEdge[1].x) / 2;
    var bottomY = Math.max(bottomEdge[0].y, bottomEdge[1].y);
    var hit = getTerrainYAtX(centerX);
    if (!hit) return 0;
    var altPixels = hit.y - bottomY;
    return Math.max(0, altPixels / PIXELS_PER_METER);
}

// Check if a terrain segment index is part of a landing pad
function getPadAtSegment(segIndex) {
    for (var p = 0; p < landingPads.length; p++) {
        var pad = landingPads[p];
        if (segIndex >= pad.index && segIndex < pad.index + pad.width) {
            return pad;
        }
    }
    return null;
}

// Check collision and landing conditions
function checkCollision() {
    if (terrain.length === 0) return;

    var bottomEdge = getShipBottomEdge();

    for (var b = 0; b < bottomEdge.length; b++) {
        var pt = bottomEdge[b];
        var hit = getTerrainYAtX(pt.x);
        if (!hit) continue;

        if (pt.y >= hit.y) {
            // Collision detected — check landing conditions
            var vyMs = ship.vy / PIXELS_PER_METER;  // vertical speed in m/s
            var vxMs = ship.vx / PIXELS_PER_METER;  // horizontal speed in m/s

            // Normalize angle to [-PI, PI]
            var angle = ship.angle % (2 * Math.PI);
            if (angle > Math.PI) angle -= 2 * Math.PI;
            if (angle < -Math.PI) angle += 2 * Math.PI;
            var angleDeg = Math.abs(angle) * (180 / Math.PI);

            // Check if both bottom points are on a landing pad
            var pad0 = null;
            var pad1 = null;
            for (var c = 0; c < bottomEdge.length; c++) {
                var ptc = bottomEdge[c];
                var hitc = getTerrainYAtX(ptc.x);
                if (hitc) {
                    var padAtSeg = getPadAtSegment(hitc.segIndex);
                    if (c === 0) pad0 = padAtSeg;
                    else pad1 = padAtSeg;
                }
            }

            var onPad = pad0 !== null && pad1 !== null;
            var verticalOk = vyMs < 2;
            var horizontalOk = Math.abs(vxMs) < 1;
            var angleOk = angleDeg < 15;

            if (onPad && verticalOk && horizontalOk && angleOk) {
                // Snap ship to terrain surface
                ship.vy = 0;
                ship.vx = 0;
                landingResult = 'SUCCESS';
                var landedPad = pad0 || pad1;
                landedTypeMultiplier = PR_TYPE_MULTIPLIERS[landedPad.prType] || 1;
                landedPadBasePoints = landedPad.points;
                landedPadPoints = landedPad.points * landedTypeMultiplier;
                landedPRTitle = landedPad.prTitle || '';
                landedPRNumber = landedPad.prNumber || null;
                landedPRAuthor = landedPad.prAuthor || '';
                landedPRType = landedPad.prType || '';
                landedPRMergedDate = landedPad.prMergedDate || '';
                // Fuel bonus: remaining fuel percentage * 100, rounded
                landedFuelBonus = Math.round((ship.fuel / FUEL_MAX) * 100);
                landedTotalPoints = landedPadPoints + landedFuelBonus;
                score += landedTotalPoints;
                landings++;
                spawnCelebration(ship.x, ship.y - SHIP_SIZE * 0.3);
                stopThrustSound();
                playLandingSound();
                gameState = STATES.LANDED;
            } else {
                // Crash — build reason
                var reasons = [];
                if (!onPad) reasons.push('Not on a landing pad');
                if (!verticalOk) reasons.push('Too fast vertically (' + vyMs.toFixed(1) + ' m/s)');
                if (!horizontalOk) reasons.push('Too fast horizontally (' + Math.abs(vxMs).toFixed(1) + ' m/s)');
                if (!angleOk) reasons.push('Angle too steep (' + angleDeg.toFixed(1) + '°)');
                ship.vy = 0;
                ship.vx = 0;
                landingResult = reasons.join('\n');
                spawnExplosion(ship.x, ship.y);
                startScreenShake();
                stopThrustSound();
                playExplosionSound();
                gameState = STATES.CRASHED;
            }
            return;
        }
    }
}
