import React from 'react';
import { GitBranch, Folder, Cpu, Shield, Sparkles } from 'lucide-react';

function formatTokens(n) {
  if (!n || n < 1000) return `${n || 0}`;
  return `${(n / 1000).toFixed(1)}k`;
}

export default function ClaudeStatusBar({ session, project, usage, ptyBackend }) {
  const cfg = usage?.config || { autocompactEnabled: true, autocompactThresholdPct: 80 };
  const sessUsage = session ? usage?.sessions?.[session.tmuxName] : null;
  const ctxPct = sessUsage?.contextPct || 0;
  const totalTokens = sessUsage?.totalTokens || 0;
  const costUsd = sessUsage?.costUsd || 0;

  const mode = session?.mode || 'auto';
  const model = sessUsage?.model || session?.model || 'default';
  const branch = project?.branch || null;
  const dirty = project?.dirtyCount || 0;
  const displayPath = project?.displayPath || session?.currentPath || '~';

  const ctxColor =
    ctxPct >= cfg.autocompactThresholdPct
      ? 'var(--accent-coral)'
      : ctxPct >= 65
        ? 'var(--accent-amber)'
        : 'var(--accent-primary)';

  return (
    <footer className="claude-statusbar">
      <div className="csb-left">
        <span className={`csb-mode ${mode}`}>▸ {mode}</span>

        <span className="csb-item" title="Active model">
          <Cpu size={11} color="var(--accent-primary)" />
          <span>{model}</span>
        </span>

        {session?.sandbox && (
          <span className="csb-item" style={{ color: 'var(--accent-sage)' }}>
            <Shield size={11} />
            <span>sandbox</span>
          </span>
        )}

        <span className="csb-sep">│</span>

        {branch && (
          <span className="csb-item" style={{ color: 'var(--accent-sky)' }}>
            <GitBranch size={11} />
            <span>
              {branch}
              {dirty > 0 ? ` • ${dirty}` : ''}
            </span>
          </span>
        )}

        <span className="csb-item" style={{ color: 'var(--text-secondary)' }} title={displayPath}>
          <Folder size={11} />
          <span>{displayPath}</span>
        </span>
      </div>

      <div className="csb-right">
        <span className="csb-item" title="Context window usage">
          <span>ctx {Math.round(ctxPct)}%</span>
          <span className="csb-ctx-bar">
            <span
              className="csb-ctx-fill"
              style={{ width: `${Math.min(100, ctxPct)}%`, background: ctxColor }}
            />
          </span>
        </span>

        <span className="csb-sep">│</span>

        <span
          className="csb-item"
          style={{ color: cfg.autocompactEnabled ? 'var(--accent-primary)' : 'var(--text-muted)' }}
        >
          <Sparkles size={11} />
          <span>
            auto-compact:{' '}
            {cfg.autocompactEnabled ? `${cfg.autocompactThresholdPct}%` : 'off'}
          </span>
        </span>

        <span className="csb-sep">│</span>

        <span className="csb-item">
          <span>{formatTokens(totalTokens)} tok</span>
          {costUsd > 0 && <span>· ${costUsd.toFixed(2)}</span>}
        </span>

        {ptyBackend && (
          <>
            <span className="csb-sep">│</span>
            <span className="csb-hint">tmux · {ptyBackend}</span>
          </>
        )}
      </div>
    </footer>
  );
}
