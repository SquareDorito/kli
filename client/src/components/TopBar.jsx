import React from 'react';
import {
  Settings,
  RefreshCw,
  Sun,
  Moon,
  GitBranch,
  BarChart3,
} from 'lucide-react';
import CircularTracker from './CircularTracker.jsx';

function formatTokens(n) {
  if (!n || n < 1000) return `${n || 0}`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1000).toFixed(1)}k`;
}

function formatReset(ms) {
  if (!ms || ms <= 0) return 'now';
  const totalMin = Math.ceil(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function TopBar({
  usage,
  activeSession,
  theme,
  showGitDiff,
  showUsageHistory,
  onToggleTheme,
  onToggleAutocompact,
  onManualCompact,
  onSyncUsage,
  onToggleGitDiff,
  onToggleUsageHistory,
  onOpenMessaging,
  onOpenPalette,
  onOpenSettings,
  onRefresh,
  compacting,
}) {
  const cfg = usage?.config || {
    autocompactEnabled: true,
    autocompactThresholdPct: 80,
  };

  const activeSessUsage =
    (activeSession && usage?.sessions?.[activeSession.tmuxName]) || usage?.activeSession || null;

  const ctxPct = activeSessUsage?.contextPct || 0;
  const ctxTokens = activeSessUsage?.contextTokens || 0;
  const ctxWindow = activeSessUsage?.contextWindowTokens || 200000;

  const fiveHourPct = usage?.fiveHour?.pct || 0;
  const fiveHourReset = usage?.fiveHour?.resetText || formatReset(usage?.fiveHour?.resetInMs);

  const weeklyPct = usage?.weekly?.pct || 0;
  const weeklySub =
    usage?.weekly?.resetText
      ? `resets ${usage.weekly.resetText}`
      : `${formatTokens(usage?.weekly?.tokens || 0)} tok`;

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="brand-mark">A</div>
        <div className="brand-title">
          <span className="brand-name">Antigravity Web</span>
          <span className="brand-sub">kli · tmux + agy cli</span>
        </div>
      </div>

      <div className="topbar-trackers">
        <CircularTracker
          label="Context"
          sublabel={`${formatTokens(ctxTokens)} / ${formatTokens(ctxWindow)}`}
          pct={ctxPct}
          thresholdPct={cfg.autocompactEnabled ? cfg.autocompactThresholdPct : null}
          tooltip={`Context window (${activeSessUsage?.source || 'estimated'}). Dot marks autocompact threshold (${cfg.autocompactThresholdPct}%).`}
          onClick={onOpenSettings}
        />

        <CircularTracker
          label="5h Quota"
          sublabel={`resets ${fiveHourReset}`}
          pct={fiveHourPct}
          tooltip={`Rolling 5-hour quota (${usage?.fiveHour?.source || 'estimated'} — run /usage in agy to sync).`}
          onClick={onOpenSettings}
        />

        <CircularTracker
          label="Weekly"
          sublabel={weeklySub}
          pct={weeklyPct}
          tooltip={`Weekly quota (${usage?.weekly?.source || 'estimated'} — run /usage in agy to sync).`}
          onClick={onOpenSettings}
        />

        <div className="autocompact-group">
          <button
            type="button"
            className="autocompact-toggle"
            onClick={onToggleAutocompact}
            title={`Toggle autocompact (auto-runs /compact at ${cfg.autocompactThresholdPct}% context)`}
          >
            <span className={`ac-dot ${cfg.autocompactEnabled ? 'on' : ''}`} />
            <span>
              Auto-compact {cfg.autocompactEnabled ? `${cfg.autocompactThresholdPct}%` : 'OFF'}
            </span>
          </button>
        </div>
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className={`icon-btn ${showGitDiff ? 'active' : ''}`}
          onClick={onToggleGitDiff}
          title="Toggle Git Diff Drawer"
        >
          <GitBranch size={15} />
        </button>
        <button
          type="button"
          className={`icon-btn ${showUsageHistory ? 'active' : ''}`}
          onClick={onToggleUsageHistory}
          title="Usage History & Cost Breakdown"
        >
          <BarChart3 size={15} />
        </button>
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
        <button type="button" className="icon-btn" onClick={onRefresh} title="Refresh projects & tmux sessions">
          <RefreshCw size={15} />
        </button>
        <button type="button" className="icon-btn" onClick={onOpenSettings} title="Settings & Remote Auth">
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
}
