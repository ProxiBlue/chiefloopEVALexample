// --- Audio Setup (Web Audio API — no external files) ---
var audioCtx = null;
var thrustOsc = null;
var thrustGain = null;
var thrustNoiseSource = null;
var thrustNoiseGain = null;
var thrustRumbleSource = null;
var thrustRumbleGain = null;
var thrustCrackleSource = null;
var thrustCrackleGain = null;
var thrustFlutterLfo = null;
var isThrustSoundPlaying = false;
var thrustCurrentMode = null;

// Gain/pitch targets per thrust mode. Retro is softer + higher-pitched so it
// is audibly distinct from the main thruster (PRD US-003 AC#8).
var THRUST_MODE_PROFILES = {
    main: { rumble: 0.22, crackle: 0.06, hiss: 0.04, osc: 0.10, oscFreq: 42 },
    retro: { rumble: 0.10, crackle: 0.03, hiss: 0.02, osc: 0.05, oscFreq: 120 }
};

function applyThrustMode(mode) {
    var profile = THRUST_MODE_PROFILES[mode] || THRUST_MODE_PROFILES.main;
    if (!audioCtx) return;
    var t = audioCtx.currentTime;
    var ramp = 0.05;
    if (thrustRumbleGain) {
        thrustRumbleGain.gain.cancelScheduledValues(t);
        thrustRumbleGain.gain.setValueAtTime(thrustRumbleGain.gain.value, t);
        thrustRumbleGain.gain.linearRampToValueAtTime(profile.rumble, t + ramp);
    }
    if (thrustCrackleGain) {
        thrustCrackleGain.gain.cancelScheduledValues(t);
        thrustCrackleGain.gain.setValueAtTime(thrustCrackleGain.gain.value, t);
        thrustCrackleGain.gain.linearRampToValueAtTime(profile.crackle, t + ramp);
    }
    if (thrustNoiseGain) {
        thrustNoiseGain.gain.cancelScheduledValues(t);
        thrustNoiseGain.gain.setValueAtTime(thrustNoiseGain.gain.value, t);
        thrustNoiseGain.gain.linearRampToValueAtTime(profile.hiss, t + ramp);
    }
    if (thrustGain) {
        thrustGain.gain.cancelScheduledValues(t);
        thrustGain.gain.setValueAtTime(thrustGain.gain.value, t);
        thrustGain.gain.linearRampToValueAtTime(profile.osc, t + ramp);
    }
    if (thrustOsc) {
        thrustOsc.frequency.cancelScheduledValues(t);
        thrustOsc.frequency.setValueAtTime(thrustOsc.frequency.value, t);
        thrustOsc.frequency.linearRampToValueAtTime(profile.oscFreq, t + ramp);
    }
    thrustCurrentMode = mode;
}

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

function createBrownNoiseBuffer(ctx, duration) {
    var sampleRate = ctx.sampleRate;
    var length = sampleRate * duration;
    var buffer = ctx.createBuffer(1, length, sampleRate);
    var data = buffer.getChannelData(0);
    var lastOut = 0;
    for (var i = 0; i < length; i++) {
        var white = Math.random() * 2 - 1;
        lastOut = (lastOut + (0.02 * white)) / 1.02;
        data[i] = lastOut * 3.5;
    }
    return buffer;
}

