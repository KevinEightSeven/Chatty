# Chatty — Changelog

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
