// --- Online Leaderboard Utility ---
// Requires: js/onlineConfig.js (loaded before this file)

// --- Private state for rate limiting ---
var _lastSubmitTime = 0;

/**
 * Sanitize a string for safe DOM insertion — strips HTML tags and decodes
 * common HTML entities so leaderboard names cannot carry XSS payloads.
 * @param {string} str
 * @returns {string}
 */
function _sanitizeLeaderboardString(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * Create an AbortController-based timeout wrapper for fetch.
 * Falls back gracefully if AbortController is not available.
 * @param {string} url
 * @param {object} options - fetch options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
function _fetchWithTimeout(url, options, timeoutMs) {
    if (typeof AbortController === 'undefined') {
        return fetch(url, options);
    }
    var controller = new AbortController();
    var opts = {};
    for (var key in options) {
        if (options.hasOwnProperty(key)) opts[key] = options[key];
    }
    opts.signal = controller.signal;

    var timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);

    return fetch(url, opts).then(function (response) {
        clearTimeout(timeoutId);
        return response;
    }).catch(function (err) {
        clearTimeout(timeoutId);
        throw err;
    });
}

/**
 * Submit a score to the online leaderboard.
 * Includes client-side rate limiting, score bounds checking, and a fetch
 * timeout.  These are defence-in-depth measures — for a tamper-proof
 * leaderboard, proxy submissions through a server.
 *
 * @param {string} playerName - Player name (max 20 characters)
 * @param {number} playerScore - Score (positive integer, capped by config)
 * @returns {Promise<boolean>} true if submission succeeded, false otherwise
 */
function submitOnlineScore(playerName, playerScore) {
    // --- Rate limiting ---
    var now = Date.now();
    var cooldownMs = (ONLINE_LEADERBOARD_CONFIG.submitCooldownSeconds || 10) * 1000;
    if (now - _lastSubmitTime < cooldownMs) {
        console.warn('submitOnlineScore: rate limited — wait before resubmitting');
        return Promise.resolve(false);
    }

    // --- Input validation ---
    // Sanitize player name: truncate to 20 chars, strip pipe (dreamlo delimiter)
    // and angle brackets (prevent any HTML in name reaching the API).
    var name = String(playerName)
        .replace(/[|<>"']/g, '')
        .substring(0, 20)
        .trim();
    var scoreInt = Math.floor(Number(playerScore));

    if (!name) {
        console.warn('submitOnlineScore: player name is empty after sanitization');
        return Promise.resolve(false);
    }
    if (isNaN(scoreInt) || scoreInt <= 0) {
        console.warn('submitOnlineScore: score must be a positive integer');
        return Promise.resolve(false);
    }
    var maxScore = ONLINE_LEADERBOARD_CONFIG.maxScore || 1000000;
    if (scoreInt > maxScore) {
        console.warn('submitOnlineScore: score exceeds maximum allowed value (' + maxScore + ')');
        return Promise.resolve(false);
    }

    var url = ONLINE_LEADERBOARD_CONFIG.baseUrl + '/' +
        encodeURIComponent(ONLINE_LEADERBOARD_PRIVATE_KEY) + '/add/' +
        encodeURIComponent(name) + '/' + scoreInt;

    var timeoutMs = ONLINE_LEADERBOARD_CONFIG.fetchTimeoutMs || 10000;

    _lastSubmitTime = now;

    return _fetchWithTimeout(url, { method: 'GET' }, timeoutMs)
        .then(function (response) {
            if (!response.ok) {
                console.error('submitOnlineScore: HTTP ' + response.status);
                return false;
            }
            return true;
        })
        .catch(function (err) {
            console.error('submitOnlineScore: network error', err);
            return false;
        });
}

/**
 * Fetch top scores from the online leaderboard.
 * @param {number} [limit=10] - Maximum number of scores to fetch (1–100)
 * @returns {Promise<Array<{name: string, score: number}>>} Array sorted by score descending, with HTML-safe names
 */
function fetchOnlineScores(limit) {
    // Validate and clamp the limit parameter
    var count = parseInt(limit, 10);
    if (isNaN(count) || count < 1) count = 10;
    if (count > 100) count = 100;

    var url = ONLINE_LEADERBOARD_CONFIG.baseUrl + '/' +
        encodeURIComponent(ONLINE_LEADERBOARD_CONFIG.publicKey) + '/json/' + count;

    var timeoutMs = ONLINE_LEADERBOARD_CONFIG.fetchTimeoutMs || 10000;

    return _fetchWithTimeout(url, { method: 'GET' }, timeoutMs)
        .then(function (response) {
            if (!response.ok) {
                console.error('fetchOnlineScores: HTTP ' + response.status);
                return [];
            }
            return response.json();
        })
        .then(function (data) {
            // dreamlo returns { dreamlo: { leaderboard: { entry: [...] } } }
            // Single entry comes as object, not array
            var entries = [];
            try {
                var raw = data.dreamlo.leaderboard.entry;
                if (!raw) return [];
                if (!Array.isArray(raw)) raw = [raw];
                for (var i = 0; i < raw.length; i++) {
                    entries.push({
                        name: _sanitizeLeaderboardString(raw[i].name),
                        score: parseInt(raw[i].score, 10) || 0
                    });
                }
            } catch (e) {
                console.error('fetchOnlineScores: parse error', e);
                return [];
            }
            // Sort descending by score (dreamlo should already do this, but ensure it)
            entries.sort(function (a, b) { return b.score - a.score; });
            return entries;
        })
        .catch(function (err) {
            console.error('fetchOnlineScores: network error', err);
            return [];
        });
}
