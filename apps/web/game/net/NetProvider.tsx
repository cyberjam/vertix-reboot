"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Client, type Room } from "colyseus.js";

const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";

export type NetStatus = "idle" | "connecting" | "connected" | "error";

export interface JoinOptions {
  name: string;
  classId: string;
}

interface NetValue {
  status: NetStatus;
  room: Room | null;
  sessionId: string;
  error: string | null;
  serverUrl: string;
  connect(opts: JoinOptions): Promise<void>;
  disconnect(): void;
}

const NetContext = createContext<NetValue | null>(null);

/**
 * Owns the Colyseus client/room for the whole app so that React (menus, HUD,
 * overlays) and the Phaser scene share a single connection. The scene receives
 * the live `room` injected as scene data instead of creating its own client.
 */
export function NetProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<Client | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState<NetStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async ({ name, classId }: JoinOptions) => {
    setStatus("connecting");
    setError(null);
    try {
      const client = clientRef.current ?? new Client(SERVER_URL);
      clientRef.current = client;
      const joined = await client.joinOrCreate("arena", { name, classId });
      joined.onLeave(() => {
        setRoom(null);
        setSessionId("");
        setStatus("idle");
      });
      setRoom(joined);
      setSessionId(joined.sessionId);
      setStatus("connected");
    } catch (err) {
      console.error("[NetProvider] failed to join room", err);
      setError(
        `Failed to connect to ${SERVER_URL}. Start the game server: pnpm dev:server`,
      );
      setStatus("error");
    }
  }, []);

  const disconnect = useCallback(() => {
    void room?.leave();
    setRoom(null);
    setSessionId("");
    setStatus("idle");
  }, [room]);

  return (
    <NetContext.Provider
      value={{ status, room, sessionId, error, serverUrl: SERVER_URL, connect, disconnect }}
    >
      {children}
    </NetContext.Provider>
  );
}

export function useNet(): NetValue {
  const value = useContext(NetContext);
  if (!value) throw new Error("useNet must be used within a NetProvider");
  return value;
}
