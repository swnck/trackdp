import { execSync, spawnSync } from "node:child_process";

/**
 * Run a command, streaming its output to the current process.
 * Uses a shell so shims such as `pnpm` and `corepack` resolve correctly.
 */
export function runCommand(command, args = [], options = {}) {
  const fullCommand = [command, ...args].join(" ");
  return spawnSync(fullCommand, {
    // Ignore stdin so interactive prompts (readline) are never consumed by
    // the child process; still stream stdout/stderr to the user.
    stdio: ["ignore", "inherit", "inherit"],
    shell: true,
    ...options,
  });
}

/** Return the current Node.js version string, e.g. `v20.11.0`. */
export function nodeVersion() {
  return process.version;
}

/** Return the installed pnpm version, or `null` when it is missing. */
export function pnpmVersion() {
  try {
    return execSync("pnpm --version", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Make sure pnpm is available. When it is missing we try to bootstrap it via
 * Corepack (bundled with Node.js >= 16.13). Returns true when pnpm is usable.
 */
export function ensurePnpm(version = "12.15.0") {
  if (pnpmVersion()) {
    return true;
  }

  console.log("[env] pnpm not found — bootstrapping via Corepack…");
  runCommand("corepack", ["enable"]);
  runCommand("corepack", ["prepare", `pnpm@${version}`, "--activate"]);

  return Boolean(pnpmVersion());
}
