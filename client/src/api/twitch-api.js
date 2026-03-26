const BASE = 'https://api.twitch.tv/helix';

class TwitchAPI {
  constructor(authManager) {
    this.auth = authManager;
  }

  _headers() {
    return {
      Authorization: `Bearer ${this.auth.getAccessToken()}`,
      'Client-Id': this.auth.getClientId(),
    };
  }

  async _get(path, params = {}) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    return res.json();
  }

  async _post(path, params = {}, body = null) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
    const opts = { method: 'POST', headers: { ...this._headers(), 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    if (res.status === 204) return {};
    return res.json();
  }

  async _patch(path, params = {}, body = null) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
    const opts = { method: 'PATCH', headers: { ...this._headers(), 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    if (res.status === 204) return {};
    return res.json();
  }

  async _put(path, params = {}, body = null) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
    const opts = { method: 'PUT', headers: { ...this._headers(), 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    if (res.status === 204) return {};
    return res.json();
  }

  async _delete(path, params = {}) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
    const res = await fetch(url, { method: 'DELETE', headers: this._headers() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    return {};
  }

  // ── Streams ──

  async getTopStreams(first = 20) {
    try {
      const data = await this._get('/streams', { first });
      return { items: data.data || [] };
    } catch (err) {
      return { error: err.message, items: [] };
    }
  }

  async searchChannels(query, first = 20) {
    try {
      const data = await this._get('/search/channels', { query, first, live_only: true });
      return { items: data.data || [] };
    } catch (err) {
      return { error: err.message, items: [] };
    }
  }

  async searchAllChannels(query, first = 10) {
    try {
      const data = await this._get('/search/channels', { query, first });
      return { items: data.data || [] };
    } catch (err) {
      return { error: err.message, items: [] };
    }
  }

  async searchCategories(query, first = 20) {
    try {
      const data = await this._get('/search/categories', { query, first });
      return { items: data.data || [] };
    } catch (err) {
      return { error: err.message, items: [] };
    }
  }

  async getStreamsByGame(gameId, first = 20) {
    try {
      const data = await this._get('/streams', { game_id: gameId, first });
      return { items: data.data || [] };
    } catch (err) {
      return { error: err.message, items: [] };
    }
  }

  async getStreamByUser(userLogin) {
    try {
      const data = await this._get('/streams', { user_login: userLogin, first: 1 });
      return data.data?.[0] || null;
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Users ──

  async getUser(login) {
    try {
      const data = await this._get('/users', { login });
      return data.data?.[0] || null;
    } catch (err) {
      return { error: err.message };
    }
  }

  async getUserById(id) {
    try {
      const data = await this._get('/users', { id });
      return data.data?.[0] || null;
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Channel Info ──

  async getChannelInfo(broadcasterId) {
    try {
      const data = await this._get('/channels', { broadcaster_id: broadcasterId });
      return data.data?.[0] || null;
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Chat ──

  async getChatters(broadcasterId, moderatorId, first = 1000) {
    try {
      const allChatters = [];
      let cursor = null;
      let total = 0;

      // Paginate through all chatters (up to 10 pages / ~10000 users)
      for (let page = 0; page < 10; page++) {
        const params = {
          broadcaster_id: broadcasterId,
          moderator_id: moderatorId,
          first: Math.min(first, 1000),
        };
        if (cursor) params.after = cursor;

        const data = await this._get('/chat/chatters', params);
        const chatters = data.data || [];
        total = data.total || total;
        allChatters.push(...chatters);

        cursor = data.pagination?.cursor;
        if (!cursor || chatters.length === 0) break;
      }

      return { chatters: allChatters, total };
    } catch (err) {
      return { error: err.message, chatters: [], total: 0 };
    }
  }

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
      const data = await this._get('/chat/badges', { broadcaster_id: broadcasterId });
      return data.data || [];
    } catch (err) {
      return [];
    }
  }

  // ── Send Chat Message (Helix API) ──

  async sendChatMessage(broadcasterId, senderId, message) {
    try {
      const data = await this._post('/chat/messages', {}, {
        broadcaster_id: broadcasterId,
        sender_id: senderId,
        message,
      });
      return { success: true, data };
    } catch (err) {
      return { error: err.message };
    }
  }

  async sendWhisper(fromUserId, toUserId, message) {
    try {
      await this._post('/whispers', { from_user_id: fromUserId, to_user_id: toUserId }, { message });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Moderators & VIPs ──

  async getModerators(broadcasterId, first = 100) {
    try {
      const data = await this._get('/moderation/moderators', { broadcaster_id: broadcasterId, first });
      return { items: data.data || [] };
    } catch (err) {
      return { error: err.message, items: [] };
    }
  }

  async getVIPs(broadcasterId, first = 100) {
    try {
      const data = await this._get('/channels/vips', { broadcaster_id: broadcasterId, first });
      return { items: data.data || [] };
    } catch (err) {
      return { error: err.message, items: [] };
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
      return { error: err.message };
    }
  }

  // ── Games / Categories ──

  async getGame(gameId) {
    try {
      const data = await this._get('/games', { id: gameId });
      return data.data?.[0] || null;
    } catch (err) {
      return { error: err.message };
    }
  }

  async getTopGames(first = 20) {
    try {
      const data = await this._get('/games/top', { first });
      return { items: data.data || [] };
    } catch (err) {
      return { error: err.message, items: [] };
    }
  }

  // ── EventSub ──

  async createEventSubSubscription(type, version, condition, sessionId) {
    try {
      const body = {
        type,
        version,
        condition,
        transport: {
          method: 'websocket',
          session_id: sessionId,
        },
      };
      const data = await this._post('/eventsub/subscriptions', {}, body);
      return data.data?.[0] || null;
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Moderation ──

  async deleteMessage(broadcasterId, moderatorId, messageId) {
    try {
      const params = {
        broadcaster_id: broadcasterId,
        moderator_id: moderatorId,
      };
      if (messageId) params.message_id = messageId;
      await this._delete('/moderation/chat', params);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  async banUser(broadcasterId, moderatorId, userId, reason = '', duration = 0) {
    try {
      const body = { data: { user_id: userId, reason } };
      if (duration > 0) body.data.duration = duration;
      await this._post('/moderation/bans', {
        broadcaster_id: broadcasterId,
        moderator_id: moderatorId,
      }, body);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  async warnUser(broadcasterId, moderatorId, userId, reason) {
    try {
      await this._post('/moderation/warnings', {
        broadcaster_id: broadcasterId,
        moderator_id: moderatorId,
      }, { data: { user_id: userId, reason } });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  async modifyChannelInfo(broadcasterId, data) {
    try {
      const url = new URL(`${BASE}/channels`);
      url.searchParams.set('broadcaster_id', broadcasterId);
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Announcements ──

  async sendAnnouncement(broadcasterId, moderatorId, message, color = 'primary') {
    try {
      await this._post('/chat/announcements', {
        broadcaster_id: broadcasterId,
        moderator_id: moderatorId,
      }, { message, color });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Unban ──

  async unbanUser(broadcasterId, moderatorId, userId) {
    try {
      await this._delete('/moderation/bans', {
        broadcaster_id: broadcasterId,
        moderator_id: moderatorId,
        user_id: userId,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Chat Settings ──

  async updateChatSettings(broadcasterId, moderatorId, settings) {
    try {
      await this._patch('/chat/settings', {
        broadcaster_id: broadcasterId,
        moderator_id: moderatorId,
      }, settings);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Moderator Management ──

  async addModerator(broadcasterId, userId) {
    try {
      await this._post('/moderation/moderators', {
        broadcaster_id: broadcasterId,
        user_id: userId,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  async removeModerator(broadcasterId, userId) {
    try {
      await this._delete('/moderation/moderators', {
        broadcaster_id: broadcasterId,
        user_id: userId,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── VIP Management ──

  async addVIP(broadcasterId, userId) {
    try {
      await this._post('/channels/vips', {
        broadcaster_id: broadcasterId,
        user_id: userId,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  async removeVIP(broadcasterId, userId) {
    try {
      await this._delete('/channels/vips', {
        broadcaster_id: broadcasterId,
        user_id: userId,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Raids ──

  async startRaid(fromBroadcasterId, toBroadcasterId) {
    try {
      await this._post('/raids', {
        from_broadcaster_id: fromBroadcasterId,
        to_broadcaster_id: toBroadcasterId,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  async cancelRaid(broadcasterId) {
    try {
      await this._delete('/raids', {
        broadcaster_id: broadcasterId,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Shoutouts ──

  async sendShoutout(fromBroadcasterId, toBroadcasterId, moderatorId) {
    try {
      await this._post('/chat/shoutouts', {
        from_broadcaster_id: fromBroadcasterId,
        to_broadcaster_id: toBroadcasterId,
        moderator_id: moderatorId,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Stream Markers ──

  async createStreamMarker(userId, description) {
    try {
      await this._post('/streams/markers', {}, {
        user_id: userId,
        description,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Shield Mode ──

  async updateShieldMode(broadcasterId, moderatorId, isActive) {
    try {
      await this._put('/moderation/shield_mode', {
        broadcaster_id: broadcasterId,
        moderator_id: moderatorId,
      }, { is_active: isActive });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── User Blocks ──

  async blockUser(targetUserId) {
    try {
      await this._put('/users/blocks', {
        target_user_id: targetUserId,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  async unblockUser(targetUserId) {
    try {
      await this._delete('/users/blocks', {
        target_user_id: targetUserId,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Chat Color ──

  async updateChatColor(userId, color) {
    try {
      await this._put('/chat/color', {
        user_id: userId,
        color,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Commercial ──

  async startCommercial(broadcasterId, length) {
    try {
      await this._post('/channels/commercial', {}, {
        broadcaster_id: broadcasterId,
        length,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Polls ──

  async getPolls(broadcasterId) {
    try {
      const data = await this._get('/polls', {
        broadcaster_id: broadcasterId,
        first: 1,
      });
      return { items: data.data || [] };
    } catch (err) {
      return { error: err.message, items: [] };
    }
  }

  async endPoll(broadcasterId, pollId, status) {
    try {
      await this._patch('/polls', {}, {
        broadcaster_id: broadcasterId,
        id: pollId,
        status,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }
  // ── Channel Point Rewards ──

  async createCustomReward(broadcasterId, title, cost, opts = {}) {
    try {
      const body = {
        title,
        cost,
        is_enabled: true,
        ...opts,
      };
      const data = await this._post('/channel_points/custom_rewards', { broadcaster_id: broadcasterId }, body);
      return data.data?.[0] || { error: 'No data returned' };
    } catch (err) {
      return { error: err.message };
    }
  }

  async updateCustomReward(broadcasterId, rewardId, updates) {
    try {
      const url = new URL(`${BASE}/channel_points/custom_rewards`);
      url.searchParams.set('broadcaster_id', broadcasterId);
      url.searchParams.set('id', rewardId);
      const res = await fetch(url.toString(), {
        method: 'PATCH',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      const data = await res.json();
      return data.data?.[0] || {};
    } catch (err) {
      return { error: err.message };
    }
  }

  async deleteCustomReward(broadcasterId, rewardId) {
    try {
      const url = new URL(`${BASE}/channel_points/custom_rewards`);
      url.searchParams.set('broadcaster_id', broadcasterId);
      url.searchParams.set('id', rewardId);
      const res = await fetch(url.toString(), {
        method: 'DELETE',
        headers: this._headers(),
      });
      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  async getCustomRewards(broadcasterId) {
    try {
      const data = await this._get('/channel_points/custom_rewards', { broadcaster_id: broadcasterId });
      return { items: data.data || [] };
    } catch (err) {
      return { error: err.message, items: [] };
    }
  }
}

module.exports = { TwitchAPI };
