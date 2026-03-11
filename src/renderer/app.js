/**
 * Chatty — Main renderer entry point.
 */

let tabManager;
let splitManager;
let modalManager;
let searchDialog;

let saveTimeout = null;

function saveSession() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    if (!splitManager) return;
    const state = splitManager.serializeState();
    await window.chatty.setConfig('session', state);
  }, 500);
}

window.saveSession = saveSession;

document.addEventListener('DOMContentLoaded', async () => {
  tabManager = new TabManager();
  splitManager = new SplitManager();
  modalManager = new ModalManager();
  searchDialog = new SearchDialog();

  window.tabManager = tabManager;
  window.splitManager = splitManager;
  window.modalManager = modalManager;
  window.searchDialog = searchDialog;

  document.getElementById('btn-minimize').addEventListener('click', () => window.chatty.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.chatty.maximize());
  document.getElementById('btn-close').addEventListener('click', () => window.chatty.close());

  document.getElementById('btn-account').addEventListener('click', () => {
    modalManager.showAccountModal();
  });

  document.getElementById('btn-alerts').addEventListener('click', () => {
    splitManager.toggleAlertsSplit();
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    modalManager.showSettingsModal();
  });

  // Split action buttons in tab bar
  document.getElementById('act-info').addEventListener('click', () => {
    if (splitManager.selectedSplitId) splitManager._toggleLiveInfo(splitManager.selectedSplitId);
  });
  document.getElementById('act-users').addEventListener('click', () => {
    if (splitManager.selectedSplitId) splitManager._toggleUserListSplit(splitManager.selectedSplitId);
  });
  document.getElementById('act-video').addEventListener('click', () => {
    const split = splitManager.splits.get(splitManager.selectedSplitId);
    if (split?.channel) window.chatty.openPopoutPlayer(split.channel);
  });
  document.getElementById('act-search').addEventListener('click', () => {
    if (splitManager.selectedSplitId) splitManager._openSearchForSplit(splitManager.selectedSplitId);
  });
  document.getElementById('act-add').addEventListener('click', () => {
    const tab = tabManager.getActiveTab();
    if (tab) {
      splitManager.addSplit(tab.id);
      saveSession();
    }
  });
  document.getElementById('act-close').addEventListener('click', () => {
    if (splitManager.selectedSplitId) {
      const split = splitManager.splits.get(splitManager.selectedSplitId);
      if (split?._isAlertsSplit) splitManager._cleanupAlertsSplit();
      if (split?._chattersInterval) clearInterval(split._chattersInterval);
      splitManager.removeSplit(splitManager.selectedSplitId);
      saveSession();
    }
  });

  const session = await window.chatty.getConfig('session');
  let restored = false;

  if (session && session.tabs && session.tabs.length > 0) {
    restored = await splitManager.restoreState(session);
  }

  if (!restored) {
    tabManager.addTab('Chat');
  }

  await updateAccountUI();

  // Check for updates (non-blocking)
  checkAppUpdate();

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      tabManager.addTab();
      saveSession();
    }
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      const tab = tabManager.getActiveTab();
      if (tab) {
        tabManager.removeTab(tab.id);
        saveSession();
      }
    }
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      const tabs = tabManager.tabs;
      const idx = tabs.findIndex((t) => t.id === tabManager.activeTabId);
      const next = e.shiftKey
        ? (idx - 1 + tabs.length) % tabs.length
        : (idx + 1) % tabs.length;
      tabManager.switchTo(tabs[next].id);
    }
    if (e.key === 'Escape') {
      modalManager.close();
      searchDialog.close();
    }
  });

  window.addEventListener('beforeunload', () => {
    // Cancel any pending debounced save and do an immediate save
    clearTimeout(saveTimeout);
    if (splitManager) {
      const state = splitManager.serializeState();
      // Fire off the save — electron-store writes synchronously on the main process side
      window.chatty.setConfig('session', state);
    }
  });
});

async function checkAppUpdate() {
  try {
    const result = await window.chatty.checkForUpdates();
    if (!result.updateAvailable) return;

    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.innerHTML = `
      <span>Chatty v${result.latestVersion} is available (you have v${result.currentVersion})</span>
      <button id="update-download">Download</button>
      <button id="update-dismiss">&times;</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('update-download').addEventListener('click', () => {
      window.chatty.openExternal(result.releaseUrl);
    });
    document.getElementById('update-dismiss').addEventListener('click', () => {
      banner.remove();
    });
  } catch {
    // Silently ignore update check failures
  }
}

async function updateAccountUI() {
  const status = await window.chatty.getAuthStatus();
  const nameEl = document.getElementById('account-name');
  const avatarEl = document.getElementById('account-avatar');

  if (status.loggedIn && status.user) {
    nameEl.textContent = status.user.displayName || status.user.login;
    if (status.user.profileImageUrl) {
      avatarEl.src = status.user.profileImageUrl;
      avatarEl.style.display = '';
    } else {
      avatarEl.style.display = 'none';
    }
  } else {
    nameEl.textContent = 'Not logged in';
    avatarEl.style.display = 'none';
  }
}
