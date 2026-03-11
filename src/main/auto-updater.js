const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
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
 * Fetch the latest release JSON from GitHub API.
 * Returns the parsed release object or null on error.
 */
function fetchLatestRelease() {
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
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });

    request.on('error', () => {
      resolve(null);
    });

    // Timeout after 10 seconds
    const timeout = setTimeout(() => {
      request.abort();
      resolve(null);
    }, 10000);

    request.on('response', () => clearTimeout(timeout));
    request.on('error', () => clearTimeout(timeout));

    request.end();
  });
}

/**
 * Check GitHub for a newer release.
 * Returns { updateAvailable, currentVersion, latestVersion, releaseUrl, releaseNotes }
 * or { updateAvailable: false, currentVersion } if up to date or on error.
 */
async function checkForUpdates() {
  const data = await fetchLatestRelease();

  if (!data || !data.tag_name) {
    return { updateAvailable: false, currentVersion: version };
  }

  const latestVersion = data.tag_name.replace(/^v/, '');

  if (latestVersion && compareSemver(latestVersion, version) > 0) {
    return {
      updateAvailable: true,
      currentVersion: version,
      latestVersion,
      releaseUrl: data.html_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      releaseNotes: data.body || '',
    };
  }

  return { updateAvailable: false, currentVersion: version };
}

/**
 * Download a file from a URL to a local path using electron's net module.
 * Pipes the response to a write stream and reports progress via onProgress callback.
 *
 * @param {string} url - The download URL
 * @param {string} destPath - Local file path to write to
 * @param {Function} [onProgress] - Callback receiving {percent, transferred, total}
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url,
    });

    request.setHeader('User-Agent', `Chatty/${version}`);
    request.setHeader('Accept', 'application/octet-stream');

    request.on('response', (response) => {
      // Follow redirects - electron's net module handles 3xx automatically,
      // but GitHub API asset downloads may return a direct URL
      if (response.statusCode >= 400) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const total = parseInt(response.headers['content-length'], 10) || 0;
      let transferred = 0;

      const fileStream = fs.createWriteStream(destPath);

      response.on('data', (chunk) => {
        fileStream.write(chunk);
        transferred += chunk.length;

        if (onProgress && total > 0) {
          onProgress({
            percent: Math.round((transferred / total) * 100),
            transferred,
            total,
          });
        }
      });

      response.on('end', () => {
        fileStream.end(() => {
          resolve();
        });
      });

      response.on('error', (err) => {
        fileStream.destroy();
        fs.unlink(destPath, () => {});
        reject(err);
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    request.end();
  });
}

/**
 * Download the latest release asset and install/apply the update.
 *
 * @param {Function} [onProgress] - Optional callback receiving {percent, transferred, total}
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function downloadAndInstall(onProgress) {
  const platform = process.platform;

  // Determine the expected asset filename for this platform
  const assetName = platform === 'win32' ? 'Chatty-Setup.exe' : 'Chatty.AppImage';

  if (platform !== 'win32' && platform !== 'linux') {
    return { success: false, message: `Unsupported platform: ${platform}` };
  }

  // Fetch latest release info
  const data = await fetchLatestRelease();
  if (!data || !data.assets) {
    return { success: false, message: 'Failed to fetch release information from GitHub.' };
  }

  const latestVersion = (data.tag_name || '').replace(/^v/, '');
  if (!latestVersion || compareSemver(latestVersion, version) <= 0) {
    return { success: false, message: 'No newer version available.' };
  }

  // Find the matching asset
  const asset = data.assets.find((a) => a.name === assetName);
  if (!asset) {
    return { success: false, message: `Could not find asset "${assetName}" in the latest release.` };
  }

  const downloadUrl = asset.browser_download_url;
  if (!downloadUrl) {
    return { success: false, message: 'No download URL available for the asset.' };
  }

  // Download to a temp file
  const tempDir = app.getPath('temp');
  const tempFilePath = path.join(tempDir, assetName);

  try {
    await downloadFile(downloadUrl, tempFilePath, onProgress);
  } catch (err) {
    return { success: false, message: `Download failed: ${err.message}` };
  }

  // Verify the file was written
  if (!fs.existsSync(tempFilePath)) {
    return { success: false, message: 'Downloaded file not found after download.' };
  }

  // Platform-specific installation
  if (platform === 'win32') {
    // Windows: launch the installer and quit
    try {
      execFile(tempFilePath, [], { detached: true, stdio: 'ignore' }).unref();
      app.quit();
      return { success: true, message: 'Installer launched. The app will now quit.' };
    } catch (err) {
      return { success: false, message: `Failed to launch installer: ${err.message}` };
    }
  }

  if (platform === 'linux') {
    // Linux: replace the current AppImage with the downloaded one
    const currentExePath = process.env.APPIMAGE || app.getPath('exe');

    try {
      // Copy the downloaded file over the current executable
      fs.copyFileSync(tempFilePath, currentExePath);
      fs.chmodSync(currentExePath, 0o755);

      // Clean up the temp file
      fs.unlinkSync(tempFilePath);

      // Relaunch and quit
      app.relaunch();
      app.quit();
      return { success: true, message: 'Update applied. The app will now relaunch.' };
    } catch (err) {
      return { success: false, message: `Failed to apply update: ${err.message}` };
    }
  }

  return { success: false, message: 'Unexpected error during installation.' };
}

module.exports = { checkForUpdates, downloadAndInstall, compareSemver };
