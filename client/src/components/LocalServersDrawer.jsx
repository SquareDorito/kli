import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Server,
  RefreshCw,
  X,
  ExternalLink,
  ArrowUpRight,
  Copy,
  Trash2,
  Square,
  FolderOpen,
  Terminal,
  Download,
} from 'lucide-react';

function shortPath(p) {
  if (!p) return '';
  return p.replace(/^\/Users\/[^/]+/, '~');
}

export default function LocalServersDrawer({
  open,
  projects = [],
  onClose,
  onFocusSession,
  onAdoptedSession,
  onToast,
}) {
  const [data, setData] = useState({ servers: [], externalTmux: [], kliPid: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'kli' | 'tmux' | 'standalone'
  const [query, setQuery] = useState('');
  const [showSystem, setShowSystem] = useState(false);
  const [busyKey, setBusyKey] = useState(null);

  const loadServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/servers');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to inspect local servers');
      setData({
        servers: json.servers || [],
        externalTmux: json.externalTmux || [],
        kliPid: json.kliPid || null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadServers();
    const timer = setInterval(loadServers, 5000);
    return () => clearInterval(timer);
  }, [open, loadServers]);

  const filteredServers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.servers || []).filter((s) => {
      if (!showSystem && s.isSystem) return false;
      if (filter !== 'all' && s.sourceType !== filter) return false;
      if (!q) return true;
      return (
        String(s.port).includes(q) ||
        (s.command || '').toLowerCase().includes(q) ||
        (s.args || '').toLowerCase().includes(q) ||
        (s.cwd || '').toLowerCase().includes(q) ||
        (s.tmuxLabel || '').toLowerCase().includes(q) ||
        (s.tmuxName || '').toLowerCase().includes(q)
      );
    });
  }, [data.servers, filter, query, showSystem]);

  const filteredExternalTmux = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.externalTmux || []).filter((t) => {
      if (!q) return true;
      return (
        (t.tmuxName || '').toLowerCase().includes(q) ||
        (t.currentPath || '').toLowerCase().includes(q) ||
        (t.currentCommand || '').toLowerCase().includes(q) ||
        (t.ports || []).some((p) => String(p.port).includes(q))
      );
    });
  }, [data.externalTmux, query]);

  const handleStopPid = async (srv) => {
    if (srv.isSelf) return;
    setBusyKey(`kill-${srv.id}`);
    try {
      const res = await fetch('/api/servers/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: srv.pid, signal: 'SIGTERM' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to stop process');
      onToast?.(`Stopped ${srv.command} (:${srv.port})`);
      setTimeout(loadServers, 300);
    } catch (err) {
      onToast?.(err.message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleAdoptTmux = async (tmuxName, cwdPath) => {
    setBusyKey(`adopt-${tmuxName}`);
    try {
      const matchedProj = projects.find(
        (p) => cwdPath && (cwdPath === p.path || cwdPath.startsWith(`${p.path}/`))
      );
      const res = await fetch('/api/servers/adopt-tmux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmuxName, projectId: matchedProj?.id || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to adopt tmux session');
      onToast?.(`Adopted tmux "${tmuxName}" into KLI`);
      await onAdoptedSession?.(json.session?.tmuxName);
      loadServers();
    } catch (err) {
      onToast?.(err.message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleKillExternalTmux = async (tmuxName) => {
    setBusyKey(`killtmux-${tmuxName}`);
    try {
      const res = await fetch('/api/servers/kill-tmux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmuxName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to kill tmux session');
      onToast?.(`Killed tmux session "${tmuxName}"`);
      loadServers();
    } catch (err) {
      onToast?.(err.message);
    } finally {
      setBusyKey(null);
    }
  };

  const copyAttachCmd = async (tmuxName) => {
    const cmd = `tmux attach -t ${tmuxName}`;
    try {
      await navigator.clipboard.writeText(cmd);
      onToast?.(`Copied: ${cmd}`);
    } catch {
      onToast?.(cmd);
    }
  };

  if (!open) return null;

  const counts = {
    all: (data.servers || []).filter((s) => showSystem || !s.isSystem).length,
    kli: (data.servers || []).filter((s) => s.sourceType === 'kli').length,
    tmux: (data.servers || []).filter((s) => s.sourceType === 'tmux').length,
    standalone: (data.servers || []).filter((s) => (showSystem || !s.isSystem) && s.sourceType === 'standalone').length,
  };

  return (
    <aside className="side-drawer servers-drawer">
      <div className="drawer-header">
        <div className="drawer-title">
          <Server size={14} color="var(--accent-primary)" />
          <span>Local Servers &amp; Tmux</span>
          <span className="drawer-badge">{counts.all}</span>
        </div>
        <div className="drawer-actions">
          <button
            type="button"
            className="mini-icon-btn"
            onClick={loadServers}
            title="Refresh ports & tmux sessions"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
          <button type="button" className="mini-icon-btn" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="servers-toolbar">
        <input
          type="text"
          className="servers-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by port, app, path, tmux..."
        />
        <div className="servers-filter-row">
          <div className="servers-tabs">
            {[
              ['all', `All (${counts.all})`],
              ['kli', `KLI (${counts.kli})`],
              ['tmux', `Ext tmux (${counts.tmux})`],
              ['standalone', `Other (${counts.standalone})`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`servers-tab ${filter === key ? 'active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="servers-sys-toggle" title="Include macOS background daemons">
            <input
              type="checkbox"
              checked={showSystem}
              onChange={(e) => setShowSystem(e.target.checked)}
            />
            <span>System</span>
          </label>
        </div>
      </div>

      <div className="drawer-body">
        {error && <div className="drawer-error">{error}</div>}

        <div className="drawer-section">
          <div className="drawer-section-title">
            Listening Ports ({filteredServers.length})
          </div>
          {filteredServers.length === 0 ? (
            <div className="drawer-empty" style={{ padding: '10px 0' }}>
              No matching listening servers found.
            </div>
          ) : (
            <div className="servers-list">
              {filteredServers.map((srv) => (
                <div key={srv.id} className="server-card">
                  <div className="server-card-top">
                    <a
                      href={srv.url}
                      target="_blank"
                      rel="noreferrer"
                      className="server-port-link"
                      title={`Open ${srv.url}`}
                    >
                      <span>:{srv.port}</span>
                      <ExternalLink size={10} />
                    </a>
                    <span className="server-cmd" title={srv.args}>
                      {srv.command}
                    </span>
                    <span className={`server-source-pill ${srv.sourceType}`}>
                      {srv.sourceType === 'kli'
                        ? `kli · ${srv.tmuxLabel}`
                        : srv.sourceType === 'tmux'
                          ? `tmux · ${srv.tmuxName}`
                          : 'standalone'}
                    </span>
                  </div>

                  {srv.args && srv.args !== srv.command && (
                    <div className="server-args" title={srv.args}>
                      {srv.args}
                    </div>
                  )}

                  {srv.cwd && (
                    <div className="server-cwd" title={srv.cwd}>
                      <FolderOpen size={10} />
                      <span>{shortPath(srv.cwd)}</span>
                    </div>
                  )}

                  <div className="server-card-actions">
                    <span className="server-pid">
                      pid {srv.pid}
                      {srv.isSelf ? ' (kli)' : ''}
                    </span>
                    <div className="server-btn-group">
                      {srv.sourceType === 'kli' && srv.tmuxName && (
                        <button
                          type="button"
                          className="server-action-btn primary"
                          onClick={() => onFocusSession?.(srv.tmuxName)}
                          title={`Switch to KLI worker "${srv.tmuxLabel}"`}
                        >
                          <ArrowUpRight size={11} />
                          <span>Focus</span>
                        </button>
                      )}
                      {srv.sourceType === 'tmux' && srv.tmuxName && (
                        <>
                          <button
                            type="button"
                            className="server-action-btn primary"
                            disabled={busyKey === `adopt-${srv.tmuxName}`}
                            onClick={() => handleAdoptTmux(srv.tmuxName, srv.cwd)}
                            title="Move this Mac Terminal tmux session into KLI without stopping it"
                          >
                            <Download size={11} />
                            <span>Adopt to KLI</span>
                          </button>
                          <button
                            type="button"
                            className="server-action-btn"
                            onClick={() => copyAttachCmd(srv.tmuxName)}
                            title={`Copy: tmux attach -t ${srv.tmuxName}`}
                          >
                            <Copy size={11} />
                          </button>
                        </>
                      )}
                      {!srv.isSelf && (
                        <button
                          type="button"
                          className="server-action-btn danger"
                          disabled={busyKey === `kill-${srv.id}`}
                          onClick={() => handleStopPid(srv)}
                          title={`Send SIGTERM to PID ${srv.pid}`}
                        >
                          <Square size={10} />
                          <span>Stop</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {(filter === 'all' || filter === 'tmux') && (
          <div className="drawer-section" style={{ marginTop: 14 }}>
            <div className="drawer-section-title">
              External tmux Sessions ({filteredExternalTmux.length})
            </div>
            {filteredExternalTmux.length === 0 ? (
              <div className="drawer-empty" style={{ padding: '8px 0' }}>
                No non-KLI tmux sessions running.
              </div>
            ) : (
              <div className="servers-list">
                {filteredExternalTmux.map((sess) => (
                  <div key={sess.tmuxName} className="server-card">
                    <div className="server-card-top">
                      <Terminal size={12} color="var(--accent-sky)" />
                      <span className="server-cmd">{sess.tmuxName}</span>
                      {sess.attached && <span className="server-source-pill tmux">attached</span>}
                      {(sess.ports || []).map((p) => (
                        <a
                          key={p.port}
                          href={`http://localhost:${p.port}`}
                          target="_blank"
                          rel="noreferrer"
                          className="server-port-link"
                        >
                          :{p.port}
                        </a>
                      ))}
                    </div>
                    {sess.currentPath && (
                      <div className="server-cwd" title={sess.currentPath}>
                        <FolderOpen size={10} />
                        <span>
                          {shortPath(sess.currentPath)} · {sess.currentCommand || 'shell'}
                        </span>
                      </div>
                    )}
                    <div className="server-card-actions">
                      <span className="server-pid">
                        {sess.windows} win
                      </span>
                      <div className="server-btn-group">
                        <button
                          type="button"
                          className="server-action-btn primary"
                          disabled={busyKey === `adopt-${sess.tmuxName}`}
                          onClick={() => handleAdoptTmux(sess.tmuxName, sess.currentPath)}
                          title="Bring this tmux session into KLI's sidebar & tabs"
                        >
                          <Download size={11} />
                          <span>Adopt to KLI</span>
                        </button>
                        <button
                          type="button"
                          className="server-action-btn"
                          onClick={() => copyAttachCmd(sess.tmuxName)}
                          title={`Copy: tmux attach -t ${sess.tmuxName}`}
                        >
                          <Copy size={11} />
                        </button>
                        <button
                          type="button"
                          className="server-action-btn danger"
                          disabled={busyKey === `killtmux-${sess.tmuxName}`}
                          onClick={() => handleKillExternalTmux(sess.tmuxName)}
                          title={`Kill tmux session ${sess.tmuxName}`}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
