import { useState, useEffect, useRef } from 'react';
import { LocationData } from '../types';

/**
 * Calculates straight-line distance using the Haversine formula (fallback).
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
  return R * c;
}

/**
 * Fetches real road distance & duration from OSRM (free, no API key).
 * Falls back to haversine if the request fails.
 */
export async function getRoadDistance(
  point1: LocationData,
  point2: LocationData,
): Promise<{ distance: number; duration: number }> {
  if (point1.latitude == null || point2.latitude == null) return { distance: 0, duration: 0 };

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${point1.longitude},${point1.latitude};${point2.longitude},${point2.latitude}?overview=false`;
    const res = await fetch(url, { headers: { 'User-Agent': 'OMJI-App' } });
    const data = await res.json();

    if (data.code === 'Ok' && data.routes?.length > 0) {
      const route = data.routes[0];
      return {
        distance: route.distance / 1000, // meters to km
        duration: Math.ceil(route.duration / 60), // seconds to minutes
      };
    }
  } catch {
    // fall through to haversine
  }

  const fallbackDist = calculateDistance(point1, point2);
  return {
    distance: fallbackDist,
    duration: Math.ceil((fallbackDist / 30) * 60), // estimate at 30 km/h
  };
}

/**
 * React hook for real-time road distance between two locations.
 * Automatically fetches when coordinates change.
 */
export function useRoadDistance(pickup: LocationData, dropoff: LocationData) {
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (pickup.latitude == null || dropoff.latitude == null) {
      setDistance(0);
      setDuration(0);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getRoadDistance(pickup, dropoff).then((result) => {
      if (!cancelled) {
        setDistance(result.distance);
        setDuration(result.duration);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [pickup.latitude, pickup.longitude, dropoff.latitude, dropoff.longitude]);

  return { distance, duration, loading };
}
