// --- Main Module: Canvas Setup, Game Loop, Bootstrap ---

// --- Canvas Setup ---
var canvas = document.getElementById('gameCanvas');
var ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', function() {
    resizeCanvas();
    generateStars();
});
resizeCanvas();

// --- Timing ---
var lastTime = 0;

// --- Game Loop ---
function gameLoop(timestamp) {
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Clamp delta time to avoid spiral of death on tab switch
    if (dt > 0.1) {
        dt = 0.1;
    }

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

// Generate initial starfield
generateStars();

// Start the loop
requestAnimationFrame(function (timestamp) {
    lastTime = timestamp;
    gameLoop(timestamp);
});
