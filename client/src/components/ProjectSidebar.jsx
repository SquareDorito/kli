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
  RotateCw,
  Pencil,
} from 'lucide-react';

export default function ProjectSidebar({
  width,
  projects,
  sessions,
  usage,
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
  onRenameProject,
  onKillSession,
  onRestartSession,
  onReorderProjects,
  onReorderWorkers,
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kli-collapsed-projects') || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  });
  const [editingProjId, setEditingProjId] = useState(null);
  const [editingAlias, setEditingAlias] = useState('');
  const [draggedProjId, setDraggedProjId] = useState(null);
  const [dragOverProjId, setDragOverProjId] = useState(null);
  const [draggedWorker, setDraggedWorker] = useState(null);
  const [dragOverWorker, setDragOverWorker] = useState(null);

  const toggleCollapse = (id) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem('kli-collapsed-projects', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Group sessions by projectId (or match by path)
  const sessionsForProject = (project) =>
    sessions.filter(
      (s) => s.projectId === project.id || (!s.projectId && s.projectPath === project.path)
    );

  const orphanSessions = sessions.filter(
    (s) => !projects.some((p) => p.id === s.projectId || (!s.projectId && p.path === s.projectPath))
  );

  // Worker status: 'red' (action/failure) > 'blue' (turn completed) > 'green' (working)
  const getWorkerStatus = (sess) => {
    const tracked = usage?.sessions?.[sess.tmuxName]?.status;
    if (tracked === 'red' || attentionSessions[sess.tmuxName]) return 'red';
    if (tracked === 'blue') return 'blue';
    return 'green';
  };

  // Project dot uses highest priority across its workers: red > blue > green
  const getProjectStatus = (projSessions) => {
    if (!projSessions.length) return null;
    const statuses = projSessions.map(getWorkerStatus);
    if (statuses.includes('red')) return 'red';
    if (statuses.includes('blue')) return 'blue';
    return 'green';
  };

  return (
    <aside className="sidebar" style={width ? { width } : undefined}>
      <div className="sidebar-top">
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="primary-cta"
            style={{ flex: 1, padding: '8px 10px' }}
            onClick={() => onOpenNewSession(selectedProjectId)}
            title="Launch new agy session"
          >
            <span>+ agy</span>
          </button>
          <button
            type="button"
            className="secondary-btn"
            style={{ flex: 1, padding: '8px 10px' }}
            onClick={onOpenAddProject}
            title="Add project directory"
          >
            <FolderPlus size={14} />
            <span>Add Project</span>
          </button>
        </div>
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
          const displayProjName = project.alias || project.name;
          const isEditingProj = editingProjId === project.id;

          const commitProjAlias = () => {
            const next = editingAlias.trim();
            if (next !== (project.alias || '')) {
              onRenameProject?.(project.id, next);
            }
            setEditingProjId(null);
          };

          return (
            <div className="project-group" key={project.id}>
              <div
                draggable={!isEditingProj}
                onDragStart={(e) => {
                  setDraggedProjId(project.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', project.id);
                }}
                onDragOver={(e) => {
                  if (!draggedProjId || draggedProjId === project.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverProjId !== project.id) setDragOverProjId(project.id);
                }}
                onDragLeave={() => {
                  if (dragOverProjId === project.id) setDragOverProjId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedProjId && draggedProjId !== project.id) {
                    onReorderProjects?.(draggedProjId, project.id);
                  }
                  setDraggedProjId(null);
                  setDragOverProjId(null);
                }}
                onDragEnd={() => {
                  setDraggedProjId(null);
                  setDragOverProjId(null);
                }}
                className={`project-row ${isSelected ? 'selected' : ''} ${
                  dragOverProjId === project.id ? 'drag-over' : ''
                }`}
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
                  className={`project-dot ${
                    getProjectStatus(projSessions) ? `status-${getProjectStatus(projSessions)}` : ''
                  }`}
                  style={
                    getProjectStatus(projSessions)
                      ? undefined
                      : { background: project.color || 'var(--accent-primary)' }
                  }
                  title={
                    getProjectStatus(projSessions) === 'red'
                      ? 'Action required or failure'
                      : getProjectStatus(projSessions) === 'blue'
                      ? 'Turn completed'
                      : getProjectStatus(projSessions) === 'green'
                      ? 'Working'
                      : undefined
                  }
                />
                <div className="project-name-wrap">
                  {isEditingProj ? (
                    <input
                      type="text"
                      className="tab-rename-input"
                      style={{ width: '100%', fontSize: 12 }}
                      autoFocus
                      placeholder={project.name}
                      value={editingAlias}
                      onChange={(e) => setEditingAlias(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={commitProjAlias}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitProjAlias();
                        } else if (e.key === 'Escape') {
                          setEditingProjId(null);
                        }
                      }}
                    />
                  ) : (
                    <span
                      className="project-name"
                      title={project.alias ? `${project.alias} (${project.name})` : `${project.name} · Double-click to set alias`}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingProjId(project.id);
                        setEditingAlias(project.alias || '');
                      }}
                    >
                      {displayProjName}
                    </span>
                  )}
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
                    title="Set project alias"
                    onClick={() => {
                      setEditingProjId(project.id);
                      setEditingAlias(project.alias || '');
                    }}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    className="mini-icon-btn"
                    title={`Launch agy in ${displayProjName}`}
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
                    const workerStatus = getWorkerStatus(sess);
                    const ports = portsBySession[sess.tmuxName] || [];
                    // Prefix worker name with project alias (or project name)
                    let workerSuffix = sess.label;
                    if (workerSuffix.startsWith(`${project.name} `)) {
                      workerSuffix = workerSuffix.slice(project.name.length + 1);
                    } else if (project.alias && workerSuffix.startsWith(`${project.alias} `)) {
                      workerSuffix = workerSuffix.slice(project.alias.length + 1);
                    }
                    const displayLabel = `${displayProjName} ${workerSuffix}`;
                    return (
                      <div key={sess.tmuxName} className="session-item-wrap">
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            setDraggedWorker(sess.tmuxName);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', sess.tmuxName);
                          }}
                          onDragOver={(e) => {
                            if (!draggedWorker || draggedWorker === sess.tmuxName) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverWorker !== sess.tmuxName) setDragOverWorker(sess.tmuxName);
                          }}
                          onDragLeave={() => {
                            if (dragOverWorker === sess.tmuxName) setDragOverWorker(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedWorker && draggedWorker !== sess.tmuxName) {
                              onReorderWorkers?.(draggedWorker, sess.tmuxName);
                            }
                            setDraggedWorker(null);
                            setDragOverWorker(null);
                          }}
                          onDragEnd={() => {
                            setDraggedWorker(null);
                            setDragOverWorker(null);
                          }}
                          className={`session-item compact ${isActive ? 'active' : ''} ${
                            dragOverWorker === sess.tmuxName ? 'drag-over' : ''
                          }`}
                          onClick={() => onSelectSession(sess.tmuxName)}
                        >
                          <span
                            className={`session-live-dot status-${workerStatus}`}
                            title={
                              workerStatus === 'red'
                                ? 'Action required or failure'
                                : workerStatus === 'blue'
                                ? 'Turn completed'
                                : 'Working'
                            }
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
              {orphanSessions.map((sess) => {
                const workerStatus = getWorkerStatus(sess);
                return (
                  <div
                    key={sess.tmuxName}
                    className={`session-item ${sess.tmuxName === activeSessionName ? 'active' : ''}`}
                    onClick={() => onSelectSession(sess.tmuxName)}
                  >
                    <span className={`session-live-dot status-${workerStatus}`} />
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
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
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
