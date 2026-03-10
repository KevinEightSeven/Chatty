/**
 * Modals — Account settings and stream search dialogs.
 */
class ModalManager {
  constructor() {
    this.overlay = document.getElementById('modal-overlay');
    this.modal = document.getElementById('modal');
    this.titleEl = document.getElementById('modal-title');
    this.bodyEl = document.getElementById('modal-body');
    this.closeBtn = document.getElementById('modal-close');

    this.closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  open(title, content) {
    this.titleEl.textContent = title;
    this.bodyEl.innerHTML = content;
    this.overlay.classList.remove('hidden');
  }

  close() {
    this.overlay.classList.add('hidden');
  }

  async showAccountModal() {
    const status = await window.chatty.getAuthStatus();

    let html = '';

    if (status.loggedIn && status.user) {
      const avatarHtml = status.user.profileImageUrl
        ? `<img src="${status.user.profileImageUrl}" alt="">`
        : `<div class="account-avatar-placeholder">${this._escapeHtml((status.user.displayName || status.user.login)[0]).toUpperCase()}</div>`;

      html = `
        <div class="account-section">
          <h3>Logged In</h3>
          <div class="account-user-info">
            ${avatarHtml}
            <div>
              <div class="user-name">${this._escapeHtml(status.user.displayName || status.user.login)}</div>
              <div style="font-size:11px;color:var(--text-muted);">ID: ${status.user.userId}</div>
            </div>
          </div>
        </div>
        <div class="account-section">
          <button class="btn-danger" id="btn-logout">Log Out</button>
        </div>
      `;
    } else {
      html = `
        <div class="account-section">
          <h3>Sign In</h3>
          <p class="form-hint" style="margin-bottom:12px;">
            Connect your Twitch account to browse streams, join chats, and send messages.
          </p>
          <button class="btn-primary" id="btn-login">Sign in with Twitch</button>
          <p class="form-hint" style="margin-top:8px;">
            This will open your browser. Your login is stored locally on this device.
          </p>
        </div>
      `;
    }

    this.open('Account', html);

    if (status.loggedIn) {
      document.getElementById('btn-logout')?.addEventListener('click', async () => {
        await window.chatty.logout();
        this.close();
        updateAccountUI();
      });
    } else {
      document.getElementById('btn-login')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-login');
        btn.textContent = 'Waiting for browser...';
        btn.disabled = true;

        const result = await window.chatty.login();
        if (result.success) {
          this.close();
          updateAccountUI();
        } else {
          btn.textContent = 'Sign in with Twitch';
          btn.disabled = false;
          alert(`Login failed: ${result.error}`);
        }
      });
    }
  }

  async showSettingsModal() {
    const fontSize = await window.chatty.getConfig('settings.fontSize') || 13;
    const timestampEnabled = await window.chatty.getConfig('settings.showTimestamps') ?? true;
    const maxMessages = await window.chatty.getConfig('settings.maxMessages') || 500;
    const logsPath = await window.chatty.getLogsPath();

    const html = `
      <div class="account-section">
        <h3>Chat</h3>
        <div class="form-group">
          <label>Font Size <span id="font-size-label" style="color:var(--text-secondary);">(${fontSize}px)</span></label>
          <input type="range" id="setting-font-size" value="${fontSize}" min="10" max="24" step="1" style="width:200px;accent-color:var(--accent-bright);">
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="setting-timestamps" ${timestampEnabled ? 'checked' : ''} style="width:auto;">
          <label for="setting-timestamps" style="margin:0;">Show Timestamps</label>
        </div>
        <div class="form-group">
          <label>Max Messages Per Channel</label>
          <input type="number" id="setting-max-messages" value="${maxMessages}" min="100" max="5000" step="100" style="width:100px;font-family:var(--font-sans);">
        </div>
      </div>
      <div class="account-section">
        <h3>Chat Logs</h3>
        <p class="form-hint">Logs are saved to:</p>
        <div style="background:var(--bg-tertiary);padding:8px;border-radius:4px;font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);margin-top:4px;word-break:break-all;cursor:pointer;" id="settings-logs-path" title="Click to open">${this._escapeHtml(logsPath)}</div>
      </div>
      <div class="account-section">
        <button class="btn-primary" id="btn-save-settings">Save Settings</button>
      </div>
    `;

    this.open('Settings', html);

    // Live preview font size
    document.getElementById('setting-font-size')?.addEventListener('input', (e) => {
      const val = e.target.value;
      document.getElementById('font-size-label').textContent = `(${val}px)`;
      document.querySelectorAll('.split-chat').forEach((el) => {
        el.style.fontSize = val + 'px';
      });
    });

    document.getElementById('settings-logs-path')?.addEventListener('click', () => {
      window.chatty.openExternal(logsPath);
    });

    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
      const newFontSize = parseInt(document.getElementById('setting-font-size').value) || 13;
      const newTimestamps = document.getElementById('setting-timestamps').checked;
      const newMaxMessages = parseInt(document.getElementById('setting-max-messages').value) || 500;

      await window.chatty.setConfig('settings.fontSize', newFontSize);
      await window.chatty.setConfig('settings.showTimestamps', newTimestamps);
      await window.chatty.setConfig('settings.maxMessages', newMaxMessages);

      // Apply font size live
      document.querySelectorAll('.split-chat').forEach((el) => {
        el.style.fontSize = newFontSize + 'px';
      });

      // Apply timestamps setting
      document.querySelectorAll('.chat-timestamp').forEach((el) => {
        el.style.display = newTimestamps ? '' : 'none';
      });

      // Update maxMessages on active ChatViews
      for (const split of window.splitManager.splits.values()) {
        if (split.chatView) {
          split.chatView.maxMessages = newMaxMessages;
        }
      }

      this.close();
    });
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * SearchDialog — Stream/channel browser for finding Twitch chats to connect to.
 */
