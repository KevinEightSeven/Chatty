/**
 * Chatty — Main renderer entry point.
 */

let tabManager;
let splitManager;
let modalManager;
let searchDialog;
let streamerTools;

let saveTimeout = null;

// ── Whisper Manager ──
const whisperState = {
  conversations: new Map(), // username -> [{ from, to, message, tags, timestamp }]
  activeUser: null,
  unreadCount: 0,
  isOpen: false,
  removeListener: null,
};

function initWhispers() {
  const panel = document.getElementById('whisper-panel');
  const closeBtn = document.getElementById('whisper-close');
  const input = document.getElementById('whisper-input');
  const sendBtn = document.getElementById('whisper-send');
  const actBtn = document.getElementById('btn-whispers');

  closeBtn.addEventListener('click', () => toggleWhisperPanel(false));
  actBtn.addEventListener('click', () => toggleWhisperPanel(!whisperState.isOpen));

  sendBtn.addEventListener('click', () => sendWhisperMessage());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendWhisperMessage();
  });

  // Listen for incoming whispers
  if (!window.chatty.onWhisper) return; // preload may not expose this yet
  whisperState.removeListener = window.chatty.onWhisper((parsed) => {
    const from = parsed.username;
    const tags = parsed.tags || {};
    const msg = {
      from,
      displayName: tags['display-name'] || from,
      to: null, // incoming
      message: parsed.message,
      color: tags.color || '',
      timestamp: new Date(),
      tags,
    };

    if (!whisperState.conversations.has(from)) {
      whisperState.conversations.set(from, []);
    }
    whisperState.conversations.get(from).push(msg);

    // If panel is open and this user is active, render immediately
    if (whisperState.isOpen && whisperState.activeUser === from) {
      appendWhisperMessage(msg);
    } else {
      whisperState.unreadCount++;
      updateWhisperBadge();
    }

    // If no active user, auto-select
    if (!whisperState.activeUser) {
      whisperState.activeUser = from;
      if (whisperState.isOpen) renderWhisperConversation();
    }

    // Update conversation list if panel is open
    if (whisperState.isOpen) renderWhisperUserList();
  });
}

function toggleWhisperPanel(open) {
  const panel = document.getElementById('whisper-panel');
  const actBtn = document.getElementById('btn-whispers');
  whisperState.isOpen = open;
  panel.classList.toggle('hidden', !open);
  actBtn.classList.toggle('active', open);

  if (open) {
    whisperState.unreadCount = 0;
    updateWhisperBadge();
    renderWhisperUserList();
    renderWhisperConversation();
  }
}

function updateWhisperBadge() {
  const badge = document.getElementById('whisper-unread');
  const actBtn = document.getElementById('btn-whispers');
  if (whisperState.unreadCount > 0) {
    badge.textContent = whisperState.unreadCount;
    badge.classList.remove('hidden');
    actBtn.classList.add('has-unread');
  } else {
    badge.classList.add('hidden');
    actBtn.classList.remove('has-unread');
  }
}

function renderWhisperUserList() {
  const messagesEl = document.getElementById('whisper-messages');
  // Build user tabs at the top of the messages area
  let tabsEl = messagesEl.parentElement.querySelector('.whisper-tabs');
  if (!tabsEl) {
    tabsEl = document.createElement('div');
    tabsEl.className = 'whisper-tabs';
    messagesEl.parentElement.insertBefore(tabsEl, messagesEl);
  }

  let html = '';
  for (const [username, msgs] of whisperState.conversations) {
    const displayName = msgs[msgs.length - 1]?.displayName || username;
    const isActive = whisperState.activeUser === username;
    html += `<button class="whisper-tab${isActive ? ' active' : ''}" data-user="${escapeHtml(username)}">${escapeHtml(displayName)}</button>`;
  }
  tabsEl.innerHTML = html;

  tabsEl.querySelectorAll('.whisper-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      whisperState.activeUser = btn.dataset.user;
      renderWhisperUserList();
      renderWhisperConversation();
    });
  });
}

