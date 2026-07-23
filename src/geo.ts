/**
 * Server-side IP geolocation for Austin geo-gating.
 *
 * Uses the free ip-api.com service (no API key, 45 req/min limit).
 * Falls back gracefully: if the API is unreachable or returns an
 * unexpected response, we default to isAustinMetro: false (safe:
 * shows the waitlist rather than opening signup to everyone).
 */

const AUSTIN_METRO_CITIES = new Set([
  "austin",
  "round rock",
  "cedar park",
  "pflugerville",
  "georgetown",
  "san marcos",
  "buda",
  "kyle",
  "leander",
  "hutto",
  "manor",
  "bee cave",
  "lakeway",
  "dripping springs",
  "elgin",
  "bastrop",
]);

export interface GeoResult {
  city: string | null;
  region: string | null;
  isAustinMetro: boolean;
}

/**
 * Extract the client IP from request headers.
 * Works behind proxies (Vercel, nginx, etc.) that set x-forwarded-for
 * or x-real-ip.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

/**
 * Call the ip-api.com free geolocation API.
 * Returns { city, region } on success, or a default on failure.
 */
async function fetchIpApi(ip: string): Promise<{ city: string | null; region: string | null }> {
  try {
    // ip-api.com free tier: no key, 45 req/min, HTTP only
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=city,regionName`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });

    if (!res.ok) {
      console.warn(`[geo] ip-api.com returned ${res.status}`);
      return { city: null, region: null };
    }

    const data = await res.json();
    return {
      city: data.city ?? null,
      region: data.regionName ?? null,
    };
  } catch (err) {
    console.warn("[geo] ip-api.com fetch failed:", err);
    return { city: null, region: null };
  }
}

/**
 * Determine whether a city + region pair falls within the Austin metro area.
 */
function isAustinMetro(city: string | null, region: string | null): boolean {
  if (!city || !region) return false;

  const regionNorm = region.toLowerCase().trim();
  if (regionNorm !== "tx" && regionNorm !== "texas") return false;

  const cityNorm = city.toLowerCase().trim();
  return AUSTIN_METRO_CITIES.has(cityNorm);
}

/**
 * Get approximate location from a Request's IP address.
 * Returns { city, region, isAustinMetro }.
 * Safe default: isAustinMetro = false if anything fails.
 */
export async function getApproximateLocation(req: Request): Promise<GeoResult> {
  const ip = getClientIp(req);

  // Skip lookup for loopback/local IPs in dev
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return { city: null, region: null, isAustinMetro: false };
  }

  const { city, region } = await fetchIpApi(ip);
  const metro = isAustinMetro(city, region);

  return { city, region, isAustinMetro: metro };
}
