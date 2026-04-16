/**
 * Leaderboard Proxy — Cloudflare Worker
 *
 * Proxies score submissions to dreamlo so the private key never reaches
 * the browser. Deploy as a Cloudflare Worker with the following env vars
 * and bindings:
 *
 *   DREAMLO_PRIVATE_KEY  — your dreamlo private key (required)
 *   DREAMLO_BASE_URL     — https://www.dreamlo.com/lb (default)
 *   ALLOWED_ORIGIN       — your game's origin for CORS (required, e.g. https://yourgame.com)
 *   SESSION_KV           — KV namespace binding for session/rate-limit storage (required)
 *
 * Setup:
 *   1. npm install -g wrangler
 *   2. wrangler init leaderboard-proxy
 *   3. Copy this file as src/index.js
 *   4. wrangler kv:namespace create SESSION_KV
 *   5. Add the KV namespace binding to wrangler.toml
 *   6. wrangler secret put DREAMLO_PRIVATE_KEY
 *   7. Set ALLOWED_ORIGIN in wrangler.toml (e.g. ALLOWED_ORIGIN = "https://yourgame.com")
 *   8. wrangler deploy
 *   9. Set ONLINE_LEADERBOARD_CONFIG.submitProxyUrl to the worker URL
 *
 * IMPORTANT: ALLOWED_ORIGIN must be set. The worker will reject all
 * requests if it is not configured, to prevent open CORS policies.
 *
 * Security model:
 *   - Durable session tokens: Stored in Cloudflare KV so they work
 *     correctly across multiple Worker isolates and edge PoPs.
 *   - Game session tokens: The client must request a one-time-use session
 *     token via POST /session before submitting a score. Each token can
 *     only be used once and expires after 30 minutes. Scores cannot be
 *     submitted until at least MIN_GAME_DURATION_MS after the session
 *     was created, preventing trivial automated submissions.
 *   - IP-based rate limiting: Both /session and /submit endpoints enforce
 *     per-IP rate limits via KV. A client can request at most one session
 *     every 10 seconds and submit at most one score every 10 seconds.
 *   - Restrictive CORS: Only the configured ALLOWED_ORIGIN can make
 *     cross-origin requests. Wildcard CORS is never used.
 *   - Score bounds: Scores are capped at MAX_SCORE server-side.
 *   - Name sanitization: Player names are sanitized server-side.
 */

// --- Configuration ---
var MAX_NAME_LENGTH = 20;
var MAX_SCORE = 1000000;
var RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds per IP per endpoint
var SESSION_TTL_SECONDS = 30 * 60; // 30 minutes (KV expiration in seconds)
var MAX_ACTIVE_SESSIONS_PER_IP = 3; // max concurrent sessions per IP
var MIN_GAME_DURATION_MS = 10000; // minimum 10 seconds between session creation and score submit

/**
 * Generate a cryptographically random session token.
 * Uses the Web Crypto API available in Cloudflare Workers.
 */
function generateToken() {
    var bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    var token = '';
    for (var i = 0; i < bytes.length; i++) {
        token += ('0' + bytes[i].toString(16)).slice(-2);
    }
    return token;
}

/**
 * Per-IP, per-endpoint rate limiting using KV.
 * Returns true if the request should be blocked.
 */
async function isRateLimited(kv, ip, endpoint) {
    var key = 'rl:' + ip + ':' + endpoint;
    var last = await kv.get(key);
    var now = Date.now();
    if (last && now - parseInt(last, 10) < RATE_LIMIT_WINDOW_MS) {
        return true;
    }
    // Store with short TTL (rate limit window * 2 in seconds, minimum 1)
    var ttlSeconds = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS * 2) / 1000));
    await kv.put(key, String(now), { expirationTtl: ttlSeconds });
    return false;
}

/**
 * Count active sessions for a given IP using KV.
 * Session count keys: "sc:<ip>" — integer counter.
 */
async function getSessionCount(kv, ip) {
    var val = await kv.get('sc:' + ip);
    return val ? parseInt(val, 10) : 0;
}

async function incrementSessionCount(kv, ip) {
    var key = 'sc:' + ip;
    var count = await getSessionCount(kv, ip);
    await kv.put(key, String(count + 1), { expirationTtl: SESSION_TTL_SECONDS });
}

async function decrementSessionCount(kv, ip) {
    var key = 'sc:' + ip;
    var count = await getSessionCount(kv, ip);
    var newCount = Math.max(0, count - 1);
    if (newCount === 0) {
        await kv.delete(key);
    } else {
        await kv.put(key, String(newCount), { expirationTtl: SESSION_TTL_SECONDS });
    }
}

function corsHeaders(allowedOrigin) {
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
    };
}

function jsonResponse(body, status, headers) {
    return new Response(JSON.stringify(body), {
        status: status,
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers)
    });
}

