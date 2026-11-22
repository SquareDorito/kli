import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Terminal,
  Folder,
  GitBranch,
  BarChart3,
  MessageSquare,
  Sparkles,
  Sun,
  Moon,
  Plus,
  RefreshCw,
  Sliders,
} from 'lucide-react';

export default function CommandPalette({
  open,
  onClose,
  projects,
  sessions,
  theme,
  onSelectProject,
  onSelectSession,
  onOpenNewSession,
  onToggleTheme,
  onToggleGitDiff,
  onToggleUsageHistory,
  onOpenMessaging,
  onOpenSettings,
  onSendSlashCommand,
  onSyncUsage,
  onManualCompact,
}) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onWinKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onWinKeyDown, true);
    return () => window.removeEventListener('keydown', onWinKeyDown, true);
  }, [open, onClose]);

  const items = useMemo(() => {
    const list = [
      {
        id: 'act-new-session',
        group: 'Actions',
        title: 'New agy Worker Session',
        hint: 'Launch tmux + agy',
        icon: Plus,
        run: () => onOpenNewSession(),
      },
      {
        id: 'act-message-worker',
        group: 'Actions',
        title: 'Message Worker (Cross-Project)',
        hint: 'Send prompt to another worker',
        icon: MessageSquare,
        run: () => onOpenMessaging(),
      },
      {
        id: 'act-git-diff',
        group: 'Actions',
        title: 'Toggle Git Diff Drawer',
        hint: 'Inspect modified files',
        icon: GitBranch,
        run: () => onToggleGitDiff(),
      },
      {
        id: 'act-usage-history',
        group: 'Actions',
        title: 'Toggle Usage & Cost Breakdown',
        hint: '24h sparkline & compactions',
        icon: BarChart3,
        run: () => onToggleUsageHistory(),
      },
      {
        id: 'act-compact',
        group: 'Slash Commands',
        title: 'Send /compact to active worker',
        hint: 'Compress context',
        icon: Sparkles,
        run: () => onManualCompact(),
      },
      {
        id: 'act-sync-usage',
        group: 'Slash Commands',
        title: 'Sync /usage from active worker',
        hint: 'Calibrate 5h & daily rings',
        icon: RefreshCw,
        run: () => onSyncUsage(),
      },
      {
        id: 'act-plan',
        group: 'Slash Commands',
        title: 'Send /plan to active worker',
        hint: 'Enter planning mode',
        icon: Terminal,
        run: () => onSendSlashCommand('/plan'),
      },
      {
        id: 'act-clear',
        group: 'Slash Commands',
        title: 'Send /clear to active worker',
        hint: 'Clear conversation',
        icon: Terminal,
        run: () => onSendSlashCommand('/clear'),
      },
      {
        id: 'act-theme',
        group: 'Preferences',
        title: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`,
        hint: 'Toggle appearance',
        icon: theme === 'dark' ? Sun : Moon,
        run: () => onToggleTheme(),
      },
      {
        id: 'act-settings',
        group: 'Preferences',
        title: 'Open Settings & Auth',
        hint: 'Autocompact, PIN/token, alerts',
        icon: Sliders,
        run: () => onOpenSettings(),
      },
    ];

    for (const s of sessions) {
      const proj = projects.find((p) => p.id === s.projectId);
      list.push({
        id: `sess-${s.tmuxName}`,
        group: 'Workers',
        title: s.label,
        hint: `${proj ? proj.name + ' · ' : ''}${s.mode || 'auto'}`,
        icon: Terminal,
        run: () => onSelectSession(s.tmuxName),
      });
    }

    for (const p of projects) {
      list.push({
        id: `proj-${p.id}`,
        group: 'Projects',
        title: p.name,
        hint: p.branch ? `${p.branch} · ${p.displayPath}` : p.displayPath,
        icon: Folder,
        run: () => onSelectProject(p.id),
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.hint.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
    );
  }, [
    query,
    sessions,
    projects,
    theme,
    onOpenNewSession,
    onOpenMessaging,
    onToggleGitDiff,
    onToggleUsageHistory,
    onManualCompact,
    onSyncUsage,
    onSendSlashCommand,
    onToggleTheme,
    onOpenSettings,
    onSelectSession,
    onSelectProject,
  ]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((prev) => (items.length ? (prev + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((prev) => (items.length ? (prev - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter' && items[activeIdx]) {
      e.preventDefault();
      items[activeIdx].run();
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="palette-card" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="palette-input-row">
          <Search size={15} color="var(--accent-primary)" />
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            placeholder="Type a command, worker, project, or /slash…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="palette-kbd">⌘⇧P</span>
        </div>

        <div className="palette-list">
          {items.length === 0 ? (
            <div className="palette-empty">No matching commands or workers</div>
          ) : (
            items.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`palette-item ${idx === activeIdx ? 'active' : ''}`}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                >
                  <Icon size={14} className="palette-item-icon" />
                  <span className="palette-item-title">{item.title}</span>
                  <span className="palette-item-hint">{item.hint}</span>
                  <span className="palette-item-group">{item.group}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
