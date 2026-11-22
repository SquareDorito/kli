import React, { useState } from 'react';
import { Lock } from 'lucide-react';

export default function AuthGateModal({ onAuthenticated }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      onAuthenticated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={handleSubmit}>
        <div className="modal-header">
          <span className="modal-title">
            <Lock size={15} color="var(--accent-primary)" />
            Unlock KLI Workspace
          </span>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>PIN or Access Token</label>
            <input
              type="password"
              autoFocus
              placeholder="Enter PIN or token…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          {error && <div className="drawer-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button type="submit" className="btn-primary" disabled={submitting || !token}>
            {submitting ? 'Verifying…' : 'Unlock'}
          </button>
        </div>
      </form>
    </div>
  );
}
