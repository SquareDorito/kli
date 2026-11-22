import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const COOKIE_NAME = 'kli_auth';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function loadAuthConfig() {
  ensureDataDir();
  if (process.env.KLI_AUTH_TOKEN) {
    return {
      enabled: true,
      fromEnv: true,
      tokenHash: hashToken(process.env.KLI_AUTH_TOKEN),
    };
  }
  if (!fs.existsSync(AUTH_FILE)) {
    return { enabled: false, fromEnv: false, tokenHash: null };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    return {
      enabled: Boolean(parsed.enabled && parsed.tokenHash),
      fromEnv: false,
      tokenHash: parsed.tokenHash || null,
    };
  } catch {
    return { enabled: false, fromEnv: false, tokenHash: null };
  }
}

export function getAuthStatus(req) {
  const cfg = loadAuthConfig();
  return {
    enabled: cfg.enabled,
    fromEnv: cfg.fromEnv,
    authenticated: !cfg.enabled || isRequestAuthenticated(req),
  };
}

export function setAuthConfig({ enabled, token }) {
  const current = loadAuthConfig();
  if (current.fromEnv) {
    throw new Error('Auth is controlled by KLI_AUTH_TOKEN environment variable');
  }
  ensureDataDir();
  if (!enabled) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ enabled: false, tokenHash: null }, null, 2));
    return { enabled: false, fromEnv: false };
  }
  if (!token || String(token).trim().length < 4) {
    throw new Error('PIN / token must be at least 4 characters');
  }
  const tokenHash = hashToken(String(token).trim());
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ enabled: true, tokenHash }, null, 2));
  return { enabled: true, fromEnv: false, tokenHash };
}

export function parseCookies(cookieHeader) {
  const map = {};
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    map[k] = v;
  }
  return map;
}

export function extractTokenFromRequest(req, urlObj = null) {
  const authHeader = req.headers?.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (urlObj && urlObj.searchParams?.get('token')) {
    return urlObj.searchParams.get('token').trim();
  }
  const cookies = parseCookies(req.headers?.cookie || '');
  if (cookies[COOKIE_NAME]) {
    return cookies[COOKIE_NAME];
  }
  return null;
}

export function verifyToken(rawToken) {
  const cfg = loadAuthConfig();
  if (!cfg.enabled) return true;
  if (!rawToken) return false;
  return hashToken(rawToken) === cfg.tokenHash;
}

export function isRequestAuthenticated(req, urlObj = null) {
  const cfg = loadAuthConfig();
  if (!cfg.enabled) return true;
  const candidate = extractTokenFromRequest(req, urlObj);
  if (!candidate) return false;
  // Cookie stores tokenHash directly so raw token isn't echoed in cookies
  const cookies = parseCookies(req.headers?.cookie || '');
  if (cookies[COOKIE_NAME] && cookies[COOKIE_NAME] === cfg.tokenHash) {
    return true;
  }
  return hashToken(candidate) === cfg.tokenHash;
}

export function getAuthCookieValue(rawToken) {
  return hashToken(rawToken);
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
