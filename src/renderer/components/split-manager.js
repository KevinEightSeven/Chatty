/**
 * SplitManager — Manages split panels within tabs.
 * Layout model: wrapper (column) > rows (horizontal) > splits
 * All splits and rows are always equal size (flex: 1), no drag-to-resize.
 * Dropping top/bottom creates a new full-width row.
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
    this.selectedSplitId = null;
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
      wrapper.style.cssText = 'display:flex;flex-direction:column;flex:1;height:100%;';
      this.container.appendChild(wrapper);
      this.initTab(tabId);
    }
    wrapper.style.display = 'flex';
  }

  // ── Split CRUD ──

  addSplit(tabId, targetRow) {
    const splitId = `split-${++this.splitIdCounter}`;
    const wrapper = this.container.querySelector(`[data-tab-id="${tabId}"]`);
    if (!wrapper) return null;

    // Find or create a row to add the split to
    let row = targetRow;
    if (!row) {
      row = wrapper.querySelector('.split-row:last-child');
    }
    if (!row) {
      row = document.createElement('div');
      row.className = 'split-row';
      row.style.cssText = 'display:flex;flex:1;min-height:0;';
      wrapper.appendChild(row);
    }

    // Add gutter if there are already splits in this row
    const existingPanels = row.querySelectorAll(':scope > .split-panel');
    if (existingPanels.length > 0) {
      const gutter = document.createElement('div');
      gutter.className = 'split-gutter';
      row.appendChild(gutter);
    }

    const panel = document.createElement('div');
    panel.className = 'split-panel';
    panel.dataset.splitId = splitId;
    panel.style.flex = '1';
    panel.innerHTML = `
      <div class="split-header">
        <span class="split-channel-name">No channel</span>
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

    row.appendChild(panel);

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

    // Click panel to select it
    panel.addEventListener('mousedown', (e) => {
      // Don't select when clicking input or buttons
      if (e.target.closest('input') || e.target.closest('button')) return;
      this.selectSplit(splitId);
    });

    // Click channel name to open popout video player
    panel.querySelector('.split-channel-name').addEventListener('click', () => {
      if (splitData.channel) {
        window.chatty.openPopoutPlayer(splitData.channel);
      }
    });

    // Drag-and-drop reordering
    this._setupDragDrop(panel, splitId);

    // Auto-select if it's the first/only split
    if (!this.selectedSplitId) {
      this.selectSplit(splitId);
    }

    return splitData;
  }

  _equalizeSplits(tabId) {
    const wrapper = this.container.querySelector(`[data-tab-id="${tabId}"]`);
    if (!wrapper) return;
    // All rows equal height
    wrapper.querySelectorAll(':scope > .split-row').forEach((row) => {
      row.style.flex = '1';
    });
    // All splits equal width within their rows
    const tabSplitList = this.tabSplits.get(tabId) || [];
    for (const sid of tabSplitList) {
      const s = this.splits.get(sid);
      if (s?.element) {
        s.element.style.flex = '1';
      }
    }
  }

  selectSplit(splitId) {
    // Deselect previous
    if (this.selectedSplitId) {
      const prev = this.splits.get(this.selectedSplitId);
      if (prev?.element) prev.element.classList.remove('selected');
    }

    this.selectedSplitId = splitId;
    const split = this.splits.get(splitId);
    if (split?.element) split.element.classList.add('selected');

    this._updateActionButtons();
  }

  _updateActionButtons() {
    const split = this.selectedSplitId ? this.splits.get(this.selectedSplitId) : null;
    const hasChannel = split?.channel;

    const infoBtn = document.getElementById('act-info');
    const usersBtn = document.getElementById('act-users');
    const videoBtn = document.getElementById('act-video');
    const searchBtn = document.getElementById('act-search');
    const closeBtn = document.getElementById('act-close');

    if (infoBtn) infoBtn.disabled = !hasChannel;
    if (usersBtn) usersBtn.disabled = !hasChannel;
    if (videoBtn) videoBtn.disabled = !hasChannel;
    if (searchBtn) searchBtn.disabled = !split;
    if (closeBtn) closeBtn.disabled = !split;

    // Update active states
    if (infoBtn) infoBtn.classList.toggle('active', !!(split?._showLiveInfo && split?.streamDetails));
    if (usersBtn) usersBtn.classList.toggle('active', !!split?._userListOpen);
  }

  removeSplit(splitId) {
    const split = this.splits.get(splitId);
    if (!split) return;

    // Clear selection if this was selected
    if (this.selectedSplitId === splitId) {
      this.selectedSplitId = null;
    }

    if (split.chatView) split.chatView.destroy();
    if (split._viewerInterval) clearInterval(split._viewerInterval);
    if (split._chattersInterval) clearInterval(split._chattersInterval);

    const tabId = split.tabId;
    const tabSplitList = this.tabSplits.get(tabId);

    const idx = tabSplitList.indexOf(splitId);
    if (idx !== -1) tabSplitList.splice(idx, 1);

    const wrapper = this.container.querySelector(`[data-tab-id="${tabId}"]`);
    const panel = wrapper.querySelector(`[data-split-id="${splitId}"]`);
    const row = panel.parentElement;

    // Remove adjacent gutter within the row
    const prevGutter = panel.previousElementSibling;
    const nextGutter = panel.nextElementSibling;
    if (prevGutter?.classList.contains('split-gutter')) prevGutter.remove();
    else if (nextGutter?.classList.contains('split-gutter')) nextGutter.remove();
    panel.remove();

    // If the row is now empty, remove it and adjacent horizontal gutter
    if (row.classList.contains('split-row') && row.querySelectorAll(':scope > .split-panel').length === 0) {
      const prevH = row.previousElementSibling;
      const nextH = row.nextElementSibling;
      if (prevH?.classList.contains('split-gutter-h')) prevH.remove();
      else if (nextH?.classList.contains('split-gutter-h')) nextH.remove();
      row.remove();
    }

    this.splits.delete(splitId);

    if (tabSplitList.length === 0) {
      this.addSplit(tabId);
    } else {
      this._equalizeSplits(tabId);
    }

    // Auto-select another split if available
    if (!this.selectedSplitId && tabSplitList.length > 0) {
      this.selectSplit(tabSplitList[0]);
    }
    this._updateActionButtons();
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

    // Update tab bar action buttons if this split is selected
    if (this.selectedSplitId === splitId) {
      this._updateActionButtons();
    }

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

      // Handle slash commands
      if (msg.startsWith('/')) {
        const handled = await this._handleSlashCommand(msg, split, splitId);
        if (handled) {
          sendBtn.disabled = false;
          inputEl.focus();
          return;
        }
      }

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

    // Update tab bar buttons if this split is selected
    this._updateActionButtons();

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
    this._updateActionButtons();

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

  // ── Slash commands ──

  async _handleSlashCommand(msg, split, splitId) {
    const parts = msg.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const status = await window.chatty.getAuthStatus();
    const myUserId = status.user?.userId;

    if (cmd === '/settitle') {
      const title = parts.slice(1).join(' ');
      if (!title) {
        split.chatView.addSystemMessage('Usage: /settitle <new stream title>');
        return true;
      }
      const res = await window.chatty.modifyChannel(split.broadcasterId, { title });
      if (res.error) {
        split.chatView.addSystemMessage(`Failed to set title: ${res.error}`);
      } else {
        split.chatView.addSystemMessage(`Title updated to: ${title}`);
        this._updateStreamDetails(split);
      }
      return true;
    }

    if (cmd === '/setgame') {
      const query = parts.slice(1).join(' ');
      this._showGamePicker(split, splitId, query);
      return true;
    }

    if (cmd === '/warn') {
      const target = parts[1]?.replace('@', '');
      const reason = parts.slice(2).join(' ') || 'Warned by moderator';
      if (!target) {
        split.chatView.addSystemMessage('Usage: /warn @username <reason>');
        return true;
      }
      const user = await window.chatty.getUser(target);
      if (!user || user.error) {
        split.chatView.addSystemMessage(`User "${target}" not found.`);
        return true;
      }
      const res = await window.chatty.warnUser(split.broadcasterId, myUserId, user.id, reason);
      if (res.error) {
        split.chatView.addSystemMessage(`Failed to warn ${target}: ${res.error}`);
      } else {
        split.chatView.addSystemMessage(`Warned ${target}: ${reason}`);
      }
      return true;
    }

    if (cmd === '/timeout') {
      const target = parts[1]?.replace('@', '');
      const duration = parseInt(parts[2]) || 600;
      const reason = parts.slice(3).join(' ') || '';
      if (!target) {
        split.chatView.addSystemMessage('Usage: /timeout @username [seconds] [reason]');
        return true;
      }
      const user = await window.chatty.getUser(target);
      if (!user || user.error) {
        split.chatView.addSystemMessage(`User "${target}" not found.`);
        return true;
      }
      const res = await window.chatty.banUser(split.broadcasterId, myUserId, user.id, reason, duration);
      if (res.error) {
        split.chatView.addSystemMessage(`Failed to timeout ${target}: ${res.error}`);
      } else {
        split.chatView.addSystemMessage(`Timed out ${target} for ${duration}s${reason ? ': ' + reason : ''}`);
      }
      return true;
    }

    if (cmd === '/ban') {
      const target = parts[1]?.replace('@', '');
      const reason = parts.slice(2).join(' ') || '';
      if (!target) {
        split.chatView.addSystemMessage('Usage: /ban @username [reason]');
        return true;
      }
      const user = await window.chatty.getUser(target);
      if (!user || user.error) {
        split.chatView.addSystemMessage(`User "${target}" not found.`);
        return true;
      }
      const res = await window.chatty.banUser(split.broadcasterId, myUserId, user.id, reason, 0);
      if (res.error) {
        split.chatView.addSystemMessage(`Failed to ban ${target}: ${res.error}`);
      } else {
        split.chatView.addSystemMessage(`Banned ${target}${reason ? ': ' + reason : ''}`);
      }
      return true;
    }

    return false;
  }

  async _showGamePicker(split, splitId, query) {
    // Remove any existing game picker
    const existing = split.element.querySelector('.game-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.className = 'game-picker';
    picker.innerHTML = `
      <div class="game-picker-header">
        <span>Select Category</span>
        <button class="game-picker-close">&times;</button>
      </div>
      <input type="text" class="game-picker-search" placeholder="Search categories..." value="${this._escapeHtml(query || '')}">
      <div class="game-picker-results"></div>
    `;
    split.element.appendChild(picker);

    const searchInput = picker.querySelector('.game-picker-search');
    const resultsEl = picker.querySelector('.game-picker-results');
    const closeBtn = picker.querySelector('.game-picker-close');

    closeBtn.addEventListener('click', () => picker.remove());

    const doSearch = async (q) => {
      if (!q) {
        resultsEl.innerHTML = '<div class="game-picker-hint">Type to search categories...</div>';
        // Show top games as default
        const top = await window.chatty.getTopGames(15);
        if (top.items?.length) {
          this._renderGameResults(resultsEl, top.items, split, picker);
        }
        return;
      }
      resultsEl.innerHTML = '<div class="game-picker-hint">Searching...</div>';
      const res = await window.chatty.searchCategories(q, 15);
      if (res.items?.length) {
        this._renderGameResults(resultsEl, res.items, split, picker);
      } else {
        resultsEl.innerHTML = '<div class="game-picker-hint">No categories found.</div>';
      }
    };

    let searchTimeout = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => doSearch(searchInput.value.trim()), 300);
    });

    searchInput.focus();
    doSearch(query || '');
  }

  _renderGameResults(container, items, split, picker) {
    container.innerHTML = '';
    for (const game of items) {
      const boxArt = (game.box_art_url || '')
        .replace('{width}', '40').replace('{height}', '54');
      const el = document.createElement('div');
      el.className = 'game-picker-item';
      el.innerHTML = `
        ${boxArt ? `<img src="${boxArt}" class="game-picker-art">` : ''}
        <span class="game-picker-name">${this._escapeHtml(game.name)}</span>
      `;
      el.addEventListener('click', async () => {
        const res = await window.chatty.modifyChannel(split.broadcasterId, { game_id: game.id });
        if (res.error) {
          split.chatView.addSystemMessage(`Failed to set game: ${res.error}`);
        } else {
          split.chatView.addSystemMessage(`Category updated to: ${game.name}`);
          this._updateStreamDetails(split);
        }
        picker.remove();
      });
      container.appendChild(el);
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
      this._updateActionButtons();
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
    this._updateActionButtons();

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

        const broadcaster = split.chatView.users.get(split.channel);
        if (broadcaster) {
          broadcaster.badges = { ...broadcaster.badges, broadcaster: true };
        }

        // Mark known bots
        const knownBots = ['nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot',
          'wizebot', 'botisimo', 'soundalerts', 'pretzelrocks', 'sery_bot', 'pokemoncommunitygame',
          'streamstickers', 'lolrankbot', 'buttsbot', 'own3d', 'ankhbot', 'deepbot', 'coebot',
          'phantombot', 'stay_hydrated_bot', 'commanderroot', 'vivbot', 'supibot', 'okayeg'];
        for (const [username, u] of split.chatView.users) {
          if (knownBots.includes(username) && !u.badges?.broadcaster && !u.badges?.moderator) {
            u.badges = { ...u.badges, bot: true };
          }
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
      editors: [],
      moderators: [],
      bots: [],
      viewers: [],
    };

    for (const u of users) {
      if (u.badges?.broadcaster) categories.broadcaster.push(u);
      else if (u.badges?.editor) categories.editors.push(u);
      else if (u.badges?.moderator) categories.moderators.push(u);
      else if (u.badges?.bot) categories.bots.push(u);
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
    renderCategory('Editors', categories.editors);
    renderCategory('Moderators', categories.moderators);
    renderCategory('Bots', categories.bots);
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

    // Alerts panel has no per-split actions

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
      const wrapper = this.container.querySelector(`[data-tab-id="${tab.id}"]`);
      const rows = [];
      if (wrapper) {
        wrapper.querySelectorAll(':scope > .split-row').forEach((row) => {
          const splits = [];
          row.querySelectorAll(':scope > .split-panel').forEach((panel) => {
            const sid = panel.dataset.splitId;
            const split = this.splits.get(sid);
            if (split && !split._isAlertsSplit) {
              splits.push({ channel: split.channel || null });
            }
          });
          if (splits.length > 0) rows.push({ splits });
        });
      }
      tabs.push({ tabId: tab.id, tabName: tab.name, rows });
    }
    return { tabs, activeTabId: window.tabManager?.activeTabId || null };
  }

  async restoreState(state) {
    if (!state || !state.tabs || state.tabs.length === 0) return false;

    for (const tabData of state.tabs) {
      const tab = window.tabManager.addTab(tabData.tabName);
      const tabId = tab.id;

      // Remove the default split created by addTab
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

      // Remove default empty rows
      const wrapper = this.container.querySelector(`[data-tab-id="${tabId}"]`);
      if (wrapper) {
        wrapper.querySelectorAll('.split-row').forEach((r) => r.remove());
      }

      // Support both old format (flat splits array) and new format (rows array)
      const rowsData = tabData.rows || (tabData.splits ? [{ splits: tabData.splits }] : []);

      for (const rowData of rowsData) {
        // Create a new row
        const row = document.createElement('div');
        row.className = 'split-row';
        row.style.cssText = 'display:flex;flex:1;min-height:0;';

        // Add horizontal gutter between rows
        if (wrapper.querySelectorAll(':scope > .split-row').length > 0) {
          const hGutter = document.createElement('div');
          hGutter.className = 'split-gutter-h';
          wrapper.appendChild(hGutter);
        }
        wrapper.appendChild(row);

        for (const splitData of rowData.splits) {
          const newSplit = this.addSplit(tabId, row);
          if (!newSplit) continue;

          const channel = splitData.channel || splitData.videoId;
          if (channel) {
            await this.connectSplit(newSplit.id, channel);
          }
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
      if (e.target.closest('button')) return;
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

    // Add 4-box direction picker to all OTHER panels in the same tab
    const tabSplitList = this.tabSplits.get(split.tabId) || [];
    for (const sid of tabSplitList) {
      if (sid === splitId) continue;
      const s = this.splits.get(sid);
      if (!s?.element) continue;
      s.element.style.position = 'relative';
      const overlay = document.createElement('div');
      overlay.className = 'split-drop-overlay';
      overlay.innerHTML = `
        <div class="drop-zone drop-top" data-dir="top"></div>
        <div class="drop-zone drop-bottom" data-dir="bottom"></div>
        <div class="drop-zone drop-left" data-dir="left"></div>
        <div class="drop-zone drop-right" data-dir="right"></div>
      `;
      overlay.style.display = 'none';
      s.element.appendChild(overlay);
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
      const overlay = s.element.querySelector('.split-drop-overlay');
      if (!overlay) continue;

      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        overlay.style.display = '';

        // Determine which zone the cursor is over
        const zones = overlay.querySelectorAll('.drop-zone');
        let hoveredDir = null;
        for (const zone of zones) {
          const zr = zone.getBoundingClientRect();
          if (e.clientX >= zr.left && e.clientX <= zr.right &&
              e.clientY >= zr.top && e.clientY <= zr.bottom) {
            hoveredDir = zone.dataset.dir;
            zone.classList.add('active');
          } else {
            zone.classList.remove('active');
          }
        }

        if (hoveredDir) {
          foundTarget = sid;
          foundPos = hoveredDir;
        }
      } else {
        overlay.style.display = 'none';
        overlay.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('active'));
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

    // Remove all drop overlays
    const tabSplitList = this.tabSplits.get(tabId) || [];
    for (const sid of tabSplitList) {
      const s = this.splits.get(sid);
      if (!s?.element) continue;
      const ov = s.element.querySelector('.split-drop-overlay');
      if (ov) ov.remove();
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

    const draggedSplit = this.splits.get(draggedId);
    const targetSplit = this.splits.get(targetId);
    if (!draggedSplit?.element || !targetSplit?.element) return;

    const draggedPanel = draggedSplit.element;
    const oldRow = draggedPanel.parentElement;

    // Remove dragged panel from its current row (with adjacent gutter)
    const prevGutter = draggedPanel.previousElementSibling;
    const nextGutter = draggedPanel.nextElementSibling;
    if (prevGutter?.classList.contains('split-gutter')) prevGutter.remove();
    else if (nextGutter?.classList.contains('split-gutter')) nextGutter.remove();
    draggedPanel.remove();

    // Clean up old row if it's now empty
    if (oldRow?.classList.contains('split-row') && oldRow.querySelectorAll(':scope > .split-panel').length === 0) {
      const prevH = oldRow.previousElementSibling;
      const nextH = oldRow.nextElementSibling;
      if (prevH?.classList.contains('split-gutter-h')) prevH.remove();
      else if (nextH?.classList.contains('split-gutter-h')) nextH.remove();
      oldRow.remove();
    }

    if (position === 'left' || position === 'right') {
      // Insert into target's row
      const targetRow = targetSplit.element.parentElement;
      const gutter = document.createElement('div');
      gutter.className = 'split-gutter';

      if (position === 'left') {
        targetRow.insertBefore(draggedPanel, targetSplit.element);
        targetRow.insertBefore(gutter, targetSplit.element);
      } else {
        // Insert after target (skip past any gutter that follows target)
        let insertPoint = targetSplit.element.nextElementSibling;
        if (insertPoint?.classList.contains('split-gutter')) {
          insertPoint = insertPoint.nextElementSibling;
        }
        if (insertPoint) {
          targetRow.insertBefore(gutter, insertPoint);
          targetRow.insertBefore(draggedPanel, gutter.nextSibling);
        } else {
          targetRow.appendChild(gutter);
          targetRow.appendChild(draggedPanel);
        }
      }
    } else {
      // Top/bottom: create a new full-width row
      const newRow = document.createElement('div');
      newRow.className = 'split-row';
      newRow.style.cssText = 'display:flex;flex:1;min-height:0;';
      newRow.appendChild(draggedPanel);

      const hGutter = document.createElement('div');
      hGutter.className = 'split-gutter-h';

      const targetRow = targetSplit.element.parentElement;

      if (position === 'top') {
        wrapper.insertBefore(newRow, targetRow);
        wrapper.insertBefore(hGutter, targetRow);
      } else {
        // Insert after target row (skip past any horizontal gutter that follows)
        let insertPoint = targetRow.nextElementSibling;
        if (insertPoint?.classList.contains('split-gutter-h')) {
          insertPoint = insertPoint.nextElementSibling;
        }
        if (insertPoint) {
          wrapper.insertBefore(hGutter, insertPoint);
          wrapper.insertBefore(newRow, hGutter.nextSibling);
        } else {
          wrapper.appendChild(hGutter);
          wrapper.appendChild(newRow);
        }
      }
    }

    // Clean up any orphaned horizontal gutters at edges
    this._cleanupGutters(wrapper);
    this._equalizeSplits(tabId);
    saveSession();
  }

  _cleanupGutters(wrapper) {
    // Remove horizontal gutters at the start or end of the wrapper
    const children = Array.from(wrapper.children);
    if (children[0]?.classList.contains('split-gutter-h')) children[0].remove();
    const last = wrapper.lastElementChild;
    if (last?.classList.contains('split-gutter-h')) last.remove();

    // Remove consecutive horizontal gutters
    const updated = Array.from(wrapper.children);
    for (let i = updated.length - 1; i > 0; i--) {
      if (updated[i].classList.contains('split-gutter-h') &&
          updated[i - 1].classList.contains('split-gutter-h')) {
        updated[i].remove();
      }
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
}
