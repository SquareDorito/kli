import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { slugify } from './projects.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMUX_CONF = path.join(__dirname, 'tmux', 'kli-tmux.conf');
const DATA_DIR = path.resolve(process.cwd(), 'data');
const SESSIONS_META_FILE = path.join(DATA_DIR, 'sessions.json');

const SESSION_PREFIX = 'kli_';
const WORKER_CODENAMES = [
  'atlas', 'vega', 'nova', 'pulse', 'orion', 'flux', 'spark', 'echo',
  'zenith', 'kestrel', 'cobalt', 'cipher', 'lyra', 'rigel', 'draco', 'helix',
  'quill', 'stride', 'beacon', 'prism', 'apex', 'nimbus', 'vertex', 'solis',
];

function generateUniqueWorkerName(existingLabels = []) {
  const taken = new Set(existingLabels.map((l) => String(l || '').toLowerCase()));
  for (const name of WORKER_CODENAMES) {
    if (!taken.has(name)) return name;
  }
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `worker-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `worker-${crypto.randomBytes(2).toString('hex')}`;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSessionMeta() {
  ensureDataDir();
  if (!fs.existsSync(SESSIONS_META_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_META_FILE, 'utf-8')) || {};
  } catch {
    return {};
  }
}

function saveSessionMeta(meta) {
  ensureDataDir();
  fs.writeFileSync(SESSIONS_META_FILE, JSON.stringify(meta, null, 2));
}

export function getSessionMeta(tmuxName) {
  const all = loadSessionMeta();
  return all[tmuxName] || null;
}

export function updateSessionMeta(tmuxName, patch) {
  const all = loadSessionMeta();
  all[tmuxName] = { ...(all[tmuxName] || {}), ...patch };
  saveSessionMeta(all);
  return all[tmuxName];
}

function shellQuote(arg) {
  return `'${String(arg).replace(/'/g, `'\\''`)}'`;
}

export async function checkEnvironment() {
  const result = { tmux: null, agy: null };
  try {
    const { stdout } = await execFileAsync('tmux', ['-V'], { timeout: 2000 });
    result.tmux = stdout.trim();
  } catch {
    result.tmux = null;
  }

  try {
    const { stdout } = await execFileAsync('which', ['agy'], { timeout: 2000 });
    result.agy = stdout.trim();
  } catch {
    const fallback = path.join(process.env.HOME || '', '.local', 'bin', 'agy');
    result.agy = fs.existsSync(fallback) ? fallback : null;
  }
  return result;
}

async function listTmuxPanesBySession() {
  const bySession = new Map();
  try {
    const format = [
      '#{session_name}',
      '#{pane_id}',
      '#{pane_active}',
      '#{pane_current_command}',
      '#{pane_current_path}',
      '#{pane_pid}',
    ].join('\t');
    const { stdout } = await execFileAsync('tmux', ['list-panes', '-a', '-F', format], {
      timeout: 2500,
    });
    for (const raw of stdout.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const [sessionName, paneId, active, command, currentPath, pid] = line.split('\t');
      if (!sessionName?.startsWith(SESSION_PREFIX)) continue;
      if (!bySession.has(sessionName)) bySession.set(sessionName, []);
      bySession.get(sessionName).push({
        paneId,
        active: active === '1',
        command: command || '',
        currentPath: currentPath || '',
        pid: pid ? Number(pid) : null,
      });
    }
  } catch {
    // ignore
  }
  return bySession;
}

export async function listTmuxSessions() {
  const metaAll = loadSessionMeta();
  try {
    const format = [
      '#{session_name}',
      '#{session_created}',
      '#{session_attached}',
      '#{session_windows}',
      '#{pane_current_path}',
      '#{pane_current_command}',
    ].join('\t');

    const [{ stdout }, panesMap] = await Promise.all([
      execFileAsync('tmux', ['list-sessions', '-F', format], { timeout: 2500 }),
      listTmuxPanesBySession(),
    ]);

    const sessions = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, created, attached, windows, currentPath, currentCommand] = line.split('\t');
        const meta = metaAll[name] || {};
        const panes = panesMap.get(name) || [];
        const agyPanes = panes.filter((p) => /agy/i.test(p.command));
        return {
          tmuxName: name,
          isKli: name.startsWith(SESSION_PREFIX),
          label: meta.label || name.replace(/^kli_/, ''),
          projectId: meta.projectId || null,
          projectPath: meta.projectPath || currentPath || process.cwd(),
          currentPath: currentPath || meta.projectPath || process.cwd(),
          currentCommand: currentCommand || 'agy',
          model: meta.model || 'default',
          mode: meta.mode || 'auto',
          effort: meta.effort || 'medium',
          sandbox: Boolean(meta.sandbox),
          kind: meta.kind || 'agy',
          attached: attached === '1',
          windows: Number(windows || 1),
          panes,
          paneCount: panes.length || 1,
          agyPaneCount: agyPanes.length,
          createdAt: created
            ? new Date(Number(created) * 1000).toISOString()
            : meta.createdAt || new Date().toISOString(),
        };
      })
      .filter((s) => s.isKli);

    return sessions;
  } catch {
    // No tmux server running yet
    return [];
  }
}

