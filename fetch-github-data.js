#!/usr/bin/env node

/**
 * GitHub Data Fetcher Script
 *
 * Fetches commit and PR data from a GitHub repository and saves it as JSON.
 *
 * Usage:
 *   node fetch-github-data.js <owner/repo> [--commits=200] [--prs=50]
 *
 * Examples:
 *   node fetch-github-data.js mage-os/mageos-magento2
 *   node fetch-github-data.js mage-os/mageos-magento2 --commits=100 --prs=25
 *
 * Environment Variables:
 *   GITHUB_TOKEN - Optional GitHub personal access token for higher rate limits.
 *                  Without a token: 60 requests/hour. With a token: 5,000 requests/hour.
 *
 * Output:
 *   Saves JSON to data/<repo-name>.json (e.g., data/mageos-magento2.json)
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_API = "api.github.com";
const DEFAULT_COMMITS = 200;
const DEFAULT_PRS = 50;
const MAX_PER_PAGE = 100;
const RATE_LIMIT_RETRY_DELAY_MS = 60_000;
const MAX_RATE_LIMIT_RETRIES = 3;

function parseArgs(argv) {
  const args = argv.slice(2);
  let repo = null;
  let commitCount = DEFAULT_COMMITS;
  let prCount = DEFAULT_PRS;

  for (const arg of args) {
    if (arg.startsWith("--commits=")) {
      commitCount = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--prs=")) {
      prCount = parseInt(arg.split("=")[1], 10);
    } else if (!arg.startsWith("--") && arg.includes("/")) {
      repo = arg;
    }
  }

  if (!repo) {
    console.error(
      "Usage: node fetch-github-data.js <owner/repo> [--commits=200] [--prs=50]"
    );
    console.error("Example: node fetch-github-data.js mage-os/mageos-magento2");
    process.exit(1);
  }

  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    console.error("Error: Repository must be in 'owner/repo' format.");
    process.exit(1);
  }

  return { owner, name, repo, commitCount, prCount };
}

function githubRequest(urlPath, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": "fetch-github-data-script",
      Accept: "application/vnd.github.v3+json",
    };
    if (token) {
      headers["Authorization"] = `token ${token}`;
    }

    const options = {
      hostname: GITHUB_API,
      path: urlPath,
      method: "GET",
      headers,
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on("error", reject);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRateLimit(urlPath, token) {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const response = await githubRequest(urlPath, token);

    if (response.statusCode === 200) {
      return JSON.parse(response.body);
    }

    if (response.statusCode === 403 || response.statusCode === 429) {
      const remaining = response.headers["x-ratelimit-remaining"];
      const resetTime = response.headers["x-ratelimit-reset"];

      if (remaining === "0" || response.statusCode === 429) {
        if (attempt >= MAX_RATE_LIMIT_RETRIES) {
          console.error(
            `Error: GitHub API rate limit exceeded after ${MAX_RATE_LIMIT_RETRIES} retries.`
          );
          console.error(
            "Set GITHUB_TOKEN environment variable for higher rate limits."
          );
          process.exit(1);
        }

        let waitMs = RATE_LIMIT_RETRY_DELAY_MS;
        if (resetTime) {
          const resetDate = new Date(parseInt(resetTime, 10) * 1000);
          waitMs = Math.max(resetDate - Date.now() + 1000, 1000);
        }

        const waitSec = Math.ceil(waitMs / 1000);
        console.log(
          `Rate limited. Waiting ${waitSec}s before retry (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})...`
        );
        await sleep(waitMs);
        continue;
      }
    }

    if (response.statusCode === 404) {
      console.error(`Error: Repository not found at ${urlPath}`);
      process.exit(1);
    }

    console.error(
      `Error: GitHub API returned status ${response.statusCode} for ${urlPath}`
    );
    console.error(response.body);
    process.exit(1);
  }
}

async function fetchPaginated(basePath, token, totalCount) {
  const results = [];
  const totalPages = Math.ceil(totalCount / MAX_PER_PAGE);

  for (let page = 1; page <= totalPages && results.length < totalCount; page++) {
    const perPage = Math.min(MAX_PER_PAGE, totalCount - results.length);
    const separator = basePath.includes("?") ? "&" : "?";
    const url = `${basePath}${separator}per_page=${perPage}&page=${page}`;

    console.log(`  Fetching page ${page}/${totalPages}...`);
    const data = await fetchWithRateLimit(url, token);

    if (!Array.isArray(data)) {
      console.error("Error: Unexpected API response format.");
      process.exit(1);
    }

    results.push(...data);

    if (data.length < perPage) {
      break;
    }
  }

  return results.slice(0, totalCount);
}

async function fetchCommitDetail(owner, name, sha, token) {
  const data = await fetchWithRateLimit(
    `/repos/${owner}/${name}/commits/${sha}`,
    token
  );
  return {
    additions: data.stats ? data.stats.additions : 0,
    deletions: data.stats ? data.stats.deletions : 0,
  };
}

async function fetchCommits(owner, name, token, count) {
  console.log(`Fetching ${count} commits from ${owner}/${name}...`);

  const rawCommits = await fetchPaginated(
    `/repos/${owner}/${name}/commits`,
    token,
    count
  );

  console.log(`  Fetching line stats for ${rawCommits.length} commits...`);
  const commits = [];
  for (let i = 0; i < rawCommits.length; i++) {
    const c = rawCommits[i];
    if ((i + 1) % 20 === 0 || i === rawCommits.length - 1) {
      console.log(`  Processing commit ${i + 1}/${rawCommits.length}...`);
    }

    const detail = await fetchCommitDetail(owner, name, c.sha, token);

    commits.push({
      hash: c.sha,
      date: c.commit.author.date,
      author: c.commit.author.name,
      message: c.commit.message,
      linesAdded: detail.additions,
      linesDeleted: detail.deletions,
    });
  }

  return commits;
}

async function fetchPRs(owner, name, token, count) {
  console.log(`Fetching ${count} merged PRs from ${owner}/${name}...`);

  const rawPRs = await fetchPaginated(
    `/repos/${owner}/${name}/pulls?state=closed&sort=updated&direction=desc`,
    token,
    count * 3 // fetch extra since not all closed PRs are merged
  );

  const mergedPRs = rawPRs.filter((pr) => pr.merged_at !== null);

  return mergedPRs.slice(0, count).map((pr) => ({
    number: pr.number,
    title: pr.title,
    description: pr.body || "",
    labels: pr.labels.map((l) => l.name),
    mergeCommitHash: pr.merge_commit_sha,
    mergedDate: pr.merged_at,
  }));
}

async function main() {
  const { owner, name, repo, commitCount, prCount } = parseArgs(process.argv);
  const token = process.env.GITHUB_TOKEN || null;

  if (token) {
    console.log("Using GitHub token for authentication.");
  } else {
    console.log(
      "No GITHUB_TOKEN set. Using unauthenticated requests (60 requests/hour limit)."
    );
    console.log(
      "Tip: Set GITHUB_TOKEN environment variable for 5,000 requests/hour."
    );
  }

  const commits = await fetchCommits(owner, name, token, commitCount);
  const prs = await fetchPRs(owner, name, token, prCount);

  const output = {
    repository: repo,
    fetchedAt: new Date().toISOString(),
    commits,
    pullRequests: prs,
  };

  const dataDir = path.join(__dirname, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outputFile = path.join(dataDir, `${name}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

  // Update repos.json manifest
  const manifestFile = path.join(dataDir, "repos.json");
  let manifest = [];
  if (fs.existsSync(manifestFile)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
    } catch (e) {
      manifest = [];
    }
  }
  const entry = { file: `${name}.json`, name: repo };
  const existingIdx = manifest.findIndex((m) => m.file === entry.file);
  if (existingIdx >= 0) {
    manifest[existingIdx] = entry;
  } else {
    manifest.push(entry);
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`\nDone! Saved ${commits.length} commits and ${prs.length} PRs to ${outputFile}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
