const WebSocket = require('ws');

const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';

class TwitchEventSub {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this._callbacks = [];
    this._keepaliveTimeout = null;
    this._keepaliveTimeoutMs = 0;
    this._reconnectTimeout = null;
    this._reconnectDelay = 1000;
    this._reconnectUrl = null;
    this._intentionalClose = false;
  }

  connect(url) {
    this._intentionalClose = false;

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }

    this.ws = new WebSocket(url || EVENTSUB_URL);

    this.ws.on('open', () => {
      this._reconnectDelay = 1000;
    });

    this.ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this._resetKeepaliveTimer();
      this._handleMessage(msg);
    });

    this.ws.on('close', () => {
      this._clearKeepaliveTimer();
      if (!this._intentionalClose) {
        this._scheduleReconnect();
      }
    });

    this.ws.on('error', () => {
      // error handler to prevent crash; close event handles reconnect
    });
  }

  disconnect() {
    this._intentionalClose = true;
    this._clearKeepaliveTimer();
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.sessionId = null;
  }

  getSessionId() {
    return this.sessionId;
  }

  onEvent(callback) {
    this._callbacks.push(callback);
    return () => {
      const idx = this._callbacks.indexOf(callback);
      if (idx !== -1) this._callbacks.splice(idx, 1);
    };
  }

  _emit(data) {
    for (const cb of this._callbacks) {
      try {
        cb(data);
      } catch {
        // prevent listener errors from breaking the client
      }
    }
  }

  _handleMessage(msg) {
    const type = msg.metadata?.message_type;

    switch (type) {
      case 'session_welcome': {
        const session = msg.payload?.session;
        this.sessionId = session?.id || null;
        this._keepaliveTimeoutMs = (session?.keepalive_timeout_seconds || 30) * 1000;
        this._resetKeepaliveTimer();
        this._emit({ type: 'connected', sessionId: this.sessionId });
        break;
      }

      case 'session_keepalive':
        // keepalive timer already reset on every message
        break;

      case 'notification': {
        const sub = msg.payload?.subscription;
        this._emit({
          type: sub?.type || 'unknown',
          event: msg.payload?.event || {},
          subscription: sub || {},
        });
        break;
      }

      case 'session_reconnect': {
        const reconnectUrl = msg.payload?.session?.reconnect_url;
        if (reconnectUrl) {
          this._reconnectUrl = reconnectUrl;
          // Open new connection before old one closes
          this.connect(reconnectUrl);
        }
        break;
      }

      case 'revocation': {
        const sub = msg.payload?.subscription;
        this._emit({
          type: 'revocation',
          event: {},
          subscription: sub || {},
        });
        break;
      }
    }
  }

  _resetKeepaliveTimer() {
    this._clearKeepaliveTimer();
    if (this._keepaliveTimeoutMs <= 0) return;
    // Twitch recommends assuming the connection is dead if no message
    // arrives within keepalive_timeout + a small buffer
    const buffer = 5000;
    this._keepaliveTimeout = setTimeout(() => {
      // Keepalive expired — force reconnect
      if (this.ws) {
        this.ws.removeAllListeners();
        this.ws.close();
        this.ws = null;
      }
      this._scheduleReconnect();
    }, this._keepaliveTimeoutMs + buffer);
  }

  _clearKeepaliveTimer() {
    if (this._keepaliveTimeout) {
      clearTimeout(this._keepaliveTimeout);
      this._keepaliveTimeout = null;
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    this._reconnectTimeout = setTimeout(() => {
      const url = this._reconnectUrl || EVENTSUB_URL;
      this._reconnectUrl = null;
      this.connect(url);
    }, this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
  }
}

module.exports = { TwitchEventSub };
