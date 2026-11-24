import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import TopBar from './components/TopBar.jsx';
import ProjectSidebar from './components/ProjectSidebar.jsx';
import TerminalPane from './components/TerminalPane.jsx';
import NewSessionModal from './components/NewSessionModal.jsx';
import AddProjectModal from './components/AddProjectModal.jsx';
import UsageSettingsModal from './components/UsageSettingsModal.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import GitDiffDrawer from './components/GitDiffDrawer.jsx';
import UsageHistoryDrawer from './components/UsageHistoryDrawer.jsx';
import WorkerMessagingModal from './components/WorkerMessagingModal.jsx';
import FilePreviewModal from './components/FilePreviewModal.jsx';
import AuthGateModal from './components/AuthGateModal.jsx';

export default function App() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('kli-theme') || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [projects, setProjects] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [activeSessionName, setActiveSessionName] = useState(null);
  const [usage, setUsage] = useState(null);
  const [envHealth, setEnvHealth] = useState(null);
  const [ptyBackend, setPtyBackend] = useState(null);

  const [newSessionProjectId, setNewSessionProjectId] = useState(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showUsageSettings, setShowUsageSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showGitDiff, setShowGitDiff] = useState(false);
  const [showUsageHistory, setShowUsageHistory] = useState(false);
  const [showMessaging, setShowMessaging] = useState(false);
  const [filePreviewTarget, setFilePreviewTarget] = useState(null);
  const [attentionSessions, setAttentionSessions] = useState({});
  const [portsBySession, setPortsBySession] = useState({});
  const [tabOrder, setTabOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kli-worker-order') || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [projectOrder, setProjectOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kli-project-order') || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem('kli-sidebar-width'));
      return Number.isFinite(n) && n >= 200 && n <= 520 ? n : 276;
    } catch {
      return 276;
    }
  });
  const [authStatus, setAuthStatus] = useState({ enabled: false, authenticated: true });
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    try {
      return localStorage.getItem('kli-notifications') === '1';
    } catch {
      return false;
    }
  });
  const [compacting, setCompacting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('kli-theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => {
      setToast((prev) => (prev === message ? null : prev));
    }, 3500);
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setAuthStatus(data);
      return data.authenticated;
    } catch {
      return true;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const authed = await checkAuth();
      if (!authed) return;
      const [projRes, healthRes, usageRes, portsRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/health'),
        fetch('/api/usage'),
        fetch('/api/ports'),
      ]);
      const projData = await projRes.json();
      const healthData = await healthRes.json();
      const usageData = await usageRes.json();
      const portsData = portsRes.ok ? await portsRes.json() : { ports: {} };

      const nextProjects = projData.projects || [];
      const nextSessions = projData.sessions || [];
      setProjects(nextProjects);
      setSessions(nextSessions);
      setEnvHealth(healthData.env || null);
      setUsage(usageData);
      setPortsBySession(portsData.ports || {});

      setSelectedProjectId((prev) => prev || nextProjects[0]?.id || null);
      setActiveSessionName((prev) => {
        if (prev && nextSessions.some((s) => s.tmuxName === prev)) return prev;
        return nextSessions[0]?.tmuxName || null;
      });
    } catch {
      // backend may still be starting
    }
  }, [checkAuth]);

  const sortByOrder = (items, orderList, getKey) => {
    if (!orderList.length) return items;
    const rank = new Map(orderList.map((id, i) => [id, i]));
    return [...items].sort((a, b) => {
      const ra = rank.has(getKey(a)) ? rank.get(getKey(a)) : 9999;
      const rb = rank.has(getKey(b)) ? rank.get(getKey(b)) : 9999;
      return ra - rb;
    });
  };

  const orderedSessions = useMemo(
    () => sortByOrder(sessions, tabOrder, (s) => s.tmuxName),
    [sessions, tabOrder]
  );

  const orderedProjects = useMemo(
    () => sortByOrder(projects, projectOrder, (p) => p.id),
    [projects, projectOrder]
  );

  // Global shortcuts: Esc closes modals/drawers, Cmd+Shift+P palette, Cmd/Option/Ctrl+Shift+Up/Down projects, Option/Ctrl+Up/Down workers
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !showPalette) {
        if (filePreviewTarget) {
          e.preventDefault();
          e.stopPropagation();
          setFilePreviewTarget(null);
          return;
        }
        if (showNewSession) {
          e.preventDefault();
          e.stopPropagation();
          setShowNewSession(false);
          return;
        }
        if (showAddProject) {
          e.preventDefault();
          e.stopPropagation();
          setShowAddProject(false);
          return;
        }
        if (showUsageSettings) {
          e.preventDefault();
          e.stopPropagation();
          setShowUsageSettings(false);
          return;
        }
        if (showMessaging) {
          e.preventDefault();
          e.stopPropagation();
          setShowMessaging(false);
          return;
        }
        if (showGitDiff) {
          e.preventDefault();
          e.stopPropagation();
          setShowGitDiff(false);
          return;
        }
        if (showUsageHistory) {
          e.preventDefault();
          e.stopPropagation();
          setShowUsageHistory(false);
          return;
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        e.stopPropagation();
        setShowPalette((prev) => !prev);
        return;
      }

      const isNavMod =
        (e.altKey && !e.ctrlKey && !e.metaKey) ||
        (e.ctrlKey && !e.altKey && !e.metaKey) ||
        (e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey);
      if (isNavMod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const delta = e.key === 'ArrowDown' ? 1 : -1;

        if (e.shiftKey) {
          if (!orderedProjects.length) return;
          e.preventDefault();
          e.stopPropagation();
          const curProjId =
            (orderedSessions.find((s) => s.tmuxName === activeSessionName)?.projectId) ||
            selectedProjectId ||
            orderedProjects[0]?.id;
          const idx = orderedProjects.findIndex((p) => p.id === curProjId);
          const nextIdx =
            idx === -1 ? 0 : (idx + delta + orderedProjects.length) % orderedProjects.length;
          const nextProj = orderedProjects[nextIdx];
          setSelectedProjectId(nextProj.id);
          const projSess = orderedSessions.find(
            (s) => s.projectId === nextProj.id || (!s.projectId && s.projectPath === nextProj.path)
          );
          if (projSess) {
            setActiveSessionName(projSess.tmuxName);
          }
        } else {
          const curProjId =
            (orderedSessions.find((s) => s.tmuxName === activeSessionName)?.projectId) ||
            selectedProjectId ||
            orderedProjects[0]?.id;
          const curProj = orderedProjects.find((p) => p.id === curProjId);
          const projWorkers = curProj
            ? orderedSessions.filter(
                (s) => s.projectId === curProj.id || (!s.projectId && s.projectPath === curProj.path)
              )
            : orderedSessions;
          if (projWorkers.length < 2) return;
          e.preventDefault();
          e.stopPropagation();
          const curIdx = projWorkers.findIndex((s) => s.tmuxName === activeSessionName);
          const nextIdx =
            curIdx === -1 ? 0 : (curIdx + delta + projWorkers.length) % projWorkers.length;
          setActiveSessionName(projWorkers[nextIdx].tmuxName);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    orderedProjects,
    orderedSessions,
    selectedProjectId,
    activeSessionName,
    showPalette,
    filePreviewTarget,
    showNewSession,
    showAddProject,
    showUsageSettings,
    showMessaging,
    showGitDiff,
    showUsageHistory,
  ]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 12000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // Live WebSocket for usage & autocompact events
  useEffect(() => {
    let ws;
    let reconnectTimer;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws/events`);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'usage' && msg.snapshot) {
            setUsage(msg.snapshot);
          } else if (msg.type === 'autocompact-fired') {
            if (msg.snapshot) setUsage(msg.snapshot);
            showToast(
              `Auto-compact triggered (${Math.round(msg.contextPct)}% ≥ ${msg.thresholdPct}%) → sent /compact`
            );
          } else if (msg.type === 'compact' && msg.usage) {
            setUsage(msg.usage);
          } else if (msg.type === 'session-attention' && msg.tmuxName) {
            setAttentionSessions((prev) => ({ ...prev, [msg.tmuxName]: true }));
            showToast(`Worker needs attention (${msg.snippet || msg.kind})`);
            if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('KLI Worker Attention', {
                body: `${msg.tmuxName.replace(/^kli_/, '')}: ${msg.snippet || msg.kind}`,
              });
            }
          } else if (msg.type === 'worker-message' && msg.entry) {
            showToast(`Message: ${msg.entry.fromLabel} → ${msg.entry.toLabel}`);
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 2500);
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
  }, [showToast]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.tmuxName === activeSessionName) || null,
    [sessions, activeSessionName]
  );

  const activeProject = useMemo(() => {
    if (activeSession?.projectId) {
      return projects.find((p) => p.id === activeSession.projectId) || null;
    }
    return projects.find((p) => p.id === selectedProjectId) || projects[0] || null;
  }, [projects, selectedProjectId, activeSession]);

  const handleCreateSession = async (payload) => {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to launch session');
    await refreshAll();
    setActiveSessionName(data.session.tmuxName);
    showToast(`Launched tmux session ${data.session.label}`);
  };

  const handleQuickLaunch = async (opts) => {
    const proj = activeProject || projects[0];
    try {
      await handleCreateSession({
        projectId: proj?.id,
        projectName: proj?.name,
        projectPath: proj?.path,
        ...opts,
      });
    } catch (err) {
      showToast(`Launch failed: ${err.message}`);
    }
  };

  const handleKillSession = async (tmuxName) => {
    await fetch(`/api/sessions/${encodeURIComponent(tmuxName)}`, { method: 'DELETE' });
    if (activeSessionName === tmuxName) {
      setActiveSessionName(null);
    }
    await refreshAll();
    showToast(`Closed tmux session`);
  };

  const handleRestartSession = async (tmuxName) => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(tmuxName)}/restart`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restart failed');
      const sess = sessions.find((s) => s.tmuxName === tmuxName);
      showToast(`Restarted ${sess?.label || tmuxName}`);
      await refreshAll();
    } catch (err) {
      showToast(`Restart failed: ${err.message}`);
    }
  };

  const handleRenameProject = async (projectId, alias) => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update project alias');
      await refreshAll();
      showToast(alias ? `Project alias set to "${alias}"` : 'Cleared project alias');
    } catch (err) {
      showToast(`Alias update failed: ${err.message}`);
    }
  };

  const handleAddProject = async (payload) => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add project');
    setSelectedProjectId(data.project.id);
    try {
      await handleCreateSession({
        projectId: data.project.id,
        kind: 'agy',
        mode: 'auto',
        effort: 'medium',
      });
    } catch {
      await refreshAll();
    }
    showToast(`Added project ${data.project.name} & started worker`);
  };

  const handleDeleteProject = async (id) => {
    await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refreshAll();
  };

  const handleToggleAutocompact = async () => {
    const current = usage?.config?.autocompactEnabled ?? true;
    const res = await fetch('/api/usage/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autocompactEnabled: !current }),
    });
    const data = await res.json();
    if (data.snapshot) setUsage(data.snapshot);
    showToast(`Auto-compact ${!current ? 'enabled' : 'disabled'}`);
  };

  const handleSaveUsageConfig = async (patch) => {
    const res = await fetch('/api/usage/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.snapshot) setUsage(data.snapshot);
    showToast('Saved usage & autocompact settings');
  };

  const handleManualCompact = async () => {
    if (!activeSession) return;
    setCompacting(true);
    try {
      const res = await fetch(
        `/api/sessions/${encodeURIComponent(activeSession.tmuxName)}/compact`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (data.usage) setUsage(data.usage);
      showToast('Sent /compact to active agy session');
    } finally {
      setCompacting(false);
    }
  };

  const handleSendSlashCommand = async (cmd) => {
    if (!activeSession) return;
    if (cmd === '/compact') {
      return handleManualCompact();
    }
    await fetch(`/api/sessions/${encodeURIComponent(activeSession.tmuxName)}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: cmd, enter: true, preferAgy: true }),
    });
  };

  const handleSyncUsage = async () => {
    if (!activeSession) return;
    await fetch(`/api/sessions/${encodeURIComponent(activeSession.tmuxName)}/sync-usage`, {
      method: 'POST',
    });
    showToast('Sent /usage to sync quota rings');
  };

  const handleRenameSession = async (tmuxName, label) => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(tmuxName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Rename failed');
      return;
    }
    await refreshAll();
    showToast(`Renamed worker to ${label}`);
  };

  const handleSelectSession = (tmuxName) => {
    setActiveSessionName(tmuxName);
    setAttentionSessions((prev) => {
      if (!prev[tmuxName]) return prev;
      const next = { ...prev };
      delete next[tmuxName];
      return next;
    });
  };

  const reorderIds = (keys, fromKey, toKey) => {
    const fromIdx = keys.indexOf(fromKey);
    const toIdx = keys.indexOf(toKey);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return null;
    const next = [...keys];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    return next;
  };

  const handleReorderTabs = (fromName, toName) => {
    const next = reorderIds(
      orderedSessions.map((s) => s.tmuxName),
      fromName,
      toName
    );
    if (!next) return;
    setTabOrder(next);
    try {
      localStorage.setItem('kli-worker-order', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleReorderProjects = (fromId, toId) => {
    const next = reorderIds(
      orderedProjects.map((p) => p.id),
      fromId,
      toId
    );
    if (!next) return;
    setProjectOrder(next);
    try {
      localStorage.setItem('kli-project-order', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleToggleNotifications = async (enabled) => {
    if (enabled && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    setNotificationsEnabled(enabled);
    try {
      localStorage.setItem('kli-notifications', enabled ? '1' : '0');
    } catch {
      // ignore
    }
  };

  const startSidebarResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    let latestW = startW;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      latestW = Math.max(200, Math.min(520, startW + (ev.clientX - startX)));
      setSidebarWidth(latestW);
    };

    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try {
        localStorage.setItem('kli-sidebar-width', String(latestW));
      } catch {
        // ignore
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="app-shell">
      <TopBar
        usage={usage}
        activeSession={activeSession}
        theme={theme}
        showGitDiff={showGitDiff}
        showUsageHistory={showUsageHistory}
        onToggleTheme={toggleTheme}
        onToggleAutocompact={handleToggleAutocompact}
        onManualCompact={handleManualCompact}
        onSyncUsage={handleSyncUsage}
        onToggleGitDiff={() => {
          setShowGitDiff((v) => !v);
          setShowUsageHistory(false);
        }}
        onToggleUsageHistory={() => {
          setShowUsageHistory((v) => !v);
          setShowGitDiff(false);
        }}
        onOpenMessaging={() => setShowMessaging(true)}
        onOpenPalette={() => setShowPalette(true)}
        onOpenSettings={() => setShowUsageSettings(true)}
        onRefresh={refreshAll}
        compacting={compacting}
      />

      <div className="app-body">
        <ProjectSidebar
          width={sidebarWidth}
          projects={orderedProjects}
          sessions={orderedSessions}
          selectedProjectId={selectedProjectId}
          activeSessionName={activeSessionName}
          envHealth={envHealth}
          attentionSessions={attentionSessions}
          portsBySession={portsBySession}
          onSelectProject={setSelectedProjectId}
          onSelectSession={handleSelectSession}
          onOpenNewSession={(projId) => {
            setNewSessionProjectId(projId || selectedProjectId);
            setShowNewSession(true);
          }}
          onOpenAddProject={() => setShowAddProject(true)}
          onOpenMessaging={() => setShowMessaging(true)}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
          onKillSession={handleKillSession}
          onRestartSession={handleRestartSession}
          onReorderProjects={handleReorderProjects}
          onReorderWorkers={handleReorderTabs}
        />

        <div
          className="sidebar-resizer"
          onMouseDown={startSidebarResize}
          title="Drag to resize sidebar"
        />

        <TerminalPane
          theme={theme}
          projects={orderedProjects}
          sessions={orderedSessions}
          activeSession={activeSession}
          activeProject={activeProject}
          usage={usage}
          ptyBackend={ptyBackend}
          attentionSessions={attentionSessions}
          onPtyBackendChange={setPtyBackend}
          onSelectSession={handleSelectSession}
          onKillSession={handleKillSession}
          onRestartSession={handleRestartSession}
          onRenameSession={handleRenameSession}
          onReorderTabs={handleReorderTabs}
          onQuickLaunch={handleQuickLaunch}
          onSendSlashCommand={handleSendSlashCommand}
          onPreviewFile={(filePath, basePath, line) =>
            setFilePreviewTarget({ path: filePath, basePath, line })
          }
          onToast={showToast}
        />

        <GitDiffDrawer
          open={showGitDiff}
          project={activeProject}
          onClose={() => setShowGitDiff(false)}
          onPreviewFile={(filePath, basePath) =>
            setFilePreviewTarget({ path: filePath, basePath })
          }
        />

        <UsageHistoryDrawer
          open={showUsageHistory}
          usage={usage}
          sessions={orderedSessions}
          projects={projects}
          onClose={() => setShowUsageHistory(false)}
        />
      </div>

      {showNewSession && (
        <NewSessionModal
          projects={projects}
          defaultProjectId={newSessionProjectId}
          onClose={() => setShowNewSession(false)}
          onCreate={handleCreateSession}
        />
      )}

      {showAddProject && (
        <AddProjectModal
          onClose={() => setShowAddProject(false)}
          onAdd={handleAddProject}
        />
      )}

      {showUsageSettings && (
        <UsageSettingsModal
          config={usage?.config}
          authStatus={authStatus}
          notificationsEnabled={notificationsEnabled}
          onToggleNotifications={handleToggleNotifications}
          onAuthChanged={checkAuth}
          onClose={() => setShowUsageSettings(false)}
          onSave={handleSaveUsageConfig}
        />
      )}

      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        projects={projects}
        sessions={orderedSessions}
        theme={theme}
        onSelectProject={setSelectedProjectId}
        onSelectSession={handleSelectSession}
        onOpenNewSession={() => {
          setNewSessionProjectId(selectedProjectId);
          setShowNewSession(true);
        }}
        onToggleTheme={toggleTheme}
        onToggleGitDiff={() => {
          setShowGitDiff((v) => !v);
          setShowUsageHistory(false);
        }}
        onToggleUsageHistory={() => {
          setShowUsageHistory((v) => !v);
          setShowGitDiff(false);
        }}
        onOpenMessaging={() => setShowMessaging(true)}
        onOpenSettings={() => setShowUsageSettings(true)}
        onSendSlashCommand={handleSendSlashCommand}
        onSyncUsage={handleSyncUsage}
        onManualCompact={handleManualCompact}
      />

      <WorkerMessagingModal
        open={showMessaging}
        sessions={orderedSessions}
        projects={projects}
        activeSessionName={activeSessionName}
        onClose={() => setShowMessaging(false)}
        onSent={(entry) => showToast(`Sent message to ${entry.toLabel}`)}
      />

      <FilePreviewModal
        target={filePreviewTarget}
        onClose={() => setFilePreviewTarget(null)}
      />

      {authStatus.enabled && !authStatus.authenticated && (
        <AuthGateModal onAuthenticated={refreshAll} />
      )}

      {toast && (
        <div className="toast">
          <Sparkles size={13} color="var(--accent-primary)" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
