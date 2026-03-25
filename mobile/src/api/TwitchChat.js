const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';

class TwitchChat {
  constructor() {
    this.ws = null;
    this.channels = new Map();
    this.nick = null;
    this.token = null;
    this._pingInterval = null;
    this._pongTimeout = null;
    this._reconnectTimeout = null;
    this._reconnectDelay = 1000;
    this.connected = false;
    this.onStateChange = null;
    this.onRoomState = null;
    this._roomState = {};
  }

  connect(nick, oauthToken) {
    this.nick = nick.toLowerCase();
    this.token = oauthToken;

    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(IRC_URL);

    this.ws.onopen = () => {
      this.ws.send(`PASS oauth:${this.token}`);
      this.ws.send(`NICK ${this.nick}`);
      this.ws.send(
        'CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands',
      );
      this._reconnectDelay = 1000;
    };

    this.ws.onmessage = (event) => {
      const lines = event.data.split('\r\n').filter(Boolean);
      for (const line of lines) {
        this._handleLine(line);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      if (this.onStateChange) {
        this.onStateChange(false);
      }
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {};
  }

  disconnect() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
    }
    if (this._pongTimeout) {
      clearTimeout(this._pongTimeout);
    }
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
    }
    this.channels.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  join(channel) {
    const ch = channel.toLowerCase().replace('#', '');
    if (!this.channels.has(ch)) {
      this.channels.set(ch, {callbacks: []});
    }
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(`JOIN #${ch}`);
    }
  }

  part(channel) {
    const ch = channel.toLowerCase().replace('#', '');
    this.channels.delete(ch);
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(`PART #${ch}`);
    }
  }

  send(channel, message) {
    const ch = channel.toLowerCase().replace('#', '');
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(`PRIVMSG #${ch} :${message}`);
      return true;
    }
    return false;
  }

  onChannel(channel, callback) {
    const ch = channel.toLowerCase().replace('#', '');
    if (!this.channels.has(ch)) {
      this.channels.set(ch, {callbacks: []});
    }
    this.channels.get(ch).callbacks.push(callback);
  }

  offChannel(channel) {
    const ch = channel.toLowerCase().replace('#', '');
    this.channels.delete(ch);
  }

  _handleLine(line) {
    if (line === 'PING :tmi.twitch.tv') {
      this.ws.send('PONG :tmi.twitch.tv');
      return;
    }

    if (line.includes('376') || line.includes(':Welcome, GLHF!')) {
      this.connected = true;
      if (this.onStateChange) {
        this.onStateChange(true);
      }
      this._startPingKeepAlive();
      for (const ch of this.channels.keys()) {
        this.ws.send(`JOIN #${ch}`);
      }
      return;
    }

    if (line.includes('PONG')) {
      if (this._pongTimeout) {
        clearTimeout(this._pongTimeout);
        this._pongTimeout = null;
      }
      return;
    }

    if (line.includes('RECONNECT')) {
      this.ws.close();
      return;
    }

    const parsed = this._parse(line);
    if (!parsed) {
      return;
    }

    // Handle ROOMSTATE updates
    if (parsed.command === 'ROOMSTATE') {
      const channel = parsed.channel?.replace('#', '');
      if (channel) {
        const tags = parsed.tags;
        // ROOMSTATE can be partial (single tag update) or full (all tags on join)
        if (!this._roomState[channel]) {
          this._roomState[channel] = {};
        }
        if (tags['emote-only'] !== undefined) {
          this._roomState[channel].emoteOnly = tags['emote-only'] === '1';
        }
        if (tags['followers-only'] !== undefined) {
          this._roomState[channel].followersOnly = parseInt(tags['followers-only'], 10) >= 0;
        }
        if (tags['subs-only'] !== undefined) {
          this._roomState[channel].subsOnly = tags['subs-only'] === '1';
        }
        if (tags['slow'] !== undefined) {
          this._roomState[channel].slow = parseInt(tags['slow'], 10);
        }
        if (tags['r9k'] !== undefined) {
          this._roomState[channel].uniqueChat = tags['r9k'] === '1';
        }
        if (this.onRoomState) {
          this.onRoomState(channel, {...this._roomState[channel]});
        }
      }
      return;
    }

    const channel = parsed.channel?.replace('#', '');
    if (!channel) {
      return;
    }

    const entry = this.channels.get(channel);
    if (!entry) {
      return;
    }

    for (const cb of entry.callbacks) {
      cb(parsed);
    }
  }

  _parse(line) {
    let tags = {};
    let prefix = '';
    let command = '';
    let channel = '';
    let message = '';
    let idx = 0;

    if (line.startsWith('@')) {
      const spaceIdx = line.indexOf(' ');
      const tagStr = line.substring(1, spaceIdx);
      tags = this._parseTags(tagStr);
      idx = spaceIdx + 1;
    }

    if (line[idx] === ':') {
      const spaceIdx = line.indexOf(' ', idx);
      prefix = line.substring(idx + 1, spaceIdx);
      idx = spaceIdx + 1;
    }

    const rest = line.substring(idx);
    const parts = rest.split(' ');
    command = parts[0];

    if (parts[1]) {
      channel = parts[1];
    }

    const colonIdx = rest.indexOf(' :');
    if (colonIdx !== -1) {
      message = rest.substring(colonIdx + 2);
    }

    const username = prefix.split('!')[0] || '';

    return {tags, prefix, username, command, channel, message};
  }

  _parseTags(tagStr) {
    const tags = {};
    const pairs = tagStr.split(';');
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) {
        tags[pair] = '';
      } else {
        const key = pair.substring(0, eqIdx);
        const val = pair
          .substring(eqIdx + 1)
          .replace(/\\s/g, ' ')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\\\/g, '\\');
        tags[key] = val;
      }
    }
    return tags;
  }

  _startPingKeepAlive() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
    }
    if (this._pongTimeout) {
      clearTimeout(this._pongTimeout);
    }
    this._pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('PING :keepalive');
        this._pongTimeout = setTimeout(() => {
          console.warn('[TwitchChat] No PONG — forcing reconnect');
          if (this.ws) {
            this.ws.close();
          }
        }, 10000);
      }
    }, 60000);
  }

  _scheduleReconnect() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
    }
    if (this._pongTimeout) {
      clearTimeout(this._pongTimeout);
    }
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
    }
    this._reconnectTimeout = setTimeout(() => {
      if (this.nick && this.token) {
        this.connect(this.nick, this.token);
      }
    }, this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
  }
}

export default TwitchChat;
