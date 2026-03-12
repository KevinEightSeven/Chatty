const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { AuthManager } = require('../auth/auth-manager');
const { TwitchAPI } = require('../api/twitch-api');
const { TwitchChat } = require('../api/twitch-chat');
const { TwitchEventSub } = require('../api/twitch-eventsub');
const { checkForUpdates } = require('./auto-updater');
const { OverlayServer } = require('./overlay-server');
const { OverlayChatRenderer } = require('./overlay-chat-renderer');
const Store = require('electron-store').default;

const store = new Store({
  name: 'chatty-config',
  defaults: {
    windowBounds: { width: 1200, height: 800 },
    tabs: [],
    theme: 'dark',
  },
});

// Chat logs directory — defaults to generic, switches to per-user on login
let logsDir = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

let userDataDir = null; // Per-user data folder: {userData}/{username}/

let mainWindow = null;
let authManager = null;
let twitchAPI = null;
let twitchChat = null;
let eventSub = null;
let tray = null;
let overlayServer = null;
let overlayChatRenderer = null;
const chatListeners = new Set(); // channels with an active IRC listener
const profileCards = new Map(); // username → BrowserWindow

// Set up per-user data folder — creates {userData}/{username}/ with logs and settings subfolders
function setupUserDataFolder(username) {
  if (!username) return;
  const safe = username.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  userDataDir = path.join(app.getPath('userData'), safe);

  const userLogsDir = path.join(userDataDir, 'logs');
  const userSettingsDir = path.join(userDataDir, 'settings');
  const userAssetsDir = path.join(userDataDir, 'overlay-assets');

  for (const dir of [userDataDir, userLogsDir, userSettingsDir, userAssetsDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // Migrate existing logs from generic folder to user folder (one-time)
  const genericLogsDir = path.join(app.getPath('userData'), 'logs');
  if (fs.existsSync(genericLogsDir)) {
    try {
      const files = fs.readdirSync(genericLogsDir);
      for (const file of files) {
        const src = path.join(genericLogsDir, file);
        const dest = path.join(userLogsDir, file);
        if (!fs.existsSync(dest) && fs.statSync(src).isFile()) {
          fs.copyFileSync(src, dest);
        }
      }
    } catch {}
  }

  // Point logs to user-specific folder
  logsDir = userLogsDir;

  // Export a settings snapshot for portability
  const settingsFile = path.join(userSettingsDir, 'config-snapshot.json');
  try {
    const snapshot = {
      overlay: store.get('overlay'),
      settings: store.get('settings'),
      session: store.get('session'),
      exportedAt: new Date().toISOString(),
      username: username,
    };
    fs.writeFileSync(settingsFile, JSON.stringify(snapshot, null, 2));
  } catch {}
}

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

  mainWindow.on('close', (e) => {
    const closeToTray = store.get('settings.closeToTray') ?? true;
    if (closeToTray && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 });
  tray = new Tray(icon);
  tray.setToolTip('Chatty');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Chatty',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        if (tray) { tray.destroy(); tray = null; }
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createMainWindow();
    }
  });
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

    // Set up per-user data folder
    if (authManager.userInfo?.login) {
      setupUserDataFolder(authManager.userInfo.login);
    }

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

ipcMain.handle('twitch:send-announcement', async (_event, broadcasterId, moderatorId, message, color) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.sendAnnouncement(broadcasterId, moderatorId, message, color);
});

ipcMain.handle('twitch:unban-user', async (_event, broadcasterId, moderatorId, userId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.unbanUser(broadcasterId, moderatorId, userId);
});

ipcMain.handle('twitch:update-chat-settings', async (_event, broadcasterId, moderatorId, settings) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.updateChatSettings(broadcasterId, moderatorId, settings);
});

ipcMain.handle('twitch:add-moderator', async (_event, broadcasterId, userId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.addModerator(broadcasterId, userId);
});

ipcMain.handle('twitch:remove-moderator', async (_event, broadcasterId, userId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.removeModerator(broadcasterId, userId);
});

ipcMain.handle('twitch:add-vip', async (_event, broadcasterId, userId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.addVIP(broadcasterId, userId);
});

ipcMain.handle('twitch:remove-vip', async (_event, broadcasterId, userId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.removeVIP(broadcasterId, userId);
});

