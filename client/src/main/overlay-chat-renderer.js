/**
 * OverlayChatRenderer — Resolves badges and emotes in the main process
 * so the chat overlay receives fully-rendered HTML with images.
 */
const https = require('https');
const http = require('http');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class OverlayChatRenderer {
  constructor(twitchAPI) {
    this.twitchAPI = twitchAPI;

    // Badge caches: "setId/version" -> { url, url2x, title }
    this._globalBadges = new Map();
    this._channelBadges = new Map(); // channelId -> Map

    // Third-party emote caches: word -> { url, url2x }
    this._bttvGlobal = new Map();
    this._bttvChannel = new Map(); // channelId -> Map
    this._ffzGlobal = new Map();
    this._ffzChannel = new Map();
    this._7tvGlobal = new Map();
    this._7tvChannel = new Map();

    this._globalBadgesLoaded = false;
    this._thirdPartyGlobalLoaded = false;
  }

  async loadGlobalBadges() {
    if (this._globalBadgesLoaded || !this.twitchAPI) return;
    try {
      const badges = await this.twitchAPI.getGlobalBadges();
      for (const badgeSet of badges) {
        for (const version of badgeSet.versions || []) {
          const key = `${badgeSet.set_id}/${version.id}`;
          this._globalBadges.set(key, {
            url: version.image_url_1x,
            url2x: version.image_url_2x,
            title: version.title || badgeSet.set_id,
          });
        }
      }
      this._globalBadgesLoaded = true;
    } catch (e) {
      console.error('Overlay: Failed to load global badges:', e.message);
    }
  }

  async loadChannelBadges(channelId) {
    if (this._channelBadges.has(channelId) || !this.twitchAPI) return;
    try {
      const badges = await this.twitchAPI.getChannelBadges(channelId);
      const map = new Map();
      for (const badgeSet of badges) {
        for (const version of badgeSet.versions || []) {
          const key = `${badgeSet.set_id}/${version.id}`;
          map.set(key, {
            url: version.image_url_1x,
            url2x: version.image_url_2x,
            title: version.title || badgeSet.set_id,
          });
        }
      }
      this._channelBadges.set(channelId, map);
    } catch (e) {
      console.error('Overlay: Failed to load channel badges:', e.message);
    }
  }

  async loadThirdPartyGlobal() {
    if (this._thirdPartyGlobalLoaded) return;
    await Promise.allSettled([
      this._loadBTTVGlobal(),
      this._loadFFZGlobal(),
      this._load7TVGlobal(),
    ]);
    this._thirdPartyGlobalLoaded = true;
  }

  async loadThirdPartyChannel(channelId) {
    if (this._bttvChannel.has(channelId)) return; // use as sentinel
    await Promise.allSettled([
      this._loadBTTVChannel(channelId),
      this._loadFFZChannel(channelId),
      this._load7TVChannel(channelId),
    ]);
  }

  // ── Badge resolution ──

  resolveBadges(badgeStr, channelId) {
    if (!badgeStr) return [];
    const result = [];
    for (const badge of badgeStr.split(',')) {
      const trimmed = badge.trim();
      if (!trimmed) continue;
      const channelMap = this._channelBadges.get(channelId);
      const info = channelMap?.get(trimmed) || this._globalBadges.get(trimmed);
      if (info) {
        result.push({ url: info.url, url2x: info.url2x, name: info.title });
      }
    }
    return result;
  }

  // ── Emote rendering ──

  renderMessage(text, emotesTag, channelId) {
    if (!text) return '';

    // Step 1: Render Twitch native emotes
    let html = this._renderTwitchEmotes(text, emotesTag);

    if (html) {
      html = this._applyThirdPartyEmotes(html, channelId);
      return html;
    }

    // No Twitch emotes — escape and apply third-party
    html = this._escapeHtml(text);
    html = this._applyThirdPartyEmotesToText(html, channelId);
    return html;
  }

  _renderTwitchEmotes(text, emotesTag) {
    if (!emotesTag || !text) return null;

    const emotePositions = [];
    for (const set of emotesTag.split('/')) {
      const [emoteId, positionsStr] = set.split(':');
      if (!emoteId || !positionsStr) continue;
      for (const pos of positionsStr.split(',')) {
        const [start, end] = pos.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          emotePositions.push({ emoteId, start, end: end + 1 });
        }
      }
    }

    if (emotePositions.length === 0) return null;

    emotePositions.sort((a, b) => b.start - a.start);
    const chars = [...text];
    const result = chars.map(c => this._escapeChar(c));

    for (const { emoteId, start, end } of emotePositions) {
      const emoteName = chars.slice(start, end).join('');
      const emoteHtml = `<img class="overlay-emote" src="https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/1.0" srcset="https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/2.0 2x" alt="${this._escapeAttr(emoteName)}" title="${this._escapeAttr(emoteName)}">`;
      result.splice(start, end - start, emoteHtml);
    }

    return result.join('');
  }

  _applyThirdPartyEmotes(html, channelId) {
    return html.replace(/(?:^|(?<=\s))([^\s<]+)(?=\s|$)/g, (match, word) => {
      const emote = this._getThirdPartyEmote(word, channelId);
      if (emote) {
        return `<img class="overlay-emote" src="${emote.url}" srcset="${emote.url2x} 2x" alt="${this._escapeAttr(word)}" title="${this._escapeAttr(word)}">`;
      }
      return match;
    });
  }

  _applyThirdPartyEmotesToText(html, channelId) {
    const words = html.split(/(\s+)/);
    return words.map(w => {
      if (/^\s+$/.test(w)) return w;
      const emote = this._getThirdPartyEmote(w, channelId);
      if (emote) {
        return `<img class="overlay-emote" src="${emote.url}" srcset="${emote.url2x} 2x" alt="${this._escapeAttr(w)}" title="${this._escapeAttr(w)}">`;
      }
      return w;
    }).join('');
  }

  _getThirdPartyEmote(word, channelId) {
    const stvCh = this._7tvChannel.get(channelId);
    if (stvCh?.has(word)) return stvCh.get(word);
    if (this._7tvGlobal.has(word)) return this._7tvGlobal.get(word);

    const bttvCh = this._bttvChannel.get(channelId);
    if (bttvCh?.has(word)) return bttvCh.get(word);
    if (this._bttvGlobal.has(word)) return this._bttvGlobal.get(word);

    const ffzCh = this._ffzChannel.get(channelId);
    if (ffzCh?.has(word)) return ffzCh.get(word);
    if (this._ffzGlobal.has(word)) return this._ffzGlobal.get(word);

    return null;
  }

  // ── Third-party loading ──

  async _loadBTTVGlobal() {
    try {
      const emotes = await fetchJSON('https://api.betterttv.net/3/cached/emotes/global');
      for (const e of emotes) {
        this._bttvGlobal.set(e.code, {
          url: `https://cdn.betterttv.net/emote/${e.id}/1x`,
          url2x: `https://cdn.betterttv.net/emote/${e.id}/2x`,
        });
      }
    } catch {}
  }

  async _loadBTTVChannel(channelId) {
    try {
      const data = await fetchJSON(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`);
      const map = new Map();
      for (const e of [...(data.channelEmotes || []), ...(data.sharedEmotes || [])]) {
        map.set(e.code, {
          url: `https://cdn.betterttv.net/emote/${e.id}/1x`,
          url2x: `https://cdn.betterttv.net/emote/${e.id}/2x`,
        });
      }
      this._bttvChannel.set(channelId, map);
    } catch {
      this._bttvChannel.set(channelId, new Map());
    }
  }

  async _loadFFZGlobal() {
    try {
      const data = await fetchJSON('https://api.frankerfacez.com/v1/set/global');
      for (const setId of Object.keys(data.sets || {})) {
        for (const e of data.sets[setId].emoticons || []) {
          const urls = e.urls || {};
          const u1 = (urls['1'] || urls['2'] || '').replace(/^\/\//, 'https://');
          const u2 = (urls['2'] || urls['1'] || '').replace(/^\/\//, 'https://');
          if (u1) this._ffzGlobal.set(e.name, { url: u1, url2x: u2 });
        }
      }
    } catch {}
  }

  async _loadFFZChannel(channelId) {
    try {
      const data = await fetchJSON(`https://api.frankerfacez.com/v1/room/id/${channelId}`);
      const map = new Map();
      for (const setId of Object.keys(data.sets || {})) {
        for (const e of data.sets[setId].emoticons || []) {
          const urls = e.urls || {};
          const u1 = (urls['1'] || urls['2'] || '').replace(/^\/\//, 'https://');
          const u2 = (urls['2'] || urls['1'] || '').replace(/^\/\//, 'https://');
          if (u1) map.set(e.name, { url: u1, url2x: u2 });
        }
      }
      this._ffzChannel.set(channelId, map);
    } catch {
      this._ffzChannel.set(channelId, new Map());
    }
  }

  async _load7TVGlobal() {
    try {
      const data = await fetchJSON('https://7tv.io/v3/emote-sets/global');
      for (const e of data.emotes || []) {
        const host = e.data?.host;
        if (!host?.url || !host?.files?.length) continue;
        const baseUrl = `https:${host.url}`;
        this._7tvGlobal.set(e.name, {
          url: `${baseUrl}/1x.webp`,
          url2x: `${baseUrl}/2x.webp`,
        });
      }
    } catch {}
  }

  async _load7TVChannel(channelId) {
    try {
      const data = await fetchJSON(`https://7tv.io/v3/users/twitch/${channelId}`);
      const map = new Map();
      const emoteSet = data.emote_set;
      if (emoteSet?.emotes) {
        for (const e of emoteSet.emotes) {
          const host = e.data?.host;
          if (!host?.url || !host?.files?.length) continue;
          const baseUrl = `https:${host.url}`;
          map.set(e.name, { url: `${baseUrl}/1x.webp`, url2x: `${baseUrl}/2x.webp` });
        }
      }
      this._7tvChannel.set(channelId, map);
    } catch {
      this._7tvChannel.set(channelId, new Map());
    }
  }

  // ── Utilities ──

  _escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _escapeChar(c) {
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    return c;
  }

  _escapeAttr(text) {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

module.exports = { OverlayChatRenderer };
