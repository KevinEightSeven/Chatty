// EmoteBadgeManager — ported for React Native (no DOM, returns data only)

class EmoteBadgeManager {
  constructor(twitchAPI) {
    this.api = twitchAPI;
    this._globalBadges = new Map();
    this._channelBadges = new Map();
    this._bttvGlobal = new Map();
    this._bttvChannel = new Map();
    this._ffzGlobal = new Map();
    this._ffzChannel = new Map();
    this._7tvGlobal = new Map();
    this._7tvChannel = new Map();
    this._globalBadgesLoaded = false;
    this._bttvGlobalLoaded = false;
    this._ffzGlobalLoaded = false;
    this._7tvGlobalLoaded = false;
  }

  // ── Badges ──

  async loadGlobalBadges() {
    if (this._globalBadgesLoaded) return;
    try {
      const badges = await this.api.getGlobalBadges();
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
      const badges = await this.api.getChannelBadges(channelId);
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
    const channelMap = this._channelBadges.get(channelId);
    if (channelMap?.has(badgeStr)) return channelMap.get(badgeStr);
    if (this._globalBadges.has(badgeStr)) return this._globalBadges.get(badgeStr);
    return null;
  }

  getBadgeSegments(badgeStr, channelId) {
    if (!badgeStr) return [];
    const segments = [];
    for (const badge of badgeStr.split(',')) {
      const trimmed = badge.trim();
      if (!trimmed) continue;
      const info = this.getBadgeUrl(trimmed, channelId);
      if (info) {
        segments.push({type: 'badge', url: info.url2x || info.url, title: info.title});
      }
    }
    return segments;
  }

  // ── BTTV ──

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
      console.error('Failed to load BTTV global:', err);
    }
  }

  async loadBTTVChannel(channelId) {
    if (this._bttvChannel.has(channelId)) return;
    try {
      const res = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`);
      if (!res.ok) { this._bttvChannel.set(channelId, new Map()); return; }
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
      console.error('Failed to load BTTV channel:', err);
    }
  }

  // ── FFZ ──

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
          if (u1) this._ffzGlobal.set(e.name, {url: u1, url2x: u2});
        }
      }
      this._ffzGlobalLoaded = true;
    } catch (err) {
      console.error('Failed to load FFZ global:', err);
    }
  }

  async loadFFZChannel(channelId) {
    if (this._ffzChannel.has(channelId)) return;
    try {
      const res = await fetch(`https://api.frankerfacez.com/v1/room/id/${channelId}`);
      if (!res.ok) { this._ffzChannel.set(channelId, new Map()); return; }
      const data = await res.json();
      const map = new Map();
      for (const setId of Object.keys(data.sets || {})) {
        for (const e of data.sets[setId].emoticons || []) {
          const urls = e.urls || {};
          const u1 = this._ensureHttps(urls['1'] || urls['2'] || '');
          const u2 = this._ensureHttps(urls['2'] || urls['1'] || '');
          if (u1) map.set(e.name, {url: u1, url2x: u2});
        }
      }
      this._ffzChannel.set(channelId, map);
    } catch (err) {
      console.error('Failed to load FFZ channel:', err);
    }
  }

  // ── 7TV ──

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
      console.error('Failed to load 7TV global:', err);
    }
  }

  async load7TVChannel(channelId) {
    if (this._7tvChannel.has(channelId)) return;
    try {
      const res = await fetch(`https://7tv.io/v3/users/twitch/${channelId}`);
      if (!res.ok) { this._7tvChannel.set(channelId, new Map()); return; }
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
      console.error('Failed to load 7TV channel:', err);
    }
  }

  // ── Load all for a channel ──

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

  // ── Message → segments ──

  parseMessage(text, emotesTag, channelId) {
    if (!text) return [];

    // Step 1: Build Twitch emote positions
    const twitchEmotes = this._parseTwitchEmotePositions(text, emotesTag);

    // Step 2: Build segments from character positions
    const chars = [...text];
    const segments = [];
    let i = 0;

    // Sort emotes by start position
    twitchEmotes.sort((a, b) => a.start - b.start);

    for (const emote of twitchEmotes) {
      // Add text before this emote
      if (i < emote.start) {
        const textBefore = chars.slice(i, emote.start).join('');
        this._addTextSegments(segments, textBefore, channelId);
      }
      // Add the emote
      segments.push({
        type: 'emote',
        url: `https://static-cdn.jtvnw.net/emoticons/v2/${emote.emoteId}/default/dark/2.0`,
        name: chars.slice(emote.start, emote.end).join(''),
      });
      i = emote.end;
    }

    // Remaining text after last emote
    if (i < chars.length) {
      const remaining = chars.slice(i).join('');
      this._addTextSegments(segments, remaining, channelId);
    }

    return segments;
  }

  _parseTwitchEmotePositions(text, emotesTag) {
    if (!emotesTag) return [];
    const positions = [];
    const emoteSets = emotesTag.split('/');
    for (const set of emoteSets) {
      const [emoteId, positionsStr] = set.split(':');
      if (!emoteId || !positionsStr) continue;
      for (const pos of positionsStr.split(',')) {
        const [start, end] = pos.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          positions.push({emoteId, start, end: end + 1});
        }
      }
    }
    return positions;
  }

  _addTextSegments(segments, text, channelId) {
    const words = text.split(/(\s+)/);
    for (const word of words) {
      if (/^\s+$/.test(word)) {
        segments.push({type: 'text', content: word});
        continue;
      }
      if (!word) continue;

      // Check third-party emotes
      const emote = this._getThirdPartyEmote(word, channelId);
      if (emote) {
        segments.push({type: 'emote', url: emote.url2x || emote.url, name: word});
      } else if (word.startsWith('@')) {
        segments.push({type: 'mention', content: word});
      } else if (/^https?:\/\//.test(word)) {
        segments.push({type: 'link', url: word, content: word});
      } else {
        // Merge with previous text segment if possible
        const last = segments[segments.length - 1];
        if (last?.type === 'text') {
          last.content += word;
        } else {
          segments.push({type: 'text', content: word});
        }
      }
    }
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

  _ensureHttps(url) {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    return url;
  }
}

export default EmoteBadgeManager;
