/**
 * TabManager — Manages the tab bar (Chatterino-style Notebook tabs).
 * Each tab owns a SplitContainer with one or more split panels.
 */
class TabManager {
  constructor() {
    this.tabs = [];
    this.activeTabId = null;
    this.tabIdCounter = 0;
    this.container = document.getElementById('tabs-container');
    this.addBtn = document.getElementById('btn-add-tab');

    this.addBtn.addEventListener('click', () => this.addTab());
  }

  addTab(name = 'New Tab') {
    const id = `tab-${++this.tabIdCounter}`;
    const tab = {
      id,
      name,
      splits: [], // managed by SplitManager
    };

    this.tabs.push(tab);
    this._renderTab(tab);
    this.switchTo(id);

    return tab;
  }

  removeTab(id) {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;

    // Clean up splits for this tab
    if (window.splitManager) {
      window.splitManager.destroyTabSplits(id);
    }

    this.tabs.splice(idx, 1);

    // Remove DOM element
    const el = this.container.querySelector(`[data-tab-id="${id}"]`);
    if (el) el.remove();

    // If this was the active tab, switch to another
    if (this.activeTabId === id) {
      if (this.tabs.length > 0) {
        this.switchTo(this.tabs[Math.max(0, idx - 1)].id);
      } else {
        this.activeTabId = null;
        this.addTab();
      }
    }
  }

  switchTo(id) {
    this.activeTabId = id;

    // Update tab UI
    this.container.querySelectorAll('.tab').forEach((el) => {
      el.classList.toggle('active', el.dataset.tabId === id);
    });

    // Show/hide split containers
    if (window.splitManager) {
      window.splitManager.showTab(id);
    }
  }

  renameTab(id, name) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    tab.name = name;
    const el = this.container.querySelector(`[data-tab-id="${id}"] .tab-name`);
    if (el) el.textContent = name;
  }

  getActiveTab() {
    return this.tabs.find((t) => t.id === this.activeTabId) || null;
  }

  _renderTab(tab) {
    const el = document.createElement('div');
    el.className = 'tab';
    el.dataset.tabId = tab.id;
    el.innerHTML = `
      <span class="tab-name">${tab.name}</span>
      <button class="tab-close" title="Close tab">✕</button>
    `;

    el.querySelector('.tab-name').addEventListener('click', () => {
      this.switchTo(tab.id);
    });

    el.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeTab(tab.id);
    });

    // Double-click to rename
    el.querySelector('.tab-name').addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const nameEl = el.querySelector('.tab-name');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = tab.name;
      input.style.cssText = 'background:var(--bg-input);border:1px solid var(--accent);color:var(--text-primary);font-size:11px;padding:0 4px;width:80px;border-radius:2px;outline:none;';

      const finish = () => {
        const newName = input.value.trim() || tab.name;
        this.renameTab(tab.id, newName);
        input.replaceWith(nameEl);
        nameEl.textContent = newName;
      };

      input.addEventListener('blur', finish);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') finish();
        if (ev.key === 'Escape') {
          input.replaceWith(nameEl);
        }
      });

      nameEl.replaceWith(input);
      input.focus();
      input.select();
    });

    this.container.appendChild(el);
  }
}
