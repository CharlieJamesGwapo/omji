import { LocationData } from '../types';

/**
 * Calculates the distance between two coordinates using the Haversine formula.
 * Returns distance in kilometers.
 */
export function calculateDistance(point1: LocationData, point2: LocationData): number {
  if (!point1.latitude || !point2.latitude) return 0;

  const R = 6371; // Earth's radius in km
  const dLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const dLon = ((point2.longitude - point1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.latitude * Math.PI) / 180) *
      Math.cos((point2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
