#!/usr/bin/env node
/**
 * trackdp setup wizard
 * --------------------
 * 1. Verifies Node.js and pnpm (bootstrapping pnpm via Corepack if missing).
 * 2. Installs workspace dependencies.
 * 3. Asks for the trackdp-visualizer URL and the WebSocket port.
 * 4. Picks a new port when the requested one is already taken.
 * 5. Verifies the trackdp-visualizer URL and runs a WebSocket handshake self-test.
 * 6. Persists the trackdp-agent config and points the trackdp-visualizer at the trackdp-agent.
 */

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { CONFIG_PATH, DEFAULTS, loadConfig, saveConfig } from "./lib/config.mjs";
import { findAvailablePort, isPortAvailable } from "./lib/ports.mjs";
import { ensurePnpm, nodeVersion, pnpmVersion, runCommand } from "./lib/env.mjs";

const AGENT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(AGENT_DIR, "..");
const VISUALIZER_ENV = join(ROOT_DIR, "trackdp-visualizer", ".env.local");

const rl = readline.createInterface({ input, output });

async function ask(question, fallback) {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = await rl.question(`${question}${suffix}: `);
  return (answer.trim() || fallback).trim();
}

async function confirm(question, fallback = "y") {
  const answer = await ask(`${question} (y/n)`, fallback);
  return /^y(es)?$/i.test(answer);
}

function banner() {
  console.log(`
  ┌─────────────────────────────────┐
  │         trackdp  setup          │
  │   agent + visualizer installer  │
  └─────────────────────────────────┘`);
}

function writeVisualizerEnv(port) {
  writeFileSync(VISUALIZER_ENV, `NEXT_PUBLIC_AGENT_WS_URL=ws://127.0.0.1:${port}\n`);
  console.log(`[setup] Visualizer config written to ${VISUALIZER_ENV}`);
}

async function verifyVisualizer(url) {
  console.log(`[setup] Checking ${url} …`);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn(`[setup] Warning: ${url} responded with HTTP ${response.status}.`);
      return;
    }

    const html = await response.text();
    const isVisualizer =
      /trackdp/i.test(html) &&
      (/visualizer/i.test(html) || /name=["']trackdp["']/i.test(html));

    if (isVisualizer) {
      console.log(`[setup] OK — ${url} identifies itself as the trackdp-visualizer.`);
    } else {
      console.warn(
        `[setup] Warning: ${url} did not clearly identify itself as the trackdp-visualizer.`,
      );
      console.warn(
        "[setup] The trackdp-agent still enforces the WebSocket handshake, so unknown clients are rejected at runtime.",
      );
    }
  } catch (error) {
    console.warn(`[setup] Warning: could not reach ${url} (${error.message}).`);
    console.warn(
      "[setup] The trackdp-agent still enforces the WebSocket handshake, so unknown clients are rejected at runtime.",
    );
  }
}

/** Ask the trackdp-agent for a handshake on the given port and report success. */
function probeHandshake(WebSocket, port) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => {
      ws.terminate();
      resolve(false);
    }, 4000);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "hello",
          app: "visualizer",
          protocol: DEFAULTS.protocol,
        }),
      );
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "ready") {
          clearTimeout(timer);
          ws.close();
          resolve(true);
        }
      } catch {
        /* ignore malformed frames */
      }
    });

    ws.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/**
 * Start a throwaway trackdp-agent, complete a real handshake against it, then stop it.
 * This verifies the full WebSocket handshake path end-to-end.
 */
async function selfTestHandshake(port) {
  console.log("[setup] Verifying the WebSocket handshake…");

  const { WebSocket } = await import("ws");
  const child = spawn(process.execPath, ["trackdp-agent.mjs"], {
    cwd: AGENT_DIR,
    stdio: "ignore",
  });

  try {
    await delay(900);
    return await probeHandshake(WebSocket, port);
  } finally {
    child.kill("SIGTERM");
  }
}

