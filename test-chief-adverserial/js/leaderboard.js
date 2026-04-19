// --- Leaderboard ---
var LEADERBOARD_KEY = 'mageLanderLeaderboard';
var LEADERBOARD_MAX = 10;

function getLeaderboard() {
    try {
        var data = localStorage.getItem(LEADERBOARD_KEY);
        if (data) {
            var parsed = JSON.parse(data);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {}
    return [];
}

function saveLeaderboard(board) {
    try {
        localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(board));
    } catch (e) {}
}

function isHighScore(s) {
    if (s <= 0) return false;
    var board = getLeaderboard();
    if (board.length < LEADERBOARD_MAX) return true;
    return s > board[board.length - 1].score;
}

function addToLeaderboard(name, s, lvl, lands) {
    var board = getLeaderboard();
    board.push({ name: name, score: s, level: lvl, landings: lands });
    board.sort(function(a, b) { return b.score - a.score; });
    if (board.length > LEADERBOARD_MAX) {
        board = board.slice(0, LEADERBOARD_MAX);
    }
    saveLeaderboard(board);
    return board;
}

function drawLeaderboard(cx, startY, highlight) {
    var board = getLeaderboard();
    if (board.length === 0) return startY;

    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('--- HIGH SCORES ---', cx, startY);

    var y = startY + 24;
    ctx.font = '14px monospace';
    for (var i = 0; i < board.length; i++) {
        var entry = board[i];
        var rank = (i + 1) + '.';
        var padding = i < 9 ? '  ' : ' ';
        var line = rank + padding + entry.name;
        // Pad name to align scores
        while (line.length < 18) line += ' ';
        line += entry.score;
        // Append level and landings stats if available
        if (entry.level != null) line += '  Lvl ' + entry.level;
        if (entry.landings != null) line += '  L:' + entry.landings;

        if (highlight && entry.score === score && entry.name === highlight) {
            ctx.fillStyle = '#FFD700';
            highlight = null; // only highlight first match
        } else {
            ctx.fillStyle = '#aaa';
        }
        ctx.fillText(line, cx, y);
        y += 20;
    }
    return y;
}

// Backward compat: migrate old single high score to leaderboard
function migrateOldHighScore() {
    try {
        var old = localStorage.getItem('mageLanderHighScore');
        if (old) {
            var val = parseInt(old, 10);
            if (val > 0) {
                var board = getLeaderboard();
                if (board.length === 0) {
                    addToLeaderboard('???', val);
                }
            }
            localStorage.removeItem('mageLanderHighScore');
        }
    } catch (e) {}
}

// Run migration on load
migrateOldHighScore();

// --- Game Over State ---
var gameOverEnteringName = false;
var gameOverName = '';
var gameOverLevel = 0;
