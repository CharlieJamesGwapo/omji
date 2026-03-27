import { useState, useEffect, useRef, useCallback } from 'react';
import { LocationData } from '../types';

/**
 * Calculates straight-line distance using the Haversine formula (fallback only).
 */
export function calculateDistance(point1: LocationData, point2: LocationData): number {
  if (point1.latitude == null || point2.latitude == null) return 0;

  const R = 6371;
  const dLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const dLon = ((point2.longitude - point1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.latitude * Math.PI) / 180) *
      Math.cos((point2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // 1 decimal
}

/**
 * Fetches real road distance & duration from OSRM (free, no API key).
 * Falls back to haversine with a 1.4x road-factor if the request fails.
 */
export async function getRoadDistance(
  point1: LocationData,
  point2: LocationData,
  signal?: AbortSignal,
): Promise<{ distance: number; duration: number; isRoad: boolean }> {
  if (point1.latitude == null || point2.latitude == null) {
    return { distance: 0, duration: 0, isRoad: false };
  }

  // Try OSRM with retry (2 attempts)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${point1.longitude},${point1.latitude};${point2.longitude},${point2.latitude}?overview=false`;
      const res = await fetch(url, {
        signal,
        headers: { 'User-Agent': 'OMJI-App/1.0' },
      });

      if (!res.ok) {
        // Rate limited or server error — retry once
        if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        break;
      }

      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.length > 0) {
        const route = data.routes[0];
        return {
          distance: Math.round((route.distance / 1000) * 10) / 10, // km, 1 decimal
          duration: Math.ceil(route.duration / 60), // minutes
          isRoad: true,
        };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { distance: 0, duration: 0, isRoad: false };
      }
      // Network error — retry once
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
    }
  }

  // Fallback: Haversine × 1.4 road factor (roads are ~1.2-1.6x straight-line)
  const straightLine = calculateDistance(point1, point2);
  const estimatedRoad = Math.round(straightLine * 1.4 * 10) / 10;
  return {
    distance: estimatedRoad,
    duration: Math.ceil((estimatedRoad / 30) * 60), // ~30 km/h average
    isRoad: false,
  };
}

/**
 * React hook for real-time road distance between two locations.
 * Automatically fetches when coordinates change, with debounce and abort.
 */
export function useRoadDistance(pickup: LocationData, dropoff: LocationData) {
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isRoad, setIsRoad] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDistance = useCallback(() => {
    if (pickup.latitude == null || pickup.latitude === 0 ||
        dropoff.latitude == null || dropoff.latitude === 0) {
      setDistance(0);
      setDuration(0);
      setIsRoad(false);
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);

    getRoadDistance(pickup, dropoff, controller.signal).then((result) => {
      if (!controller.signal.aborted) {
        setDistance(result.distance);
        setDuration(result.duration);
        setIsRoad(result.isRoad);
        setLoading(false);
      }
    });
  }, [pickup.latitude, pickup.longitude, dropoff.latitude, dropoff.longitude]);

  useEffect(() => {
    // Debounce 300ms to avoid rapid re-fetches while user is still selecting
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchDistance, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [fetchDistance]);

  return { distance, duration, loading, isRoad };
}
