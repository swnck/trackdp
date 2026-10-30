import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Path to the user-editable configuration file. */
export const CONFIG_PATH = join(__dirname, "..", "trackdp.config.json");

/** Sensible defaults, merged with (and overridden by) the config file. */
export const DEFAULTS = {
  visualizerUrl: "http://localhost:3000",
  host: "127.0.0.1",
  port: 8787,
  protocol: 1,
  handshakeTimeoutMs: 5000,
};

/**
 * Load the configuration from disk, falling back to defaults when the file is
 * missing or malformed.
 */
export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULTS };
  }

  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return { ...DEFAULTS, ...raw };
  } catch (error) {
    console.warn(
      `[config] Could not parse ${CONFIG_PATH}, using defaults (${error.message}).`,
    );
    return { ...DEFAULTS };
  }
}

/** Persist the configuration to disk. */
export function saveConfig(config) {
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}
