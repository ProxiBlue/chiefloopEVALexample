(function () {
    var REFRESH_COOLDOWN_MS = 10000;
    var AUTO_REFRESH_INTERVAL_MS = 60000;
    var _lastFetchTime = 0;
    var _hasLoadedOnce = false;

    /**
     * HTML-entity-encode special characters for defence-in-depth.
     * The page renders via textContent (not innerHTML), but we sanitize
     * anyway in case rendering changes in the future.
     */
    function sanitizeString(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    /**
     * Parse dreamlo JSON response into a sorted array of {name, score}.
     */
    function parseEntries(data) {
        var entries = [];
        try {
            var raw = data.dreamlo.leaderboard.entry;
            if (!raw) return [];
            if (!Array.isArray(raw)) raw = [raw];
            for (var i = 0; i < raw.length; i++) {
                entries.push({
                    name: sanitizeString(raw[i].name),
                    score: parseInt(raw[i].score, 10) || 0
                });
            }
        } catch (e) {
            return [];
        }
        entries.sort(function (a, b) { return b.score - a.score; });
        return entries;
    }

    /**
     * Build the dreamlo JSON API URL for the given score count.
     */
    function buildApiUrl(count) {
        // Read scores via the Worker proxy (it fetches dreamlo over HTTP
        // server-side, bypassing the browser mixed-content rule that
        // blocks HTTPS pages from talking to dreamlo's HTTP-only free tier).
        return ONLINE_LEADERBOARD_CONFIG.submitProxyUrl + '/scores?count=' + count;
    }

    /**
     * Fetch scores via the Fetch API.
     * Works when the server sends Access-Control-Allow-Origin: *
     * (which dreamlo does, since it is designed for cross-origin game clients)
     * including from file:// (null) origins.
     */
    function fetchViaFetchAPI(url, timeoutMs) {
        var opts = { method: 'GET' };

        if (typeof AbortController !== 'undefined') {
            var controller = new AbortController();
            opts.signal = controller.signal;
            var timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);

            return fetch(url, opts).then(function (response) {
                clearTimeout(timeoutId);
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            }).catch(function (err) {
                clearTimeout(timeoutId);
                throw err;
            });
        }

        return fetch(url, opts).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        });
    }

    /**
     * JSONP fallback: loads scores by injecting a <script> tag with a
     * ?callback= parameter. This bypasses CORS entirely since script
     * tags are not subject to same-origin policy. Only used as a
     * fallback if fetch() is blocked by CORS (e.g. on some browsers
     * when opened via file:// protocol).
     */
    function fetchViaJSONP(url, timeoutMs) {
        return new Promise(function (resolve, reject) {
            var cbName = '_dlcb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
            var script = document.createElement('script');
            var timer;

            function cleanup() {
                clearTimeout(timer);
                delete window[cbName];
                if (script.parentNode) script.parentNode.removeChild(script);
            }

            window[cbName] = function (data) {
                cleanup();
                resolve(data);
            };

            script.onerror = function () {
                cleanup();
                reject(new Error('JSONP failed'));
            };

            timer = setTimeout(function () {
                cleanup();
                reject(new Error('JSONP timeout'));
            }, timeoutMs);

            script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cbName;
            document.head.appendChild(script);
        });
    }

    /**
     * Fetch scores with automatic CORS fallback.
     * 1. Primary: fetch() — works on HTTP/HTTPS origins and on file:// when
     *    the server sends Access-Control-Allow-Origin: * (dreamlo does this).
     * 2. Fallback: JSONP via <script> injection — bypasses CORS entirely,
     *    works if the API supports ?callback= (JSONP convention).
     */
    function fetchScores(count) {
        var url = buildApiUrl(count);
        var timeoutMs = ONLINE_LEADERBOARD_CONFIG.fetchTimeoutMs || 10000;

        return fetchViaFetchAPI(url, timeoutMs)
            .then(parseEntries)
            .catch(function () {
                return fetchViaJSONP(url, timeoutMs).then(parseEntries);
            });
    }

    /**
     * Update the "Last updated" timestamp display.
     */
    function updateTimestamp() {
        var el = document.getElementById('lastUpdated');
        var now = new Date();
        var hours = now.getHours();
        var minutes = now.getMinutes();
        var seconds = now.getSeconds();
        var timeStr = (hours < 10 ? '0' : '') + hours + ':' +
                      (minutes < 10 ? '0' : '') + minutes + ':' +
                      (seconds < 10 ? '0' : '') + seconds;
        el.textContent = 'Last updated: ' + timeStr;
    }

    /**
     * Render scores into the table body.
     * Updates rows in place to avoid flicker on auto-refresh.
     */
    function renderScores(scores, bodyEl) {
        var existingRows = bodyEl.children;
        var i;

        for (i = 0; i < scores.length; i++) {
            var tr;
            if (i < existingRows.length) {
                tr = existingRows[i];
                tr.children[0].textContent = i + 1;
                tr.children[1].textContent = scores[i].name;
                tr.children[2].textContent = scores[i].score.toLocaleString();
            } else {
                tr = document.createElement('tr');

                var rankTd = document.createElement('td');
                rankTd.textContent = i + 1;
                tr.appendChild(rankTd);

                var nameTd = document.createElement('td');
                nameTd.textContent = scores[i].name;
                tr.appendChild(nameTd);

                var scoreTd = document.createElement('td');
                scoreTd.textContent = scores[i].score.toLocaleString();
                tr.appendChild(scoreTd);

                bodyEl.appendChild(tr);
            }
        }

        while (bodyEl.children.length > scores.length) {
            bodyEl.removeChild(bodyEl.lastChild);
        }
    }

    function loadScores() {
        var now = Date.now();
        var statusEl = document.getElementById('status');
        var tableEl = document.getElementById('leaderboardTable');
        var bodyEl = document.getElementById('leaderboardBody');
        var btnEl = document.getElementById('refreshBtn');

        if (now - _lastFetchTime < REFRESH_COOLDOWN_MS) {
            return;
        }

        btnEl.disabled = true;
        _lastFetchTime = now;

        if (!_hasLoadedOnce) {
            statusEl.className = 'loading';
            statusEl.textContent = 'Loading scores...';
            tableEl.classList.remove('visible');
        }

        fetchScores(50).then(function (scores) {
            enableRefreshAfterCooldown(btnEl);
            if (!scores || scores.length === 0) {
                statusEl.className = '';
                statusEl.textContent = 'No scores yet. Be the first to play!';
                tableEl.classList.remove('visible');
                updateTimestamp();
                _hasLoadedOnce = true;
                return;
            }

            statusEl.textContent = '';
            statusEl.className = '';
            renderScores(scores, bodyEl);
            tableEl.classList.add('visible');
            updateTimestamp();
            _hasLoadedOnce = true;
        }).catch(function () {
            enableRefreshAfterCooldown(btnEl);
            statusEl.className = 'error';
            statusEl.textContent = 'Could not load scores. Try again later.';
        });
    }

    function enableRefreshAfterCooldown(btnEl) {
        var elapsed = Date.now() - _lastFetchTime;
        var remaining = Math.max(0, REFRESH_COOLDOWN_MS - elapsed);
        setTimeout(function () {
            btnEl.disabled = false;
        }, remaining);
    }

    document.getElementById('refreshBtn').addEventListener('click', loadScores);

    loadScores();

    setInterval(loadScores, AUTO_REFRESH_INTERVAL_MS);
})();
