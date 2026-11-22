import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, RefreshCw, X, FileCode } from 'lucide-react';

export default function GitDiffDrawer({ open, project, onClose, onPreviewFile }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadDiff = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}/git-diff`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load git diff');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [project?.id]);

  useEffect(() => {
    if (open && project?.id) {
      loadDiff();
    }
  }, [open, project?.id, loadDiff]);

  if (!open) return null;

  const diffLines = (data?.diff || '').split('\n');

  return (
    <aside className="side-drawer">
      <div className="drawer-header">
        <div className="drawer-title">
          <GitBranch size={14} color="var(--accent-primary)" />
          <span>Git Changes</span>
          {data?.branch && <span className="drawer-badge">{data.branch}</span>}
        </div>
        <div className="drawer-actions">
          <button
            type="button"
            className="mini-icon-btn"
            onClick={loadDiff}
            title="Refresh git diff"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
          <button type="button" className="mini-icon-btn" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="drawer-body">
        {!project ? (
          <div className="drawer-empty">Select a project to inspect git changes.</div>
        ) : error ? (
          <div className="drawer-error">{error}</div>
        ) : !data?.isGit ? (
          <div className="drawer-empty">Not a git repository.</div>
        ) : (
          <>
            <div className="drawer-section">
              <div className="drawer-section-title">
                Modified Files ({data.files?.length || 0})
              </div>
              {data.files?.length === 0 ? (
                <div className="drawer-empty" style={{ padding: '8px 0' }}>
                  Working tree clean
                </div>
              ) : (
                <div className="git-file-list">
                  {data.files.map((f) => (
                    <button
                      key={`${f.status}-${f.path}`}
                      type="button"
                      className="git-file-row"
                      onClick={() => onPreviewFile?.(f.path, project.path)}
                      title="Click to preview file"
                    >
                      <span className={`git-status-badge status-${f.status[0] === '?' ? 'U' : (f.status[0] || 'M')}`}>
                        {f.status}
                      </span>
                      <FileCode size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                      <span className="git-file-path">{f.path}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {data.diff && (
              <div className="drawer-section">
                <div className="drawer-section-title">Unified Diff</div>
                <pre className="git-diff-pre">
                  {diffLines.map((line, i) => {
                    let cls = 'diff-ctx';
                    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) {
                      cls = 'diff-meta';
                    } else if (line.startsWith('@@')) {
                      cls = 'diff-hunk';
                    } else if (line.startsWith('+')) {
                      cls = 'diff-add';
                    } else if (line.startsWith('-')) {
                      cls = 'diff-del';
                    }
                    return (
                      <div key={i} className={cls}>
                        {line || ' '}
                      </div>
                    );
                  })}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
