/**
 * SplitManager — Manages split panels within tabs (Chatterino-style SplitContainer).
 * Features: equal-size splits, drag-and-drop reorder, live info bar, user list,
 * alerts panel, @mention autocomplete, session save/restore.
 */
class SplitManager {
  constructor() {
    this.container = document.getElementById('split-container');
    this.splits = new Map();
    this.tabSplits = new Map();
    this.splitIdCounter = 0;
    this._alertsRemoveListener = null;
    this._alertsSplitId = null;
    this._dragState = null;
  }

  // ── Tab management ──

  initTab(tabId) {
    this.tabSplits.set(tabId, []);
    this.addSplit(tabId);
  }

  showTab(tabId) {
    this.container.querySelectorAll('.tab-split-wrapper').forEach((el) => {
      el.style.display = 'none';
    });

    let wrapper = this.container.querySelector(`[data-tab-id="${tabId}"]`);
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'tab-split-wrapper';
      wrapper.dataset.tabId = tabId;
      wrapper.style.cssText = 'display:flex;flex:1;height:100%;';
      this.container.appendChild(wrapper);
      this.initTab(tabId);
    }
    wrapper.style.display = 'flex';
  }

  // ── Split CRUD ──

  addSplit(tabId) {
    const splitId = `split-${++this.splitIdCounter}`;
    const wrapper = this.container.querySelector(`[data-tab-id="${tabId}"]`);
    if (!wrapper) return null;

    const existingSplits = this.tabSplits.get(tabId) || [];
    if (existingSplits.length > 0) {
      const gutter = document.createElement('div');
      gutter.className = 'split-gutter';
      gutter.dataset.splitLeft = existingSplits[existingSplits.length - 1];
      gutter.dataset.splitRight = splitId;
      this._setupGutterDrag(gutter);
      wrapper.appendChild(gutter);
    }

    const panel = document.createElement('div');
    panel.className = 'split-panel';
    panel.dataset.splitId = splitId;
    panel.style.flex = '1';
    panel.innerHTML = `
      <div class="split-header">
        <div class="split-header-left">
          <span class="split-channel-name">No channel</span>
        </div>
        <div class="split-header-actions">
          <button class="btn-split-game" title="Toggle stream info" style="display:none;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 12h4m-2-2v4m6-1h.01M18 11h.01"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg></button>
          <button class="btn-split-users" title="User list" style="display:none;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></button>
          <button class="btn-split-video" title="Video player" style="display:none;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></button>
          <span class="split-header-sep" style="display:none;">|</span>
          <button class="btn-split-search" title="Change channel"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
          <button class="btn-split-add" title="Add split">+</button>
          <button class="btn-split-close" title="Close split"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="split-live-info" style="display:none;">
        <div class="live-info-scroll">
          <span class="split-viewer-count"></span>
          <span class="live-info-game"></span>
          <span class="live-info-sep">—</span>
          <span class="live-info-title"></span>
        </div>
      </div>
      <div class="split-body" style="flex:1;display:flex;flex-direction:column;position:relative;min-height:0;">
        <div class="split-empty">
          <div class="split-empty-icon">&#x1F4AC;</div>
          <div>No chat connected</div>
          <button class="btn-connect-chat">Browse Streams</button>
        </div>
      </div>
    `;

    wrapper.appendChild(panel);

    const splitData = {
      id: splitId,
      tabId,
      element: panel,
      chatView: null,
      channel: null,
      broadcasterId: null,
      streamDetails: null,
      _viewerInterval: null,
      _userListOpen: false,
      _showLiveInfo: true,
      _isAlertsSplit: false,
      _parentSplitId: null,
    };

    this.splits.set(splitId, splitData);
    if (!this.tabSplits.has(tabId)) {
      this.tabSplits.set(tabId, []);
    }
    this.tabSplits.get(tabId).push(splitId);

    // Equalize all splits in this tab
    this._equalizeSplits(tabId);

    // Wire up buttons
    panel.querySelector('.btn-connect-chat').addEventListener('click', () => {
      this._openSearchForSplit(splitId);
    });
    panel.querySelector('.btn-split-search').addEventListener('click', () => {
      this._openSearchForSplit(splitId);
    });
    panel.querySelector('.btn-split-add').addEventListener('click', () => {
      this.addSplit(tabId);
      saveSession();
    });
    panel.querySelector('.btn-split-close').addEventListener('click', () => {
      if (splitData._isAlertsSplit) {
        this._cleanupAlertsSplit();
      }
      if (splitData._chattersInterval) clearInterval(splitData._chattersInterval);
      this.removeSplit(splitId);
      saveSession();
    });
    panel.querySelector('.btn-split-game').addEventListener('click', () => {
      this._toggleLiveInfo(splitId);
    });
    panel.querySelector('.btn-split-users').addEventListener('click', () => {
      this._toggleUserListSplit(splitId);
    });
    panel.querySelector('.btn-split-video').addEventListener('click', () => {
      if (splitData.channel) {
        window.chatty.openPopoutPlayer(splitData.channel);
      }
    });

    // Click channel name to open popout video player
    panel.querySelector('.split-channel-name').addEventListener('click', () => {
      if (splitData.channel) {
        window.chatty.openPopoutPlayer(splitData.channel);
      }
    });

    // Drag-and-drop reordering
    this._setupDragDrop(panel, splitId);

    return splitData;
  }

  _equalizeSplits(tabId) {
    const tabSplitList = this.tabSplits.get(tabId) || [];
    for (const sid of tabSplitList) {
      const s = this.splits.get(sid);
      if (s?.element) {
        s.element.style.flex = '1';
        // If inside a column, also equalize the column
        const col = s.element.parentElement;
        if (col?.classList.contains('split-column')) {
          col.style.flex = '1';
        }
      }
    }
  }

  removeSplit(splitId) {
    const split = this.splits.get(splitId);
    if (!split) return;

    if (split.chatView) split.chatView.destroy();
    if (split._viewerInterval) clearInterval(split._viewerInterval);
    if (split._chattersInterval) clearInterval(split._chattersInterval);

    const tabId = split.tabId;
    const tabSplitList = this.tabSplits.get(tabId);

    const idx = tabSplitList.indexOf(splitId);
    if (idx !== -1) tabSplitList.splice(idx, 1);

    const wrapper = this.container.querySelector(`[data-tab-id="${tabId}"]`);
    const panel = wrapper.querySelector(`[data-split-id="${splitId}"]`);
    const parentEl = panel.parentElement;

    // Handle removal of horizontal gutters if inside a column
    if (parentEl?.classList.contains('split-column')) {
      const prevGutter = panel.previousElementSibling;
      const nextGutter = panel.nextElementSibling;
      if (prevGutter?.classList.contains('split-gutter-h')) prevGutter.remove();
      else if (nextGutter?.classList.contains('split-gutter-h')) nextGutter.remove();
      panel.remove();
      this._cleanupColumns(wrapper);
    } else {
      const prevGutter = panel.previousElementSibling;
      const nextGutter = panel.nextElementSibling;
      if (prevGutter && prevGutter.classList.contains('split-gutter')) {
        prevGutter.remove();
      } else if (nextGutter && nextGutter.classList.contains('split-gutter')) {
        nextGutter.remove();
      }
      panel.remove();
    }

    this.splits.delete(splitId);

    if (tabSplitList.length === 0) {
      this.addSplit(tabId);
    } else {
      this._equalizeSplits(tabId);
    }
  }

  destroyTabSplits(tabId) {
    const splitIds = this.tabSplits.get(tabId) || [];
    for (const id of splitIds) {
      const split = this.splits.get(id);
      if (split?.chatView) split.chatView.destroy();
      if (split?._viewerInterval) clearInterval(split._viewerInterval);
      if (split?._chattersInterval) clearInterval(split._chattersInterval);
      if (split?._isAlertsSplit) this._cleanupAlertsSplit();
      this.splits.delete(id);
    }
    this.tabSplits.delete(tabId);

    const wrapper = this.container.querySelector(`[data-tab-id="${tabId}"]`);
    if (wrapper) wrapper.remove();
  }

  // ── Connect to a Twitch channel ──

  async connectSplit(splitId, channel) {
    const split = this.splits.get(splitId);
    if (!split) return;

    if (split.chatView) split.chatView.destroy();
    if (split._viewerInterval) clearInterval(split._viewerInterval);

    const ch = channel.toLowerCase().replace('#', '');
    split.channel = ch;

    const user = await window.chatty.getUser(ch);
    if (user?.error) {
      this._showSplitError(split, user.error);
      return;
    }
    if (!user) {
      this._showSplitError(split, `Channel "${ch}" not found.`);
      return;
    }

    split.broadcasterId = user.id;

    // Update header
    split.element.querySelector('.split-channel-name').textContent = user.display_name || ch;

    // Show toggle buttons
    split.element.querySelector('.btn-split-game').style.display = '';
    split.element.querySelector('.btn-split-users').style.display = '';
    split.element.querySelector('.btn-split-video').style.display = '';
    split.element.querySelector('.split-header-sep').style.display = '';

    // Build chat body
    const body = split.element.querySelector('.split-body');
    body.style.flexDirection = 'column';
    split._userListOpen = false;
    if (split._chattersInterval) {
      clearInterval(split._chattersInterval);
      split._chattersInterval = null;
    }
    body.innerHTML = `
      <div class="split-chat"></div>
      <button class="go-to-bottom">&darr; New messages</button>
      <div class="split-input">
        <input type="text" placeholder="Send a message..." maxlength="500">
        <button>Chat</button>
      </div>
    `;

    const chatEl = body.querySelector('.split-chat');
    const inputEl = body.querySelector('.split-input input');
    const sendBtn = body.querySelector('.split-input button');
    const goToBottom = body.querySelector('.go-to-bottom');

    split.chatView = new ChatView(chatEl, ch, goToBottom);
    split.chatView.broadcasterId = split.broadcasterId;

    split.chatView.onUsersChanged = () => {
      if (split._userListOpen) {
        this._refreshUserList(splitId);
      }
    };

    split.chatView.start();

    // @mention autocomplete
    this._setupMentionAutocomplete(inputEl, split);

    const sendMessage = async () => {
      if (split._mentionOpen) return; // Let autocomplete handle Enter
      const msg = inputEl.value.trim();
      if (!msg) return;
      sendBtn.disabled = true;
      inputEl.value = '';
      const res = await window.chatty.sendChat(ch, msg, split.broadcasterId);
      if (res.error) {
        split.chatView.addSystemMessage(`Failed to send: ${res.error}`);
      }
      sendBtn.disabled = false;
      inputEl.focus();
    };

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !split._mentionOpen) sendMessage();
    });

    this._updateStreamDetails(split);

    if (window.tabManager) {
      const tab = window.tabManager.getActiveTab();
      if (tab && tab.name === 'New Tab') {
        window.tabManager.renameTab(tab.id, user.display_name || ch);
      }
    }

    saveSession();
  }

  // ── Live info bar (translucent red bar below header) ──

  async _updateStreamDetails(split) {
    if (!split.channel) return;

    const liveInfoEl = split.element.querySelector('.split-live-info');
    const countEl = liveInfoEl.querySelector('.split-viewer-count');
    const gameEl = liveInfoEl.querySelector('.live-info-game');
    const titleEl = liveInfoEl.querySelector('.live-info-title');
    const channelNameEl = split.element.querySelector('.split-channel-name');

    const fetchDetails = async () => {
      const stream = await window.chatty.getStreamByUser(split.channel);

      if (stream && !stream.error) {
        split.streamDetails = stream;

        // Update viewer count in live info bar
        countEl.textContent = Number(stream.viewer_count).toLocaleString();

        // Update game and title
        gameEl.textContent = stream.game_name || '';
        titleEl.textContent = stream.title || '';

        // Update channel name with live indicator
        channelNameEl.textContent = split.streamDetails
          ? (stream.user_name || split.channel)
          : split.channel;

        // Show live info bar if toggled on
        if (split._showLiveInfo) {
          liveInfoEl.style.display = '';
        }
      } else {
        split.streamDetails = null;
        // Hide live info bar when offline
        liveInfoEl.style.display = 'none';
      }
    };

    await fetchDetails();

    // Poll every 15 seconds for fast updates
    split._viewerInterval = setInterval(async () => {
      if (!this.splits.has(split.id)) {
        clearInterval(split._viewerInterval);
        return;
      }
      await fetchDetails();
    }, 15000);
  }

  _toggleLiveInfo(splitId) {
    const split = this.splits.get(splitId);
    if (!split) return;

    split._showLiveInfo = !split._showLiveInfo;
    split.element.querySelector('.btn-split-game').classList.toggle('header-btn-active', split._showLiveInfo);

    const liveInfoEl = split.element.querySelector('.split-live-info');
    if (liveInfoEl) {
      // Only show if channel is live AND toggle is on
      if (split._showLiveInfo && split.streamDetails) {
        liveInfoEl.style.display = '';
      } else {
        liveInfoEl.style.display = 'none';
      }
    }
  }

  // ── @mention autocomplete ──

  _setupMentionAutocomplete(inputEl, split) {
    split._mentionOpen = false;
    split._mentionIdx = 0;
    let dropdown = null;
    let matches = [];

    const close = () => {
      if (dropdown) {
        dropdown.remove();
        dropdown = null;
      }
      split._mentionOpen = false;
      matches = [];
      split._mentionIdx = 0;
    };

    const getMentionContext = () => {
      const val = inputEl.value;
      const cursor = inputEl.selectionStart;
      // Find the @ before cursor
      const before = val.substring(0, cursor);
      const atIdx = before.lastIndexOf('@');
      if (atIdx === -1) return null;
      // Make sure there's no space between @ and cursor
      const partial = before.substring(atIdx + 1);
      if (partial.includes(' ')) return null;
      return { atIdx, partial: partial.toLowerCase() };
    };

    const render = () => {
      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'mention-autocomplete';
        inputEl.parentElement.appendChild(dropdown);
      }
      dropdown.innerHTML = matches
        .map((u, i) => {
          const color = u.color || this._userColor(u.displayName);
          return `<div class="mention-item${i === split._mentionIdx ? ' active' : ''}" data-idx="${i}">
            <span style="color:${color};font-weight:600;">${this._escapeHtml(u.displayName)}</span>
          </div>`;
        })
        .join('');

      dropdown.querySelectorAll('.mention-item').forEach((el) => {
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          select(parseInt(el.dataset.idx));
        });
      });
    };

    const select = (idx) => {
      const ctx = getMentionContext();
      if (!ctx || !matches[idx]) { close(); return; }
      const u = matches[idx];
      const val = inputEl.value;
      const before = val.substring(0, ctx.atIdx);
      const after = val.substring(ctx.atIdx + 1 + ctx.partial.length);
      inputEl.value = `${before}@${u.displayName} ${after}`;
      const newCursor = before.length + 1 + u.displayName.length + 1;
      inputEl.setSelectionRange(newCursor, newCursor);
      close();
      inputEl.focus();
    };

    inputEl.addEventListener('input', () => {
      const ctx = getMentionContext();
      if (!ctx || ctx.partial.length === 0) { close(); return; }

      const users = split.chatView ? split.chatView.getUsers() : [];
      matches = users
        .filter((u) => u.displayName.toLowerCase().startsWith(ctx.partial) || u.username.toLowerCase().startsWith(ctx.partial))
        .slice(0, 10);

      if (matches.length === 0) { close(); return; }

      split._mentionOpen = true;
      split._mentionIdx = 0;
      render();
    });

    inputEl.addEventListener('keydown', (e) => {
      if (!split._mentionOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        split._mentionIdx = (split._mentionIdx + 1) % matches.length;
        render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        split._mentionIdx = (split._mentionIdx - 1 + matches.length) % matches.length;
        render();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        select(split._mentionIdx);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });

    inputEl.addEventListener('blur', () => {
      setTimeout(close, 150);
    });
  }

  // ── User list as inline sidebar within the split panel ──

  _toggleUserListSplit(splitId) {
    const split = this.splits.get(splitId);
    if (!split || !split.chatView) return;

    const body = split.element.querySelector('.split-body');
    const existing = body.querySelector('.user-list-sidebar');

    const usersBtn = split.element.querySelector('.btn-split-users');

    if (existing) {
      // Close the sidebar
      existing.remove();
      const gutter = body.querySelector('.user-list-gutter');
      if (gutter) gutter.remove();
      // Restore chat wrapper to full width
      const chatWrap = body.querySelector('.split-chat-wrap');
      if (chatWrap) {
        chatWrap.style.flex = '1';
        chatWrap.style.width = '';
      }
      if (split._chattersInterval) {
        clearInterval(split._chattersInterval);
        split._chattersInterval = null;
      }
      split._userListOpen = false;
      if (usersBtn) usersBtn.classList.remove('header-btn-active');
      saveSession();
      return;
    }

    // Wrap existing chat + input in a wrapper div if not already
    let chatWrap = body.querySelector('.split-chat-wrap');
    if (!chatWrap) {
      chatWrap = document.createElement('div');
      chatWrap.className = 'split-chat-wrap';
      chatWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;';
      // Move all children into the wrapper
      while (body.firstChild) chatWrap.appendChild(body.firstChild);
      body.style.flexDirection = 'row';
      body.appendChild(chatWrap);
    }

    // Create the resize gutter
    const gutter = document.createElement('div');
    gutter.className = 'user-list-gutter';
    body.appendChild(gutter);

    // Create the sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'user-list-sidebar';
    sidebar.innerHTML = `
      <div class="user-list-header">Users</div>
      <div class="user-list-entries"></div>
    `;
    body.appendChild(sidebar);

    // Setup gutter drag to resize
    this._setupUserListGutter(gutter, chatWrap, sidebar);

    split._userListOpen = true;
    if (usersBtn) usersBtn.classList.add('header-btn-active');

    // Fetch and render users
    this._fetchAndMergeUsers(splitId);

    // Poll chatters every 60 seconds
    split._chattersInterval = setInterval(() => {
      if (!this.splits.has(splitId) || !split._userListOpen) {
        clearInterval(split._chattersInterval);
        split._chattersInterval = null;
        return;
      }
      this._fetchAndMergeUsers(splitId);
    }, 60000);

    saveSession();
  }

  _setupUserListGutter(gutter, chatWrap, sidebar) {
    let startX = 0;
    let startSidebarWidth = 0;

    const onMouseDown = (e) => {
      e.preventDefault();
      startX = e.clientX;
      startSidebarWidth = sidebar.offsetWidth;
      gutter.classList.add('active');

      const onMouseMove = (me) => {
        const dx = startX - me.clientX;
        const newWidth = Math.max(100, Math.min(400, startSidebarWidth + dx));
        sidebar.style.width = newWidth + 'px';
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        gutter.classList.remove('active');
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    gutter.addEventListener('mousedown', onMouseDown);
  }

  async _fetchAndMergeUsers(splitId) {
    const split = this.splits.get(splitId);
    if (!split || !split.chatView) return;

    if (split.broadcasterId && split.chatView) {
      const status = await window.chatty.getAuthStatus();
      const moderatorId = status.loggedIn ? status.user?.userId : null;
      if (moderatorId) {
        const result = await window.chatty.getChatters(split.broadcasterId, moderatorId, 1000);
        if (result.chatters) {
          for (const chatter of result.chatters) {
            const username = chatter.user_login;
            if (!split.chatView.users.has(username)) {
              split.chatView.users.set(username, {
                displayName: chatter.user_name || username,
                username,
                badges: {},
                color: '',
                userId: chatter.user_id || '',
                lastSeen: new Date(),
              });
            }
          }
        }

        const mods = await window.chatty.getModerators(split.broadcasterId, 100);
        if (mods.items) {
          for (const mod of mods.items) {
            const u = split.chatView.users.get(mod.user_login);
            if (u && !u.badges?.broadcaster) {
              u.badges = { ...u.badges, moderator: true };
            }
          }
        }

        const vips = await window.chatty.getVIPs(split.broadcasterId, 100);
        if (vips.items) {
          for (const vip of vips.items) {
            const u = split.chatView.users.get(vip.user_login);
            if (u && !u.badges?.broadcaster && !u.badges?.moderator) {
              u.badges = { ...u.badges, vip: true };
            }
          }
        }

        const broadcaster = split.chatView.users.get(split.channel);
        if (broadcaster) {
          broadcaster.badges = { ...broadcaster.badges, broadcaster: true };
        }
      }
    }

    this._refreshUserList(splitId);
  }

  _refreshUserList(splitId) {
    const split = this.splits.get(splitId);
    if (!split || !split.chatView) return;

    const entriesEl = split.element.querySelector('.user-list-entries');
    if (!entriesEl) return;

    const users = split.chatView.getUsers();

    // Update header with count
    const header = split.element.querySelector('.user-list-header');
    if (header) header.textContent = `Users (${users.length})`;

    // Categorize users
    const categories = {
      broadcaster: [],
      moderators: [],
      vips: [],
      subscribers: [],
      viewers: [],
    };

    for (const u of users) {
      if (u.badges?.broadcaster) categories.broadcaster.push(u);
      else if (u.badges?.moderator) categories.moderators.push(u);
      else if (u.badges?.vip) categories.vips.push(u);
      else if (u.badges?.subscriber) categories.subscribers.push(u);
      else categories.viewers.push(u);
    }

    let html = '';
    const channelId = split.broadcasterId;
    const renderCategory = (label, list) => {
      if (list.length === 0) return;
      html += `<div class="user-list-category">${this._escapeHtml(label)} (${list.length})</div>`;
      for (const u of list) {
        const color = u.color || this._userColor(u.displayName);
        // Render badge icons
        let badgeHtml = '';
        if (u.badges && window.emoteBadgeManager) {
          const badgeStr = Object.entries(u.badges).map(([k, v]) => `${k}/${v}`).join(',');
          badgeHtml = window.emoteBadgeManager.renderBadges(badgeStr, channelId);
        }
        html += `<div class="user-list-entry" data-username="${this._escapeHtml(u.username)}">
          ${badgeHtml}<span class="user-list-name" style="color:${color}">${this._escapeHtml(u.displayName)}</span>
        </div>`;
      }
    };

    renderCategory('Broadcaster', categories.broadcaster);
    renderCategory('Moderators', categories.moderators);
    renderCategory('VIPs', categories.vips);
    renderCategory('Subscribers', categories.subscribers);
    renderCategory('Viewers', categories.viewers);

    entriesEl.innerHTML = html;

    // Click user → open profile card
    entriesEl.querySelectorAll('.user-list-entry').forEach((el) => {
      el.addEventListener('click', () => {
        if (split.chatView) {
          split.chatView._showProfileCard(el.dataset.username, el);
        }
      });
    });
  }

  // ── Alerts panel ──

  async toggleAlertsSplit() {
    // If an alerts split already exists, close it
    if (this._alertsSplitId) {
      const existing = this.splits.get(this._alertsSplitId);
      if (existing) {
        this._cleanupAlertsSplit();
        this.removeSplit(this._alertsSplitId);
        this._alertsSplitId = null;
        saveSession();
        return;
      }
      this._alertsSplitId = null;
    }

    // Use active tab
    const activeTab = window.tabManager?.getActiveTab();
    if (!activeTab) return;

    const newSplit = this.addSplit(activeTab.id);
    if (!newSplit) return;

    newSplit._isAlertsSplit = true;
    this._alertsSplitId = newSplit.id;

    newSplit.element.querySelector('.split-channel-name').textContent = 'Alerts';

    newSplit.element.querySelector('.btn-split-game').style.display = 'none';
    newSplit.element.querySelector('.btn-split-users').style.display = 'none';
    newSplit.element.querySelector('.btn-split-video').style.display = 'none';
    newSplit.element.querySelector('.split-header-sep').style.display = 'none';
    newSplit.element.querySelector('.btn-split-add').style.display = 'none';
    newSplit.element.querySelector('.btn-split-search').style.display = 'none';

    const body = newSplit.element.querySelector('.split-body');
    body.innerHTML = `
      <div class="alerts-panel">
        <div class="alerts-entries">
          <div class="alert-empty">
            <div class="alert-empty-icon">&#x1F514;</div>
            <div>Connecting to alerts...</div>
          </div>
        </div>
      </div>
    `;

    const entriesEl = body.querySelector('.alerts-entries');

    // Start EventSub
    const result = await window.chatty.startEventSub();
    if (result.error) {
      entriesEl.innerHTML = `
        <div class="alert-empty">
          <div class="alert-empty-icon">&#x26A0;&#xFE0F;</div>
          <div>Could not connect to alerts.<br><span style="font-size:11px;color:var(--text-muted);">${this._escapeHtml(result.error)}</span></div>
        </div>
      `;
      return;
    }

    entriesEl.innerHTML = `
      <div class="alert-empty">
        <div class="alert-empty-icon">&#x1F514;</div>
        <div>Listening for alerts...<br><span style="font-size:11px;color:var(--text-muted);">New follows, subs, cheers, and raids will appear here.</span></div>
      </div>
    `;

    // Listen for events
    this._alertsRemoveListener = window.chatty.onEventSubEvent((evt) => {
      const empty = entriesEl.querySelector('.alert-empty');
      if (empty) empty.remove();

      const entry = this._createAlertEntry(evt);
      if (entry) {
        entriesEl.appendChild(entry);
        entriesEl.scrollTop = entriesEl.scrollHeight;

        while (entriesEl.children.length > 200) {
          entriesEl.firstElementChild?.remove();
        }
      }
    });

    saveSession();
  }

  _createAlertEntry(evt) {
    const div = document.createElement('div');
    div.className = 'alert-entry';

    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const e = evt.event;

    let icon = '';
    let text = '';

    if (evt.type === 'channel.follow') {
      icon = '&#x2764;&#xFE0F;';
      text = `<strong>${this._escapeHtml(e.user_name)}</strong> followed!`;
    } else if (evt.type === 'channel.subscribe') {
      icon = '&#x2B50;';
      const tier = e.tier === '2000' ? 'Tier 2' : e.tier === '3000' ? 'Tier 3' : 'Tier 1';
      text = `<strong>${this._escapeHtml(e.user_name)}</strong> subscribed (${tier})!`;
    } else if (evt.type === 'channel.cheer') {
      icon = '&#x1F48E;';
      text = `<strong>${this._escapeHtml(e.user_name || 'Anonymous')}</strong> cheered <strong>${e.bits}</strong> bits!`;
      if (e.message) {
        text += `<br><span style="color:var(--text-secondary);">${this._escapeHtml(e.message)}</span>`;
      }
    } else if (evt.type === 'channel.raid') {
      icon = '&#x1F6E1;&#xFE0F;';
      text = `<strong>${this._escapeHtml(e.from_broadcaster_user_name)}</strong> raided with <strong>${e.viewers}</strong> viewers!`;
    } else {
      return null;
    }

    div.innerHTML = `
      <div class="alert-icon">${icon}</div>
      <div class="alert-body">
        <div class="alert-text">${text}</div>
        <div class="alert-time">${time}</div>
      </div>
    `;

    return div;
  }

  _cleanupAlertsSplit() {
    if (this._alertsRemoveListener) {
      this._alertsRemoveListener();
      this._alertsRemoveListener = null;
    }
    window.chatty.stopEventSub();
    this._alertsSplitId = null;
  }

  _userColor(name) {
    const TWITCH_COLORS = [
      '#FF0000', '#0000FF', '#008000', '#B22222', '#FF7F50',
      '#9ACD32', '#FF4500', '#2E8B57', '#DAA520', '#D2691E',
      '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return TWITCH_COLORS[Math.abs(hash) % TWITCH_COLORS.length];
  }

  // ── Session persistence ──

  serializeState() {
    const tabs = [];
    for (const tab of (window.tabManager?.tabs || [])) {
      const splitIds = this.tabSplits.get(tab.id) || [];
      const splits = splitIds
        .filter((sid) => {
          const s = this.splits.get(sid);
          return s && !s._isAlertsSplit;
        })
        .map((sid) => {
          const split = this.splits.get(sid);
          return {
            channel: split?.channel || null,
            flex: '1',
          };
        });
      tabs.push({
        tabId: tab.id,
        tabName: tab.name,
        splits,
      });
    }
    return {
      tabs,
      activeTabId: window.tabManager?.activeTabId || null,
    };
  }

  async restoreState(state) {
    if (!state || !state.tabs || state.tabs.length === 0) return false;

    for (const tabData of state.tabs) {
      const tab = window.tabManager.addTab(tabData.tabName);
      const tabId = tab.id;

      const defaultSplits = this.tabSplits.get(tabId) || [];
      for (const sid of [...defaultSplits]) {
        const panel = this.splits.get(sid)?.element;
        if (panel) {
          const prevGutter = panel.previousElementSibling;
          if (prevGutter && prevGutter.classList.contains('split-gutter')) prevGutter.remove();
          panel.remove();
        }
        this.splits.delete(sid);
      }
      this.tabSplits.set(tabId, []);

      for (const splitData of tabData.splits) {
        const newSplit = this.addSplit(tabId);
        if (!newSplit) continue;

        const channel = splitData.channel || splitData.videoId;
        if (channel) {
          await this.connectSplit(newSplit.id, channel);
        }
      }
    }

    if (state.activeTabId) {
      const oldIdx = state.tabs.findIndex((t) => t.tabId === state.activeTabId);
      if (oldIdx >= 0 && window.tabManager.tabs[oldIdx]) {
        window.tabManager.switchTo(window.tabManager.tabs[oldIdx].id);
      }
    }

    return true;
  }

  // ── Drag and drop reordering ──

  _setupDragDrop(panel, splitId) {
    const header = panel.querySelector('.split-header');
    let dragThreshold = false;
    let startX = 0;
    let startY = 0;

    header.addEventListener('mousedown', (e) => {
      // Don't drag from buttons
      if (e.target.closest('button') || e.target.closest('.split-channel-name')) return;
      const split = this.splits.get(splitId);
      if (!split) return;
      const tabSplitList = this.tabSplits.get(split.tabId) || [];
      if (tabSplitList.length <= 1) return;

      startX = e.clientX;
      startY = e.clientY;
      dragThreshold = false;

      const onMove = (me) => {
        const dx = Math.abs(me.clientX - startX);
        const dy = Math.abs(me.clientY - startY);
        if (!dragThreshold && (dx > 8 || dy > 8)) {
          dragThreshold = true;
          this._startDrag(splitId, panel);
        }
        if (dragThreshold) {
          this._onDragMove(me);
        }
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (dragThreshold) {
          this._endDrag();
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  _startDrag(splitId, panel) {
    const split = this.splits.get(splitId);
    if (!split) return;

    panel.classList.add('dragging');
    this._dragState = {
      splitId,
      tabId: split.tabId,
      targetId: null,
      position: null,
    };

    // Add drop indicators to all OTHER panels in the same tab
    const tabSplitList = this.tabSplits.get(split.tabId) || [];
    for (const sid of tabSplitList) {
      if (sid === splitId) continue;
      const s = this.splits.get(sid);
      if (!s?.element) continue;
      s.element.style.position = 'relative';
      const indicator = document.createElement('div');
      indicator.className = 'split-drop-indicator';
      indicator.style.display = 'none';
      s.element.appendChild(indicator);
    }
  }

  _onDragMove(e) {
    if (!this._dragState) return;
    const { splitId, tabId } = this._dragState;
    const tabSplitList = this.tabSplits.get(tabId) || [];

    let foundTarget = null;
    let foundPos = null;

    for (const sid of tabSplitList) {
      if (sid === splitId) continue;
      const s = this.splits.get(sid);
      if (!s?.element) continue;

      const rect = s.element.getBoundingClientRect();
      const indicator = s.element.querySelector('.split-drop-indicator');
      if (!indicator) continue;

      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        // Determine closest edge (left/right/top/bottom)
        const relX = (e.clientX - rect.left) / rect.width;
        const relY = (e.clientY - rect.top) / rect.height;
        const distLeft = relX;
        const distRight = 1 - relX;
        const distTop = relY;
        const distBottom = 1 - relY;
        const minDist = Math.min(distLeft, distRight, distTop, distBottom);

        let pos, css;
        if (minDist === distLeft) {
          pos = 'left';
          css = 'display:block;position:absolute;top:0;bottom:0;left:0;width:3px;background:var(--accent);z-index:50;border-radius:2px;pointer-events:none;';
        } else if (minDist === distRight) {
          pos = 'right';
          css = 'display:block;position:absolute;top:0;bottom:0;right:0;width:3px;background:var(--accent);z-index:50;border-radius:2px;pointer-events:none;';
        } else if (minDist === distTop) {
          pos = 'top';
          css = 'display:block;position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent);z-index:50;border-radius:2px;pointer-events:none;';
        } else {
          pos = 'bottom';
          css = 'display:block;position:absolute;bottom:0;left:0;right:0;height:3px;background:var(--accent);z-index:50;border-radius:2px;pointer-events:none;';
        }

        foundTarget = sid;
        foundPos = pos;
        indicator.style.cssText = css;
      } else {
        indicator.style.display = 'none';
      }
    }

    this._dragState.targetId = foundTarget;
    this._dragState.position = foundPos;
  }

  _endDrag() {
    if (!this._dragState) return;
    const { splitId, tabId, targetId, position } = this._dragState;

    // Remove dragging class
    const panel = this.splits.get(splitId)?.element;
    if (panel) panel.classList.remove('dragging');

    // Remove all drop indicators
    const tabSplitList = this.tabSplits.get(tabId) || [];
    for (const sid of tabSplitList) {
      const s = this.splits.get(sid);
      if (!s?.element) continue;
      const ind = s.element.querySelector('.split-drop-indicator');
      if (ind) ind.remove();
    }

    // Perform the move
    if (targetId && targetId !== splitId && position) {
      this._reorderSplit(splitId, targetId, position, tabId);
    }

    this._dragState = null;
  }

  _reorderSplit(draggedId, targetId, position, tabId) {
    const wrapper = this.container.querySelector(`[data-tab-id="${tabId}"]`);
    if (!wrapper) return;

    const tabSplitList = this.tabSplits.get(tabId);
    const dragIdx = tabSplitList.indexOf(draggedId);
    const targetIdx = tabSplitList.indexOf(targetId);
    if (dragIdx === -1 || targetIdx === -1) return;

    if (position === 'top' || position === 'bottom') {
      // Vertical stacking: wrap target in a column if not already, then add dragged split
      const targetSplit = this.splits.get(targetId);
      const draggedSplit = this.splits.get(draggedId);
      if (!targetSplit?.element || !draggedSplit?.element) return;

      // Remove dragged from its current position in the tabSplitList
      tabSplitList.splice(dragIdx, 1);

      // Check if target is already inside a vertical column
      let column = targetSplit.element.parentElement;
      if (!column?.classList.contains('split-column')) {
        // Create a new column container and wrap the target in it
        column = document.createElement('div');
        column.className = 'split-column';
        column.style.cssText = 'display:flex;flex-direction:column;flex:1;min-width:0;';
        targetSplit.element.parentElement.insertBefore(column, targetSplit.element);
        column.appendChild(targetSplit.element);
      }

      // Add a horizontal gutter between stacked splits
      const hGutter = document.createElement('div');
      hGutter.className = 'split-gutter-h';
      hGutter.style.cssText = 'height:var(--split-gutter, 4px);background:transparent;cursor:row-resize;flex-shrink:0;';

      // Remove dragged element from old parent (may be another column or wrapper)
      draggedSplit.element.remove();

      // Insert above or below
      if (position === 'top') {
        column.insertBefore(draggedSplit.element, targetSplit.element);
        column.insertBefore(hGutter, targetSplit.element);
      } else {
        const nextSibling = targetSplit.element.nextSibling;
        if (nextSibling) {
          column.insertBefore(hGutter, nextSibling);
          column.insertBefore(draggedSplit.element, hGutter.nextSibling);
        } else {
          column.appendChild(hGutter);
          column.appendChild(draggedSplit.element);
        }
      }

      // Make stacked splits share height equally
      column.querySelectorAll('.split-panel').forEach((p) => {
        p.style.flex = '1';
      });

      // Clean up: if any column now has only 1 split, unwrap it
      this._cleanupColumns(wrapper);

      // Remove empty gutters between columns in the wrapper
      this._rebuildGutters(wrapper, tabId);
      this._equalizeSplits(tabId);
      saveSession();
    } else {
      // Horizontal reorder (left/right) — original behavior
      tabSplitList.splice(dragIdx, 1);

      let insertIdx = tabSplitList.indexOf(targetId);
      if (position === 'right') insertIdx++;
      tabSplitList.splice(insertIdx, 0, draggedId);

      // If dragged was in a column, extract it first
      const draggedSplit = this.splits.get(draggedId);
      if (draggedSplit?.element) {
        const oldColumn = draggedSplit.element.parentElement;
        if (oldColumn?.classList.contains('split-column')) {
          draggedSplit.element.remove();
          this._cleanupColumns(wrapper);
        }
      }

      // Rebuild the DOM: remove all children, re-add in order
      while (wrapper.firstChild) wrapper.firstChild.remove();

      for (let i = 0; i < tabSplitList.length; i++) {
        if (i > 0) {
          const gutter = document.createElement('div');
          gutter.className = 'split-gutter';
          gutter.dataset.splitLeft = tabSplitList[i - 1];
          gutter.dataset.splitRight = tabSplitList[i];
          this._setupGutterDrag(gutter);
          wrapper.appendChild(gutter);
        }
        const s = this.splits.get(tabSplitList[i]);
        if (s?.element) wrapper.appendChild(s.element);
      }

      this._equalizeSplits(tabId);
      saveSession();
    }
  }

  _cleanupColumns(wrapper) {
    // If a column has 0 or 1 split panels, unwrap it
    wrapper.querySelectorAll('.split-column').forEach((col) => {
      const panels = col.querySelectorAll(':scope > .split-panel');
      // Remove horizontal gutters if only 1 panel left
      if (panels.length <= 1) {
        col.querySelectorAll('.split-gutter-h').forEach((g) => g.remove());
        if (panels.length === 1) {
          col.parentElement.insertBefore(panels[0], col);
        }
        col.remove();
      } else {
        // Clean up orphaned gutters (e.g., two gutters in a row, or gutter at start/end)
        const children = Array.from(col.children);
        for (let i = children.length - 1; i >= 0; i--) {
          if (children[i].classList.contains('split-gutter-h')) {
            const prev = children[i - 1];
            const next = children[i + 1];
            if (!prev || prev.classList.contains('split-gutter-h') ||
                !next || next.classList.contains('split-gutter-h')) {
              children[i].remove();
            }
          }
        }
      }
    });
  }

  _rebuildGutters(wrapper, tabId) {
    // Remove all vertical gutters from wrapper level and rebuild them
    wrapper.querySelectorAll(':scope > .split-gutter').forEach((g) => g.remove());
    const topLevelChildren = Array.from(wrapper.children).filter(
      (c) => c.classList.contains('split-panel') || c.classList.contains('split-column')
    );
    // Re-insert gutters between them
    for (let i = topLevelChildren.length - 1; i > 0; i--) {
      const gutter = document.createElement('div');
      gutter.className = 'split-gutter';
      this._setupGutterDrag(gutter);
      wrapper.insertBefore(gutter, topLevelChildren[i]);
    }
  }

  // ── Helpers ──

  _showSplitError(split, message) {
    const body = split.element.querySelector('.split-body');
    body.innerHTML = `
      <div class="split-empty">
        <div class="split-empty-icon">&#x26A0;&#xFE0F;</div>
        <div style="color:var(--text-secondary);text-align:center;max-width:280px;">${message}</div>
        <button class="btn-connect-chat">Try Again</button>
      </div>
    `;
    body.querySelector('.btn-connect-chat').addEventListener('click', () => {
      this._openSearchForSplit(split.id);
    });
  }

  _openSearchForSplit(splitId) {
    const target = document.getElementById('search-target');
    target.dataset.splitId = splitId;
    document.getElementById('search-overlay').classList.remove('hidden');
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  _setupGutterDrag(gutter) {
    let startX = 0;
    let leftPanel = null;
    let rightPanel = null;
    let leftStart = 0;
    let rightStart = 0;
    let totalWidth = 0;

    const onMouseDown = (e) => {
      e.preventDefault();
      startX = e.clientX;
      gutter.classList.add('active');

      const leftId = gutter.dataset.splitLeft;
      const rightId = gutter.dataset.splitRight;
      leftPanel = gutter.parentElement.querySelector(`[data-split-id="${leftId}"]`);
      rightPanel = gutter.parentElement.querySelector(`[data-split-id="${rightId}"]`);

      if (!leftPanel || !rightPanel) return;

      leftStart = leftPanel.offsetWidth;
      rightStart = rightPanel.offsetWidth;
      totalWidth = leftStart + rightStart;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      const newLeft = Math.max(120, leftStart + dx);
      const newRight = Math.max(120, totalWidth - newLeft);

      leftPanel.style.flex = `0 0 ${newLeft}px`;
      rightPanel.style.flex = `0 0 ${newRight}px`;
    };

    const onMouseUp = () => {
      gutter.classList.remove('active');
      if (leftPanel && rightPanel) {
        const leftW = leftPanel.offsetWidth;
        const rightW = rightPanel.offsetWidth;
        const total = leftW + rightW;
        leftPanel.style.flex = `${leftW / total}`;
        rightPanel.style.flex = `${rightW / total}`;
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      saveSession();
    };

    gutter.addEventListener('mousedown', onMouseDown);
  }
}
