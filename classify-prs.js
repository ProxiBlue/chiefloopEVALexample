#!/usr/bin/env node

/**
 * PR Type Classification Script
 *
 * Classifies each PR in a fetched GitHub data JSON file by type:
 *   - "security"  — security fix or vulnerability patch
 *   - "feature"   — new feature or enhancement
 *   - "bugfix"    — bug fix
 *   - "other"     — anything that doesn't match the above
 *
 * Classification priority:
 *   1. Label matching  — checks PR labels (case-insensitive)
 *   2. Title keywords  — checks PR title (case-insensitive)
 *   3. Default         — "other"
 *
 * ──────────────────────────────────────────────────
 * Label patterns (matched case-insensitively against each label):
 *
 *   security: "security", "cve", "vulnerability"
 *   bugfix:   "bug", "fix", "bugfix", "hotfix", "patch"
 *   feature:  "feature", "enhancement", "feat"
 *
 * Title keyword patterns (matched case-insensitively):
 *
 *   security: "security", "cve", "vulnerability", "vuln"
 *   bugfix:   "fix", "bugfix", "hotfix", "bug"
 *   feature:  "feat", "feature", "enhancement", "add ", "added ", "adds ", "new "
 *   other:    "refactor", "chore", "cleanup", "deprecat", "remove", "delete",
 *             "drop", "upgrade", "update dep", "bump"
 * ──────────────────────────────────────────────────
 *
 * Usage:
 *   node classify-prs.js <path-to-data.json>
 *
 * Example:
 *   node classify-prs.js data/mageos-magento2.json
 *
 * The file is updated in-place with a `type` field added to each PR.
 */

const fs = require("fs");
const path = require("path");

// ── Classification rules ────────────────────────────

const LABEL_RULES = [
  { type: "security", patterns: ["security", "cve", "vulnerability"] },
  { type: "bugfix", patterns: ["bug", "fix", "bugfix", "hotfix", "patch"] },
  { type: "feature", patterns: ["feature", "enhancement", "feat"] },
];

const TITLE_RULES = [
  { type: "security", patterns: ["security", "cve", "vulnerability", "vuln", "merge conflict"] },
  { type: "bugfix", patterns: ["fix", "bugfix", "hotfix", "bug"] },
  {
    type: "feature",
    patterns: [
      "feat", "feature", "enhancement", "add ", "added ", "adds ", "new ",
      "migrate", "expand", "generalize", "integrate", "implement", "support",
      "introduce", "enable", "allow", "extend",
    ],
  },
  {
    type: "other",
    patterns: [
      "refactor",
      "chore",
      "cleanup",
      "deprecat",
      "remove",
      "delete",
      "drop",
      "upgrade",
      "update dep",
      "bump",
    ],
  },
];

// Description-based rules — checked after title, before default.
// Catches PRs with generic titles but descriptive bodies.
const DESCRIPTION_RULES = [
  { type: "security", patterns: ["rce", "payload", "attacker", "exploit", "injection", "xss", "csrf", "vulnerability", "cve-"] },
  { type: "feature", patterns: ["migrate", "integration", "new api", "new endpoint", "implements", "adds support"] },
  { type: "bugfix", patterns: ["fixes #", "resolves #", "crash when", "error when", "broken", "regression"] },
];

// ── Classification functions ────────────────────────

/**
 * Classify a PR by checking its labels against known patterns.
 * Returns the type string or null if no match.
 */
function classifyByLabels(labels) {
  const lowerLabels = labels.map((l) => l.toLowerCase());
  for (const rule of LABEL_RULES) {
    for (const label of lowerLabels) {
      if (rule.patterns.some((p) => label.includes(p))) {
        return rule.type;
      }
    }
  }
  return null;
}

/**
 * Classify a PR by checking its title against known keyword patterns.
 * Returns the type string or null if no match.
 */
function classifyByTitle(title) {
  const lowerTitle = title.toLowerCase();
  for (const rule of TITLE_RULES) {
    if (rule.patterns.some((p) => lowerTitle.includes(p))) {
      return rule.type;
    }
  }
  return null;
}

/**
 * Classify a PR by checking its description against known patterns.
 * Returns the type string or null if no match.
 */
function classifyByDescription(description) {
  if (!description) return null;
  const lowerDesc = description.toLowerCase();
  for (const rule of DESCRIPTION_RULES) {
    if (rule.patterns.some((p) => lowerDesc.includes(p))) {
      return rule.type;
    }
  }
  return null;
}

/**
 * Classify a single PR object. Tries labels first, then title, then description, then defaults to "other".
 */
function classifyPR(pr) {
  return classifyByLabels(pr.labels || []) || classifyByTitle(pr.title || "") || classifyByDescription(pr.description || "") || "other";
}

// ── Main ────────────────────────────────────────────

function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error("Usage: node classify-prs.js <path-to-data.json>");
    console.error("Example: node classify-prs.js data/mageos-magento2.json");
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));

  if (!data.pullRequests || !Array.isArray(data.pullRequests)) {
    console.error("Error: JSON file does not contain a pullRequests array.");
    process.exit(1);
  }

  const counts = { security: 0, feature: 0, bugfix: 0, other: 0 };

  for (const pr of data.pullRequests) {
    pr.type = classifyPR(pr);
    counts[pr.type]++;
  }

  fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2));

  console.log(`Classified ${data.pullRequests.length} PRs in ${filePath}:`);
  console.log(`  security: ${counts.security}`);
  console.log(`  feature:  ${counts.feature}`);
  console.log(`  bugfix:   ${counts.bugfix}`);
  console.log(`  other:    ${counts.other}`);
}

main();
