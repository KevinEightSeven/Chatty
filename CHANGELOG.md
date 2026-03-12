# Chatty — Changelog

<!--
  SESSION NOTE FOR AI ASSISTANTS:
  Before making any changes, READ this changelog and the project structure at the bottom
  to understand the full application.

  RELEASE PROCESS — do this every time work is done:
  1. Update this changelog with all changes made
  2. Bump the version in package.json AND src/renderer/index.html (titlebar)
  3. Commit, tag (vX.Y.Z), push to GitHub
  4. Build GitHub release artifacts: AppImage, .deb, .rpm, and Windows installer (Chatty-Setup.exe)
     - `npm run dist:linux` builds AppImage + deb + rpm
     - `npm run dist:win` builds Windows installer
     - Do NOT build .pacman for GitHub — Arch is handled via AUR
  5. Create GitHub release, upload the 4 artifacts
  6. Update AUR package (separate repo at /mnt/sd1/Dev/Projects/chatty-twitch):
     - Bump pkgver in PKGBUILD
     - Update sha256sums: `sha256sum release/Chatty.AppImage | awk '{print $1}'`
     - Regenerate .SRCINFO: `cd /mnt/sd1/Dev/Projects/chatty-twitch && makepkg --printsrcinfo > .SRCINFO`
     - Commit and push: `git push origin master`
  7. Keep the changelog up to date every session — it is the single source of truth
     for what changed and when, especially across session boundaries.
-->

## v1.3.4 (2026-03-12)

### Bug Fixes
- **Missing chat messages**: Added client-side PING keepalive (60s interval) to detect silent IRC disconnects and auto-reconnect
- **Multi-split same channel**: Closing one split no longer kills chat for other splits on the same channel (ref-counted listeners and ref-counted PART)
- **Channel name click**: Disabled popout player on channel name click; use the dedicated video icon instead
- **Modal close behavior**: Streamer Tools and Settings now only close via the close button, not by clicking the background
- **Alert log storage**: Alerts now persist to `{userData}/alerts/alerts.log` (file-based) instead of electron-store

### Improvements
- **Alerts split persistence**: Alerts panel position is saved/restored with the session like chat splits
- **Streamer Tools icon**: Changed from video camera to shield icon
- **Linux packages**: Added .deb and .rpm builds alongside AppImage
- **AUR package**: Published `chatty-twitch` to the Arch User Repository
- **Install instructions**: README updated with per-distro install commands

## v1.3.3 (2026-03-11)

