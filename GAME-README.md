# Mage Lander — Game Guide

A fan-made arcade game compilation by [ProxiBlue](https://github.com/ProxiBlue), built around real GitHub repository data from [Mage-OS](https://github.com/mage-os).

## Why This Game Exists

This game was built as a real-world test case for [Chief](https://github.com/MiniCodeMonkey/chief) — an autonomous PRD agent that runs Claude Code in a loop to build software from product requirements.

I'm enhancing Chief with an **adversarial evaluation system** in my [fork](https://github.com/ProxiBlue/chief) (main branch). In the standard Chief loop, a single agent builds code and checks its own work. My fork adds independent adversarial evaluator agents and a dedicated security evaluator (OWASP Top 10) that review every completed story before it's allowed to pass. If the evaluators find missing features, broken acceptance criteria, or security issues, the story is failed and retried automatically.

This game is the proving ground — a complex, multi-system project designed to stress-test the adversarial evaluation loop and surface implementation bugs. Every mini-game, every feature, every PR-data integration was built by the Chief agent loop and validated by adversarial reviewers. The [chiefloopEVALexample](https://github.com/ProxiBlue/chiefloopEVALexample) repository contains side-by-side output comparing standard (no eval) vs adversarial (with eval) builds of the same game.

## How Repository Data Drives Gameplay

The game uses real pull request and commit data from a GitHub repository, pre-fetched and cached to a local JSON data file (not fetched in real-time). This data shapes every aspect of the gameplay experience:

### Landing Pads = Pull Requests

Each landing pad on the terrain represents a real merged pull request. The PR's classification determines:

| PR Type | Pad Colour | Points | Width | Mini-Game |
|---------|-----------|--------|-------|-----------|
| **Security** | Red `#DC143C` | 200 (3x) | Narrow (hardest) | Missile Command / Space Invaders |
| **Bug Fix** | Yellow `#FFB300` | 100 (2x) | Medium | Bug Bombing Run |
| **Feature** | Cyan `#00BCD4` | 50 (1x) | Wide (easiest) | Feature Drive |
| **Chore** | Purple `#AB47BC` | 75 (1x) | Medium | Code Breaker |
| **Other** | Grey `#9E9E9E` | 100 (1x) | Medium | Tech Debt Blaster |

- **Harder pads (narrower) = more points** — security fixes are the riskiest changes, so landing on them is hardest but most rewarding
- **5 PRs per level** — each level batch pulls the next 5 merged PRs chronologically, so you're literally playing through the repo's history
- **PR metadata on pads** — each pad shows the PR number, author, title, and merge date

### PR Classification

PRs are classified by scanning labels, titles, and descriptions:

- **Security**: "CVE", "vulnerability", "RCE", "attacker", "merge conflict"
- **Bug Fix**: "fix", "hotfix", "bug", "patch"
- **Feature**: "feat", "add", "migrate", "integrate", "implement", "support"
- **Chore**: "chore", "cleanup", "readme", "bump", "upgrade"
- **Other**: "refactor", "rebase", "upstream", "release"

Run `node classify-prs.js data/<repo>.json` to see or adjust the classification.

### Terrain Generation

Commit data influences the terrain:
- **Commit frequency** determines terrain complexity
- **Date ranges** shown in the HUD indicate which time period of the repo you're flying over
- **Level progression** moves chronologically through the repo's merge history

### Mini-Game Details

#### Missile Command (Security Pads — Red)
*"Defend your codebase from incoming merge conflicts"*

Incoming missiles labeled with conflict markers (`<<<<<<< HEAD`, `=======`, `force push`) rain down toward buildings labeled with filenames from the PR. Fire interceptor missiles from defense batteries to protect your codebase.

- Buildings use filenames extracted from the PR title and commit messages
- Missile labels include the PR's branch name and commit hashes when available

#### Space Invaders (Security Pads — Red, alternating)
*"Defend against security threats"*

Alien waves scroll in from the right. Shoot them for bonus points. Ship-alien contact ends the mini-game (no life lost). Ship uses thruster-based physics with retro thrusters for braking.

#### Bug Bombing Run (Bug Fix Pads — Yellow)
*"Squash the bugs"*

Fly over terrain and drop bombs on scuttling bugs. Normal lander physics apply — gravity, thrust, fuel. Kill bugs to earn points and restore fuel (with extension tank overflow).

#### Feature Drive (Feature Pads — Cyan)
*"Deploy the feature"*

The M ship sprouts wheels and drives across side-scrolling terrain to reach a destination pad. Jump over gaps, dodge rocks, collect review approvals (`LGTM`, `approved`). Road length scales with PR size.

#### Tech Debt Blaster (Other Pads — Grey)
*"Clear the tech debt"*

Classic Asteroids gameplay. Large asteroids labeled with tech debt (`@deprecated`, `TODO`, `eval()`) split into smaller, faster pieces. Some contain hidden aliens that escape and shoot at you. ProxiBlue power-up asteroids grant a protective shield.

#### Code Breaker (Chore Pads — Purple)
*"Systematically clear the backlog"*

Breakout/Arkanoid gameplay. The M ship becomes the paddle, bouncing a ball into bricks labeled with code smells. Power-ups drop from broken bricks: wide paddle, multi-ball, fireball, shooting ability, extra ball.

### Scoring

- **Landing precision** — slower approach + more fuel remaining = higher score
- **Pad type multiplier** — security (3x), bugfix (2x), feature/chore/other (1x)
- **Mini-game bonuses** — points earned during mini-games add to total score
- **Fuel bonus** — remaining fuel percentage adds to landing score

### Difficulty Scaling

Each level increases:
- **Gravity** — starts at 1.6 m/s², +0.2 per level, caps at 5.0
- **Wind** — starts at 0, +0.1 per level, caps at 2.0 m/s²
- **Pad count** — decreases from 3 pads to 1 at higher levels
- **Mini-game difficulty** — more enemies, faster projectiles, more obstacles

## Setup

### Fetch Repository Data

```bash
# Fetch PR and commit data from any GitHub repository
node fetch-github-data.js owner/repo

# Classify PRs by type
node classify-prs.js data/<repo>.json
```

### Run the Game

Open `index.html` in a browser. Select a repository if multiple data files exist, then press Space to start.

### Controls

| Key | Action |
|-----|--------|
| Up / W | Thrust |
| Left / A | Rotate left |
| Right / D | Rotate right |
| Down / S | Retro thrust (mini-games) |
| Space | Start / Continue / Shoot / Launch |
| R | Restart level |

## Credits

- **Game compilation**: [ProxiBlue](https://github.com/ProxiBlue)
- **Built with**: [Chief](https://github.com/MiniCodeMonkey/chief) — autonomous PRD agent with adversarial evaluation
- **Ship logo**: [Mage-OS](https://mage-os.org) M logomark (fan use, not affiliated)
- **Inspired by**: Lunar Lander, Asteroids, Missile Command, Space Invaders, Breakout, Moon Buggy (Atari)
