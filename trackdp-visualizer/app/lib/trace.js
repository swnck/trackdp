/**
 * Parsing helpers for `traceroute` / `tracert` output.
 *
 * Handles both common line shapes:
 *   macOS   ` 1  router.local (192.168.1.1)  1.234 ms  1.456 ms  1.789 ms`
 *   Windows `  1     1 ms     1 ms     1 ms  192.168.1.1`
 * plus timeouts (`*`) and Windows' sub-millisecond `<1 ms` form.
 */

const TIME_RE = /(?:<\s*)?\d+(?:\.\d+)?\s*ms|\*/g;
const IP_RE = /\d{1,3}(?:\.\d{1,3}){3}/;

export function parseHopLine(raw) {
  if (typeof raw !== "string") return null;

  const line = raw.trim();
  if (!line) return null;

  const hopMatch = line.match(/^\s*(\d+)\s+/);
  if (!hopMatch) return null;

  const hop = Number(hopMatch[1]);
  if (!Number.isFinite(hop) || hop < 1) return null;

  const rest = line.slice(hopMatch[0].length);

  // Collect every probe result in order (`*` → null).
  const times = [];
  const tokens = rest.match(TIME_RE) || [];
  for (const token of tokens) {
    if (token === "*") {
      times.push(null);
    } else {
      const num = parseFloat(token.replace(/[<\s]/g, ""));
      times.push(Number.isFinite(num) ? num : null);
    }
  }

  // Whatever is left after removing the numbers is the host / IP.
  const host = rest
    .replace(TIME_RE, "")
    .replace(/[[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const ip = host.match(IP_RE)?.[0] ?? "";

  // Prefer a hostname over the raw IP for the label.
  let label = "";
  for (const word of host.split(" ")) {
    if (word && !IP_RE.test(word)) {
      label = word;
      break;
    }
  }
  if (!label) label = ip || `hop ${hop}`;

  const valid = times.filter((t) => t !== null);
  const avg = valid.length
    ? valid.reduce((a, b) => a + b, 0) / valid.length
    : null;
  const min = valid.length ? Math.min(...valid) : null;
  const max = valid.length ? Math.max(...valid) : null;

  return {
    hop,
    host,
    ip,
    label,
    times,
    avg,
    min,
    max,
    timeout: valid.length === 0,
  };
}

export function formatMs(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1) return `${value.toFixed(2)} ms`;
  if (value < 10) return `${value.toFixed(1)} ms`;
  return `${Math.round(value)} ms`;
}

/**
 * Format a hop's resolved name for display, e.g. `router.local (192.168.1.1)`.
 * Returns `null` when there is nothing extra worth showing — a pure IP
 * (already visible elsewhere) or an empty/placeholder label.
 */
export function formatHopHost(hop) {
  const name = hop?.label;
  if (!name || name === `hop ${hop.hop}`) return null;
  if (name === hop.ip) return null; // pure IP — nothing extra
  if (hop.ip) return `${name} (${hop.ip})`;
  return name;
}
