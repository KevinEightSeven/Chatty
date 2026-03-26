# Chatty

**A modern Twitch chat client for desktop — inspired by Chatterino.**

Chatty is a lightweight, multi-pane Twitch chat client built with Electron. Connect to multiple channels simultaneously, view emotes from all major providers, moderate chat, and more — all from a single, sleek interface.

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)
![Electron](https://img.shields.io/badge/electron-40-blue.svg)

---

## Screenshots

### Multi-Pane Split Chat
View multiple Twitch channels side-by-side with full emote and badge rendering, live stream info, and an inline user list — all in one window.

![Split Chat](screenshots/split-chat.png)

### Channel Search
Quickly find and join any Twitch channel by name, browse top live streams, or explore categories.

![Add Chat](screenshots/add-chat.png)

### All-In-One Streaming Setup
Replace a dozen browser tabs and apps with one lightweight desktop client — chat, stream info, profile cards, and video all in a single window alongside your other tools.

![All-In-One](screenshots/all-in-one.png)

---

## Features

### Multi-Pane Chat
- Open multiple Twitch channels side-by-side in split panels
- Drag and drop panels to rearrange — snap horizontally or vertically
- Tabbed layout for organizing different channel groups
- Resize panels freely with drag gutters

### Full Emote Support
- **Twitch** native emotes rendered from the official CDN
- **BetterTTV** (BTTV) global and channel emotes
- **FrankerFaceZ** (FFZ) global and channel emotes
- **7TV** global and channel emotes
- Emotes scale cleanly with your chosen font size

### Twitch Badge Rendering
- Full badge images for subscribers, moderators, VIPs, broadcasters, Twitch Prime, and more
- Channel-specific badges (custom sub badges, bits badges)
- Badges shown in both chat messages and the viewer list

### Profile Cards
- Click any username to open a floating, draggable profile card
- Shows avatar, display name, bio, account creation date
- Follow/subscribe status (when you have moderator rights)
- Last streamed game with clickable category box art
- Scrollable message history with live updates and emote rendering
- Moderation buttons (timeout, ban) for moderators

### Viewer List
- Inline sidebar showing all chatters in a channel
- Categorized by role: Broadcaster, Moderators, VIPs, Subscribers, Viewers
- Badge icons next to each username
- Click any user to view their profile card

### Stream Info
- Live viewer count, game/category, and stream title
- Popout video player for any channel
- Clickable channel names and category links

### Moderation Tools
- Timeout and ban users directly from profile cards
- Delete individual messages (moderator rights required)
- Uses the Twitch Helix API for reliable moderation actions

### Chat Features
- Clickable links in chat messages
- @mention highlighting
- Chat logging to local files
- Hoverable messages with visible background
- New message indicator when scrolled up
- Auto-scroll with smart pause on scroll-up

### Streamer Tools — OBS Overlay System
- Scene-based overlay management — each scene has its own alerts, chat overlay, and position settings
- Alert system with customizable images, sounds, animations, and text templates
- Alert variants (resub, gifted sub, bit thresholds, raid viewer thresholds)
- Chat overlay with configurable badges, timestamps, fade, font size, animations, and custom CSS
- Position preview with drag-and-drop placement on a resolution-accurate canvas
- Local HTTP + WebSocket server for OBS Browser Sources
- Scene URLs: `/alerts`, `/chat`, `/alerts2`, `/chat2`, etc.
- OBS visibility detection — only the active OBS scene plays alert sounds (no duplicates)
- Auto-start overlay server option

### Activity Feed & Mod Actions
- **Activity Feed**: Embedded Twitch activity feed panel showing follows, subs, cheers, raids, and channel point redemptions in real-time — powered by Twitch's dashboard
- **Mod Actions**: Embedded Twitch mod actions panel showing all moderation events — bans, timeouts, message deletions, and chat mode changes
- Both panels use a persistent Twitch session — log in once, stays logged in across app restarts
- EventSub still runs in the background for OBS overlay alert support

### Twitch Commands
- Full slash commands: `/ban`, `/timeout`, `/mod`, `/vip`, `/raid`, `/announce`, `/settitle`, `/setgame`, and more
- Command autocomplete with `/` prefix
- Polls display in chat

### System Tray
- Close-to-tray support (enabled by default)
- System tray icon with quick access

### Auto-Updater
- Checks GitHub releases on startup
- Downloads and installs updates automatically

### Customization
- Dark/gray modern theme
- Adjustable font size via settings (live preview slider)
- Toggle timestamps on/off
- Configurable max message history
- Resizable panels and sidebars

---

## Installation

Download the latest release for your platform from the [Releases](https://github.com/KevinEightSeven/Chatty/releases) page:

| Platform | Package | Download |
|----------|---------|----------|
| Windows  | Installer | `Chatty-Setup.exe` |
| Linux    | AppImage (universal) | `Chatty.AppImage` |
| Linux    | Arch Linux (AUR) | [`chatty-twitch`](https://aur.archlinux.org/packages/chatty-twitch) |
| Linux    | Debian / Ubuntu | `Chatty.deb` |
| Linux    | Fedora / RHEL | `Chatty.rpm` |

### Windows
Run `Chatty-Setup.exe` and follow the installer prompts.

### Linux — Arch Linux (AUR)
```bash
yay -S chatty-twitch
# or
paru -S chatty-twitch
```

### Linux — AppImage (any distro)
```bash
chmod +x Chatty.AppImage
./Chatty.AppImage
```

### Linux — Debian / Ubuntu
```bash
sudo dpkg -i Chatty.deb
```
Then launch `chatty` from your application menu or terminal.

### Linux — Fedora / RHEL
```bash
sudo rpm -i Chatty.rpm
```
Then launch `chatty` from your application menu or terminal.

---

## Build from Source

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- npm

### Setup
```bash
git clone https://github.com/KevinEightSeven/Chatty.git
cd Chatty
npm install
```

### Run in Development
```bash
npm start

# With DevTools
npm run dev
```

### Build Installers
```bash
# All platforms
npm run dist

# Platform-specific
npm run dist:win
npm run dist:mac
npm run dist:linux
```

---

## Tech Stack

- **Electron** — Cross-platform desktop framework
- **Twitch Helix API** — User data, channel info, moderation, chat messaging
- **Twitch IRC (WebSocket)** — Real-time chat messages
- **Twitch EventSub** — Live alerts and notifications
- **BTTV / FFZ / 7TV APIs** — Third-party emote providers
- **electron-store** — Persistent settings and session state

---

## License

MIT License — see [LICENSE](LICENSE) for details.

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

## v1.6.0 (2026-03-25)

### New Features
- **Trigger Board**: New Streamer Tools tab for creating custom sound and video triggers linked to Twitch channel point redemptions
  - Triggers auto-create channel point rewards on your Twitch channel when saved
  - Dedicated `/triggers` OBS Browser Source URL — can be muted independently from alerts
  - Enable/disable toggle per trigger (also enables/disables the Twitch reward)
  - Support for MP3, OGG, WAV, FLAC, MP4, WEBM, MOV media files
  - Configurable volume, channel point cost, and reward title
  - Deleting a trigger removes the channel point reward from Twitch
- **Trigger Position Preview**: Green TRIGGERS box in the Position Preview canvas, draggable and resizable alongside Alerts and Chat
- **Active Layer selector**: Layer buttons (Alerts / Chat / Triggers) in Position Preview to select which box is on top for dragging when boxes overlap
- **About screen**: New (i) icon in the titlebar with app info, creator credits (Kevin Walters / Bravo Unit LLC), donation link, and open source license listing for all dependencies and third-party services

### Improvements
- **Chat reliability**: PING keepalive reduced from 60s to 30s, activity monitor forces reconnect after 90s of no data, stricter PONG matching, auth failure detection
- **Alert isolation**: Channel point redemption events no longer trigger false follow/sub alerts on the OBS overlay — only known alert types are forwarded to `/alerts`
- **File upload**: Browse dialog now accepts audio (MP3, OGG, WAV, FLAC, AAC) and video (MP4, WEBM, MOV, AVI, MKV) files with an "All Files" fallback
- **OAuth scopes**: Added `channel:manage:redemptions` and `channel:read:redemptions` for channel point reward management

## v1.5.0 (2026-03-24)

### New Features
- **Activity Feed panel**: Replaced the custom EventSub alerts panel with Twitch's native activity feed from the creator dashboard. Shows follows, subs, gifted subs, cheers, raids, and channel point redemptions — all handled by Twitch. Accessible via the bell icon in the titlebar
- **Mod Actions panel**: New embedded Twitch mod actions panel showing all moderation events (bans, timeouts, message deletions, chat mode changes). Accessible via the hammer icon in the titlebar
- **Persistent Twitch dashboard session**: Both Activity Feed and Mod Actions panels share a persistent Twitch login session (`persist:twitch-activity` partition). Log in once, stays authenticated across app restarts
- **User join/leave messages**: System messages in chat when users join or leave any channel you're viewing. Updates every 60 seconds via the Twitch chatters API
- **Join/leave toggle**: New "Show Join/Leave Messages" setting in Settings > Chat to enable or disable join/leave notifications

### Improvements
- **Activity Feed button**: Alerts bell icon in titlebar now opens the Twitch Activity Feed instead of the custom EventSub alerts panel
- **Mod Actions button**: New hammer icon added to the titlebar next to the Activity Feed bell
- **Session save/restore**: Both Activity Feed and Mod Actions panels persist with the layout — positions are saved and restored on app restart
- **EventSub background**: EventSub still runs in the background when the Activity Feed is open, ensuring OBS overlay alerts continue to work
- **Webview support**: Enabled Electron webview tag for embedding Twitch dashboard pages

### Bug Fixes
- **User list not updating**: Users who left a channel were never removed from the user list. The chatters API response is now compared against the current list — departed users are removed every polling cycle (60s)

## v1.4.0 (2026-03-15)

### New Features
- **Whisper system**: Dedicated whisper panel in the titlebar intercepts all incoming whispers. Conversation tabs, unread badge, and reply support via Twitch Helix API
- **Room mode indicators**: Live heart/star/smiley icons in each channel header show followers-only, subscribers-only, and emote-only mode status. Gray when off, green when active, updates in real-time on ROOMSTATE changes
- **Nested column splits**: Drag-and-drop now supports vertical stacking within a row — drop a panel above/below another in a multi-panel row to create a column layout instead of a full-width row
- **Website**: Product website at `website/` with feature showcase, screenshots, and contact form (help@bravounit.com)

### Improvements
- **Streamer Tools redesign**: Alerts section now uses a tree sidebar + detail panel layout (like Streamlabs). Alert types on the left, full config on the right. Each variant has its own enabled toggle and can fire independently of the base alert
- **Scenes removed**: Simplified overlay config from multi-scene array to flat `overlay.alerts` / `overlay.chat` keys. One-time migration from old scenes config happens automatically
- **Gift sub alerts**: Single combined alert showing "gifter gifted recipient a sub (Tier 1)!" instead of two separate alerts. Correlates `channel.subscribe` and `channel.subscription.gift` events
- **Self-follow filter**: Suppresses bogus follow alerts where the broadcaster appears as a follower of their own channel
- **Titlebar**: Darker background (#131316) to visually distinguish it as a draggable bar
- **Logged-in buttons**: Whispers, Alerts, and Streamer Tools buttons in the titlebar are hidden until the user logs in
- **Alert variant toggles**: Each variant has its own ON/OFF toggle. Enabled variants fire on the OBS overlay even if the base alert is disabled
- **Tree status badges**: ON/OFF badges in the alert tree update instantly when toggling the enabled switch

### Bug Fixes
- **Gift sub duplicate**: Gift subs no longer show two alerts (one for recipient, one for gifter). The `channel.subscribe` event with `is_gift=true` is suppressed; the `channel.subscription.gift` event includes the recipient name
- **Alert tree toggle sync**: Toggling an alert's enabled state now immediately updates the ON/OFF badge in the tree sidebar

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
