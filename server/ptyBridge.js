import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PTY_HELPER = path.join(__dirname, 'pty_helper.py');

let nodePtyModule = null;
let nodePtyLoadAttempted = false;

async function getNodePty() {
  if (nodePtyLoadAttempted) return nodePtyModule;
  nodePtyLoadAttempted = true;
  try {
    const mod = await import('node-pty');
    nodePtyModule = mod.default || mod;
  } catch {
    nodePtyModule = null;
  }
  return nodePtyModule;
}

/**
 * Spawns an interactive PTY process.
 * Uses node-pty when available and falls back to python3 pty_helper.py.
 */
export async function spawnPty(command, args = [], options = {}) {
  const cols = options.cols || 120;
  const rows = options.rows || 34;
  const cwd = options.cwd || process.cwd();
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...(options.env || {}),
  };

  const emitter = new EventEmitter();
  const nodePty = await getNodePty();

  if (nodePty && typeof nodePty.spawn === 'function') {
    try {
      const ptyProcess = nodePty.spawn(command, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
      });

      ptyProcess.onData((data) => emitter.emit('data', data));
      ptyProcess.onExit(({ exitCode }) => emitter.emit('exit', exitCode ?? 0));

      return {
        backend: 'node-pty',
        onData: (cb) => emitter.on('data', cb),
        onExit: (cb) => emitter.on('exit', cb),
        write: (data) => {
          try {
            ptyProcess.write(data);
          } catch {
            // ignore write after close
          }
        },
        resize: (newCols, newRows) => {
          try {
            ptyProcess.resize(Math.max(2, newCols), Math.max(2, newRows));
          } catch {
            // ignore resize errors
          }
        },
        kill: () => {
          try {
            ptyProcess.kill();
          } catch {
            // ignore
          }
        },
      };
    } catch {
      // Fall through to python3 PTY helper
    }
  }

  const child = spawn('python3', [PTY_HELPER, String(cols), String(rows), command, ...args], {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    emitter.emit('data', chunk.toString('utf-8'));
  });

  child.stderr.on('data', (chunk) => {
    emitter.emit('data', chunk.toString('utf-8'));
  });

  child.on('exit', (code) => {
    emitter.emit('exit', code ?? 0);
  });

  return {
    backend: 'python-pty',
    onData: (cb) => emitter.on('data', cb),
    onExit: (cb) => emitter.on('exit', cb),
    write: (data) => {
      if (child.stdin.writable) {
        child.stdin.write(JSON.stringify({ type: 'input', data }) + '\n');
      }
    },
    resize: (newCols, newRows) => {
      if (child.stdin.writable) {
        child.stdin.write(
          JSON.stringify({
            type: 'resize',
            cols: Math.max(2, newCols),
            rows: Math.max(2, newRows),
          }) + '\n'
        );
      }
    },
    kill: () => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    },
  };
}
