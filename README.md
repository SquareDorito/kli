# KLI — Antigravity Web Terminal

A web-based workspace inspired by the **Antigravity** app and **Claude Code**, pairing a left-hand project & session sidebar with an `xterm.js` terminal emulator backed by persistent `tmux` sessions running `agy` CLI.

## Features

- **Project View Sidebar**: Manage local project folders with git branch & dirty-file indicators, built-in folder browser, and nested live `tmux` sessions per project.
- **Persistent `tmux` + `agy` CLI Terminal**: Launch `agy` sessions with configurable `--mode` (`auto`, `plan`, `accept-edits`), `--effort`, `--model`, `--sandbox`, `--continue`, and initial prompts (`-i`). Sessions survive page reloads and server restarts.
- **Top Bar Circular Usage Trackers**:
  - **Context Window** ring (with orange autocompact threshold marker)
  - **5-Hour Quota** rolling ring + reset countdown
  - **Daily Quota** 24-hour ring
  - **Autocompact** toggle + threshold slider (auto-sends `/compact` to the active `agy` tmux session when context crosses threshold) + one-click `/compact` button
- **Claude Code-Inspired Shell**:
  - Custom `xterm.js` warm dark terracotta theme
  - Dedicated `server/tmux/kli-tmux.conf` status bar
  - Bottom HUD status bar showing execution mode, model, sandbox state, git branch, cwd, context meter, auto-compact state, and token/cost counters

## Running Locally

```bash
npm install
npm run dev
```

- Frontend (Vite): `http://localhost:5173`
- Backend API + WebSockets: `http://localhost:3001`

For production mode (single server serving the built frontend):

```bash
npm run build
npm start
```
