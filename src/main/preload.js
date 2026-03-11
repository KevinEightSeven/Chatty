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

  // New Twitch API methods
  sendAnnouncement: (broadcasterId, moderatorId, message, color) =>
    ipcRenderer.invoke('twitch:send-announcement', broadcasterId, moderatorId, message, color),
  unbanUser: (broadcasterId, moderatorId, userId) =>
    ipcRenderer.invoke('twitch:unban-user', broadcasterId, moderatorId, userId),
  updateChatSettings: (broadcasterId, moderatorId, settings) =>
    ipcRenderer.invoke('twitch:update-chat-settings', broadcasterId, moderatorId, settings),
  addModerator: (broadcasterId, userId) =>
    ipcRenderer.invoke('twitch:add-moderator', broadcasterId, userId),
  removeModerator: (broadcasterId, userId) =>
    ipcRenderer.invoke('twitch:remove-moderator', broadcasterId, userId),
  addVIP: (broadcasterId, userId) =>
    ipcRenderer.invoke('twitch:add-vip', broadcasterId, userId),
  removeVIP: (broadcasterId, userId) =>
    ipcRenderer.invoke('twitch:remove-vip', broadcasterId, userId),
  startRaid: (fromId, toId) =>
    ipcRenderer.invoke('twitch:start-raid', fromId, toId),
  cancelRaid: (broadcasterId) =>
    ipcRenderer.invoke('twitch:cancel-raid', broadcasterId),
  sendShoutout: (fromId, toId, modId) =>
    ipcRenderer.invoke('twitch:send-shoutout', fromId, toId, modId),
  createStreamMarker: (userId, description) =>
    ipcRenderer.invoke('twitch:create-stream-marker', userId, description),
  updateShieldMode: (broadcasterId, moderatorId, isActive) =>
    ipcRenderer.invoke('twitch:update-shield-mode', broadcasterId, moderatorId, isActive),
  blockUser: (targetUserId) =>
    ipcRenderer.invoke('twitch:block-user', targetUserId),
  unblockUser: (targetUserId) =>
    ipcRenderer.invoke('twitch:unblock-user', targetUserId),
  updateChatColor: (userId, color) =>
    ipcRenderer.invoke('twitch:update-chat-color', userId, color),
  startCommercial: (broadcasterId, length) =>
    ipcRenderer.invoke('twitch:start-commercial', broadcasterId, length),
  getPolls: (broadcasterId) =>
    ipcRenderer.invoke('twitch:get-polls', broadcasterId),
  endPoll: (broadcasterId, pollId, status) =>
    ipcRenderer.invoke('twitch:end-poll', broadcasterId, pollId, status),

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
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  onUpdateProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
  },

  // External links
  openExternal: (url) => ipcRenderer.send('open-external', url),
});
