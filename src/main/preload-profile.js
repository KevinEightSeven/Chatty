const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('profileCard', {
  onData: (callback) => {
    ipcRenderer.on('profile-card:data', (_event, data) => callback(data));
  },
  onMessage: (callback) => {
    ipcRenderer.on('profile-card:message', (_event, data) => callback(data));
  },
  close: () => ipcRenderer.send('profile-card:close'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  modAction: (action, broadcasterId, myUserId, userId) =>
    ipcRenderer.invoke('profile-card:mod-action', action, broadcasterId, myUserId, userId),
});
