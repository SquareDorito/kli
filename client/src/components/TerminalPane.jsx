import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import {
  Terminal,
  Sparkles,
  Compass,
  RotateCcw,
  SquareTerminal,
  X,
  Search,
  ChevronUp,
  ChevronDown,
  Download,
  Copy,
  BookmarkPlus,
  RotateCw,
} from 'lucide-react';
import ClaudeStatusBar from './ClaudeStatusBar.jsx';

const DARK_TMUX_THEME = {
  background: '#262626',
  foreground: '#eeeeee',
  cursor: '#00ffff',
  cursorAccent: '#000000',
  selectionBackground: 'rgba(0, 255, 255, 0.22)',
  black: '#1c1c1c',
  red: '#ff5f5f',
  green: '#5fd787',
  yellow: '#ffd75f',
  blue: '#0087af',
  magenta: '#afafff',
  cyan: '#00ffff',
  white: '#bcbcbc',
  brightBlack: '#808080',
  brightRed: '#ff8787',
  brightGreen: '#87ffaf',
  brightYellow: '#ffff87',
  brightBlue: '#5fd7ff',
  brightMagenta: '#d7afff',
  brightCyan: '#87ffff',
  brightWhite: '#eeeeee',
};

const LIGHT_TMUX_THEME = {
  background: '#ffffff',
  foreground: '#172128',
  cursor: '#005f87',
  cursorAccent: '#ffffff',
  selectionBackground: 'rgba(0, 95, 135, 0.18)',
  black: '#172128',
  red: '#c93644',
  green: '#1b8a4b',
  yellow: '#b87a00',
  blue: '#005f87',
  magenta: '#6c4ec4',
  cyan: '#007ea7',
  white: '#d3dfe8',
  brightBlack: '#708291',
  brightRed: '#df4b59',
  brightGreen: '#28a35d',
  brightYellow: '#d49000',
  brightBlue: '#0077b6',
  brightMagenta: '#8465de',
  brightCyan: '#0096c7',
  brightWhite: '#f6f9fb',
};

