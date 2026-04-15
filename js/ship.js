// --- Ship Module ---
// Ship state, rendering with Mage-OS SVG logo, and reset logic

// --- Ship State Variables ---
var ship = {
    x: 0,
    y: 0,
    vx: 0,              // velocity in pixels/s
    vy: 0,              // velocity in pixels/s
    angle: 0,           // radians, 0 = upright
    rotationSpeed: ROTATION_SPEED,   // radians per second
    thrusting: false,   // whether thrust is currently active
    fuel: FUEL_MAX      // remaining fuel
};

// Convenience aliases matching acceptance criteria naming
var shipX = 0;
var shipY = 0;
var shipAngle = 0;
var shipVx = 0;
var shipVy = 0;
var shipSize = 40;

// --- SVG Logo Preloading ---
// Pre-render SVG to an offscreen canvas for crisp rotation at any angle.
// Canvas drawImage with a rasterised bitmap avoids SVG re-parsing per frame
// and guarantees consistent rendering across browsers during rotation.
var shipLogoImg = new Image();
var shipLogoLoaded = false;
var shipLogoCanvas = null;   // offscreen canvas with pre-rendered logo

function prerenderShipLogo(renderSize) {
    var scale = 2; // render at 2x for retina / anti-alias quality
    var cs = renderSize * scale;
    shipLogoCanvas = document.createElement('canvas');
    shipLogoCanvas.width = cs;
    shipLogoCanvas.height = cs;
    var offCtx = shipLogoCanvas.getContext('2d');
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = 'high';
    offCtx.drawImage(shipLogoImg, 0, 0, cs, cs);
}

shipLogoImg.onload = function() {
    shipLogoLoaded = true;
    // Pre-render at the game's ship size (SHIP_SIZE or default 40)
    prerenderShipLogo(typeof SHIP_SIZE !== 'undefined' ? SHIP_SIZE : 40);
};
shipLogoImg.src = 'assets/mage-os-logo.svg';

function resetShip() {
    ship.x = canvas.width / 2;
    ship.y = canvas.height / 3;
    ship.vx = 0;
    ship.vy = 0;
    ship.angle = 0;
    ship.thrusting = false;
    ship.fuel = FUEL_MAX;
}

