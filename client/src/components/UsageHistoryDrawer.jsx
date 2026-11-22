import React, { useMemo } from 'react';
import { BarChart3, X, Sparkles, Coins } from 'lucide-react';

function formatTokens(n) {
  if (!n || n < 1000) return `${n || 0}`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return `${(n / 1000).toFixed(1)}k`;
}

export default function UsageHistoryDrawer({ open, usage, sessions, projects, onClose }) {
  const buckets = useMemo(() => {
    const events = usage?.events || [];
    const now = Date.now();
    const hourMs = 3600 * 1000;
    const arr = new Array(24).fill(0);
    for (const ev of events) {
      const ageH = Math.floor((now - ev.ts) / hourMs);
      if (ageH >= 0 && ageH < 24) {
        arr[23 - ageH] += ev.tokens || 0;
      }
    }
    const max = Math.max(1, ...arr);
    return arr.map((val) => ({ val, pct: Math.round((val / max) * 100) }));
  }, [usage?.events]);

  const sessionRows = useMemo(() => {
    const map = usage?.sessions || {};
    return Object.entries(map)
      .map(([tmuxName, stats]) => {
        const live = sessions.find((s) => s.tmuxName === tmuxName);
        const proj = live?.projectId
          ? projects.find((p) => p.id === live.projectId)
          : null;
        return {
          tmuxName,
          label: live?.label || tmuxName.replace(/^kli_/, ''),
          projectName: proj?.name || null,
          live: Boolean(live),
          ...stats,
        };
      })
      .sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0));
  }, [usage?.sessions, sessions, projects]);

  if (!open) return null;

  const totalCost = sessionRows.reduce((sum, r) => sum + (r.costUsd || 0), 0);
  const totalCompactions = sessionRows.reduce((sum, r) => sum + (r.compactions || 0), 0);

  return (
    <aside className="side-drawer">
      <div className="drawer-header">
        <div className="drawer-title">
          <BarChart3 size={14} color="var(--accent-primary)" />
          <span>Usage & Cost Breakdown</span>
        </div>
        <button type="button" className="mini-icon-btn" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="drawer-body">
        <div className="usage-summary-grid">
          <div className="usage-stat-card">
            <span className="usage-stat-label">24h Tokens</span>
            <span className="usage-stat-val">{formatTokens(usage?.daily?.tokens || 0)}</span>
          </div>
          <div className="usage-stat-card">
            <span className="usage-stat-label">Est. Cost</span>
            <span className="usage-stat-val">
              <Coins size={12} style={{ marginRight: 4 }} />${totalCost.toFixed(2)}
            </span>
          </div>
          <div className="usage-stat-card">
            <span className="usage-stat-label">Compactions</span>
            <span className="usage-stat-val">
              <Sparkles size={12} style={{ marginRight: 4 }} />
              {totalCompactions}
            </span>
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-title">24-Hour Token Activity</div>
          <div className="sparkline-bars" title="Hourly token usage (oldest → now)">
            {buckets.map((b, i) => (
              <div
                key={i}
                className="sparkline-bar"
                style={{ height: `${Math.max(6, b.pct)}%` }}
                title={`${23 - i}h ago: ${formatTokens(b.val)} tokens`}
              />
            ))}
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-title">Workers & Sessions</div>
          {sessionRows.length === 0 ? (
            <div className="drawer-empty">No session usage recorded yet.</div>
          ) : (
            <div className="usage-session-list">
              {sessionRows.map((row) => (
                <div key={row.tmuxName} className="usage-session-row">
                  <div className="usage-session-top">
                    <span className="usage-session-name">
                      <span className={`session-live-dot ${row.live ? '' : 'offline'}`} />
                      {row.label}
                    </span>
                    <span className="usage-session-tok">{formatTokens(row.totalTokens)} tok</span>
                  </div>
                  <div className="usage-session-sub">
                    <span>{row.projectName || 'detached'}</span>
                    <span>ctx {Math.round(row.contextPct || 0)}%</span>
                    <span>{row.compactions || 0} compacts</span>
                    {row.costUsd > 0 && <span>${row.costUsd.toFixed(2)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