export default function TerminalPane({
  theme = 'dark',
  projects = [],
  sessions,
  activeSession,
  activeProject,
  usage,
  ptyBackend,
  attentionSessions = {},
  onPtyBackendChange,
  onSelectSession,
  onKillSession,
  onRestartSession,
  onRenameSession,
  onReorderTabs,
  onQuickLaunch,
  onSendSlashCommand,
  onPreviewFile,
  onToast,
}) {
  const hostRef = useRef(null);
  const xtermRef = useRef(null);
  const wsRef = useRef(null);
  const fitRef = useRef(null);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTab, setEditingTab] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [draggedTab, setDraggedTab] = useState(null);
  const [showSnippets, setShowSnippets] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('kli-term-font-size'));
      return saved >= 9 && saved <= 24 ? saved : 12;
    } catch {
      return 12;
    }
  });
  const [snippets, setSnippets] = useState(() => {
    try {
      const raw = localStorage.getItem('kli-snippets');
      return raw ? JSON.parse(raw) : ['/plan', '/model', 'Summarize git status and next steps'];
    } catch {
      return ['/plan', '/model', 'Summarize git status and next steps'];
    }
  });

  useEffect(() => {
    if (!activeSession || !hostRef.current) return;

    const term = new XTerm({
      fontFamily:
        "'Iosevka Nerd Font Mono', 'IosevkaNFM', 'Iosevka Nerd Font', 'MesloLGS NF', 'JetBrains Mono', 'SF Mono', Menlo, Monaco, monospace",
      fontSize,
      lineHeight: 1.24,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowProposedApi: true,
      theme: theme === 'light' ? LIGHT_TMUX_THEME : DARK_TMUX_THEME,
    });

    const fitAddon = new FitAddon();
    const linksAddon = new WebLinksAddon((event, uri) => {
      if (event?.metaKey || event?.ctrlKey) {
        window.open(uri, '_blank', 'noopener,noreferrer');
      }
    });
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(linksAddon);
    term.loadAddon(searchAddon);

    const fileLinkDisposable = term.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const line = term.buffer.active.getLine(bufferLineNumber - 1);
        if (!line) return callback(undefined);
        const text = line.translateToString(true);
        const regex = /(?:^|[\s(`'"[])((\.{0,2}\/|\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]{1,8}(?::(\d+))?)/g;
        const links = [];
        let m;
        while ((m = regex.exec(text)) !== null) {
          const fullMatch = m[1];
          const colonIdx = fullMatch.lastIndexOf(':');
          const filePath = colonIdx > -1 ? fullMatch.slice(0, colonIdx) : fullMatch;
          const lineNum = m[3] ? Number(m[3]) : null;
          const startX = m.index + m[0].indexOf(fullMatch) + 1;
          links.push({
            range: {
              start: { x: startX, y: bufferLineNumber },
              end: { x: startX + fullMatch.length, y: bufferLineNumber },
            },
            text: fullMatch,
            activate: (event) => {
              if (event?.metaKey || event?.ctrlKey) {
                onPreviewFile?.(filePath, activeSession.projectPath || activeProject?.path, lineNum);
              }
            },
          });
        }
        callback(links);
      },
    });

    term.open(hostRef.current);
    fitAddon.fit();
    term.focus();

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      // Cmd+C: copy active xterm selection to clipboard
      if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'c') {
        if (term.hasSelection()) {
          navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
          return false;
        }
        return true;
      }
      // Cmd+V: let browser fire native paste event into xterm's textarea
      // (avoids async navigator.clipboard.readText() permission prompts/focus freezes)
      if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'v') {
        term.focus();
        return false;
      }
      // Shift+Enter: insert newline in agy prompt instead of submitting
      if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const sock = wsRef.current;
        if (sock && sock.readyState === WebSocket.OPEN) {
          sock.send(JSON.stringify({ type: 'input', data: '\x1b\r' }));
        }
        return false;
      }
      return true;
    });

    xtermRef.current = term;
    fitRef.current = fitAddon;
    searchRef.current = searchAddon;

    let disposed = false;
    let reconnectTimer = null;

    const connectWs = () => {
      if (disposed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/terminal?session=${encodeURIComponent(
        activeSession.tmuxName
      )}&cols=${term.cols}&rows=${term.rows}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'output') {
            term.write(msg.data);
          } else if (msg.type === 'ready') {
            onPtyBackendChange(msg.backend || 'pty');
          } else if (msg.type === 'error') {
            term.writeln(`\r\n\x1b[31m[KLI Error] ${msg.message}\x1b[0m`);
          } else if (msg.type === 'exit') {
            term.writeln(`\r\n\x1b[33m[Session detached / exited (${msg.exitCode})]\x1b[0m`);
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        if (!disposed) {
          term.writeln('\r\n\x1b[31m[WebSocket connection error — reconnecting…]\x1b[0m');
        }
      };

      ws.onclose = () => {
        if (!disposed) {
          reconnectTimer = setTimeout(connectWs, 1200);
        }
      };
    };

    connectWs();

    const dataDisposable = term.onData((data) => {
      const sock = wsRef.current;
      if (sock && sock.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const hostEl = hostRef.current;

    // Handle OSC 52 clipboard sequences emitted by tmux (e.g. MouseDragEnd1Pane copy-pipe-and-cancel)
    const osc52Disposable = term.parser.registerOscHandler(52, (data) => {
      try {
        const semi = data.indexOf(';');
        if (semi === -1) return false;
        const b64 = data.slice(semi + 1).trim();
        if (!b64 || b64 === '?') return true;
        const binary = atob(b64);
        const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
        const decoded = new TextDecoder().decode(bytes);
        if (decoded) {
          navigator.clipboard?.writeText(decoded).catch(() => {});
        }
        return true;
      } catch {
        return false;
      }
    });

    // Also auto-copy on mouse release when using xterm.js selection (e.g. Option+drag)
    const handleMouseUpCopy = () => {
      if (term.hasSelection()) {
        const sel = term.getSelection();
        if (sel) {
          navigator.clipboard?.writeText(sel).catch(() => {});
        }
      }
    };
    hostEl.addEventListener('mouseup', handleMouseUpCopy);

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        const sock = wsRef.current;
        if (sock && sock.readyState === WebSocket.OPEN) {
          sock.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      } catch {
        // ignore resize race
      }
    });
    resizeObserver.observe(hostEl);

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      hostEl.removeEventListener('mouseup', handleMouseUpCopy);
      osc52Disposable.dispose();
      fileLinkDisposable.dispose();
      resizeObserver.disconnect();
      dataDisposable.dispose();
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      term.dispose();
      xtermRef.current = null;
      wsRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
  }, [activeSession?.tmuxName]);

  // Live-update xterm.js colors when user toggles light/dark mode
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme =
        theme === 'light' ? LIGHT_TMUX_THEME : DARK_TMUX_THEME;
    }
  }, [theme]);

  // Live-update xterm.js font size and refit PTY without reconnecting
  useEffect(() => {
    try {
      localStorage.setItem('kli-term-font-size', String(fontSize));
    } catch {
      // ignore
    }
    if (xtermRef.current && fitRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      fitRef.current.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'resize',
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows,
          })
        );
      }
    }
  }, [fontSize]);

  const adjustFontSize = (delta) => {
    setFontSize((prev) => Math.min(24, Math.max(9, prev + delta)));
  };

  // Cmd+F / Ctrl+F in-terminal search shortcut
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
        if (!activeSession) return;
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 10);
      } else if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        xtermRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSession, showSearch]);

  const getScrollbackText = () => {
    const term = xtermRef.current;
    if (!term) return '';
    const lines = [];
    const buf = term.buffer.active;
    for (let i = 0; i < buf.length; i += 1) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join('\n').trimEnd();
  };

  const handleCopyScrollback = async () => {
    const text = getScrollbackText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      onToast?.('Copied terminal scrollback to clipboard');
    } catch {
      onToast?.('Failed to copy scrollback');
    }
  };

  const handleDownloadScrollback = () => {
    const text = getScrollbackText();
    if (!text || !activeSession) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSession.label || activeSession.tmuxName}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddSnippet = () => {
    const val = window.prompt('Save prompt or /slash snippet:');
    if (!val || !val.trim()) return;
    const next = [...snippets, val.trim()];
    setSnippets(next);
    try {
      localStorage.setItem('kli-snippets', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleRemoveSnippet = (idx) => {
    const next = snippets.filter((_, i) => i !== idx);
    setSnippets(next);
    try {
      localStorage.setItem('kli-snippets', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  if (!activeSession) {
    return (
      <main className="main-stage">
        <div className="empty-stage">
          <div className="empty-badge">
            <Terminal size={13} />
            <span>tmux-backed agy CLI workspace</span>
          </div>
          <h1 className="empty-title">
            {activeProject ? `Ready in ${activeProject.name}` : 'Start an agy CLI session'}
          </h1>
          <p className="empty-desc">
            Every session runs inside a persistent <code>tmux</code> session styled with a Claude
            Code-inspired status bar, live context &amp; quota rings, and automatic{' '}
            <code>/compact</code> protection.
          </p>

          <div className="quick-launch-grid">
            <button
              type="button"
              className="quick-card"
              onClick={() => onQuickLaunch({ kind: 'agy', mode: 'auto' })}
            >
              <span className="quick-card-title">
                <Sparkles size={14} color="var(--accent-primary)" />
                agy · Auto Mode
              </span>
              <span className="quick-card-sub">agy --mode auto</span>
            </button>

            <button
              type="button"
              className="quick-card"
              onClick={() => onQuickLaunch({ kind: 'agy', mode: 'plan' })}
            >
              <span className="quick-card-title">
                <Compass size={14} color="var(--accent-lavender)" />
                agy · Plan Mode
              </span>
              <span className="quick-card-sub">agy --mode plan</span>
            </button>

            <button
              type="button"
              className="quick-card"
              onClick={() => onQuickLaunch({ kind: 'agy', mode: 'auto', continueLast: true })}
            >
              <span className="quick-card-title">
                <RotateCcw size={14} color="var(--accent-sage)" />
                Continue Last Chat
              </span>
              <span className="quick-card-sub">agy --continue</span>
            </button>

            <button
              type="button"
              className="quick-card"
              onClick={() => onQuickLaunch({ kind: 'shell', mode: 'auto' })}
            >
              <span className="quick-card-title">
                <SquareTerminal size={14} color="var(--accent-sky)" />
                Interactive Shell
              </span>
              <span className="quick-card-sub">tmux · zsh</span>
            </button>
          </div>
        </div>

        <ClaudeStatusBar
          session={null}
          project={activeProject}
          usage={usage}
          ptyBackend={ptyBackend}
        />
      </main>
    );
  }

  return (
    <main className="main-stage">
      <div className="terminal-tabbar">
        <div className="terminal-tabs">
          {sessions.map((sess) => {
            const isActive = sess.tmuxName === activeSession.tmuxName;
            const isEditing = editingTab === sess.tmuxName;
            const trackedStatus = usage?.sessions?.[sess.tmuxName]?.status;
            const workerStatus =
              trackedStatus === 'red' || attentionSessions[sess.tmuxName]
                ? 'red'
                : trackedStatus === 'blue'
                ? 'blue'
                : trackedStatus === 'green'
                ? 'green'
                : 'grey';
            return (
              <div
                key={sess.tmuxName}
                draggable={!isEditing}
                onDragStart={() => setDraggedTab(sess.tmuxName)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedTab && draggedTab !== sess.tmuxName) {
                    onReorderTabs?.(draggedTab, sess.tmuxName);
                  }
                  setDraggedTab(null);
                }}
                className={`terminal-tab ${isActive ? 'active' : ''}`}
                onClick={() => onSelectSession(sess.tmuxName)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingTab(sess.tmuxName);
                  setEditingLabel(sess.label);
                }}
                title="Double-click to rename · Drag to reorder"
              >
                <span className={`session-live-dot status-${workerStatus}`} />
                {isEditing ? (
                  <input
                    type="text"
                    className="tab-rename-input"
                    autoFocus
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => {
                      if (editingLabel.trim() && editingLabel.trim() !== sess.label) {
                        onRenameSession?.(sess.tmuxName, editingLabel.trim());
                      }
                      setEditingTab(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editingLabel.trim() && editingLabel.trim() !== sess.label) {
                          onRenameSession?.(sess.tmuxName, editingLabel.trim());
                        }
                        setEditingTab(null);
                      } else if (e.key === 'Escape') {
                        setEditingTab(null);
                      }
                    }}
                  />
                ) : (
                  <span>
                    {(() => {
                      const proj = projects.find(
                        (p) => p.id === sess.projectId || (!sess.projectId && p.path === sess.projectPath)
                      );
                      if (!proj) return sess.label;
                      const displayProj = proj.alias || proj.name;
                      if (sess.label.startsWith(`${proj.name} `)) {
                        return `${displayProj} ${sess.label.slice(proj.name.length + 1)}`;
                      }
                      if (proj.alias && sess.label.startsWith(`${proj.alias} `)) {
                        return sess.label;
                      }
                      return `${displayProj} ${sess.label}`;
                    })()}
                  </span>
                )}
                <button
                  type="button"
                  className="mini-icon-btn danger"
                  style={{ width: 16, height: 16 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onKillSession(sess.tmuxName);
                  }}
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="terminal-quick-actions">
          <button
            type="button"
            className="slash-pill"
            onClick={() => {
              const sock = wsRef.current;
              if (sock && sock.readyState === WebSocket.OPEN) {
                sock.send(JSON.stringify({ type: 'input', data: '\x1b' }));
              }
              xtermRef.current?.focus();
            }}
            title="Send Esc (\x1b) to terminal (useful if Vimium intercepts Esc) · Shortcut: Ctrl+["
          >
            Esc
          </button>
          <button
            type="button"
            className="slash-pill"
            onClick={() => onSendSlashCommand('/usage')}
            title="Run /usage in agy to sync quota & context trackers"
          >
            /usage
          </button>
          <button
            type="button"
            className="slash-pill"
            onClick={() => onSendSlashCommand('/compact')}
            title="Send /compact to agy"
          >
            /compact
          </button>
          <button
            type="button"
            className="slash-pill"
            onClick={() => onSendSlashCommand('/help')}
            title="Send /help to agy"
          >
            /help
          </button>
          <button
            type="button"
            className="slash-pill"
            onClick={() => onSendSlashCommand('/clear')}
            title="Send /clear to agy"
          >
            /clear
          </button>
          <button
            type="button"
            className="mini-icon-btn"
            onClick={() => onRestartSession?.(activeSession.tmuxName)}
            title="Restart active worker"
          >
            <RotateCw size={12} />
          </button>
          <button
            type="button"
            className={`mini-icon-btn ${showSnippets ? 'active' : ''}`}
            onClick={() => setShowSnippets((v) => !v)}
            title="Toggle Saved Snippets Bar"
          >
            <BookmarkPlus size={12} />
          </button>
          <button
            type="button"
            className={`mini-icon-btn ${showSearch ? 'active' : ''}`}
            onClick={() => {
              setShowSearch((v) => !v);
              setTimeout(() => searchInputRef.current?.focus(), 10);
            }}
            title="Search scrollback (Cmd+F)"
          >
            <Search size={12} />
          </button>
          <button
            type="button"
            className="mini-icon-btn"
            onClick={handleCopyScrollback}
            title="Copy scrollback to clipboard"
          >
            <Copy size={12} />
          </button>
          <button
            type="button"
            className="mini-icon-btn"
            onClick={handleDownloadScrollback}
            title="Download scrollback log"
          >
            <Download size={12} />
          </button>

          <div className="term-font-ctrl" title="Terminal font size">
            <button
              type="button"
              className="term-font-btn"
              onClick={() => adjustFontSize(-1)}
              title="Decrease terminal font size"
            >
              A-
            </button>
            <span className="term-font-val" onClick={() => setFontSize(12)} title="Reset to 12px">
              {fontSize}px
            </span>
            <button
              type="button"
              className="term-font-btn"
              onClick={() => adjustFontSize(1)}
              title="Increase terminal font size"
            >
              A+
            </button>
          </div>
        </div>
      </div>

      {showSnippets && (
        <div className="snippet-bar">
          {snippets.map((snip, idx) => (
            <span key={`${snip}-${idx}`} className="snippet-chip">
              <button type="button" onClick={() => onSendSlashCommand(snip)}>
                {snip}
              </button>
              <button
                type="button"
                className="snippet-del"
                onClick={() => handleRemoveSnippet(idx)}
                title="Remove snippet"
              >
                ×
              </button>
            </span>
          ))}
          <button type="button" className="slash-pill" onClick={handleAddSnippet}>
            + Snippet
          </button>
        </div>
      )}

      {showSearch && (
        <div className="term-search-bar">
          <Search size={12} color="var(--accent-primary)" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Find in terminal…"
            value={searchQuery}
            onChange={(e) => {
              const q = e.target.value;
              setSearchQuery(q);
              if (q) searchRef.current?.findNext(q);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) searchRef.current?.findPrevious(searchQuery);
                else searchRef.current?.findNext(searchQuery);
              } else if (e.key === 'Escape') {
                setShowSearch(false);
                xtermRef.current?.focus();
              }
            }}
          />
          <button
            type="button"
            className="mini-icon-btn"
            onClick={() => searchRef.current?.findPrevious(searchQuery)}
            title="Previous match"
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            className="mini-icon-btn"
            onClick={() => searchRef.current?.findNext(searchQuery)}
            title="Next match"
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            className="mini-icon-btn"
            onClick={() => {
              setShowSearch(false);
              xtermRef.current?.focus();
            }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="terminal-canvas-wrap" onClick={() => xtermRef.current?.focus()}>
        <div className="terminal-xterm-host" ref={hostRef} />
      </div>

      <ClaudeStatusBar
        session={activeSession}
        project={activeProject}
        usage={usage}
        ptyBackend={ptyBackend}
      />
    </main>
  );
}
