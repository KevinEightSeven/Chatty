import AsyncStorage from '@react-native-async-storage/async-storage';
import {Linking} from 'react-native';

const AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';
const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
const REVOKE_URL = 'https://id.twitch.tv/oauth2/revoke';

const CLIENT_ID = 'wk9u3h3netoqji2tzmcm0i2zbz5e77';
// Twitch requires https:// redirect URIs — this page forwards the token to chattymobile:// scheme
const REDIRECT_URI = 'https://bravounit.com/chatty/auth';

const SCOPES = [
  'chat:read',
  'chat:edit',
  'user:read:chat',
  'user:write:chat',
  'moderator:read:chatters',
  'moderator:read:followers',
  'channel:read:subscriptions',
  'channel:manage:broadcast',
].join(' ');

class AuthManager {
  constructor() {
    this.accessToken = null;
    this.userInfo = null;
    this._validateInterval = null;
    this._resolveLogin = null;
  }

  getClientId() {
    return CLIENT_ID;
  }

  getAccessToken() {
    return this.accessToken;
  }

  async init() {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const userStr = await AsyncStorage.getItem('auth_user');
      if (token) {
        this.accessToken = token;
        this.userInfo = userStr ? JSON.parse(userStr) : null;
        const valid = await this._validate();
        if (valid) {
          this._startValidationTimer();
          return true;
        }
        // Token invalid, clear
        this.accessToken = null;
        this.userInfo = null;
        await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
      }
    } catch (err) {
      console.error('Auth init error:', err);
    }
    return false;
  }

  getLoginUrl() {
    const state =
      Math.random().toString(36).substring(2) + Date.now().toString(36);
    const params = new URLSearchParams({
      response_type: 'token',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      state,
      force_verify: 'true',
    });
    return {url: `${AUTH_URL}?${params}`, state};
  }

  async handleRedirect(url) {
    // URL format: chattymobile://auth#access_token=...&state=...
    const hashIdx = url.indexOf('#');
    if (hashIdx === -1) return false;

    const fragment = url.substring(hashIdx + 1);
    const params = new URLSearchParams(fragment);
    const token = params.get('access_token');

    if (!token) return false;

    this.accessToken = token;
    await AsyncStorage.setItem('auth_token', token);

    const valid = await this._validate();
    if (valid) {
      this._startValidationTimer();
      return true;
    }
    return false;
  }

  async _validate() {
    if (!this.accessToken) return false;
    try {
      const res = await fetch(VALIDATE_URL, {
        headers: {Authorization: `OAuth ${this.accessToken}`},
      });
      if (!res.ok) {
        await this.logout();
        return false;
      }
      const data = await res.json();
      this.userInfo = {
        login: data.login,
        userId: data.user_id,
        displayName: data.login,
      };
      await AsyncStorage.setItem('auth_user', JSON.stringify(this.userInfo));
      return true;
    } catch {
      return false;
    }
  }

  _startValidationTimer() {
    if (this._validateInterval) clearInterval(this._validateInterval);
    this._validateInterval = setInterval(() => this._validate(), 60 * 60 * 1000);
  }

  async logout() {
    if (this._validateInterval) clearInterval(this._validateInterval);
    if (this.accessToken) {
      fetch(REVOKE_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: `client_id=${CLIENT_ID}&token=${this.accessToken}`,
      }).catch(() => {});
    }
    this.accessToken = null;
    this.userInfo = null;
    await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
  }
}

export default AuthManager;
