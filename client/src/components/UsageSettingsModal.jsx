import React, { useState } from 'react';
import { Sliders, X, Lock, Bell } from 'lucide-react';

export default function UsageSettingsModal({
  config,
  authStatus,
  notificationsEnabled,
  onToggleNotifications,
  onAuthChanged,
  onClose,
  onSave,
}) {
  const [autocompactEnabled, setAutocompactEnabled] = useState(
    config?.autocompactEnabled ?? true
  );
  const [autocompactThresholdPct, setAutocompactThresholdPct] = useState(
    config?.autocompactThresholdPct || 80
  );
  const [authEnabled, setAuthEnabled] = useState(Boolean(authStatus?.enabled));
  const [authToken, setAuthToken] = useState('');
  const [authError, setAuthError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setAuthError(null);
    try {
      await onSave({
        autocompactEnabled,
        autocompactThresholdPct: Number(autocompactThresholdPct),
      });
      if (!authStatus?.fromEnv && (authEnabled !== Boolean(authStatus?.enabled) || authToken.trim())) {
        const res = await fetch('/api/auth/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: authEnabled,
            token: authToken.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update auth config');
        onAuthChanged?.();
      }
      onClose();
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <span className="modal-title">
            <Sliders size={15} color="var(--accent-primary)" />
            Autocompact Settings
          </span>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Context window, 5-hour quota, and daily quota are deduced automatically from{' '}
            <code>agy</code> output and <code>/usage</code>.
          </p>

          <label className="checkbox-row" style={{ marginTop: 2 }}>
            <input
              type="checkbox"
              checked={autocompactEnabled}
              onChange={(e) => setAutocompactEnabled(e.target.checked)}
            />
            <span>Automatically send /compact when context crosses threshold</span>
          </label>

          <div className="field">
            <label>Autocompact Threshold: {autocompactThresholdPct}%</label>
            <input
              type="range"
              min="20"
              max="95"
              value={autocompactThresholdPct}
              onChange={(e) => setAutocompactThresholdPct(Number(e.target.value))}
              disabled={!autocompactEnabled}
            />
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(notificationsEnabled)}
              onChange={(e) => onToggleNotifications?.(e.target.checked)}
            />
            <Bell size={13} color="var(--accent-primary)" />
            <span>Browser notifications on worker approval / autocompact</span>
          </label>

          <div className="field">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={authEnabled}
                disabled={Boolean(authStatus?.fromEnv)}
                onChange={(e) => setAuthEnabled(e.target.checked)}
              />
              <Lock size={13} color="var(--accent-amber)" />
              <span>
                Require PIN / Token for remote access
                {authStatus?.fromEnv ? ' (set via KLI_AUTH_TOKEN)' : ''}
              </span>
            </label>
            {authEnabled && !authStatus?.fromEnv && (
              <input
                type="password"
                placeholder={
                  authStatus?.enabled ? 'Enter new PIN/token to change (min 4 chars)' : 'Set PIN or token (min 4 chars)'
                }
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
              />
            )}
          </div>
          {authError && <div className="drawer-error">{authError}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
