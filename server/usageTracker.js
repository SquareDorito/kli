import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
}

const DEFAULT_CONFIG = {
  autocompactEnabled: true,
  autocompactThresholdPct: 80,
  autocompactCooldownSec: 120,
};

// Internal fallback baselines used only until real /usage or status output is parsed
const FALLBACK_CONTEXT_WINDOW = 200000;
const FALLBACK_FIVE_HOUR_TOKENS = 2500000;
const FALLBACK_DAILY_TOKENS = 8000000;
const FALLBACK_WEEKLY_TOKENS = 40000000;

function loadState() {
  ensureDataDir();
  if (!fs.existsSync(USAGE_FILE)) {
    return {
      config: { ...DEFAULT_CONFIG },
      events: [],
      parsedQuotas: {
        fiveHourPct: null,
        fiveHourResetText: null,
        dailyPct: null,
        dailyResetText: null,
        weeklyPct: null,
        weeklyResetText: null,
        updatedAt: 0,
      },
      sessions: {},
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
    const rawSessions = parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {};
    for (const key of Object.keys(rawSessions)) {
      if (rawSessions[key]?.status === 'green') {
        rawSessions[key].status = 'grey';
      }
    }
    return {
      config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
      events: Array.isArray(parsed.events) ? parsed.events : [],
      parsedQuotas: {
        fiveHourPct: null,
        fiveHourResetText: null,
        dailyPct: null,
        dailyResetText: null,
        weeklyPct: null,
        weeklyResetText: null,
        updatedAt: 0,
        ...(parsed.parsedQuotas || {}),
      },
      sessions: rawSessions,
    };
  } catch {
    return {
      config: { ...DEFAULT_CONFIG },
      events: [],
      parsedQuotas: {
        fiveHourPct: null,
        fiveHourResetText: null,
        dailyPct: null,
        dailyResetText: null,
        weeklyPct: null,
        weeklyResetText: null,
        updatedAt: 0,
      },
      sessions: {},
    };
  }
}

class UsageTracker extends EventEmitter {
  constructor() {
    super();
    this.state = loadState();
    this._recentBuffers = new Map(); // tmuxName -> rolling stripped output for multi-line /usage parsing
    this._idleTimers = new Map(); // tmuxName -> timer to mark turn completed (blue)
    this._saveTimer = null;
  }

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        ensureDataDir();
        const cutoff = Date.now() - ONE_WEEK_MS;
        this.state.events = this.state.events.filter((e) => e.ts >= cutoff);
        fs.writeFileSync(USAGE_FILE, JSON.stringify(this.state, null, 2));
      } catch {
        // ignore disk write issues
      }
    }, 1000);
  }

  _ensureSession(tmuxName) {
    if (!this.state.sessions[tmuxName]) {
      this.state.sessions[tmuxName] = {
        contextTokens: 0,
        contextWindowTokens: FALLBACK_CONTEXT_WINDOW,
        contextPct: 0,
        totalTokens: 0,
        costUsd: 0,
        model: null,
        mode: null,
        compactions: 0,
        lastCompactAt: 0,
        status: 'grey',
        lastRedAt: 0,
        source: 'estimated',
      };
    }
    return this.state.sessions[tmuxName];
  }

  getConfig() {
    return { ...this.state.config };
  }

  updateConfig(patch) {
    const next = { ...this.state.config };
    if (typeof patch.autocompactEnabled === 'boolean') {
      next.autocompactEnabled = patch.autocompactEnabled;
    }
    if (typeof patch.autocompactThresholdPct === 'number') {
      next.autocompactThresholdPct = Math.min(
        95,
        Math.max(20, Math.round(patch.autocompactThresholdPct))
      );
    }
    this.state.config = next;
    this._scheduleSave();
    this.emit('update', this.getSnapshot());
    return this.getConfig();
  }

  /**
   * Parses live agy CLI output & /usage tables to automatically deduce
   * context window %, 5-hour quota %, and daily/weekly quota %.
   */
  ingestTerminalChunk(tmuxName, rawChunk, direction = 'output', options = {}) {
    if (!tmuxName || !rawChunk) return;
    const isAttachBurst = Boolean(options?.ignoreAttachBurst);
    const clean = stripAnsi(rawChunk);
    if (!clean.trim()) return;

    const sess = this._ensureSession(tmuxName);
    const cfg = this.state.config;
    let changed = false;

    // Maintain a 2.5KB rolling window for multi-line /usage output
    const prevBuf = this._recentBuffers.get(tmuxName) || '';
    const rolling = (prevBuf + clean).slice(-2500);
    this._recentBuffers.set(tmuxName, rolling);

    // 1. Deduce Context % from status lines or /usage
    const ctxPctMatch = clean.match(
      /(?:context(?:\s+window)?|ctx)\s*[:=\-]?\s*(\d{1,3}(?:\.\d+)?)\s*%|(\d{1,3}(?:\.\d+)?)\s*%\s*(?:context|ctx|of context|used)/i
    );
    if (ctxPctMatch) {
      const pct = parseFloat(ctxPctMatch[1] || ctxPctMatch[2]);
      if (!Number.isNaN(pct) && pct >= 0 && pct <= 100) {
        sess.contextPct = Math.round(pct * 10) / 10;
        const win = sess.contextWindowTokens || FALLBACK_CONTEXT_WINDOW;
        sess.contextTokens = Math.round((pct / 100) * win);
        sess.source = 'parsed';
        changed = true;
      }
    }

    // 2. Deduce Context used / max tokens (e.g. "45.2k / 200k tokens" or "120k / 1M")
    const fracMatch = clean.match(
      /(\d+(?:\.\d+)?)\s*([kKmM])?\s*\/\s*(\d+(?:\.\d+)?)\s*([kKmM])?\s*(?:tokens?|tok|ctx)/i
    );
    if (fracMatch) {
      const mult = (u) =>
        u && u.toLowerCase() === 'm' ? 1_000_000 : u && u.toLowerCase() === 'k' ? 1_000 : 1;
      const used = Math.round(parseFloat(fracMatch[1]) * mult(fracMatch[2]));
      const max = Math.round(parseFloat(fracMatch[3]) * mult(fracMatch[4]));
      if (max > 0 && used >= 0) {
        sess.contextTokens = used;
        sess.contextWindowTokens = max;
        sess.contextPct = Math.min(100, Math.round((used / max) * 1000) / 10);
        sess.source = 'parsed';
        changed = true;
      }
    }

    // 3. Deduce 5-hour / session quota from /usage output
    const fiveHrMatch = rolling.match(
      /(?:5[\s-]*h(?:our|r)?|current\s+session|session\s+limit)[\s\S]{0,120}?(\d{1,3}(?:\.\d+)?)\s*%(?:\s*(?:used|remaining|left))?/i
    );
    if (fiveHrMatch) {
      let pct = parseFloat(fiveHrMatch[1]);
      if (!Number.isNaN(pct) && pct >= 0 && pct <= 100) {
        if (/remaining|left/i.test(fiveHrMatch[0])) pct = Math.max(0, 100 - pct);
        const resetMatch = rolling
          .slice(rolling.lastIndexOf(fiveHrMatch[0]))
          .match(/resets?\s+(?:in\s+)?([0-9hm:\s]+(?:am|pm)?)/i);
        this.state.parsedQuotas.fiveHourPct = Math.round(pct * 10) / 10;
        if (resetMatch) this.state.parsedQuotas.fiveHourResetText = resetMatch[1].trim();
        this.state.parsedQuotas.updatedAt = Date.now();
        changed = true;
      }
    }

    // 4. Deduce Daily / 24h quota from /usage output
    const dailyMatch = rolling.match(
      /(?:daily|24[\s-]*h(?:our|r)?)[\s\S]{0,120}?(\d{1,3}(?:\.\d+)?)\s*%(?:\s*(?:used|remaining|left))?/i
    );
    if (dailyMatch) {
      let pct = parseFloat(dailyMatch[1]);
      if (!Number.isNaN(pct) && pct >= 0 && pct <= 100) {
        if (/remaining|left/i.test(dailyMatch[0])) pct = Math.max(0, 100 - pct);
        const resetMatch = rolling
          .slice(rolling.lastIndexOf(dailyMatch[0]))
          .match(/resets?\s+(?:in\s+)?([a-z0-9hm:\s,]+(?:am|pm)?)/i);
        this.state.parsedQuotas.dailyPct = Math.round(pct * 10) / 10;
        if (resetMatch) this.state.parsedQuotas.dailyResetText = resetMatch[1].trim();
        this.state.parsedQuotas.updatedAt = Date.now();
        changed = true;
      }
    }

    // 4b. Deduce Weekly / 7d quota from /usage output
    const weeklyMatch = rolling.match(
      /(?:weekly|7[\s-]*d(?:ay|ays)?|all\s+models)[\s\S]{0,120}?(\d{1,3}(?:\.\d+)?)\s*%(?:\s*(?:used|remaining|left))?/i
    );
    if (weeklyMatch) {
      let pct = parseFloat(weeklyMatch[1]);
      if (!Number.isNaN(pct) && pct >= 0 && pct <= 100) {
        if (/remaining|left/i.test(weeklyMatch[0])) pct = Math.max(0, 100 - pct);
        const resetMatch = rolling
          .slice(rolling.lastIndexOf(weeklyMatch[0]))
          .match(/resets?\s+(?:in\s+)?([a-z0-9dhm:\s,]+(?:am|pm)?)/i);
        this.state.parsedQuotas.weeklyPct = Math.round(pct * 10) / 10;
        if (resetMatch) this.state.parsedQuotas.weeklyResetText = resetMatch[1].trim();
        this.state.parsedQuotas.updatedAt = Date.now();
        changed = true;
      }
    }

    // 5. Detect model name hints
    const modelMatch = clean.match(/\b(gemini-[a-z0-9.-]+|claude-[a-z0-9.-]+)\b/i);
    if (modelMatch && modelMatch[1]) {
      sess.model = modelMatch[1];
      changed = true;
    }

    // 6. Detect cost hints like "$0.14"
    const costMatch = clean.match(/\$(\d+\.\d{2,4})/);
    if (costMatch) {
      const parsedCost = parseFloat(costMatch[1]);
      if (!Number.isNaN(parsedCost) && parsedCost < 1000) {
        sess.costUsd = parsedCost;
        changed = true;
      }
    }

    // 7. Detect compaction confirmation
    if (/(?:compacted|conversation compacted|context compacted)/i.test(clean)) {
      const win = sess.contextWindowTokens || FALLBACK_CONTEXT_WINDOW;
      sess.contextTokens = Math.round(sess.contextTokens * 0.22);
      sess.contextPct = Math.min(100, Math.round((sess.contextTokens / win) * 1000) / 10);
      sess.compactions += 1;
      sess.lastCompactAt = Date.now();
      changed = true;
    }

    // 8. Lightweight token accounting (~4 chars per token) — skip initial tmux attach-session screen repaint
    const approxTokens = isAttachBurst ? 0 : Math.max(0, Math.floor(clean.length / 4));
    if (approxTokens >= 6) {
      const weight = direction === 'input' ? 1.2 : 0.85;
      const delta = Math.round(approxTokens * weight);
      sess.totalTokens += delta;
      if (sess.source !== 'parsed') {
        const win = sess.contextWindowTokens || FALLBACK_CONTEXT_WINDOW;
        sess.contextTokens = Math.min(win, sess.contextTokens + delta);
        sess.contextPct = Math.min(100, Math.round((sess.contextTokens / win) * 1000) / 10);
      }
      this.state.events.push({ ts: Date.now(), tokens: delta, session: tmuxName });
      changed = true;
    }

    if (changed) {
      this._scheduleSave();
      this.emit('update', this.getSnapshot(tmuxName));

      if (
        cfg.autocompactEnabled &&
        sess.contextPct >= cfg.autocompactThresholdPct &&
        Date.now() - (sess.lastCompactAt || 0) > cfg.autocompactCooldownSec * 1000
      ) {
        sess.lastCompactAt = Date.now();
        this.emit('autocompact-trigger', {
          tmuxName,
          contextPct: sess.contextPct,
          thresholdPct: cfg.autocompactThresholdPct,
        });
      }
    }

    // 9. Worker status tracking: red (action required / failure) > blue (turn completed) > green (working) > grey (idle/acknowledged)
    const now = Date.now();
    if (direction === 'input') {
      // Ignore terminal mouse clicks, focus-in/out events, and escape sequences so clicking into the terminal doesn't flash green
      const isControlOrMouse = /^\x1b/.test(rawChunk);
      const isSubmit = rawChunk.includes('\r') || rawChunk.includes('\n');
      const shouldActivate =
        !isControlOrMouse && (isSubmit || sess.status === 'red');

      if (shouldActivate) {
        if (this._idleTimers.has(tmuxName)) {
          clearTimeout(this._idleTimers.get(tmuxName));
          this._idleTimers.delete(tmuxName);
        }
        if (sess.status !== 'green' || sess.lastRedAt) {
          sess.status = 'green';
          sess.lastRedAt = 0;
          this._scheduleSave();
          this.emit('update', this.getSnapshot(tmuxName));
        }
      }
    } else if (direction === 'output' && !isAttachBurst) {
      const approvalMatch = clean.match(
        /(?:\[y\/N\]|\[Y\/n\]|\(y\/n\)|Approve\s+(?:tool|command|action)|Allow\s+(?:once|always)|Press Enter to continue|Waiting for (?:user|approval))/i
      );
      const failureMatch = clean.match(
        /(?:\[agy exited|FATAL:|UnhandledRejection|command failed|exit code [1-9])/i
      );
      const redMatch = approvalMatch || failureMatch;

      if (redMatch) {
        if (this._idleTimers.has(tmuxName)) {
          clearTimeout(this._idleTimers.get(tmuxName));
          this._idleTimers.delete(tmuxName);
        }
        sess.status = 'red';
        sess.lastRedAt = now;
        this._scheduleSave();
        this.emit('update', this.getSnapshot(tmuxName));

        const lastAttention = this._lastAttentionAt?.get(tmuxName) || 0;
        if (now - lastAttention > 15000) {
          if (!this._lastAttentionAt) this._lastAttentionAt = new Map();
          this._lastAttentionAt.set(tmuxName, now);
          this.emit('session-attention', {
            tmuxName,
            kind: approvalMatch ? 'approval' : 'failure',
            snippet: redMatch[0],
            ts: now,
          });
        }
      } else if (now - (sess.lastRedAt || 0) > 1500) {
        const compactLen = clean.replace(/\s+/g, '').length;
        const hasWorkingHint = /(?:Thought\s+for|esc\s+to\s+(?:cancel|interrupt)|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏])/i.test(
          clean
        );
        // Ignore small tmux status-bar ticks / focus redraws when already idle (grey/blue)
        const shouldStartWork =
          sess.status === 'green' ? compactLen >= 4 : hasWorkingHint || compactLen >= 120;

        if (shouldStartWork) {
          if (sess.status !== 'green') {
            sess.status = 'green';
            this._scheduleSave();
            this.emit('update', this.getSnapshot(tmuxName));
          }
          if (this._idleTimers.has(tmuxName)) {
            clearTimeout(this._idleTimers.get(tmuxName));
          }
          const timer = setTimeout(() => {
            this._idleTimers.delete(tmuxName);
            const cur = this.state.sessions[tmuxName];
            if (cur && cur.status === 'green') {
              cur.status = 'blue';
              this._scheduleSave();
              this.emit('update', this.getSnapshot(tmuxName));
            }
          }, 2500);
          this._idleTimers.set(tmuxName, timer);
        }
      }
    }
  }

  acknowledgeSession(tmuxName) {
    const sess = this._ensureSession(tmuxName);
    if (sess.status === 'blue') {
      sess.status = 'grey';
      this._scheduleSave();
      const snap = this.getSnapshot(tmuxName);
      this.emit('update', snap);
      return snap;
    }
    return this.getSnapshot(tmuxName);
  }

  recordCompaction(tmuxName) {
    const sess = this._ensureSession(tmuxName);
    const win = sess.contextWindowTokens || FALLBACK_CONTEXT_WINDOW;
    sess.contextTokens = Math.round(sess.contextTokens * 0.2);
    sess.contextPct = Math.min(100, Math.round((sess.contextTokens / win) * 1000) / 10);
    sess.compactions += 1;
    sess.lastCompactAt = Date.now();
    this._scheduleSave();
    this.emit('update', this.getSnapshot(tmuxName));
    return this.getSnapshot(tmuxName);
  }

  getSnapshot(activeSessionName = null) {
    const now = Date.now();
    const cfg = this.state.config;
    const pq = this.state.parsedQuotas || {};

    let fiveHourTokens = 0;
    let oldestFiveHourTs = null;
    let dailyTokens = 0;
    let oldestDailyTs = null;
    let weeklyTokens = 0;
    let oldestWeeklyTs = null;

    for (const ev of this.state.events) {
      if (now - ev.ts <= FIVE_HOURS_MS) {
        fiveHourTokens += ev.tokens;
        if (oldestFiveHourTs === null || ev.ts < oldestFiveHourTs) oldestFiveHourTs = ev.ts;
      }
      if (now - ev.ts <= ONE_DAY_MS) {
        dailyTokens += ev.tokens;
        if (oldestDailyTs === null || ev.ts < oldestDailyTs) oldestDailyTs = ev.ts;
      }
      if (now - ev.ts <= ONE_WEEK_MS) {
        weeklyTokens += ev.tokens;
        if (oldestWeeklyTs === null || ev.ts < oldestWeeklyTs) oldestWeeklyTs = ev.ts;
      }
    }

    const estFiveHourPct = Math.min(
      100,
      Math.round((fiveHourTokens / FALLBACK_FIVE_HOUR_TOKENS) * 1000) / 10
    );
    const estDailyPct = Math.min(
      100,
      Math.round((dailyTokens / FALLBACK_DAILY_TOKENS) * 1000) / 10
    );
    const estWeeklyPct = Math.min(
      100,
      Math.round((weeklyTokens / FALLBACK_WEEKLY_TOKENS) * 1000) / 10
    );

    const fiveHourResetMs = oldestFiveHourTs
      ? Math.max(0, oldestFiveHourTs + FIVE_HOURS_MS - now)
      : FIVE_HOURS_MS;
    const dailyResetMs = oldestDailyTs
      ? Math.max(0, oldestDailyTs + ONE_DAY_MS - now)
      : ONE_DAY_MS;
    const weeklyResetMs = oldestWeeklyTs
      ? Math.max(0, oldestWeeklyTs + ONE_WEEK_MS - now)
      : ONE_WEEK_MS;

    const activeSess = activeSessionName ? this._ensureSession(activeSessionName) : null;

    return {
      config: { ...cfg },
      fiveHour: {
        tokens: fiveHourTokens,
        pct: pq.fiveHourPct !== null && pq.fiveHourPct !== undefined ? pq.fiveHourPct : estFiveHourPct,
        source: pq.fiveHourPct !== null && pq.fiveHourPct !== undefined ? 'usage' : 'estimated',
        resetText: pq.fiveHourResetText || null,
        resetInMs: fiveHourResetMs,
      },
      daily: {
        tokens: dailyTokens,
        pct: pq.dailyPct !== null && pq.dailyPct !== undefined ? pq.dailyPct : estDailyPct,
        source: pq.dailyPct !== null && pq.dailyPct !== undefined ? 'usage' : 'estimated',
        resetText: pq.dailyResetText || null,
        resetInMs: dailyResetMs,
      },
      weekly: {
        tokens: weeklyTokens,
        pct: pq.weeklyPct !== null && pq.weeklyPct !== undefined ? pq.weeklyPct : estWeeklyPct,
        source: pq.weeklyPct !== null && pq.weeklyPct !== undefined ? 'usage' : 'estimated',
        resetText: pq.weeklyResetText || null,
        resetInMs: weeklyResetMs,
      },
      activeSession: activeSess
        ? {
            tmuxName: activeSessionName,
            ...activeSess,
          }
        : null,
      sessions: this.state.sessions,
      events: this.state.events.slice(-120),
    };
  }
}

export const usageTracker = new UsageTracker();