function renderWhisperConversation() {
  const messagesEl = document.getElementById('whisper-messages');
  const input = document.getElementById('whisper-input');
  const sendBtn = document.getElementById('whisper-send');

  const user = whisperState.activeUser;
  if (!user) {
    messagesEl.innerHTML = '<div class="whisper-empty">No whispers yet</div>';
    input.placeholder = 'No active conversation';
    input.disabled = true;
    sendBtn.disabled = true;
    return;
  }

  input.placeholder = `Whisper to ${user}...`;
  input.disabled = false;
  sendBtn.disabled = false;

  const msgs = whisperState.conversations.get(user) || [];
  messagesEl.innerHTML = '';
  for (const msg of msgs) {
    appendWhisperMessage(msg);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendWhisperMessage(msg) {
  const messagesEl = document.getElementById('whisper-messages');
  const div = document.createElement('div');
  const isSent = !!msg.to;
  div.className = 'whisper-msg' + (isSent ? ' whisper-sent' : ' whisper-received');

  const time = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
  const ts = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
  const name = isSent ? 'You' : (msg.displayName || msg.from);
  const color = isSent ? 'var(--text-secondary)' : (msg.color || '#9b59b6');

  div.innerHTML = `<span class="whisper-time">${ts}</span> <span class="whisper-name" style="color:${escapeHtml(color)}">${escapeHtml(name)}</span><span class="whisper-sep">: </span><span class="whisper-text">${escapeHtml(msg.message)}</span>`;

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendWhisperMessage() {
  const input = document.getElementById('whisper-input');
  const message = input.value.trim();
  if (!message || !whisperState.activeUser) return;

  // We need the target user's ID — look it up
  const targetUser = await window.chatty.getUser(whisperState.activeUser);
  if (!targetUser || !targetUser.id) return;

  const result = await window.chatty.sendWhisper(targetUser.id, message);
  if (result.error) return;

  const status = await window.chatty.getAuthStatus();
  const myName = status.user?.login || 'You';

  const msg = {
    from: myName,
    displayName: status.user?.displayName || myName,
    to: whisperState.activeUser,
    message,
    color: '',
    timestamp: new Date(),
    tags: {},
  };

  if (!whisperState.conversations.has(whisperState.activeUser)) {
    whisperState.conversations.set(whisperState.activeUser, []);
  }
  whisperState.conversations.get(whisperState.activeUser).push(msg);
  appendWhisperMessage(msg);
  input.value = '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

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
  streamerTools = new StreamerTools();

  window.tabManager = tabManager;
  window.splitManager = splitManager;
  window.modalManager = modalManager;
  window.searchDialog = searchDialog;
  window.streamerTools = streamerTools;

  initWhispers();

  document.getElementById('btn-minimize').addEventListener('click', () => window.chatty.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.chatty.maximize());
  document.getElementById('btn-close').addEventListener('click', () => window.chatty.close());

  document.getElementById('btn-account').addEventListener('click', () => {
    modalManager.showAccountModal();
  });

  document.getElementById('btn-alerts').addEventListener('click', () => {
    splitManager.toggleAlertsSplit();
  });

  document.getElementById('btn-mod-actions').addEventListener('click', () => {
    splitManager.toggleModActionsSplit();
  });

  document.getElementById('btn-streamer-tools').addEventListener('click', () => {
    streamerTools.open();
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
      streamerTools.close();
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
      <button id="update-install">Update Now</button>
      <button id="update-dismiss">&times;</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('update-install').addEventListener('click', async () => {
      const btn = document.getElementById('update-install');
      btn.disabled = true;
      btn.textContent = 'Downloading...';

      const unsub = window.chatty.onUpdateProgress((progress) => {
        btn.textContent = `Downloading ${progress.percent}%`;
      });

      try {
        const res = await window.chatty.downloadUpdate();
        if (!res.success) {
          btn.textContent = res.message || 'Failed';
          btn.disabled = false;
          setTimeout(() => { btn.textContent = 'Update Now'; }, 3000);
          unsub();
        } else {
          btn.textContent = 'Restarting...';
        }
        // If successful, app will quit and relaunch
      } catch {
        btn.textContent = 'Update Now';
        btn.disabled = false;
        unsub();
      }
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
  const loggedIn = status.loggedIn && status.user;

  if (loggedIn) {
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

  // Show/hide logged-in-only buttons
  const show = loggedIn ? '' : 'none';
  document.getElementById('btn-whispers').style.display = show;
  document.getElementById('btn-alerts').style.display = show;
  document.getElementById('btn-mod-actions').style.display = show;
  document.getElementById('btn-streamer-tools').style.display = show;
}
