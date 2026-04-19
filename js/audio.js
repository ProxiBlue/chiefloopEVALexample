// --- Audio Setup (Web Audio API — no external files) ---
var audioCtx = null;
var thrustOsc = null;
var thrustGain = null;
var thrustNoiseSource = null;
var thrustNoiseGain = null;
var isThrustSoundPlaying = false;

function ensureAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function createNoiseBuffer(ctx, duration) {
    var sampleRate = ctx.sampleRate;
    var length = sampleRate * duration;
    var buffer = ctx.createBuffer(1, length, sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

function startThrustSound() {
    if (isThrustSoundPlaying) return;
    var ctx = ensureAudioCtx();
    isThrustSoundPlaying = true;

    // Low rumble oscillator
    thrustOsc = ctx.createOscillator();
    thrustOsc.type = 'sawtooth';
    thrustOsc.frequency.setValueAtTime(55, ctx.currentTime);
    thrustGain = ctx.createGain();
    thrustGain.gain.setValueAtTime(0, ctx.currentTime);
    thrustGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
    thrustOsc.connect(thrustGain);
    thrustGain.connect(ctx.destination);
    thrustOsc.start();

    // White noise hiss layer
    thrustNoiseGain = ctx.createGain();
    thrustNoiseGain.gain.setValueAtTime(0, ctx.currentTime);
    thrustNoiseGain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
    var noiseBuffer = createNoiseBuffer(ctx, 2);
    thrustNoiseSource = ctx.createBufferSource();
    thrustNoiseSource.buffer = noiseBuffer;
    thrustNoiseSource.loop = true;
    var hipass = ctx.createBiquadFilter();
    hipass.type = 'highpass';
    hipass.frequency.setValueAtTime(800, ctx.currentTime);
    thrustNoiseSource.connect(hipass);
    hipass.connect(thrustNoiseGain);
    thrustNoiseGain.connect(ctx.destination);
    thrustNoiseSource.start();
}

function stopThrustSound() {
    if (!isThrustSoundPlaying) return;
    isThrustSoundPlaying = false;
    var ctx = audioCtx;
    if (!ctx) return;
    var t = ctx.currentTime;
    if (thrustGain) {
        thrustGain.gain.cancelScheduledValues(t);
        thrustGain.gain.setValueAtTime(thrustGain.gain.value, t);
        thrustGain.gain.linearRampToValueAtTime(0, t + 0.05);
    }
    if (thrustNoiseGain) {
        thrustNoiseGain.gain.cancelScheduledValues(t);
        thrustNoiseGain.gain.setValueAtTime(thrustNoiseGain.gain.value, t);
        thrustNoiseGain.gain.linearRampToValueAtTime(0, t + 0.05);
    }
    setTimeout(function () {
        if (thrustOsc) { try { thrustOsc.stop(); } catch(e){} thrustOsc = null; }
        if (thrustNoiseSource) { try { thrustNoiseSource.stop(); } catch(e){} thrustNoiseSource = null; }
        thrustGain = null;
        thrustNoiseGain = null;
    }, 80);
}

function playExplosionSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;

    // Noise burst
    var noiseBuffer = createNoiseBuffer(ctx, 1);
    var noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    var noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2000, t);
    lp.frequency.exponentialRampToValueAtTime(100, t + 0.8);
    noise.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.8);

    // Low thud
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 0.5);
    var oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.5, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
}

function playLandingSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;

    // Pleasant chime — two tones
    [523.25, 659.25].forEach(function(freq, i) {
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.25, t + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.6);
    });
}

function playShootSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;

    // Short retro laser zap — square wave with fast downward pitch sweep
    var osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.08);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.linearRampToValueAtTime(0.10, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
}

function playAlienDestroySound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;

    // Retro 8-bit pop/crunch — noise burst + descending square tone
    // Noise burst layer (short crunch)
    var noiseBuffer = createNoiseBuffer(ctx, 0.15);
    var noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    var noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3000, t);
    bp.Q.setValueAtTime(1.5, t);
    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.15);

    // Square wave pop (descending pitch)
    var osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.15);
    var oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.10, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
}

function playLaunchSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(3000, t + 0.2);
    osc.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
}

// Low boom for building/battery destruction (AC#6). Deliberately distinct from
// playLaunchSound (rising high-pitch whoosh) and the interceptor detonation
// visual — heavy sub-bass sine + filtered noise layer, longer tail.
function playDestructionSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;

    // Sub-bass thud
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.7);
    var oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.55, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.8);

    // Rumble noise layer
    var noiseBuffer = createNoiseBuffer(ctx, 0.8);
    var noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    var noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.28, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.7);
    noise.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.75);
}

// US-013 AC#1: Interceptor launch — rising whoosh tone, sine oscillator
// frequency sweep 200 → 800 Hz over exactly 0.2s. Soft attack, quick decay.
// Fresh nodes per call so rapid launches don't share state (AC#7 anti-glitch);
// each call's oscillator + gain GC after stop().
function playInterceptorLaunchSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.2);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
}

// US-013 AC#2: Interceptor detonation — soft thud/boom, low-frequency noise
// burst with 0.3s decay. Lowpass-filtered noise + sub-bass sine for body.
function playInterceptorDetonationSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var noiseBuffer = createNoiseBuffer(ctx, 0.3);
    var noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    var noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.18, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    noise.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.3);

    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    var oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.20, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
}

// US-013 AC#3: Incoming missile impact (building/battery hit) — deeper, lower
// pitched explosion adapted from playExplosionSound. Same noise + sine pair
// pitched ~30% lower so the player can distinguish "we got hit" from
// other detonations in the same scene.
function playMissileImpactSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;

    var noiseBuffer = createNoiseBuffer(ctx, 1);
    var noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    var noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.42, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(70, t + 0.85);
    noise.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.9);

    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, t);
    osc.frequency.exponentialRampToValueAtTime(18, t + 0.55);
    var oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.55, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);
}

// US-013 AC#4: Incoming missile intercepted — satisfying mid-frequency pop,
// 0.1s. Triangle wave at ~900 → 450 Hz with very fast attack and decay;
// distinct from launch whoosh (sine 200→800), detonation thud (low noise),
// and impact boom (sub-bass sine + low noise).
function playMissileInterceptedSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(450, t + 0.1);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.20, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
}

// US-013 AC#5: Wave complete — short ascending two-note chime (C5 → E5),
// sine oscillators with ~0.12s stagger between notes. Pleasant, brief,
// signals "wave drained" before the next wave spawns.
function playWaveCompleteChime() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    [523.25, 659.25].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.18, t + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.4);
    });
}

function playClickSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, t);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
}
