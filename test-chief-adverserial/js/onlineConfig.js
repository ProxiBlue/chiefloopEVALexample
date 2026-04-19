// --- Online Leaderboard Configuration ---
// Service: dreamlo (https://dreamlo.com) — free tier
// Update these values with your own dreamlo board keys.
// To get keys: visit https://dreamlo.com and create a free leaderboard.
//
// ARCHITECTURE: Score submissions are sent to a server-side proxy (e.g. a
// Cloudflare Worker) that holds the dreamlo private key. The private key
// is NEVER included in client-side code. The proxy performs server-side
// validation (rate limiting, score bounds, name sanitization) before
// forwarding to dreamlo. See server/leaderboard-proxy.js for the proxy
// implementation.
var ONLINE_LEADERBOARD_CONFIG = {
    // dreamlo public key (used for reading scores — safe to expose)
    publicKey: 'your-public-key-here',
    // Base URL for the dreamlo API (read-only operations)
    baseUrl: 'https://www.dreamlo.com/lb',
    // URL of the server-side score submission proxy.
    // Deploy server/leaderboard-proxy.js as a Cloudflare Worker and set
    // this to your worker URL (e.g. https://leaderboard-proxy.yourname.workers.dev)
    submitProxyUrl: 'https://leaderboard-proxy.example.workers.dev',
    // Maximum plausible score — based on game mechanics: points per landing
    // pad × maximum conceivable levels. Adjust this as game balance changes.
    // Enforced both client-side (prevents submission) and server-side (rejects).
    maxPlausibleScore: 100000,
    // Minimum seconds between score submissions (client-side UX throttle;
    // provides per-submission cooldown in addition to the sliding-window
    // rate limit in onlineLeaderboard.js). Must be >= 1; values < 1 are
    // treated as 10 by onlineLeaderboard.js.
    submitCooldownSeconds: 10,
    // Fetch timeout in milliseconds
    fetchTimeoutMs: 10000
};

// --- Config bounds enforcement ---
// Ensure submitCooldownSeconds cannot be zero, negative, or non-numeric.
// This runs at load time so that even if the value above is edited to an
// invalid number, the runtime config is always safe.
(function () {
    var c = ONLINE_LEADERBOARD_CONFIG;
    var raw = Number(c.submitCooldownSeconds);
    if (isNaN(raw) || raw < 1) {
        c.submitCooldownSeconds = 10;
    }
})();
