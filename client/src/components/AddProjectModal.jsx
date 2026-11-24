import React, { useEffect, useState } from 'react';
import { FolderPlus, Folder, ArrowUp, X } from 'lucide-react';

export default function AddProjectModal({ onClose, onAdd }) {
  const [dirPath, setDirPath] = useState('~');
  const [name, setName] = useState('');
  const [browseData, setBrowseData] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadBrowse = async (targetPath) => {
    try {
      const res = await fetch(`/api/fs/browse?path=${encodeURIComponent(targetPath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to browse');
      setBrowseData(data);
      setDirPath(data.current);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadBrowse('~');
  }, []);

  const handleCreateFolder = async () => {
    const clean = newFolderName.trim();
    if (!clean) return;
    setCreatingFolder(true);
    setError('');
    try {
      const res = await fetch('/api/fs/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentPath: browseData?.current || dirPath.trim() || '~',
          name: clean,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create folder');
      setBrowseData(data);
      setDirPath(data.current);
      setNewFolderName('');
      setShowNewFolder(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onAdd({ path: dirPath.trim(), name: name.trim() || undefined });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <span className="modal-title">
            <FolderPlus size={15} color="var(--accent-primary)" />
            Add Project Folder
          </span>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Directory Path</label>
            <input
              type="text"
              value={dirPath}
              onChange={(e) => setDirPath(e.target.value)}
              placeholder="/Users/you/projects/my-app"
              required
            />
          </div>

          <div className="field">
            <label>Display Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Defaults to folder name"
            />
          </div>

          {browseData && (
            <div className="field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <label style={{ margin: 0 }}>Browse Folders ({browseData.displayCurrent})</label>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => {
                    setShowNewFolder((v) => !v);
                    setError('');
                  }}
                >
                  + New Folder
                </button>
              </div>
              {showNewFolder && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input
                    type="text"
                    placeholder="New folder name…"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateFolder();
                      } else if (e.key === 'Escape') {
                        e.stopPropagation();
                        setShowNewFolder(false);
                      }
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}
                    disabled={creatingFolder || !newFolderName.trim()}
                    onClick={handleCreateFolder}
                  >
                    {creatingFolder ? 'Creating…' : 'Create'}
                  </button>
                </div>
              )}
              <div className="dir-browser">
                {browseData.parent && (
                  <div className="dir-entry" onClick={() => loadBrowse(browseData.parent)}>
                    <ArrowUp size={12} />
                    <span>..</span>
                  </div>
                )}
                {browseData.directories.map((d) => (
                  <div key={d.path} className="dir-entry" onClick={() => loadBrowse(d.path)}>
                    <Folder size={12} color="var(--accent-primary)" />
                    <span>{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ color: '#e06c75', fontSize: 12 }}>{error}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
