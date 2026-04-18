// --- Stars ---
var stars = [];

function generateStars() {
    stars = [];
    var count = 200;
    for (var i = 0; i < count; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: 0.5 + Math.random() * 2,
            brightness: 0.3 + Math.random() * 0.7
        });
    }
}

function updateStars(dt) {
    if (!invaderMode) return;
    // Scroll stars leftward during invader states for horizontal movement feel
    for (var i = 0; i < stars.length; i++) {
        stars[i].x -= STAR_SCROLL_SPEED * stars[i].size * dt; // parallax: bigger stars scroll faster
        if (stars[i].x < -2) {
            stars[i].x = canvas.width + 2;
            stars[i].y = Math.random() * canvas.height;
        }
    }
}

function drawStars() {
    for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var alpha = s.brightness;
        ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
    }
}


// --- Celebration Particles ---
var celebrationParticles = [];
var celebrationTimer = 0;
var CELEBRATION_DELAY = 1.5; // seconds before "Press Space" prompt appears
var celebrationReady = false; // true when prompt should show
var landedPadPoints = 0; // pad difficulty bonus points (after multiplier)
var landedFuelBonus = 0; // fuel bonus points
var landedTotalPoints = 0; // total points earned from landing
var landedTypeMultiplier = 1; // type multiplier applied
var landedPadBasePoints = 0; // base pad points (before multiplier)
var landedPRTitle = '';       // full PR title for celebration screen
var landedPRNumber = null;   // PR number for info panel
var landedPRAuthor = '';      // PR author for info panel
var landedPRType = '';        // PR type for info panel badge
var landedPRMergedDate = '';  // PR merge date for info panel

