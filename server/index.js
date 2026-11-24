import express from 'express';
import cors from 'cors';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import {
  listProjects,
  addProject,
  removeProject,
  updateProject,
  getProjectById,
  browseDirectories,
  createDirectory,
  getGitDiff,
  createGitWorktree,
  readFileSnippet,
} from './projects.js';
import {
  checkEnvironment,
  listTmuxSessions,
  createTmuxSession,
  renameTmuxSession,
  killTmuxSession,
  restartTmuxSession,
  sendKeysToSession,
  sendCompactCommand,
  getWorkerMessages,
  sendWorkerMessage,
  getListeningPortsForSessions,
  getTmuxConfigPath,
} from './tmuxManager.js';
import {
  AUTH_COOKIE_NAME,
  getAuthCookieValue,
  getAuthStatus,
  isRequestAuthenticated,
  setAuthConfig,
  verifyToken,
} from './auth.js';
import { spawnPty } from './ptyBridge.js';
import { usageTracker } from './usageTracker.js';

const PORT = Number(process.env.PORT || 3001);
const app = express();
app.use(cors());
app.use(express.json());

// ---------- Auth Middleware & Routes ----------
app.get('/api/auth/status', (req, res) => {
  res.json(getAuthStatus(req));
});

app.post('/api/auth/login', (req, res) => {
  const { token } = req.body || {};
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Invalid PIN or token' });
  }
  const hash = getAuthCookieValue(String(token || ''));
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(hash)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
  );
  res.json({ ok: true, authenticated: true });
});

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
  res.json({ ok: true });
});

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/auth/')) {
    return next();
  }
  if (!isRequestAuthenticated(req)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
});

