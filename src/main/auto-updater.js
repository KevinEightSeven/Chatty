const { net } = require('electron');
const { version } = require('../../package.json');

const GITHUB_OWNER = 'KevinEightSeven';
const GITHUB_REPO = 'Chatty';
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

/**
 * Compare two semver strings. Returns:
 *   1 if a > b, -1 if a < b, 0 if equal.
 */
function compareSemver(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Check GitHub for a newer release.
 * Returns { updateAvailable, currentVersion, latestVersion, releaseUrl, releaseNotes }
 * or { updateAvailable: false, currentVersion } if up to date or on error.
 */
function checkForUpdates() {
  return new Promise((resolve) => {
    const request = net.request({
      method: 'GET',
      url: RELEASES_URL,
    });

    request.setHeader('Accept', 'application/vnd.github.v3+json');
    request.setHeader('User-Agent', `Chatty/${version}`);

    let body = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        body += chunk.toString();
      });

      response.on('end', () => {
        try {
          const data = JSON.parse(body);
          const latestTag = data.tag_name || '';
          const latestVersion = latestTag.replace(/^v/, '');

          if (latestVersion && compareSemver(latestVersion, version) > 0) {
            resolve({
              updateAvailable: true,
              currentVersion: version,
              latestVersion,
              releaseUrl: data.html_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
              releaseNotes: data.body || '',
            });
          } else {
            resolve({ updateAvailable: false, currentVersion: version });
          }
        } catch {
          resolve({ updateAvailable: false, currentVersion: version });
        }
      });
    });

    request.on('error', () => {
      resolve({ updateAvailable: false, currentVersion: version });
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      request.abort();
      resolve({ updateAvailable: false, currentVersion: version });
    }, 10000);

    request.end();
  });
}

module.exports = { checkForUpdates, compareSemver };
