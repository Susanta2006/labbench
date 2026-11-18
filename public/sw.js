// LabBench service worker.
// BUILD_ID is stamped on every build by scripts/stamp-sw.mjs. A changed file is what makes
// browsers install a new worker. The new worker waits until the page asks it to take over
// (the "update ready" banner), so a student is never interrupted mid-session.
const BUILD_ID = "local-1795023380109";
const CACHE_NAME = `labbench-shell-${BUILD_ID}`;
const APP_SHELL = [
  "/",
  "/site.webmanifest",
  "/icon.svg",
  "/web-app-manifest-192x192.png",
  "/web-app-manifest-512x512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // Deliberately no skipWaiting(): the running app decides when to switch.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("labbench-shell-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function remember(request, response) {
  if (response.ok) {
    const copy = response.clone();
    return caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).then(() => response);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Pages: always try the network first so the newest HTML (and its asset names) is used.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => remember(request, response))
        .catch(async () => (await caches.match(request)) || (await caches.match("/")) || Response.error()),
    );
    return;
  }

  // Hashed build assets never change under the same name, so cache-first is safe.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => remember(request, response))),
    );
    return;
  }

  // Other same-origin files (python-worker.js, sql-wasm.js, icons, styles) keep their names
  // across deployments, so they must be network-first. Cache-first here would keep old copies.
  if (["script", "style", "font", "image", "worker"].includes(request.destination)) {
    event.respondWith(
      fetch(request)
        .then((response) => remember(request, response))
        .catch(() => caches.match(request).then((cached) => cached || Response.error())),
    );
  }
});
