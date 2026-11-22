#!/usr/bin/env python3
"""
Lightweight PTY bridge for KLI.
Protocol:
  - Raw stdin bytes are written to the PTY master unless prefixed with an
    OSC-like control line? Even cleaner: we use fd 3 (or JSON-framed stdin)
    so binary terminal input and resize commands never collide.
  - Stdin receives newline-delimited JSON messages:
      {"type":"input","data":"..."}
      {"type":"resize","cols":120,"rows":36}
  - Stdout emits raw PTY output bytes directly.
"""
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios


def set_winsize(fd: int, rows: int, cols: int) -> None:
    try:
        winsize = struct.pack("HHHH", max(1, rows), max(1, cols), 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
    except OSError:
        pass


def main() -> None:
    if len(sys.argv) < 4:
        sys.stderr.write("Usage: pty_helper.py <cols> <rows> <cmd> [args...]\n")
        sys.exit(1)

    cols = int(sys.argv[1])
    rows = int(sys.argv[2])
    cmd = sys.argv[3:]

    pid, master_fd = pty.fork()
    if pid == 0:
        env = os.environ.copy()
        env.setdefault("TERM", "xterm-256color")
        env.setdefault("COLORTERM", "truecolor")
        os.execvpe(cmd[0], cmd, env)
        os._exit(127)

    set_winsize(master_fd, rows, cols)

    # Set stdin and master_fd non-blocking
    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    os.set_blocking(stdin_fd, False)
    os.set_blocking(master_fd, False)

    stdin_buf = b""
    write_buf = bytearray()
    alive = True

    def handle_sigterm(_signum, _frame):
        nonlocal alive
        alive = False
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass

    signal.signal(signal.SIGTERM, handle_sigterm)
    signal.signal(signal.SIGINT, handle_sigterm)

    while alive:
        try:
            w_watch = [master_fd] if write_buf else []
            rlist, wlist, _ = select.select([master_fd, stdin_fd], w_watch, [], 0.25)
        except InterruptedError:
            continue
        except ValueError:
            break

        if master_fd in rlist:
            try:
                data = os.read(master_fd, 65536)
                if not data:
                    break
                os.write(stdout_fd, data)
            except OSError:
                break

        if master_fd in wlist and write_buf:
            try:
                chunk = bytes(write_buf[:512])
                written = os.write(master_fd, chunk)
                if written > 0:
                    del write_buf[:written]
            except BlockingIOError:
                pass
            except OSError:
                break

        if stdin_fd in rlist:
            try:
                chunk = os.read(stdin_fd, 65536)
                if not chunk:
                    break
                stdin_buf += chunk
                while b"\n" in stdin_buf:
                    line, stdin_buf = stdin_buf.split(b"\n", 1)
                    if not line:
                        continue
                    try:
                        msg = json.loads(line.decode("utf-8"))
                    except Exception:
                        continue
                    mtype = msg.get("type")
                    if mtype == "input":
                        payload = msg.get("data", "").encode("utf-8")
                        if payload:
                            write_buf.extend(payload)
                    elif mtype == "resize":
                        set_winsize(master_fd, int(msg.get("rows", 30)), int(msg.get("cols", 120)))
                        try:
                            os.kill(pid, signal.SIGWINCH)
                        except OSError:
                            pass
            except BlockingIOError:
                pass
            except OSError:
                break

        # Check if child exited
        try:
            wpid, status = os.waitpid(pid, os.WNOHANG)
            if wpid == pid:
                # Drain any remaining output
                while True:
                    try:
                        data = os.read(master_fd, 65536)
                        if not data:
                            break
                        os.write(stdout_fd, data)
                    except OSError:
                        break
                code = os.waitstatus_to_exitcode(status) if hasattr(os, "waitstatus_to_exitcode") else 0
                sys.exit(code)
        except ChildProcessError:
            break

    try:
        os.close(master_fd)
    except OSError:
        pass


if __name__ == "__main__":
    main()
