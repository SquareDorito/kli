import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function slugify(str) {
  return String(str || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'project';
}

export function expandHome(p) {
  if (!p) return process.cwd();
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  if (p === '~') return os.homedir();
  return path.resolve(p);
}

export function compactPath(p) {
  const home = os.homedir();
  if (p && p.startsWith(home)) {
    return '~' + p.slice(home.length);
  }
  return p || '';
}

function readGitBranchFallback(dirPath) {
  try {
    const headPath = path.join(dirPath, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const content = fs.readFileSync(headPath, 'utf-8').trim();
      const match = content.match(/^ref:\s+refs\/heads\/(.+)$/);
      if (match) return match[1];
      return content.slice(0, 8);
    }
  } catch {
    // ignore
  }
  return null;
}

export async function getGitInfo(dirPath) {
  const exists = fs.existsSync(dirPath);
  if (!exists) {
    return { exists: false, isGit: false, branch: null, dirtyCount: 0 };
  }

  let branch = readGitBranchFallback(dirPath);
  let dirtyCount = 0;
  let isGit = Boolean(branch);

  try {
    const { stdout: branchOut } = await execFileAsync(
      'git',
      ['-C', dirPath, 'rev-parse', '--abbrev-ref', 'HEAD'],
      { timeout: 1500 }
    );
    branch = branchOut.trim() || branch;
    isGit = true;

    const { stdout: statusOut } = await execFileAsync(
      'git',
      ['-C', dirPath, 'status', '--porcelain'],
      { timeout: 1500 }
    );
    dirtyCount = statusOut
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean).length;
  } catch {
    // Fallback to .git/HEAD if git binary is unavailable
  }

  return { exists, isGit, branch, dirtyCount };
}

