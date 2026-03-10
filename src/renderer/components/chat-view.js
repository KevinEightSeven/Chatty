/**
 * ChatView — Handles rendering of Twitch IRC chat messages.
 * Features: auto-scroll, pause on scroll-up, go-to-bottom, clickable usernames,
 * user tracking, context menu moderation (ban/delete).
 */
class ChatView {
  constructor(element, channel, goToBottomBtn) {
    this.element = element;
    this.channel = channel.toLowerCase().replace('#', '');
    this.goToBottomBtn = goToBottomBtn;
    this.autoScroll = true;
    this.destroyed = false;
    this.maxMessages = 500;
    this.showTimestamps = true;
    this.isModerator = false;
    this.broadcasterId = null;
    this.myUserId = null;
    this.myUsername = null;
    this.users = new Map(); // username -> { displayName, username, badges, color, lastSeen }
    this.userMessages = new Map(); // username -> [{ displayName, message, timestamp }]
    this.onUsersChanged = null;
    this._removeListener = null;
    this._emotesReady = false;
    this._profileCardUsername = null;

    this._setupScrollDetection();
    this._setupGoToBottom();
    this._setupClickHandler();
    this._setupContextMenu();
  }

  async start() {
    // Load saved settings
    const savedMaxMessages = await window.chatty.getConfig('settings.maxMessages');
    if (savedMaxMessages) this.maxMessages = savedMaxMessages;
    const savedTimestamps = await window.chatty.getConfig('settings.showTimestamps');
    if (savedTimestamps !== undefined && savedTimestamps !== null) this.showTimestamps = savedTimestamps;
    const savedFontSize = await window.chatty.getConfig('settings.fontSize');
    if (savedFontSize) this.element.style.fontSize = savedFontSize + 'px';

    this.addSystemMessage(`Joining #${this.channel}...`);

    // Listen for IRC messages from main process
    window.chatty.listenChat(this.channel);
    this._removeListener = window.chatty.onChatMessage(this.channel, (parsed) => {
      if (this.destroyed) return;
      this._handleIRCMessage(parsed);
    });

    // Join the channel
    window.chatty.joinChat(this.channel);

    // Detect our own user ID for moderation
    this._detectSelf();

    // Load emotes and badges for this channel
    this._loadEmotesAndBadges();
  }

  async _loadEmotesAndBadges() {
    if (!this.broadcasterId) return;
    try {
      await emoteBadgeManager.loadChannel(this.broadcasterId);
      this._emotesReady = true;
    } catch (err) {
      console.error('Failed to load emotes/badges:', err);
    }
  }

  destroy() {
    this.destroyed = true;
    this._dismissProfileCard();
    if (this._removeListener) {
      this._removeListener();
      this._removeListener = null;
    }
    window.chatty.unlistenChat(this.channel);
    window.chatty.partChat(this.channel);
    this._removeContextMenu();
  }

  async _detectSelf() {
    const status = await window.chatty.getAuthStatus();
    if (status.loggedIn && status.user) {
      this.myUserId = status.user.userId;
      this.myUsername = (status.user.login || status.user.displayName || '').toLowerCase();
    }
  }

  getUsers() {
    return Array.from(this.users.values()).sort((a, b) => {
      const rank = (u) => {
        if (u.badges?.broadcaster) return 0;
        if (u.badges?.moderator) return 1;
        if (u.badges?.vip) return 2;
        if (u.badges?.subscriber) return 3;
        return 4;
      };
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.displayName.localeCompare(b.displayName);
    });
  }

  _handleIRCMessage(parsed) {
    const { command, tags, username, message } = parsed;

    if (command === 'PRIVMSG') {
      this._trackUser(tags, username);
      this._renderChatMessage(tags, username, message);

      // Track messages per user for profile cards
      const displayName = tags['display-name'] || username;
      const msgTimestamp = new Date();
      if (!this.userMessages.has(username)) this.userMessages.set(username, []);
      const userMsgs = this.userMessages.get(username);
      userMsgs.push({ displayName, message: message || '', timestamp: msgTimestamp, emotes: tags.emotes || '' });
      if (userMsgs.length > 100) userMsgs.shift();

      // Push to open profile card if viewing this user
      this._pushProfileMessage(username, message || '', msgTimestamp, tags.emotes || '');

      // Log to file
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
      window.chatty.logChat(this.channel, `[${ts}] ${displayName}: ${message || ''}`);

      // Detect if we are a mod
      if (!this.isModerator && tags['user-id'] === this.myUserId) {
        if (tags.mod === '1' || tags.badges?.includes('broadcaster')) {
          this.isModerator = true;
        }
      }
    } else if (command === 'USERNOTICE') {
      this._renderUsernotice(tags, message);
    } else if (command === 'CLEARCHAT') {
      if (message) {
        this.addSystemMessage(`${message} has been timed out.`);
      } else {
        this.addSystemMessage('Chat has been cleared.');
      }
    } else if (command === 'CLEARMSG') {
      const targetMsgId = tags['target-msg-id'];
      if (targetMsgId) {
        const el = this.element.querySelector(`[data-msg-id="${targetMsgId}"]`);
        if (el) el.remove();
      }
    } else if (command === 'ROOMSTATE') {
      // Could show sub-only, emote-only, etc.
    } else if (command === 'NOTICE') {
      this.addSystemMessage(message || '');
    }
  }