async function buildLaunchCommand({
  kind = 'agy',
  model = '',
  mode = 'auto',
  effort = 'medium',
  sandbox = false,
  continueLast = false,
  initialPrompt = '',
} = {}) {
  if (kind === 'shell') {
    return process.env.SHELL || '/bin/zsh';
  }
  const envInfo = await checkEnvironment();
  const agyBin = envInfo.agy || 'agy';
  const args = [agyBin];
  if (model && model !== 'default') {
    args.push('--model', model);
  }
  if (mode && ['auto', 'plan', 'accept-edits'].includes(mode)) {
    args.push('--mode', mode);
  }
  if (effort && ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
    args.push('--effort', effort);
  }
  if (sandbox) {
    args.push('--sandbox');
  }
  if (continueLast) {
    args.push('--continue');
  }
  if (initialPrompt && initialPrompt.trim()) {
    args.push('-i', initialPrompt.trim());
  }
  // Keep pane alive in an interactive shell if agy exits so the user can inspect output or relaunch
  const agyLine = args.map(shellQuote).join(' ');
  const userShell = process.env.SHELL || '/bin/zsh';
  return `${userShell} -lc ${shellQuote(`${agyLine}; echo ""; echo "[agy exited — press Enter for shell or run agy again]"; exec ${userShell}`)}`;
}

export async function createTmuxSession({
  projectId,
  projectName,
  projectPath,
  label,
  kind = 'agy',
  model = '',
  mode = 'auto',
  effort = 'medium',
  sandbox = false,
  continueLast = false,
  initialPrompt = '',
}) {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : process.cwd();
  const baseSlug = slugify(label || projectName || path.basename(cwd));
  const suffix = crypto.randomBytes(2).toString('hex');
  const tmuxName = `${SESSION_PREFIX}${baseSlug}_${suffix}`;

  const launchCmd = await buildLaunchCommand({
    kind,
    model,
    mode,
    effort,
    sandbox,
    continueLast,
    initialPrompt,
  });

  // Create detached tmux session with our Claude Code-styled config
  await execFileAsync(
    'tmux',
    [
      '-f',
      TMUX_CONF,
      'new-session',
      '-d',
      '-s',
      tmuxName,
      '-c',
      cwd,
      '-x',
      '140',
      '-y',
      '38',
      launchCmd,
    ],
    {
      timeout: 5000,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    }
  );

  // Also apply config to running server in case tmux server was already started earlier
  try {
    await execFileAsync('tmux', ['source-file', TMUX_CONF], { timeout: 2000 });
  } catch {
    // ignore
  }

  const existingSessions = await listTmuxSessions();
  const existingLabels = existingSessions.map((s) => s.label);
  const projPrefix = (projectName || path.basename(cwd) || '').trim();
  const baseLabel =
    label && label.trim() ? label.trim() : generateUniqueWorkerName(existingLabels);
  let workerLabel =
    projPrefix && !baseLabel.toLowerCase().startsWith(`${projPrefix.toLowerCase()} `)
      ? `${projPrefix} ${baseLabel}`
      : baseLabel;
  if (existingLabels.some((l) => l.toLowerCase() === workerLabel.toLowerCase())) {
    workerLabel = `${workerLabel}-${crypto.randomBytes(1).toString('hex')}`;
  }

  const meta = {
    tmuxName,
    label: workerLabel,
    projectId: projectId || null,
    projectPath: cwd,
    kind,
    model: model || 'default',
    mode: mode || 'auto',
    effort: effort || 'medium',
    sandbox: Boolean(sandbox),
    createdAt: new Date().toISOString(),
  };

  updateSessionMeta(tmuxName, meta);
  return meta;
}

export async function renameTmuxSession(tmuxName, label) {
  if (!tmuxName || !tmuxName.startsWith(SESSION_PREFIX)) {
    throw new Error('Invalid KLI tmux session name');
  }
  const trimmed = String(label || '').trim();
  if (!trimmed) throw new Error('Session name cannot be empty');
  const existing = await listTmuxSessions();
  if (
    existing.some(
      (s) => s.tmuxName !== tmuxName && s.label.toLowerCase() === trimmed.toLowerCase()
    )
  ) {
    throw new Error(`Worker name "${trimmed}" is already in use`);
  }
  const updated = updateSessionMeta(tmuxName, { label: trimmed });
  return updated;
}

