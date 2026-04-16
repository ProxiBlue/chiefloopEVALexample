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
    // Maximum allowed score value (enforced server-side; client uses as UX hint)
    maxScore: 1000000,
    // Fetch timeout in milliseconds
    fetchTimeoutMs: 10000
};
