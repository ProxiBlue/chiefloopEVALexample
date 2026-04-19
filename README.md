# Mage Lander

A browser-based lunar lander game built with vanilla HTML/CSS/JS (no frameworks).

**[▶ Play the eval-built version on GitHub Pages](https://proxiblue.github.io/chiefloopEVALexample/test-chief-adverserial/)**

## The Game

The player controls a Mage-OS "M" logo as a spacecraft, landing it safely on randomly placed landing pads across a procedurally generated terrain. The game should feel like the classic Lunar Lander arcade game but with modern polish.

### Core Mechanics

- **Ship**: The Mage-OS "M" logo (orange `#f26322` on dark background), rendered as an SVG or styled element
- **Physics**: Gravity pulls the ship down. Thrust (up arrow/W) fights gravity. Left/Right arrows rotate the ship.
- **Landing pads**: Flat sections on the terrain, marked with a highlighted color. Randomly placed each level.
- **Terrain**: Procedurally generated jagged mountain landscape using line segments. Different each game.
- **Fuel**: Limited fuel supply shown as a bar. When empty, no thrust available.
- **Landing rules**: Must land on a pad, vertical speed < 2 m/s, horizontal speed < 1 m/s, angle within 15 degrees of vertical. Otherwise: crash + explosion.
- **Scoring**: Points based on remaining fuel + difficulty of landing pad (narrower pad = more points).
- **Levels**: Each level gets harder — more terrain, narrower pads, stronger gravity, wind gusts.
- **Wind**: Random horizontal gusts that push the ship. Shown as an arrow indicator on the HUD.

### Visual Style

- Dark space background with stars (parallax optional)
- Orange (#f26322) Mage-OS M logo as the ship
- Thrust flame effect below the ship when engines fire
- Terrain drawn as a filled polygon (dark gray/brown)
- Landing pads glow or pulse subtly
- HUD showing: altitude, velocity (horizontal + vertical), fuel, score, level
- Crash = explosion particle effect + screen shake
- Successful landing = celebration particles

### Controls

- **Up Arrow / W**: Main thrust
- **Left Arrow / A**: Rotate counter-clockwise
- **Right Arrow / D**: Rotate clockwise
- **R**: Restart level
- **Space**: Start game / next level after landing

### Tech

- Single `index.html` file with embedded CSS and JS (keep it simple)
- HTML5 Canvas for rendering
- No external dependencies
- Should work in any modern browser

## Adversarial Evaluation System

Chief includes an adversarial evaluation system that validates generated code against story acceptance criteria. After the generator agent commits code for a story, multiple independent evaluator agents score the output and deliberate to produce a final pass/fail verdict.

### How It Works

1. **Story completion**: The generator agent commits code for a user story.
2. **Parallel evaluation**: N evaluator agents (default 3) independently analyse the code diff against the story's acceptance criteria, scoring each criterion on a 1-10 scale (1 = broken, 7 = acceptable, 10 = bulletproof).
3. **Deliberation**: Evaluators review each other's findings, challenge false positives, agree with legitimate issues, and surface missed problems.
4. **Final verdict**: Scores are averaged across evaluators. A story passes only if ALL criteria meet the configured threshold (default 7/10).
5. **Retry or proceed**: If a story fails, the generator retries (up to `maxRetries`). If it passes, Chief moves to the next story.
6. **Persistence**: Full evaluation transcripts (scores, reasoning, deliberation) are saved to `.evaluation/`.

### CLI Usage

```bash
# Run with evaluation enabled
chief run --eval

# Or enable via config (see below)
chief run
```

The `--eval` flag is opt-in. Without it, stories are committed without evaluation.

### Configuration

In `config.yaml`:

```yaml
evaluation:
  enabled: false        # opt-in, or use --eval flag
  agents: 3             # number of parallel evaluator agents
  passThreshold: 7      # minimum score per criterion (1-10)
  maxRetries: 3         # retry attempts per story on failure
  mode: "caveman"       # evaluator output style
  provider: ""          # LLM provider for evaluators (defaults to main provider)
```

### Key Components

| File | Purpose |
|------|---------|
| `internal/evaluation/runner.go` | Orchestrates the full pipeline: evaluators, deliberation, verdict |
| `internal/evaluation/evaluator.go` | Invokes a single evaluator and parses JSON scores |
| `internal/evaluation/deliberation.go` | Runs the deliberation round and merges findings |
| `embed/evaluator_prompt.txt` | Prompt directing evaluators to score criteria with JSON output |
| `embed/deliberation_prompt.txt` | Prompt instructing deliberators to challenge and verify findings |
| `internal/tui/evaluation_viewer.go` | TUI display of evaluation transcripts with colour-coded scores |

### Testing With This Project

This Mage Lander game is designed to test Chief's adversarial evaluation feature.

#### Test 1: Without evaluation (baseline)

```bash
cd /tmp/test-chief
/var/www/html/bin/chief new
# Let it create the PRD, press 's' to start
/var/www/html/bin/chief
```

#### Test 2: With adversarial evaluation

```bash
cd /tmp/test-chief-eval
# Copy the same PRD, then:
/var/www/html/bin/chief --eval
```

#### Compare

- Does the no-eval version actually meet all acceptance criteria? Open `index.html` and test manually.
- Does the eval version catch things the generator missed?
- Check `.evaluation/` for the scoring transcripts.