export async function killTmuxSession(tmuxName) {
  if (!tmuxName || !tmuxName.startsWith(SESSION_PREFIX)) {
    throw new Error('Invalid KLI tmux session name');
  }
  try {
    await execFileAsync('tmux', ['kill-session', '-t', tmuxName], { timeout: 3000 });
  } catch {
    // already gone
  }
  const all = loadSessionMeta();
  delete all[tmuxName];
  saveSessionMeta(all);
  return { killed: tmuxName };
}

export async function restartTmuxSession(tmuxName) {
  if (!tmuxName || !tmuxName.startsWith(SESSION_PREFIX)) {
    throw new Error('Invalid KLI tmux session name');
  }
  const sessions = await listTmuxSessions();
  const sess = sessions.find((s) => s.tmuxName === tmuxName);
  if (!sess) {
    throw new Error('Worker session is not running');
  }
  const meta = loadSessionMeta()[tmuxName] || {};
  const cwd =
    (meta.projectPath && fs.existsSync(meta.projectPath) && meta.projectPath) ||
    (sess.currentPath && fs.existsSync(sess.currentPath) && sess.currentPath) ||
    process.cwd();

  const launchCmd = await buildLaunchCommand({
    kind: meta.kind || 'agy',
    model: meta.model || '',
    mode: meta.mode || 'auto',
    effort: meta.effort || 'medium',
    sandbox: Boolean(meta.sandbox),
    continueLast: true,
  });

  const target = await resolveTargetPane(tmuxName, true);
  await execFileAsync(
    'tmux',
    ['respawn-pane', '-k', '-t', target, '-c', cwd, launchCmd],
    {
      timeout: 5000,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    }
  );

  updateSessionMeta(tmuxName, { restartedAt: new Date().toISOString() });
  return { restarted: tmuxName, target };
}

/**
 * Inspects the bottom lines of each live tmux session's active/agy pane
 * to reconcile stale 'green' / 'red' statuses on page load or manual refresh.
 */
export async function reconcileSessionStatuses(sessions, usageTracker) {
  if (!Array.isArray(sessions) || !sessions.length || !usageTracker) return;
  const snap = usageTracker.getSnapshot();
  await Promise.all(
    sessions.map(async (sess) => {
      try {
        const target = await resolveTargetPane(sess.tmuxName, true);
        const { stdout } = await execFileAsync(
          'tmux',
          ['capture-pane', '-p', '-t', target, '-S', '-25'],
          { timeout: 1500 }
        );
        const lines = stdout
          .split('\n')
          .map((l) => l.trimEnd())
          .filter(Boolean);
        const tail = lines.slice(-12).join('\n');
        const bottom = lines.slice(-4).join('\n');
        const curStatus = snap.sessions?.[sess.tmuxName]?.status || 'grey';

        const isWorking = /(?:esc\s+to\s+(?:cancel|interrupt)|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏])/i.test(tail);
        if (isWorking) {
          if (curStatus !== 'green') {
            usageTracker.setSessionStatus(sess.tmuxName, 'green', { source: 'reconcile' });
          }
          return;
        }

        const isIdlePrompt =
          /\?\s+for\s+shortcuts/i.test(bottom) ||
          /^(?:zsh|bash|fish)$/i.test(sess.currentCommand || '');

        const isRed =
          !isIdlePrompt &&
          /(?:\[y\/N\]|\[Y\/n\]|\(y\/n\)|Allow\s+(?:once|always)|Press Enter to continue|Waiting for (?:user|approval)|\[agy exited —)/i.test(
            bottom
          );
        if (isRed) {
          if (curStatus !== 'red') {
            usageTracker.setSessionStatus(sess.tmuxName, 'red', { source: 'reconcile' });
          }
          return;
        }

        if (isIdlePrompt && (curStatus === 'green' || curStatus === 'red')) {
          usageTracker.setSessionStatus(
            sess.tmuxName,
            curStatus === 'green' ? 'blue' : 'grey',
            { source: 'reconcile' }
          );
        }
      } catch {
        // ignore transient capture errors
      }
    })
  );
}

async function resolveTargetPane(tmuxName, preferAgy = false) {
  if (!preferAgy) return tmuxName;
  try {
    const panesMap = await listTmuxPanesBySession();
    const panes = panesMap.get(tmuxName) || [];
    const activeAgy = panes.find((p) => p.active && /agy/i.test(p.command));
    if (activeAgy) return activeAgy.paneId;
    const anyAgy = panes.find((p) => /agy/i.test(p.command));
    if (anyAgy) return anyAgy.paneId;
  } catch {
    // fallback to session target
  }
  return tmuxName;
}