export default {
    async fetch(request, env) {
        // --- Require ALLOWED_ORIGIN to be configured ---
        var allowedOrigin = env.ALLOWED_ORIGIN;
        if (!allowedOrigin) {
            return jsonResponse(
                { error: 'Server misconfigured: ALLOWED_ORIGIN is not set' },
                500,
                {}
            );
        }

        var headers = corsHeaders(allowedOrigin);

        // --- Require KV binding ---
        var kv = env.SESSION_KV;
        if (!kv) {
            return jsonResponse(
                { error: 'Server misconfigured: SESSION_KV binding is missing' },
                500,
                headers
            );
        }

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: headers });
        }

        // Reject requests from non-allowed origins
        var origin = request.headers.get('Origin');
        if (origin && origin !== allowedOrigin) {
            return jsonResponse({ error: 'Origin not allowed' }, 403, headers);
        }

        var url = new URL(request.url);
        var clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

        // --- POST /session — Issue a one-time-use game session token ---
        if (url.pathname === '/session' && request.method === 'POST') {
            if (await isRateLimited(kv, clientIp, 'session')) {
                return jsonResponse({ error: 'Rate limited' }, 429, headers);
            }
            var activeCount = await getSessionCount(kv, clientIp);
            if (activeCount >= MAX_ACTIVE_SESSIONS_PER_IP) {
                return jsonResponse({ error: 'Too many active sessions' }, 429, headers);
            }

            var token = generateToken();
            var sessionData = JSON.stringify({
                ip: clientIp,
                createdAt: Date.now(),
                used: false
            });

            // Store session in KV with automatic expiration
            await kv.put('sess:' + token, sessionData, { expirationTtl: SESSION_TTL_SECONDS });
            await incrementSessionCount(kv, clientIp);

            return jsonResponse({ token: token }, 200, headers);
        }

        // --- POST /submit — Submit a score with a valid session token ---
        if (url.pathname === '/submit' && request.method === 'POST') {
            // Rate limiting by IP
            if (await isRateLimited(kv, clientIp, 'submit')) {
                return jsonResponse({ error: 'Rate limited' }, 429, headers);
            }

            // Parse and validate body
            var body;
            try {
                body = await request.json();
            } catch (e) {
                return jsonResponse({ error: 'Invalid JSON' }, 400, headers);
            }

            // --- Validate session token ---
            var tokenStr = String(body.token || '');
            var sessionRaw = await kv.get('sess:' + tokenStr);
            if (!sessionRaw) {
                return jsonResponse({ error: 'Invalid or expired session token' }, 403, headers);
            }

            var session;
            try {
                session = JSON.parse(sessionRaw);
            } catch (e) {
                await kv.delete('sess:' + tokenStr);
                return jsonResponse({ error: 'Invalid session data' }, 403, headers);
            }

            if (session.used) {
                return jsonResponse({ error: 'Session token already used' }, 403, headers);
            }
            if (session.ip !== clientIp) {
                return jsonResponse({ error: 'Session token IP mismatch' }, 403, headers);
            }

            // --- Enforce minimum game duration ---
            var elapsed = Date.now() - session.createdAt;
            if (elapsed < MIN_GAME_DURATION_MS) {
                return jsonResponse({ error: 'Score submitted too quickly after game start' }, 403, headers);
            }

            // Mark token as used immediately (one-time-use) and update in KV
            session.used = true;
            await kv.put('sess:' + tokenStr, JSON.stringify(session), { expirationTtl: 60 });
            await decrementSessionCount(kv, clientIp);

            // --- Validate name ---
            var name = String(body.name || '')
                .replace(/[|<>"'&]/g, '')
                .substring(0, MAX_NAME_LENGTH)
                .trim();

            if (!name) {
                return jsonResponse({ error: 'Invalid name' }, 400, headers);
            }

            // --- Validate score ---
            var score = Math.floor(Number(body.score));
            if (isNaN(score) || score <= 0) {
                return jsonResponse({ error: 'Score must be a positive integer' }, 400, headers);
            }
            if (score > MAX_SCORE) {
                return jsonResponse({ error: 'Score exceeds maximum' }, 400, headers);
            }

            // --- Forward to dreamlo ---
            var privateKey = env.DREAMLO_PRIVATE_KEY;
            if (!privateKey) {
                console.error('DREAMLO_PRIVATE_KEY is not configured');
                return jsonResponse({ error: 'Server misconfigured' }, 500, headers);
            }

            var baseUrl = env.DREAMLO_BASE_URL || 'https://www.dreamlo.com/lb';
            var dreamloUrl = baseUrl + '/' +
                encodeURIComponent(privateKey) + '/add/' +
                encodeURIComponent(name) + '/' + score;

            try {
                var resp = await fetch(dreamloUrl);
                if (!resp.ok) {
                    return jsonResponse({ error: 'Upstream error' }, 502, headers);
                }
                return jsonResponse({ ok: true }, 200, headers);
            } catch (e) {
                console.error('dreamlo request failed', e);
                return jsonResponse({ error: 'Upstream error' }, 502, headers);
            }
        }

        return jsonResponse({ error: 'Not found' }, 404, headers);
    }
};
