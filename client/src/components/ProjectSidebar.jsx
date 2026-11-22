import React, { useState } from 'react';
import {
  Plus,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Terminal,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  RotateCw,
} from 'lucide-react';

export default function ProjectSidebar({
  projects,
  sessions,
  selectedProjectId,
  activeSessionName,
  envHealth,
  attentionSessions = {},
  portsBySession = {},
  onSelectProject,
  onSelectSession,
  onOpenNewSession,
  onOpenAddProject,
  onOpenMessaging,
  onDeleteProject,
  onKillSession,
  onRestartSession,
}) {
  const [collapsed, setCollapsed] = useState({});

  const toggleCollapse = (id) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Group sessions by projectId (or match by path)
  const sessionsForProject = (project) =>
    sessions.filter(
      (s) => s.projectId === project.id || (!s.projectId && s.projectPath === project.path)
    );

  const orphanSessions = sessions.filter(
    (s) => !projects.some((p) => p.id === s.projectId || (!s.projectId && p.path === s.projectPath))
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button
          type="button"
          className="primary-cta"
          onClick={() => onOpenNewSession(selectedProjectId)}
        >
          <Plus size={15} strokeWidth={2.5} />
          <span>New agy Session</span>
        </button>
      </div>

      <div className="sidebar-section-header">
        <span>Projects</span>
        <span>{sessions.length} live</span>
      </div>

      <div className="sidebar-scroll">
        {projects.map((project) => {
          const projSessions = sessionsForProject(project);
          const isCollapsed = Boolean(collapsed[project.id]);
          const isSelected = selectedProjectId === project.id;

          return (
            <div className="project-group" key={project.id}>
              <div
                className={`project-row ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  onSelectProject(project.id);
                  toggleCollapse(project.id);
                }}
              >
                {isCollapsed ? (
                  <ChevronRight size={13} color="var(--text-muted)" />
                ) : (
                  <ChevronDown size={13} color="var(--text-muted)" />
                )}
                <span
                  className="project-dot"
                  style={{ background: project.color || 'var(--accent-primary)' }}
                />
                <div className="project-name-wrap">
                  <span className="project-name">{project.name}</span>
                  <div className="project-meta-row">
                    {project.branch ? (
                      <span className="git-badge">
                        <GitBranch size={10} />
                        {project.branch}
                        {project.dirtyCount > 0 ? `*${project.dirtyCount}` : ''}
                      </span>
                    ) : (
                      <span>{project.displayPath}</span>
                    )}
                  </div>
                </div>
                <div
                  className="project-row-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="mini-icon-btn"
                    title={`Launch agy in ${project.name}`}
                    onClick={() => onOpenNewSession(project.id)}
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    type="button"
                    className="mini-icon-btn danger"
                    title="Remove project from sidebar"
                    onClick={() => onDeleteProject(project.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {!isCollapsed && projSessions.length > 0 && (
                <div className="session-list">
                  {projSessions.map((sess) => {
                    const isActive = sess.tmuxName === activeSessionName;
                    const needsAttention = Boolean(attentionSessions[sess.tmuxName]);
                    const ports = portsBySession[sess.tmuxName] || [];
                    // Ensure worker name is prefixed with its project name
                    const displayLabel = sess.label.startsWith(`${project.name} `)
                      ? sess.label
                      : `${project.name} ${sess.label}`;
                    return (
                      <div key={sess.tmuxName} className="session-item-wrap">
                        <div
                          className={`session-item compact ${isActive ? 'active' : ''}`}
                          onClick={() => onSelectSession(sess.tmuxName)}
                        >
                          <span
                            className={`session-live-dot ${needsAttention ? 'attention' : ''}`}
                          />
                          <Terminal size={11} style={{ flexShrink: 0, opacity: 0.75 }} />
                          <span className="session-label" title={sess.tmuxName}>
                            {displayLabel}
                          </span>
                          {sess.paneCount > 1 && (
                            <span
                              className="session-pane-tag"
                              title={`${sess.paneCount} tmux panes (${sess.agyPaneCount || 0} running agy)`}
                            >
                              {sess.agyPaneCount > 0 ? `${sess.agyPaneCount}agy/` : ''}
                              {sess.paneCount}p
                            </span>
                          )}
                          <span className="session-mode-tag">{sess.mode || 'auto'}</span>
                          <button
                            type="button"
                            className="mini-icon-btn"
                            title={`Restart worker ${displayLabel}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRestartSession?.(sess.tmuxName);
                            }}
                          >
                            <RotateCw size={10} />
                          </button>
                          <button
                            type="button"
                            className="mini-icon-btn danger"
                            title={`Kill worker ${displayLabel}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onKillSession(sess.tmuxName);
                            }}
                          >
                            <X size={10} />
                          </button>
                        </div>
                        {ports.length > 0 && (
                          <div className="session-ports-row">
                            {ports.map((p) => (
                              <a
                                key={p.port}
                                href={`http://localhost:${p.port}`}
                                target="_blank"
                                rel="noreferrer"
                                className="port-badge"
                                title={`${p.command} listening on :${p.port}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                :{p.port}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {orphanSessions.length > 0 && (
          <div className="project-group" style={{ marginTop: 12 }}>
            <div className="sidebar-section-header" style={{ padding: '4px 6px' }}>
              <span>Other tmux sessions</span>
            </div>
            <div className="session-list" style={{ paddingLeft: 4 }}>
              {orphanSessions.map((sess) => (
                <div
                  key={sess.tmuxName}
                  className={`session-item ${sess.tmuxName === activeSessionName ? 'active' : ''}`}
                  onClick={() => onSelectSession(sess.tmuxName)}
                >
                  <span className="session-live-dot" />
                  <Terminal size={12} />
                  <span className="session-label">{sess.label}</span>
                  <button
                    type="button"
                    className="mini-icon-btn danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onKillSession(sess.tmuxName);
                    }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="secondary-btn" style={{ flex: 1 }} onClick={onOpenAddProject}>
            <FolderPlus size={14} />
            <span>Add Project</span>
          </button>
          <button
            type="button"
            className="secondary-btn"
            title="Cross-Worker Messaging"
            onClick={onOpenMessaging}
          >
            <MessageSquare size={14} />
          </button>
        </div>

        <div className="env-pills">
          <span className="env-pill">
            {envHealth?.tmux ? (
              <CheckCircle2 size={11} className="env-ok" />
            ) : (
              <AlertCircle size={11} color="var(--accent-coral)" />
            )}
            <span>{envHealth?.tmux || 'tmux missing'}</span>
          </span>
          <span className="env-pill">
            {envHealth?.agy ? (
              <CheckCircle2 size={11} className="env-ok" />
            ) : (
              <AlertCircle size={11} color="var(--accent-coral)" />
            )}
            <span>{envHealth?.agy ? 'agy ready' : 'agy missing'}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
