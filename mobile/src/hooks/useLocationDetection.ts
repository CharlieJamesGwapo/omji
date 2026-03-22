import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { LocationData } from '../types';

interface UseLocationDetectionResult {
  location: LocationData;
  setLocation: (loc: LocationData) => void;
  detecting: boolean;
}

export function useLocationDetection(): UseLocationDetectionResult {
  const [location, setLocation] = useState<LocationData>({
    address: '',
    latitude: 0,
    longitude: 0,
  });
  const [detecting, setDetecting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setDetecting(false);
          return;
        }

        const locationPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 5000)
        );
        const loc = await Promise.race([locationPromise, timeoutPromise]);

        if (cancelled) return;

        if (loc && 'coords' in loc) {
          const result = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (cancelled) return;

          const addr = result?.[0];
          const parts = [
            addr?.streetNumber,
            addr?.street,
            addr?.subregion,
            addr?.city,
            addr?.region,
          ].filter(Boolean);
          const formatted =
            parts.length > 0
              ? parts.join(', ')
              : [addr?.name, addr?.city, addr?.region].filter(Boolean).join(', ');

          setLocation({
            address: formatted || 'Current Location',
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      } catch (e) {
        // Location detection failed silently - user can pick manually
      } finally {
        if (!cancelled) setDetecting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { location, setLocation, detecting };
}
