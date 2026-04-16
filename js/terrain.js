// --- Terrain ---
var terrain = [];       // array of {x, y} points
var landingPadIndex = -1; // index into terrain[] where the first flat landing pad starts (kept for backward compat)
var landingPads = [];    // array of {index, width, points} for all landing pads

// Animation time tracker for pad glow pulse
var animTime = 0;

// Build per-segment height values from commit data.
// Returns an array of normalized heights (0 = smallest commit, 1 = largest commit)
// for exactly segmentCount segments.
function buildCommitHeights(segmentCount, commits) {
    var source = commits || repoCommits;
    if (source.length === 0) return null;

    // Compute total lines changed per commit
    var commitSizes = [];
    for (var i = 0; i < source.length; i++) {
        var c = source[i];
        commitSizes.push((c.linesAdded || 0) + (c.linesDeleted || 0));
    }

    var rawHeights = [];

    if (commitSizes.length >= segmentCount) {
        // More commits than segments: group/average per segment
        var commitsPerSeg = commitSizes.length / segmentCount;
        for (var s = 0; s < segmentCount; s++) {
            var startIdx = Math.floor(s * commitsPerSeg);
            var endIdx = Math.floor((s + 1) * commitsPerSeg);
            if (endIdx <= startIdx) endIdx = startIdx + 1;
            var sum = 0;
            var count = 0;
            for (var j = startIdx; j < endIdx && j < commitSizes.length; j++) {
                sum += commitSizes[j];
                count++;
            }
            rawHeights.push(count > 0 ? sum / count : 0);
        }
    } else {
        // Fewer commits than segments: interpolate intermediate points
        // Place commits evenly across segments, linearly interpolate between them
        if (commitSizes.length === 1) {
            for (var s = 0; s < segmentCount; s++) {
                rawHeights.push(commitSizes[0]);
            }
        } else {
            var step = (commitSizes.length - 1) / (segmentCount - 1);
            for (var s = 0; s < segmentCount; s++) {
                var pos = s * step;
                var lo = Math.floor(pos);
                var hi = Math.ceil(pos);
                if (hi >= commitSizes.length) hi = commitSizes.length - 1;
                var frac = pos - lo;
                rawHeights.push(commitSizes[lo] * (1 - frac) + commitSizes[hi] * frac);
            }
        }
    }

    // Normalize to 0..1 range
    var minVal = rawHeights[0];
    var maxVal = rawHeights[0];
    for (var i = 1; i < rawHeights.length; i++) {
        if (rawHeights[i] < minVal) minVal = rawHeights[i];
        if (rawHeights[i] > maxVal) maxVal = rawHeights[i];
    }
    var range = maxVal - minVal;
    var normalized = [];
    for (var i = 0; i < rawHeights.length; i++) {
        normalized.push(range > 0 ? (rawHeights[i] - minVal) / range : 0.5);
    }

    // Smoothing pass: limit max slope between adjacent segments
    // Max allowed change per segment (0.25 = 25% of full height range per step)
    var maxSlope = 0.25;
    for (var pass = 0; pass < 3; pass++) {
        for (var i = 1; i < normalized.length; i++) {
            var diff = normalized[i] - normalized[i - 1];
            if (Math.abs(diff) > maxSlope) {
                normalized[i] = normalized[i - 1] + (diff > 0 ? maxSlope : -maxSlope);
            }
        }
        // Reverse pass for symmetry
        for (var i = normalized.length - 2; i >= 0; i--) {
            var diff = normalized[i] - normalized[i + 1];
            if (Math.abs(diff) > maxSlope) {
                normalized[i] = normalized[i + 1] + (diff > 0 ? maxSlope : -maxSlope);
            }
        }
    }

    return normalized;
}

// Get total number of PR batches available
function getTotalBatches() {
    if (repoPRs.length === 0) return 0;
    return Math.ceil(repoPRs.length / MAX_PADS_PER_LEVEL);
}

