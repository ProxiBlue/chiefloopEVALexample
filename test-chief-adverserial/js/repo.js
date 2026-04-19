// --- Repository Selector ---
var availableRepos = [];        // array of {file, name} from data/repos.json
var selectedRepoIndex = 0;      // currently highlighted repo in selector
var selectedRepoName = '';      // display name of selected repo
var repoSelectorActive = false; // true when selector is shown on menu
var repoLoadError = '';         // error message if repos can't be loaded
var reposLoaded = false;        // true once repo list has been fetched
var repoCommits = [];           // loaded commit data for selected repo (chronological order)
var repoPRs = [];               // loaded PR data for selected repo (merged PRs with type)
var unplacedPRs = [];           // PRs that couldn't be placed on previous levels (carried forward)
var repoDataLoaded = false;     // true once repo JSON has been fetched
var repoDataError = '';         // error message if repo data fails to load
var repoDataLoading = false;    // true while repo data is being fetched
var repoFallbackNotice = '';    // notice shown when falling back to random terrain
var levelDateRange = '';        // date range string for current level's PR batch (e.g., "Mar 2024 - Apr 2024")
var levelCommits = [];          // commits filtered to current level's PR batch date range

function loadRepoData(repoFile) {
    repoDataLoaded = false;
    repoDataLoading = true;
    repoDataError = '';
    repoFallbackNotice = '';
    repoCommits = [];
    repoPRs = [];
    unplacedPRs = [];
    levelDateRange = '';
    levelCommits = [];
    // Path traversal protection
    if (!repoFile || /[\/\\]|\.\./.test(repoFile)) {
        repoDataError = 'Invalid data file name';
        repoDataLoading = false;
        return;
    }
    fetch('data/' + repoFile)
        .then(function (res) {
            if (!res.ok) {
                if (res.status === 404) {
                    throw new Error('Data file not found: data/' + repoFile);
                }
                throw new Error('Failed to load data (HTTP ' + res.status + ')');
            }
            return res.json();
        })
        .then(function (data) {
            // Validate data structure
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid data format in ' + repoFile);
            }
            var hasCommits = data.commits && Array.isArray(data.commits) && data.commits.length > 0;
            var hasPRs = data.pullRequests && Array.isArray(data.pullRequests) && data.pullRequests.length > 0;

            if (hasCommits) {
                repoCommits = data.commits.slice().sort(function (a, b) {
                    return new Date(a.date) - new Date(b.date);
                });
            }
            if (hasPRs) {
                repoPRs = data.pullRequests
                    .filter(function (pr) { return pr.mergedDate; })
                    .sort(function (a, b) {
                        return new Date(b.mergedDate) - new Date(a.mergedDate);
                    });
            }

            // Set fallback notice if no commits and no PRs
            if (!hasCommits && !hasPRs) {
                repoFallbackNotice = 'No commit or PR data found — using random terrain';
            } else if (!hasCommits) {
                repoFallbackNotice = 'No commit data found — terrain will be randomized';
            } else if (!hasPRs) {
                repoFallbackNotice = 'No PR data found — using random landing pads';
            }

            repoDataLoaded = true;
            repoDataLoading = false;
        })
        .catch(function (err) {
            repoDataError = err.message || 'Failed to load repository data';
            repoDataLoaded = false;
            repoDataLoading = false;
        });
}

function loadRepoList() {
    fetch('data/repos.json')
        .then(function (res) {
            if (!res.ok) throw new Error('No repos.json found');
            return res.json();
        })
        .then(function (repos) {
            availableRepos = repos;
            reposLoaded = true;
            if (repos.length === 0) {
                repoLoadError = 'No data files found. Run fetch-github-data.js to fetch repository data.';
                repoSelectorActive = false;
            } else if (repos.length === 1) {
                // Auto-select the only repo
                selectedRepoIndex = 0;
                selectedRepoName = repos[0].name;
                loadRepoData(repos[0].file);
                repoSelectorActive = false;
            } else {
                selectedRepoIndex = 0;
                selectedRepoName = repos[0].name;
                repoSelectorActive = true;
            }
        })
        .catch(function () {
            reposLoaded = true;
            repoLoadError = 'No data files found. Run fetch-github-data.js to fetch repository data.';
            repoSelectorActive = false;
        });
}

// Load repos on startup
loadRepoList();
