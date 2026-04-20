// Shared geographic coordinate utilities.
// Centralizes the validation, clamping, and equality checks that were
// previously reimplemented (often inconsistently) across map screens.

export const BALINGASAG = { latitude: 8.4343, longitude: 124.7762 } as const;

export type LatLng = { latitude: number; longitude: number };

/**
 * A coordinate is valid if it's a finite number within Earth bounds AND
 * not the (0, 0) sentinel that backends use to mean "unknown".
 */
export function isValidCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/** Validate a {latitude, longitude} object. */
export function isValidLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  if (!p) return false;
  return isValidCoord(p.latitude, p.longitude);
}

/**
 * Clamp lat/lng into Earth bounds. Use defensively when accepting coords
 * from APIs or user input. Does NOT replace the (0,0) sentinel — caller
 * must check isValidCoord separately if that matters.
 */
export function clampCoord(lat: number, lng: number): LatLng {
  return {
    latitude: Math.max(-90, Math.min(90, lat)),
    longitude: Math.max(-180, Math.min(180, lng)),
  };
}

/** Approximate equality for coordinates (default ~1.1m at the equator). */
export function coordsEqual(a: LatLng, b: LatLng, eps = 0.00001): boolean {
  return Math.abs(a.latitude - b.latitude) < eps && Math.abs(a.longitude - b.longitude) < eps;
}

/** Format coords for human display, e.g. "8.4343, 124.7762". */
export function formatCoord(lat: number, lng: number, precision = 4): string {
  return `${lat.toFixed(precision)}, ${lng.toFixed(precision)}`;
}
