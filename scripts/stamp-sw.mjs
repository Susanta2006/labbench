// Stamps a new BUILD_ID into public/sw.js on every build. A changed sw.js is what makes browsers
// install a new service worker, so installed copies of LabBench learn about each deployment.
// Run automatically by `npm run build` (see package.json). Idempotent.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MARKER = /const BUILD_ID = "[^"]*";/;

/** Returns the service worker source with its BUILD_ID replaced. Throws if the marker is missing. */
export function stampSource(source, buildId) {
  if (!MARKER.test(source)) throw new Error("sw.js is missing its BUILD_ID line");
  return source.replace(MARKER, `const BUILD_ID = "${buildId}";`);
}

export function buildIdFromEnv(env = process.env, now = Date.now()) {
  const sha = env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || env.COMMIT_REF;
  return sha ? sha.slice(0, 12) : `local-${now}`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const file = fileURLToPath(new URL("../public/sw.js", import.meta.url));
  const id = buildIdFromEnv();
  writeFileSync(file, stampSource(readFileSync(file, "utf8"), id));
  console.log(`[stamp-sw] service worker build id: ${id}`);
}
