/**
 * Overlay Server — Local HTTP + WebSocket server for OBS browser sources.
 * Serves alert and chat overlay pages, pushes real-time events via WebSocket.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// ── Default alert templates (simple text mode — no custom HTML) ──

const DEFAULT_TEMPLATES = {
  follow:    { html: '', css: '', js: '' },
  subscribe: { html: '', css: '', js: '' },
  cheer:     { html: '', css: '', js: '' },
  raid:      { html: '', css: '', js: '' },
};

class OverlayServer {
  constructor(store, userDataPath) {
    this.store = store;
    this.userDataPath = userDataPath;
    this.server = null;
    this.wss = null;
    this.port = 7878;
    this.clients = new Set();

    // Ensure overlay assets directory exists
    this.assetsDir = path.join(userDataPath, 'overlay-assets');
    if (!fs.existsSync(this.assetsDir)) fs.mkdirSync(this.assetsDir, { recursive: true });
  }

  start(port) {
    if (this.server) return;
    this.port = port || this.store.get('overlay.port') || 7878;

    // Migrate from scenes to flat config if needed
    this._migrateFromScenes();

    this.server = http.createServer((req, res) => this._handleRequest(req, res));
    this.wss = new WebSocket.Server({ server: this.server });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`Overlay server running on http://127.0.0.1:${this.port}`);
    });

    this.server.on('error', (err) => {
      console.error('Overlay server error:', err.message);
    });
  }

  stop() {
    if (this.wss) {
      for (const client of this.clients) {
        try { client.close(); } catch {}
      }
      this.clients.clear();
      this.wss.close();
      this.wss = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  isRunning() {
    return !!this.server;
  }

  getPort() {
    return this.port;
  }

  // Push an alert event to all connected overlay clients
  pushAlert(alertData) {
    this._broadcast({ type: 'alert', data: alertData });
  }

  // Push a chat message to all connected overlay clients
  pushChat(chatData) {
    this._broadcast({ type: 'chat', data: chatData });
  }

  // Notify overlays to reload their config
  pushConfigReload() {
    this._broadcast({ type: 'config-reload' });
  }

  // Push a trigger (sound/video) to all connected overlay clients
  pushTrigger(trigger) {
    this._broadcast({ type: 'trigger', data: trigger });
  }

  // Push a test alert for preview — supports variant overrides
  pushTestAlert(alertType, overrides) {
    const testData = {
      follow: { eventType: 'follow', user: 'TestUser', message: '' },
      subscribe: { eventType: 'channel.subscribe', user: 'TestUser', tier: '1', message: 'Great stream!', is_gift: false, months: 1 },
      resub: { eventType: 'channel.subscription.message', user: 'TestUser', tier: '1', message: 'Love this stream!', months: 24, is_gift: false },
      cheer: { eventType: 'channel.cheer', user: 'TestUser', amount: 500, message: 'Take my bits!' },
      raid: { eventType: 'channel.raid', user: 'TestUser', viewers: 42 },
    };
    const data = { ...(testData[alertType] || testData.follow), ...overrides };
    this.pushAlert(data);
  }

  _broadcast(msg) {
    const json = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(json); } catch {}
      }
    }
  }

  _handleRequest(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${this.port}`);
    const pathname = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/' || pathname === '/alerts') {
      this._serveFile(res, path.join(__dirname, '..', 'overlay', 'alerts.html'), 'text/html');
    } else if (pathname === '/triggers') {
      this._serveFile(res, path.join(__dirname, '..', 'overlay', 'triggers.html'), 'text/html');
    } else if (pathname === '/chat') {
      this._serveFile(res, path.join(__dirname, '..', 'overlay', 'chat.html'), 'text/html');
    } else if (pathname === '/config/alerts') {
      this._serveJSON(res, this._getAlertConfig());
    } else if (pathname === '/config/chat') {
      this._serveJSON(res, this._getChatConfig());
    } else if (pathname.startsWith('/assets/')) {
      const filename = path.basename(pathname);
      const filePath = path.join(this.assetsDir, filename);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
          '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
          '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
        };
        this._serveFile(res, filePath, mimeTypes[ext] || 'application/octet-stream');
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }

  _serveFile(res, filePath, contentType) {
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch {
      res.writeHead(500);
      res.end('Internal server error');
    }
  }

  _serveJSON(res, data) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  // One-time migration: move scenes[0] data to flat overlay.alerts / overlay.chat keys
  _migrateFromScenes() {
    try {
      const scenes = this.store.get('overlay.scenes');
      if (!scenes || scenes.length === 0) return;

      // Already migrated
      if (this.store.get('overlay._migratedFlatConfig')) return;

      const scene = scenes[0] || {};
      if (scene.alerts) {
        this.store.set('overlay.alerts', scene.alerts);
      }
      if (scene.chat) {
        this.store.set('overlay.chat', scene.chat);
      }
      this.store.delete('overlay.scenes');
      this.store.set('overlay._migratedFlatConfig', true);
    } catch (err) {
      console.error('Scene migration error:', err);
    }
  }

  _getAlertConfig() {
    const alerts = this.store.get('overlay.alerts') || {};

    const types = ['follow', 'subscribe', 'cheer', 'raid'];
    const defaultTexts = {
      follow: '{user} just followed!',
      subscribe: '{user} just subscribed!',
      cheer: '{user} cheered {amount} bits!',
      raid: '{user} is raiding with {viewers} viewers!',
    };
    const result = {};
    for (const type of types) {
      const t = DEFAULT_TEMPLATES[type];
      if (alerts[type]) {
        result[type] = { ...alerts[type] };
        if (!result[type].html) {
          result[type].html = t.html;
          result[type].css = result[type].css || t.css;
          result[type].js = result[type].js || t.js;
        }
        if (!result[type].css) result[type].css = t.css;
      } else {
        result[type] = {
          enabled: true, image: '', sound: '', text: defaultTexts[type],
          duration: 8, animation: 'fadeIn', fontSize: 32, fontColor: '#ffffff', layout: 'below',
          html: t.html, css: t.css, js: t.js,
        };
      }
    }
    result.position = alerts.position || { x: 50, y: 20, width: 20, height: 15 };
    result.delay = alerts.delay ?? 3;
    result.globalCss = '';
    return result;
  }

  _getChatConfig() {
    const chat = this.store.get('overlay.chat') || {};

    return {
      enabled: chat.enabled ?? true,
      showBadges: chat.showBadges ?? true,
      showTimestamps: chat.showTimestamps ?? false,
      fontSize: chat.fontSize || 16,
      maxMessages: chat.maxMessages || 6,
      fadeOut: chat.fadeOut ?? true,
      fadeDelay: chat.fadeDelay || 30,
      animation: chat.animation || 'slideIn',
      position: chat.position || { x: 2, y: 60, width: 25, height: 35 },
      css: chat.css || '',
    };
  }

  // Save an uploaded image file, return the filename
  saveAsset(filename, buffer) {
    const safeName = Date.now() + '-' + filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(this.assetsDir, safeName);
    fs.writeFileSync(filePath, buffer);
    return safeName;
  }

  deleteAsset(filename) {
    const filePath = path.join(this.assetsDir, path.basename(filename));
    try { fs.unlinkSync(filePath); } catch {}
  }
}

module.exports = { OverlayServer };
