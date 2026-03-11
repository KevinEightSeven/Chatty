const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chatty', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Auth
  getAuthStatus: () => ipcRenderer.invoke('auth:get-status'),
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // Twitch API
  getTopStreams: (first) => ipcRenderer.invoke('twitch:get-top-streams', first),
  searchChannels: (query, first) => ipcRenderer.invoke('twitch:search-channels', query, first),
  searchAllChannels: (query, first) => ipcRenderer.invoke('twitch:search-all-channels', query, first),
  searchCategories: (query, first) => ipcRenderer.invoke('twitch:search-categories', query, first),
  getTopGames: (first) => ipcRenderer.invoke('twitch:get-top-games', first),
  getStreamsByGame: (gameId, first) => ipcRenderer.invoke('twitch:get-streams-by-game', gameId, first),
  getStreamByUser: (userLogin) => ipcRenderer.invoke('twitch:get-stream-by-user', userLogin),
  getUser: (login) => ipcRenderer.invoke('twitch:get-user', login),
  getUserById: (id) => ipcRenderer.invoke('twitch:get-user-by-id', id),
  getChannelInfo: (broadcasterId) => ipcRenderer.invoke('twitch:get-channel-info', broadcasterId),
  getChatters: (broadcasterId, moderatorId, first) =>
    ipcRenderer.invoke('twitch:get-chatters', broadcasterId, moderatorId, first),
  getModerators: (broadcasterId, first) => ipcRenderer.invoke('twitch:get-moderators', broadcasterId, first),
  getVIPs: (broadcasterId, first) => ipcRenderer.invoke('twitch:get-vips', broadcasterId, first),
  getChannelFollower: (broadcasterId, userId) =>
    ipcRenderer.invoke('twitch:get-channel-follower', broadcasterId, userId),
  getGlobalBadges: () => ipcRenderer.invoke('twitch:get-global-badges'),
  getChannelBadges: (broadcasterId) => ipcRenderer.invoke('twitch:get-channel-badges', broadcasterId),
  deleteMessage: (broadcasterId, moderatorId, messageId) =>
    ipcRenderer.invoke('twitch:delete-message', broadcasterId, moderatorId, messageId),
  banUser: (broadcasterId, moderatorId, userId, reason, duration) =>
    ipcRenderer.invoke('twitch:ban-user', broadcasterId, moderatorId, userId, reason, duration),
  warnUser: (broadcasterId, moderatorId, userId, reason) =>
    ipcRenderer.invoke('twitch:warn-user', broadcasterId, moderatorId, userId, reason),
  modifyChannel: (broadcasterId, data) =>
    ipcRenderer.invoke('twitch:modify-channel', broadcasterId, data),

  // IRC Chat
  joinChat: (channel) => ipcRenderer.invoke('chat:join', channel),
  partChat: (channel) => ipcRenderer.invoke('chat:part', channel),
  sendChat: (channel, message, broadcasterId) => ipcRenderer.invoke('chat:send', channel, message, broadcasterId),
  isChatConnected: () => ipcRenderer.invoke('chat:is-connected'),
  listenChat: (channel) => ipcRenderer.send('chat:listen', channel),
  unlistenChat: (channel) => ipcRenderer.send('chat:unlisten', channel),
  onChatMessage: (channel, callback) => {
    const ch = channel.toLowerCase().replace('#', '');
    const handler = (_event, parsed) => callback(parsed);
    ipcRenderer.on(`chat:message:${ch}`, handler);
    return () => ipcRenderer.removeListener(`chat:message:${ch}`, handler);
  },
  onChatStateChange: (callback) => {
    const handler = (_event, connected) => callback(connected);
    ipcRenderer.on('chat:state-change', handler);
    return () => ipcRenderer.removeListener('chat:state-change', handler);
  },

  // EventSub (Alerts)
  startEventSub: () => ipcRenderer.invoke('eventsub:start'),
  stopEventSub: () => ipcRenderer.invoke('eventsub:stop'),
  onEventSubEvent: (callback) => {
    const handler = (_event, evt) => callback(evt);
    ipcRenderer.on('eventsub:event', handler);
    return () => ipcRenderer.removeListener('eventsub:event', handler);
  },

  // Twitch Games API
  getGame: (gameId) => ipcRenderer.invoke('twitch:get-game', gameId),

  // Popout Player
  openPopoutPlayer: (channel) => ipcRenderer.send('open-popout-player', channel),

  // Profile Card
  openProfileCard: (data) => ipcRenderer.send('open-profile-card', data),
  sendProfileMessage: (username, msgData) => ipcRenderer.send('profile-card:send-message', username, msgData),

  // Chat Logging
  logChat: (channel, line) => ipcRenderer.send('chat:log', channel, line),
  getLogsPath: () => ipcRenderer.invoke('chat:get-logs-path'),
  getUserLogs: (channel, displayName) => ipcRenderer.invoke('chat:get-user-logs', channel, displayName),

  // Settings
  getConfig: (key) => ipcRenderer.invoke('store:get', key),
  setConfig: (key, value) => ipcRenderer.invoke('store:set', key, value),

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),

  // External links
  openExternal: (url) => ipcRenderer.send('open-external', url),
});
