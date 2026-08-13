"use client";

// SSE-aware React hook for the CLI install + login flows. The install
// stream buffers 200 lines + emits `status` when the subprocess exits.
// The login stream additionally emits `auth` once both the URL and the
// device code have been captured (the UI fires `ack` to write "\n" on
// stdin for gh's no-browser flow).

import { useCallback, useEffect, useRef, useState } from "react";

export type FlowStatus = "idle" | "running" | "done" | "failed";

interface UseInstallReturn {
  status: FlowStatus;
  lines: string[];
  install: () => Promise<void>;
  cancel: () => void;
  clear: () => void;
}

const MAX_LINES = 200;

function isLogEvent(value: unknown): value is { line: string } {
  if (typeof value !== "object" || value === null) return false;
  if (!("line" in value)) return false;
  return typeof (value as { line: unknown }).line === "string";
}

function isStatusEvent(value: unknown): value is { status: string } {
  if (typeof value !== "object" || value === null) return false;
  if (!("status" in value)) return false;
  return typeof (value as { status: unknown }).status === "string";
}

function isAuthEvent(value: unknown): value is { url?: string; code?: string } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { url?: unknown; code?: unknown };
  return (v.url === undefined || typeof v.url === "string") && (v.code === undefined || typeof v.code === "string");
}

function useEventSource(path: string | null, onEvent: (event: string, data: unknown) => void) {
  const esRef = useRef<EventSource | null>(null);
  useEffect(() => {
    if (!path) return;
    const es = new EventSource(path);
    esRef.current = es;
    const listener = (event: MessageEvent) => {
      try {
        onEvent(event.type, JSON.parse(event.data));
      } catch {
        onEvent(event.type, { line: event.data });
      }
    };
    es.onmessage = listener;
    es.onerror = () => {
      es.close();
      esRef.current = null;
    };
    es.addEventListener("log", listener);
    es.addEventListener("auth", listener);
    es.addEventListener("status", listener);
    return () => { es.close(); esRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
}

export function useInstall(cliId: "az" | "gh"): UseInstallReturn {
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [streamPath, setStreamPath] = useState<string | null>(null);

  useEventSource(streamPath, (event, data) => {
    if (event === "log" && isLogEvent(data)) {
      setLines((prev) => {
        const next = prev.length >= MAX_LINES ? prev.slice(1) : prev;
        return [...next, data.line];
      });
    } else if (event === "status" && isStatusEvent(data)) {
      if (data.status === "done" || data.status === "failed") {
        setStatus(data.status);
        setStreamPath(null);
      }
    }
  });

  const install = useCallback(async () => {
    setStatus("running");
    setLines([]);
    const res = await fetch(`/api/cli-tools/${cliId}/install`, { method: "POST" });
    const data = (await res.json()) as { jobId?: string; error?: string };
    if (!res.ok || !data.jobId) throw new Error(data.error ?? `HTTP ${res.status}`);
    setStreamPath(`/api/cli-tools/${cliId}/install/stream`);
  }, [cliId]);

  const cancel = useCallback(() => {
    setStreamPath(null);
    setStatus("idle");
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setStatus("idle");
  }, []);

  return { status, lines, install, cancel, clear };
}

interface UseLoginReturn extends UseInstallReturn {
  authUrl: string | null;
  authCode: string | null;
  login: () => Promise<void>;
  ack: () => Promise<void>;
}

export function useLogin(cliId: "az" | "gh"): UseLoginReturn {
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [streamPath, setStreamPath] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  useEventSource(streamPath, (event, data) => {
    if (event === "log" && isLogEvent(data)) {
      setLines((prev) => {
        const next = prev.length >= MAX_LINES ? prev.slice(1) : prev;
        return [...next, data.line];
      });
    } else if (event === "auth" && isAuthEvent(data)) {
      if (data.url) setAuthUrl(data.url);
      if (data.code) setAuthCode(data.code);
    } else if (event === "status" && isStatusEvent(data)) {
      if (data.status === "done" || data.status === "failed") {
        setStatus(data.status);
        setStreamPath(null);
      }
    }
  });

  const login = useCallback(async () => {
    setStatus("running");
    setLines([]);
    setAuthUrl(null);
    setAuthCode(null);
    const res = await fetch(`/api/cli-tools/${cliId}/login/start`, { method: "POST" });
    const data = (await res.json()) as { jobId?: string; error?: string };
    if (!res.ok || !data.jobId) throw new Error(data.error ?? `HTTP ${res.status}`);
    setJobId(data.jobId);
    setStreamPath(`/api/cli-tools/${cliId}/login/stream?jobId=${encodeURIComponent(data.jobId)}`);
  }, [cliId]);

  const ack = useCallback(async () => {
    if (!jobId) return;
    const res = await fetch(`/api/cli-tools/${cliId}/login/${encodeURIComponent(jobId)}/ack`, { method: "POST" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  }, [cliId, jobId]);

  const cancel = useCallback(() => {
    setStreamPath(null);
    setStatus("idle");
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setStatus("idle");
    setAuthUrl(null);
    setAuthCode(null);
    setJobId(null);
  }, []);

  return { status, lines, authUrl, authCode, install: login, login, ack, cancel, clear };
}