class SearchDialog {
  constructor() {
    this.overlay = document.getElementById('search-overlay');
    this.closeBtn = document.getElementById('search-close');
    this.searchInput = document.getElementById('search-input');
    this.resultsEl = document.getElementById('search-results');
    this.categoriesEl = document.getElementById('categories-results');
    this.channelInput = document.getElementById('channel-input');
    this.channelResultsEl = document.getElementById('channel-search-results');

    this.searchTimeout = null;
    this.channelSearchTimeout = null;
    this.targetSplitId = null;

    this._setupListeners();
  }

  _setupListeners() {
    this.closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Tab switching
    document.querySelectorAll('.search-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.search-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.search-panel').forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`search-${tab.dataset.tab}`).classList.add('active');

        if (tab.dataset.tab === 'categories') {
          this._loadCategories();
        }
        if (tab.dataset.tab === 'channel') {
          this.channelInput.focus();
        }
      });
    });

    // Browse streams search with debounce
    this.searchInput.addEventListener('input', () => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this._search(this.searchInput.value.trim());
      }, 400);
    });

    // Channel name search as-you-type
    this.channelInput.addEventListener('input', () => {
      clearTimeout(this.channelSearchTimeout);
      const query = this.channelInput.value.trim();
      if (!query) {
        this.channelResultsEl.innerHTML = '';
        return;
      }
      this.channelSearchTimeout = setTimeout(() => {
        this._searchChannels(query);
      }, 300);
    });

    this.channelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = this.channelInput.value.trim();
        const channel = this._extractChannel(query);
        if (channel) {
          this._connectToChannel(channel);
        }
      }
    });

    // Auto-open observer
    const observer = new MutationObserver(() => {
      if (!this.overlay.classList.contains('hidden')) {
        this.targetSplitId = document.getElementById('search-target').dataset.splitId;
        this.searchInput.focus();
        if (!this.searchInput.value.trim()) {
          this._search('');
        }
      }
    });
    observer.observe(this.overlay, { attributes: true, attributeFilter: ['class'] });
  }

  close() {
    this.overlay.classList.add('hidden');
  }

  async _search(query) {
    this.resultsEl.innerHTML = '<div class="search-loading">Searching...</div>';

    let result;
    if (query) {
      result = await window.chatty.searchChannels(query, 20);
    } else {
      result = await window.chatty.getTopStreams(20);
    }

    if (result.error) {
      this.resultsEl.innerHTML = `<div class="search-empty">Error: ${result.error}</div>`;
      return;
    }

    if (!result.items || result.items.length === 0) {
      this.resultsEl.innerHTML = '<div class="search-empty">No live streams found</div>';
      return;
    }

    this.resultsEl.innerHTML = '';
    for (const item of result.items) {
      const el = this._createStreamResult(item);
      this.resultsEl.appendChild(el);
    }
  }

  async _searchChannels(query) {
    this.channelResultsEl.innerHTML = '<div class="search-loading">Searching...</div>';

    const result = await window.chatty.searchAllChannels(query, 20);

    if (result.error) {
      this.channelResultsEl.innerHTML = `<div class="search-empty">Error: ${result.error}</div>`;
      return;
    }

    if (!result.items || result.items.length === 0) {
      this.channelResultsEl.innerHTML = '<div class="search-empty">No channels found</div>';
      return;
    }

    // Sort: exact match first, then prefix matches, then the rest
    const q = query.toLowerCase();
    result.items.sort((a, b) => {
      const aName = (a.broadcaster_login || a.display_name || '').toLowerCase();
      const bName = (b.broadcaster_login || b.display_name || '').toLowerCase();
      const aExact = aName === q ? 0 : 1;
      const bExact = bName === q ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      const aPrefix = aName.startsWith(q) ? 0 : 1;
      const bPrefix = bName.startsWith(q) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return aName.localeCompare(bName);
    });

    this.channelResultsEl.innerHTML = '';
    for (const item of result.items) {
      const el = this._createChannelResult(item);
      this.channelResultsEl.appendChild(el);
    }
  }

  async _loadCategories() {
    this.categoriesEl.innerHTML = '<div class="search-loading">Loading top categories...</div>';

    const result = await window.chatty.getTopGames(20);

    if (result.error) {
      this.categoriesEl.innerHTML = `<div class="search-empty">Error: ${result.error}</div>`;
      return;
    }

    if (!result.items || result.items.length === 0) {
      this.categoriesEl.innerHTML = '<div class="search-empty">No categories found</div>';
      return;
    }

    this.categoriesEl.innerHTML = '';
    for (const cat of result.items) {
      const el = this._createCategoryResult(cat);
      this.categoriesEl.appendChild(el);
    }
  }

  _createStreamResult(item) {
    const div = document.createElement('div');
    div.className = 'stream-result';

    const channelName = item.user_login || item.user_name || item.broadcaster_login || '';
    const displayName = item.user_name || item.display_name || channelName;
    const title = item.title || '';
    const viewers = item.viewer_count ? Number(item.viewer_count).toLocaleString() + ' viewers' : '';
    const gameName = item.game_name || '';
    const thumbnail = item.thumbnail_url
      ? item.thumbnail_url.replace('{width}', '80').replace('{height}', '45')
      : '';

    div.innerHTML = `
      ${thumbnail ? `<img src="${thumbnail}" alt="">` : ''}
      <div class="stream-result-info">
        <div class="stream-result-title">${this._escapeHtml(title)}</div>
        <div class="stream-result-channel">${this._escapeHtml(displayName)}${gameName ? ' — ' + this._escapeHtml(gameName) : ''}</div>
        ${viewers ? `<div class="stream-result-viewers">${viewers}</div>` : ''}
      </div>
    `;

    div.addEventListener('click', () => {
      this._connectToChannel(channelName);
    });

    return div;
  }

  _createChannelResult(item) {
    const div = document.createElement('div');
    div.className = 'stream-result';

    const channelName = item.broadcaster_login || item.display_name || '';
    const displayName = item.display_name || channelName;
    const isLive = item.is_live;
    const gameName = item.game_name || '';
    const thumb = item.thumbnail_url || '';

    div.innerHTML = `
      ${thumb ? `<img src="${thumb}" alt="" style="width:40px;height:40px;border-radius:50%;">` : ''}
      <div class="stream-result-info">
        <div class="stream-result-title">${this._escapeHtml(displayName)}</div>
        <div class="stream-result-channel">
          <span style="color:${isLive ? '#e91916' : 'var(--text-muted)'};">${isLive ? '● Live' : '● Offline'}</span>
          ${gameName && isLive ? ' — ' + this._escapeHtml(gameName) : ''}
        </div>
      </div>
    `;

    div.addEventListener('click', () => {
      this._connectToChannel(channelName);
    });

    return div;
  }

  _createCategoryResult(cat) {
    const div = document.createElement('div');
    div.className = 'stream-result';

    const boxArt = cat.box_art_url
      ? cat.box_art_url.replace('{width}', '45').replace('{height}', '60')
      : '';

    div.innerHTML = `
      ${boxArt ? `<img src="${boxArt}" alt="" style="width:45px;height:60px;">` : ''}
      <div class="stream-result-info">
        <div class="stream-result-title">${this._escapeHtml(cat.name || '')}</div>
      </div>
    `;

    div.addEventListener('click', async () => {
      this.resultsEl.innerHTML = '<div class="search-loading">Loading streams...</div>';

      document.querySelectorAll('.search-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.search-panel').forEach((p) => p.classList.remove('active'));
      document.querySelector('[data-tab="browse"]').classList.add('active');
      document.getElementById('search-browse').classList.add('active');

      const result = await window.chatty.getStreamsByGame(cat.id, 20);
      if (result.error || !result.items?.length) {
        this.resultsEl.innerHTML = '<div class="search-empty">No live streams found for this category</div>';
        return;
      }

      this.resultsEl.innerHTML = '';
      for (const item of result.items) {
        const el = this._createStreamResult(item);
        this.resultsEl.appendChild(el);
      }
    });

    return div;
  }

  _connectToChannel(channel) {
    if (!this.targetSplitId) return;
    this.close();
    window.splitManager.connectSplit(this.targetSplitId, channel);
  }

  _extractChannel(input) {
    if (!input) return null;

    try {
      const url = new URL(input);
      if (url.hostname.includes('twitch.tv')) {
        const parts = url.pathname.split('/').filter(Boolean);
        return parts[0] || null;
      }
    } catch {
      // Not a URL
    }

    return input.replace(/^[#/]/, '').trim() || null;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