// Get the PRs assigned to the current level (batched by MAX_PADS_PER_LEVEL)
// PRs are sorted most-recent-first, so level 0 = most recent batch, level 1 = next, etc.
// If past all batches, loops back to the beginning
// Also sets levelDateRange and levelCommits for the current batch
function getLevelPRs(level) {
    levelDateRange = '';
    levelCommits = [];

    if (repoPRs.length === 0 && unplacedPRs.length === 0) return [];

    var totalBatches = getTotalBatches();
    var effectiveLevel = level;
    var looped = false;

    // If past all available batches, loop back
    if (totalBatches > 0 && effectiveLevel >= totalBatches) {
        effectiveLevel = effectiveLevel % totalBatches;
        looped = true;
    }

    var startIdx = effectiveLevel * MAX_PADS_PER_LEVEL;
    // Get the scheduled PRs for this level from the main list
    var scheduled = [];
    if (startIdx < repoPRs.length) {
        scheduled = repoPRs.slice(startIdx, startIdx + MAX_PADS_PER_LEVEL);
    }
    // Prepend any unplaced PRs carried over from previous levels
    var carried = unplacedPRs.splice(0);
    var combined = carried.concat(scheduled);
    // Cap at MAX_PADS_PER_LEVEL; put overflow back into unplacedPRs
    if (combined.length > MAX_PADS_PER_LEVEL) {
        unplacedPRs = combined.slice(MAX_PADS_PER_LEVEL);
        combined = combined.slice(0, MAX_PADS_PER_LEVEL);
    }

    // Compute date range for this batch and filter commits
    if (combined.length > 0) {
        var dates = [];
        for (var i = 0; i < combined.length; i++) {
            if (combined[i].mergedDate) {
                var parsedTime = new Date(combined[i].mergedDate).getTime();
                if (!isNaN(parsedTime)) {
                    dates.push(parsedTime);
                }
            }
        }
        if (dates.length > 0) {
            var minDate = Math.min.apply(null, dates);
            var maxDate = Math.max.apply(null, dates);
            // Format date range for HUD display
            var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            var d1 = new Date(minDate);
            var d2 = new Date(maxDate);
            levelDateRange = months[d1.getMonth()] + ' ' + d1.getFullYear() + ' - ' + months[d2.getMonth()] + ' ' + d2.getFullYear();

            // Filter commits to this batch's date range
            if (repoCommits.length > 0) {
                levelCommits = [];
                for (var c = 0; c < repoCommits.length; c++) {
                    var commitDate = new Date(repoCommits[c].date).getTime();
                    if (!isNaN(commitDate) && commitDate >= minDate && commitDate <= maxDate) {
                        levelCommits.push(repoCommits[c]);
                    }
                }
                // If no commits in range, use all commits as fallback
                if (levelCommits.length === 0) {
                    levelCommits = repoCommits;
                }
            }
        }
    }

    return combined;
}

// Map a PR's merge date to a terrain segment index based on the commit timeline
function prMergeDateToSegment(pr, segmentCount) {
    var commits = levelCommits.length > 0 ? levelCommits : repoCommits;
    if (commits.length === 0) return Math.floor(segmentCount / 2);

    var prDate = new Date(pr.mergedDate).getTime();
    var firstCommitDate = new Date(commits[0].date).getTime();
    var lastCommitDate = new Date(commits[commits.length - 1].date).getTime();

    if (isNaN(prDate) || isNaN(firstCommitDate) || isNaN(lastCommitDate)) return Math.floor(segmentCount / 2);

    var timeRange = lastCommitDate - firstCommitDate;

    if (timeRange <= 0) return Math.floor(segmentCount / 2);

    // Map to segment, clamping to avoid very edges (segments 2 to segmentCount-3)
    var ratio = (prDate - firstCommitDate) / timeRange;
    ratio = Math.max(0, Math.min(1, ratio));
    var seg = Math.round(2 + ratio * (segmentCount - 5));
    return Math.max(2, Math.min(segmentCount - 3, seg));
}

