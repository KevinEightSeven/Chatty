/**
 * EmoteBadgeManager — Manages Twitch, BTTV, and FFZ emotes + Twitch badge images.
 * Fetches and caches emote/badge data per channel, provides rendering helpers.
 */
class EmoteBadgeManager {
  constructor() {
    // Badge caches: setId/version -> image URL
    this._globalBadges = new Map();
    this._channelBadges = new Map(); // channelId -> Map(setId/version -> url)

    // BTTV/FFZ/7TV emote caches: word -> { url, url2x }
    this._bttvGlobal = new Map();
    this._bttvChannel = new Map(); // channelId -> Map(word -> url)
    this._ffzGlobal = new Map();
    this._ffzChannel = new Map(); // channelId -> Map(word -> url)
    this._7tvGlobal = new Map();
    this._7tvChannel = new Map(); // channelId -> Map(word -> url)

    this._globalBadgesLoaded = false;
    this._bttvGlobalLoaded = false;
    this._ffzGlobalLoaded = false;
    this._7tvGlobalLoaded = false;
  }

  // ── Badge Methods ──

  async loadGlobalBadges() {
    if (this._globalBadgesLoaded) return;
    try {
      const badges = await window.chatty.getGlobalBadges();
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
    } catch (err) {
      console.error('Failed to load global badges:', err);
    }
  }

  async loadChannelBadges(channelId) {
    if (this._channelBadges.has(channelId)) return;
    try {
      const badges = await window.chatty.getChannelBadges(channelId);
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
    } catch (err) {
      console.error('Failed to load channel badges:', err);
    }
  }

  getBadgeUrl(badgeStr, channelId) {
    // badgeStr is "set_id/version"
    const channelMap = this._channelBadges.get(channelId);
    if (channelMap?.has(badgeStr)) return channelMap.get(badgeStr);
    if (this._globalBadges.has(badgeStr)) return this._globalBadges.get(badgeStr);
    return null;
  }

  renderBadges(badgeStr, channelId) {
    if (!badgeStr) return '';
    let html = '';
    for (const badge of badgeStr.split(',')) {
      const trimmed = badge.trim();
      if (!trimmed) continue;
      const info = this.getBadgeUrl(trimmed, channelId);
      if (info) {
        html += `<img class="chat-badge" src="${info.url}" srcset="${info.url2x} 2x" alt="${info.title}" title="${info.title}">`;
      } else {
        // Fallback: show text badge
        const [name] = trimmed.split('/');
        html += `<span class="chat-badge chat-badge-text" title="${name}">${name}</span>`;
      }
    }
    return html;
  }

  // ── Twitch Emote Rendering ──

