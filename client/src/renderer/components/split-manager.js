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
    this._modActionsSplitId = null;
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

    // Add gutter if there are already splits in this container
    const existingPanels = row.querySelectorAll(':scope > .split-panel');
    if (existingPanels.length > 0) {
      const gutter = document.createElement('div');
      gutter.className = row.classList.contains('split-column') ? 'split-gutter-h' : 'split-gutter';
      row.appendChild(gutter);
    }

    const panel = document.createElement('div');
    panel.className = 'split-panel';
    panel.dataset.splitId = splitId;
    panel.style.flex = '1';
    panel.innerHTML = `
      <div class="split-header">
        <span class="split-channel-name">No channel</span>
        <span class="room-mode-icons" style="display:none;">
          <span class="room-mode-icon" data-mode="followers" title="Followers-Only Mode">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </span>
          <span class="room-mode-icon" data-mode="subs" title="Subscribers-Only Mode">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </span>
          <span class="room-mode-icon" data-mode="emote" title="Emote-Only Mode">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 14s1.5 2 4 2 4-2 4-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="9.5" r="1.5"/><circle cx="15" cy="9.5" r="1.5"/></svg>
          </span>
        </span>
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

    // Click on live info title to expand/collapse long titles
    panel.querySelector('.live-info-title').addEventListener('click', () => {
      const liveInfo = panel.querySelector('.split-live-info');
      if (liveInfo) liveInfo.classList.toggle('expanded');
    });

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
      _isModActionsSplit: false,
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
    // All splits and columns equal width within their rows
    wrapper.querySelectorAll('.split-row').forEach((row) => {
      row.querySelectorAll(':scope > .split-panel, :scope > .split-column').forEach((child) => {
        child.style.flex = '1';
        child.style.flexBasis = '0';
        child.style.minWidth = '0';
      });
    });
    // All splits equal height within columns
    wrapper.querySelectorAll('.split-column').forEach((col) => {
      col.querySelectorAll(':scope > .split-panel').forEach((panel) => {
        panel.style.flex = '1';
        panel.style.flexBasis = '0';
        panel.style.minHeight = '0';
      });
    });
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
    const parent = panel.parentElement;

    // Remove adjacent gutter
    const prevGutter = panel.previousElementSibling;
    const nextGutter = panel.nextElementSibling;
    if (prevGutter?.classList.contains('split-gutter') || prevGutter?.classList.contains('split-gutter-h')) prevGutter.remove();
    else if (nextGutter?.classList.contains('split-gutter') || nextGutter?.classList.contains('split-gutter-h')) nextGutter.remove();
    panel.remove();

    // Unwrap column if only one panel remains
    if (parent?.classList.contains('split-column')) {
      this._unwrapColumnIfNeeded(parent);
    }

    // If the row is now empty, remove it and adjacent horizontal gutter
    const row = parent?.classList.contains('split-column') ? parent.parentElement : parent;
    if (row?.classList.contains('split-row') && row.querySelectorAll(':scope > .split-panel, :scope > .split-column').length === 0) {
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
      if (split?._isModActionsSplit) this._modActionsSplitId = null;
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

    // Room mode indicators (followers-only, subs-only, emote-only)
    const modeIcons = split.element.querySelector('.room-mode-icons');
    if (modeIcons) modeIcons.style.display = '';
    split._roomState = { followersOnly: false, subsOnly: false, emoteOnly: false };
    split.chatView.onRoomState = (state) => {
      if (state.followersOnly !== undefined) split._roomState.followersOnly = state.followersOnly;
      if (state.subsOnly !== undefined) split._roomState.subsOnly = state.subsOnly;
      if (state.emoteOnly !== undefined) split._roomState.emoteOnly = state.emoteOnly;
      this._updateRoomModeIcons(split);
    };

    split.chatView.start();

    // @mention autocomplete
    this._setupMentionAutocomplete(inputEl, split);

    // /command autocomplete
    this._setupCommandAutocomplete(inputEl, split);

    // /setgame inline category search
    this._setupGameAutocomplete(inputEl, split);

    const sendMessage = async () => {
      if (split._mentionOpen || split._cmdOpen || split._gameOpen) return; // Let autocomplete handle Enter
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
      if (e.key === 'Enter' && !split._mentionOpen && !split._cmdOpen && !split._gameOpen) sendMessage();
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
      this._checkActivePoll(split);
    }, 15000);

    // Initial poll check
    this._checkActivePoll(split);
  }

  async _checkActivePoll(split) {
    if (!split.broadcasterId || !split.chatView) return;
    try {
      const polls = await window.chatty.getPolls(split.broadcasterId);
      const poll = polls.items?.[0];
      const pollEl = split.element.querySelector('.split-poll');

      if (poll && poll.status === 'ACTIVE') {
        if (split._activePollId === poll.id && pollEl) {
          // Update existing poll display
          this._renderPollContent(pollEl, poll);
          return;
        }
        split._activePollId = poll.id;
        // Create poll display
        const el = document.createElement('div');
        el.className = 'split-poll';
        this._renderPollContent(el, poll);
        const chatEl = split.element.querySelector('.split-chat');
        if (chatEl) chatEl.parentNode.insertBefore(el, chatEl);
        // Remove old one if exists
        if (pollEl) pollEl.remove();
      } else {
        split._activePollId = null;
        if (pollEl) pollEl.remove();
      }
    } catch { /* ignore */ }
  }

  _renderPollContent(el, poll) {
    const totalVotes = poll.choices.reduce((sum, c) => sum + (c.votes || 0), 0);
    let html = `<div class="poll-title">POLL: ${this._escapeHtml(poll.title)}</div>`;
    for (const choice of poll.choices) {
      const votes = choice.votes || 0;
      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
      html += `<div class="poll-choice">
        <div class="poll-bar" style="width:${pct}%"></div>
        <span class="poll-choice-text">${this._escapeHtml(choice.title)}</span>
        <span class="poll-choice-pct">${pct}% (${votes})</span>
      </div>`;
    }
    el.innerHTML = html;
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
    const bid = split.broadcasterId;
    const sys = (m) => split.chatView.addSystemMessage(m);

    // Helper: resolve username to user object
    const resolveUser = async (name) => {
      if (!name) return null;
      const u = await window.chatty.getUser(name.replace('@', ''));
      if (!u || u.error) { sys(`User "${name}" not found.`); return null; }
      return u;
    };

    // ── Channel Management ──

    if (cmd === '/settitle') {
      const title = parts.slice(1).join(' ');
      if (!title) { sys('Usage: /settitle <new stream title>'); return true; }
      const res = await window.chatty.modifyChannel(bid, { title });
      sys(res.error ? `Failed: ${res.error}` : `Title updated to: ${title}`);
      if (!res.error) this._updateStreamDetails(split);
      return true;
    }

    if (cmd === '/setgame') {
      // Handled by inline game autocomplete — if user hits Enter without selecting, show the picker as fallback
      const query = parts.slice(1).join(' ');
      if (query) {
        this._showGamePicker(split, splitId, query);
      } else {
        split.chatView.addSystemMessage('Type /setgame followed by a category name to search.');
      }
      return true;
    }

    if (cmd === '/announce' || cmd === '/announceblue' || cmd === '/announcegreen' || cmd === '/announceorange' || cmd === '/announcepurple') {
      const message = parts.slice(1).join(' ');
      if (!message) { sys('Usage: /announce <message>'); return true; }
      const colorMap = { '/announce': 'primary', '/announceblue': 'blue', '/announcegreen': 'green', '/announceorange': 'orange', '/announcepurple': 'purple' };
      const res = await window.chatty.sendAnnouncement(bid, myUserId, message, colorMap[cmd]);
      if (res.error) sys(`Failed: ${res.error}`);
      return true;
    }

    if (cmd === '/ban') {
      const target = parts[1]; const reason = parts.slice(2).join(' ') || '';
      if (!target) { sys('Usage: /ban @username [reason]'); return true; }
      const u = await resolveUser(target); if (!u) return true;
      const res = await window.chatty.banUser(bid, myUserId, u.id, reason, 0);
      sys(res.error ? `Failed: ${res.error}` : `Banned ${u.display_name || target}`);
      return true;
    }

    if (cmd === '/unban' || cmd === '/untimeout') {
      const target = parts[1];
      if (!target) { sys(`Usage: ${cmd} @username`); return true; }
      const u = await resolveUser(target); if (!u) return true;
      const res = await window.chatty.unbanUser(bid, myUserId, u.id);
      sys(res.error ? `Failed: ${res.error}` : `Unbanned ${u.display_name || target}`);
      return true;
    }

    if (cmd === '/timeout') {
      const target = parts[1]; const duration = parseInt(parts[2]) || 600; const reason = parts.slice(3).join(' ') || '';
      if (!target) { sys('Usage: /timeout @username [seconds] [reason]'); return true; }
      const u = await resolveUser(target); if (!u) return true;
      const res = await window.chatty.banUser(bid, myUserId, u.id, reason, duration);
      sys(res.error ? `Failed: ${res.error}` : `Timed out ${u.display_name || target} for ${duration}s`);
      return true;
    }

    if (cmd === '/warn') {
      const target = parts[1]; const reason = parts.slice(2).join(' ') || 'Warned by moderator';
      if (!target) { sys('Usage: /warn @username <reason>'); return true; }
      const u = await resolveUser(target); if (!u) return true;
      const res = await window.chatty.warnUser(bid, myUserId, u.id, reason);
      sys(res.error ? `Failed: ${res.error}` : `Warned ${u.display_name || target}: ${reason}`);
      return true;
    }

    if (cmd === '/clear') {
      const res = await window.chatty.deleteMessage(bid, myUserId, null);
      sys(res.error ? `Failed: ${res.error}` : 'Chat cleared.');
      return true;
    }

    if (cmd === '/commercial') {
      const length = parseInt(parts[1]) || 30;
      const res = await window.chatty.startCommercial(bid, length);
      sys(res.error ? `Failed: ${res.error}` : `Started ${length}s commercial.`);
      return true;
    }

    if (cmd === '/emoteonly') {
      const res = await window.chatty.updateChatSettings(bid, myUserId, { emote_mode: true });
      sys(res.error ? `Failed: ${res.error}` : 'Emote-only mode enabled.');
      return true;
    }
    if (cmd === '/emoteonlyoff') {
      const res = await window.chatty.updateChatSettings(bid, myUserId, { emote_mode: false });
      sys(res.error ? `Failed: ${res.error}` : 'Emote-only mode disabled.');
      return true;
    }

    if (cmd === '/followers') {
      const mins = parseInt(parts[1]) || 0;
      const res = await window.chatty.updateChatSettings(bid, myUserId, { follower_mode: true, follower_mode_duration: mins });
      sys(res.error ? `Failed: ${res.error}` : `Followers-only mode enabled${mins ? ` (${mins} min)` : ''}.`);
      return true;
    }
    if (cmd === '/followersoff') {
      const res = await window.chatty.updateChatSettings(bid, myUserId, { follower_mode: false });
      sys(res.error ? `Failed: ${res.error}` : 'Followers-only mode disabled.');
      return true;
    }

    if (cmd === '/slow') {
      const secs = parseInt(parts[1]) || 30;
      const res = await window.chatty.updateChatSettings(bid, myUserId, { slow_mode: true, slow_mode_wait_time: secs });
      sys(res.error ? `Failed: ${res.error}` : `Slow mode enabled (${secs}s).`);
      return true;
    }
    if (cmd === '/slowoff') {
      const res = await window.chatty.updateChatSettings(bid, myUserId, { slow_mode: false });
      sys(res.error ? `Failed: ${res.error}` : 'Slow mode disabled.');
      return true;
    }

    if (cmd === '/subscribers') {
      const res = await window.chatty.updateChatSettings(bid, myUserId, { subscriber_mode: true });
      sys(res.error ? `Failed: ${res.error}` : 'Subscribers-only mode enabled.');
      return true;
    }
    if (cmd === '/subscribersoff') {
      const res = await window.chatty.updateChatSettings(bid, myUserId, { subscriber_mode: false });
      sys(res.error ? `Failed: ${res.error}` : 'Subscribers-only mode disabled.');
      return true;
    }

    if (cmd === '/uniquechat') {
      const res = await window.chatty.updateChatSettings(bid, myUserId, { unique_chat_mode: true });
      sys(res.error ? `Failed: ${res.error}` : 'Unique chat mode enabled.');
      return true;
    }
    if (cmd === '/uniquechatoff') {
      const res = await window.chatty.updateChatSettings(bid, myUserId, { unique_chat_mode: false });
      sys(res.error ? `Failed: ${res.error}` : 'Unique chat mode disabled.');
      return true;
    }

    if (cmd === '/mod') {
      const target = parts[1];
      if (!target) { sys('Usage: /mod @username'); return true; }
      const u = await resolveUser(target); if (!u) return true;
      const res = await window.chatty.addModerator(bid, u.id);
      sys(res.error ? `Failed: ${res.error}` : `${u.display_name || target} is now a moderator.`);
      return true;
    }
    if (cmd === '/unmod') {
      const target = parts[1];
      if (!target) { sys('Usage: /unmod @username'); return true; }
      const u = await resolveUser(target); if (!u) return true;
      const res = await window.chatty.removeModerator(bid, u.id);
      sys(res.error ? `Failed: ${res.error}` : `${u.display_name || target} is no longer a moderator.`);
      return true;
    }

    if (cmd === '/vip') {
      const target = parts[1];
      if (!target) { sys('Usage: /vip @username'); return true; }
      const u = await resolveUser(target); if (!u) return true;
      const res = await window.chatty.addVIP(bid, u.id);
      sys(res.error ? `Failed: ${res.error}` : `${u.display_name || target} is now a VIP.`);
      return true;
    }
    if (cmd === '/unvip') {
      const target = parts[1];
      if (!target) { sys('Usage: /unvip @username'); return true; }
      const u = await resolveUser(target); if (!u) return true;
      const res = await window.chatty.removeVIP(bid, u.id);
      sys(res.error ? `Failed: ${res.error}` : `${u.display_name || target} is no longer a VIP.`);
      return true;
    }

    if (cmd === '/raid') {
      const target = parts[1];
      if (!target) { sys('Usage: /raid <channel>'); return true; }
      const u = await resolveUser(target); if (!u) return true;
      const res = await window.chatty.startRaid(bid, u.id);
      sys(res.error ? `Failed: ${res.error}` : `Raiding ${u.display_name || target}!`);
      return true;
    }
    if (cmd === '/unraid') {
      const res = await window.chatty.cancelRaid(bid);
      sys(res.error ? `Failed: ${res.error}` : 'Raid cancelled.');
      return true;
    }

    if (cmd === '/shoutout') {
      const target = parts[1];
      if (!target) { sys('Usage: /shoutout @username'); return true; }
      const u = await resolveUser(target); if (!u) return true;
      const res = await window.chatty.sendShoutout(bid, u.id, myUserId);
      sys(res.error ? `Failed: ${res.error}` : `Shoutout sent for ${u.display_name || target}!`);
      return true;
    }

    if (cmd === '/marker') {
      const desc = parts.slice(1).join(' ') || 'Marker';
      const res = await window.chatty.createStreamMarker(myUserId, desc);
      sys(res.error ? `Failed: ${res.error}` : `Stream marker created: ${desc}`);
      return true;
    }

    if (cmd === '/shield') {
      const res = await window.chatty.updateShieldMode(bid, myUserId, true);
      sys(res.error ? `Failed: ${res.error}` : 'Shield mode activated.');
      return true;
    }
    if (cmd === '/shieldoff') {
      const res = await window.chatty.updateShieldMode(bid, myUserId, false);
      sys(res.error ? `Failed: ${res.error}` : 'Shield mode deactivated.');
      return true;
    }

    if (cmd === '/endpoll') {
      const polls = await window.chatty.getPolls(bid);
      if (!polls.items?.length) { sys('No active poll found.'); return true; }
      const res = await window.chatty.endPoll(bid, polls.items[0].id, 'TERMINATED');
      sys(res.error ? `Failed: ${res.error}` : 'Poll ended.');
      return true;
    }
    if (cmd === '/deletepoll') {
      const polls = await window.chatty.getPolls(bid);
      if (!polls.items?.length) { sys('No active poll found.'); return true; }
      const res = await window.chatty.endPoll(bid, polls.items[0].id, 'ARCHIVED');
      sys(res.error ? `Failed: ${res.error}` : 'Poll deleted.');
      return true;
    }

    // ── Twitch user commands ──

    if (cmd === '/block') {
      const target = parts[1];
      if (!target) { sys('Usage: /block @username'); return true; }
      const u = await resolveUser(target); if (!u) return true;
      const res = await window.chatty.blockUser(u.id);
      sys(res.error ? `Failed: ${res.error}` : `Blocked ${u.display_name || target}.`);
      return true;
    }
    if (cmd === '/unblock') {
      const target = parts[1];
      if (!target) { sys('Usage: /unblock @username'); return true; }
      const u = await resolveUser(target); if (!u) return true;
      const res = await window.chatty.unblockUser(u.id);
      sys(res.error ? `Failed: ${res.error}` : `Unblocked ${u.display_name || target}.`);
      return true;
    }

    if (cmd === '/color') {
      const color = parts[1];
      if (!color) { sys('Usage: /color <color> (e.g. blue, #FF0000)'); return true; }
      const res = await window.chatty.updateChatColor(myUserId, color);
      sys(res.error ? `Failed: ${res.error}` : `Chat color updated to ${color}.`);
      return true;
    }

    if (cmd === '/me') {
      // /me is sent as a regular IRC ACTION message
      const message = parts.slice(1).join(' ');
      if (!message) return true;
      const res = await window.chatty.sendChat(split.channel, `/me ${message}`, bid);
      if (res.error) sys(`Failed: ${res.error}`);
      return true;
    }

    if (cmd === '/mods') {
      const mods = await window.chatty.getModerators(bid, 100);
      if (mods.items?.length) {
        sys(`Moderators: ${mods.items.map(m => m.user_name).join(', ')}`);
      } else {
        sys('No moderators found.');
      }
      return true;
    }

    if (cmd === '/vips') {
      const vips = await window.chatty.getVIPs(bid, 100);
      if (vips.items?.length) {
        sys(`VIPs: ${vips.items.map(v => v.user_name).join(', ')}`);
      } else {
        sys('No VIPs found.');
      }
      return true;
    }

    if (cmd === '/user') {
      const target = parts[1];
      if (!target) { sys('Usage: /user @username'); return true; }
      const u = await resolveUser(target); if (!u) return true;
      if (split.chatView) split.chatView._showProfileCard(u.login, split.element);
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

  _getCommandList(split) {
    const isMod = split.chatView?.isModerator || false;
    const isBroadcaster = split.chatView?.myUsername === split.channel;

    // Everyone can use these
    const cmds = [
      { cmd: '/me', desc: 'Express an action in third person', args: '[message]' },
      { cmd: '/mods', desc: 'List moderators', args: '' },
      { cmd: '/vips', desc: 'List VIPs', args: '' },
      { cmd: '/user', desc: 'View a user\'s profile card', args: '[username]' },
      { cmd: '/block', desc: 'Block a user', args: '[username]' },
      { cmd: '/unblock', desc: 'Unblock a user', args: '[username]' },
      { cmd: '/color', desc: 'Change your chat color', args: '[color]' },
    ];

    // Mod+ commands
    if (isMod || isBroadcaster) {
      cmds.push(
        { cmd: '/ban', desc: 'Permanently ban a user', args: '[username] [reason]' },
        { cmd: '/unban', desc: 'Unban a user', args: '[username]' },
        { cmd: '/timeout', desc: 'Temporarily ban a user', args: '[username] [seconds] [reason]' },
        { cmd: '/untimeout', desc: 'Remove a timeout', args: '[username]' },
        { cmd: '/warn', desc: 'Warn a user', args: '[username] [reason]' },
        { cmd: '/clear', desc: 'Clear chat', args: '' },
        { cmd: '/announce', desc: 'Send an announcement', args: '[message]' },
        { cmd: '/announceblue', desc: 'Blue announcement', args: '[message]' },
        { cmd: '/announcegreen', desc: 'Green announcement', args: '[message]' },
        { cmd: '/announceorange', desc: 'Orange announcement', args: '[message]' },
        { cmd: '/announcepurple', desc: 'Purple announcement', args: '[message]' },
        { cmd: '/slow', desc: 'Enable slow mode', args: '[seconds]' },
        { cmd: '/slowoff', desc: 'Disable slow mode', args: '' },
        { cmd: '/followers', desc: 'Followers-only mode', args: '[minutes]' },
        { cmd: '/followersoff', desc: 'Disable followers-only', args: '' },
        { cmd: '/subscribers', desc: 'Subscribers-only mode', args: '' },
        { cmd: '/subscribersoff', desc: 'Disable subs-only', args: '' },
        { cmd: '/emoteonly', desc: 'Emote-only mode', args: '' },
        { cmd: '/emoteonlyoff', desc: 'Disable emote-only', args: '' },
        { cmd: '/uniquechat', desc: 'Unique message mode', args: '' },
        { cmd: '/uniquechatoff', desc: 'Disable unique mode', args: '' },
        { cmd: '/shoutout', desc: 'Shoutout a user', args: '[username]' },
        { cmd: '/shield', desc: 'Activate shield mode', args: '' },
        { cmd: '/shieldoff', desc: 'Deactivate shield mode', args: '' },
      );
    }

    // Broadcaster/editor commands
    if (isBroadcaster) {
      cmds.push(
        { cmd: '/settitle', desc: 'Change stream title', args: '[title]' },
        { cmd: '/setgame', desc: 'Change stream category', args: '[game]' },
        { cmd: '/mod', desc: 'Grant moderator', args: '[username]' },
        { cmd: '/unmod', desc: 'Revoke moderator', args: '[username]' },
        { cmd: '/vip', desc: 'Grant VIP', args: '[username]' },
        { cmd: '/unvip', desc: 'Revoke VIP', args: '[username]' },
        { cmd: '/raid', desc: 'Raid a channel', args: '[channel]' },
        { cmd: '/unraid', desc: 'Cancel raid', args: '' },
        { cmd: '/commercial', desc: 'Run a commercial', args: '[length]' },
        { cmd: '/marker', desc: 'Add a stream marker', args: '[description]' },
        { cmd: '/endpoll', desc: 'End the active poll', args: '' },
        { cmd: '/deletepoll', desc: 'Delete the active poll', args: '' },
      );
    }

    return cmds.sort((a, b) => a.cmd.localeCompare(b.cmd));
  }

  _setupCommandAutocomplete(inputEl, split) {
    split._cmdOpen = false;
    split._cmdIdx = 0;
    let dropdown = null;
    let matches = [];

    const close = () => {
      if (dropdown) { dropdown.remove(); dropdown = null; }
      split._cmdOpen = false;
      matches = [];
      split._cmdIdx = 0;
    };

    const render = () => {
      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'cmd-autocomplete';
        inputEl.parentElement.appendChild(dropdown);
      }
      dropdown.innerHTML = matches
        .map((c, i) => `<div class="cmd-item${i === split._cmdIdx ? ' active' : ''}" data-idx="${i}">
          <span class="cmd-name">${c.cmd}</span>
          <span class="cmd-args">${c.args}</span>
          <span class="cmd-desc">${c.desc}</span>
        </div>`)
        .join('');

      dropdown.querySelectorAll('.cmd-item').forEach((el) => {
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          select(parseInt(el.dataset.idx));
        });
      });

      // Scroll active item into view
      const activeEl = dropdown.querySelector('.cmd-item.active');
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    };

    const select = (idx) => {
      if (!matches[idx]) { close(); return; }
      inputEl.value = matches[idx].cmd + ' ';
      inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
      close();
      inputEl.focus();
    };

    inputEl.addEventListener('input', () => {
      const val = inputEl.value;
      // Only trigger when the input starts with / and has no space yet (still typing command name)
      if (!val.startsWith('/') || val.includes(' ') || val.length < 1) { close(); return; }

      const partial = val.toLowerCase();
      const cmds = this._getCommandList(split);
      matches = val === '/'
        ? cmds
        : cmds.filter(c => c.cmd.startsWith(partial));

      if (matches.length === 0) { close(); return; }

      split._cmdOpen = true;
      split._cmdIdx = 0;
      render();
    });

    inputEl.addEventListener('keydown', (e) => {
      if (!split._cmdOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        split._cmdIdx = (split._cmdIdx + 1) % matches.length;
        render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        split._cmdIdx = (split._cmdIdx - 1 + matches.length) % matches.length;
        render();
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (split._cmdOpen && matches.length > 0) {
          e.preventDefault();
          select(split._cmdIdx);
        }
      } else if (e.key === 'Escape') {
        close();
      }
    });

    inputEl.addEventListener('blur', () => {
      setTimeout(close, 150);
    });
  }

  _setupGameAutocomplete(inputEl, split) {
    split._gameOpen = false;
    split._gameIdx = 0;
    let dropdown = null;
    let matches = [];
    let searchTimeout = null;
    let lastQuery = '';

    const close = () => {
      if (dropdown) { dropdown.remove(); dropdown = null; }
      split._gameOpen = false;
      matches = [];
      split._gameIdx = 0;
      lastQuery = '';
    };

    const render = () => {
      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'game-autocomplete';
        inputEl.parentElement.appendChild(dropdown);
      }
      dropdown.innerHTML = matches
        .map((game, i) => {
          const boxArt = (game.box_art_url || '')
            .replace('{width}', '40').replace('{height}', '54');
          return `<div class="game-picker-item${i === split._gameIdx ? ' active' : ''}" data-idx="${i}">
            ${boxArt ? `<img src="${boxArt}" class="game-picker-art">` : ''}
            <span class="game-picker-name">${this._escapeHtml(game.name)}</span>
          </div>`;
        })
        .join('');

      dropdown.querySelectorAll('.game-picker-item').forEach((el) => {
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectGame(parseInt(el.dataset.idx));
        });
      });

      const activeEl = dropdown.querySelector('.game-picker-item.active');
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    };

    const selectGame = async (idx) => {
      const game = matches[idx];
      if (!game) { close(); return; }
      close();
      inputEl.value = '';
      inputEl.focus();
      const res = await window.chatty.modifyChannel(split.broadcasterId, { game_id: game.id });
      if (res.error) {
        split.chatView.addSystemMessage(`Failed to set game: ${res.error}`);
      } else {
        split.chatView.addSystemMessage(`Category updated to: ${game.name}`);
        this._updateStreamDetails(split);
      }
    };

    const doSearch = async (query) => {
      if (query === lastQuery) return;
      lastQuery = query;
      if (!query) {
        const top = await window.chatty.getTopGames(10);
        if (top.items?.length) { matches = top.items; } else { matches = []; }
      } else {
        const res = await window.chatty.searchCategories(query, 10);
        matches = res.items || [];
      }
      // Check we're still in setgame mode
      if (!inputEl.value.toLowerCase().startsWith('/setgame ')) { close(); return; }
      if (matches.length === 0) { close(); return; }
      split._gameOpen = true;
      split._gameIdx = 0;
      render();
    };

    inputEl.addEventListener('input', () => {
      const val = inputEl.value;
      if (!val.toLowerCase().startsWith('/setgame ')) { close(); return; }

      const query = val.substring(9).trim();
      clearTimeout(searchTimeout);
      if (!query) {
        // Show top games immediately
        searchTimeout = setTimeout(() => doSearch(''), 100);
      } else {
        searchTimeout = setTimeout(() => doSearch(query), 300);
      }
    });

    inputEl.addEventListener('keydown', (e) => {
      if (!split._gameOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        split._gameIdx = (split._gameIdx + 1) % matches.length;
        render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        split._gameIdx = (split._gameIdx - 1 + matches.length) % matches.length;
        render();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (matches.length > 0) {
          e.preventDefault();
          selectGame(split._gameIdx);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });

    inputEl.addEventListener('blur', () => {
      setTimeout(close, 150);
    });
  }

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
          // Build set of currently active chatters from API
          const activeChatters = new Set(result.chatters.map(c => c.user_login));

          // Check if join/leave messages are enabled
          const showJoinLeave = await window.chatty.getConfig('settings.showJoinLeave') ?? true;

          // Detect joins — users in API response but not in our list
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
              if (showJoinLeave && split._hasInitialUserList) {
                split.chatView.addSystemMessage(`${chatter.user_name || username} has joined the channel`);
              }
            }
          }

          // Detect leaves — users in our list but not in API response
          for (const [username, userData] of split.chatView.users) {
            if (!activeChatters.has(username)) {
              if (showJoinLeave && split._hasInitialUserList) {
                split.chatView.addSystemMessage(`${userData.displayName || username} has left the channel`);
              }
              split.chatView.users.delete(username);
            }
          }

          // Mark that we've loaded the initial user list (don't spam joins on first fetch)
          if (!split._hasInitialUserList) {
            split._hasInitialUserList = true;
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

    await this._initAlertsSplit(newSplit);
    saveSession();
  }

  async _restoreAlertsSplit(tabId, row) {
    const newSplit = this.addSplit(tabId, row);
    if (!newSplit) return;
    await this._initAlertsSplit(newSplit);
  }

  async _initAlertsSplit(split) {
    split._isAlertsSplit = true;
    this._alertsSplitId = split.id;

    split.element.querySelector('.split-channel-name').textContent = 'Activity Feed';

    const body = split.element.querySelector('.split-body');
    body.innerHTML = `
      <div class="alerts-panel" style="display:flex;flex-direction:column;height:100%;">
        <div class="alert-empty">
          <div class="alert-empty-icon">&#x1F514;</div>
          <div>Loading activity feed...</div>
        </div>
      </div>
    `;

    // Get the current user's login to build the activity feed URL
    const authStatus = await window.chatty.getAuthStatus();
    if (!authStatus.loggedIn || !authStatus.user?.login) {
      body.innerHTML = `
        <div class="alerts-panel">
          <div class="alert-empty">
            <div class="alert-empty-icon">&#x26A0;&#xFE0F;</div>
            <div>Not logged in. Please log in to view activity feed.</div>
          </div>
        </div>
      `;
      return;
    }

    const username = authStatus.user.login;
    const feedUrl = `https://dashboard.twitch.tv/popout/u/${encodeURIComponent(username)}/stream-manager/activity-feed`;

    body.innerHTML = `
      <webview
        src="${feedUrl}"
        partition="persist:twitch-activity"
        style="width:100%;height:100%;border:none;"
        allowpopups
      ></webview>
    `;

    // Also start EventSub so the overlay server still gets alerts for OBS
    window.chatty.startEventSub();
  }

  _createAlertEntry(evt, savedTimestamp) {
    const div = document.createElement('div');
    div.className = 'alert-entry';

    const now = savedTimestamp ? new Date(savedTimestamp) : new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const e = evt.event;

    let icon = '';
    let text = '';

    if (evt.type === 'channel.follow') {
      // Skip self-follows (broadcaster can't follow their own channel)
      if (e.user_id && e.broadcaster_user_id && e.user_id === e.broadcaster_user_id) return null;
      icon = '&#x2764;&#xFE0F;';
      text = `<strong>${this._escapeHtml(e.user_name)}</strong> followed!`;
    } else if (evt.type === 'channel.subscribe') {
      // Skip gift subs — channel.subscription.gift already covers the gifter alert
      if (e.is_gift) return null;
      icon = '&#x2B50;';
      const tier = e.tier === '2000' ? 'Tier 2' : e.tier === '3000' ? 'Tier 3' : 'Tier 1';
      text = `<strong>${this._escapeHtml(e.user_name)}</strong> subscribed (${tier})!`;
    } else if (evt.type === 'channel.subscription.gift') {
      icon = '&#x1F381;';
      const tier = e.tier === '2000' ? 'Tier 2' : e.tier === '3000' ? 'Tier 3' : 'Tier 1';
      const gifter = e.is_anonymous ? 'Anonymous' : (e.user_name || 'Someone');
      const count = e.total || 1;
      const recipients = e._recipients || [];
      if (count === 1 && recipients.length === 1) {
        text = `<strong>${this._escapeHtml(gifter)}</strong> gifted <strong>${this._escapeHtml(recipients[0])}</strong> a sub (${tier})!`;
      } else if (recipients.length > 0) {
        text = `<strong>${this._escapeHtml(gifter)}</strong> gifted <strong>${count}</strong> subs (${tier})!`;
        text += `<br><span style="color:var(--text-secondary);">to ${recipients.map(r => this._escapeHtml(r)).join(', ')}</span>`;
      } else {
        text = `<strong>${this._escapeHtml(gifter)}</strong> gifted <strong>${count}</strong> sub${count > 1 ? 's' : ''} (${tier})!`;
      }
      if (e.cumulative_total) {
        text += `<br><span style="color:var(--text-secondary);">${e.cumulative_total} total gifts in this channel</span>`;
      }
    } else if (evt.type === 'channel.subscription.message') {
      icon = '&#x1F389;';
      const tier = e.tier === '2000' ? 'Tier 2' : e.tier === '3000' ? 'Tier 3' : 'Tier 1';
      const months = e.cumulative_months || 1;
      text = `<strong>${this._escapeHtml(e.user_name)}</strong> resubscribed (${tier}, ${months} months)!`;
      const msg = e.message?.text || e.message || '';
      if (msg) {
        text += `<br><span style="color:var(--text-secondary);">${this._escapeHtml(typeof msg === 'string' ? msg : '')}</span>`;
      }
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

  // ── Mod Actions panel ──

  async toggleModActionsSplit() {
    if (this._modActionsSplitId) {
      const existing = this.splits.get(this._modActionsSplitId);
      if (existing) {
        this.removeSplit(this._modActionsSplitId);
        this._modActionsSplitId = null;
        saveSession();
        return;
      }
      this._modActionsSplitId = null;
    }

    const activeTab = window.tabManager?.getActiveTab();
    if (!activeTab) return;

    const newSplit = this.addSplit(activeTab.id);
    if (!newSplit) return;

    await this._initModActionsSplit(newSplit);
    saveSession();
  }

  async _restoreModActionsSplit(tabId, row) {
    const newSplit = this.addSplit(tabId, row);
    if (!newSplit) return;
    await this._initModActionsSplit(newSplit);
  }

  async _initModActionsSplit(split) {
    split._isModActionsSplit = true;
    this._modActionsSplitId = split.id;

    split.element.querySelector('.split-channel-name').textContent = 'Mod Actions';

    const body = split.element.querySelector('.split-body');
    body.innerHTML = `
      <div class="alerts-panel" style="display:flex;flex-direction:column;height:100%;">
        <div class="alert-empty">
          <div class="alert-empty-icon">&#x2694;&#xFE0F;</div>
          <div>Loading mod actions...</div>
        </div>
      </div>
    `;

    const authStatus = await window.chatty.getAuthStatus();
    if (!authStatus.loggedIn || !authStatus.user?.login) {
      body.innerHTML = `
        <div class="alerts-panel">
          <div class="alert-empty">
            <div class="alert-empty-icon">&#x26A0;&#xFE0F;</div>
            <div>Not logged in. Please log in to view mod actions.</div>
          </div>
        </div>
      `;
      return;
    }

    const username = authStatus.user.login;
    const modUrl = `https://dashboard.twitch.tv/popout/u/${encodeURIComponent(username)}/stream-manager/moderation-actions`;

    body.innerHTML = `
      <webview
        src="${modUrl}"
        partition="persist:twitch-activity"
        style="width:100%;height:100%;border:none;"
        allowpopups
      ></webview>
    `;
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

  _serializePanelOrColumn(el) {
    if (el.classList.contains('split-panel')) {
      const sid = el.dataset.splitId;
      const split = this.splits.get(sid);
      if (!split) return null;
      return split._isAlertsSplit ? { isAlerts: true } : split._isModActionsSplit ? { isModActions: true } : { channel: split.channel || null };
    } else if (el.classList.contains('split-column')) {
      const colSplits = [];
      el.querySelectorAll(':scope > .split-panel').forEach((panel) => {
        const entry = this._serializePanelOrColumn(panel);
        if (entry) colSplits.push(entry);
      });
      return colSplits.length > 0 ? { column: colSplits } : null;
    }
    return null;
  }

  serializeState() {
    const tabs = [];
    for (const tab of (window.tabManager?.tabs || [])) {
      const wrapper = this.container.querySelector(`[data-tab-id="${tab.id}"]`);
      const rows = [];
      if (wrapper) {
        wrapper.querySelectorAll(':scope > .split-row').forEach((row) => {
          const splits = [];
          row.querySelectorAll(':scope > .split-panel, :scope > .split-column').forEach((child) => {
            const entry = this._serializePanelOrColumn(child);
            if (entry) splits.push(entry);
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
          if (splitData.column) {
            // Restore a column of vertically stacked splits
            const column = document.createElement('div');
            column.className = 'split-column';
            column.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';
            if (row.querySelectorAll(':scope > .split-panel, :scope > .split-column').length > 0) {
              const gutter = document.createElement('div');
              gutter.className = 'split-gutter';
              row.appendChild(gutter);
            }
            row.appendChild(column);
            for (let ci = 0; ci < splitData.column.length; ci++) {
              const colEntry = splitData.column[ci];
              if (ci > 0) {
                const hGutter = document.createElement('div');
                hGutter.className = 'split-gutter-h';
                column.appendChild(hGutter);
              }
              if (colEntry.isAlerts) {
                await this._restoreAlertsSplit(tabId, column);
              } else if (colEntry.isModActions) {
                await this._restoreModActionsSplit(tabId, column);
              } else {
                const newSplit = this.addSplit(tabId, column);
                if (newSplit && (colEntry.channel || colEntry.videoId)) {
                  await this.connectSplit(newSplit.id, colEntry.channel || colEntry.videoId);
                }
              }
            }
            continue;
          }
          if (splitData.isAlerts) {
            await this._restoreAlertsSplit(tabId, row);
            continue;
          }
          if (splitData.isModActions) {
            await this._restoreModActionsSplit(tabId, row);
            continue;
          }
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
    const oldParent = draggedPanel.parentElement;

    // Remove dragged panel from its current position (with adjacent gutter)
    const prevGutter = draggedPanel.previousElementSibling;
    const nextGutter = draggedPanel.nextElementSibling;
    if (prevGutter?.classList.contains('split-gutter') || prevGutter?.classList.contains('split-gutter-h')) prevGutter.remove();
    else if (nextGutter?.classList.contains('split-gutter') || nextGutter?.classList.contains('split-gutter-h')) nextGutter.remove();
    draggedPanel.remove();

    // Unwrap column if only one panel remains
    if (oldParent?.classList.contains('split-column')) {
      this._unwrapColumnIfNeeded(oldParent);
    }

    // Clean up old row if it's now empty
    const oldRow = oldParent?.classList.contains('split-column') ? oldParent.parentElement : oldParent;
    if (oldRow?.classList.contains('split-row') && oldRow.querySelectorAll(':scope > .split-panel, :scope > .split-column').length === 0) {
      const prevH = oldRow.previousElementSibling;
      const nextH = oldRow.nextElementSibling;
      if (prevH?.classList.contains('split-gutter-h')) prevH.remove();
      else if (nextH?.classList.contains('split-gutter-h')) nextH.remove();
      oldRow.remove();
    }

    if (position === 'left' || position === 'right') {
      // Insert into target's row (or column's parent row)
      const targetParent = targetSplit.element.parentElement;
      const targetRow = targetParent.classList.contains('split-column') ? targetParent.parentElement : targetParent;
      const insertRef = targetParent.classList.contains('split-column') ? targetParent : targetSplit.element;
      const gutter = document.createElement('div');
      gutter.className = 'split-gutter';

      if (position === 'left') {
        targetRow.insertBefore(draggedPanel, insertRef);
        targetRow.insertBefore(gutter, insertRef);
      } else {
        let insertPoint = insertRef.nextElementSibling;
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
      // Top/bottom: stack vertically
      const targetParent = targetSplit.element.parentElement;
      const isInColumn = targetParent.classList.contains('split-column');
      const targetRow = isInColumn ? targetParent.parentElement : targetParent;
      const rowPanelCount = targetRow.querySelectorAll(':scope > .split-panel, :scope > .split-column').length;

      if (isInColumn) {
        // Target is already in a column — insert within it
        const hGutter = document.createElement('div');
        hGutter.className = 'split-gutter-h';

        if (position === 'top') {
          targetParent.insertBefore(draggedPanel, targetSplit.element);
          targetParent.insertBefore(hGutter, targetSplit.element);
        } else {
          let insertPoint = targetSplit.element.nextElementSibling;
          if (insertPoint?.classList.contains('split-gutter-h')) insertPoint = insertPoint.nextElementSibling;
          if (insertPoint) {
            targetParent.insertBefore(hGutter, insertPoint);
            targetParent.insertBefore(draggedPanel, hGutter.nextSibling);
          } else {
            targetParent.appendChild(hGutter);
            targetParent.appendChild(draggedPanel);
          }
        }
      } else if (rowPanelCount > 1) {
        // Target is in a row with other panels — wrap target in a column
        const column = document.createElement('div');
        column.className = 'split-column';
        column.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';

        targetRow.insertBefore(column, targetSplit.element);
        column.appendChild(targetSplit.element);

        const hGutter = document.createElement('div');
        hGutter.className = 'split-gutter-h';

        if (position === 'top') {
          column.insertBefore(draggedPanel, targetSplit.element);
          column.insertBefore(hGutter, targetSplit.element);
        } else {
          column.appendChild(hGutter);
          column.appendChild(draggedPanel);
        }
      } else {
        // Target is alone in its row — create a new full-width row
        const newRow = document.createElement('div');
        newRow.className = 'split-row';
        newRow.style.cssText = 'display:flex;flex:1;min-height:0;';
        newRow.appendChild(draggedPanel);

        const hGutter = document.createElement('div');
        hGutter.className = 'split-gutter-h';

        if (position === 'top') {
          wrapper.insertBefore(newRow, targetRow);
          wrapper.insertBefore(hGutter, targetRow);
        } else {
          let insertPoint = targetRow.nextElementSibling;
          if (insertPoint?.classList.contains('split-gutter-h')) insertPoint = insertPoint.nextElementSibling;
          if (insertPoint) {
            wrapper.insertBefore(hGutter, insertPoint);
            wrapper.insertBefore(newRow, hGutter.nextSibling);
          } else {
            wrapper.appendChild(hGutter);
            wrapper.appendChild(newRow);
          }
        }
      }
    }

    // Clean up any orphaned horizontal gutters at edges
    this._cleanupGutters(wrapper);
    this._equalizeSplits(tabId);
    saveSession();
  }

  _updateRoomModeIcons(split) {
    if (!split?.element || !split._roomState) return;
    const icons = split.element.querySelector('.room-mode-icons');
    if (!icons) return;
    const state = split._roomState;
    icons.querySelector('[data-mode="followers"]').classList.toggle('active', !!state.followersOnly);
    icons.querySelector('[data-mode="subs"]').classList.toggle('active', !!state.subsOnly);
    icons.querySelector('[data-mode="emote"]').classList.toggle('active', !!state.emoteOnly);
  }

  _unwrapColumnIfNeeded(column) {
    if (!column?.classList.contains('split-column')) return;
    const panels = column.querySelectorAll(':scope > .split-panel');
    // Remove any orphaned gutters
    column.querySelectorAll(':scope > .split-gutter-h').forEach(g => {
      if (!g.previousElementSibling?.classList.contains('split-panel') ||
          !g.nextElementSibling?.classList.contains('split-panel')) {
        g.remove();
      }
    });
    if (panels.length === 0) {
      // Column is empty — remove it and adjacent gutter
      const prevG = column.previousElementSibling;
      const nextG = column.nextElementSibling;
      if (prevG?.classList.contains('split-gutter')) prevG.remove();
      else if (nextG?.classList.contains('split-gutter')) nextG.remove();
      column.remove();
    } else if (panels.length === 1) {
      // Unwrap: replace column with the single panel
      const single = panels[0];
      column.querySelectorAll(':scope > .split-gutter-h').forEach(g => g.remove());
      column.parentElement.insertBefore(single, column);
      column.remove();
    }
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
