const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');

// Twitch OAuth endpoints
const AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';
const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
const REVOKE_URL = 'https://id.twitch.tv/oauth2/revoke';

const REDIRECT_PORT = 48721;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

// Bundled Client ID — no secret needed with implicit grant
const CLIENT_ID = 'wk9u3h3netoqji2tzmcm0i2zbz5e77';

const SCOPES = [
  'chat:read',
  'chat:edit',
  'user:read:chat',
  'user:write:chat',
  'user:manage:blocked_users',
  'user:manage:chat_color',
  'moderator:read:chatters',
  'moderator:manage:banned_users',
  'moderator:manage:chat_messages',
  'moderator:manage:chat_settings',
  'moderator:manage:warnings',
  'moderator:manage:announcements',
  'moderator:manage:shield_mode',
  'moderator:manage:shoutouts',
  'moderation:read',
  'moderator:read:followers',
  'channel:read:subscriptions',
  'channel:read:polls',
  'channel:manage:broadcast',
  'channel:manage:moderators',
  'channel:manage:vips',
  'channel:manage:raids',
  'channel:manage:polls',
  'channel:edit:commercial',
  'bits:read',
].join(' ');

class AuthManager {
  constructor(store) {
    this.store = store;
    this.tokens = store.get('auth.tokens', null);
    this.userInfo = store.get('auth.userInfo', null);
    this._validateInterval = null;
  }

  getClientId() {
    return CLIENT_ID;
  }

  getStatus() {
    return {
      loggedIn: !!this.tokens?.access_token,
      user: this.userInfo,
    };
  }

  getAccessToken() {
    return this.tokens?.access_token || null;
  }

  async login() {
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      response_type: 'token',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      state,
      force_verify: 'true',
    });

    const authUrl = `${AUTH_URL}?${params}`;

    // Wait for the OAuth callback (implicit grant returns token in URL fragment)
    const accessToken = await this._waitForCallback(state, authUrl);

    this.tokens = { access_token: accessToken };
    this.store.set('auth.tokens', this.tokens);

    // Validate to get user info
    await this._validate();

    // Start periodic validation (every hour)
    this._startValidationTimer();

    return { success: true, user: this.userInfo };
  }

  async _validate() {
    if (!this.tokens?.access_token) return false;

    try {
      const res = await fetch(VALIDATE_URL, {
        headers: { Authorization: `OAuth ${this.tokens.access_token}` },
      });

      if (!res.ok) {
        // Implicit grant has no refresh tokens — user must re-auth
        this.logout();
        return false;
      }

      const data = await res.json();
      this._setUserInfo(data);
      return true;
    } catch {
      return false;
    }
  }

  _setUserInfo(validateData) {
    this.userInfo = {
      login: validateData.login,
      userId: validateData.user_id,
      displayName: validateData.login,
    };
    this.store.set('auth.userInfo', this.userInfo);
  }

  _startValidationTimer() {
    if (this._validateInterval) clearInterval(this._validateInterval);
    // Validate every hour as required by Twitch
    this._validateInterval = setInterval(() => this._validate(), 60 * 60 * 1000);
  }

  async init() {
    if (this.tokens?.access_token) {
      const valid = await this._validate();
      if (valid) {
        this._startValidationTimer();
      }
      return valid;
    }
    return false;
  }

  logout() {
    if (this._validateInterval) clearInterval(this._validateInterval);

    // Revoke token (best effort)
    if (this.tokens?.access_token) {
      fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          token: this.tokens.access_token,
        }),
      }).catch(() => {});
    }

    this.tokens = null;
    this.userInfo = null;
    this.store.delete('auth.tokens');
    this.store.delete('auth.userInfo');
  }

  async _waitForCallback(expectedState, authUrl) {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);

        // The implicit grant returns the token in the URL fragment (#access_token=...),
        // which browsers don't send to the server. So we serve a page that extracts
        // the fragment and sends it back as a query parameter.
        if (url.pathname === '/callback' && !url.searchParams.has('access_token')) {
          const error = url.searchParams.get('error');
          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<html><body style="background:#0e0e10;color:#ef4444;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
              <div><h1>Authentication Failed</h1><p>${error}</p><p>You can close this window.</p></div></body></html>`);
            server.close();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          // Serve a page that extracts the fragment and redirects
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<html><body style="background:#0e0e10;color:#adadb8;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
            <div>Completing login...</div>
            <script>
              var hash = window.location.hash.substring(1);
              if (hash) {
                window.location.replace('/callback?' + hash);
              }
            </script>
          </body></html>`);
          return;
        }

        // Second request: fragment values forwarded as query params
        if (url.pathname === '/callback' && url.searchParams.has('access_token')) {
          const accessToken = url.searchParams.get('access_token');
          const state = url.searchParams.get('state');

          if (state !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body>State mismatch.</body></html>');
            server.close();
            reject(new Error('OAuth state mismatch'));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<html><body style="background:#0e0e10;color:#22c55e;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
            <div style="text-align:center"><h1>Logged in to Chatty!</h1><p>You can close this window and return to the app.</p></div></body></html>`);
          server.close();
          resolve(accessToken);
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });

      server.listen(REDIRECT_PORT, () => {
        const { shell } = require('electron');
        shell.openExternal(authUrl);
      });

      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timed out'));
      }, 5 * 60 * 1000);
    });
  }
}

module.exports = { AuthManager };