function printSummary(config, port, handshakeOk) {
  const rule = "─".repeat(50);
  console.log(`\n${rule}`);
  console.log("Summary");
  console.log(rule);
  console.log(`Visualizer URL  : ${config.visualizerUrl}`);
  console.log(`Agent WebSocket : ws://127.0.0.1:${port}`);
  console.log(`Protocol        : ${config.protocol}`);
  console.log(`Handshake test  : ${handshakeOk ? "passed" : "failed"}`);
  console.log(rule);
  console.log("Start the trackdp-agent:       pnpm trackdp-agent");
  console.log("Start the trackdp-visualizer:  pnpm trackdp-visualizer");
  console.log("Start both (dev):      pnpm dev");
  console.log(`${rule}\n`);
}

async function main() {
  banner();

  // 1. Environment
  console.log(`[setup] Node.js ${nodeVersion()} detected.`);
  if (!pnpmVersion()) {
    console.log("[setup] pnpm not found — bootstrapping via Corepack…");
    ensurePnpm();
    if (!pnpmVersion()) {
      console.error("[setup] Could not install pnpm. Run: npm install -g pnpm");
      process.exit(1);
    }
  }
  console.log(`[setup] pnpm ${pnpmVersion()} detected.`);

  // 2. Dependencies
  console.log("[setup] Installing workspace dependencies with pnpm…");
  const install = runCommand("pnpm", ["install"], { cwd: ROOT_DIR });
  if (install.status !== 0) {
    console.error("[setup] `pnpm install` failed. See the output above.");
    process.exit(1);
  }

  const existing = loadConfig();

  // 3. Visualizer URL
  const visualizerUrl = await ask(
    "Visualizer URL (where visualizer runs)",
    existing.visualizerUrl || DEFAULTS.visualizerUrl,
  );
  let url;
  try {
    url = new URL(visualizerUrl);
  } catch {
    console.error(`[setup] "${visualizerUrl}" is not a valid URL.`);
    process.exit(1);
  }
  // Normalize: drop a single trailing slash so `http://localhost:3000/`
  // becomes `http://localhost:3000`.
  const normalizedUrl = url.toString().replace(/\/$/, "");

  // 4. Port
  const portRaw = await ask(
    "WebSocket port for the trackdp-agent",
    String(existing.port ?? DEFAULTS.port),
  );
  const requestedPort = Number.parseInt(portRaw, 10);
  if (
    !Number.isInteger(requestedPort) ||
    requestedPort < 1 ||
    requestedPort > 65535
  ) {
    console.error(`[setup] "${portRaw}" is not a valid port.`);
    process.exit(1);
  }

  // 5. Port conflict resolution
  let port = requestedPort;
  if (!(await isPortAvailable(requestedPort))) {
    console.warn(`[setup] Port ${requestedPort} is already in use.`);
    const fallback = await findAvailablePort(requestedPort + 1);
    const useFallback = await confirm(`Use port ${fallback} instead?`, "y");
    port = useFallback
      ? fallback
      : Number.parseInt(
          await ask("Enter a different port", String(requestedPort)),
          10,
        );
  }

  // 6. Visualizer verification (reachability + marker)
  await verifyVisualizer(normalizedUrl);

  // 7. Save trackdp-agent config
  const config = { ...existing, visualizerUrl: normalizedUrl, port };
  saveConfig(config);
  console.log(`[setup] Agent config written to ${CONFIG_PATH}`);

  // 8. Point the trackdp-visualizer at the trackdp-agent
  writeVisualizerEnv(port);

  // 9. Handshake self-test
  const handshakeOk = await selfTestHandshake(port);
  console.log(
    handshakeOk
      ? "[setup] Handshake OK — the trackdp-agent accepted a visualizer hello."
      : "[setup] Handshake self-test failed. You can still run `pnpm trackdp-agent` manually.",
  );

  // 10. Summary + optional start
  printSummary(config, port, handshakeOk);

  const start = await confirm("Start the trackdp-agent now?", "y");
  rl.close();

  if (start) {
    const child = spawn(process.execPath, ["trackdp-agent.mjs"], {
      cwd: AGENT_DIR,
      stdio: "inherit",
    });
    child.on("exit", () => process.exit(0));
    return;
  }

  console.log("[setup] Done. Start the trackdp-agent later with: pnpm trackdp-agent");
}

main();