export async function sendKeysToSession(
  tmuxName,
  keys,
  pressEnter = true,
  { paneId = null, preferAgy = false } = {}
) {
  if (!tmuxName || !tmuxName.startsWith(SESSION_PREFIX)) {
    throw new Error('Invalid KLI tmux session name');
  }
  const target = paneId || (await resolveTargetPane(tmuxName, preferAgy));
  const args = ['send-keys', '-t', target, keys];
  if (pressEnter) args.push('Enter');
  await execFileAsync('tmux', args, { timeout: 2000 });
  return { ok: true, target };
}

export async function sendCompactCommand(tmuxName) {
  return sendKeysToSession(tmuxName, '/compact', true, { preferAgy: true });
}

const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

export function getWorkerMessages() {
  ensureDataDir();
  if (!fs.existsSync(MESSAGES_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
    return Array.isArray(parsed) ? parsed.slice(-100) : [];
  } catch {
    return [];
  }
}

export async function sendWorkerMessage({ fromTmuxName, toTmuxName, message }) {
  if (!toTmuxName || !toTmuxName.startsWith(SESSION_PREFIX)) {
    throw new Error('Invalid target worker session');
  }
  const cleanMsg = String(message || '').trim();
  if (!cleanMsg) throw new Error('Message cannot be empty');

  const sessions = await listTmuxSessions();
  const fromSess = sessions.find((s) => s.tmuxName === fromTmuxName);
  const toSess = sessions.find((s) => s.tmuxName === toTmuxName);
  if (!toSess) throw new Error('Target worker session is not running');

  const senderLabel = fromSess ? fromSess.label : 'coordinator';
  const formatted = `[Message from ${senderLabel}]: ${cleanMsg}`;
  await sendKeysToSession(toTmuxName, formatted, true, { preferAgy: true });

  const entry = {
    id: crypto.randomBytes(4).toString('hex'),
    ts: Date.now(),
    fromTmuxName: fromTmuxName || 'ui',
    fromLabel: senderLabel,
    toTmuxName,
    toLabel: toSess.label,
    message: cleanMsg,
  };

  const history = getWorkerMessages();
  history.push(entry);
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(history.slice(-100), null, 2));
  return entry;
}

export async function getListeningPortsForSessions(sessions) {
  if (!sessions || sessions.length === 0) return {};
  try {
    const [{ stdout: psOut }, { stdout: lsofOut }] = await Promise.all([
      execFileAsync('ps', ['-eo', 'pid=,ppid='], { timeout: 2000 }),
      execFileAsync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { timeout: 2500 }),
    ]);

    const childrenMap = new Map();
    for (const line of psOut.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const pid = Number(parts[0]);
      const ppid = Number(parts[1]);
      if (!childrenMap.has(ppid)) childrenMap.set(ppid, []);
      childrenMap.get(ppid).push(pid);
    }

    const collectDescendants = (rootPid) => {
      const set = new Set([rootPid]);
      const queue = [rootPid];
      while (queue.length > 0) {
        const cur = queue.shift();
        for (const child of childrenMap.get(cur) || []) {
          if (!set.has(child)) {
            set.add(child);
            queue.push(child);
          }
        }
      }
      return set;
    };

    const pidToPorts = new Map();
    for (const line of lsofOut.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 9) continue;
      const command = parts[0];
      if (/^agy$/i.test(command)) continue;
      const pid = Number(parts[1]);
      const nameCol = parts[8] || '';
      const portMatch = nameCol.match(/:(\d+)$/);
      if (!portMatch) continue;
      const port = Number(portMatch[1]);
      if (port >= 49152) continue;
      if (!pidToPorts.has(pid)) pidToPorts.set(pid, []);
      pidToPorts.get(pid).push({ port, command });
    }

    const result = {};
    for (const sess of sessions) {
      const ports = [];
      const seen = new Set();
      for (const pane of sess.panes || []) {
        if (!pane.pid) continue;
        const tree = collectDescendants(pane.pid);
        for (const pid of tree) {
          for (const item of pidToPorts.get(pid) || []) {
            if (!seen.has(item.port)) {
              seen.add(item.port);
              ports.push(item);
            }
          }
        }
      }
      if (ports.length > 0) {
        result[sess.tmuxName] = ports.sort((a, b) => a.port - b.port);
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getTmuxConfigPath() {
  return TMUX_CONF;
}