  _trackUser(tags, username) {
    const displayName = tags['display-name'] || username;
    const existing = this.users.get(username);
    const badgeStr = tags.badges || '';
    const badges = {};
    if (badgeStr) {
      for (const b of badgeStr.split(',')) {
        const [name] = b.split('/');
        if (name) badges[name] = true;
      }
    }

    const userData = {
      displayName,
      username,
      badges,
      color: tags.color || '',
      userId: tags['user-id'] || '',
      lastSeen: new Date(),
    };

    const changed = !existing || existing.displayName !== displayName;
    this.users.set(username, userData);

    if (changed && this.onUsersChanged) {
      this.onUsersChanged();
    }
  }

  _renderChatMessage(tags, username, message) {
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.dataset.msgId = tags.id || '';
    div.dataset.userId = tags['user-id'] || '';
    div.dataset.username = username;
    div.dataset.displayName = tags['display-name'] || username;

    const displayName = tags['display-name'] || username;
    const color = tags.color || this._nameColor(displayName);

    // Check if user is mentioned in this message
    const msgLower = (message || '').toLowerCase();
    if (this.myUsername && msgLower.includes(`@${this.myUsername}`)) {
      div.classList.add('chat-message-mention');
    }

    const timestamp = this._renderTimestamp();
    const badges = this._emotesReady
      ? emoteBadgeManager.renderBadges(tags.badges || '', this.broadcasterId)
      : this._renderBadges(tags.badges || '');
    const authorHtml = `<span class="chat-author" data-username="${this._escapeHtml(username)}" style="color:${color}">${this._escapeHtml(displayName)}</span>: `;

    // Render message text with emotes and @mention highlighting
    const messageHtml = this._emotesReady
      ? emoteBadgeManager.renderMessage(message || '', tags.emotes || '', this.broadcasterId)
      : this._renderMessageWithMentions(message || '');

    div.innerHTML = `${timestamp}${badges}${authorHtml}<span class="chat-text">${messageHtml}</span>`;
    this.element.appendChild(div);
    this._trimMessages();

    if (this.autoScroll) {
      this._scrollToBottom();
    }
  }

  _renderMessageWithMentions(text) {
    // Split on @mentions and highlight them
    const escaped = this._escapeHtml(text);
    return escaped.replace(/@(\w+)/g, '<span class="chat-mention">@$1</span>');
  }

  _renderUsernotice(tags, message) {
    const systemMsg = tags['system-msg'] || '';
    const div = document.createElement('div');
    div.className = 'chat-message chat-usernotice';

    let html = `${this._renderTimestamp()}<span class="chat-text" style="color:var(--accent-bright);">${this._escapeHtml(systemMsg)}</span>`;
    if (message) {
      const displayName = tags['display-name'] || tags.login || '';
      const color = tags.color || this._nameColor(displayName);
      const badgesHtml = this._emotesReady
        ? emoteBadgeManager.renderBadges(tags.badges || '', this.broadcasterId)
        : this._renderBadges(tags.badges || '');
      const msgHtml = this._emotesReady
        ? emoteBadgeManager.renderMessage(message, tags.emotes || '', this.broadcasterId)
        : this._escapeHtml(message);
      html += `<br>${badgesHtml}<span class="chat-author" style="color:${color}">${this._escapeHtml(displayName)}</span>: <span class="chat-text">${msgHtml}</span>`;
    }

    div.innerHTML = html;
    this.element.appendChild(div);
    this._trimMessages();

    if (this.autoScroll) {
      this._scrollToBottom();
    }
  }

  _renderTimestamp() {
    if (!this.showTimestamps) return '';
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    return `<span class="chat-timestamp">${h}:${m}</span>`;
  }

  _renderBadges(badgeStr) {
    if (!badgeStr) return '';
    let html = '';
    for (const badge of badgeStr.split(',')) {
      const [name] = badge.split('/');
      if (name === 'broadcaster') {
        html += '<span class="chat-badge badge-owner" title="Broadcaster">&#x1F451;</span>';
      } else if (name === 'moderator') {
        html += '<span class="chat-badge badge-mod" title="Moderator">&#x2694;</span>';
      } else if (name === 'vip') {
        html += '<span class="chat-badge badge-vip" title="VIP">&#x2B50;</span>';
      } else if (name === 'subscriber') {
        html += '<span class="chat-badge badge-member" title="Subscriber">&#x1F48E;</span>';
      }
    }
    return html;
  }