app.post('/api/auth/config', (req, res) => {
  try {
    const { enabled, token } = req.body || {};
    const result = setAuthConfig({ enabled: Boolean(enabled), token });
    if (result.enabled && token) {
      const hash = getAuthCookieValue(String(token).trim());
      res.setHeader(
        'Set-Cookie',
        `${AUTH_COOKIE_NAME}=${encodeURIComponent(hash)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
      );
    }
    res.json({ ok: true, enabled: result.enabled });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- REST API ----------

app.get('/api/health', async (_req, res) => {
  const env = await checkEnvironment();
  res.json({ ok: true, env, tmuxConf: getTmuxConfigPath() });
});

// Projects
app.get('/api/projects', async (_req, res) => {
  try {
    const [projects, sessions] = await Promise.all([listProjects(), listTmuxSessions()]);
    res.json({ projects, sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const project = await addProject(req.body || {});
    res.status(201).json({ project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  try {
    const result = removeProject(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/projects/:id', async (req, res) => {
  try {
    const project = await updateProject(req.params.id, req.body || {});
    res.json({ project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/fs/browse', (req, res) => {
  try {
    const data = browseDirectories(req.query.path ? String(req.query.path) : undefined);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/fs/mkdir', (req, res) => {
  try {
    const { parentPath, name } = req.body || {};
    const data = createDirectory(parentPath, name);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Tmux / agy sessions
app.get('/api/sessions', async (_req, res) => {
  try {
    const sessions = await listTmuxSessions();
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const body = req.body || {};
    let projectPath = body.projectPath;
    let projectName = body.projectName;
    if (body.projectId && !projectPath) {
      const proj = getProjectById(body.projectId);
      if (proj) {
        projectPath = proj.path;
        projectName = proj.name;
      }
    }
    if ((body.useHomeDir || !body.projectId) && !projectPath) {
      projectPath = os.homedir();
      projectName = projectName || '~';
    }
    if (body.worktreeBranch && projectPath) {
      const wt = await createGitWorktree(projectPath, body.worktreeBranch);
      projectPath = wt.path;
    }
    const session = await createTmuxSession({
      projectId: body.projectId || null,
      projectName,
      projectPath,
      label: body.label,
      kind: body.kind || 'agy',
      model: body.model || '',
      mode: body.mode || 'auto',
      effort: body.effort || 'medium',
      sandbox: Boolean(body.sandbox),
      continueLast: Boolean(body.continueLast),
      initialPrompt: body.initialPrompt || '',
    });
    res.status(201).json({ session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:tmuxName', async (req, res) => {
  try {
    const updated = await renameTmuxSession(req.params.tmuxName, req.body?.label);
    res.json({ session: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/sessions/:tmuxName', async (req, res) => {
  try {
    const result = await killTmuxSession(req.params.tmuxName);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sessions/:tmuxName/restart', async (req, res) => {
  try {
    const result = await restartTmuxSession(req.params.tmuxName);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sessions/:tmuxName/compact', async (req, res) => {
  try {
    const tmuxName = req.params.tmuxName;
    await sendCompactCommand(tmuxName);
    const usage = usageTracker.recordCompaction(tmuxName);
    broadcastEvent({
      type: 'compact',
      tmuxName,
      manual: true,
      usage,
    });
    res.json({ ok: true, usage });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sessions/:tmuxName/keys', async (req, res) => {
  try {
    const { keys, enter = true, preferAgy = false } = req.body || {};
    if (typeof keys !== 'string') {
      return res.status(400).json({ error: 'keys must be a string' });
    }
    await sendKeysToSession(req.params.tmuxName, keys, Boolean(enter), {
      preferAgy: Boolean(preferAgy),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sessions/:tmuxName/sync-usage', async (req, res) => {
  try {
    await sendKeysToSession(req.params.tmuxName, '/usage', true, { preferAgy: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sessions/:tmuxName/ack', (req, res) => {
  const usage = usageTracker.acknowledgeSession(req.params.tmuxName);
  res.json({ ok: true, usage });
});

// Git diff, file preview, ports, cross-worker messaging
app.get('/api/projects/:id/git-diff', async (req, res) => {
  try {
    const proj = getProjectById(req.params.id);
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    const diff = await getGitDiff(proj.path);
    res.json(diff);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/fs/read', (req, res) => {
  try {
    const filePath = req.query.path ? String(req.query.path) : '';
    const basePath = req.query.base ? String(req.query.base) : null;
    const line = req.query.line ? Number(req.query.line) : null;
    const data = readFileSnippet(filePath, basePath, line);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/ports', async (_req, res) => {
  try {
    const sessions = await listTmuxSessions();
    const ports = await getListeningPortsForSessions(sessions);
    res.json({ ports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workers/messages', (_req, res) => {
  res.json({ messages: getWorkerMessages() });
});

app.post('/api/workers/message', async (req, res) => {
  try {
    const { fromTmuxName, toTmuxName, message } = req.body || {};
    const entry = await sendWorkerMessage({ fromTmuxName, toTmuxName, message });
    broadcastEvent({ type: 'worker-message', entry });
    res.status(201).json({ entry });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Usage & Autocompact
app.get('/api/usage', (req, res) => {
  const session = req.query.session ? String(req.query.session) : null;
  res.json(usageTracker.getSnapshot(session));
});

app.patch('/api/usage/config', (req, res) => {
  const config = usageTracker.updateConfig(req.body || {});
  res.json({ config, snapshot: usageTracker.getSnapshot() });
});

// Serve production build if present
const distDir = path.resolve(process.cwd(), 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ---------- HTTP + WebSocket Server ----------

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const eventClients = new Set();

function broadcastEvent(payload) {
  const data = JSON.stringify(payload);
  for (const ws of eventClients) {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  }
}

usageTracker.on('update', (snapshot) => {
  broadcastEvent({ type: 'usage', snapshot });
});

usageTracker.on('session-attention', (payload) => {
  broadcastEvent({ type: 'session-attention', ...payload });
});

usageTracker.on('autocompact-trigger', async ({ tmuxName, contextPct, thresholdPct }) => {
  try {
    await sendCompactCommand(tmuxName);
    const snapshot = usageTracker.recordCompaction(tmuxName);
    broadcastEvent({
      type: 'autocompact-fired',
      tmuxName,
      contextPct,
      thresholdPct,
      snapshot,
    });
  } catch (err) {
    broadcastEvent({
      type: 'autocompact-error',
      tmuxName,
      error: err.message,
    });
  }
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/ws/terminal' || url.pathname === '/ws/events') {
    if (!isRequestAuthenticated(request, url)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, url);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', async (ws, _request, url) => {
  if (url.pathname === '/ws/events') {
    eventClients.add(ws);
    ws.send(JSON.stringify({ type: 'usage', snapshot: usageTracker.getSnapshot() }));
    ws.on('close', () => eventClients.delete(ws));
    return;
  }

  // /ws/terminal?session=<tmuxName>&cols=120&rows=34
  const tmuxName = url.searchParams.get('session');
  const cols = Number(url.searchParams.get('cols') || 120);
  const rows = Number(url.searchParams.get('rows') || 34);

  if (!tmuxName || !tmuxName.startsWith('kli_')) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid tmux session name' }));
    ws.close();
    return;
  }

  let ptyProc = null;
  try {
    ptyProc = await spawnPty('tmux', ['attach-session', '-t', tmuxName], {
      cols,
      rows,
      cwd: process.cwd(),
    });
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: `Failed to attach PTY: ${err.message}` }));
    ws.close();
    return;
  }

  const attachedAt = Date.now();
  ws.send(JSON.stringify({ type: 'ready', backend: ptyProc.backend, session: tmuxName }));

  ptyProc.onData((data) => {
    usageTracker.ingestTerminalChunk(tmuxName, data, 'output', {
      ignoreAttachBurst: Date.now() - attachedAt < 800,
    });
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'output', data }));
    }
  });

  ptyProc.onExit((exitCode) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'exit', exitCode }));
      ws.close();
    }
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString('utf-8'));
      if (msg.type === 'input' && typeof msg.data === 'string') {
        usageTracker.ingestTerminalChunk(tmuxName, msg.data, 'input');
        ptyProc.write(msg.data);
      } else if (msg.type === 'resize') {
        ptyProc.resize(Number(msg.cols || 120), Number(msg.rows || 34));
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on('close', () => {
    if (ptyProc) {
      ptyProc.kill();
    }
  });
});

server.listen(PORT, () => {
  console.log(`[KLI] Server listening on http://localhost:${PORT}`);
});
