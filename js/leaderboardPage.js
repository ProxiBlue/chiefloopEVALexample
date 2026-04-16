(function () {
    var REFRESH_COOLDOWN_MS = 10000;
    var _lastFetchTime = 0;

    function loadScores() {
        var now = Date.now();
        var statusEl = document.getElementById('status');
        var tableEl = document.getElementById('leaderboardTable');
        var bodyEl = document.getElementById('leaderboardBody');
        var btnEl = document.getElementById('refreshBtn');

        if (now - _lastFetchTime < REFRESH_COOLDOWN_MS) {
            return;
        }

        statusEl.className = 'loading';
        statusEl.textContent = 'Loading scores...';
        tableEl.classList.remove('visible');
        btnEl.disabled = true;
        _lastFetchTime = now;

        fetchOnlineScores(50).then(function (scores) {
            enableRefreshAfterCooldown(btnEl);
            if (!scores || scores.length === 0) {
                statusEl.className = '';
                statusEl.textContent = 'No scores yet. Be the first to play!';
                return;
            }

            statusEl.textContent = '';
            statusEl.className = '';
            while (bodyEl.firstChild) {
                bodyEl.removeChild(bodyEl.firstChild);
            }

            for (var i = 0; i < scores.length; i++) {
                var tr = document.createElement('tr');

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

            tableEl.classList.add('visible');
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
})();
