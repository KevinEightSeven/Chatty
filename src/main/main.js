const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { AuthManager } = require('../auth/auth-manager');
const { TwitchAPI } = require('../api/twitch-api');
const { TwitchChat } = require('../api/twitch-chat');
const { TwitchEventSub } = require('../api/twitch-eventsub');
const { checkForUpdates } = require('./auto-updater');
const Store = require('electron-store').default;

const store = new Store({
  name: 'chatty-config',
  defaults: {
    windowBounds: { width: 1200, height: 800 },
    tabs: [],
    theme: 'dark',
  },
});

// Chat logs directory
const logsDir = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

let mainWindow = null;
let authManager = null;
let twitchAPI = null;
let twitchChat = null;
let eventSub = null;
const profileCards = new Map(); // username → BrowserWindow

function createMainWindow() {
  const { width, height } = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 600,
    minHeight: 400,
    title: 'Chatty',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    backgroundColor: '#18181b',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('resize', () => {
    const [w, h] = mainWindow.getSize();
    store.set('windowBounds', { width: w, height: h });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// Helper: fetch and store user profile image
async function fetchUserProfile() {
  if (!twitchAPI || !authManager.userInfo) return;
  const profile = await twitchAPI.getUser(authManager.userInfo.login);
  if (profile && profile.profile_image_url) {
    authManager.userInfo.profileImageUrl = profile.profile_image_url;
    authManager.userInfo.displayName = profile.display_name || authManager.userInfo.login;
    authManager.store.set('auth.userInfo', authManager.userInfo);
  }
}

// ── IPC Handlers ──

// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());

// Auth
ipcMain.handle('auth:get-status', async () => {
  return authManager.getStatus();
});

ipcMain.handle('auth:login', async () => {
  try {
    const result = await authManager.login();
    twitchAPI = new TwitchAPI(authManager);

    // Fetch profile image
    await fetchUserProfile();

    // Connect IRC chat
    const userInfo = authManager.userInfo;
    if (userInfo) {
      twitchChat = new TwitchChat();
      twitchChat.connect(userInfo.login, authManager.getAccessToken());
      twitchChat.onStateChange = (connected) => {
        mainWindow?.webContents.send('chat:state-change', connected);
      };
    }

    return { success: true, user: authManager.userInfo };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:logout', async () => {
  if (twitchChat) {
    twitchChat.disconnect();
    twitchChat = null;
  }
  if (eventSub) {
    eventSub.disconnect();
    eventSub = null;
  }
  authManager.logout();
  twitchAPI = null;
  return { success: true };
});

// ── Twitch API ──

ipcMain.handle('twitch:get-top-streams', async (_event, first) => {
  if (!twitchAPI) return { error: 'Not authenticated', items: [] };
  return twitchAPI.getTopStreams(first);
});

ipcMain.handle('twitch:search-channels', async (_event, query, first) => {
  if (!twitchAPI) return { error: 'Not authenticated', items: [] };
  return twitchAPI.searchChannels(query, first);
});

ipcMain.handle('twitch:search-all-channels', async (_event, query, first) => {
  if (!twitchAPI) return { error: 'Not authenticated', items: [] };
  return twitchAPI.searchAllChannels(query, first);
});

ipcMain.handle('twitch:search-categories', async (_event, query, first) => {
  if (!twitchAPI) return { error: 'Not authenticated', items: [] };
  return twitchAPI.searchCategories(query, first);
});

ipcMain.handle('twitch:get-top-games', async (_event, first) => {
  if (!twitchAPI) return { error: 'Not authenticated', items: [] };
  return twitchAPI.getTopGames(first);
});

ipcMain.handle('twitch:get-streams-by-game', async (_event, gameId, first) => {
  if (!twitchAPI) return { error: 'Not authenticated', items: [] };
  return twitchAPI.getStreamsByGame(gameId, first);
});

ipcMain.handle('twitch:get-stream-by-user', async (_event, userLogin) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.getStreamByUser(userLogin);
});

ipcMain.handle('twitch:get-user', async (_event, login) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.getUser(login);
});

ipcMain.handle('twitch:get-user-by-id', async (_event, id) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.getUserById(id);
});

ipcMain.handle('twitch:get-channel-info', async (_event, broadcasterId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.getChannelInfo(broadcasterId);
});

ipcMain.handle('twitch:get-chatters', async (_event, broadcasterId, moderatorId, first) => {
  if (!twitchAPI) return { error: 'Not authenticated', chatters: [], total: 0 };
  return twitchAPI.getChatters(broadcasterId, moderatorId, first);
});

ipcMain.handle('twitch:get-moderators', async (_event, broadcasterId, first) => {
  if (!twitchAPI) return { error: 'Not authenticated', items: [] };
  return twitchAPI.getModerators(broadcasterId, first);
});

ipcMain.handle('twitch:get-vips', async (_event, broadcasterId, first) => {
  if (!twitchAPI) return { error: 'Not authenticated', items: [] };
  return twitchAPI.getVIPs(broadcasterId, first);
});

ipcMain.handle('twitch:get-channel-follower', async (_event, broadcasterId, userId) => {
  if (!twitchAPI) return null;
  return twitchAPI.getChannelFollower(broadcasterId, userId);
});

ipcMain.handle('twitch:get-global-badges', async () => {
  if (!twitchAPI) return [];
  return twitchAPI.getGlobalBadges();
});

ipcMain.handle('twitch:get-channel-badges', async (_event, broadcasterId) => {
  if (!twitchAPI) return [];
  return twitchAPI.getChannelBadges(broadcasterId);
});

ipcMain.handle('twitch:delete-message', async (_event, broadcasterId, moderatorId, messageId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.deleteMessage(broadcasterId, moderatorId, messageId);
});

ipcMain.handle('twitch:ban-user', async (_event, broadcasterId, moderatorId, userId, reason, duration) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.banUser(broadcasterId, moderatorId, userId, reason, duration);
});

