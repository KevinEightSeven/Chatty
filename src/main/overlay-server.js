/**
 * Overlay Server — Local HTTP + WebSocket server for OBS browser sources.
 * Serves alert and chat overlay pages, pushes real-time events via WebSocket.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// ── Default alert templates ──
function defaultAlertHtml(icon, sublabel, typeName) {
  return `<div id="app">
  <div class="notif">
    <div class="notif-left">
      <div class="notif-name">${icon}</div>
      <div class="notif-subname">${sublabel}</div>
    </div>
    <div class="notif-right">
      <div class="notif-type">${typeName}</div>
      <div class="notif-text">{user}</div>
    </div>
  </div>
</div>`;
}

function defaultAlertCss(accent) {
  return `@import url(https://fonts.googleapis.com/css?family=Kanit:400,600italic);
body {
  width: 440px;
}

.container {
  position: absolute;
  bottom: 10px;
  left: 0px;
  height: 100px;
  width: 500px;
}

#app {
  margin: 20px auto;
  width: 440px;
  height: 60px;
  overflow: hidden;
  position: relative;
  box-sizing: border-box !important;
}
#app .notif {
  top: 60px;
  left: 190px;
  width: 440px;
  height: 60px;
  position: absolute;
  overflow: hidden;
  color: #fff;
  font-family: "Kanit", sans-serif;
  text-transform: uppercase;
  -webkit-animation-timing-function: cubic-bezier(0.81, 0.01, 0.19, 1);
          animation-timing-function: cubic-bezier(0.81, 0.01, 0.19, 1);
  -webkit-animation-name: showAlertMain, moveNotifLeft, moveNotifRight, hideAlertMain;
          animation-name: showAlertMain, moveNotifLeft, moveNotifRight, hideAlertMain;
  -webkit-animation-duration: 1s, 1s, 1s, 1s;
          animation-duration: 1s, 1s, 1s, 1s;
  -webkit-animation-iteration-count: 1;
          animation-iteration-count: 1;
  -webkit-animation-fill-mode: forwards;
          animation-fill-mode: forwards;
  -webkit-animation-delay: 0s, 1s, 6.5s, 7.5s;
          animation-delay: 0s, 1s, 6.5s, 7.5s;
}
#app .notif .notif-left {
  height: 60px;
  position: relative;
  float: left;
  background: ${accent};
  width: 60px;
  overflow: hidden;
  font-style: italic;
  box-sizing: border-box !important;
  border-left: 2px solid ${accent};
}
#app .notif .notif-left .notif-name,
#app .notif .notif-left .notif-subname {
  box-sizing: border-box !important;
  padding: 10px;
  height: 60px;
  width: 60px;
  text-align: center;
  position: absolute;
  background: #2b2f3c;
  line-height: 40px;
}
#app .notif .notif-left .notif-name {
  top: 0;
  left: 0;
  z-index: 10;
  font-size: 30px;
  -webkit-animation-name: showAlertLeftName, hideAlertLeftName;
          animation-name: showAlertLeftName, hideAlertLeftName;
  -webkit-animation-delay: 1s, 5.5s;
          animation-delay: 1s, 5.5s;
  -webkit-animation-duration: 1s;
          animation-duration: 1s;
  -webkit-animation-iteration-count: 1;
          animation-iteration-count: 1;
  -webkit-animation-fill-mode: forwards;
          animation-fill-mode: forwards;
}
#app .notif .notif-left .notif-subname {
  top: 60px;
  left: 0;
  z-index: 20;
  font-size: 20px;
  -webkit-animation-name: showAlertLeftSub, hideAlertLeftSub;
          animation-name: showAlertLeftSub, hideAlertLeftSub;
  -webkit-animation-delay: 1s, 5.5s;
          animation-delay: 1s, 5.5s;
  -webkit-animation-duration: 1s;
          animation-duration: 1s;
  -webkit-animation-iteration-count: 1;
          animation-iteration-count: 1;
  -webkit-animation-fill-mode: forwards;
          animation-fill-mode: forwards;
}
#app .notif .notif-right {
  float: left;
  left: -500px;
  height: 60px;
  background: ${accent};
  min-width: 380px;
  line-height: 40px;
  box-sizing: border-box !important;
  border-right: 2px solid ${accent};
  position: relative;
  overflow: hidden;
  -webkit-animation-name: moveMainRight, moveMainLeft;
          animation-name: moveMainRight, moveMainLeft;
  -webkit-animation-duration: 1s, 1s;
          animation-duration: 1s, 1s;
  -webkit-animation-iteration-count: 1;
          animation-iteration-count: 1;
  -webkit-animation-fill-mode: forwards;
          animation-fill-mode: forwards;
  -webkit-animation-delay: 1s, 6.5s;
          animation-delay: 1s, 6.5s;
  -webkit-animation-timing-function: cubic-bezier(0.81, 0.01, 0.19, 1);
          animation-timing-function: cubic-bezier(0.81, 0.01, 0.19, 1);
}
#app .notif .notif-right .notif-type,
#app .notif .notif-right .notif-text {
  box-sizing: border-box !important;
  padding: 10px;
  height: 60px;
  min-width: 380px;
  text-align: left;
  position: absolute;
  background: ${accent};
}
#app .notif .notif-right .notif-type {
  top: 0;
  left: 0;
  font-style: italic;
  font-size: 20px;
  -webkit-animation-name: showAlertRightType, hideAlertRightType;
          animation-name: showAlertRightType, hideAlertRightType;
  -webkit-animation-delay: 3s, 5.5s;
          animation-delay: 3s, 5.5s;
  -webkit-animation-duration: 1s;
          animation-duration: 1s;
  -webkit-animation-iteration-count: 1;
          animation-iteration-count: 1;
  -webkit-animation-fill-mode: forwards;
          animation-fill-mode: forwards;
}
#app .notif .notif-right .notif-text {
  top: 0;
  left: -500px;
  font-size: 20px;
  -webkit-animation-name: showAlertRightText, hideAlertRightText;
          animation-name: showAlertRightText, hideAlertRightText;
  -webkit-animation-delay: 3s, 5.5s;
          animation-delay: 3s, 5.5s;
  -webkit-animation-duration: 1s;
          animation-duration: 1s;
  -webkit-animation-iteration-count: 1;
          animation-iteration-count: 1;
  -webkit-animation-fill-mode: forwards;
          animation-fill-mode: forwards;
}

@-webkit-keyframes moveNotifLeft {
  0% { left: 190px; }
  100% { left: 0px; }
}
@keyframes moveNotifLeft {
  0% { left: 190px; }
  100% { left: 0px; }
}
@-webkit-keyframes moveNotifRight {
  0% { left: 0px; }
  100% { left: 190px; }
}
@keyframes moveNotifRight {
  0% { left: 0px; }
  100% { left: 190px; }
}
@-webkit-keyframes moveMainLeft {
  0% { left: 0px; }
  100% { left: -500px; }
}
@keyframes moveMainLeft {
  0% { left: 0px; }
  100% { left: -500px; }
}
@-webkit-keyframes moveMainRight {
  0% { left: -500px; }
  100% { left: 0px; }
}
@keyframes moveMainRight {
  0% { left: -500px; }
  100% { left: 0px; }
}
@-webkit-keyframes showAlertLeftSub {
  0% { top: 60px; }
  100% { top: 0px; }
}
@keyframes showAlertLeftSub {
  0% { top: 60px; }
  100% { top: 0px; }
}
@-webkit-keyframes hideAlertLeftSub {
  0% { top: 0px; }
  100% { top: 60px; }
}
@keyframes hideAlertLeftSub {
  0% { top: 0px; }
  100% { top: 60px; }
}
@-webkit-keyframes showAlertLeftName {
  0% { top: 0px; }
  100% { top: -60px; }
}
@keyframes showAlertLeftName {
  0% { top: 0px; }
  100% { top: -60px; }
}
@-webkit-keyframes hideAlertLeftName {
  0% { top: -60px; }
  100% { top: 0px; }
}
@keyframes hideAlertLeftName {
  0% { top: -60px; }
  100% { top: 0px; }
}
@-webkit-keyframes showAlertRightText {
  0% { left: -500px; }
  100% { left: 0px; }
}
@keyframes showAlertRightText {
  0% { left: -500px; }
  100% { left: 0px; }
}
@-webkit-keyframes hideAlertRightText {
  0% { left: 0px; }
  100% { left: -500px; }
}
@keyframes hideAlertRightText {
  0% { left: 0px; }
  100% { left: -500px; }
}
@-webkit-keyframes showAlertRightType {
  0% { left: 0px; }
  100% { left: 380px; }
}
@keyframes showAlertRightType {
  0% { left: 0px; }
  100% { left: 380px; }
}
@-webkit-keyframes hideAlertRightType {
  0% { left: 380px; }
  100% { left: 0px; }
}
@keyframes hideAlertRightType {
  0% { left: 380px; }
  100% { left: 0px; }
}
@-webkit-keyframes showAlertMain {
  0% { top: 60px; }
  100% { top: 0px; }
}
@keyframes showAlertMain {
  0% { top: 60px; }
  100% { top: 0px; }
}
@-webkit-keyframes hideAlertMain {
  0% { top: 0px; }
  100% { top: 60px; }
}
@keyframes hideAlertMain {
  0% { top: 0px; }
  100% { top: 60px; }
}`;
}

const DEFAULT_TEMPLATES = {
  follow: {
    html: defaultAlertHtml('+1', 'new', 'follower'),
    css: defaultAlertCss('#e8bf49'),
    js: '',
  },
  subscribe: {
    html: defaultAlertHtml('+1', 'new', 'subscriber'),
    css: defaultAlertCss('#9146ff'),
    js: '',
  },
  cheer: {
    html: defaultAlertHtml('{amount}', 'new', 'cheer'),
    css: defaultAlertCss('#00b4d8'),
    js: '',
  },
  raid: {
    html: defaultAlertHtml('{viewers}', 'new', 'raid'),
    css: defaultAlertCss('#ef4444'),
    js: '',
  },
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

    // Ensure scenes exist (migrate from old flat config if needed)
    this._ensureScenes();

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

    const alertPageMatch = pathname.match(/^\/(alerts)(\d*)$/);
    const chatPageMatch = pathname.match(/^\/(chat)(\d*)$/);
    const configAlertMatch = pathname.match(/^\/config\/(alerts)(\d*)$/);
    const configChatMatch = pathname.match(/^\/config\/(chat)(\d*)$/);

    if (pathname === '/') {
      this._serveFile(res, path.join(__dirname, '..', 'overlay', 'alerts.html'), 'text/html');
    } else if (alertPageMatch) {
      this._serveFile(res, path.join(__dirname, '..', 'overlay', 'alerts.html'), 'text/html');
    } else if (chatPageMatch) {
      this._serveFile(res, path.join(__dirname, '..', 'overlay', 'chat.html'), 'text/html');
    } else if (configAlertMatch) {
      const sceneIdx = configAlertMatch[2] ? parseInt(configAlertMatch[2]) - 1 : 0;
      this._serveJSON(res, this._getSceneAlertConfig(Math.max(0, sceneIdx)));
    } else if (configChatMatch) {
      const sceneIdx = configChatMatch[2] ? parseInt(configChatMatch[2]) - 1 : 0;
      this._serveJSON(res, this._getSceneChatConfig(Math.max(0, sceneIdx)));
    } else if (pathname.startsWith('/assets/')) {
      const filename = path.basename(pathname);
      const filePath = path.join(this.assetsDir, filename);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
          '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
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

  _ensureScenes() {
    let scenes = this.store.get('overlay.scenes');
    if (scenes && scenes.length > 0) return scenes;

    // Migrate from old flat config to scenes
    const types = ['follow', 'subscribe', 'cheer', 'raid'];
    const alerts = {};
    for (const type of types) {
      const val = this.store.get(`overlay.alerts.${type}`);
      if (val) alerts[type] = val;
    }
    alerts.position = this.store.get('overlay.alerts.position') || null;
    alerts.delay = this.store.get('overlay.alerts.delay') ?? 3;

    const chat = {
      enabled: this.store.get('overlay.chat.enabled') ?? true,
      showBadges: this.store.get('overlay.chat.showBadges') ?? true,
      showTimestamps: this.store.get('overlay.chat.showTimestamps') ?? false,
      fontSize: this.store.get('overlay.chat.fontSize') || 16,
      maxMessages: this.store.get('overlay.chat.maxMessages') || 6,
      fadeOut: this.store.get('overlay.chat.fadeOut') ?? true,
      fadeDelay: this.store.get('overlay.chat.fadeDelay') || 30,
      animation: this.store.get('overlay.chat.animation') || 'slideIn',
      position: this.store.get('overlay.chat.position') || null,
      css: this.store.get('overlay.chat.css') || '',
    };

    scenes = [{ name: 'Default', alerts, chat }];
    this.store.set('overlay.scenes', scenes);
    return scenes;
  }

  _getSceneAlertConfig(sceneIdx) {
    const scenes = this._ensureScenes();
    const scene = scenes[sceneIdx] || scenes[0] || {};
    const alerts = scene.alerts || {};

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
        // Fill in default template when user hasn't customized HTML
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

  _getSceneChatConfig(sceneIdx) {
    const scenes = this._ensureScenes();
    const scene = scenes[sceneIdx] || scenes[0] || {};
    const chat = scene.chat || {};

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
