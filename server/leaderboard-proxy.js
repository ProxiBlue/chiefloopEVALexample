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
 */

// --- Configuration ---
var MAX_NAME_LENGTH = 20;
var MAX_SCORE = 1000000;
var RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds per IP

// In-memory rate limit store (resets on worker restart — acceptable for free tier)
var rateLimitMap = {};

function isRateLimited(ip) {
    var now = Date.now();
    var last = rateLimitMap[ip];
    if (last && now - last < RATE_LIMIT_WINDOW_MS) {
        return true;
    }
    rateLimitMap[ip] = now;
    return false;
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
        var allowedOrigin = env.ALLOWED_ORIGIN || '*';
        var headers = corsHeaders(request.headers.get('Origin'), allowedOrigin);

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: headers });
        }

        var url = new URL(request.url);

        if (url.pathname !== '/submit' || request.method !== 'POST') {
            return jsonResponse({ error: 'Not found' }, 404, headers);
        }

        // --- Rate limiting by IP ---
        var clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (isRateLimited(clientIp)) {
            return jsonResponse({ error: 'Rate limited' }, 429, headers);
        }

        // --- Parse and validate body ---
        var body;
        try {
            body = await request.json();
        } catch (e) {
            return jsonResponse({ error: 'Invalid JSON' }, 400, headers);
        }

        var name = String(body.name || '')
            .replace(/[|<>"'&]/g, '')
            .substring(0, MAX_NAME_LENGTH)
            .trim();

        if (!name) {
            return jsonResponse({ error: 'Invalid name' }, 400, headers);
        }

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
};