function generateTerrain() {
    terrain = [];
    landingPads = [];
    var w = canvas.width;
    var h = canvas.height;
    var segmentCount = 40;
    var segWidth = w / segmentCount;

    var usedSegments = {};
    var placedPads = [];

    // Get PRs for this level
    var levelPRs = getLevelPRs(currentLevel);

    if (levelPRs.length > 0) {
        // PR-based pad placement
        for (var p = 0; p < levelPRs.length; p++) {
            var pr = levelPRs[p];
            var prType = pr.type || 'other';
            var padWidth = (typeof PR_PAD_WIDTHS[prType] === 'number') ? PR_PAD_WIDTHS[prType] : (PR_PAD_WIDTHS.other || 2);
            var padPoints = (typeof PR_PAD_POINTS[prType] === 'number') ? PR_PAD_POINTS[prType] : (PR_PAD_POINTS.other || 100);

            // Calculate target segment from PR merge date
            var targetSeg = prMergeDateToSegment(pr, segmentCount);

            // Find nearest non-overlapping position (with 1-segment gap)
            var padIdx = -1;
            for (var offset = 0; offset < segmentCount; offset++) {
                var candidates = [targetSeg + offset, targetSeg - offset];
                for (var ci = 0; ci < candidates.length; ci++) {
                    var candidate = candidates[ci];
                    if (candidate < 2 || candidate + padWidth >= segmentCount - 1) continue;
                    var overlap = false;
                    for (var s = candidate - 1; s <= candidate + padWidth + 1; s++) {
                        if (usedSegments[s]) { overlap = true; break; }
                    }
                    if (!overlap) {
                        padIdx = candidate;
                        break;
                    }
                }
                if (padIdx >= 0) break;
            }

            // Retry without gap requirement if gap-based search failed
            if (padIdx < 0) {
                for (var offset = 0; offset < segmentCount; offset++) {
                    var candidates = [targetSeg + offset, targetSeg - offset];
                    for (var ci = 0; ci < candidates.length; ci++) {
                        var candidate = candidates[ci];
                        if (candidate < 1 || candidate + padWidth >= segmentCount) continue;
                        var overlap = false;
                        for (var s = candidate; s <= candidate + padWidth; s++) {
                            if (usedSegments[s]) { overlap = true; break; }
                        }
                        if (!overlap) {
                            padIdx = candidate;
                            break;
                        }
                    }
                    if (padIdx >= 0) break;
                }
            }

            // If still no position found, carry PR to the next level
            if (padIdx < 0) {
                unplacedPRs.push(pr);
            } else {
                for (var s = padIdx; s <= padIdx + padWidth; s++) {
                    usedSegments[s] = true;
                }
                placedPads.push({ index: padIdx, width: padWidth, points: padPoints, prType: prType, prNumber: pr.number, prTitle: pr.title || '', prHash: (pr.mergeCommitHash && typeof pr.mergeCommitHash === 'string') ? pr.mergeCommitHash.substring(0, 7) : '', prAuthor: pr.author || '', prMergedDate: pr.mergedDate || '' });
            }
        }
    }

    // Fallback: if fewer than 1 valid pad, generate a fallback pad
    if (placedPads.length < 1) {
        var fallbackWidth = 2; // medium width
        var fallbackIdx = Math.floor(segmentCount / 2) - 1;
        // Find non-overlapping spot near center
        for (var offset = 0; offset < segmentCount; offset++) {
            var candidates = [fallbackIdx + offset, fallbackIdx - offset];
            for (var ci = 0; ci < candidates.length; ci++) {
                var candidate = candidates[ci];
                if (candidate < 2 || candidate + fallbackWidth >= segmentCount - 1) continue;
                var overlap = false;
                for (var s = candidate - 1; s <= candidate + fallbackWidth + 1; s++) {
                    if (usedSegments[s]) { overlap = true; break; }
                }
                if (!overlap) {
                    fallbackIdx = candidate;
                    break;
                }
            }
            if (fallbackIdx !== Math.floor(segmentCount / 2) - 1) break;
        }
        for (var s = fallbackIdx; s <= fallbackIdx + fallbackWidth; s++) {
            usedSegments[s] = true;
        }
        placedPads.push({ index: fallbackIdx, width: fallbackWidth, points: 100, prType: 'fallback', prNumber: null, prTitle: '', prHash: '' });
    }

    placedPads.sort(function(a, b) { return a.index - b.index; });
    landingPads = placedPads;
    landingPadIndex = landingPads.length > 0 ? landingPads[0].index : -1;

    // Base terrain height range (bottom 40% of screen)
    var minY = h * 0.55;
    var maxY = h * 0.95;

    // Build a lookup: for each segment index, which pad does it belong to?
    var segmentPadMap = {};
    for (var p = 0; p < landingPads.length; p++) {
        var pad = landingPads[p];
        for (var s = pad.index; s <= pad.index + pad.width; s++) {
            segmentPadMap[s] = p;
        }
    }

    // Get commit-driven heights using level-filtered commits (or all commits as fallback)
    var commitsForTerrain = levelCommits.length > 0 ? levelCommits : repoCommits;
    var commitHeights = buildCommitHeights(segmentCount, commitsForTerrain);

    for (var i = 0; i <= segmentCount; i++) {
        var x = i * segWidth;
        var y;

        if (segmentPadMap[i] !== undefined) {
            var padRef = landingPads[segmentPadMap[i]];
            if (i === padRef.index) {
                // First point of pad: use commit height if available, else random
                if (commitHeights && i < commitHeights.length) {
                    y = maxY - commitHeights[i] * (maxY - minY);
                } else {
                    y = minY + Math.random() * (maxY - minY) * 0.6 + (maxY - minY) * 0.2;
                }
            } else {
                // Subsequent points of pad: match the pad's starting height (flatten terrain)
                y = terrain[padRef.index].y;
            }
        } else if (commitHeights && i < commitHeights.length) {
            // Commit-driven terrain: map normalized height to Y range
            y = maxY - commitHeights[i] * (maxY - minY);
        } else {
            // Fallback: random terrain (v1 style)
            y = minY + Math.random() * (maxY - minY);
        }

        terrain.push({ x: x, y: y });
    }
}