function drawShip(x, y, angle, size, thrusting) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Enable high-quality image smoothing so rotated sprites stay crisp
    ctx.imageSmoothingEnabled = true;
    if (ctx.imageSmoothingQuality !== undefined) {
        ctx.imageSmoothingQuality = 'high';
    }

    var s = size;
    var halfS = s * 0.5;

    // Draw the Mage-OS SVG logo — prefer pre-rendered canvas for clean rotation
    if (shipLogoLoaded && shipLogoCanvas) {
        // Re-render offscreen canvas if size changed since last pre-render
        if (shipLogoCanvas.width !== s * 2) {
            prerenderShipLogo(s);
        }
        ctx.drawImage(shipLogoCanvas, -halfS, -halfS, s, s);
    } else if (shipLogoLoaded) {
        // Direct SVG fallback (before offscreen canvas is ready)
        ctx.drawImage(shipLogoImg, -halfS, -halfS, s, s);
    } else {
        // Fallback: approximate isometric Mage-OS "M" logomark with canvas paths
        // Coordinates derived from SVG paths, normalized from 170x170 viewBox
        var n = s / 170;  // scale factor: SVG viewBox units to canvas pixels
        var cx = 80 * n;  // center offset X (viewBox center)
        var cy = 38.5 * n; // center offset Y (viewBox center)

        // Left leg right face (#FF9234 — lighter shading for 3D depth)
        ctx.beginPath();
        ctx.fillStyle = '#FF9234';
        ctx.moveTo(53.4 * n - cx, 61.7 * n - cy);
        ctx.lineTo(53.4 * n - cx, 30.8 * n - cy);
        ctx.lineTo(26.7 * n - cx, 46.2 * n - cy);
        ctx.lineTo(26.7 * n - cx, 77.1 * n - cy);
        ctx.closePath();
        ctx.fill();

        // Middle leg right face (#FF9234)
        ctx.beginPath();
        ctx.moveTo(106.8 * n - cx, 61.7 * n - cy);
        ctx.lineTo(106.8 * n - cx, 30.8 * n - cy);
        ctx.lineTo(80.1 * n - cx, 46.2 * n - cy);
        ctx.lineTo(80.1 * n - cx, 77.1 * n - cy);
        ctx.closePath();
        ctx.fill();

        // Main M shape (#F37121 — primary orange, evenodd fill for cutouts)
        ctx.beginPath();
        ctx.fillStyle = '#F37121';
        ctx.moveTo(0 * n - cx, 30.8 * n - cy);
        ctx.lineTo(53.4 * n - cx, 0 * n - cy);
        ctx.lineTo(80.1 * n - cx, 15.4 * n - cy);
        ctx.lineTo(106.8 * n - cx, 0 * n - cy);
        ctx.lineTo(160.2 * n - cx, 30.8 * n - cy);
        ctx.lineTo(133.5 * n - cx, 46.2 * n - cy);
        ctx.lineTo(106.8 * n - cx, 30.8 * n - cy);
        ctx.lineTo(133.5 * n - cx, 46.2 * n - cy);
        ctx.lineTo(133.5 * n - cx, 77.1 * n - cy);
        ctx.lineTo(106.8 * n - cx, 61.7 * n - cy);
        ctx.lineTo(106.8 * n - cx, 30.8 * n - cy);
        ctx.lineTo(80.1 * n - cx, 46.2 * n - cy);
        ctx.lineTo(53.4 * n - cx, 30.8 * n - cy);
        ctx.lineTo(80.1 * n - cx, 46.2 * n - cy);
        ctx.lineTo(80.1 * n - cx, 77.1 * n - cy);
        ctx.lineTo(53.4 * n - cx, 61.7 * n - cy);
        ctx.lineTo(53.4 * n - cx, 30.8 * n - cy);
        ctx.lineTo(26.7 * n - cx, 46.2 * n - cy);
        ctx.lineTo(26.7 * n - cx, 77.1 * n - cy);
        ctx.lineTo(0 * n - cx, 61.7 * n - cy);
        ctx.closePath();
        ctx.fill('evenodd');

        // Right leg right face (#FF9234 — drawn last, on top)
        ctx.beginPath();
        ctx.fillStyle = '#FF9234';
        ctx.moveTo(160.2 * n - cx, 30.8 * n - cy);
        ctx.lineTo(160.2 * n - cx, 61.7 * n - cy);
        ctx.lineTo(133.5 * n - cx, 77.1 * n - cy);
        ctx.lineTo(133.5 * n - cx, 46.2 * n - cy);
        ctx.closePath();
        ctx.fill();
    }

    // Draw thrust flame when thrusting
    if (thrusting) {
        var flameLen = s * (0.4 + Math.random() * 0.25);
        var flameWidth = halfS * (0.35 + Math.random() * 0.08);

        // Outer flame — orange/yellow gradient
        var flameGrad = ctx.createLinearGradient(0, halfS, 0, halfS + flameLen);
        flameGrad.addColorStop(0, '#ff8800');
        flameGrad.addColorStop(0.5, '#ffaa00');
        flameGrad.addColorStop(1, '#ffdd00');
        ctx.beginPath();
        ctx.moveTo(-flameWidth, halfS);
        ctx.lineTo(0, halfS + flameLen);
        ctx.lineTo(flameWidth, halfS);
        ctx.fillStyle = flameGrad;
        ctx.fill();

        // Inner flame — yellow core
        var innerLen = flameLen * (0.55 + Math.random() * 0.1);
        var innerWidth = flameWidth * 0.5;
        var innerGrad = ctx.createLinearGradient(0, halfS, 0, halfS + innerLen);
        innerGrad.addColorStop(0, '#ffcc00');
        innerGrad.addColorStop(1, '#ffee66');
        ctx.beginPath();
        ctx.moveTo(-innerWidth, halfS);
        ctx.lineTo(0, halfS + innerLen);
        ctx.lineTo(innerWidth, halfS);
        ctx.fillStyle = innerGrad;
        ctx.fill();
    }

    ctx.restore();
}
