type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

declare global {
  // eslint-disable-next-line no-var
  var __perpDashboardCache: Map<string, CacheEntry<unknown>> | undefined;
}

const memoryCache = globalThis.__perpDashboardCache ?? new Map<string, CacheEntry<unknown>>();
globalThis.__perpDashboardCache = memoryCache;

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = memoryCache.get(key) as CacheEntry<T> | undefined;

  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  const value = loader();
  memoryCache.set(key, { expiresAt: now + ttlMs, value });

  try {
    return await value;
  } catch (error) {
    memoryCache.delete(key);
    throw error;
  }
}