function startThrustSound(mode) {
    mode = mode || 'main';
    if (isThrustSoundPlaying) {
        if (mode !== thrustCurrentMode) applyThrustMode(mode);
        return;
    }
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    isThrustSoundPlaying = true;
    var profile = THRUST_MODE_PROFILES[mode] || THRUST_MODE_PROFILES.main;
    thrustCurrentMode = mode;

    // Layer 1: Brown noise rumble (deep rocket exhaust body)
    var brownBuffer = createBrownNoiseBuffer(ctx, 2);
    thrustRumbleSource = ctx.createBufferSource();
    thrustRumbleSource.buffer = brownBuffer;
    thrustRumbleSource.loop = true;
    var rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.setValueAtTime(250, t);
    thrustRumbleGain = ctx.createGain();
    thrustRumbleGain.gain.setValueAtTime(0, t);
    thrustRumbleGain.gain.linearRampToValueAtTime(profile.rumble, t + 0.08);
    thrustRumbleSource.connect(rumbleLp);
    rumbleLp.connect(thrustRumbleGain);
    thrustRumbleGain.connect(ctx.destination);
    thrustRumbleSource.start();

    // Layer 2: Bandpass noise crackle (mid-range turbulence)
    var crackleBuffer = createNoiseBuffer(ctx, 2);
    thrustCrackleSource = ctx.createBufferSource();
    thrustCrackleSource.buffer = crackleBuffer;
    thrustCrackleSource.loop = true;
    var crackBp = ctx.createBiquadFilter();
    crackBp.type = 'bandpass';
    crackBp.frequency.setValueAtTime(300, t);
    crackBp.Q.setValueAtTime(0.8, t);
    thrustCrackleGain = ctx.createGain();
    thrustCrackleGain.gain.setValueAtTime(0, t);
    thrustCrackleGain.gain.linearRampToValueAtTime(profile.crackle, t + 0.08);
    thrustCrackleSource.connect(crackBp);
    crackBp.connect(thrustCrackleGain);
    thrustCrackleGain.connect(ctx.destination);
    thrustCrackleSource.start();

    // Layer 3: High hiss (exhaust gas)
    var noiseBuffer = createNoiseBuffer(ctx, 2);
    thrustNoiseSource = ctx.createBufferSource();
    thrustNoiseSource.buffer = noiseBuffer;
    thrustNoiseSource.loop = true;
    var hipass = ctx.createBiquadFilter();
    hipass.type = 'highpass';
    hipass.frequency.setValueAtTime(2000, t);
    thrustNoiseGain = ctx.createGain();
    thrustNoiseGain.gain.setValueAtTime(0, t);
    thrustNoiseGain.gain.linearRampToValueAtTime(profile.hiss, t + 0.08);
    thrustNoiseSource.connect(hipass);
    hipass.connect(thrustNoiseGain);
    thrustNoiseGain.connect(ctx.destination);
    thrustNoiseSource.start();

    // Layer 4: Sub-bass oscillator (engine core tone)
    thrustOsc = ctx.createOscillator();
    thrustOsc.type = 'sine';
    thrustOsc.frequency.setValueAtTime(profile.oscFreq, t);
    thrustGain = ctx.createGain();
    thrustGain.gain.setValueAtTime(0, t);
    thrustGain.gain.linearRampToValueAtTime(profile.osc, t + 0.08);
    thrustOsc.connect(thrustGain);
    thrustGain.connect(ctx.destination);
    thrustOsc.start();

    // Layer 5: LFO flutter (turbulence modulation on the rumble gain)
    thrustFlutterLfo = ctx.createOscillator();
    thrustFlutterLfo.type = 'sine';
    thrustFlutterLfo.frequency.setValueAtTime(7, t);
    var lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.04, t);
    thrustFlutterLfo.connect(lfoGain);
    lfoGain.connect(thrustRumbleGain.gain);
    thrustFlutterLfo.start();
}

function stopThrustSound() {
    if (!isThrustSoundPlaying) return;
    isThrustSoundPlaying = false;
    thrustCurrentMode = null;
    var ctx = audioCtx;
    if (!ctx) return;
    var t = ctx.currentTime;
    var fadeOut = 0.08;
    var gains = [thrustGain, thrustNoiseGain, thrustRumbleGain, thrustCrackleGain];
    for (var i = 0; i < gains.length; i++) {
        if (gains[i]) {
            gains[i].gain.cancelScheduledValues(t);
            gains[i].gain.setValueAtTime(gains[i].gain.value, t);
            gains[i].gain.linearRampToValueAtTime(0, t + fadeOut);
        }
    }
    setTimeout(function () {
        var sources = [thrustOsc, thrustNoiseSource, thrustRumbleSource, thrustCrackleSource, thrustFlutterLfo];
        for (var i = 0; i < sources.length; i++) {
            if (sources[i]) { try { sources[i].stop(); } catch(e){} }
        }
        thrustOsc = null;
        thrustNoiseSource = null;
        thrustRumbleSource = null;
        thrustCrackleSource = null;
        thrustFlutterLfo = null;
        thrustGain = null;
        thrustNoiseGain = null;
        thrustRumbleGain = null;
        thrustCrackleGain = null;
    }, 120);
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

// US-012 AC#4: ProxiBlue shield activation chime — rising sine tone, short +
// pleasant, deliberately in a higher/"blue-ish" frequency band so it reads as
// distinct from the landing chime (which sits at C5/E5). Two stacked sine
// voices (880 → 1320 Hz and a harmonic octave above) create a bright lift.
// US-008 (Code Breaker): power-up caught — short ascending two-note chime.
// Pleasant mid-register pair (660Hz → 990Hz) so it reads as "good" without
// clashing with the Breakout bounce blips (added in US-013).
function playBreakoutPowerupSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    [
        { freq: 660, start: 0.0,  dur: 0.08, gain: 0.14 },
        { freq: 990, start: 0.07, dur: 0.10, gain: 0.14 }
    ].forEach(function (note) {
        var osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, t + note.start);
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t + note.start);
        gain.gain.linearRampToValueAtTime(note.gain, t + note.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + note.start + note.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + note.start);
        osc.stop(t + note.start + note.dur + 0.02);
    });
}

function playProxiblueCollectSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var duration = 0.35;

    [
        { startFreq: 880, endFreq: 1320, gainPeak: 0.22 },
        { startFreq: 1760, endFreq: 2640, gainPeak: 0.10 }
    ].forEach(function (voice) {
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(voice.startFreq, t);
        osc.frequency.exponentialRampToValueAtTime(voice.endFreq, t + duration);
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(voice.gainPeak, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + duration + 0.02);
    });
}

// US-013 AC#4: ProxiBlue shield deactivation — quiet descending sine tone.
// Plays when the shield's natural timer expires (not when consumed by a hit —
// that path has the louder US-009 absorb flash). Low volume so it reads as a
// "power-down" cue rather than an event.
function playProxiblueShieldDeactivateSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var duration = 0.45;

    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(165, t + duration);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
}

function playTechdebtShootSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;

    // Short blip/pew — simple square oscillator, high frequency, fast decay.
    // Distinct from the lander thrust rumble so bullets read as a separate event.
    var osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1600, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.06);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.10, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
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

// Code Breaker US-013 AC#1: Ball-paddle bounce — classic Pong/Breakout blip.
// Square wave, 440Hz, 0.05s. Fresh nodes per call so rapid bounces don't share
// state (AC#8 anti-glitch).
function playBreakoutPaddleBounceSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, t);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.10, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
}

// Code Breaker US-013 AC#2: Ball-brick hit (no destroy) — higher blip than
// the paddle bounce. Square wave, 660Hz, 0.04s.
function playBreakoutBrickHitSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(660, t);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.09, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
}

// Code Breaker US-013 AC#3: Brick destroyed — short bandpass-filtered noise
// burst (0.1s). The bandpass centre frequency jitters per call (750–1250 Hz)
// so successive destructions have slight pitch variety.
function playBreakoutBrickDestroySound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var noiseBuffer = createNoiseBuffer(ctx, 0.12);
    var noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    var centreFreq = 750 + Math.random() * 500;
    bp.frequency.setValueAtTime(centreFreq, t);
    bp.Q.setValueAtTime(2.5, t);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    noise.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.12);
}

// Code Breaker US-013 AC#4: Ball-wall bounce — very short quiet tick. Square
// wave, 220Hz, 0.02s. Intentionally low gain so rapid wall bounces aren't
// obnoxious.
function playBreakoutWallBounceSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.03);
}

// Code Breaker US-013 AC#6: Ball lost — descending sine tone, 400→100Hz
// exponential sweep over 0.3s.
function playBreakoutBallLostSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.3);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.20, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
}

// Code Breaker US-013 AC#7: Victory fanfare — three ascending sine notes
// (C5 → E5 → G5), reusing the playLandingSound two-note pattern extended to
// three for "all bricks cleared". ~0.12s stagger between notes.
function playBreakoutVictorySound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.22, t + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.55);
    });
}

// Feature Drive US-008: Rock hit — metallic clang. Short noise burst with a
// bandpass filter centred at ~800Hz per PRD §14.
function playDriveRockHitSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var noiseBuffer = createNoiseBuffer(ctx, 0.15);
    var noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(800, t);
    bp.Q.setValueAtTime(4, t);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    noise.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.15);
}

// Feature Drive US-009: Pickup chime — short ascending two-note tone
// (E5 → A5, 0.08s stagger). Pleasant and distinctly higher than the
// landing chime so it reads as "collected" mid-drive without clashing.
function playDrivePickupSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    [659.25, 880.00].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.08);
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.18, t + i * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.08);
        osc.stop(t + i * 0.08 + 0.22);
    });
}

// Feature Drive US-010: Speed-boost whoosh — short noise burst pushed
// through a low-pass filter sweeping from high to low. Subtle (lower gain
// than rock-hit / pickup) so repeated triggers don't dominate the mix.
function playDriveBoostSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    var dur = 0.25;
    var noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, dur);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + dur);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);
}

// Feature Drive US-011: Destination-arrival victory jingle. Variation on the
// landing chime — four ascending sine notes (C5 → E5 → G5 → C6) at ~0.12s
// stagger. Louder and longer than the two-note landing chime so the
// completion moment reads as a celebration rather than a normal touchdown.
function playDriveCompleteSound() {
    var ctx = ensureAudioCtx();
    var t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.25, t + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.6);
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
