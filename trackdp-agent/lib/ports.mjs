import { createServer } from "node:net";

/**
 * Check whether a TCP port is free on the given host.
 * Resolves to `true` when the port can be bound, `false` otherwise.
 */
export function isPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

/**
 * Find the first available port starting at `startPort` and scanning upwards.
 * Throws when no free port can be found within `maxTries` attempts.
 */
export async function findAvailablePort(
  startPort,
  host = "127.0.0.1",
  maxTries = 100,
) {
  for (let offset = 0; offset < maxTries; offset += 1) {
    const port = startPort + offset;
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }

  throw new Error(
    `No available port found between ${startPort} and ${startPort + maxTries - 1}.`,
  );
}