ipcMain.handle('twitch:warn-user', async (_event, broadcasterId, moderatorId, userId, reason) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.warnUser(broadcasterId, moderatorId, userId, reason);
});

ipcMain.handle('twitch:modify-channel', async (_event, broadcasterId, data) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.modifyChannelInfo(broadcasterId, data);
});

// ── EventSub (Alerts) ──

ipcMain.handle('eventsub:start', async () => {
  if (!twitchAPI || !authManager.userInfo) return { error: 'Not authenticated' };

  if (eventSub) {
    eventSub.disconnect();
  }

  eventSub = new TwitchEventSub();

  return new Promise((resolve) => {
    const onEvent = async (evt) => {
      if (evt.type === 'connected') {
        const userId = authManager.userInfo.userId;
        const sessionId = evt.sessionId;

        const subs = [
          { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: userId, moderator_user_id: userId } },
          { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: userId } },
          { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: userId } },
          { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: userId } },
        ];

        for (const sub of subs) {
          await twitchAPI.createEventSubSubscription(sub.type, sub.version, sub.condition, sessionId);
        }

        resolve({ success: true });
      } else {
        mainWindow?.webContents.send('eventsub:event', evt);
      }
    };

    eventSub.onEvent(onEvent);
    eventSub.connect();

    setTimeout(() => resolve({ error: 'EventSub connection timed out' }), 15000);
  });
});

ipcMain.handle('eventsub:stop', async () => {
  if (eventSub) {
    eventSub.disconnect();
    eventSub = null;
  }
  return { success: true };
});

// ── Popout Player ──

ipcMain.on('open-popout-player', (_event, channel) => {
  const win = new BrowserWindow({
    width: 854,
    height: 480,
    title: `${channel} - Twitch`,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      partition: 'persist:twitch-player',
    },
  });
  win.loadURL(`https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=localhost&muted=false`);
});

// ── Chat Logging ──

ipcMain.on('chat:log', (_event, channel, line) => {
  const safe = channel.replace(/[^a-zA-Z0-9_-]/g, '_');
  const logFile = path.join(logsDir, `${safe}.txt`);
  fs.appendFile(logFile, line + '\n', () => {});
});

ipcMain.handle('chat:get-logs-path', async () => {
  return logsDir;
});

ipcMain.handle('chat:get-user-logs', async (_event, channel, displayName) => {
  const safe = channel.replace(/[^a-zA-Z0-9_-]/g, '_');
  const logFile = path.join(logsDir, `${safe}.txt`);
  try {
    if (!fs.existsSync(logFile)) return [];
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n');
    const prefix = `] ${displayName}: `;
    const results = [];
    for (const line of lines) {
      const idx = line.indexOf(prefix);
      if (idx !== -1) {
        const ts = line.substring(1, line.indexOf(']'));
        const msg = line.substring(idx + prefix.length);
        results.push({ ts, message: msg });
      }
    }
    return results.slice(-200);
  } catch {
    return [];
  }
});

// ── IRC Chat ──

