/**
 * StreamerTools — Streamer overlay configuration panel.
 * Manages alert settings, chat overlay settings, position preview, and CSS editing.
 */
class StreamerTools {
  constructor() {
    this.overlay = document.getElementById('streamer-tools-overlay');
    this.closeBtn = document.getElementById('streamer-tools-close');
    this._activeTab = 'scenes';
    this._editingSceneIdx = null;
    this._previewResolution = { w: 1920, h: 1080, label: '1080p' };
    this._dragTarget = null;
    this._dragOffset = { x: 0, y: 0 };

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }
    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });
    }
  }

  async open() {
    if (!this.overlay) return;
    this.overlay.classList.remove('hidden');
    await this._ensureScenes();
    await this._render();
  }

  // Ensure at least one scene exists, migrating old flat config if needed
  async _ensureScenes() {
    let scenes = await window.chatty.getConfig('overlay.scenes');
    if (scenes && scenes.length > 0) return;

    // Migrate from old flat config
    const alerts = {};
    for (const type of ['follow', 'subscribe', 'cheer', 'raid']) {
      const val = await window.chatty.getConfig(`overlay.alerts.${type}`);
      if (val) alerts[type] = val;
    }
    alerts.position = await window.chatty.getConfig('overlay.alerts.position') || null;
    alerts.delay = (await window.chatty.getConfig('overlay.alerts.delay')) ?? 3;

    const chat = {
      enabled: (await window.chatty.getConfig('overlay.chat.enabled')) ?? true,
      showBadges: (await window.chatty.getConfig('overlay.chat.showBadges')) ?? true,
      showTimestamps: (await window.chatty.getConfig('overlay.chat.showTimestamps')) ?? false,
      fontSize: (await window.chatty.getConfig('overlay.chat.fontSize')) || 16,
      maxMessages: (await window.chatty.getConfig('overlay.chat.maxMessages')) || 6,
      fadeOut: (await window.chatty.getConfig('overlay.chat.fadeOut')) ?? true,
      fadeDelay: (await window.chatty.getConfig('overlay.chat.fadeDelay')) || 30,
      animation: (await window.chatty.getConfig('overlay.chat.animation')) || 'slideIn',
      position: (await window.chatty.getConfig('overlay.chat.position')) || null,
      css: (await window.chatty.getConfig('overlay.chat.css')) || '',
    };

    scenes = [{ name: 'Default', alerts, chat }];
    await window.chatty.setConfig('overlay.scenes', scenes);
  }

  close() {
    if (this.overlay) this.overlay.classList.add('hidden');
  }

  _sceneSuffix() {
    return this._editingSceneIdx === 0 ? '' : String(this._editingSceneIdx + 1);
  }

  async _render() {
    const body = document.getElementById('streamer-tools-body');
    if (!body) return;

    const serverRunning = await window.chatty.overlayIsRunning();
    const port = await window.chatty.getConfig('overlay.port') || 7878;

    let tabsHtml;
    let panelsHtml;

    if (this._editingSceneIdx !== null) {
      const scenes = await window.chatty.getConfig('overlay.scenes') || [];
      const sceneName = scenes[this._editingSceneIdx]?.name || `Scene ${this._editingSceneIdx + 1}`;

      tabsHtml = `
        <button class="st-tab st-back-tab" data-tab="scenes">\u2190 Scenes</button>
        <button class="st-tab ${this._activeTab === 'alerts' ? 'active' : ''}" data-tab="alerts">Alerts</button>
        <button class="st-tab ${this._activeTab === 'chat' ? 'active' : ''}" data-tab="chat">Chat Overlay</button>
        <button class="st-tab ${this._activeTab === 'preview' ? 'active' : ''}" data-tab="preview">Position Preview</button>
      `;
      panelsHtml = `
        <div class="st-scene-edit-header">
          <label>Scene Name</label>
          <input type="text" id="st-scene-name" value="${this._escapeHtml(sceneName)}">
        </div>
        <div class="st-panel ${this._activeTab === 'alerts' ? 'active' : ''}" id="st-alerts-panel"></div>
        <div class="st-panel ${this._activeTab === 'chat' ? 'active' : ''}" id="st-chat-panel"></div>
        <div class="st-panel ${this._activeTab === 'preview' ? 'active' : ''}" id="st-preview-panel"></div>
      `;
    } else {
      tabsHtml = `<button class="st-tab active" data-tab="scenes">Scenes</button>`;
      panelsHtml = `<div class="st-panel active" id="st-scenes-panel"></div>`;
      this._activeTab = 'scenes';
    }

    body.innerHTML = `
      <div class="st-server-bar">
        <div class="st-server-status">
          <span class="st-status-dot ${serverRunning ? 'active' : ''}"></span>
          <span>Overlay Server: <strong>${serverRunning ? 'Running' : 'Stopped'}</strong></span>
          ${serverRunning ? `<span class="st-server-url">http://127.0.0.1:${port}</span>` : ''}
        </div>
        <div class="st-server-actions">
          <label class="st-port-label">Port:
            <input type="number" id="st-port" value="${port}" min="1024" max="65535" class="st-port-input">
          </label>
          <button id="st-toggle-server" class="btn-primary" style="width:auto;padding:6px 14px;">
            ${serverRunning ? 'Stop Server' : 'Start Server'}
          </button>
        </div>
      </div>

      <div class="st-tabs">
        ${tabsHtml}
      </div>

      <div class="st-content">
        ${panelsHtml}
      </div>
    `;

    // Tab switching
    body.querySelectorAll('.st-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        if (tab.dataset.tab === 'scenes' && tab.classList.contains('st-back-tab')) {
          // Save scene name before going back
          const nameInput = document.getElementById('st-scene-name');
          if (nameInput) {
            const scenes = await window.chatty.getConfig('overlay.scenes') || [];
            if (scenes[this._editingSceneIdx]) {
              scenes[this._editingSceneIdx].name = nameInput.value || `Scene ${this._editingSceneIdx + 1}`;
              await window.chatty.setConfig('overlay.scenes', scenes);
            }
          }
          this._editingSceneIdx = null;
          this._activeTab = 'scenes';
          await this._render();
          return;
        }

        this._activeTab = tab.dataset.tab;
        body.querySelectorAll('.st-tab').forEach(t => {
          if (!t.classList.contains('st-back-tab')) {
            t.classList.toggle('active', t.dataset.tab === this._activeTab);
          }
        });
        body.querySelectorAll('.st-panel').forEach(p => p.classList.remove('active'));
        const activePanel = body.querySelector(`#st-${this._activeTab}-panel`);
        if (activePanel) activePanel.classList.add('active');

        if (this._activeTab === 'scenes') await this._renderScenes();
        else if (this._activeTab === 'alerts') await this._renderAlerts();
        else if (this._activeTab === 'chat') await this._renderChat();
        else if (this._activeTab === 'preview') await this._renderPreview();
      });
    });

    // Server toggle
    document.getElementById('st-toggle-server').addEventListener('click', async () => {
      const portVal = parseInt(document.getElementById('st-port').value) || 7878;
      await window.chatty.setConfig('overlay.port', portVal);

      if (serverRunning) {
        await window.chatty.overlayStop();
      } else {
        await window.chatty.overlayStart(portVal);
      }
      await this._render();
    });

    // Render active tab content
    if (this._activeTab === 'scenes') await this._renderScenes();
    else if (this._activeTab === 'alerts') await this._renderAlerts();
    else if (this._activeTab === 'chat') await this._renderChat();
    else if (this._activeTab === 'preview') await this._renderPreview();
  }

  // ── Scenes Tab ──

  async _renderScenes() {
    const panel = document.getElementById('st-scenes-panel');
    if (!panel) return;

    const serverRunning = await window.chatty.overlayIsRunning();
    const port = await window.chatty.getConfig('overlay.port') || 7878;
    let scenes = await window.chatty.getConfig('overlay.scenes') || [];

    // Ensure at least one scene exists
    if (scenes.length === 0) {
      scenes = [{ name: 'Default' }];
      await window.chatty.setConfig('overlay.scenes', scenes);
    }

    let html = '<p class="form-hint" style="margin-bottom:12px;">Each scene has its own alerts, chat overlay, and position settings. Add each scene as a separate Browser Source in OBS.</p>';

    scenes.forEach((scene, idx) => {
      const suffix = idx === 0 ? '' : (idx + 1);
      const alertUrl = `http://127.0.0.1:${port}/alerts${suffix}`;
      const chatUrl = `http://127.0.0.1:${port}/chat${suffix}`;

      html += `
        <div class="st-alert-card" data-scene-idx="${idx}">
          <div class="st-alert-header">
            <input type="text" class="st-scene-name-input" data-scene-idx="${idx}" value="${this._escapeHtml(scene.name || `Scene ${idx + 1}`)}" spellcheck="false">
            <div style="display:flex;gap:6px;">
              <button class="st-scene-edit btn-primary" data-scene-idx="${idx}" style="width:auto;padding:4px 12px;font-size:12px;">Edit</button>
              ${scenes.length > 1 ? `<button class="st-scene-delete st-reset-btn" data-scene-idx="${idx}" style="width:auto;padding:4px 12px;font-size:12px;">Delete</button>` : ''}
            </div>
          </div>
          <div class="st-alert-body">`;

      if (serverRunning) {
        html += `
            <div class="st-url-bar" style="margin-bottom:4px;">
              <span>Alerts:</span>
              <code>${alertUrl}</code>
              <button class="st-copy-btn" data-copy="${alertUrl}" title="Copy URL">Copy</button>
            </div>
            <div class="st-url-bar">
              <span>Chat:</span>
              <code>${chatUrl}</code>
              <button class="st-copy-btn" data-copy="${chatUrl}" title="Copy URL">Copy</button>
            </div>`;
      } else {
        html += '<p class="form-hint">Start the server to see overlay URLs.</p>';
      }

      html += `</div></div>`;
    });

    html += `<div class="st-section" style="margin-top:12px;">
      <button id="st-add-scene" class="st-add-variant" style="width:auto;padding:8px 16px;">+ Add Scene</button>
    </div>`;

    panel.innerHTML = html;

    // Wire copy buttons
    panel.querySelectorAll('.st-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
    });

    // Wire scene name inputs
    panel.querySelectorAll('.st-scene-name-input').forEach(input => {
      input.addEventListener('change', async () => {
        const idx = parseInt(input.dataset.sceneIdx);
        const scenes = await window.chatty.getConfig('overlay.scenes') || [];
        if (scenes[idx]) {
          scenes[idx].name = input.value || `Scene ${idx + 1}`;
          await window.chatty.setConfig('overlay.scenes', scenes);
        }
      });
    });

    // Wire edit buttons
    panel.querySelectorAll('.st-scene-edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        this._editingSceneIdx = parseInt(btn.dataset.sceneIdx);
        this._activeTab = 'alerts';
        await this._render();
      });
    });

    // Wire delete buttons
    panel.querySelectorAll('.st-scene-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.sceneIdx);
        const scenes = await window.chatty.getConfig('overlay.scenes') || [];
        if (scenes.length <= 1) return;
        scenes.splice(idx, 1);
        await window.chatty.setConfig('overlay.scenes', scenes);
        await this._renderScenes();
      });
    });

    // Add scene
    document.getElementById('st-add-scene')?.addEventListener('click', async () => {
      const scenes = await window.chatty.getConfig('overlay.scenes') || [];
      scenes.push({ name: `Scene ${scenes.length + 1}` });
      await window.chatty.setConfig('overlay.scenes', scenes);
      await this._renderScenes();
    });
  }

  // ── Alerts Tab ──

  // Generate a tabbed HTML/CSS/JS code editor
  _codeEditorHtml(prefix, htmlVal, cssVal, jsVal) {
    return `
      <div class="st-code-section" data-prefix="${prefix}">
        <label>Alert Template</label>
        <div class="st-code-tabs">
          <button class="st-code-tab active" data-lang="html">HTML</button>
          <button class="st-code-tab" data-lang="css">CSS</button>
          <button class="st-code-tab" data-lang="js">JS</button>
        </div>
        <textarea class="st-code-area active" data-lang="html" data-prefix="${prefix}" rows="4" placeholder="<div class=&quot;alert-wrapper&quot;>...">${this._escapeHtml(htmlVal || '')}</textarea>
        <textarea class="st-code-area" data-lang="css" data-prefix="${prefix}" rows="4" placeholder=".alert-wrapper { ... }">${this._escapeHtml(cssVal || '')}</textarea>
        <textarea class="st-code-area" data-lang="js" data-prefix="${prefix}" rows="4" placeholder="// Custom JavaScript...">${this._escapeHtml(jsVal || '')}</textarea>
      </div>`;
  }

  // Generate HTML for a single variant card
  _variantCardHtml(type, idx, variant) {
    const v = variant || {};
    const image = v.image || '';
    const sound = v.sound || '';
    const text = v.text || '';
    const duration = v.duration || 0;
    const animation = v.animation || '';
    const fontSize = v.fontSize || 0;
    const fontColor = v.fontColor || '';

    const vLayout = v.layout || '';
    const vHtml = v.html || '';
    const vCss = v.css || '';
    const vJs = v.js || '';

    const animOptions = ['fadeIn', 'slideDown', 'slideUp', 'bounceIn', 'zoomIn'];

    // Condition/threshold row per type
    let conditionHtml = '';
    let textHint = '{user}';
    if (type === 'subscribe') {
      const condition = v.condition || 'resub';
      textHint = '{user} {months} {tier}';
      conditionHtml = `
        <div class="st-form-row" style="margin:0;flex:0 0 auto;">
          <label style="margin:0;font-size:11px;">Condition</label>
          <select class="st-variant-condition" style="width:auto;">
            <option value="resub" ${condition === 'resub' ? 'selected' : ''}>Resub</option>
            <option value="gifted" ${condition === 'gifted' ? 'selected' : ''}>Gifted Sub</option>
          </select>
        </div>
        <input type="text" class="st-variant-label" value="${this._escapeHtml(v.label || '')}" placeholder="Variant name" style="flex:1;">`;
    } else if (type === 'cheer') {
      textHint = '{user} {amount}';
      conditionHtml = `
        <div class="st-form-row" style="margin:0;flex:0 0 auto;">
          <label style="margin:0;font-size:11px;">Min Bits</label>
          <input type="number" class="st-variant-threshold" value="${v.threshold || 100}" min="1" style="width:80px;">
        </div>
        <input type="text" class="st-variant-label" value="${this._escapeHtml(v.label || '')}" placeholder="Variant name" style="flex:1;">`;
    } else if (type === 'raid') {
      textHint = '{user} {viewers}';
      conditionHtml = `
        <div class="st-form-row" style="margin:0;flex:0 0 auto;">
          <label style="margin:0;font-size:11px;">Min Viewers</label>
          <input type="number" class="st-variant-threshold" value="${v.threshold || 50}" min="1" style="width:80px;">
        </div>
        <input type="text" class="st-variant-label" value="${this._escapeHtml(v.label || '')}" placeholder="Variant name" style="flex:1;">`;
    }

    return `
      <div class="st-variant-card" data-type="${type}" data-variant-idx="${idx}">
        <div class="st-variant-header">
          ${conditionHtml}
          <button class="st-variant-remove" data-type="${type}" data-variant-idx="${idx}">Remove</button>
        </div>
        <p class="form-hint" style="margin-bottom:6px;">Leave fields empty to use the base alert values.</p>
        <div class="st-form-row">
          <label>Image</label>
          <div class="st-file-row">
            <input type="text" class="st-variant-image" value="${this._escapeHtml(image)}" placeholder="Inherit from base" readonly>
            <button class="st-upload-btn st-variant-upload" data-field="image" data-variant-idx="${idx}" data-type="${type}">Upload</button>
            ${image ? `<button class="st-clear-btn st-variant-clear" data-field="image" data-variant-idx="${idx}" data-type="${type}">Clear</button>` : ''}
          </div>
        </div>
        <div class="st-form-row">
          <label>Sound <span class="form-hint">(.mp3 or .ogg)</span></label>
          <div class="st-file-row">
            <input type="text" class="st-variant-sound" value="${this._escapeHtml(sound)}" placeholder="Inherit from base" readonly>
            <button class="st-upload-btn st-variant-upload" data-field="sound" data-variant-idx="${idx}" data-type="${type}">Upload</button>
            ${sound ? `<button class="st-clear-btn st-variant-clear" data-field="sound" data-variant-idx="${idx}" data-type="${type}">Clear</button>` : ''}
          </div>
        </div>
        <div class="st-form-row">
          <label>Text <span class="form-hint">${textHint}</span></label>
          <input type="text" class="st-variant-text" value="${this._escapeHtml(text)}" placeholder="Inherit from base">
        </div>
        <div class="st-form-row">
          <label>Text Layout</label>
          <div class="st-layout-picker st-variant-layout-picker">
            <button class="st-layout-btn ${vLayout === 'overlay' ? 'active' : ''}" data-layout="overlay" title="Text centered on image">
              <svg width="28" height="22" viewBox="0 0 28 22"><rect x="1" y="1" width="26" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="4" width="20" height="14" rx="1" fill="currentColor" opacity="0.15"/><line x1="8" y1="11" x2="20" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              <span>Overlay</span>
            </button>
            <button class="st-layout-btn ${vLayout === 'below' ? 'active' : ''}" data-layout="below" title="Text below image">
              <svg width="28" height="22" viewBox="0 0 28 22"><rect x="1" y="1" width="26" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="8" y="3" width="12" height="10" rx="1" fill="currentColor" opacity="0.15"/><line x1="7" y1="17" x2="21" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              <span>Below</span>
            </button>
            <button class="st-layout-btn ${vLayout === 'side' ? 'active' : ''}" data-layout="side" title="Text beside image">
              <svg width="28" height="22" viewBox="0 0 28 22"><rect x="1" y="1" width="26" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="4" width="10" height="14" rx="1" fill="currentColor" opacity="0.15"/><line x1="16" y1="9" x2="25" y2="9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="13" x2="22" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/></svg>
              <span>Side</span>
            </button>
            <button class="st-layout-btn ${!vLayout ? 'active' : ''}" data-layout="" title="Inherit from base">
              <span>Inherit</span>
            </button>
          </div>
        </div>
        <div class="st-form-grid">
          <div class="st-form-row">
            <label>Duration (s)</label>
            <input type="number" class="st-variant-duration" value="${duration}" min="0" max="30" step="1" placeholder="0 = inherit">
          </div>
          <div class="st-form-row">
            <label>Animation</label>
            <select class="st-variant-animation">
              <option value="" ${!animation ? 'selected' : ''}>Inherit</option>
              ${animOptions.map(a => `<option value="${a}" ${animation === a ? 'selected' : ''}>${a.replace(/([A-Z])/g, ' $1').trim()}</option>`).join('')}
            </select>
          </div>
          <div class="st-form-row">
            <label>Font Size</label>
            <input type="number" class="st-variant-font-size" value="${fontSize}" min="0" max="72" step="1" placeholder="0 = inherit">
          </div>
          <div class="st-form-row">
            <label>Font Color</label>
            <input type="color" class="st-variant-font-color" value="${fontColor || '#ffffff'}">
          </div>
        </div>
        ${this._codeEditorHtml(`variant-${type}-${idx}`, vHtml, vCss, vJs)}
        <div class="st-form-row">
          <button class="st-test-btn st-test-variant-btn" data-type="${type}" data-variant-idx="${idx}">Test Variant</button>
        </div>
      </div>
    `;
  }

  async _renderAlerts() {
    const panel = document.getElementById('st-alerts-panel');
    if (!panel) return;

    const serverRunning = await window.chatty.overlayIsRunning();
    const port = await window.chatty.getConfig('overlay.port') || 7878;
    const scenes = await window.chatty.getConfig('overlay.scenes') || [];
    const scene = scenes[this._editingSceneIdx] || {};
    const sceneAlerts = scene.alerts || {};

    const types = ['follow', 'subscribe', 'cheer', 'raid'];
    const labels = { follow: 'Followers', subscribe: 'Subscribers', cheer: 'Bits', raid: 'Raids' };
    const icons = { follow: '\u2764', subscribe: '\u2B50', cheer: '\uD83D\uDC8E', raid: '\uD83D\uDEA8' };
    const defaultTexts = {
      follow: '{user} just followed!',
      subscribe: '{user} just subscribed!',
      cheer: '{user} cheered {amount} bits!',
      raid: '{user} is raiding with {viewers} viewers!',
    };
    const textHints = {
      follow: '{user}',
      subscribe: '{user} {months} {tier}',
      cheer: '{user} {amount}',
      raid: '{user} {viewers}',
    };
    // Types that support variants
    const variantTypes = { subscribe: true, cheer: true, raid: true };

    const suffix = this._sceneSuffix();
    const alertUrl = `http://127.0.0.1:${port}/alerts${suffix}`;
    let html = '';

    if (serverRunning) {
      html += `<div class="st-url-bar">
        <span>Alerts URL:</span>
        <code id="st-alerts-url">${alertUrl}</code>
        <button class="st-copy-btn" data-copy="${alertUrl}" title="Copy URL">Copy</button>
      </div>`;
    }

    const alertDelay = sceneAlerts.delay ?? 3;

    html += `<div class="st-section">
      <h4>Alert Queue Delay</h4>
      <p class="form-hint">Minimum seconds to wait between alerts. Prevents alerts from firing too quickly back-to-back.</p>
      <div class="st-form-row" style="max-width:200px;">
        <label>Delay (seconds)</label>
        <input type="number" id="st-alerts-delay" value="${alertDelay}" min="0" max="60" step="1">
      </div>
    </div>`;

    for (const type of types) {
      const cfg = sceneAlerts[type] || {};
      const enabled = cfg.enabled ?? true;
      const image = cfg.image || '';
      const sound = cfg.sound || '';
      const text = cfg.text || defaultTexts[type];
      const duration = cfg.duration || 8;
      const animation = cfg.animation || 'fadeIn';
      const fontSize = cfg.fontSize || 32;
      const fontColor = cfg.fontColor || '#ffffff';
      const layout = cfg.layout || 'below';
      const css = cfg.css || '';
      const alertHtml = cfg.html || '';
      const alertJs = cfg.js || '';
      const variants = cfg.variants || [];

      const baseLabel = type === 'subscribe' ? 'New Subscriber' : (type === 'cheer' ? 'Any Amount' : (type === 'raid' ? 'Any Raid' : ''));

      html += `
        <div class="st-alert-card" data-type="${type}">
          <div class="st-alert-header">
            <span class="st-alert-icon">${icons[type]}</span>
            <span class="st-alert-label">${labels[type]}</span>
            <label class="st-toggle">
              <input type="checkbox" class="st-alert-enabled" data-type="${type}" ${enabled ? 'checked' : ''}>
              <span class="st-toggle-slider"></span>
            </label>
          </div>
          <div class="st-alert-body">
            ${variantTypes[type] ? `<div class="st-base-label">Base Alert${baseLabel ? ' — ' + baseLabel : ''}</div>` : ''}
            <div class="st-form-row">
              <label>Alert Image</label>
              <div class="st-file-row">
                <input type="text" class="st-alert-image" data-type="${type}" value="${this._escapeHtml(image)}" placeholder="No image set" readonly>
                <button class="st-upload-btn" data-type="${type}" data-field="image">Upload</button>
                ${image ? `<button class="st-clear-btn" data-type="${type}" data-field="image">Clear</button>` : ''}
              </div>
            </div>
            <div class="st-form-row">
              <label>Alert Sound <span class="form-hint">(.mp3 or .ogg)</span></label>
              <div class="st-file-row">
                <input type="text" class="st-alert-sound" data-type="${type}" value="${this._escapeHtml(sound)}" placeholder="No sound set" readonly>
                <button class="st-upload-btn" data-type="${type}" data-field="sound">Upload</button>
                ${sound ? `<button class="st-clear-btn" data-type="${type}" data-field="sound">Clear</button>` : ''}
              </div>
            </div>
            <div class="st-form-row">
              <label>Alert Text <span class="form-hint">${textHints[type]}</span></label>
              <input type="text" class="st-alert-text" data-type="${type}" value="${this._escapeHtml(text)}">
            </div>
            <div class="st-form-row">
              <label>Text Layout</label>
              <div class="st-layout-picker" data-type="${type}">
                <button class="st-layout-btn ${layout === 'overlay' ? 'active' : ''}" data-layout="overlay" title="Text centered on image">
                  <svg width="28" height="22" viewBox="0 0 28 22"><rect x="1" y="1" width="26" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="4" width="20" height="14" rx="1" fill="currentColor" opacity="0.15"/><line x1="8" y1="11" x2="20" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                  <span>Overlay</span>
                </button>
                <button class="st-layout-btn ${layout === 'below' ? 'active' : ''}" data-layout="below" title="Text below image">
                  <svg width="28" height="22" viewBox="0 0 28 22"><rect x="1" y="1" width="26" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="8" y="3" width="12" height="10" rx="1" fill="currentColor" opacity="0.15"/><line x1="7" y1="17" x2="21" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                  <span>Below</span>
                </button>
                <button class="st-layout-btn ${layout === 'side' ? 'active' : ''}" data-layout="side" title="Text beside image">
                  <svg width="28" height="22" viewBox="0 0 28 22"><rect x="1" y="1" width="26" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="4" width="10" height="14" rx="1" fill="currentColor" opacity="0.15"/><line x1="16" y1="9" x2="25" y2="9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="13" x2="22" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/></svg>
                  <span>Side</span>
                </button>
              </div>
            </div>
            <div class="st-form-grid">
              <div class="st-form-row">
                <label>Duration (s)</label>
                <input type="number" class="st-alert-duration" data-type="${type}" value="${duration}" min="1" max="30" step="1">
              </div>
              <div class="st-form-row">
                <label>Animation</label>
                <select class="st-alert-animation" data-type="${type}">
                  <option value="fadeIn" ${animation === 'fadeIn' ? 'selected' : ''}>Fade In</option>
                  <option value="slideDown" ${animation === 'slideDown' ? 'selected' : ''}>Slide Down</option>
                  <option value="slideUp" ${animation === 'slideUp' ? 'selected' : ''}>Slide Up</option>
                  <option value="bounceIn" ${animation === 'bounceIn' ? 'selected' : ''}>Bounce In</option>
                  <option value="zoomIn" ${animation === 'zoomIn' ? 'selected' : ''}>Zoom In</option>
                </select>
              </div>
              <div class="st-form-row">
                <label>Font Size</label>
                <input type="number" class="st-alert-font-size" data-type="${type}" value="${fontSize}" min="12" max="72" step="1">
              </div>
              <div class="st-form-row">
                <label>Font Color</label>
                <input type="color" class="st-alert-font-color" data-type="${type}" value="${fontColor}">
              </div>
            </div>
            ${this._codeEditorHtml(`base-${type}`, alertHtml, css, alertJs)}
            <div class="st-form-row">
              <button class="st-test-btn" data-type="${type}">Test Alert</button>
            </div>
      `;

      // Variant section for subscribe, cheer, raid
      if (variantTypes[type]) {
        const variantHint = type === 'subscribe'
          ? 'Add variants for resubs, gifted subs, etc. The first matching variant is used. Empty fields inherit from base.'
          : type === 'cheer'
            ? 'Add threshold variants — the highest matching bit amount is used. Empty fields inherit from base.'
            : 'Add threshold variants — the highest matching viewer count is used. Empty fields inherit from base.';

        html += `
            <div class="st-variants-section" data-type="${type}">
              <div class="st-variants-header">
                <h5>Variants</h5>
                <p class="form-hint">${variantHint}</p>
              </div>
              <div class="st-variants-list" data-type="${type}">
        `;

        variants.forEach((v, i) => {
          html += this._variantCardHtml(type, i, v);
        });

        html += `</div>`;
        html += `<button class="st-add-variant" data-type="${type}">+ Add Variant</button>`;
        html += `</div>`;
      }

      html += `
          </div>
        </div>
      `;
    }

    html += `<div class="st-section" style="margin-top:12px;display:flex;gap:10px;align-items:center;">
      <button id="st-save-alerts" class="btn-primary" style="width:auto;padding:8px 24px;">Save Alert Settings</button>
      <button id="st-reset-alerts" class="st-reset-btn" style="width:auto;padding:8px 16px;">Reset to Defaults</button>
    </div>`;

    panel.innerHTML = html;
    this._wireAlertsPanel(panel);
  }

  _wireAlertsPanel(panel) {
    // Copy buttons
    panel.querySelectorAll('.st-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
    });

    // Upload buttons (base alerts)
    panel.querySelectorAll('.st-upload-btn:not(.st-variant-upload)').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.type;
        const field = btn.dataset.field;
        const filterType = field === 'sound' ? 'sound' : 'image';
        const result = await window.chatty.overlayUploadAsset(filterType);
        if (result && result.filename) {
          const selector = field === 'sound' ? `.st-alert-sound[data-type="${type}"]` : `.st-alert-image[data-type="${type}"]`;
          panel.querySelector(selector).value = result.filename;
        }
      });
    });

    // Clear buttons (base alerts)
    panel.querySelectorAll('.st-clear-btn:not(.st-variant-clear)').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const field = btn.dataset.field;
        const selector = field === 'sound' ? `.st-alert-sound[data-type="${type}"]` : `.st-alert-image[data-type="${type}"]`;
        panel.querySelector(selector).value = '';
        btn.remove();
      });
    });

    // Test buttons (base alerts)
    panel.querySelectorAll('.st-test-btn:not(.st-test-variant-btn)').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this._saveAlerts(panel);
        await new Promise(r => setTimeout(r, 300));
        await window.chatty.overlayTestAlert(btn.dataset.type);
        btn.textContent = 'Sent!';
        setTimeout(() => { btn.textContent = 'Test Alert'; }, 1500);
      });
    });

    // Wire code tab switching
    this._wireCodeTabs(panel);

    // Wire variant upload/clear/remove/test and add-variant buttons
    this._wireVariantButtons(panel);

    // Add variant buttons
    panel.querySelectorAll('.st-add-variant').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const list = panel.querySelector(`.st-variants-list[data-type="${type}"]`);
        const idx = list.querySelectorAll('.st-variant-card').length;
        let defaultVariant;
        if (type === 'subscribe') {
          defaultVariant = { condition: 'resub', label: 'Resub', text: '{user} resubscribed for {months} months!' };
        } else if (type === 'cheer') {
          defaultVariant = { threshold: 100, label: '100+ Bits', text: '{user} cheered {amount} bits!' };
        } else {
          defaultVariant = { threshold: 50, label: '50+ Viewers', text: '{user} is raiding with {viewers} viewers!' };
        }
        const html = this._variantCardHtml(type, idx, defaultVariant);
        list.insertAdjacentHTML('beforeend', html);
        this._wireCodeTabs(panel);
        this._wireLayoutPickers(panel);
        this._wireVariantButtons(panel);
      });
    });

    // Layout picker buttons
    this._wireLayoutPickers(panel);

    // Save
    document.getElementById('st-save-alerts')?.addEventListener('click', async () => {
      await this._saveAlerts(panel);
      const btn = document.getElementById('st-save-alerts');
      btn.textContent = 'Saved!';
      setTimeout(() => { btn.textContent = 'Save Alert Settings'; }, 1500);
    });

    // Reset to Defaults
    document.getElementById('st-reset-alerts')?.addEventListener('click', async () => {
      const scenes = await window.chatty.getConfig('overlay.scenes') || [];
      const scene = scenes[this._editingSceneIdx] || {};
      scene.alerts = { delay: 3 };
      scenes[this._editingSceneIdx] = scene;
      await window.chatty.setConfig('overlay.scenes', scenes);
      await window.chatty.overlayReloadConfig();
      await this._renderAlerts();
    });
  }

  _wireLayoutPickers(panel) {
    panel.querySelectorAll('.st-layout-btn').forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', () => {
        const picker = btn.closest('.st-layout-picker');
        picker.querySelectorAll('.st-layout-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  _wireCodeTabs(panel) {
    panel.querySelectorAll('.st-code-tab').forEach(tab => {
      if (tab._wired) return;
      tab._wired = true;
      tab.addEventListener('click', () => {
        const section = tab.closest('.st-code-section');
        section.querySelectorAll('.st-code-tab').forEach(t => t.classList.toggle('active', t === tab));
        section.querySelectorAll('.st-code-area').forEach(a => a.classList.toggle('active', a.dataset.lang === tab.dataset.lang));
      });
    });
  }

  _wireVariantButtons(panel) {
    // Variant upload buttons
    panel.querySelectorAll('.st-variant-upload').forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', async () => {
        const card = btn.closest('.st-variant-card');
        const field = btn.dataset.field;
        const filterType = field === 'sound' ? 'sound' : 'image';
        const result = await window.chatty.overlayUploadAsset(filterType);
        if (result && result.filename) {
          const input = card.querySelector(field === 'sound' ? '.st-variant-sound' : '.st-variant-image');
          input.value = result.filename;
        }
      });
    });

    // Variant clear buttons
    panel.querySelectorAll('.st-variant-clear').forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', () => {
        const card = btn.closest('.st-variant-card');
        const field = btn.dataset.field;
        const input = card.querySelector(field === 'sound' ? '.st-variant-sound' : '.st-variant-image');
        input.value = '';
        btn.remove();
      });
    });

    // Variant remove buttons
    panel.querySelectorAll('.st-variant-remove').forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', () => {
        btn.closest('.st-variant-card').remove();
      });
    });

    // Variant test buttons
    panel.querySelectorAll('.st-test-variant-btn').forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', async () => {
        await this._saveAlerts(panel);
        await new Promise(r => setTimeout(r, 300));
        const type = btn.dataset.type;
        const card = btn.closest('.st-variant-card');
        let overrides = {};
        if (type === 'subscribe') {
          const condition = card.querySelector('.st-variant-condition')?.value || 'resub';
          if (condition === 'gifted') {
            overrides = { is_gift: true, months: 1 };
            await window.chatty.overlayTestAlert('subscribe', overrides);
          } else {
            overrides = { months: 24 };
            await window.chatty.overlayTestAlert('resub', overrides);
          }
        } else if (type === 'cheer') {
          const threshold = parseInt(card.querySelector('.st-variant-threshold')?.value) || 100;
          overrides = { amount: threshold };
          await window.chatty.overlayTestAlert('cheer', overrides);
        } else if (type === 'raid') {
          const threshold = parseInt(card.querySelector('.st-variant-threshold')?.value) || 50;
          overrides = { viewers: threshold };
          await window.chatty.overlayTestAlert('raid', overrides);
        }
        btn.textContent = 'Sent!';
        setTimeout(() => { btn.textContent = 'Test Variant'; }, 1500);
      });
    });
  }

  async _saveAlerts(panel) {
    const scenes = await window.chatty.getConfig('overlay.scenes') || [];
    const scene = scenes[this._editingSceneIdx] || {};
    if (!scene.alerts) scene.alerts = {};

    const types = ['follow', 'subscribe', 'cheer', 'raid'];
    for (const type of types) {
      const cfg = {
        enabled: panel.querySelector(`.st-alert-enabled[data-type="${type}"]`)?.checked ?? true,
        image: panel.querySelector(`.st-alert-image[data-type="${type}"]`)?.value || '',
        sound: panel.querySelector(`.st-alert-sound[data-type="${type}"]`)?.value || '',
        text: panel.querySelector(`.st-alert-text[data-type="${type}"]`)?.value || '',
        duration: parseFloat(panel.querySelector(`.st-alert-duration[data-type="${type}"]`)?.value) || 8,
        animation: panel.querySelector(`.st-alert-animation[data-type="${type}"]`)?.value || 'fadeIn',
        fontSize: parseInt(panel.querySelector(`.st-alert-font-size[data-type="${type}"]`)?.value) || 32,
        fontColor: panel.querySelector(`.st-alert-font-color[data-type="${type}"]`)?.value || '#ffffff',
        layout: panel.querySelector(`.st-layout-picker[data-type="${type}"] .st-layout-btn.active`)?.dataset?.layout || 'below',
        html: panel.querySelector(`.st-code-area[data-prefix="base-${type}"][data-lang="html"]`)?.value || '',
        css: panel.querySelector(`.st-code-area[data-prefix="base-${type}"][data-lang="css"]`)?.value || '',
        js: panel.querySelector(`.st-code-area[data-prefix="base-${type}"][data-lang="js"]`)?.value || '',
      };

      // Collect variants
      const variantCards = panel.querySelectorAll(`.st-variant-card[data-type="${type}"]`);
      if (variantCards.length > 0) {
        cfg.variants = [];
        variantCards.forEach(card => {
          const codeSection = card.querySelector('.st-code-section');
          const v = {
            image: card.querySelector('.st-variant-image')?.value || '',
            sound: card.querySelector('.st-variant-sound')?.value || '',
            text: card.querySelector('.st-variant-text')?.value || '',
            duration: parseFloat(card.querySelector('.st-variant-duration')?.value) || 0,
            animation: card.querySelector('.st-variant-animation')?.value || '',
            fontSize: parseInt(card.querySelector('.st-variant-font-size')?.value) || 0,
            fontColor: card.querySelector('.st-variant-font-color')?.value || '',
            layout: card.querySelector('.st-variant-layout-picker .st-layout-btn.active')?.dataset?.layout || '',
            html: codeSection?.querySelector('.st-code-area[data-lang="html"]')?.value || '',
            css: codeSection?.querySelector('.st-code-area[data-lang="css"]')?.value || '',
            js: codeSection?.querySelector('.st-code-area[data-lang="js"]')?.value || '',
          };
          if (type === 'subscribe') {
            v.condition = card.querySelector('.st-variant-condition')?.value || 'resub';
            v.label = card.querySelector('.st-variant-label')?.value || '';
          } else {
            v.threshold = parseInt(card.querySelector('.st-variant-threshold')?.value) || 0;
            v.label = card.querySelector('.st-variant-label')?.value || '';
          }
          cfg.variants.push(v);
        });
      }

      scene.alerts[type] = cfg;
    }
    scene.alerts.delay = parseInt(document.getElementById('st-alerts-delay')?.value) ?? 3;
    scenes[this._editingSceneIdx] = scene;
    await window.chatty.setConfig('overlay.scenes', scenes);
    await window.chatty.overlayReloadConfig();
  }

  // ── Chat Overlay Tab ──

  _chatSettingsHtml(prefix, cfg) {
    const enabled = cfg.enabled ?? true;
    const showBadges = cfg.showBadges ?? true;
    const showTimestamps = cfg.showTimestamps ?? false;
    const fontSize = cfg.fontSize || 16;
    const maxMessages = cfg.maxMessages || 6;
    const fadeOut = cfg.fadeOut ?? true;
    const fadeDelay = cfg.fadeDelay || 30;
    const animation = cfg.animation || 'slideIn';
    const css = cfg.css || '';

    return `
      <div class="st-form-row" style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" class="st-cv-enabled" data-prefix="${prefix}" ${enabled ? 'checked' : ''} style="width:auto;">
        <label style="margin:0;">Enable</label>
      </div>
      <div class="st-form-grid">
        <div class="st-form-row" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" class="st-cv-badges" data-prefix="${prefix}" ${showBadges ? 'checked' : ''} style="width:auto;">
          <label style="margin:0;">Show Badges</label>
        </div>
        <div class="st-form-row" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" class="st-cv-timestamps" data-prefix="${prefix}" ${showTimestamps ? 'checked' : ''} style="width:auto;">
          <label style="margin:0;">Show Timestamps</label>
        </div>
        <div class="st-form-row" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" class="st-cv-fadeout" data-prefix="${prefix}" ${fadeOut ? 'checked' : ''} style="width:auto;">
          <label style="margin:0;">Fade Out Messages</label>
        </div>
        <div class="st-form-row">
          <label>Fade Delay (s)</label>
          <input type="number" class="st-cv-fade-delay" data-prefix="${prefix}" value="${fadeDelay}" min="5" max="300" step="5">
        </div>
        <div class="st-form-row">
          <label>Font Size (px)</label>
          <input type="number" class="st-cv-font-size" data-prefix="${prefix}" value="${fontSize}" min="10" max="48" step="1">
        </div>
        <div class="st-form-row">
          <label>Max Messages</label>
          <input type="number" class="st-cv-max-messages" data-prefix="${prefix}" value="${maxMessages}" min="1" max="100" step="1">
        </div>
        <div class="st-form-row">
          <label>Animation</label>
          <select class="st-cv-animation" data-prefix="${prefix}">
            <option value="slideIn" ${animation === 'slideIn' ? 'selected' : ''}>Slide In Left</option>
            <option value="slideInRight" ${animation === 'slideInRight' ? 'selected' : ''}>Slide In Right</option>
            <option value="fadeIn" ${animation === 'fadeIn' ? 'selected' : ''}>Fade In</option>
            <option value="slideUp" ${animation === 'slideUp' ? 'selected' : ''}>Slide Up</option>
          </select>
        </div>
      </div>
      <div class="st-form-row" style="margin-top:6px;">
        <label>Custom CSS</label>
        <textarea class="st-cv-css st-css-editor" data-prefix="${prefix}" rows="4" placeholder=".overlay-msg { background: rgba(0,0,0,0.6); }">${this._escapeHtml(css)}</textarea>
      </div>`;
  }

  _readChatSettings(panel, prefix) {
    return {
      enabled: panel.querySelector(`.st-cv-enabled[data-prefix="${prefix}"]`)?.checked ?? true,
      showBadges: panel.querySelector(`.st-cv-badges[data-prefix="${prefix}"]`)?.checked ?? true,
      showTimestamps: panel.querySelector(`.st-cv-timestamps[data-prefix="${prefix}"]`)?.checked ?? false,
      fadeOut: panel.querySelector(`.st-cv-fadeout[data-prefix="${prefix}"]`)?.checked ?? true,
      fadeDelay: parseInt(panel.querySelector(`.st-cv-fade-delay[data-prefix="${prefix}"]`)?.value) || 30,
      fontSize: parseInt(panel.querySelector(`.st-cv-font-size[data-prefix="${prefix}"]`)?.value) || 16,
      maxMessages: parseInt(panel.querySelector(`.st-cv-max-messages[data-prefix="${prefix}"]`)?.value) || 6,
      animation: panel.querySelector(`.st-cv-animation[data-prefix="${prefix}"]`)?.value || 'slideIn',
      css: panel.querySelector(`.st-cv-css[data-prefix="${prefix}"]`)?.value || '',
    };
  }

  async _renderChat() {
    const panel = document.getElementById('st-chat-panel');
    if (!panel) return;

    const serverRunning = await window.chatty.overlayIsRunning();
    const port = await window.chatty.getConfig('overlay.port') || 7878;
    const scenes = await window.chatty.getConfig('overlay.scenes') || [];
    const scene = scenes[this._editingSceneIdx] || {};
    const chat = scene.chat || {};

    const baseCfg = {
      enabled: chat.enabled ?? true,
      showBadges: chat.showBadges ?? true,
      showTimestamps: chat.showTimestamps ?? false,
      fontSize: chat.fontSize || 16,
      maxMessages: chat.maxMessages || 6,
      fadeOut: chat.fadeOut ?? true,
      fadeDelay: chat.fadeDelay || 30,
      animation: chat.animation || 'slideIn',
      css: chat.css || '',
    };

    const suffix = this._sceneSuffix();
    const chatUrl = `http://127.0.0.1:${port}/chat${suffix}`;

    let html = `<div class="st-alert-card">
      <div class="st-alert-header">
        <span class="st-alert-label">Chat Overlay</span>
      </div>
      <div class="st-alert-body">`;

    if (serverRunning) {
      html += `<div class="st-url-bar" style="margin-bottom:8px;">
        <span>URL:</span>
        <code>${chatUrl}</code>
        <button class="st-copy-btn" data-copy="${chatUrl}" title="Copy URL">Copy</button>
      </div>`;
    }

    html += this._chatSettingsHtml('base', baseCfg);
    html += `</div></div>`;

    html += `<div class="st-section" style="margin-top:12px;">
      <button id="st-save-chat" class="btn-primary" style="width:auto;padding:8px 24px;">Save Chat Settings</button>
    </div>`;

    panel.innerHTML = html;
    this._wireChatPanel(panel);
  }

  _wireChatPanel(panel) {
    // Copy buttons
    panel.querySelectorAll('.st-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
    });

    // Save
    document.getElementById('st-save-chat')?.addEventListener('click', async () => {
      const base = this._readChatSettings(panel, 'base');
      const scenes = await window.chatty.getConfig('overlay.scenes') || [];
      const scene = scenes[this._editingSceneIdx] || {};
      scene.chat = { ...scene.chat, ...base };
      scenes[this._editingSceneIdx] = scene;
      await window.chatty.setConfig('overlay.scenes', scenes);

      await window.chatty.overlayReloadConfig();
      const btn = document.getElementById('st-save-chat');
      btn.textContent = 'Saved!';
      setTimeout(() => { btn.textContent = 'Save Chat Settings'; }, 1500);
    });
  }

  // ── Position Preview Tab ──

  // Default positions
  _defaultAlertPos() { return { x: 50, y: 20, width: 20, height: 15 }; }
  _defaultChatPos() { return { x: 2, y: 60, width: 25, height: 35 }; }
  _snapThreshold = 2; // percent distance to snap to guides

  async _renderPreview() {
    const panel = document.getElementById('st-preview-panel');
    if (!panel) return;

    const scenes = await window.chatty.getConfig('overlay.scenes') || [];
    const scene = scenes[this._editingSceneIdx] || {};

    const defAlert = this._defaultAlertPos();
    const defChat = this._defaultChatPos();
    const alertPos = scene.alerts?.position || defAlert;
    const chatPos = scene.chat?.position || defChat;

    // Fill in width/height defaults if missing (backwards compat)
    if (!alertPos.width) alertPos.width = defAlert.width;
    if (!alertPos.height) alertPos.height = defAlert.height;

    const resolutions = [
      { label: '720p', w: 1280, h: 720 },
      { label: '1080p', w: 1920, h: 1080 },
      { label: '1440p', w: 2560, h: 1440 },
      { label: '4K', w: 3840, h: 2160 },
    ];

    const r = this._previewResolution;
    const alertPxW = Math.round(r.w * alertPos.width / 100);
    const alertPxH = Math.round(r.h * alertPos.height / 100);
    const chatPxW = Math.round(r.w * chatPos.width / 100);
    const chatPxH = Math.round(r.h * chatPos.height / 100);

    let html = `
      <div class="st-section">
        <h4>Overlay Position Preview</h4>
        <p class="form-hint">Drag boxes to position. Drag corner handles to resize. Boxes snap to center guides.</p>
        <div class="st-resolution-bar">
          ${resolutions.map(res => `<button class="st-res-btn ${res.label === this._previewResolution.label ? 'active' : ''}" data-w="${res.w}" data-h="${res.h}" data-label="${res.label}">${res.label} (${res.w}x${res.h})</button>`).join('')}
          <button id="st-reset-positions" class="st-res-btn" style="margin-left:auto;color:#ef4444;border-color:rgba(239,68,68,0.3);">Reset Positions</button>
        </div>
      </div>
      <div class="st-preview-wrapper">
        <div class="st-preview-canvas" id="st-preview-canvas">
          <div class="st-preview-label">${r.label} (${r.w}x${r.h})</div>
          <div class="st-guide-h"></div>
          <div class="st-guide-v"></div>
          <div class="st-preview-box st-preview-alert" id="st-drag-alert">
            <span class="st-box-label">ALERTS</span>
            <div class="st-resize-handle st-handle-tl" data-dir="tl"></div>
            <div class="st-resize-handle st-handle-tr" data-dir="tr"></div>
            <div class="st-resize-handle st-handle-bl" data-dir="bl"></div>
            <div class="st-resize-handle st-handle-br" data-dir="br"></div>
          </div>
          <div class="st-preview-box st-preview-chat" id="st-drag-chat">
            <span class="st-box-label">CHAT</span>
            <div class="st-resize-handle st-handle-tl" data-dir="tl"></div>
            <div class="st-resize-handle st-handle-tr" data-dir="tr"></div>
            <div class="st-resize-handle st-handle-bl" data-dir="bl"></div>
            <div class="st-resize-handle st-handle-br" data-dir="br"></div>
          </div>
        </div>
      </div>
      <div class="st-section st-preview-coords">
        <h4 style="margin-bottom:8px;">Alert Dimensions</h4>
        <div class="st-form-grid">
          <div class="st-form-row">
            <label>X (%)</label>
            <input type="number" id="st-alert-x" value="${alertPos.x}" min="0" max="100" step="1">
          </div>
          <div class="st-form-row">
            <label>Y (%)</label>
            <input type="number" id="st-alert-y" value="${alertPos.y}" min="0" max="100" step="1">
          </div>
          <div class="st-form-row">
            <label>Width (%)</label>
            <input type="number" id="st-alert-w" value="${alertPos.width}" min="5" max="100" step="1">
          </div>
          <div class="st-form-row">
            <label>Height (%)</label>
            <input type="number" id="st-alert-h" value="${alertPos.height}" min="5" max="100" step="1">
          </div>
        </div>
        <div class="st-dims-display" id="st-alert-dims">${alertPxW} x ${alertPxH} px</div>

        <h4 style="margin-top:12px;margin-bottom:8px;">Chat Dimensions</h4>
        <div class="st-form-grid">
          <div class="st-form-row">
            <label>X (%)</label>
            <input type="number" id="st-chat-x" value="${chatPos.x}" min="0" max="100" step="1">
          </div>
          <div class="st-form-row">
            <label>Y (%)</label>
            <input type="number" id="st-chat-y" value="${chatPos.y}" min="0" max="100" step="1">
          </div>
          <div class="st-form-row">
            <label>Width (%)</label>
            <input type="number" id="st-chat-w" value="${chatPos.width}" min="5" max="100" step="1">
          </div>
          <div class="st-form-row">
            <label>Height (%)</label>
            <input type="number" id="st-chat-h" value="${chatPos.height}" min="5" max="100" step="1">
          </div>
        </div>
        <div class="st-dims-display" id="st-chat-dims">${chatPxW} x ${chatPxH} px</div>

        <button id="st-save-positions" class="btn-primary" style="width:auto;padding:8px 24px;margin-top:12px;">Save Positions</button>
      </div>
    `;

    panel.innerHTML = html;

    // Resolution buttons
    panel.querySelectorAll('.st-res-btn:not(#st-reset-positions)').forEach(btn => {
      btn.addEventListener('click', () => {
        this._previewResolution = { w: parseInt(btn.dataset.w), h: parseInt(btn.dataset.h), label: btn.dataset.label };
        panel.querySelectorAll('.st-res-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._updatePreviewCanvas(panel);
      });
    });

    // Reset positions
    document.getElementById('st-reset-positions')?.addEventListener('click', () => {
      const da = this._defaultAlertPos();
      const dc = this._defaultChatPos();
      document.getElementById('st-alert-x').value = da.x;
      document.getElementById('st-alert-y').value = da.y;
      document.getElementById('st-alert-w').value = da.width;
      document.getElementById('st-alert-h').value = da.height;
      document.getElementById('st-chat-x').value = dc.x;
      document.getElementById('st-chat-y').value = dc.y;
      document.getElementById('st-chat-w').value = dc.width;
      document.getElementById('st-chat-h').value = dc.height;
      this._updateBoxPositionsFromInputs(panel);
    });

    // Set up dragging and resizing
    this._setupPreviewDrag(panel);

    // Position the boxes initially
    requestAnimationFrame(() => this._updatePreviewCanvas(panel));

    // Save positions
    document.getElementById('st-save-positions')?.addEventListener('click', async () => {
      const ax = parseFloat(document.getElementById('st-alert-x').value) || 50;
      const ay = parseFloat(document.getElementById('st-alert-y').value) || 20;
      const aw = parseFloat(document.getElementById('st-alert-w').value) || 20;
      const ah = parseFloat(document.getElementById('st-alert-h').value) || 15;
      const cx = parseFloat(document.getElementById('st-chat-x').value) || 2;
      const cy = parseFloat(document.getElementById('st-chat-y').value) || 60;
      const cw = parseFloat(document.getElementById('st-chat-w').value) || 25;
      const ch = parseFloat(document.getElementById('st-chat-h').value) || 35;

      const scenes = await window.chatty.getConfig('overlay.scenes') || [];
      const scene = scenes[this._editingSceneIdx] || {};
      if (!scene.alerts) scene.alerts = {};
      if (!scene.chat) scene.chat = {};
      scene.alerts.position = { x: ax, y: ay, width: aw, height: ah };
      scene.chat.position = { x: cx, y: cy, width: cw, height: ch };
      scenes[this._editingSceneIdx] = scene;
      await window.chatty.setConfig('overlay.scenes', scenes);
      await window.chatty.overlayReloadConfig();

      const btn = document.getElementById('st-save-positions');
      btn.textContent = 'Saved!';
      setTimeout(() => { btn.textContent = 'Save Positions'; }, 1500);
    });

    // Coordinate inputs update preview
    ['st-alert-x', 'st-alert-y', 'st-alert-w', 'st-alert-h', 'st-chat-x', 'st-chat-y', 'st-chat-w', 'st-chat-h'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        this._updateBoxPositionsFromInputs(panel);
      });
    });
  }

  _updatePreviewCanvas(panel) {
    const canvas = panel.querySelector('#st-preview-canvas');
    if (!canvas) return;

    const maxWidth = 700;
    const ratio = this._previewResolution.h / this._previewResolution.w;
    const canvasWidth = Math.min(maxWidth, panel.clientWidth - 32);
    const canvasHeight = canvasWidth * ratio;

    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';

    const label = canvas.querySelector('.st-preview-label');
    if (label) label.textContent = `${this._previewResolution.label} (${this._previewResolution.w}x${this._previewResolution.h})`;

    this._updateBoxPositionsFromInputs(panel);
  }

  _updateBoxPositionsFromInputs(panel) {
    const canvas = panel.querySelector('#st-preview-canvas');
    const alertBox = panel.querySelector('#st-drag-alert');
    const chatBox = panel.querySelector('#st-drag-chat');
    if (!canvas || !alertBox || !chatBox) return;

    const ax = parseFloat(document.getElementById('st-alert-x')?.value) || 50;
    const ay = parseFloat(document.getElementById('st-alert-y')?.value) || 20;
    const aw = parseFloat(document.getElementById('st-alert-w')?.value) || 20;
    const ah = parseFloat(document.getElementById('st-alert-h')?.value) || 15;
    const cx = parseFloat(document.getElementById('st-chat-x')?.value) || 2;
    const cy = parseFloat(document.getElementById('st-chat-y')?.value) || 60;
    const cw = parseFloat(document.getElementById('st-chat-w')?.value) || 25;
    const ch = parseFloat(document.getElementById('st-chat-h')?.value) || 35;

    // Alert: positioned by center point
    alertBox.style.left = ax + '%';
    alertBox.style.top = ay + '%';
    alertBox.style.transform = 'translate(-50%, -50%)';
    alertBox.style.width = aw + '%';
    alertBox.style.height = ah + '%';

    // Chat: positioned by top-left
    chatBox.style.left = cx + '%';
    chatBox.style.top = cy + '%';
    chatBox.style.width = cw + '%';
    chatBox.style.height = ch + '%';
    chatBox.style.transform = 'none';

    // Update pixel dimensions display
    const r = this._previewResolution;
    const alertDims = document.getElementById('st-alert-dims');
    const chatDims = document.getElementById('st-chat-dims');
    if (alertDims) alertDims.textContent = `${Math.round(r.w * aw / 100)} x ${Math.round(r.h * ah / 100)} px`;
    if (chatDims) chatDims.textContent = `${Math.round(r.w * cw / 100)} x ${Math.round(r.h * ch / 100)} px`;
  }

  // Snap a value to 50% if within threshold
  _snap(val) {
    return Math.abs(val - 50) < this._snapThreshold ? 50 : val;
  }

  _setupPreviewDrag(panel) {
    const canvas = panel.querySelector('#st-preview-canvas');
    const alertBox = panel.querySelector('#st-drag-alert');
    const chatBox = panel.querySelector('#st-drag-chat');
    if (!canvas || !alertBox || !chatBox) return;

    // ── Move drag ──
    const startDrag = (e, box, isAlert) => {
      if (e.target.classList.contains('st-resize-handle')) return; // let resize handle it
      e.preventDefault();
      const canvasRect = canvas.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();

      if (isAlert) {
        this._dragOffset.x = e.clientX - (boxRect.left + boxRect.width / 2);
        this._dragOffset.y = e.clientY - (boxRect.top + boxRect.height / 2);
      } else {
        this._dragOffset.x = e.clientX - boxRect.left;
        this._dragOffset.y = e.clientY - boxRect.top;
      }
      this._dragTarget = { box, isAlert, canvasRect, mode: 'move' };

      const guideH = canvas.querySelector('.st-guide-h');
      const guideV = canvas.querySelector('.st-guide-v');

      const onMove = (ev) => {
        if (!this._dragTarget || this._dragTarget.mode !== 'move') return;
        const { canvasRect, isAlert } = this._dragTarget;

        if (isAlert) {
          let pctX = ((ev.clientX - this._dragOffset.x - canvasRect.left) / canvasRect.width) * 100;
          let pctY = ((ev.clientY - this._dragOffset.y - canvasRect.top) / canvasRect.height) * 100;
          pctX = Math.max(0, Math.min(100, pctX));
          pctY = Math.max(0, Math.min(100, pctY));
          pctX = this._snap(pctX);
          pctY = this._snap(pctY);
          document.getElementById('st-alert-x').value = Math.round(pctX);
          document.getElementById('st-alert-y').value = Math.round(pctY);
          // Highlight guides on snap
          guideV?.classList.toggle('st-guide-snap', pctX === 50);
          guideH?.classList.toggle('st-guide-snap', pctY === 50);
        } else {
          const boxW = parseFloat(document.getElementById('st-chat-w').value) || 25;
          const boxH = parseFloat(document.getElementById('st-chat-h').value) || 35;
          let pctX = ((ev.clientX - this._dragOffset.x - canvasRect.left) / canvasRect.width) * 100;
          let pctY = ((ev.clientY - this._dragOffset.y - canvasRect.top) / canvasRect.height) * 100;
          pctX = Math.max(0, Math.min(100, pctX));
          pctY = Math.max(0, Math.min(100, pctY));
          // Snap center of chat box to guides
          const centerX = pctX + boxW / 2;
          const centerY = pctY + boxH / 2;
          if (Math.abs(centerX - 50) < this._snapThreshold) pctX = 50 - boxW / 2;
          if (Math.abs(centerY - 50) < this._snapThreshold) pctY = 50 - boxH / 2;
          document.getElementById('st-chat-x').value = Math.round(pctX);
          document.getElementById('st-chat-y').value = Math.round(pctY);
          const finalCenterX = Math.round(pctX) + boxW / 2;
          const finalCenterY = Math.round(pctY) + boxH / 2;
          guideV?.classList.toggle('st-guide-snap', Math.abs(finalCenterX - 50) < this._snapThreshold);
          guideH?.classList.toggle('st-guide-snap', Math.abs(finalCenterY - 50) < this._snapThreshold);
        }
        this._updateBoxPositionsFromInputs(panel);
      };

      const onUp = () => {
        this._dragTarget = null;
        guideH?.classList.remove('st-guide-snap');
        guideV?.classList.remove('st-guide-snap');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    alertBox.addEventListener('mousedown', (e) => startDrag(e, alertBox, true));
    chatBox.addEventListener('mousedown', (e) => startDrag(e, chatBox, false));

    // ── Resize handles ──
    const startResize = (e, box, isAlert, dir) => {
      e.preventDefault();
      e.stopPropagation();
      const canvasRect = canvas.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;

      const xId = isAlert ? 'st-alert-x' : 'st-chat-x';
      const yId = isAlert ? 'st-alert-y' : 'st-chat-y';
      const wId = isAlert ? 'st-alert-w' : 'st-chat-w';
      const hId = isAlert ? 'st-alert-h' : 'st-chat-h';

      const origX = parseFloat(document.getElementById(xId).value);
      const origY = parseFloat(document.getElementById(yId).value);
      const origW = parseFloat(document.getElementById(wId).value);
      const origH = parseFloat(document.getElementById(hId).value);

      const onMove = (ev) => {
        const dx = ((ev.clientX - startX) / canvasRect.width) * 100;
        const dy = ((ev.clientY - startY) / canvasRect.height) * 100;

        let newX = origX, newY = origY, newW = origW, newH = origH;

        if (isAlert) {
          // Alert uses center positioning, so resize from corners adjusts width/height symmetrically
          if (dir === 'br') {
            newW = Math.max(5, origW + dx * 2);
            newH = Math.max(5, origH + dy * 2);
          } else if (dir === 'bl') {
            newW = Math.max(5, origW - dx * 2);
            newH = Math.max(5, origH + dy * 2);
          } else if (dir === 'tr') {
            newW = Math.max(5, origW + dx * 2);
            newH = Math.max(5, origH - dy * 2);
          } else if (dir === 'tl') {
            newW = Math.max(5, origW - dx * 2);
            newH = Math.max(5, origH - dy * 2);
          }
        } else {
          // Chat uses top-left positioning
          if (dir === 'br') {
            newW = Math.max(5, origW + dx);
            newH = Math.max(5, origH + dy);
          } else if (dir === 'bl') {
            newX = origX + dx;
            newW = Math.max(5, origW - dx);
            newH = Math.max(5, origH + dy);
          } else if (dir === 'tr') {
            newY = origY + dy;
            newW = Math.max(5, origW + dx);
            newH = Math.max(5, origH - dy);
          } else if (dir === 'tl') {
            newX = origX + dx;
            newY = origY + dy;
            newW = Math.max(5, origW - dx);
            newH = Math.max(5, origH - dy);
          }
        }

        document.getElementById(xId).value = Math.round(Math.max(0, Math.min(100, newX)));
        document.getElementById(yId).value = Math.round(Math.max(0, Math.min(100, newY)));
        document.getElementById(wId).value = Math.round(Math.min(100, newW));
        document.getElementById(hId).value = Math.round(Math.min(100, newH));
        this._updateBoxPositionsFromInputs(panel);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    // Attach resize handles for both boxes
    [{ box: alertBox, isAlert: true }, { box: chatBox, isAlert: false }].forEach(({ box, isAlert }) => {
      box.querySelectorAll('.st-resize-handle').forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
          startResize(e, box, isAlert, handle.dataset.dir);
        });
      });
    });
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}
