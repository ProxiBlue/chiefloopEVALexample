// --- Online Leaderboard Utility ---
// Requires: js/onlineConfig.js (loaded before this file)

/**
 * Submit a score to the online leaderboard.
 * @param {string} playerName - Player name (max 20 characters)
 * @param {number} playerScore - Score (integer)
 * @returns {Promise<boolean>} true if submission succeeded, false otherwise
 */
function submitOnlineScore(playerName, playerScore) {
    // Sanitize player name: truncate to 20 chars, remove pipe characters (dreamlo delimiter)
    var name = String(playerName).replace(/\|/g, '').substring(0, 20);
    var scoreInt = Math.floor(Number(playerScore)) || 0;

    if (!name || scoreInt <= 0) {
        console.warn('submitOnlineScore: invalid name or score');
        return Promise.resolve(false);
    }

    var url = ONLINE_LEADERBOARD_CONFIG.baseUrl + '/' +
        encodeURIComponent(ONLINE_LEADERBOARD_CONFIG.privateKey) + '/add/' +
        encodeURIComponent(name) + '/' + scoreInt;

    return fetch(url, { method: 'GET' })
        .then(function(response) {
            if (!response.ok) {
                console.error('submitOnlineScore: HTTP ' + response.status);
                return false;
            }
            return true;
        })
        .catch(function(err) {
            console.error('submitOnlineScore: network error', err);
            return false;
        });
}

/**
 * Fetch top scores from the online leaderboard.
 * @param {number} [limit=10] - Maximum number of scores to fetch
 * @returns {Promise<Array<{name: string, score: number}>>} Array sorted by score descending
 */
function fetchOnlineScores(limit) {
    var count = limit || 10;
    var url = ONLINE_LEADERBOARD_CONFIG.baseUrl + '/' +
        encodeURIComponent(ONLINE_LEADERBOARD_CONFIG.publicKey) + '/json/' + count;

    return fetch(url, { method: 'GET' })
        .then(function(response) {
            if (!response.ok) {
                console.error('fetchOnlineScores: HTTP ' + response.status);
                return [];
            }
            return response.json();
        })
        .then(function(data) {
            // dreamlo returns { dreamlo: { leaderboard: { entry: [...] } } }
            // Single entry comes as object, not array
            var entries = [];
            try {
                var raw = data.dreamlo.leaderboard.entry;
                if (!raw) return [];
                if (!Array.isArray(raw)) raw = [raw];
                for (var i = 0; i < raw.length; i++) {
                    entries.push({
                        name: String(raw[i].name),
                        score: parseInt(raw[i].score, 10) || 0
                    });
                }
            } catch (e) {
                console.error('fetchOnlineScores: parse error', e);
                return [];
            }
            // Sort descending by score (dreamlo should already do this, but ensure it)
            entries.sort(function(a, b) { return b.score - a.score; });
            return entries;
        })
        .catch(function(err) {
            console.error('fetchOnlineScores: network error', err);
            return [];
        });
}
