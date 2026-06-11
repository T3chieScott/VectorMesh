const CACHE_NAME = "vectormesh-player-v1";
const MEDIA_CACHE_NAME = "vectormesh-media-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME && n !== MEDIA_CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.match(/\/api\/player\/media\/[^/]+\/file/)) {
    event.respondWith(networkFirstMedia(event.request));
    return;
  }

  // Task #281: custom font files — cache like media so uploaded fonts
  // keep rendering when the device is offline.
  if (url.pathname.match(/\/api\/fonts\/[^/]+\/file/)) {
    event.respondWith(networkFirstMedia(event.request));
    return;
  }

  if (url.pathname.match(/\/api\/player\/[^/]+\/content/)) {
    event.respondWith(networkFirstContent(event.request));
    return;
  }

  if (url.pathname.match(/\/api\/player\/widgets\//)) {
    event.respondWith(networkFirstContent(event.request));
    return;
  }
});

async function networkFirstMedia(request) {
  const cache = await caches.open(MEDIA_CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cloned = response.clone();
      cache.put(stripQueryParams(request.url), cloned);
    }
    return response;
  } catch (e) {
    const cached = await cache.match(stripQueryParams(request.url));
    if (cached) return cached;
    return new Response("Offline - media not cached", { status: 503 });
  }
}

async function networkFirstContent(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request.url, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await cache.match(request.url);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function stripQueryParams(url) {
  const u = new URL(url);
  u.search = "";
  return u.toString();
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "PRECACHE_MEDIA") {
    event.waitUntil(precacheMedia(event.data.urls));
  }
  if (event.data && event.data.type === "CLEANUP_MEDIA") {
    event.waitUntil(cleanupMedia(event.data.keepUrls));
  }
});

async function precacheMedia(urls) {
  const cache = await caches.open(MEDIA_CACHE_NAME);
  const existingKeys = await cache.keys();
  const existingUrls = new Set(existingKeys.map((r) => r.url));

  for (const url of urls) {
    const cleanUrl = stripQueryParams(url);
    if (!existingUrls.has(cleanUrl)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          await cache.put(cleanUrl, response);
        }
      } catch (e) {}
    }
  }
}

async function cleanupMedia(keepUrls) {
  const cache = await caches.open(MEDIA_CACHE_NAME);
  const keep = new Set(keepUrls.map((u) => stripQueryParams(u)));
  const keys = await cache.keys();
  for (const request of keys) {
    if (!keep.has(request.url)) {
      await cache.delete(request);
    }
  }
}
