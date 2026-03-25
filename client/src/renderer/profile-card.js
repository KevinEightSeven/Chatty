(() => {
  const body = document.getElementById('body');
  const titleText = document.getElementById('titlebar-text');
  const closeBtn = document.getElementById('btn-close');
  let msgCount = 0;
  let messagesEl = null;
  let headerEl = null;
  let channel = '';

  closeBtn.addEventListener('click', () => window.profileCard.close());

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function daysSince(dateStr) {
    const date = new Date(dateStr);
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

  window.profileCard.onData((data) => {
    channel = data.channel || '';
    titleText.textContent = data.displayName || data.username;

    let html = '';

    // Header
    html += `<div class="header">
      <div class="avatar-wrap">
        <img class="avatar" src="${escapeHtml(data.avatarUrl)}" alt="">
        ${data.isLive ? '<div class="live-badge">LIVE</div>' : ''}
      </div>
      <div class="names">
        <a class="displayname" id="name-link" style="color:${data.color || '#e4e4e7'}">${escapeHtml(data.displayName)}</a>
        <div class="username">@${escapeHtml(data.username)}</div>
        ${data.userId ? `<div class="user-id" id="user-id" title="Click to copy">ID: ${escapeHtml(data.userId)}</div>` : ''}
      </div>
    </div>`;

    // Bio
    if (data.bio) {
      html += `<div class="bio">${escapeHtml(data.bio)}</div>`;
    }

    // Info
    html += '<div class="info">';
    const createdDate = data.createdAt ? new Date(data.createdAt) : null;
    const createdStr = createdDate
      ? createdDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'Unknown';
    const accountAge = data.createdAt ? daysSince(data.createdAt) : '';
    html += `<div class="row"><span class="label">Created</span><span>${escapeHtml(createdStr)}${accountAge ? ` (${escapeHtml(accountAge)})` : ''}</span></div>`;

    if (data.showFollowSub) {
      if (data.isFollowing && data.followedAt) {
        const d = new Date(data.followedAt);
        const fStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        html += `<div class="row"><span class="label">Following since</span><span>${escapeHtml(fStr)} (${daysSince(data.followedAt)})</span></div>`;
      } else {
        html += '<div class="row dim">Not following</div>';
      }
      if (data.isSubscriber) {
        html += '<div class="row"><span class="label">Subscriber</span><span class="sub-badge">Subscribed</span></div>';
      }
    }
    html += '</div>';

    // Stream/game
    if (data.gameName) {
      html += '<div class="stream">';
      if (data.boxArtUrl) {
        html += `<a class="boxart-link" id="boxart-link"><img class="boxart" src="${escapeHtml(data.boxArtUrl)}" alt="${escapeHtml(data.gameName)}"></a>`;
      }
      html += `<div class="stream-info">
        <div class="game">${escapeHtml(data.gameName)}</div>
        ${data.streamTitle ? `<div class="stream-title">${escapeHtml(data.streamTitle)}</div>` : ''}
        <a class="stream-link" id="stream-link">Watch ${escapeHtml(data.displayName)}</a>
      </div></div>`;
    }

    // Mod buttons
    if (data.showModButtons) {
      html += `<div class="mod-buttons">
        <button class="mod-btn" id="btn-timeout">Timeout 5m</button>
        <button class="mod-btn mod-ban" id="btn-ban">Ban</button>
      </div>`;
    }

    // Messages
    html += `<div class="messages-header" id="msg-header">Messages in #${escapeHtml(channel)} (0)</div>`;
    html += '<div class="messages" id="messages"></div>';

    body.innerHTML = html;

    // Wire display name click
    const nameLink = document.getElementById('name-link');
    if (nameLink) {
      nameLink.addEventListener('click', () => {
        window.profileCard.openExternal(`https://www.twitch.tv/${data.username}`);
      });
    }

    // Wire user ID click-to-copy
    const userIdEl = document.getElementById('user-id');
    if (userIdEl) {
      userIdEl.addEventListener('click', () => {
        navigator.clipboard.writeText(data.userId).then(() => {
          userIdEl.textContent = 'Copied!';
          setTimeout(() => { userIdEl.textContent = `ID: ${data.userId}`; }, 1500);
        });
      });
    }

    // Wire boxart click
    const boxartLink = document.getElementById('boxart-link');
    if (boxartLink && data.gameLink) {
      boxartLink.addEventListener('click', () => {
        window.profileCard.openExternal(data.gameLink);
      });
    }

    // Wire stream link → open channel in browser
    const streamLink = document.getElementById('stream-link');
    if (streamLink) {
      streamLink.addEventListener('click', () => {
        window.profileCard.openExternal(`https://www.twitch.tv/${data.username}`);
      });
    }

    // Wire mod buttons
    const btnTimeout = document.getElementById('btn-timeout');
    if (btnTimeout) {
      btnTimeout.addEventListener('click', async () => {
        const res = await window.profileCard.modAction('timeout', data.broadcasterId, data.myUserId, data.userId);
        if (res.error) {
          showResult(`Timeout failed: ${res.error}`);
        } else {
          showResult(`${data.displayName} timed out for 5 minutes.`);
          setTimeout(() => window.profileCard.close(), 1500);
        }
      });
    }

    const btnBan = document.getElementById('btn-ban');
    if (btnBan) {
      btnBan.addEventListener('click', async () => {
        const res = await window.profileCard.modAction('ban', data.broadcasterId, data.myUserId, data.userId);
        if (res.error) {
          showResult(`Ban failed: ${res.error}`);
        } else {
          showResult(`${data.displayName} has been banned.`);
          setTimeout(() => window.profileCard.close(), 1500);
        }
      });
    }

    // Render messages
    messagesEl = document.getElementById('messages');
    headerEl = document.getElementById('msg-header');

    if (data.messages && data.messages.length > 0) {
      let msgsHtml = '';
      for (const m of data.messages) {
        msgsHtml += `<div class="msg"><span class="msg-time">${escapeHtml(m.ts)}</span><span class="msg-text">${m.html || escapeHtml(m.message || '')}</span></div>`;
      }
      messagesEl.innerHTML = msgsHtml;
      msgCount = data.messages.length;
      headerEl.textContent = `Messages in #${channel} (${msgCount})`;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  });

  // Live message updates
  window.profileCard.onMessage((data) => {
    if (!messagesEl) return;
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML = `<span class="msg-time">${escapeHtml(data.ts)}</span><span class="msg-text">${data.html || escapeHtml(data.message || '')}</span>`;
    messagesEl.appendChild(div);

    const wasAtBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 30;
    if (wasAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;

    msgCount++;
    if (headerEl) headerEl.textContent = `Messages in #${channel} (${msgCount})`;
  });

  function showResult(text) {
    const el = document.createElement('div');
    el.className = 'result-msg';
    el.textContent = text;
    body.appendChild(el);
  }
})();