ipcMain.handle('twitch:start-raid', async (_event, fromId, toId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.startRaid(fromId, toId);
});

ipcMain.handle('twitch:cancel-raid', async (_event, broadcasterId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.cancelRaid(broadcasterId);
});

ipcMain.handle('twitch:send-shoutout', async (_event, fromId, toId, modId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.sendShoutout(fromId, toId, modId);
});

ipcMain.handle('twitch:create-stream-marker', async (_event, userId, description) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.createStreamMarker(userId, description);
});

ipcMain.handle('twitch:update-shield-mode', async (_event, broadcasterId, moderatorId, isActive) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.updateShieldMode(broadcasterId, moderatorId, isActive);
});

ipcMain.handle('twitch:block-user', async (_event, targetUserId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.blockUser(targetUserId);
});

ipcMain.handle('twitch:unblock-user', async (_event, targetUserId) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.unblockUser(targetUserId);
});

ipcMain.handle('twitch:update-chat-color', async (_event, userId, color) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.updateChatColor(userId, color);
});

ipcMain.handle('twitch:start-commercial', async (_event, broadcasterId, length) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.startCommercial(broadcasterId, length);
});

ipcMain.handle('twitch:get-polls', async (_event, broadcasterId) => {
  if (!twitchAPI) return { error: 'Not authenticated', items: [] };
  return twitchAPI.getPolls(broadcasterId);
});