  _nameColor(name) {
    // Twitch's 15 default chat colors
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

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _trimMessages() {
    while (this.element.children.length > this.maxMessages) {
      this.element.firstElementChild?.remove();
    }
  }

  addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-system-message';
    div.textContent = text;
    this.element.appendChild(div);
    if (this.autoScroll) this._scrollToBottom();
  }

  _scrollToBottom() {
    this.element.scrollTop = this.element.scrollHeight;
  }

  // ── Clickable usernames → Profile Card ──

  _setupClickHandler() {
    this.element.addEventListener('click', (e) => {
      // Click username → open profile card
      const author = e.target.closest('.chat-author');
      if (author && author.dataset.username) {
        e.preventDefault();
        this._showProfileCard(author.dataset.username, author);
        return;
      }
      // Click link → open in external browser
      const link = e.target.closest('.chat-link');
      if (link) {
        e.preventDefault();
        window.chatty.openExternal(link.getAttribute('href'));
      }
    });
  }

  _dismissProfileCard() {
    this._profileCardUsername = null;
  }

  async _showProfileCard(username, anchorEl) {
    this._dismissProfileCard();

    // Compute screen position near the clicked element
    const anchorRect = anchorEl.getBoundingClientRect();
    const screenX = window.screenX + Math.min(anchorRect.left, window.innerWidth - 360);
    const screenY = window.screenY + Math.min(anchorRect.bottom + 6, window.innerHeight - 300);

    // Fetch user data
    const userData = await window.chatty.getUser(username);
    if (!userData || userData.error) return;

    // Fetch channel info for last game/title
    const channelInfo = await window.chatty.getChannelInfo(userData.id);

    // Fetch box art from Games API for proper URL
    let boxArtUrl = '';
    let gameLink = '';
    if (channelInfo && !channelInfo.error && channelInfo.game_name && channelInfo.game_id) {
      const gameData = await window.chatty.getGame(channelInfo.game_id);
      if (gameData && gameData.box_art_url) {
        boxArtUrl = gameData.box_art_url.replace('{width}', '40').replace('{height}', '54');
      }
      gameLink = `https://www.twitch.tv/directory/category/${encodeURIComponent(channelInfo.game_name.toLowerCase().replace(/\s+/g, '-'))}`;
    }

    const trackedUser = this.users.get(username);
    const displayName = userData.display_name || username;
    const color = trackedUser?.color || this._nameColor(displayName);

    // Follow/sub data
    let isFollowing = false;
    let followedAt = null;
    if (this.isModerator && this.broadcasterId && userData.id) {
      const followInfo = await window.chatty.getChannelFollower(this.broadcasterId, userData.id);
      if (followInfo && !followInfo.error && followInfo.followed_at) {
        isFollowing = true;
        followedAt = followInfo.followed_at;
      }
    }

    // Gather message history
    const logMsgs = await window.chatty.getUserLogs(this.channel, displayName);
    const liveMsgs = this.userMessages.get(username) || [];
    const messages = [];

    for (const m of logMsgs) {
      messages.push({ ts: m.ts, html: this._renderProfileEmotes(m.message, '') });
    }

    const lastLogTs = logMsgs.length > 0 ? logMsgs[logMsgs.length - 1].ts : '';
    for (const m of liveMsgs) {
      const h = m.timestamp.getHours().toString().padStart(2, '0');
      const min = m.timestamp.getMinutes().toString().padStart(2, '0');
      const sec = m.timestamp.getSeconds().toString().padStart(2, '0');
      const ts = `${m.timestamp.getFullYear()}-${String(m.timestamp.getMonth()+1).padStart(2,'0')}-${String(m.timestamp.getDate()).padStart(2,'0')} ${h}:${min}:${sec}`;
      if (ts > lastLogTs) {
        messages.push({ ts: `${h}:${min}`, html: this._renderProfileEmotes(m.message, m.emotes) });
      }
    }

    // Send all data to main process to open profile card window
    this._profileCardUsername = username;
    window.chatty.openProfileCard({
      username,
      displayName,
      color,
      avatarUrl: userData.profile_image_url || '',
      bio: userData.description || '',
      createdAt: userData.created_at || null,
      gameName: channelInfo?.game_name || '',
      streamTitle: channelInfo?.title || '',
      boxArtUrl,
      gameLink,
      showFollowSub: this.isModerator,
      isFollowing,
      followedAt,
      isSubscriber: !!(trackedUser?.badges?.subscriber),
      showModButtons: this.isModerator && userData.id !== this.myUserId,
      userId: userData.id,
      broadcasterId: this.broadcasterId,
      myUserId: this.myUserId,
      channel: this.channel,
      messages,
      screenX,
      screenY,
    });
  }