function loadRawProjects() {
  ensureDataDir();
  if (!fs.existsSync(PROJECTS_FILE)) {
    const defaultDir = process.cwd();
    const initial = [
      {
        id: 'proj_' + slugify(path.basename(defaultDir)),
        name: path.basename(defaultDir) || 'Workspace',
        path: defaultDir,
        color: '#00ffff',
        createdAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRawProjects(projects) {
  ensureDataDir();
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

const PROJECT_COLORS = [
  '#00ffff',
  '#0087af',
  '#5fd787',
  '#5fd7ff',
  '#afafff',
  '#ffd75f',
  '#ff5f5f',
];

export async function listProjects() {
  const raw = loadRawProjects();
  const enriched = await Promise.all(
    raw.map(async (proj) => {
      const git = await getGitInfo(proj.path);
      return {
        ...proj,
        displayPath: compactPath(proj.path),
        ...git,
      };
    })
  );
  return enriched;
}

export function getProjectById(id) {
  return loadRawProjects().find((p) => p.id === id) || null;
}

export async function addProject({ name, path: rawPath, color }) {
  const resolved = expandHome(rawPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolved}`);
  }

  const projects = loadRawProjects();
  const existing = projects.find((p) => p.path === resolved);
  if (existing) {
    const git = await getGitInfo(existing.path);
    return { ...existing, displayPath: compactPath(existing.path), ...git };
  }

  const projName = (name && name.trim()) || path.basename(resolved) || 'Project';
  const newProj = {
    id: 'proj_' + slugify(projName) + '_' + crypto.randomBytes(2).toString('hex'),
    name: projName,
    path: resolved,
    color: color || PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
    createdAt: new Date().toISOString(),
  };

  projects.push(newProj);
  saveRawProjects(projects);

  const git = await getGitInfo(newProj.path);
  return { ...newProj, displayPath: compactPath(newProj.path), ...git };
}

export function removeProject(id) {
  const projects = loadRawProjects();
  const next = projects.filter((p) => p.id !== id);
  saveRawProjects(next);
  return { removed: projects.length !== next.length };
}

export function browseDirectories(rawDir) {
  const target = expandHome(rawDir || os.homedir());
  if (!fs.existsSync(target)) {
    throw new Error(`Path not found: ${target}`);
  }
  const entries = fs.readdirSync(target, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => ({
      name: e.name,
      path: path.join(target, e.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    current: target,
    displayCurrent: compactPath(target),
    parent: path.dirname(target) !== target ? path.dirname(target) : null,
    directories: dirs,
  };
}

export async function getGitDiff(projectPath) {
  if (!projectPath || !fs.existsSync(projectPath)) {
    throw new Error('Project path does not exist');
  }
  const git = await getGitInfo(projectPath);
  if (!git.isGit) {
    return { isGit: false, branch: null, files: [], diff: '' };
  }

  let files = [];
  let diff = '';
  try {
    const { stdout: statusOut } = await execFileAsync(
      'git',
      ['-C', projectPath, 'status', '--porcelain'],
      { timeout: 3000 }
    );
    files = statusOut
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => ({
        status: line.slice(0, 2).trim() || 'M',
        path: line.slice(3).trim(),
      }));
  } catch {
    files = [];
  }

  try {
    const [{ stdout: unstaged }, { stdout: staged }] = await Promise.all([
      execFileAsync('git', ['-C', projectPath, 'diff', '--no-color'], {
        timeout: 4000,
        maxBuffer: 512 * 1024,
      }),
      execFileAsync('git', ['-C', projectPath, 'diff', '--cached', '--no-color'], {
        timeout: 4000,
        maxBuffer: 512 * 1024,
      }),
    ]);
    diff = [staged, unstaged].filter(Boolean).join('\n').slice(0, 200_000);
  } catch {
    diff = '';
  }

  return {
    isGit: true,
    branch: git.branch,
    dirtyCount: files.length,
    files,
    diff,
  };
}

export async function createGitWorktree(projectPath, branchName) {
  if (!projectPath || !fs.existsSync(projectPath)) {
    throw new Error('Project path does not exist');
  }
  const cleanBranch = String(branchName || '')
    .trim()
    .replace(/[^a-zA-Z0-9._/-]+/g, '-');
  if (!cleanBranch) {
    throw new Error('Branch name is required for git worktree');
  }
  const worktreeSlug = slugify(cleanBranch);
  const worktreesDir = path.join(path.dirname(projectPath), '.kli-worktrees');
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }
  const targetDir = path.join(
    worktreesDir,
    `${path.basename(projectPath)}-${worktreeSlug}-${crypto.randomBytes(2).toString('hex')}`
  );

  try {
    await execFileAsync(
      'git',
      ['-C', projectPath, 'worktree', 'add', '-b', cleanBranch, targetDir],
      { timeout: 10000 }
    );
  } catch {
    // Fallback if branch already exists
    await execFileAsync(
      'git',
      ['-C', projectPath, 'worktree', 'add', targetDir, cleanBranch],
      { timeout: 10000 }
    );
  }

  return { path: targetDir, branch: cleanBranch };
}

export function readFileSnippet(rawPath, basePath = null, line = null) {
  if (!rawPath) throw new Error('File path is required');
  let resolved = rawPath;
  if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(basePath || process.cwd(), rawPath);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory: ${resolved}`);
  }
  if (stat.size > 512 * 1024) {
    throw new Error('File too large to preview (>512KB)');
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  const lines = content.split('\n');
  const targetLine = line ? Math.max(1, Math.min(lines.length, Number(line))) : 1;
  const start = line ? Math.max(1, targetLine - 100) : 1;
  const end = line ? Math.min(lines.length, targetLine + 200) : Math.min(lines.length, 400);
  return {
    path: resolved,
    displayPath: compactPath(resolved),
    totalLines: lines.length,
    startLine: start,
    endLine: end,
    highlightLine: line ? targetLine : null,
    content: lines.slice(start - 1, end).join('\n'),
  };
}
