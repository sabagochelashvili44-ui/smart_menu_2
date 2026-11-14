const TTL_MS = 5 * 60 * 1000;

type Box<T> = { value: T; exp: number };

const store = new Map<string, Box<unknown>>();

export function cachedInsight<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function storeInsight<T>(key: string, value: T) {
  store.set(key, { value, exp: Date.now() + TTL_MS });
}

export function digestCacheKey(
  restaurantId: string,
  locale: string,
  revenue: number,
  orderCount: number,
  lane = "food",
) {
  return `digest:${restaurantId}:${locale}:${lane}:${revenue.toFixed(2)}:${orderCount}`;
}

export function insightsCacheKey(
  restaurantId: string,
  locale: string,
  window: string,
  from: string,
  to: string,
  revenue: number,
  orderCount: number,
) {
  return `insights:${restaurantId}:${locale}:${window}:${from}:${to}:${revenue.toFixed(2)}:${orderCount}`;
}
