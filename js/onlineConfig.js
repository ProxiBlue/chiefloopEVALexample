// --- Online Leaderboard Configuration ---
// Service: dreamlo (https://dreamlo.com) — free tier
// Update these values with your own dreamlo board keys.
// To get keys: visit https://dreamlo.com and create a free leaderboard.
//
// SECURITY NOTE: dreamlo's free tier is designed for client-side use. The
// private key is intentionally kept separate from the public key so it can
// be rotated independently if the board is abused. For production use,
// proxy score submissions through a server-side endpoint with proper auth.
var ONLINE_LEADERBOARD_CONFIG = {
    // dreamlo public key (used for reading scores — safe to expose)
    publicKey: 'your-public-key-here',
    // Base URL for the dreamlo API
    baseUrl: 'https://www.dreamlo.com/lb',
    // Maximum allowed score value (reject anything above this as invalid)
    maxScore: 1000000,
    // Minimum seconds between score submissions (client-side rate limit)
    submitCooldownSeconds: 10,
    // Fetch timeout in milliseconds
    fetchTimeoutMs: 10000
};

// dreamlo private key — split from config so it can be rotated separately.
// In production, move score submission to a server-side proxy to avoid
// exposing this key to the browser.
var ONLINE_LEADERBOARD_PRIVATE_KEY = 'your-private-key-here';