ipcMain.handle('twitch:end-poll', async (_event, broadcasterId, pollId, status) => {
  if (!twitchAPI) return { error: 'Not authenticated' };
  return twitchAPI.endPoll(broadcasterId, pollId, status);
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
          { type: 'channel.subscription.message', version: '1', condition: { broadcaster_user_id: userId } },
          { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: userId } },
          { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: userId } },
        ];

        for (const sub of subs) {
          await twitchAPI.createEventSubSubscription(sub.type, sub.version, sub.condition, sessionId);
        }

        resolve({ success: true });
      } else {
        mainWindow?.webContents.send('eventsub:event', evt);

        // Forward to overlay server for OBS alerts
        if (overlayServer?.isRunning() && evt.event) {
          const e = evt.event;
          const alertData = { eventType: evt.type };
          if (evt.type === 'channel.follow') {
            alertData.user = e.user_name || e.user_login || 'Someone';
          } else if (evt.type === 'channel.subscribe') {
            alertData.user = e.user_name || e.user_login || 'Someone';
            alertData.tier = e.tier || '1';
            alertData.message = e.message || '';
            alertData.is_gift = e.is_gift || false;
            alertData.months = 1;
          } else if (evt.type === 'channel.subscription.message') {
            alertData.user = e.user_name || e.user_login || 'Someone';
            alertData.tier = e.tier || '1';
            alertData.message = (e.message && e.message.text) || '';
            alertData.months = e.cumulative_months || 1;
            alertData.is_gift = false;
          } else if (evt.type === 'channel.cheer') {
            alertData.user = e.user_name || e.user_login || 'Anonymous';
            alertData.amount = e.bits || 0;
            alertData.message = e.message || '';
          } else if (evt.type === 'channel.raid') {
            alertData.user = e.from_broadcaster_user_name || e.from_broadcaster_user_login || 'Someone';
            alertData.viewers = e.viewers || 0;
          }
          overlayServer.pushAlert(alertData);
        }
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

ipcMain.handle('chat:get-user-data-path', async () => {
  return userDataDir || app.getPath('userData');
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
  if (chatListeners.has(ch)) return; // already listening
  chatListeners.add(ch);
  twitchChat.onChannel(ch, async (parsed) => {
    mainWindow?.webContents.send(`chat:message:${ch}`, parsed);

    // Forward PRIVMSG to overlay server for chat overlay (only the logged-in user's own channel)
    const ownChannel = authManager?.userInfo?.login?.toLowerCase();
    if (overlayServer?.isRunning() && parsed.command === 'PRIVMSG' && ownChannel && ch === ownChannel) {
      const tags = parsed.tags || {};
      const badgeStr = tags.badges || '';
      const channelId = tags['room-id'] || '';

      // Lazily initialize the chat renderer and await data loading
      if (!overlayChatRenderer && twitchAPI) {
        overlayChatRenderer = new OverlayChatRenderer(twitchAPI);
        await Promise.all([
          overlayChatRenderer.loadGlobalBadges(),
          overlayChatRenderer.loadThirdPartyGlobal(),
        ]);
      }

      // Load channel-specific data if needed (await so first message gets badges)
      if (overlayChatRenderer && channelId) {
        await Promise.all([
          overlayChatRenderer.loadChannelBadges(channelId),
          overlayChatRenderer.loadThirdPartyChannel(channelId),
        ]);
      }

      const badges = overlayChatRenderer
        ? overlayChatRenderer.resolveBadges(badgeStr, channelId)
        : [];
      const html = overlayChatRenderer
        ? overlayChatRenderer.renderMessage(parsed.message || '', tags.emotes || '', channelId)
        : '';

      overlayServer.pushChat({
        username: parsed.username || '',
        displayName: tags['display-name'] || parsed.username || '',
        color: tags.color || '',
        message: parsed.message || '',
        html,
        badges,
        channel: ch,
      });
    }
  });
});

ipcMain.on('chat:unlisten', (_event, channel) => {
  if (!twitchChat) return;
  const ch = channel.toLowerCase().replace('#', '');
  chatListeners.delete(ch);
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

ipcMain.handle('updater:download', async () => {
  const { downloadAndInstall } = require('./auto-updater');
  return downloadAndInstall((progress) => {
    mainWindow?.webContents.send('updater:progress', progress);
  });
});

// ── Overlay Server ──

ipcMain.handle('overlay:start', async (_event, port) => {
  if (!overlayServer) {
    overlayServer = new OverlayServer(store, userDataDir || app.getPath('userData'));
  }
  overlayServer.start(port);
  return { success: true, port: overlayServer.getPort() };
});

ipcMain.handle('overlay:stop', async () => {
  if (overlayServer) {
    overlayServer.stop();
  }
  return { success: true };
});

ipcMain.handle('overlay:is-running', async () => {
  return overlayServer?.isRunning() || false;
});

ipcMain.handle('overlay:test-alert', async (_event, alertType, overrides) => {
  if (overlayServer?.isRunning()) {
    overlayServer.pushConfigReload();
    overlayServer.pushTestAlert(alertType, overrides);
    return { success: true };
  }
  return { error: 'Overlay server not running' };
});

ipcMain.handle('overlay:reload-config', async () => {
  if (overlayServer?.isRunning()) {
    overlayServer.pushConfigReload();
  }
});

ipcMain.handle('overlay:upload-asset', async (_event, filterType) => {
  const { dialog } = require('electron');
  const filters = filterType === 'sound'
    ? [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav'] }]
    : [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters,
  });

  if (result.canceled || !result.filePaths.length) return null;

  const filePath = result.filePaths[0];
  const filename = path.basename(filePath);
  const buffer = fs.readFileSync(filePath);

  if (!overlayServer) {
    overlayServer = new OverlayServer(store, userDataDir || app.getPath('userData'));
  }
  const savedName = overlayServer.saveAsset(filename, buffer);
  return { filename: savedName };
});

// Settings
ipcMain.handle('store:get', async (_event, key) => store.get(key));
ipcMain.handle('store:set', async (_event, key, value) => {
  store.set(key, value);
  // Toggle tray when close-to-tray setting changes
  if (key === 'settings.closeToTray') {
    if (value) {
      createTray();
    } else if (tray) {
      tray.destroy();
      tray = null;
    }
  }
});

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

    // Set up per-user data folder
    if (authManager.userInfo?.login) {
      setupUserDataFolder(authManager.userInfo.login);
    }

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

  // Create tray — close-to-tray is on by default
  if (store.get('settings.closeToTray') ?? true) {
    createTray();
  }

  // Auto-start overlay server if enabled
  if (store.get('settings.autoStartOverlay')) {
    const port = store.get('overlay.port') || 7878;
    if (!overlayServer) {
      overlayServer = new OverlayServer(store, userDataDir || app.getPath('userData'));
    }
    overlayServer.start(port);
  }
});

app.on('window-all-closed', () => {
  // If tray exists, don't quit — app lives in tray
  if (tray) return;
  if (twitchChat) twitchChat.disconnect();
  if (eventSub) eventSub.disconnect();
  if (overlayServer) overlayServer.stop();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
});
