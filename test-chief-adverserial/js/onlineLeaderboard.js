// --- Online Leaderboard Utility ---
// Requires: js/onlineConfig.js (loaded before this file)

// --- Rate limit constants (easy to tune) ---
var RATE_LIMIT_MAX_SUBMISSIONS = 3;       // max submissions allowed per window
var RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // sliding window duration in ms (5 minutes)

// --- IIFE: private state is closure-scoped, not accessible from DevTools console ---
(function () {
    var _submitTimestamps = []; // timestamps of recent submissions (for sliding-window rate limiting)
    var _lastSubmitTime = 0;    // timestamp of most recent submission (for per-submission cooldown)
    var _gameSessionToken = null; // one-time-use token from server

    /**
     * Sanitize a string for safe DOM insertion — HTML-entity-encodes special
     * characters so leaderboard names cannot carry XSS payloads.
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
     * Request a one-time-use game session token from the server-side proxy.
     * Must be called when a new game starts. The token is stored internally
     * and consumed by submitOnlineScore(). Each token can only be used for
     * one score submission, preventing console-based score injection without
     * having started a game through the normal UI flow.
     *
     * This is fire-and-forget — if the request fails, the game continues
     * normally; the score simply won't be submitted to the online leaderboard.
     *
     * @returns {Promise<boolean>} true if a token was obtained, false otherwise
     */
    window.requestGameSession = function requestGameSession() {
        _gameSessionToken = null; // clear any prior token

        var proxyUrl = ONLINE_LEADERBOARD_CONFIG.submitProxyUrl;
        if (!proxyUrl) {
            return Promise.resolve(false);
        }

        var timeoutMs = ONLINE_LEADERBOARD_CONFIG.fetchTimeoutMs || 10000;

        return _fetchWithTimeout(proxyUrl + '/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        }, timeoutMs)
            .then(function (response) {
                if (!response.ok) {
                    console.warn('requestGameSession: HTTP ' + response.status);
                    return false;
                }
                return response.json();
            })
            .then(function (data) {
                if (data && data.token) {
                    _gameSessionToken = data.token;
                    return true;
                }
                return false;
            })
            .catch(function (err) {
                console.warn('requestGameSession: network error', err);
                return false;
            });
    };

    /**
     * Submit a score to the online leaderboard via the server-side proxy.
     * Requires a valid game session token obtained via requestGameSession().
     *
     * The proxy holds the dreamlo private key and performs server-side
     * validation: session token verification (one-time-use, IP-bound),
     * per-IP rate limiting, score bounds, and name sanitization.
     * Client-side checks here are UX guardrails only.
     *
     * @param {string} playerName - Player name (max 20 characters)
     * @param {number} playerScore - Score (positive integer)
     * @returns {Promise<boolean>} true if submission succeeded, false otherwise
     */
    window.submitOnlineScore = function submitOnlineScore(playerName, playerScore, playerLevel, playerLandings) {
        // --- Require a valid session token (proves a game was started normally) ---
        if (!_gameSessionToken) {
            console.warn('submitOnlineScore: no game session token — score not submitted');
            return Promise.resolve(false);
        }

        // --- Client-side per-submission cooldown (UX throttle; server also enforces per-IP limits) ---
        var now = Date.now();
        var rawCooldown = Number(ONLINE_LEADERBOARD_CONFIG.submitCooldownSeconds);
        var cooldownMs = (isNaN(rawCooldown) || rawCooldown < 1 ? 10 : rawCooldown) * 1000;
        if (now - _lastSubmitTime < cooldownMs) {
            console.warn('submitOnlineScore: cooldown active — submission silently skipped');
            return Promise.resolve(false);
        }

        // --- Client-side sliding-window rate limit (server also enforces per-IP rate limits) ---
        // Remove timestamps outside the current window
        _submitTimestamps = _submitTimestamps.filter(function (ts) {
            return now - ts < RATE_LIMIT_WINDOW_MS;
        });
        if (_submitTimestamps.length >= RATE_LIMIT_MAX_SUBMISSIONS) {
            console.warn('submitOnlineScore: rate limit exceeded — submission silently skipped');
            return Promise.resolve(false);
        }

        // --- Client-side input pre-validation (UX only; server re-validates) ---
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
        var maxPlausibleScore = ONLINE_LEADERBOARD_CONFIG.maxPlausibleScore || 100000;
        if (scoreInt > maxPlausibleScore) {
            console.warn('submitOnlineScore: score exceeds plausible maximum (' + maxPlausibleScore + ')');
            return Promise.resolve(false);
        }

        var proxyUrl = ONLINE_LEADERBOARD_CONFIG.submitProxyUrl;
        if (!proxyUrl) {
            console.error('submitOnlineScore: submitProxyUrl is not configured');
            return Promise.resolve(false);
        }

        var timeoutMs = ONLINE_LEADERBOARD_CONFIG.fetchTimeoutMs || 10000;

        // --- All guards passed: consume the token and record the submission ---
        var token = _gameSessionToken;
        _gameSessionToken = null; // consume the token (one-time-use) — only after all guards pass
        _lastSubmitTime = now;
        _submitTimestamps.push(now);

        return _fetchWithTimeout(proxyUrl + '/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, score: scoreInt, level: playerLevel || 0, landings: playerLandings || 0, token: token })
        }, timeoutMs)
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
    };

    /**
     * Fetch top scores from the online leaderboard.
     * Uses the public key directly against dreamlo (read-only, safe to expose).
     * @param {number} [limit=10] - Maximum number of scores to fetch (1–100)
     * @returns {Promise<Array<{name: string, score: number}>>} Array sorted by score descending, with HTML-safe names
     */
    window.fetchOnlineScores = function fetchOnlineScores(limit) {
        var count = parseInt(limit, 10);
        if (isNaN(count) || count < 1) count = 10;
        if (count > 100) count = 100;

        // Reads go through the Worker proxy (which fetches dreamlo over HTTP
        // server-side) so the browser does not hit a mixed-content block when
        // the game is served over HTTPS. baseUrl + publicKey are kept in
        // config in case a future direct-read path is needed.
        var url = ONLINE_LEADERBOARD_CONFIG.submitProxyUrl + '/scores?count=' + count;

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
                entries.sort(function (a, b) { return b.score - a.score; });
                return entries;
            })
            .catch(function (err) {
                console.error('fetchOnlineScores: network error', err);
                return [];
            });
    };
})();