function spawnCelebration(x, y) {
    celebrationParticles = [];
    celebrationTimer = 0;
    celebrationReady = false;
    var colors = ['#4CAF50', '#66BB6A', '#A5D6A7', '#FFD700', '#FFC107', '#FFEB3B', '#81C784', '#C8E6C9'];
    for (var i = 0; i < 50; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 30 + Math.random() * 120;
        var life = 1.0 + Math.random() * 1.5;
        celebrationParticles.push({
            x: x + (Math.random() - 0.5) * 40,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: -Math.abs(Math.sin(angle) * speed) - 20, // bias upward
            life: life,
            maxLife: life,
            size: 1.5 + Math.random() * 3.5,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

function updateCelebration(dt) {
    celebrationTimer += dt;
    if (celebrationTimer >= CELEBRATION_DELAY) {
        celebrationReady = true;
    }
    for (var i = celebrationParticles.length - 1; i >= 0; i--) {
        var p = celebrationParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 40 * dt; // gentle gravity on sparkles
        p.life -= dt;
        if (p.life <= 0) {
            celebrationParticles.splice(i, 1);
        }
    }
}

function drawCelebration() {
    for (var i = 0; i < celebrationParticles.length; i++) {
        var p = celebrationParticles[i];
        var alpha = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * alpha), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// --- Explosion Particles ---
var explosionParticles = [];
var explosionTimer = 0;
var EXPLOSION_DURATION = 1.5; // seconds for explosion to finish
var explosionFinished = false;

function spawnExplosion(x, y) {
    explosionParticles = [];
    explosionTimer = 0;
    explosionFinished = false;
    var colors = ['#F37121', '#FF9234', '#E85D0F', '#D4520A', '#FFBB44', '#FFD966', '#FF6600'];
    for (var i = 0; i < 60; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 50 + Math.random() * 200;
        var life = 0.5 + Math.random() * 1.0;
        explosionParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: life,
            maxLife: life,
            size: 2 + Math.random() * 4,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

function updateExplosion(dt) {
    explosionTimer += dt;
    for (var i = explosionParticles.length - 1; i >= 0; i--) {
        var p = explosionParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 80 * dt; // slight gravity on particles
        p.life -= dt;
        if (p.life <= 0) {
            explosionParticles.splice(i, 1);
        }
    }
    if (explosionTimer >= EXPLOSION_DURATION) {
        explosionFinished = true;
    }
}

function drawExplosion() {
    for (var i = 0; i < explosionParticles.length; i++) {
        var p = explosionParticles[i];
        var alpha = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// --- Alien Explosion Particles ---
var ALIEN_EXPLOSION_COLORS = ['#FF4444', '#FF6644', '#FFAA00', '#FFDD44', '#FFFFFF'];

function spawnAlienExplosion(x, y) {
    var particles = [];
    for (var i = 0; i < 12; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 40 + Math.random() * 100;
        var life = 0.3 + Math.random() * 0.4;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: life,
            maxLife: life,
            size: 1.5 + Math.random() * 3,
            color: ALIEN_EXPLOSION_COLORS[Math.floor(Math.random() * ALIEN_EXPLOSION_COLORS.length)]
        });
    }
    alienExplosions.push(particles);
}

function updateAlienExplosions(dt) {
    for (var g = alienExplosions.length - 1; g >= 0; g--) {
        var group = alienExplosions[g];
        for (var i = group.length - 1; i >= 0; i--) {
            var p = group[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) {
                group.splice(i, 1);
            }
        }
        if (group.length === 0) {
            alienExplosions.splice(g, 1);
        }
    }
}

function drawAlienExplosions() {
    for (var g = 0; g < alienExplosions.length; g++) {
        var group = alienExplosions[g];
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

// --- Bomb Particles (trail + explosion) ---
var BOMB_TRAIL_COLORS = ['#FFBB44', '#FF9234', '#F37121'];
var BOMB_EXPLOSION_COLORS = ['#F37121', '#FF9234', '#FFBB44', '#FFD966', '#FFEB3B'];

function spawnBombTrail(x, y) {
    // Cap bombParticles[] to prevent unbounded growth under bomb flood (DoS guard).
    // Trails are cosmetic — dropping frames when saturated is acceptable.
    if (bombParticles.length >= BUGFIX_MAX_BOMB_PARTICLES) return;
    bombParticles.push({
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        life: 0.3,
        maxLife: 0.3,
        size: 1.5 + Math.random() * 1.5,
        color: BOMB_TRAIL_COLORS[Math.floor(Math.random() * BOMB_TRAIL_COLORS.length)]
    });
}

function spawnBombExplosion(x, y) {
    for (var i = 0; i < 16; i++) {
        if (bombParticles.length >= BUGFIX_MAX_BOMB_PARTICLES) return;
        var angle = Math.random() * Math.PI * 2;
        var speed = 40 + Math.random() * 120;
        var life = 0.4 + Math.random() * 0.5;
        bombParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: life,
            maxLife: life,
            size: 2 + Math.random() * 3,
            color: BOMB_EXPLOSION_COLORS[Math.floor(Math.random() * BOMB_EXPLOSION_COLORS.length)]
        });
    }
}

function updateBombParticles(dt) {
    for (var i = bombParticles.length - 1; i >= 0; i--) {
        var p = bombParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) {
            bombParticles.splice(i, 1);
        }
    }
}

// --- Bug Explosion Particles (killed bugs) ---
var BUG_EXPLOSION_COLORS = ['#FFEB3B', '#FFD966', '#FFBB44', '#F44336', '#FF6644'];

function spawnBugExplosion(x, y) {
    var particles = [];
    for (var i = 0; i < 10; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 30 + Math.random() * 80;
        var life = 0.3 + Math.random() * 0.4;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: life,
            maxLife: life,
            size: 1.5 + Math.random() * 2.5,
            color: BUG_EXPLOSION_COLORS[Math.floor(Math.random() * BUG_EXPLOSION_COLORS.length)]
        });
    }
    bugExplosions.push(particles);
}

function updateBugExplosions(dt) {
    for (var g = bugExplosions.length - 1; g >= 0; g--) {
        var group = bugExplosions[g];
        for (var i = group.length - 1; i >= 0; i--) {
            var p = group[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 40 * dt;
            p.life -= dt;
            if (p.life <= 0) {
                group.splice(i, 1);
            }
        }
        if (group.length === 0) {
            bugExplosions.splice(g, 1);
        }
    }
}

// --- Screen Shake ---
var screenShake = 0;
var SCREEN_SHAKE_DURATION = 0.3;
var SCREEN_SHAKE_INTENSITY = 8;

function startScreenShake() {
    screenShake = SCREEN_SHAKE_DURATION;
}
