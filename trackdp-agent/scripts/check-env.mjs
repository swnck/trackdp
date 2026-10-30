#!/usr/bin/env node
/**
 * Report the Node.js and pnpm versions, installing pnpm via Corepack when it
 * is missing. Exits non-zero when the environment cannot be made ready.
 */
import { ensurePnpm, nodeVersion, pnpmVersion } from "../lib/env.mjs";

const REQUIRED_NODE_MAJOR = 18;

function main() {
  console.log(`Node.js:  ${nodeVersion()}`);

  const major = Number.parseInt(nodeVersion().slice(1).split(".")[0], 10);
  if (Number.isNaN(major) || major < REQUIRED_NODE_MAJOR) {
    console.error(
      `Node.js ${REQUIRED_NODE_MAJOR}+ is required (found ${nodeVersion()}).`,
    );
    process.exit(1);
  }

  console.log(`pnpm:     ${pnpmVersion() ?? "not found"}`);

  if (!pnpmVersion()) {
    ensurePnpm();
    if (!pnpmVersion()) {
      console.error(
        "pnpm could not be installed automatically. Run: npm install -g pnpm",
      );
      process.exit(1);
    }
    console.log(`pnpm:     ${pnpmVersion()} (installed)`);
  }

  console.log("Environment is ready. Next: pnpm run setup");
}

main();
