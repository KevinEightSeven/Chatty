const BASE = 'https://api.twitch.tv/helix';

class TwitchAPI {
  constructor(accessToken, clientId) {
    this._accessToken = accessToken;
    this._clientId = clientId;
  }

  setToken(token) {
    this._accessToken = token;
  }

  _headers() {
    return {
      Authorization: `Bearer ${this._accessToken}`,
      'Client-Id': this._clientId,
    };
  }

  async _get(path, params = {}) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), {headers: this._headers()});
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    return res.json();
  }

  async _post(path, params = {}, body = null) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, v);
      }
    }
    const opts = {
      method: 'POST',
      headers: {...this._headers(), 'Content-Type': 'application/json'},
    };
    if (body) {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url.toString(), opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    if (res.status === 204) {
      return {};
    }
    return res.json();
  }

  // ── Users ──

  async getUser(login) {
    try {
      const data = await this._get('/users', {login});
      return data.data?.[0] || null;
    } catch (err) {
      return {error: err.message};
    }
  }

  async getUserById(id) {
    try {
      const data = await this._get('/users', {id});
      return data.data?.[0] || null;
    } catch (err) {
      return {error: err.message};
    }
  }

  // ── Channel Info ──

  async getChannelInfo(broadcasterId) {
    try {
      const data = await this._get('/channels', {
        broadcaster_id: broadcasterId,
      });
      return data.data?.[0] || null;
    } catch (err) {
      return {error: err.message};
    }
  }

  // ── Streams ──

  async getStreamByUser(userLogin) {
    try {
      const data = await this._get('/streams', {
        user_login: userLogin,
        first: 1,
      });
      return data.data?.[0] || null;
    } catch (err) {
      return {error: err.message};
    }
  }

  async searchChannels(query, first = 20) {
    try {
      const data = await this._get('/search/channels', {
        query,
        first,
        live_only: true,
      });
      return {items: data.data || []};
    } catch (err) {
      return {error: err.message, items: []};
    }
  }

  // ── Badges ──

  async getGlobalBadges() {
    try {
      const data = await this._get('/chat/badges/global');
      return data.data || [];
    } catch (err) {
      return [];
    }
  }

  async getChannelBadges(broadcasterId) {
    try {
      const data = await this._get('/chat/badges', {
        broadcaster_id: broadcasterId,
      });
      return data.data || [];
    } catch (err) {
      return [];
    }
  }

  // ── Followers ──

  async getChannelFollower(broadcasterId, userId) {
    try {
      const data = await this._get('/channels/followers', {
        broadcaster_id: broadcasterId,
        user_id: userId,
      });
      return data.data?.[0] || null;
    } catch (err) {
      return {error: err.message};
    }
  }

  // ── Games ──

  async getGame(gameId) {
    try {
      const data = await this._get('/games', {id: gameId});
      return data.data?.[0] || null;
    } catch (err) {
      return {error: err.message};
    }
  }

  // ── Chat ──

  async sendChatMessage(broadcasterId, senderId, message) {
    try {
      const data = await this._post(
        '/chat/messages',
        {},
        {
          broadcaster_id: broadcasterId,
          sender_id: senderId,
          message,
        },
      );
      return {success: true, data};
    } catch (err) {
      return {error: err.message};
    }
  }
}

export default TwitchAPI;
