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

    // Draw thrust flame when thrusting
    // Colors complement the two-tone Mage-OS orange palette (#F37121 / #FF9234)
    if (thrusting) {
        // Flame emits from the actual bottom edge of the M logo legs, not the
        // full draw-area boundary. SVG viewBox is 164x81 with xMidYMid meet in
        // a 2:1 draw area — width constrains, so rendered height < drawH.
        // M legs end at y≈77.06 in SVG coords (viewBox y spans -2 to 79).
        // Actual leg bottom sits at ~0.47*size from center vs halfH = 0.5*size.
        var flameOriginY = halfH * 0.94;

        var flameLen = s * (0.4 + Math.random() * 0.25);
        var flameWidth = flameOriginY * (0.35 + Math.random() * 0.08);

        // Outer flame — logo orange base transitioning to yellow tip
        var flameGrad = ctx.createLinearGradient(0, flameOriginY, 0, flameOriginY + flameLen);
        flameGrad.addColorStop(0, '#F37121');   // primary logo orange at base
        flameGrad.addColorStop(0.4, '#FF9234'); // secondary logo orange
        flameGrad.addColorStop(0.75, '#FFBB44'); // warm amber
        flameGrad.addColorStop(1, '#FFD966');   // golden yellow tip
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
        innerGrad.addColorStop(0, '#FF9234');   // secondary logo orange at base
        innerGrad.addColorStop(0.5, '#FFCC55'); // warm yellow
        innerGrad.addColorStop(1, '#FFEE88');   // pale yellow tip
        ctx.beginPath();
        ctx.moveTo(-innerWidth, flameOriginY);
        ctx.lineTo(0, flameOriginY + innerLen);
        ctx.lineTo(innerWidth, flameOriginY);
        ctx.fillStyle = innerGrad;
        ctx.fill();
    }

    // Draw torque-pair rotation jets
    // For left rotation: downward flame at bottom-right of right leg,
    //                     upward flame at top-left of left leg
    if (rotating === 'left') {
        // SVG coordinate conversion factors (same as fallback logo rendering)
        var jnx = drawW / 160.177;
        var jny = drawH / 77.064;

        // Jet flames are ~30% the size of main thrust
        var jetScale = 0.3;
        var jetLen = s * jetScale * (0.4 + Math.random() * 0.25);
        var jetWidth = s * jetScale * (0.15 + Math.random() * 0.04);

        // --- Right leg bottom tip: flame pointing downward ---
        // Right leg bottom-right tip at SVG coords ~(146.8, 69.4) (midpoint of right leg bottom edge)
        var rJetX = 146.8 * jnx - halfW;
        var rJetY = 69.4 * jny - halfH;

        // Outer jet flame (downward)
        var rGrad = ctx.createLinearGradient(rJetX, rJetY, rJetX, rJetY + jetLen);
        rGrad.addColorStop(0, '#F37121');
        rGrad.addColorStop(0.4, '#FF9234');
        rGrad.addColorStop(0.75, '#FFBB44');
        rGrad.addColorStop(1, '#FFD966');
        ctx.beginPath();
        ctx.moveTo(rJetX - jetWidth, rJetY);
        ctx.lineTo(rJetX, rJetY + jetLen);
        ctx.lineTo(rJetX + jetWidth, rJetY);
        ctx.fillStyle = rGrad;
        ctx.fill();

        // Inner jet flame (downward)
        var rInnerLen = jetLen * (0.55 + Math.random() * 0.1);
        var rInnerW = jetWidth * 0.5;
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
        // Left leg top-left at SVG coords ~(13.3, 38.5) (midpoint of left leg top edge)
        var lJetX = 13.3 * jnx - halfW;
        var lJetY = 38.5 * jny - halfH;

        // Outer jet flame (upward)
        var lGrad = ctx.createLinearGradient(lJetX, lJetY, lJetX, lJetY - jetLen);
        lGrad.addColorStop(0, '#F37121');
        lGrad.addColorStop(0.4, '#FF9234');
        lGrad.addColorStop(0.75, '#FFBB44');
        lGrad.addColorStop(1, '#FFD966');
        ctx.beginPath();
        ctx.moveTo(lJetX - jetWidth, lJetY);
        ctx.lineTo(lJetX, lJetY - jetLen);
        ctx.lineTo(lJetX + jetWidth, lJetY);
        ctx.fillStyle = lGrad;
        ctx.fill();

        // Inner jet flame (upward)
        var lInnerLen = jetLen * (0.55 + Math.random() * 0.1);
        var lInnerW = jetWidth * 0.5;
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

    ctx.restore();
}
