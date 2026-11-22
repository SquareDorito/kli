import React, { useEffect, useState } from 'react';
import { FileCode, ExternalLink, X } from 'lucide-react';

export default function FilePreviewModal({ target, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!target?.path) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ path: target.path });
    if (target.basePath) params.set('base', target.basePath);
    if (target.line) params.set('line', String(target.line));

    fetch(`/api/fs/read?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not read file');
        setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [target]);

  if (!target) return null;

  const lines = data?.content ? data.content.split('\n') : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">
            <FileCode size={15} color="var(--accent-primary)" />
            <span>{data?.displayPath || target.path}</span>
            {target.line ? <span className="drawer-badge">:{target.line}</span> : null}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {data?.path && (
              <a
                className="btn-ghost"
                style={{ fontSize: 11, padding: '4px 8px', textDecoration: 'none' }}
                href={`vscode://file${data.path}${target.line ? `:${target.line}` : ''}`}
                title="Open in VS Code"
              >
                <ExternalLink size={12} style={{ marginRight: 4 }} />
                VS Code
              </a>
            )}
            <button type="button" className="icon-btn" onClick={onClose}>
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ maxHeight: '65vh', overflow: 'auto' }}>
          {loading ? (
            <div className="drawer-empty">Loading file…</div>
          ) : error ? (
            <div className="drawer-error">{error}</div>
          ) : (
            <pre className="file-preview-pre">
              {lines.map((ln, idx) => {
                const lineNum = (data?.startLine || 1) + idx;
                const isTarget = data?.highlightLine === lineNum;
                return (
                  <div
                    key={lineNum}
                    className={`file-preview-line ${isTarget ? 'highlight' : ''}`}
                  >
                    <span className="file-line-num">{lineNum}</span>
                    <span className="file-line-text">{ln || ' '}</span>
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
