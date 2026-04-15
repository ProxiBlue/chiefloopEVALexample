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

// Logo content aspect ratio: 160.177 x 77.064 ≈ 2.08:1
// Ship is drawn at 2:1 aspect (width = size*2, height = size) so the M fills the size
var LOGO_DRAW_RATIO = 2; // width multiplier relative to height (= size param)

function prerenderShipLogo(renderSize) {
    var scale = 2; // render at 2x for retina / anti-alias quality
    var cw = renderSize * LOGO_DRAW_RATIO * scale;
    var ch = renderSize * scale;
    shipLogoCanvas = document.createElement('canvas');
    shipLogoCanvas.width = cw;
    shipLogoCanvas.height = ch;
    var offCtx = shipLogoCanvas.getContext('2d');
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = 'high';
    offCtx.drawImage(shipLogoImg, 0, 0, cw, ch);
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
    // Draw at natural 2:1 aspect ratio so the M logo fills the size parameter
    var drawW = s * LOGO_DRAW_RATIO;
    var drawH = s;
    var halfW = drawW * 0.5;
    var halfH = drawH * 0.5;

    // Draw the Mage-OS SVG logo — prefer pre-rendered canvas for clean rotation
    if (shipLogoLoaded && shipLogoCanvas) {
        // Re-render offscreen canvas if size changed since last pre-render
        if (shipLogoCanvas.height !== s * 2) {
            prerenderShipLogo(s);
        }
        ctx.drawImage(shipLogoCanvas, -halfW, -halfH, drawW, drawH);
    } else if (shipLogoLoaded) {
        // Direct SVG fallback (before offscreen canvas is ready)
        ctx.drawImage(shipLogoImg, -halfW, -halfH, drawW, drawH);
    } else {
        // Fallback: approximate isometric Mage-OS "M" logomark with canvas paths
        // Coordinates derived from SVG paths, scaled to fill drawW x drawH
        // Content bounds: 160.177 wide x 77.064 tall
        var nx = drawW / 160.177;  // scale factor X: SVG content units to canvas pixels
        var ny = drawH / 77.064;   // scale factor Y: SVG content units to canvas pixels
        var cx = halfW;             // center offset X
        var cy = halfH;             // center offset Y

        // Left leg right face (#FF9234 — lighter shading for 3D depth)
        ctx.beginPath();
        ctx.fillStyle = '#FF9234';
        ctx.moveTo(53.4 * nx - cx, 61.7 * ny - cy);
        ctx.lineTo(53.4 * nx - cx, 30.8 * ny - cy);
        ctx.lineTo(26.7 * nx - cx, 46.2 * ny - cy);
        ctx.lineTo(26.7 * nx - cx, 77.1 * ny - cy);
        ctx.closePath();
        ctx.fill();

        // Middle leg right face (#FF9234)
        ctx.beginPath();
        ctx.moveTo(106.8 * nx - cx, 61.7 * ny - cy);
        ctx.lineTo(106.8 * nx - cx, 30.8 * ny - cy);
        ctx.lineTo(80.1 * nx - cx, 46.2 * ny - cy);
        ctx.lineTo(80.1 * nx - cx, 77.1 * ny - cy);
        ctx.closePath();
        ctx.fill();

        // Main M shape (#F37121 — primary orange, evenodd fill for cutouts)
        ctx.beginPath();
        ctx.fillStyle = '#F37121';
        ctx.moveTo(0 * nx - cx, 30.8 * ny - cy);
        ctx.lineTo(53.4 * nx - cx, 0 * ny - cy);
        ctx.lineTo(80.1 * nx - cx, 15.4 * ny - cy);
        ctx.lineTo(106.8 * nx - cx, 0 * ny - cy);
        ctx.lineTo(160.2 * nx - cx, 30.8 * ny - cy);
        ctx.lineTo(133.5 * nx - cx, 46.2 * ny - cy);
        ctx.lineTo(106.8 * nx - cx, 30.8 * ny - cy);
        ctx.lineTo(133.5 * nx - cx, 46.2 * ny - cy);
        ctx.lineTo(133.5 * nx - cx, 77.1 * ny - cy);
        ctx.lineTo(106.8 * nx - cx, 61.7 * ny - cy);
        ctx.lineTo(106.8 * nx - cx, 30.8 * ny - cy);
        ctx.lineTo(80.1 * nx - cx, 46.2 * ny - cy);
        ctx.lineTo(53.4 * nx - cx, 30.8 * ny - cy);
        ctx.lineTo(80.1 * nx - cx, 46.2 * ny - cy);
        ctx.lineTo(80.1 * nx - cx, 77.1 * ny - cy);
        ctx.lineTo(53.4 * nx - cx, 61.7 * ny - cy);
        ctx.lineTo(53.4 * nx - cx, 30.8 * ny - cy);
        ctx.lineTo(26.7 * nx - cx, 46.2 * ny - cy);
        ctx.lineTo(26.7 * nx - cx, 77.1 * ny - cy);
        ctx.lineTo(0 * nx - cx, 61.7 * ny - cy);
        ctx.closePath();
        ctx.fill('evenodd');

        // Right leg right face (#FF9234 — drawn last, on top)
        ctx.beginPath();
        ctx.fillStyle = '#FF9234';
        ctx.moveTo(160.2 * nx - cx, 30.8 * ny - cy);
        ctx.lineTo(160.2 * nx - cx, 61.7 * ny - cy);
        ctx.lineTo(133.5 * nx - cx, 77.1 * ny - cy);
        ctx.lineTo(133.5 * nx - cx, 46.2 * ny - cy);
        ctx.closePath();
        ctx.fill();
    }

    // Draw thrust flame when thrusting
    if (thrusting) {
        var flameLen = s * (0.4 + Math.random() * 0.25);
        var flameWidth = halfH * (0.35 + Math.random() * 0.08);

        // Outer flame — orange/yellow gradient
        var flameGrad = ctx.createLinearGradient(0, halfH, 0, halfH + flameLen);
        flameGrad.addColorStop(0, '#ff8800');
        flameGrad.addColorStop(0.5, '#ffaa00');
        flameGrad.addColorStop(1, '#ffdd00');
        ctx.beginPath();
        ctx.moveTo(-flameWidth, halfH);
        ctx.lineTo(0, halfH + flameLen);
        ctx.lineTo(flameWidth, halfH);
        ctx.fillStyle = flameGrad;
        ctx.fill();

        // Inner flame — yellow core
        var innerLen = flameLen * (0.55 + Math.random() * 0.1);
        var innerWidth = flameWidth * 0.5;
        var innerGrad = ctx.createLinearGradient(0, halfH, 0, halfH + innerLen);
        innerGrad.addColorStop(0, '#ffcc00');
        innerGrad.addColorStop(1, '#ffee66');
        ctx.beginPath();
        ctx.moveTo(-innerWidth, halfH);
        ctx.lineTo(0, halfH + innerLen);
        ctx.lineTo(innerWidth, halfH);
        ctx.fillStyle = innerGrad;
        ctx.fill();
    }

    ctx.restore();
}
