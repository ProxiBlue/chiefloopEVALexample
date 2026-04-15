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
    rotating: null,     // current rotation direction: 'left', 'right', or null
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
    ship.rotating = null;
    ship.fuel = FUEL_MAX;
}

function drawShip(x, y, angle, size, thrusting, rotating) {
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

    // --- Rotation jets drawn FIRST (behind main thrust for correct z-order) ---
    // Directional jets are cosmetic only — they do NOT consume fuel.
    // Fuel is consumed exclusively by main thrust in update.js.

    // SVG coordinate conversion factors shared by both rotation directions
    var jnx = drawW / 160.177;
    var jny = drawH / 77.064;
    var jetScale = 0.3;
    var jetFlameOriginY = halfH * 0.94;

    // For left rotation: downward flame at bottom-right tip of right leg,
    //                     upward flame at top-left tip of left leg
    if (rotating === 'left') {
        // --- Right leg bottom-right tip: flame pointing downward ---
        // Bottom-right tip is the outer corner at SVG coords (160.2, 61.7)
        var rJetX = 160.2 * jnx - halfW;
        var rJetY = 61.7 * jny - halfH;

        // Independent flicker for right jet (same formula as main thrust, scaled by jetScale)
        var rJetLen = s * jetScale * (0.4 + Math.random() * 0.25);
        var rJetWidth = jetFlameOriginY * jetScale * (0.35 + Math.random() * 0.08);

        // Outer jet flame (downward — same direction as main thrust)
        var rGrad = ctx.createLinearGradient(rJetX, rJetY, rJetX, rJetY + rJetLen);
        rGrad.addColorStop(0, '#F37121');
        rGrad.addColorStop(0.4, '#FF9234');
        rGrad.addColorStop(0.75, '#FFBB44');
        rGrad.addColorStop(1, '#FFD966');
        ctx.beginPath();
        ctx.moveTo(rJetX - rJetWidth, rJetY);
        ctx.lineTo(rJetX, rJetY + rJetLen);
        ctx.lineTo(rJetX + rJetWidth, rJetY);
        ctx.fillStyle = rGrad;
        ctx.fill();

        // Inner jet flame (downward)
        var rInnerLen = rJetLen * (0.55 + Math.random() * 0.1);
        var rInnerW = rJetWidth * 0.5;
        var rInnerGrad = ctx.createLinearGradient(rJetX, rJetY, rJetX, rJetY + rInnerLen);
        rInnerGrad.addColorStop(0, '#FF9234');
        rInnerGrad.addColorStop(0.5, '#FFCC55');
        rInnerGrad.addColorStop(1, '#FFEE88');
        ctx.beginPath();
        ctx.moveTo(rJetX - rInnerW, rJetY);
        ctx.lineTo(rJetX, rJetY + rInnerLen);
        ctx.lineTo(rJetX + rInnerW, rJetY);
        ctx.fillStyle = rInnerGrad;
        ctx.fill();

        // --- Left leg top-left tip: flame pointing upward ---
        // Top-left tip is the outer corner at SVG coords (0, 30.8)
        var lJetX = 0 * jnx - halfW;
        var lJetY = 30.8 * jny - halfH;

        // Independent flicker for left jet (same formula as main thrust, scaled by jetScale)
        var lJetLen = s * jetScale * (0.4 + Math.random() * 0.25);
        var lJetWidth = jetFlameOriginY * jetScale * (0.35 + Math.random() * 0.08);

        // Outer jet flame (upward — opposite to main thrust)
        var lGrad = ctx.createLinearGradient(lJetX, lJetY, lJetX, lJetY - lJetLen);
        lGrad.addColorStop(0, '#F37121');
        lGrad.addColorStop(0.4, '#FF9234');
        lGrad.addColorStop(0.75, '#FFBB44');
        lGrad.addColorStop(1, '#FFD966');
        ctx.beginPath();
        ctx.moveTo(lJetX - lJetWidth, lJetY);
        ctx.lineTo(lJetX, lJetY - lJetLen);
        ctx.lineTo(lJetX + lJetWidth, lJetY);
        ctx.fillStyle = lGrad;
        ctx.fill();

        // Inner jet flame (upward)
        var lInnerLen = lJetLen * (0.55 + Math.random() * 0.1);
        var lInnerW = lJetWidth * 0.5;
        var lInnerGrad = ctx.createLinearGradient(lJetX, lJetY, lJetX, lJetY - lInnerLen);
        lInnerGrad.addColorStop(0, '#FF9234');
        lInnerGrad.addColorStop(0.5, '#FFCC55');
        lInnerGrad.addColorStop(1, '#FFEE88');
        ctx.beginPath();
        ctx.moveTo(lJetX - lInnerW, lJetY);
        ctx.lineTo(lJetX, lJetY - lInnerLen);
        ctx.lineTo(lJetX + lInnerW, lJetY);
        ctx.fillStyle = lInnerGrad;
        ctx.fill();
    }

    // For right rotation: downward flame at bottom-left tip of left leg,
    //                      upward flame at top-right tip of right leg
    if (rotating === 'right') {
        // --- Left leg bottom-left tip: flame pointing downward ---
        // Bottom-left tip is the outer corner at SVG coords (0, 61.7)
        var rJetX = 0 * jnx - halfW;
        var rJetY = 61.7 * jny - halfH;

        // Independent flicker for this jet
        var rJetLen = s * jetScale * (0.4 + Math.random() * 0.25);
        var rJetWidth = jetFlameOriginY * jetScale * (0.35 + Math.random() * 0.08);

        // Outer jet flame (downward)
        var rGrad = ctx.createLinearGradient(rJetX, rJetY, rJetX, rJetY + rJetLen);
        rGrad.addColorStop(0, '#F37121');
        rGrad.addColorStop(0.4, '#FF9234');
        rGrad.addColorStop(0.75, '#FFBB44');
        rGrad.addColorStop(1, '#FFD966');
        ctx.beginPath();
        ctx.moveTo(rJetX - rJetWidth, rJetY);
        ctx.lineTo(rJetX, rJetY + rJetLen);
        ctx.lineTo(rJetX + rJetWidth, rJetY);
        ctx.fillStyle = rGrad;
        ctx.fill();

        // Inner jet flame (downward)
        var rInnerLen = rJetLen * (0.55 + Math.random() * 0.1);
        var rInnerW = rJetWidth * 0.5;
        var rInnerGrad = ctx.createLinearGradient(rJetX, rJetY, rJetX, rJetY + rInnerLen);
        rInnerGrad.addColorStop(0, '#FF9234');
        rInnerGrad.addColorStop(0.5, '#FFCC55');
        rInnerGrad.addColorStop(1, '#FFEE88');
        ctx.beginPath();
        ctx.moveTo(rJetX - rInnerW, rJetY);
        ctx.lineTo(rJetX, rJetY + rInnerLen);
        ctx.lineTo(rJetX + rInnerW, rJetY);
        ctx.fillStyle = rInnerGrad;
        ctx.fill();

        // --- Right leg top-right tip: flame pointing upward ---
        // Top-right tip is the outer corner at SVG coords (160.2, 30.8)
        var lJetX = 160.2 * jnx - halfW;
        var lJetY = 30.8 * jny - halfH;

        // Independent flicker for this jet
        var lJetLen = s * jetScale * (0.4 + Math.random() * 0.25);
        var lJetWidth = jetFlameOriginY * jetScale * (0.35 + Math.random() * 0.08);

        // Outer jet flame (upward)
        var lGrad = ctx.createLinearGradient(lJetX, lJetY, lJetX, lJetY - lJetLen);
        lGrad.addColorStop(0, '#F37121');
        lGrad.addColorStop(0.4, '#FF9234');
        lGrad.addColorStop(0.75, '#FFBB44');
        lGrad.addColorStop(1, '#FFD966');
        ctx.beginPath();
        ctx.moveTo(lJetX - lJetWidth, lJetY);
        ctx.lineTo(lJetX, lJetY - lJetLen);
        ctx.lineTo(lJetX + lJetWidth, lJetY);
        ctx.fillStyle = lGrad;
        ctx.fill();

        // Inner jet flame (upward)
        var lInnerLen = lJetLen * (0.55 + Math.random() * 0.1);
        var lInnerW = lJetWidth * 0.5;
        var lInnerGrad = ctx.createLinearGradient(lJetX, lJetY, lJetX, lJetY - lInnerLen);
        lInnerGrad.addColorStop(0, '#FF9234');
        lInnerGrad.addColorStop(0.5, '#FFCC55');
        lInnerGrad.addColorStop(1, '#FFEE88');
        ctx.beginPath();
        ctx.moveTo(lJetX - lInnerW, lJetY);
        ctx.lineTo(lJetX, lJetY - lInnerLen);
        ctx.lineTo(lJetX + lInnerW, lJetY);
        ctx.fillStyle = lInnerGrad;
        ctx.fill();
    }

    // --- Main thrust flame drawn LAST (on top of rotation jets for correct z-order) ---
    // Main thrust consumes fuel (handled in update.js); rotation jets do not.
    if (thrusting) {
        var flameOriginY = halfH * 0.94;

        var flameLen = s * (0.4 + Math.random() * 0.25);
        var flameWidth = flameOriginY * (0.35 + Math.random() * 0.08);

        // Outer flame — logo orange base transitioning to yellow tip
        var flameGrad = ctx.createLinearGradient(0, flameOriginY, 0, flameOriginY + flameLen);
        flameGrad.addColorStop(0, '#F37121');
        flameGrad.addColorStop(0.4, '#FF9234');
        flameGrad.addColorStop(0.75, '#FFBB44');
        flameGrad.addColorStop(1, '#FFD966');
        ctx.beginPath();
        ctx.moveTo(-flameWidth, flameOriginY);
        ctx.lineTo(0, flameOriginY + flameLen);
        ctx.lineTo(flameWidth, flameOriginY);
        ctx.fillStyle = flameGrad;
        ctx.fill();

        // Inner flame — bright core from logo secondary to pale yellow
        var innerLen = flameLen * (0.55 + Math.random() * 0.1);
        var innerWidth = flameWidth * 0.5;
        var innerGrad = ctx.createLinearGradient(0, flameOriginY, 0, flameOriginY + innerLen);
        innerGrad.addColorStop(0, '#FF9234');
        innerGrad.addColorStop(0.5, '#FFCC55');
        innerGrad.addColorStop(1, '#FFEE88');
        ctx.beginPath();
        ctx.moveTo(-innerWidth, flameOriginY);
        ctx.lineTo(0, flameOriginY + innerLen);
        ctx.lineTo(innerWidth, flameOriginY);
        ctx.fillStyle = innerGrad;
        ctx.fill();
    }

    ctx.restore();
}
