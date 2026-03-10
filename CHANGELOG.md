# Chatty — Development Changelog

## Current State (2026-03-10)

The app is **feature-complete and pushed to GitHub** at `KevinEightSeven/Chatty`.

---

## What Needs To Happen Next

1. **Build installers** — electron-builder is installed and configured in package.json:
   ```bash
   npm run dist:linux    # Builds Chatty.AppImage in release/
   npm run dist:win      # Builds Chatty-Setup.exe in release/ (cross-compile from Linux)
   npm run dist:mac      # Builds Chatty.dmg in release/ (may need macOS for signing)
   ```
   Note: Cross-compiling Windows from Linux works. macOS .dmg may require actual macOS or will be unsigned.

2. **Upload releases to GitHub** — Only 3 files in the release:
   ```bash
   /home/kevin/.local/bin/gh release create v1.0.0 \
     release/Chatty-Setup.exe \
     release/Chatty.dmg \
     release/Chatty.AppImage \
     --title "Chatty v1.0.0" \
     --notes "Initial release of Chatty — a modern Twitch chat client for desktop."
   ```

---

## Project Structure

```
Chatty/
├── package.json                  # Electron app config + electron-builder build config
├── README.md                     # Fancy readme for GitHub
├── LICENSE                       # MIT License
├── CHANGELOG.md                  # This file
├── .gitignore                    # Ignores node_modules, dist, release, .claude
├── src/
│   ├── api/
│   │   ├── twitch-api.js         # Twitch Helix API wrapper (streams, users, channels, moderation, games, badges, EventSub)
│   │   ├── twitch-chat.js        # Twitch IRC over WebSocket (join, part, send, receive messages)
│   │   └── twitch-eventsub.js    # Twitch EventSub WebSocket (follows, subs, cheers, raids)
│   ├── auth/
│   │   └── auth-manager.js       # OAuth 2.0 implicit grant flow, token management
│   ├── main/
│   │   ├── main.js               # Electron main process — window management, IPC handlers, app lifecycle
│   │   ├── auto-updater.js       # GitHub release version checker (semver comparison)
│   │   ├── preload.js            # Context bridge for main app window (window.chatty API)
│   │   └── preload-profile.js    # Context bridge for profile card windows (window.profileCard API)
│   └── renderer/
│       ├── index.html            # Main app HTML with CSP headers
│       ├── app.js                # App initialization, auth flow, wiring up managers
│       ├── profile-card.html     # Standalone HTML for profile card BrowserWindows
│       ├── profile-card.js       # Profile card renderer — receives data via IPC, renders UI
│       ├── components/
│       │   ├── chat-view.js      # Chat message rendering, emotes, badges, profile cards, message tracking
│       │   ├── emote-badge-manager.js  # Singleton managing Twitch/BTTV/FFZ/7TV emotes + badge images
│       │   ├── modals.js         # Account, settings, and search modals
│       │   ├── split-manager.js  # Split panel system — drag/drop, user list sidebar, live info, alerts
│       │   └── tab-manager.js    # Tab bar management
│       └── styles/
│           └── main.css          # All app styles — dark/gray theme, split panels, chat, profile cards
```

---

## Architecture

- **Electron** with context isolation — main process handles all API calls, renderer communicates via IPC
- **Twitch OAuth 2.0 Implicit Grant** — Client ID: `wk9u3h3netoqji2tzmcm0i2zbz5e77`
- **IRC over WebSocket** for receiving chat, **Helix API POST /chat/messages** for sending
- **Profile cards** are separate frameless BrowserWindows (freely floatable, not bound to main window)
- **Popout video player** is a separate BrowserWindow loading Twitch's embedded player
- **electron-store** persists settings, auth tokens, window bounds, and tab/split sessions
- **Chat logs** stored at `{userData}/logs/{channel}.txt`

## Key Features Implemented

- Multi-pane split chat with drag-and-drop (horizontal + vertical snapping)
- Tabbed layout with session persistence
- Full Twitch/BTTV/FFZ/7TV emote rendering
- Full Twitch badge images (global + channel-specific)
- Clickable links in chat (open in default browser)
- @mention highlighting
- Inline user list sidebar with badge icons and profile card on click
- Floating profile cards: avatar, bio, account age, follow/sub (mod only), last game with box art, mod buttons, scrollable message log with emotes and live updates
- Moderation via Helix API (timeout, ban, delete message)
- EventSub alerts (follows, subs, cheers, raids)
- Settings: font size slider (live preview), timestamps toggle, max messages
- Stream info bar with viewer count, game, title
- Popout video player
- Chat logging to local files
- Auto-update checker — checks GitHub releases for newer versions on startup
- Dark/gray modern theme
- Frameless window with custom titlebar

## Recent Bug Fixes

- **Emotes rendering as raw HTML** — `_applyLinks()` was corrupting img tag attributes by matching URLs inside src/srcset. Fixed by splitting on HTML tags before applying link replacement.
- **Startup crash on Arch Linux** — Vulkan/Wayland errors. Fixed with `--ozone-platform-hint=auto` flag.
- **Box art not loading** — Was using wrong URL format. Fixed by fetching actual `box_art_url` from `/games` API endpoint.
- **Profile card emotes** — Twitch native emotes (LUL etc) now render in profile card messages by storing the emotes IRC tag alongside message text.
- **Font size setting** — Chat messages now inherit font size from parent container so the settings slider works. Changed to range slider with live preview.

## Build Configuration

electron-builder is configured in package.json `"build"` section:
- **Windows**: NSIS installer → `Chatty-Setup.exe`
- **macOS**: DMG → `Chatty.dmg`
- **Linux**: AppImage → `Chatty.AppImage`
- Output directory: `release/`
- Only `src/**/*` and `package.json` are bundled (no dev files)

## GitHub Details

- **Repo**: `KevinEightSeven/Chatty` (public)
- **GitHub username**: sempd (git config: KevinEightSeven / 87kevo@gmail.com)
- **gh CLI installed at**: `/home/kevin/.local/bin/gh`
- **Release**: v1.0.0 with only 3 artifacts: `.exe`, `.dmg`, `.AppImage`