  // Called from _handleIRCMessage to push live messages to open profile cards
  _pushProfileMessage(username, message, timestamp, emotesTag) {
    if (this._profileCardUsername !== username) return;
    const h = timestamp.getHours().toString().padStart(2, '0');
    const min = timestamp.getMinutes().toString().padStart(2, '0');
    window.chatty.sendProfileMessage(username, { ts: `${h}:${min}`, html: this._renderProfileEmotes(message, emotesTag) });
  }

  // Render emotes for profile card messages
  _renderProfileEmotes(text, emotesTag) {
    if (!text) return '';
    if (this._emotesReady && window.emoteBadgeManager) {
      return window.emoteBadgeManager.renderMessage(text, emotesTag || '', this.broadcasterId);
    }
    return this._escapeHtml(text);
  }

  _daysSince(date) {
    const ms = Date.now() - date.getTime();
    const days = Math.floor(ms / 86400000);
    if (days < 1) return 'today';
    if (days === 1) return '1 day';
    if (days < 365) return `${days} days`;
    const years = Math.floor(days / 365);
    const rem = days % 365;
    if (years === 1) return rem > 0 ? `1 year, ${rem} days` : '1 year';
    return rem > 0 ? `${years} years, ${rem} days` : `${years} years`;
  }

  // ── Context menu for moderation ──

  _setupContextMenu() {
    this._contextMenu = null;
    this._dismissHandler = (e) => {
      if (this._contextMenu && !this._contextMenu.contains(e.target)) {
        this._removeContextMenu();
      }
    };

    this.element.addEventListener('contextmenu', (e) => {
      const msgEl = e.target.closest('.chat-message');
      if (!msgEl) return;
      if (!this.isModerator) return;

      e.preventDefault();
      this._removeContextMenu();

      const msgId = msgEl.dataset.msgId;
      const userId = msgEl.dataset.userId;
      const displayName = msgEl.dataset.displayName || msgEl.dataset.username;

      const menu = document.createElement('div');
      menu.className = 'chat-context-menu';
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;

      menu.innerHTML = `
        <div class="ctx-header">${this._escapeHtml(displayName)}</div>
        <button class="ctx-item" data-action="delete">Delete Message</button>
        <button class="ctx-item" data-action="timeout">Timeout (5 min)</button>
        <button class="ctx-item ctx-danger" data-action="ban">Ban User</button>
      `;

      menu.addEventListener('click', async (ev) => {
        const action = ev.target.dataset.action;
        if (!action) return;
        this._removeContextMenu();

        if (action === 'delete') {
          const res = await window.chatty.deleteMessage(this.broadcasterId, this.myUserId, msgId);
          if (res.error) {
            this.addSystemMessage(`Delete failed: ${res.error}`);
          } else {
            msgEl.remove();
          }
        } else if (action === 'timeout') {
          const res = await window.chatty.banUser(this.broadcasterId, this.myUserId, userId, '', 300);
          if (res.error) {
            this.addSystemMessage(`Timeout failed: ${res.error}`);
          } else {
            this.addSystemMessage(`${displayName} timed out for 5 minutes.`);
          }
        } else if (action === 'ban') {
          const res = await window.chatty.banUser(this.broadcasterId, this.myUserId, userId, '', 0);
          if (res.error) {
            this.addSystemMessage(`Ban failed: ${res.error}`);
          } else {
            this.addSystemMessage(`${displayName} has been banned.`);
          }
        }
      });

      document.body.appendChild(menu);
      this._contextMenu = menu;

      requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
          menu.style.left = `${window.innerWidth - rect.width - 4}px`;
        }
        if (rect.bottom > window.innerHeight) {
          menu.style.top = `${window.innerHeight - rect.height - 4}px`;
        }
      });

      document.addEventListener('click', this._dismissHandler);
      document.addEventListener('contextmenu', this._dismissHandler);
    });
  }

  _removeContextMenu() {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
      document.removeEventListener('click', this._dismissHandler);
      document.removeEventListener('contextmenu', this._dismissHandler);
    }
  }

  // ── Scroll detection ──

  _setupScrollDetection() {
    this.element.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this.element;
      const atBottom = scrollHeight - scrollTop - clientHeight < 30;

      this.autoScroll = atBottom;

      if (this.goToBottomBtn) {
        this.goToBottomBtn.classList.toggle('visible', !atBottom);
      }
    });
  }

  _setupGoToBottom() {
    if (!this.goToBottomBtn) return;
    this.goToBottomBtn.addEventListener('click', () => {
      this.autoScroll = true;
      this._scrollToBottom();
      this.goToBottomBtn.classList.remove('visible');
    });
  }
}
