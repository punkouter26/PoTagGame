import { useEffect, useRef, useState, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface UseSignalRResult {
  connection:  signalR.HubConnection | null;
  status:      ConnectionStatus;
  isOnline:    boolean;  // true only when Connected
}

/**
 * useSignalR — establishes and maintains a SignalR connection.
 *
 * Offline resilience: if the hub is unreachable (e.g. in dev without a server
 * or on slow networks), the hook sets isOnline=false so the UI can degrade
 * gracefully — the lobby still renders and the player can start a solo game
 * locally.
 *
 * The connection is memoised: the effect runs once per mount and the same
 * HubConnection object is returned for the lifetime of the consumer.
 */
export function useSignalR(hubUrl: string): UseSignalRResult {
  const connRef   = useRef<signalR.HubConnection | null>(null);
  // Guard against React StrictMode double-invoking useEffect: if a connection
  // is already alive (Connected or Connecting) from the first invocation, reuse
  // it rather than building a second one that will fight for the same hub slot.
  const mountedRef = useRef(false);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  const startConnection = useCallback(async (conn: signalR.HubConnection) => {
    // Retry the initial start up to 5 times (covers server cold-start / Vite proxy warming up)
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await conn.start();
        setStatus('connected');
        console.debug('[SignalR] connected');
        return;
      } catch (err) {
        // AbortError means the connection was stopped mid-negotiation (StrictMode
        // cleanup or an explicit conn.stop() call) — not a real network failure.
        // Guard broadly: DOMException, wrapped Error, or plain string message.
        if (err != null && (
          (err as { name?: string }).name === 'AbortError' ||
          String(err).includes('AbortError') ||
          String(err).includes('stopped during negotiation')
        )) return;
        if (attempt < 4) {
          const delay = 1_000 * (attempt + 1);
          console.warn(`[SignalR] initial connect attempt ${attempt + 1} failed — retrying in ${delay}ms`, err);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          console.warn('[SignalR] initial connection failed — offline mode', err);
          setStatus('disconnected');
        }
      }
    }
  }, []);

  useEffect(() => {
    // StrictMode fires mount→cleanup→mount. The cleanup sets mountedRef to false
    // so the second mount knows to proceed; if somehow a live connection already
    // exists (e.g. race with async start), skip creating a duplicate.
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Suppress verbose SignalR protocol logs in dev — only show errors so that
    // the console doesn't fill up with "No client method 'X' found" noise during
    // the StrictMode cleanup/remount gap.
    const logLevel = import.meta.env.DEV
      ? signalR.LogLevel.Error
      : signalR.LogLevel.Warning;

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (ctx) =>
          Math.min(1_000 * 2 ** ctx.previousRetryCount, 30_000),
      })
      .configureLogging(logLevel)
      .build();

    conn.onreconnecting(() => {
      console.warn('[SignalR] reconnecting…');
      setStatus('reconnecting');
    });

    conn.onreconnected(() => {
      console.info('[SignalR] reconnected');
      setStatus('connected');
    });

    conn.onclose((err) => {
      // Suppress StrictMode double-mount teardown noise
      if (err && String(err).includes('stopped during negotiation')) return;
      if (err) console.error('[SignalR] closed', err);
      setStatus('disconnected');
    });

    connRef.current = conn;
    void startConnection(conn);

    return () => {
      mountedRef.current = false;
      // Graceful teardown on unmount
      conn.stop().catch((e) => console.warn('[SignalR] stop error', e));
    };
  }, [hubUrl, startConnection]);

  return {
    connection: connRef.current,
    status,
    isOnline:   status === 'connected',
  };
}
