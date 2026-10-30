"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseHopLine, formatMs, formatHopHost } from "@/app/lib/trace";
import LatencyChart from "@/app/components/LatencyChart";
import RouteMap from "@/app/components/RouteMap";

const DEFAULT_WS_URL = "ws://127.0.0.1:8787";
const PROTOCOL = 1;

const STATUS_LABELS = {
  idle: "Idle",
  connecting: "Connecting…",
  handshaking: "Handshaking…",
  ready: "Connected",
  error: "Connection error",
  closed: "Disconnected",
};

export default function Home() {
  const [wsUrl, setWsUrl] = useState(
    process.env.NEXT_PUBLIC_AGENT_WS_URL || DEFAULT_WS_URL,
  );
  const [status, setStatus] = useState("idle");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTarget, setActiveTarget] = useState("");

  const socketRef = useRef(null);
  const outputRef = useRef(null);

  function append(entry) {
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "line", ...entry },
    ]);
  }

  function reset() {
    setEntries([]);
    setBusy(false);
  }

  function connect(url = wsUrl) {
    socketRef.current?.close();
    reset();
    setStatus("connecting");

    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      setStatus("error");
      append({ kind: "error", text: `Invalid WebSocket URL: ${url}` });
      return;
    }

    socketRef.current = ws;

    ws.addEventListener("open", () => {
      setStatus("handshaking");
      ws.send(
        JSON.stringify({
          type: "hello",
          app: "trackdp-visualizer",
          protocol: PROTOCOL,
        }),
      );
    });

    ws.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (message.type) {
        case "hello":
          if (message.app === "trackdp-agent") {
            append({
              kind: "info",
              text: `Connected to ${message.app} v${message.version ?? "?"}`,
            });
          }
          break;
        case "ready":
          setStatus("ready");
          break;
        case "line":
          append({ kind: "line", text: message.line ?? "" });
          break;
        case "done":
          setBusy(false);
          append({
            kind: "info",
            text:
              message.code === 0
                ? "Trace finished."
                : `Trace exited with code ${message.code}.`,
          });
          break;
        case "error":
          setBusy(false);
          append({ kind: "error", text: message.message ?? "Unknown error" });
          break;
        default:
          break;
      }
    });

    ws.addEventListener("close", () => {
      setStatus("closed");
      setBusy(false);
    });

    ws.addEventListener("error", () => {
      setStatus("error");
    });
  }

  function runTrace() {
    const value = target.trim();
    if (!value || busy) return;

    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      append({ kind: "error", text: "Not connected to the trackdp-agent." });
      return;
    }

    setBusy(true);
    setEntries([]);
    setActiveTarget(value);
    append({ kind: "info", text: `$ traceroute ${value}` });
    ws.send(JSON.stringify({ type: "trace", target: value }));
  }

  // Connect once on mount and clean up on unmount.
  useEffect(() => {
    connect();
    return () => socketRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the raw log scrolled to the newest line.
  useEffect(() => {
    const node = outputRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [entries]);

  const hops = useMemo(() => {
    const map = new Map();
    for (const entry of entries) {
      if (entry.kind !== "line") continue;
      const parsed = parseHopLine(entry.text);
      if (parsed) map.set(parsed.hop, parsed);
    }
    return [...map.values()].sort((a, b) => a.hop - b.hop);
  }, [entries]);

  const notices = useMemo(
    () => entries.filter((e) => e.kind === "info" || e.kind === "error"),
    [entries],
  );

  const stats = useMemo(() => {
    const responsive = hops.filter((h) => !h.timeout);
    const total = responsive.reduce((sum, h) => sum + h.avg, 0);
    const last = hops[hops.length - 1];
    return {
      count: hops.length,
      avg: responsive.length ? total / responsive.length : null,
      last,
      reached: last ? !last.timeout : false,
    };
  }, [hops]);

  return (
    <div className="container">
      <header className="header">
        <h1 className="brand">
          <a
            href="https://github.com/swnck/trackdp"
            target="_blank"
            rel="noreferrer"
          >
            trackdp <span>visualizer</span>
          </a>
        </h1>
        <div className="status-wrap">
          <button
            type="button"
            className="status"
            data-status={status}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <span className="dot" />
            {STATUS_LABELS[status] ?? status}
            <svg
              className="caret"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {settingsOpen && (
            <>
              <div
                className="popover-backdrop"
                onClick={() => setSettingsOpen(false)}
              />
              <div className="settings-popover">
                <label htmlFor="ws-url">Agent WebSocket URL</label>
                <div className="row">
                  <input
                    id="ws-url"
                    type="text"
                    value={wsUrl}
                    onChange={(event) => setWsUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        connect();
                        setSettingsOpen(false);
                      }
                    }}
                    spellCheck={false}
                  />
                  <button
                    className="secondary"
                    onClick={() => {
                      connect();
                      setSettingsOpen(false);
                    }}
                  >
                    Connect
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      <section className="card">
        <label htmlFor="target">Target hostname or IP</label>
        <div className="row">
          <input
            id="target"
            type="text"
            value={target}
            placeholder="example.com"
            onChange={(event) => setTarget(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") runTrace();
            }}
            spellCheck={false}
          />
          <button onClick={runTrace} disabled={busy || !target.trim()}>
            {busy ? "Tracing…" : "Trace"}
          </button>
          <button className="secondary" onClick={reset}>
            Clear
          </button>
        </div>
      </section>

      {busy ? (
        <section className="card loading-card">
          <div className="spinner" />
          <div className="loading-title">Tracing {activeTarget}…</div>
          <div className="loading-sub">Waiting for the trace to finish</div>
        </section>
      ) : (
        <>
          {notices.length > 0 && (
            <div className="notices">
              {notices.map((entry) => (
                <div key={entry.id} className={`notice notice-${entry.kind}`}>
                  {entry.text}
                </div>
              ))}
            </div>
          )}

          {hops.length > 0 && (
            <>
              <section className="stats">
                <div className="stat">
                  <span className="stat-label">Hops</span>
                  <span className="stat-value">{stats.count}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Avg response</span>
                  <span className="stat-value">
                    {stats.avg != null ? formatMs(stats.avg) : "—"}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Destination</span>
                  <span className="stat-value stat-value-dest dest-wrap">
                    {stats.last ? truncateLabel(stats.last.label) : "—"}
                    {stats.last && formatHopHost(stats.last) && (
                      <span className="dest-tip" role="tooltip">
                        {formatHopHost(stats.last)}
                      </span>
                    )}
                  </span>
                  {stats.last && (
                    <span
                      className={`badge ${stats.reached ? "badge-ok" : "badge-warn"}`}
                    >
                      {stats.reached ? "Reached" : "Unreached"}
                    </span>
                  )}
                </div>
              </section>

              <section className="card">
                <div className="card-heading">
                  <h2>Response time</h2>
                  <span className="card-hint">latency per hop</span>
                </div>
                <LatencyChart hops={hops} />
              </section>

              <section className="card">
                <div className="card-heading">
                  <h2>Route path</h2>
                  <span className="card-hint">source → destination</span>
                </div>
                <RouteMap hops={hops} />
                <div className="legend">
                  <span className="legend-item">
                    <i className="legend-dot legend-start" /> start
                  </span>
                  <span className="legend-item">
                    <i className="legend-dot legend-hop" /> hop
                  </span>
                  <span className="legend-item">
                    <i className="legend-dot legend-timeout" /> timeout
                  </span>
                  <span className="legend-item">
                    <i className="legend-dot legend-dest" /> destination
                  </span>
                </div>
              </section>
            </>
          )}

          {hops.length === 0 && notices.length === 0 && (
            <div className="empty-state">
              Waiting for a trace. Enter a hostname above and press Trace.
            </div>
          )}

          {entries.length > 0 && (
            <details className="raw">
              <summary>Raw output</summary>
              <div className="terminal" ref={outputRef}>
                {entries.map((entry) => (
                  <div key={entry.id} className={entry.kind}>
                    {entry.text}
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      <footer className="footer">
        Made by{" "}
        <a href="https://github.com/swnck" target="_blank" rel="noreferrer">
          swnck
        </a>{" "}
        with{" "}
        <svg
          className="heart"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </footer>
    </div>
  );
}

function truncateLabel(value, max = 16) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
