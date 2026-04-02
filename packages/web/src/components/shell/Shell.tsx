import React, { useCallback, useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';
import { SocketEvents } from 'cc-remote-shared';
import type { SessionOutputEvent } from 'cc-remote-shared';
import { socketManager } from '../../lib/socket';
import { useSessionStore } from '../../stores/sessionStore';
import { ShellConnectionOverlay, type ShellConnectionState } from './ShellConnectionOverlay';

interface ShellProps {
  sessionId: string | null;
}

export const Shell: React.FC<ShellProps> = ({ sessionId }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const outputBuffer = useSessionStore((s) => s.outputBuffer);

  const getConnectionState = useCallback((): ShellConnectionState => {
    if (!sessionId) return 'loading';
    if (!socketManager.isConnected()) return 'disconnected';
    return 'connected';
  }, [sessionId]);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const terminal = new Terminal({
      theme: {
        background: '#ffffff',
        foreground: '#333333',
        cursor: '#333333',
        selectionBackground: '#b3d7ff',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      fontFamily: 'Monaco, Menlo, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    try {
      const webLinksAddon = new WebLinksAddon();
      terminal.loadAddon(webLinksAddon);
    } catch {
      // WebLinks addon not critical
    }

    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.onData((data) => {
      if (sessionId) {
        socketManager.sendSessionInput(sessionId, data);
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      if (sessionId) {
        socketManager.sendResize(sessionId, terminal.cols, terminal.rows);
      }
    };
    window.addEventListener('resize', handleResize);

    const unsubOutput = socketManager.on(SocketEvents.SESSION_OUTPUT, (data: unknown) => {
      const output = data as SessionOutputEvent;
      if (output.session_id === sessionId) {
        terminal.write(output.data);
      }
    });

    const unsubBuffer = socketManager.on(SocketEvents.SESSION_BUFFER, (data: unknown) => {
      const buf = data as { sessionId: string; lines: string[] };
      if (buf.sessionId === sessionId) {
        terminal.clear();
        buf.lines.forEach((line) => terminal.write(line));
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      unsubOutput();
      unsubBuffer();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!xtermRef.current || !sessionId) return;
    const buffer = outputBuffer.get(sessionId);
    if (buffer && buffer.length > 0) {
      const terminal = xtermRef.current;
      terminal.clear();
      buffer.forEach((line) => terminal.writeln(line));
      terminal.scrollToBottom();
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      fitAddonRef.current?.fit();
      }, 100);
      return () => clearTimeout(handle);
  }, [sessionId]);

  const connState = getConnectionState();

  return (
    <div className="h-full relative bg-white">
      <ShellConnectionOverlay state={connState} />
      <div
        ref={terminalRef}
        className="h-full w-full p-1"
      />
    </div>
  );
};