ipcMain.handle('chat:join', async (_event, channel) => {
  if (!twitchChat) return { error: 'Chat not connected' };
  twitchChat.join(channel);
  return { success: true };
});

ipcMain.handle('chat:part', async (_event, channel) => {
  if (!twitchChat) return { error: 'Chat not connected' };
  twitchChat.part(channel);
  return { success: true };
});

ipcMain.handle('chat:send', async (_event, channel, message, broadcasterId) => {
  // Use Helix API to send messages (more reliable than IRC PRIVMSG)
  if (twitchAPI && authManager?.userInfo && broadcasterId) {
    const result = await twitchAPI.sendChatMessage(broadcasterId, authManager.userInfo.userId, message);
    if (result.success) return { success: true };
    // Fall through to IRC if API fails
    if (result.error) {
      // Try IRC as fallback
      if (twitchChat) {
        const sent = twitchChat.send(channel, message);
        if (sent) return { success: true };
      }
      return { error: result.error };
    }
  }

  // Fallback to IRC
  if (!twitchChat) return { error: 'Chat not connected' };
  const sent = twitchChat.send(channel, message);
  if (!sent) return { error: 'IRC not connected — try again in a moment' };
  return { success: true };
});

ipcMain.handle('chat:is-connected', async () => {
  return twitchChat?.connected || false;
});

ipcMain.on('chat:listen', (_event, channel) => {
  if (!twitchChat) return;
  const ch = channel.toLowerCase().replace('#', '');
  twitchChat.onChannel(ch, (parsed) => {
    mainWindow?.webContents.send(`chat:message:${ch}`, parsed);
  });
});

ipcMain.on('chat:unlisten', (_event, channel) => {
  if (!twitchChat) return;
  const ch = channel.toLowerCase().replace('#', '');
  twitchChat.offChannel(ch);
});

// ── Game API ──

ipcMain.handle('twitch:get-game', async (_event, gameId) => {
  if (!twitchAPI) return null;
  return twitchAPI.getGame(gameId);
});

// ── Profile Card Window ──

ipcMain.on('open-profile-card', (_event, data) => {
  const username = data.username;

  // Close existing card for this user if already open
  const existing = profileCards.get(username);
  if (existing && !existing.isDestroyed()) {
    existing.close();
  }

  const win = new BrowserWindow({
    width: 340,
    height: 520,
    minWidth: 280,
    minHeight: 300,
    frame: false,
    backgroundColor: '#1a1a1e',
    resizable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    x: data.screenX !== undefined ? Math.round(data.screenX) : undefined,
    y: data.screenY !== undefined ? Math.round(data.screenY) : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload-profile.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  profileCards.set(username, win);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'profile-card.html'));

  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('profile-card:data', data);
    }
  });

  win.on('closed', () => {
    profileCards.delete(username);
  });
});

ipcMain.on('profile-card:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.on('profile-card:send-message', (_event, username, msgData) => {
  const win = profileCards.get(username);
  if (win && !win.isDestroyed()) {
    win.webContents.send('profile-card:message', msgData);
  }
});

ipcMain.handle('profile-card:mod-action', async (_event, action, broadcasterId, myUserId, userId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  if (action === 'timeout') {
    return twitchAPI.banUser(broadcasterId, myUserId, userId, '', 300);
  } else if (action === 'ban') {
    return twitchAPI.banUser(broadcasterId, myUserId, userId, '', 0);
  }
  return { error: 'Unknown action' };
});

// Auto-update
ipcMain.handle('updater:check', async () => {
  return checkForUpdates();
});

// Settings
ipcMain.handle('store:get', async (_event, key) => store.get(key));
ipcMain.handle('store:set', async (_event, key, value) => store.set(key, value));

// Open external links
ipcMain.on('open-external', (_event, url) => {
  shell.openExternal(url);
});

// ── App lifecycle ──

app.whenReady().then(async () => {
  authManager = new AuthManager(store);

  const valid = await authManager.init();
  if (valid) {
    twitchAPI = new TwitchAPI(authManager);

    // Fetch/update profile image
    await fetchUserProfile();

    const userInfo = authManager.userInfo;
    if (userInfo) {
      twitchChat = new TwitchChat();
      twitchChat.connect(userInfo.login, authManager.getAccessToken());
      twitchChat.onStateChange = (connected) => {
        mainWindow?.webContents.send('chat:state-change', connected);
      };
    }
  }

  createMainWindow();
});

app.on('window-all-closed', () => {
  if (twitchChat) twitchChat.disconnect();
  if (eventSub) eventSub.disconnect();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
});
