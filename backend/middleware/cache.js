// Tiny in-process TTL cache for stable reference/read endpoints.
//
// Strategy (kept deliberately simple and always-correct for a low-write admin app):
//   • cacheRoute(ttl) memoises a GET response for `ttl` ms, keyed per user+URL.
//   • flushCacheOnWrite() clears the WHOLE cache after any successful mutating
//     request. Writes are infrequent here, so a full flush is cheap and means we
//     never serve stale data — no per-entity invalidation map to maintain.
//   • The short TTL is the safety net (bounds staleness even if a flush is missed,
//     and works correctly even if the app is ever run as multiple instances).

const store = new Map(); // key -> { value, expires }

export function cacheFlush() {
  store.clear();
}

// Wrap a GET route: serve from the SERVER-side cache when fresh, otherwise
// compute and store. Must be mounted AFTER `auth` so req.user exists and
// unauthenticated requests never hit the cache.
//
// We send `Cache-Control: private, no-cache` (NOT max-age): the browser may store
// the response but must always revalidate with the server before using it. That
// keeps reads fast (server cache / a cheap 304) while guaranteeing the client sees
// fresh data immediately after a write — a `max-age` here made the browser serve
// its own stale copy for N seconds even after the server cache was flushed.
export function cacheRoute(ttlMs) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();

    const key = `${req.user?.id ?? 'anon'}:${req.user?.role ?? '-'}:${req.originalUrl}`;
    const entry = store.get(key);
    if (entry && Date.now() < entry.expires) {
      res.set('Cache-Control', 'private, no-cache');
      return res.json(entry.value); // Express adds an ETag for revalidation
    }
    if (entry) store.delete(key); // expired

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        store.set(key, { value: body, expires: Date.now() + ttlMs });
      }
      res.set('Cache-Control', 'private, no-cache');
      return originalJson(body);
    };
    next();
  };
}

// Flush the cache once any non-GET request completes successfully, so the next
// read recomputes fresh data.
export function flushCacheOnWrite() {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) cacheFlush();
    });
    next();
  };
}
