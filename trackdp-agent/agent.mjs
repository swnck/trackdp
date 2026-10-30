#!/usr/bin/env node
/**
 * agent
 * -------------
 * A small WebSocket server that runs `traceroute` (or `tracert` on Windows)
 * on demand and streams the results back to the trackdp trackdp-visualizer.
 *
 * Every connecting client must complete a handshake to prove it really is the
 * visualizer before any trace request is accepted.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { platform } from "node:os";
import { WebSocket, WebSocketServer } from "ws";

import { DEFAULTS, loadConfig } from "./lib/config.mjs";
import { findAvailablePort, isPortAvailable } from "./lib/ports.mjs";

const require = createRequire(import.meta.url);
const pkg = require("./package.json");

const AGENT_APP_ID = "trackdp-agent";
const VISUALIZER_APP_ID = "trackdp-visualizer";

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-zA-Z0-9.-]+$/;
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]{2,45}$/;

const config = { ...DEFAULTS, ...loadConfig() };
const HOST = config.host;

/** A target may be a hostname, an IPv4 address, or an IPv6 address. */
function isValidTarget(target) {
  return (
    HOSTNAME_RE.test(target) ||
    IPV4_RE.test(target) ||
    IPV6_RE.test(target)
  );
}

/** Pick the right traceroute binary and arguments for the current OS. */
function buildCommand(target) {
  return platform() === "win32"
    ? ["tracert", ["-h", "30", "-w", "2000", target]]
    : ["traceroute", ["-m", "30", "-w", "2", target]];
}

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Derive the allowed WebSocket `Origin` values from the configured trackdp-visualizer
 * URL. Loopback hosts are expanded to their localhost/127.0.0.1/[::1] variants
 * so the trackdp-visualizer can be opened through any of them.
 */
function buildAllowedOrigins(visualizerUrl) {
  const origins = new Set();
  try {
    const url = new URL(visualizerUrl);
    origins.add(url.origin);

    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
        origins.add(`${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`);
      }
    }
  } catch {
    /* ignore an invalid URL and fall back below */
  }

  if (origins.size === 0) {
    origins.add("http://localhost:3000");
  }

  return origins;
}

const allowedOrigins = buildAllowedOrigins(config.visualizerUrl);

/**
 * Reject browser clients whose Origin is not the configured trackdp-visualizer.
 * Non-browser clients (no Origin header) are still required to handshake.
 */
function verifyClient({ origin }) {
  if (!origin) return true;
  return allowedOrigins.has(origin);
}

/**
 * Attach the handshake state machine to a fresh connection.
 * The trackdp-agent greets first; the client must answer with a valid hello within the
 * configured timeout or the connection is closed.
 */
function attachHandshake(ws) {
  let verified = false;

  const timeout = setTimeout(() => {
    if (!verified) {
      send(ws, {
        type: "error",
        message: "Handshake timeout: expected a visualizer hello.",
      });
      ws.close(4001, "handshake timeout");
    }
  }, config.handshakeTimeoutMs);

  send(ws, {
    type: "hello",
    app: AGENT_APP_ID,
    protocol: config.protocol,
    version: pkg.version,
  });

  return {
    verify(message) {
      if (verified) return true;

      if (message?.type !== "hello") {
        send(ws, {
          type: "error",
          message: "Handshake required before sending commands.",
        });
        ws.close(4002, "handshake required");
        return false;
      }

      const valid =
        message.app === VISUALIZER_APP_ID &&
        message.protocol === config.protocol;

      if (!valid) {
        send(ws, { type: "error", message: "Handshake rejected: unknown client." });
        ws.close(4003, "handshake rejected");
        return false;
      }

      verified = true;
      clearTimeout(timeout);
      send(ws, {
        type: "ready",
        agent: AGENT_APP_ID,
        protocol: config.protocol,
      });
      return true;
    },
    isVerified() {
      return verified;
    },
    dispose() {
      clearTimeout(timeout);
    },
  };
}

/** Spawn a single traceroute and stream its output to the client. */
function runTrace(target, ws, onExit) {
  const [command, args] = buildCommand(target);
  const child = spawn(command, args);

  let buffer = "";
  let stderr = "";
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    onExit?.();
  };

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      send(ws, { type: "line", line });
    }
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.on("error", (error) => {
    send(ws, {
      type: "error",
      message: `Failed to start ${command}: ${error.message}`,
    });
    finish();
  });

  child.on("close", (code) => {
    if (buffer) send(ws, { type: "line", line: buffer });
    if (code !== 0 && stderr.trim()) {
      send(ws, { type: "error", message: stderr.trim().split("\n").pop() });
    }
    send(ws, { type: "done", code });
    finish();
  });

  return child;
}

/** Bind on the configured port, falling back to the next free port if needed. */
async function resolvePort() {
  if (await isPortAvailable(config.port, HOST)) {
    return config.port;
  }

  const fallback = await findAvailablePort(config.port + 1, HOST);
  console.warn(
    `[trackdp-agent] Port ${config.port} is in use — falling back to ${fallback}.`,
  );
  return fallback;
}

const port = await resolvePort();

const wss = new WebSocketServer({ host: HOST, port, verifyClient });

wss.on("connection", (ws) => {
  const handshake = attachHandshake(ws);
  let child = null;

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!handshake.isVerified()) {
      handshake.verify(message);
      return;
    }

    if (message.type !== "trace") return;

    if (child) {
      send(ws, { type: "error", message: "A trace is already running." });
      return;
    }

    if (typeof message.target !== "string" || !isValidTarget(message.target)) {
      send(ws, {
        type: "error",
        message: "Invalid target. Provide a hostname or IP address.",
      });
      return;
    }

    child = runTrace(message.target, ws, () => {
      child = null;
    });
  });

  ws.on("close", () => {
    handshake.dispose();
    child?.kill();
  });

  ws.on("error", () => {
    handshake.dispose();
    child?.kill();
  });
});

wss.on("listening", () => {
  console.log(`[trackdp-agent] ${pkg.name} v${pkg.version}`);
  console.log(`[trackdp-agent] Listening on ws://${HOST}:${port}`);
  console.log(`[trackdp-agent] Visualizer: ${config.visualizerUrl}`);
  console.log(`[trackdp-agent] Allowed origins: ${[...allowedOrigins].join(", ")}`);
});

wss.on("error", (error) => {
  console.error(`[trackdp-agent] Server error: ${error.message}`);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`\n[trackdp-agent] Shutting down…`);
    wss.close(() => process.exit(0));
  });
}
