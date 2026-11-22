import React, { useState } from 'react';
import { Terminal, X, Bookmark, GitFork } from 'lucide-react';

const BUILTIN_PRESETS = [
  { id: 'fast', name: 'Fast Fix', kind: 'agy', mode: 'auto', effort: 'low', sandbox: false },
  { id: 'deep', name: 'Deep Plan', kind: 'agy', mode: 'plan', effort: 'high', sandbox: false },
  { id: 'review', name: 'Safe Review', kind: 'agy', mode: 'plan', effort: 'high', sandbox: true },
  { id: 'shell', name: 'Shell', kind: 'shell', mode: 'auto', effort: 'medium', sandbox: false },
];

function loadCustomPresets() {
  try {
    const raw = localStorage.getItem('kli-session-presets');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function NewSessionModal({ projects, defaultProjectId, onClose, onCreate }) {
  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || '');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('agy');
  const [mode, setMode] = useState('auto');
  const [effort, setEffort] = useState('medium');
  const [model, setModel] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [continueLast, setContinueLast] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState('');
  const [useWorktree, setUseWorktree] = useState(false);
  const [worktreeBranch, setWorktreeBranch] = useState('');
  const [customPresets, setCustomPresets] = useState(loadCustomPresets);
  const [submitting, setSubmitting] = useState(false);

  const applyPreset = (p) => {
    setKind(p.kind || 'agy');
    setMode(p.mode || 'auto');
    setEffort(p.effort || 'medium');
    setModel(p.model || '');
    setSandbox(Boolean(p.sandbox));
  };

  const saveCurrentAsPreset = () => {
    const name = window.prompt('Preset name (e.g. "Backend Refactor"):');
    if (!name || !name.trim()) return;
    const next = [
      ...customPresets,
      { id: `custom-${Date.now()}`, name: name.trim(), kind, mode, effort, model, sandbox },
    ];
    setCustomPresets(next);
    try {
      localStorage.setItem('kli-session-presets', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onCreate({
        projectId,
        label: label.trim() || undefined,
        kind,
        mode,
        effort,
        model: model.trim() || undefined,
        sandbox,
        continueLast,
        initialPrompt: initialPrompt.trim() || undefined,
        worktreeBranch: useWorktree && worktreeBranch.trim() ? worktreeBranch.trim() : undefined,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <span className="modal-title">
            <Terminal size={15} color="var(--accent-primary)" />
            Launch tmux Session
          </span>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="preset-bar">
            <span className="preset-bar-label">
              <Bookmark size={11} /> Presets:
            </span>
            {[...BUILTIN_PRESETS, ...customPresets].map((p) => (
              <button
                key={p.id}
                type="button"
                className="preset-chip"
                onClick={() => applyPreset(p)}
              >
                {p.name}
              </button>
            ))}
            <button
              type="button"
              className="preset-chip add"
              onClick={saveCurrentAsPreset}
              title="Save current settings as a preset"
            >
              + Save
            </button>
          </div>

          <div className="field">
            <label>Project Workspace</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.displayPath}
                </option>
              ))}
            </select>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Worker Name (auto-assigned if blank)</label>
              <input
                type="text"
                placeholder="e.g. atlas, vega, nova…"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Session Type</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="agy">agy CLI</option>
                <option value="shell">Interactive Shell (zsh)</option>
              </select>
            </div>
          </div>

          {kind === 'agy' && (
            <>
              <div className="field-row">
                <div className="field">
                  <label>Execution Mode (--mode)</label>
                  <select value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="auto">auto</option>
                    <option value="plan">plan</option>
                    <option value="accept-edits">accept-edits</option>
                  </select>
                </div>

                <div className="field">
                  <label>Reasoning Effort (--effort)</label>
                  <select value={effort} onChange={(e) => setEffort(e.target.value)}>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="xhigh">xhigh</option>
                    <option value="max">max</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>Model Override (--model, leave blank for default)</label>
                <input
                  type="text"
                  placeholder="default (uses your agy CLI setting)"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Initial Prompt (-i, optional)</label>
                <input
                  type="text"
                  placeholder="Optional task to start agy with..."
                  value={initialPrompt}
                  onChange={(e) => setInitialPrompt(e.target.value)}
                />
              </div>

              <div className="field-row">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={continueLast}
                    onChange={(e) => setContinueLast(e.target.checked)}
                  />
                  <span>Continue last chat (--continue)</span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={sandbox}
                    onChange={(e) => setSandbox(e.target.checked)}
                  />
                  <span>Enable --sandbox</span>
                </label>
              </div>
            </>
          )}

          <div className="worktree-box">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={useWorktree}
                onChange={(e) => setUseWorktree(e.target.checked)}
              />
              <GitFork size={13} color="var(--accent-sky)" />
              <span>Launch in isolated Git Worktree</span>
            </label>
            {useWorktree && (
              <input
                type="text"
                placeholder="New or existing branch name (e.g. feat/worker-auth)"
                value={worktreeBranch}
                onChange={(e) => setWorktreeBranch(e.target.value)}
              />
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Launching…' : 'Launch Session'}
          </button>
        </div>
      </form>
    </div>
  );
}
