/**
 * useWebSocket.ts
 * Typed WebSocket hook with auto-reconnect, ping-keepalive, and a
 * stable `sendMessage` ref so callers never need to re-subscribe.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WsStatus = "connecting" | "connected" | "disconnected" | "error";

export interface UseWebSocketOptions {
  url: string;
  onMessage: (data: string) => void;
  /** ms between reconnect attempts (default 2000) */
  reconnectDelay?: number;
  /** ms between keepalive pings (default 25000, 0 = disabled) */
  pingInterval?: number;
  /** set false to suppress auto-connect on mount */
  autoConnect?: boolean;
}

export interface UseWebSocketReturn {
  status: WsStatus;
  sendMessage: (data: string) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket({
  url,
  onMessage,
  reconnectDelay = 2000,
  pingInterval = 25_000,
  autoConnect = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualDisconnect = useRef(false);
  // Stable ref to the latest connect fn — avoids "accessed before declared" lint error
  const connectRef = useRef<() => void>(() => undefined);

  // Keep handler ref fresh so callers can update without re-running effect
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearTimers = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (pingTimer.current) clearInterval(pingTimer.current);
    reconnectTimer.current = null;
    pingTimer.current = null;
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    manualDisconnect.current = false;
    setStatus("connecting");

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      if (pingInterval > 0) {
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, pingInterval);
      }
    };

    ws.onmessage = (ev) => onMessageRef.current(ev.data);

    ws.onerror = () => setStatus("error");

    ws.onclose = () => {
      clearTimers();
      if (!manualDisconnect.current) {
        setStatus("disconnected");
        // Use the stable ref — avoids hoisting issue with useCallback
        reconnectTimer.current = setTimeout(() => connectRef.current(), reconnectDelay);
      }
    };
  }, [url, reconnectDelay, pingInterval, clearTimers]);

  // Keep connectRef pointing at the latest connect
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    manualDisconnect.current = true;
    clearTimers();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, [clearTimers]);

  const sendMessage = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  useEffect(() => {
    if (autoConnect) connect();
    return () => {
      manualDisconnect.current = true;
      clearTimers();
      wsRef.current?.close();
    };
  }, [connect, autoConnect, clearTimers]);

  return { status, sendMessage, connect, disconnect };
}