function drawTerrain() {
    if (terrain.length === 0) return;

    if (invaderMode) {
        // --- Invader mode: arcade-style terrain with green grid glow ---

        // Dark fill with faint green tint
        ctx.beginPath();
        ctx.moveTo(terrain[0].x, terrain[0].y);
        for (var i = 1; i < terrain.length; i++) {
            ctx.lineTo(terrain[i].x, terrain[i].y);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();
        ctx.fillStyle = '#0a1a0a';
        ctx.fill();

        // Horizontal grid lines (classic arcade floor)
        var gridSpacing = 20;
        var terrainTopY = terrain[0].y;
        for (var gi = 0; gi < terrain.length; gi++) {
            if (terrain[gi].y < terrainTopY) terrainTopY = terrain[gi].y;
        }
        ctx.save();
        // Clip to terrain area
        ctx.beginPath();
        ctx.moveTo(terrain[0].x, terrain[0].y);
        for (var i = 1; i < terrain.length; i++) {
            ctx.lineTo(terrain[i].x, terrain[i].y);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();
        ctx.clip();

        ctx.strokeStyle = 'rgba(0, 255, 65, 0.12)';
        ctx.lineWidth = 1;
        for (var gy = terrainTopY; gy <= canvas.height; gy += gridSpacing) {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(canvas.width, gy);
            ctx.stroke();
        }

        // Vertical grid lines
        for (var gx = 0; gx <= canvas.width; gx += gridSpacing) {
            ctx.beginPath();
            ctx.moveTo(gx, terrainTopY);
            ctx.lineTo(gx, canvas.height);
            ctx.stroke();
        }
        ctx.restore();

        // Glowing green top surface line
        ctx.save();
        ctx.shadowColor = '#00FF41';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(terrain[0].x, terrain[0].y);
        for (var i = 1; i < terrain.length; i++) {
            ctx.lineTo(terrain[i].x, terrain[i].y);
        }
        ctx.strokeStyle = '#00FF41';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Second pass: brighter inner line
        ctx.beginPath();
        ctx.moveTo(terrain[0].x, terrain[0].y);
        for (var i = 1; i < terrain.length; i++) {
            ctx.lineTo(terrain[i].x, terrain[i].y);
        }
        ctx.strokeStyle = 'rgba(0, 255, 65, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else {
        // --- Normal lander mode terrain ---

        // Filled polygon: terrain line segments + bottom corners
        ctx.beginPath();
        ctx.moveTo(terrain[0].x, terrain[0].y);
        for (var i = 1; i < terrain.length; i++) {
            ctx.lineTo(terrain[i].x, terrain[i].y);
        }
        // Close along the bottom of the canvas
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();

        ctx.fillStyle = '#444';
        ctx.fill();

        // Stroke the top surface
        ctx.beginPath();
        ctx.moveTo(terrain[0].x, terrain[0].y);
        for (var i = 1; i < terrain.length; i++) {
            ctx.lineTo(terrain[i].x, terrain[i].y);
        }
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Highlight all landing pads with glow/pulse animation
    var pulseAlpha = 0.5 + 0.5 * Math.sin(animTime * 3);  // oscillates between 0 and 1
    // Scale glow based on viewport size so pads remain visible on large/zoomed-out displays
    var glowScale = Math.max(1, Math.min(canvas.width, canvas.height) / 800);
    for (var p = 0; p < landingPads.length; p++) {
        var pad = landingPads[p];
        if (pad.index >= 0 && pad.index < terrain.length) {
            var padStart = terrain[pad.index];
            var padEnd = terrain[pad.index + pad.width] || terrain[terrain.length - 1];

            // Color based on PR type
            var padColor = PR_TYPE_COLORS[pad.prType] || PR_TYPE_COLORS.other;

            // Wide outer glow for distance visibility (scales with viewport)
            ctx.save();
            ctx.shadowColor = padColor;
            ctx.shadowBlur = (20 + 12 * pulseAlpha) * glowScale;
            ctx.beginPath();
            ctx.moveTo(padStart.x, padStart.y);
            ctx.lineTo(padEnd.x, padEnd.y);
            ctx.strokeStyle = padColor;
            ctx.globalAlpha = 0.25 + 0.2 * pulseAlpha;
            ctx.lineWidth = 6 * glowScale;
            ctx.stroke();
            ctx.restore();

            // Inner glow effect (scales with viewport)
            ctx.save();
            ctx.shadowColor = padColor;
            ctx.shadowBlur = (10 + 8 * pulseAlpha) * glowScale;
            ctx.beginPath();
            ctx.moveTo(padStart.x, padStart.y);
            ctx.lineTo(padEnd.x, padEnd.y);
            ctx.strokeStyle = padColor;
            ctx.globalAlpha = 0.6 + 0.4 * pulseAlpha;
            ctx.lineWidth = 4 * glowScale;
            ctx.stroke();
            ctx.restore();

            // Solid pad line on top (scales with viewport)
            ctx.beginPath();
            ctx.moveTo(padStart.x, padStart.y);
            ctx.lineTo(padEnd.x, padEnd.y);
            ctx.strokeStyle = padColor;
            ctx.lineWidth = 3 * glowScale;
            ctx.stroke();

            // Point value label with multiplier (scales with viewport)
            var midX = (padStart.x + padEnd.x) / 2;
            ctx.fillStyle = padColor;
            ctx.font = 'bold ' + Math.round(12 * glowScale) + 'px sans-serif';
            ctx.textAlign = 'center';
            var padMultiplier = PR_TYPE_MULTIPLIERS[pad.prType] || 1;
            var labelText = pad.points + 'pts';
            if (padMultiplier > 1) {
                labelText += ' x' + padMultiplier;
            }
            ctx.fillText(labelText, midX, padStart.y - 8);

            // PR/commit hash label below the pad
            var padLabel = '';
            if (pad.prNumber) {
                padLabel = 'PR #' + pad.prNumber;
            } else if (pad.prHash) {
                padLabel = pad.prHash;
            }
            if (padLabel) {
                ctx.save();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.font = Math.round(9 * glowScale) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(padLabel, midX, padStart.y + 14 * glowScale);
                ctx.restore();
            }
        }
    }
}
