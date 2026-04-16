/**
 * Leaderboard Proxy — Cloudflare Worker
 *
 * Proxies score submissions to dreamlo so the private key never reaches
 * the browser. Deploy as a Cloudflare Worker with the following env vars:
 *
 *   DREAMLO_PRIVATE_KEY  — your dreamlo private key
 *   DREAMLO_BASE_URL     — https://www.dreamlo.com/lb (default)
 *   ALLOWED_ORIGIN       — your game's origin for CORS (e.g. https://yourgame.com)
 *
 * Setup:
 *   1. npm install -g wrangler
 *   2. wrangler init leaderboard-proxy
 *   3. Copy this file as src/index.js
 *   4. wrangler secret put DREAMLO_PRIVATE_KEY
 *   5. wrangler deploy
 *   6. Set ONLINE_LEADERBOARD_CONFIG.submitProxyUrl to the worker URL
 *
 * Security model:
 *   - Game session tokens: The client must request a one-time-use session
 *     token via POST /session before submitting a score. Each token can
 *     only be used once and expires after 30 minutes. This prevents
 *     drive-by console submissions without having started a game through
 *     the normal flow.
 *   - IP-based rate limiting: Both /session and /submit endpoints enforce
 *     per-IP rate limits. A client can request at most one session every
 *     10 seconds and submit at most one score every 10 seconds.
 *   - Score bounds: Scores are capped at MAX_SCORE server-side.
 *   - Name sanitization: Player names are sanitized server-side.
 */

// --- Configuration ---
var MAX_NAME_LENGTH = 20;
var MAX_SCORE = 1000000;
var RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds per IP per endpoint
var SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
var SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // clean expired sessions every 5 min
var MAX_ACTIVE_SESSIONS_PER_IP = 3; // max concurrent sessions per IP

// In-memory stores (reset on worker restart — acceptable for free tier)
var rateLimitMap = {}; // key: "ip:endpoint", value: timestamp
var sessionStore = {}; // key: token, value: { ip, createdAt, used }
var lastCleanup = Date.now();

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
 * Clean up expired sessions to prevent memory growth.
 */
function cleanupExpiredSessions() {
    var now = Date.now();
    if (now - lastCleanup < SESSION_CLEANUP_INTERVAL_MS) return;
    lastCleanup = now;
    var keys = Object.keys(sessionStore);
    for (var i = 0; i < keys.length; i++) {
        var session = sessionStore[keys[i]];
        if (session.used || now - session.createdAt > SESSION_TTL_MS) {
            delete sessionStore[keys[i]];
        }
    }
    // Also clean old rate limit entries
    var rlKeys = Object.keys(rateLimitMap);
    for (var j = 0; j < rlKeys.length; j++) {
        if (now - rateLimitMap[rlKeys[j]] > RATE_LIMIT_WINDOW_MS * 2) {
            delete rateLimitMap[rlKeys[j]];
        }
    }
}

/**
 * Per-IP, per-endpoint rate limiting.
 */
function isRateLimited(ip, endpoint) {
    var key = ip + ':' + endpoint;
    var now = Date.now();
    var last = rateLimitMap[key];
    if (last && now - last < RATE_LIMIT_WINDOW_MS) {
        return true;
    }
    rateLimitMap[key] = now;
    return false;
}

/**
 * Count active (unused, non-expired) sessions for a given IP.
 */
function countActiveSessions(ip) {
    var now = Date.now();
    var count = 0;
    var keys = Object.keys(sessionStore);
    for (var i = 0; i < keys.length; i++) {
        var s = sessionStore[keys[i]];
        if (s.ip === ip && !s.used && now - s.createdAt <= SESSION_TTL_MS) {
            count++;
        }
    }
    return count;
}

function corsHeaders(origin, allowedOrigin) {
    return {
        'Access-Control-Allow-Origin': allowedOrigin || '*',
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
        cleanupExpiredSessions();

        var allowedOrigin = env.ALLOWED_ORIGIN || '*';
        var headers = corsHeaders(request.headers.get('Origin'), allowedOrigin);

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: headers });
        }

        var url = new URL(request.url);
        var clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

        // --- POST /session — Issue a one-time-use game session token ---
        if (url.pathname === '/session' && request.method === 'POST') {
            if (isRateLimited(clientIp, 'session')) {
                return jsonResponse({ error: 'Rate limited' }, 429, headers);
            }
            if (countActiveSessions(clientIp) >= MAX_ACTIVE_SESSIONS_PER_IP) {
                return jsonResponse({ error: 'Too many active sessions' }, 429, headers);
            }

            var token = generateToken();
            sessionStore[token] = {
                ip: clientIp,
                createdAt: Date.now(),
                used: false
            };

            return jsonResponse({ token: token }, 200, headers);
        }

        // --- POST /submit — Submit a score with a valid session token ---
        if (url.pathname === '/submit' && request.method === 'POST') {
            // Rate limiting by IP
            if (isRateLimited(clientIp, 'submit')) {
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
            var token = String(body.token || '');
            var session = sessionStore[token];
            if (!session) {
                return jsonResponse({ error: 'Invalid or expired session token' }, 403, headers);
            }
            if (session.used) {
                return jsonResponse({ error: 'Session token already used' }, 403, headers);
            }
            if (Date.now() - session.createdAt > SESSION_TTL_MS) {
                delete sessionStore[token];
                return jsonResponse({ error: 'Session token expired' }, 403, headers);
            }
            if (session.ip !== clientIp) {
                return jsonResponse({ error: 'Session token IP mismatch' }, 403, headers);
            }

            // Mark token as used immediately (one-time-use)
            session.used = true;

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
