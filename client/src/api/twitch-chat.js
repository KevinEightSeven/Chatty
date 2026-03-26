const WebSocket = require('ws');

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';

class TwitchChat {
  constructor() {
    this.ws = null;
    this.channels = new Map(); // channel -> { callbacks: [] }
    this.nick = null;
    this.token = null;
    this._pingInterval = null;
    this._pongTimeout = null;
    this._reconnectTimeout = null;
    this._reconnectDelay = 1000;
    this._lastMessageTime = 0;
    this._activityCheckInterval = null;
    this.connected = false;
    this.onStateChange = null; // callback(connected)
    this.onWhisper = null; // callback(parsed) — global whisper handler
  }

  connect(nick, oauthToken) {
    this.nick = nick.toLowerCase();
    this.token = oauthToken;

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }

    this.ws = new WebSocket(IRC_URL);

    this.ws.on('open', () => {
      this.ws.send(`PASS oauth:${this.token}`);
      this.ws.send(`NICK ${this.nick}`);
      this.ws.send('CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands');
      this._reconnectDelay = 1000;
    });

    this.ws.on('message', (raw) => {
      this._lastMessageTime = Date.now();
      const lines = raw.toString().split('\r\n').filter(Boolean);
      for (const line of lines) {
        this._handleLine(line);
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      if (this.onStateChange) this.onStateChange(false);
      this._stopKeepAlive();
      this._scheduleReconnect();
    });

    this.ws.on('error', () => {
      // error handler to prevent crash; close event handles reconnect
    });
  }

  disconnect() {
    this._stopKeepAlive();
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    this.channels.clear();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  join(channel) {
    const ch = channel.toLowerCase().replace('#', '');
    if (!this.channels.has(ch)) {
      this.channels.set(ch, { callbacks: [] });
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
      this.channels.set(ch, { callbacks: [] });
    }
    this.channels.get(ch).callbacks.push(callback);
  }

  offChannel(channel) {
    const ch = channel.toLowerCase().replace('#', '');
    this.channels.delete(ch);
  }

  _handleLine(line) {
    // PING from Twitch
    if (line === 'PING :tmi.twitch.tv') {
      this.ws.send('PONG :tmi.twitch.tv');
      return;
    }

    // Connected confirmation
    if (line.includes(' 376 ') || line.includes(':Welcome, GLHF!')) {
      this.connected = true;
      if (this.onStateChange) this.onStateChange(true);
      this._startKeepAlive();
      // Rejoin all channels
      for (const ch of this.channels.keys()) {
        this.ws.send(`JOIN #${ch}`);
      }
      return;
    }

    // PONG response to our PING — clear the pong timeout
    // Match specifically ":tmi.twitch.tv PONG" to avoid matching chat messages containing "PONG"
    if (line.includes(':tmi.twitch.tv PONG') || line.includes(':keepalive')) {
      if (this._pongTimeout) {
        clearTimeout(this._pongTimeout);
        this._pongTimeout = null;
      }
      return;
    }

    // RECONNECT
    if (line.includes('RECONNECT')) {
      this.ws.close();
      return;
    }

    // Login failure — token expired or invalid
    if (line.includes('Login authentication failed') || line.includes('Login unsuccessful')) {
      console.warn('[TwitchChat] Auth failed — token may have expired');
      this.connected = false;
      if (this.onStateChange) this.onStateChange(false);
      // Force reconnect which will use the current token
      this.ws.close();
      return;
    }

    // Parse IRC message
    const parsed = this._parse(line);
    if (!parsed) return;

    // Handle whispers globally (not channel-specific)
    if (parsed.command === 'WHISPER') {
      if (this.onWhisper) this.onWhisper(parsed);
      return;
    }

    const channel = parsed.channel?.replace('#', '');
    if (!channel) return;

    const entry = this.channels.get(channel);
    if (!entry) return;

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

    // Parse tags
    if (line.startsWith('@')) {
      const spaceIdx = line.indexOf(' ');
      const tagStr = line.substring(1, spaceIdx);
      tags = this._parseTags(tagStr);
      idx = spaceIdx + 1;
    }

    // Parse prefix
    if (line[idx] === ':') {
      const spaceIdx = line.indexOf(' ', idx);
      prefix = line.substring(idx + 1, spaceIdx);
      idx = spaceIdx + 1;
    }

    // Parse command
    const rest = line.substring(idx);
    const parts = rest.split(' ');
    command = parts[0];

    // Parse channel and message
    if (parts[1]) {
      channel = parts[1];
    }

    const colonIdx = rest.indexOf(' :');
    if (colonIdx !== -1) {
      message = rest.substring(colonIdx + 2);
    }

    // Extract username from prefix
    const username = prefix.split('!')[0] || '';

    return { tags, prefix, username, command, channel, message };
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
        const val = pair.substring(eqIdx + 1)
          .replace(/\\s/g, ' ')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\\\/g, '\\');
        tags[key] = val;
      }
    }
    return tags;
  }

  _startKeepAlive() {
    this._stopKeepAlive();
    this._lastMessageTime = Date.now();

    // Send PING every 30s (was 60s — faster detection of dead connections)
    this._pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('PING :keepalive');
        this._pongTimeout = setTimeout(() => {
          console.warn('[TwitchChat] No PONG received — forcing reconnect');
          if (this.ws) this.ws.close();
        }, 10000);
      }
    }, 30000);

    // Check for activity — if no data received in 90s, connection is probably dead
    this._activityCheckInterval = setInterval(() => {
      const elapsed = Date.now() - this._lastMessageTime;
      if (elapsed > 90000 && this.connected) {
        console.warn(`[TwitchChat] No data for ${Math.round(elapsed / 1000)}s — forcing reconnect`);
        if (this.ws) this.ws.close();
      }
    }, 30000);
  }

  _stopKeepAlive() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
    if (this._pongTimeout) {
      clearTimeout(this._pongTimeout);
      this._pongTimeout = null;
    }
    if (this._activityCheckInterval) {
      clearInterval(this._activityCheckInterval);
      this._activityCheckInterval = null;
    }
  }

  _scheduleReconnect() {
    this._stopKeepAlive();
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    this._reconnectTimeout = setTimeout(() => {
      if (this.nick && this.token) {
        this.connect(this.nick, this.token);
      }
    }, this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
  }
}

module.exports = { TwitchChat };