### Bug Fixes
- **Auto-updater install**: Linux AppImage updates now work correctly (can't overwrite a running FUSE-mounted AppImage; writes update alongside, swaps, relaunches)
- **Auto-updater relaunch**: `app.relaunch()` now uses the AppImage path instead of the electron binary
- **Auto-updater Windows**: Added delay before quit so the IPC response reaches the renderer
- **Update UI**: Fixed update result check (`res.error` → `!res.success`), shows "Restarting..." on success

## v1.3.2 (2026-03-11)

### Bug Fixes
- **Duplicate messages**: Chat messages were appearing 3x due to stacking IRC listeners; now deduped with a listener guard
- **Alert defaults**: Removed custom HTML/CSS/JS alert templates; alerts now use clean simple text mode by default
- **Chat overlay first message**: Badges and emotes were missing on the first message due to unawaited async loading; now fully awaited
- **OBS multi-scene alerts**: Multiple scenes playing alert sounds simultaneously; overlays now use OBS visibility detection (`obsSourceVisibleChanged`) so only the active OBS scene plays alerts
- **Settings cleanup**: Removed redundant "Chat Logs" section from settings (covered by Data Folder)

## v1.3.1 (2026-03-11)

### Bug Fixes
- **Chat overlay**: Only captures messages from the logged-in user's own channel (was showing all viewed channels)
- **Alert sounds**: Added `<audio>` element fallback when Web Audio API context is suspended
- **Alert templates**: Default templates now fill in when custom HTML is empty (alerts were rendering as plain text)
- **Version display**: Title bar was stuck at v1.2.1, now shows correct version
- **Scene migration**: Config migration runs on both server start and Streamer Tools open (prevents race condition)
- **Input fields**: Added `user-select: text` to form elements for Linux/Wayland compatibility

## v1.3.0 (2026-03-11)

### New Features
- **Streamer Tools**: Full OBS overlay system with scenes, alerts, and chat overlay
  - Scene-based overlay management — each scene has its own alerts, chat overlay, and position settings
  - Alert system with customizable HTML/CSS/JS templates, images, sounds, and animations
  - Alert variants (resub, gifted sub, bit thresholds, raid viewer thresholds)
  - Chat overlay with configurable badges, timestamps, fade, font size, animations, and custom CSS
  - Position preview with drag-and-drop placement on a resolution-accurate canvas
  - Local HTTP + WebSocket server for OBS Browser Sources
  - Scene URLs: `/alerts`, `/chat`, `/alerts2`, `/chat2`, etc.
  - Auto-start overlay server option in settings
- **Overlay Chat Renderer**: Server-side chat message rendering with Twitch/BTTV/FFZ/7TV emotes and badges

## v1.2.1 (2026-03-10)

### Changes
- Gray `>_` app icon
- System tray support with close-to-tray (enabled by default)

## v1.2.0 (2026-03-10)

### New Features
- Full Twitch slash commands (`/ban`, `/timeout`, `/mod`, `/vip`, `/raid`, `/announce`, etc.)
- Auto-updater — checks GitHub releases on startup, downloads and installs updates
- Polls display in chat
- Announcements styling
- Command autocomplete with `/` prefix

## v1.1.0 (2026-03-10)

### New Features
- Slash commands support
- 4-box drag indicator for split rearrangement
- Responsive scaling
- UI polish improvements

## v1.0.0 (2026-03-10)

### Initial Release
- Multi-pane split chat with drag-and-drop
- Tabbed layout with session persistence
- Full Twitch/BTTV/FFZ/7TV emote rendering
- Full Twitch badge images (global + channel-specific)
- Inline user list sidebar with profile cards
- Floating profile cards with mod actions
- EventSub alerts (follows, subs, cheers, raids)
- Stream info bar, popout video player, chat logging
- Auto-update checker
- Dark/gray modern theme with frameless window

---

## Project Structure

```
Chatty/
├── package.json
├── src/
│   ├── api/
│   │   ├── twitch-api.js         # Twitch Helix API wrapper
│   │   ├── twitch-chat.js        # Twitch IRC over WebSocket
│   │   └── twitch-eventsub.js    # Twitch EventSub WebSocket
│   ├── auth/
│   │   └── auth-manager.js       # OAuth 2.0 implicit grant flow
│   ├── main/
│   │   ├── main.js               # Electron main process
│   │   ├── auto-updater.js       # GitHub release version checker
│   │   ├── overlay-server.js     # HTTP + WebSocket server for OBS overlays
│   │   ├── overlay-chat-renderer.js # Server-side chat rendering for overlay
│   │   ├── preload.js            # Context bridge for main window
│   │   └── preload-profile.js    # Context bridge for profile cards
│   ├── overlay/
│   │   ├── alerts.html           # OBS alert overlay page
│   │   └── chat.html             # OBS chat overlay page
│   └── renderer/
│       ├── index.html            # Main app HTML
│       ├── app.js                # App initialization
│       ├── components/
│       │   ├── chat-view.js      # Chat message rendering
│       │   ├── emote-badge-manager.js  # Emote + badge manager
│       │   ├── modals.js         # Settings, account, search modals
│       │   ├── split-manager.js  # Split panel system
│       │   ├── streamer-tools.js # Streamer Tools overlay config UI
│       │   └── tab-manager.js    # Tab bar management
│       └── styles/
│           └── main.css          # All app styles
```

## GitHub

- **Repo**: [KevinEightSeven/Chatty](https://github.com/KevinEightSeven/Chatty)
- **Build**: `npm run dist:linux` → `release/Chatty.AppImage`