  renderTwitchEmotes(text, emotesTag) {
    // emotesTag format: "emote_id:start-end,start-end/emote_id:start-end"
    if (!emotesTag || !text) return null;

    const emotePositions = [];
    const emoteSets = emotesTag.split('/');
    for (const set of emoteSets) {
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

    // Sort by position descending so we can replace from end to start
    emotePositions.sort((a, b) => b.start - a.start);

    // Convert text to array of characters (handles unicode)
    const chars = [...text];
    let result = chars.map((c) => this._escapeChar(c));

    for (const { emoteId, start, end } of emotePositions) {
      const emoteName = chars.slice(start, end).join('');
      const emoteHtml = `<img class="chat-emote" src="https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/1.0" srcset="https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/2.0 2x" alt="${this._escapeAttr(emoteName)}" title="${this._escapeAttr(emoteName)}">`;
      result.splice(start, end - start, emoteHtml);
    }

    return result.join('');
  }

  // ── BTTV Emotes ──

  async loadBTTVGlobal() {
    if (this._bttvGlobalLoaded) return;
    try {
      const res = await fetch('https://api.betterttv.net/3/cached/emotes/global');
      if (!res.ok) return;
      const emotes = await res.json();
      for (const e of emotes) {
        this._bttvGlobal.set(e.code, {
          url: `https://cdn.betterttv.net/emote/${e.id}/1x`,
          url2x: `https://cdn.betterttv.net/emote/${e.id}/2x`,
        });
      }
      this._bttvGlobalLoaded = true;
    } catch (err) {
      console.error('Failed to load BTTV global emotes:', err);
    }
  }

  async loadBTTVChannel(channelId) {
    if (this._bttvChannel.has(channelId)) return;
    try {
      const res = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`);
      if (!res.ok) {
        this._bttvChannel.set(channelId, new Map());
        return;
      }
      const data = await res.json();
      const map = new Map();
      const allEmotes = [...(data.channelEmotes || []), ...(data.sharedEmotes || [])];
      for (const e of allEmotes) {
        map.set(e.code, {
          url: `https://cdn.betterttv.net/emote/${e.id}/1x`,
          url2x: `https://cdn.betterttv.net/emote/${e.id}/2x`,
        });
      }
      this._bttvChannel.set(channelId, map);
    } catch (err) {
      console.error('Failed to load BTTV channel emotes:', err);
    }
  }

  // ── FFZ Emotes ──

  async loadFFZGlobal() {
    if (this._ffzGlobalLoaded) return;
    try {
      const res = await fetch('https://api.frankerfacez.com/v1/set/global');
      if (!res.ok) return;
      const data = await res.json();
      for (const setId of Object.keys(data.sets || {})) {
        for (const e of data.sets[setId].emoticons || []) {
          const urls = e.urls || {};
          const u1 = this._ensureHttps(urls['1'] || urls['2'] || '');
          const u2 = this._ensureHttps(urls['2'] || urls['1'] || '');
          if (u1) this._ffzGlobal.set(e.name, { url: u1, url2x: u2 });
        }
      }
      this._ffzGlobalLoaded = true;
    } catch (err) {
      console.error('Failed to load FFZ global emotes:', err);
    }
  }

  async loadFFZChannel(channelId) {
    if (this._ffzChannel.has(channelId)) return;
    try {
      const res = await fetch(`https://api.frankerfacez.com/v1/room/id/${channelId}`);
      if (!res.ok) {
        this._ffzChannel.set(channelId, new Map());
        return;
      }
      const data = await res.json();
      const map = new Map();
      for (const setId of Object.keys(data.sets || {})) {
        for (const e of data.sets[setId].emoticons || []) {
          const urls = e.urls || {};
          const u1 = this._ensureHttps(urls['1'] || urls['2'] || '');
          const u2 = this._ensureHttps(urls['2'] || urls['1'] || '');
          if (u1) map.set(e.name, { url: u1, url2x: u2 });
        }
      }
      this._ffzChannel.set(channelId, map);
    } catch (err) {
      console.error('Failed to load FFZ channel emotes:', err);
    }
  }

  // ── 7TV Emotes ──

  async load7TVGlobal() {
    if (this._7tvGlobalLoaded) return;
    try {
      const res = await fetch('https://7tv.io/v3/emote-sets/global');
      if (!res.ok) return;
      const data = await res.json();
      for (const e of data.emotes || []) {
        const host = e.data?.host;
        if (!host?.url || !host?.files?.length) continue;
        const baseUrl = `https:${host.url}`;
        this._7tvGlobal.set(e.name, {
          url: `${baseUrl}/1x.webp`,
          url2x: `${baseUrl}/2x.webp`,
        });
      }
      this._7tvGlobalLoaded = true;
    } catch (err) {
      console.error('Failed to load 7TV global emotes:', err);
    }
  }

  async load7TVChannel(channelId) {
    if (this._7tvChannel.has(channelId)) return;
    try {
      const res = await fetch(`https://7tv.io/v3/users/twitch/${channelId}`);
      if (!res.ok) {
        this._7tvChannel.set(channelId, new Map());
        return;
      }
      const data = await res.json();
      const map = new Map();
      const emoteSet = data.emote_set;
      if (emoteSet?.emotes) {
        for (const e of emoteSet.emotes) {
          const host = e.data?.host;
          if (!host?.url || !host?.files?.length) continue;
          const baseUrl = `https:${host.url}`;
          map.set(e.name, {
            url: `${baseUrl}/1x.webp`,
            url2x: `${baseUrl}/2x.webp`,
          });
        }
      }
      this._7tvChannel.set(channelId, map);
    } catch (err) {
      console.error('Failed to load 7TV channel emotes:', err);
    }
  }

  // ── Combined emote + mention rendering ──

  renderMessage(text, emotesTag, channelId) {
    if (!text) return '';

    // Step 1: Try to render Twitch native emotes first
    let html = this.renderTwitchEmotes(text, emotesTag);

    if (html) {
      // Twitch emotes already rendered, now apply BTTV/FFZ/links/mentions to non-emote text parts
      html = this._applyThirdPartyEmotes(html, channelId);
      html = this._applyLinks(html);
      html = this._applyMentions(html);
      return html;
    }

    // No Twitch emotes — escape and apply BTTV/FFZ/links/mentions
    html = this._escapeHtml(text);
    html = this._applyThirdPartyEmotesToText(html, channelId);
    html = this._applyLinks(html);
    html = this._applyMentions(html);
    return html;
  }

  _applyThirdPartyEmotes(html, channelId) {
    // Replace words in non-HTML-tag portions with BTTV/FFZ emotes
    // Split on existing img tags to avoid replacing inside them
    return html.replace(/(?:^|(?<=\s))([^\s<]+)(?=\s|$)/g, (match, word) => {
      const emote = this._getThirdPartyEmote(word, channelId);
      if (emote) {
        return `<img class="chat-emote" src="${emote.url}" srcset="${emote.url2x} 2x" alt="${this._escapeAttr(word)}" title="${this._escapeAttr(word)}">`;
      }
      return match;
    });
  }

  _applyThirdPartyEmotesToText(html, channelId) {
    // For escaped text (no img tags), replace words with emote images
    const words = html.split(/(\s+)/);
    return words.map((w) => {
      if (/^\s+$/.test(w)) return w;
      const emote = this._getThirdPartyEmote(w, channelId);
      if (emote) {
        return `<img class="chat-emote" src="${emote.url}" srcset="${emote.url2x} 2x" alt="${this._escapeAttr(w)}" title="${this._escapeAttr(w)}">`;
      }
      return w;
    }).join('');
  }

  _getThirdPartyEmote(word, channelId) {
    // Check channel-specific first, then global (7TV > BTTV > FFZ priority)
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

  _applyLinks(html) {
    // Split on HTML tags to avoid replacing URLs inside tag attributes (src, srcset, etc.)
    const parts = html.split(/(<[^>]+>)/);
    return parts.map((part) => {
      if (part.startsWith('<')) return part; // HTML tag — leave untouched
      return part.replace(/(https?:\/\/[^\s<>"']+)/g, '<a class="chat-link" href="$1" title="$1">$1</a>');
    }).join('');
  }

  _applyMentions(html) {
    return html.replace(/@(\w+)/g, '<span class="chat-mention">@$1</span>');
  }

  // ── Load all emotes/badges for a channel ──

  async loadChannel(channelId) {
    await Promise.all([
      this.loadGlobalBadges(),
      this.loadChannelBadges(channelId),
      this.loadBTTVGlobal(),
      this.loadBTTVChannel(channelId),
      this.loadFFZGlobal(),
      this.loadFFZChannel(channelId),
      this.load7TVGlobal(),
      this.load7TVChannel(channelId),
    ]);
  }

  // ── Utility ──

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _escapeAttr(text) {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _ensureHttps(url) {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    return url;
  }

  _escapeChar(c) {
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '"') return '&quot;';
    return c;
  }
}

// Singleton
const emoteBadgeManager = new EmoteBadgeManager();
