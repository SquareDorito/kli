import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';

export default function WorkerMessagingModal({
  open,
  sessions,
  projects,
  activeSessionName,
  onClose,
  onSent,
}) {
  const [fromTmuxName, setFromTmuxName] = useState(activeSessionName || '');
  const [toTmuxName, setToTmuxName] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setFromTmuxName(activeSessionName || '');
    const other = sessions.find((s) => s.tmuxName !== activeSessionName) || sessions[0];
    setToTmuxName(other?.tmuxName || '');
    fetch('/api/workers/messages')
      .then((r) => r.json())
      .then((d) => setHistory(d.messages || []))
      .catch(() => {});
  }, [open, activeSessionName, sessions]);

  if (!open) return null;

  const projectNameFor = (sess) => {
    const p = projects.find((pr) => pr.id === sess.projectId || pr.path === sess.projectPath);
    return p?.name || 'other';
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!toTmuxName || !message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/workers/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromTmuxName: fromTmuxName || null,
          toTmuxName,
          message: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send message');
      setHistory((prev) => [...prev, data.entry]);
      setMessage('');
      onSent?.(data.entry);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">
            <MessageSquare size={15} color="var(--accent-primary)" />
            Cross-Worker Messaging
          </span>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSend}>
          <div className="field-row">
            <div className="field">
              <label>From</label>
              <select value={fromTmuxName} onChange={(e) => setFromTmuxName(e.target.value)}>
                <option value="">Coordinator (Web UI)</option>
                {sessions.map((s) => (
                  <option key={s.tmuxName} value={s.tmuxName}>
                    {s.label} ({projectNameFor(s)})
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>To Worker</label>
              <select value={toTmuxName} onChange={(e) => setToTmuxName(e.target.value)}>
                {sessions.map((s) => (
                  <option key={s.tmuxName} value={s.tmuxName}>
                    {s.label} ({projectNameFor(s)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Message / Handoff Instruction</label>
            <textarea
              rows={3}
              placeholder="e.g. Check the new /api/ports endpoint and update the client badge..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          {error && <div className="drawer-error">{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={sending || !toTmuxName || !message.trim()}
            >
              <Send size={13} style={{ marginRight: 6 }} />
              {sending ? 'Sending…' : 'Send to Worker'}
            </button>
          </div>

          {history.length > 0 && (
            <div className="worker-msg-history">
              <div className="drawer-section-title">Recent Messages</div>
              <div className="worker-msg-scroll">
                {history
                  .slice()
                  .reverse()
                  .slice(0, 15)
                  .map((m) => (
                    <div key={m.id} className="worker-msg-item">
                      <div className="worker-msg-meta">
                        <span>
                          <strong>{m.fromLabel}</strong> → <strong>{m.toLabel}</strong>
                        </span>
                        <span>{new Date(m.ts).toLocaleTimeString()}</span>
                      </div>
                      <div className="worker-msg-text">{m.message}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
