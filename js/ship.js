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
var shipLogoImg = new Image();
var shipLogoLoaded = false;
shipLogoImg.onload = function() {
    shipLogoLoaded = true;
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

    var s = size;
    var halfW = s * 0.5;
    var halfH = s * 0.6;

    // Draw the Mage-OS SVG logo using drawImage if loaded
    if (shipLogoLoaded) {
        // Draw the SVG image centered at (0,0)
        ctx.drawImage(shipLogoImg, -halfW, -halfH, s, s * 1.2);
    } else {
        // Fallback: draw the M shape with canvas paths (same as original)
        ctx.beginPath();
        ctx.strokeStyle = '#f26322';
        ctx.fillStyle = '#f26322';
        ctx.lineWidth = s * 0.08;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.moveTo(-halfW, halfH);
        ctx.lineTo(-halfW, -halfH);
        ctx.lineTo(-halfW * 0.35, -halfH * 0.15);
        ctx.lineTo(0, -halfH);
        ctx.lineTo(halfW * 0.35, -halfH * 0.15);
        ctx.lineTo(halfW, -halfH);
        ctx.lineTo(halfW, halfH);

        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-halfW * 0.5, halfH);
        ctx.lineTo(-halfW * 0.5, halfH + s * 0.08);
        ctx.moveTo(0, halfH);
        ctx.lineTo(0, halfH + s * 0.08);
        ctx.moveTo(halfW * 0.5, halfH);
        ctx.lineTo(halfW * 0.5, halfH + s * 0.08);
        ctx.strokeStyle = '#f26322';
        ctx.lineWidth = s * 0.04;
        ctx.stroke();
    }

    // Draw thrust flame when thrusting
    if (thrusting) {
        var flameLen = s * (0.4 + Math.random() * 0.25);
        var flameWidth = halfW * (0.35 + Math.random() * 0.08);

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
