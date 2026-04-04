import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RESPONSIVE, fontScale, verticalScale, moderateScale } from '../utils/responsive';

interface MapPickerProps {
  onLocationSelect: (location: {
    address: string;
    latitude: number;
    longitude: number;
  }) => void;
  initialLocation?: {
    latitude: number;
    longitude: number;
  };
  title?: string;
}

// Default center: Balingasag
const DEFAULT_LAT = 8.4343;
const DEFAULT_LNG = 124.7762;

const getMapHTML = (lat: number, lng: number) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css" crossorigin="" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #ECEEF1; }
    .leaflet-control-attribution { display: none !important; }
    .pin-wrap {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -100%);
      z-index: 1000; pointer-events: none;
      display: flex; flex-direction: column; align-items: center;
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.25));
    }
    .pin-head {
      width: 32px; height: 32px; border-radius: 50% 50% 50% 0;
      background: linear-gradient(135deg, #EF4444, #DC2626); transform: rotate(-45deg);
      display: flex; align-items: center; justify-content: center;
    }
    .pin-head::after {
      content: ''; width: 11px; height: 11px; border-radius: 50%;
      background: white; transform: rotate(45deg);
    }
    .pin-pulse {
      width: 16px; height: 6px; border-radius: 50%;
      background: rgba(239,68,68,0.2); margin-top: 3px;
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scaleX(1); opacity: 0.4; }
      50% { transform: scaleX(1.6); opacity: 0.15; }
    }
    #map.moving .pin-wrap { transform: translate(-50%, -110%); transition: transform 0.15s; }
    #map:not(.moving) .pin-wrap { transform: translate(-50%, -100%); transition: transform 0.15s; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="pin-wrap"><div class="pin-head"></div><div class="pin-pulse"></div></div>
  <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js" crossorigin=""></script>
  <script>
    var mapEl = document.getElementById('map');
    var map = L.map('map', {
      center: [${lat}, ${lng}],
      zoom: 16,
      zoomControl: false,
      attributionControl: false
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      keepBuffer: 8,
      updateWhenZooming: false,
      updateWhenIdle: true,
      subdomains: 'abcd',
      attribution: '',
      fadeAnimation: true,
      zoomAnimation: true
    }).addTo(map);

    // Notify RN when map is ready
    map.whenReady(function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
    });

    // Animate pin on drag
    map.on('movestart', function() { mapEl.classList.add('moving'); });
    map.on('moveend', function() {
      mapEl.classList.remove('moving');
      var c = map.getCenter();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'move', latitude: c.lat, longitude: c.lng
      }));
    });

    // Listen for commands from React Native
    function handleMsg(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'flyTo') {
          map.flyTo([data.latitude, data.longitude], data.zoom || 16, { duration: 0.8 });
        } else if (data.type === 'setView') {
          map.setView([data.latitude, data.longitude], data.zoom || 16, { animate: false });
        }
      } catch(err) {}
    }
    window.addEventListener('message', handleMsg);
    document.addEventListener('message', handleMsg);
  </script>
</body>
</html>
`;

export default function MapPicker({ onLocationSelect, initialLocation, title }: MapPickerProps) {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [address, setAddress] = useState('');
  const [resolving, setResolving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [coords, setCoords] = useState({
    latitude: initialLocation?.latitude || DEFAULT_LAT,
    longitude: initialLocation?.longitude || DEFAULT_LNG,
  });
  const [mapReady, setMapReady] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLocationSent = useRef(false);

  // Memoize the HTML so WebView doesn't re-render unnecessarily
  const mapHTML = useMemo(
    () => getMapHTML(coords.latitude, coords.longitude),
    // Only generate HTML once with initial coords
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Get user location on mount (runs in parallel with WebView loading)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setInitializing(false); return; }

        // Try last known first (instant), then get fresh position
        const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
        if (lastKnown && 'coords' in lastKnown && !initialLocationSent.current) {
          const c = { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
          setCoords(c);
          initialLocationSent.current = true;
          webRef.current?.postMessage(JSON.stringify({ type: 'setView', ...c }));
          resolveAddress(c.latitude, c.longitude);
        }

        // Then get accurate position in background
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>((r) => setTimeout(() => r(null), 8000)),
        ]);

        if (loc && 'coords' in loc) {
          const c = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setCoords(c);
          initialLocationSent.current = true;
          webRef.current?.postMessage(JSON.stringify({ type: 'flyTo', ...c }));
          resolveAddress(c.latitude, c.longitude);
        }
      } catch {
        // Location permission denied or unavailable - map still usable with manual selection
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const resolveAddress = useCallback(async (lat: number, lng: number) => {
    setResolving(true);
    try {
      const result = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (result?.[0]) {
        const loc = result[0];
        const parts = [loc.streetNumber, loc.street, loc.subregion, loc.city, loc.region].filter(Boolean);
        const formatted = parts.length > 0 ? parts.join(', ') : [loc.name, loc.city, loc.region].filter(Boolean).join(', ');
        setAddress(formatted || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      } else {
        setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    } catch {
      setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } finally {
      setResolving(false);
    }
  }, []);

  // Debounce reverse geocoding to avoid spamming the API on every pixel of pan
  const debouncedResolveAddress = useCallback((lat: number, lng: number) => {
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(() => {
      resolveAddress(lat, lng);
    }, 400);
  }, [resolveAddress]);

  const handleMapMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'move') {
        setCoords({ latitude: data.latitude, longitude: data.longitude });
        debouncedResolveAddress(data.latitude, data.longitude);
      } else if (data.type === 'ready') {
        setMapReady(true);
        setInitializing(false);
      }
    } catch {
      // Ignore malformed WebView messages
    }
  }, [debouncedResolveAddress]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    Keyboard.dismiss();
    setSearching(true);
    try {
      // Try expo geocoding first
      const results = await Location.geocodeAsync(searchQuery.trim());
      if (results?.[0]) {
        const { latitude, longitude } = results[0];
        setCoords({ latitude, longitude });
        webRef.current?.postMessage(JSON.stringify({ type: 'flyTo', latitude, longitude }));
        resolveAddress(latitude, longitude);
        return;
      }
      // Fallback: Nominatim (better for Philippine addresses)
      const query = encodeURIComponent(searchQuery.trim());
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${query}&countrycodes=ph&limit=1`,
        { headers: { 'User-Agent': 'OneRide-App/1.0' } }
      );
      const data = await res.json();
      if (data?.[0]) {
        const latitude = parseFloat(data[0].lat);
        const longitude = parseFloat(data[0].lon);
        setCoords({ latitude, longitude });
        webRef.current?.postMessage(JSON.stringify({ type: 'flyTo', latitude, longitude }));
        resolveAddress(latitude, longitude);
      } else {
        Alert.alert('Not Found', 'Try a more specific address or place name.');
      }
    } catch {
      Alert.alert('Error', 'Search failed. Check your connection and try again.');
    } finally {
      setSearching(false);
    }
  };

  const goToMyLocation = async () => {
    try {
      setResolving(true);
      const loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ]);
      if (loc && 'coords' in loc) {
        const c = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setCoords(c);
        webRef.current?.postMessage(JSON.stringify({ type: 'flyTo', ...c }));
        resolveAddress(c.latitude, c.longitude);
      } else {
        // Try last known position as fallback instead of showing alert
        const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
        if (lastKnown && 'coords' in lastKnown) {
          const c = { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
          setCoords(c);
          webRef.current?.postMessage(JSON.stringify({ type: 'flyTo', ...c }));
          resolveAddress(c.latitude, c.longitude);
        }
      }
    } catch {
      Alert.alert('Error', 'Failed to get location.');
    } finally {
      setResolving(false);
    }
  };

  const confirmLocation = () => {
    if (!address || coords.latitude === 0) {
      Alert.alert('Move the Map', 'Please move the map to select a location.');
      return;
    }
    onLocationSelect({
      address,
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchOverlay}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={moderateScale(16)} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search any place..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={moderateScale(18)} color="#D1D5DB" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.searchBtn, (!searchQuery.trim() || searching) && { opacity: 0.4 }]}
            onPress={handleSearch}
            disabled={!searchQuery.trim() || searching}
          >
            {searching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="arrow-forward" size={moderateScale(14)} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Map WebView */}
      <WebView
        ref={webRef}
        source={{ html: mapHTML }}
        style={styles.map}
        onMessage={handleMapMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        originWhitelist={['*']}
        mixedContentMode="always"
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        startInLoadingState={false}
        renderToHardwareTextureAndroid={true}
        androidLayerType="hardware"
      />

      {/* My Location FAB */}
      <TouchableOpacity style={styles.locationFab} onPress={goToMyLocation} activeOpacity={0.8}>
        <Ionicons name="navigate" size={moderateScale(20)} color="#3B82F6" />
      </TouchableOpacity>

      {/* Bottom Card */}
      <View style={[styles.bottomCard, { paddingBottom: Math.max(insets.bottom, verticalScale(16)) + verticalScale(12) }]}>
        <View style={styles.handleBar} />
        <View style={styles.addressRow}>
          <View style={styles.addressDotContainer}>
            <View style={styles.addressDot} />
            <View style={styles.addressDotPulse} />
          </View>
          <View style={{ flex: 1 }}>
            {resolving ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color="#3B82F6" />
                <Text style={styles.resolvingText}>Finding address...</Text>
              </View>
            ) : (
              <>
                <Text style={styles.addressLabel}>Selected Location</Text>
                <Text style={styles.addressText} numberOfLines={2}>{address || 'Move the map to select'}</Text>
              </>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, (!address || resolving) && { opacity: 0.4 }]}
          onPress={confirmLocation}
          disabled={!address || resolving}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark-circle" size={moderateScale(20)} color="#fff" />
          <Text style={styles.confirmText}>Confirm Location</Text>
        </TouchableOpacity>
      </View>

      {/* Loading overlay - only shows briefly while initializing */}
      {!mapReady && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading map...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  map: { flex: 1 },
  searchOverlay: {
    position: 'absolute',
    top: verticalScale(10),
    left: RESPONSIVE.paddingHorizontal,
    right: RESPONSIVE.paddingHorizontal,
    zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    paddingHorizontal: moderateScale(12),
    paddingVertical: Platform.OS === 'ios' ? moderateScale(10) : moderateScale(2),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
    gap: moderateScale(6),
  },
  searchInput: {
    flex: 1,
    fontSize: fontScale(14),
    color: '#1F2937',
  },
  searchBtn: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationFab: {
    position: 'absolute',
    right: RESPONSIVE.paddingHorizontal,
    bottom: verticalScale(175),
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 10,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: moderateScale(24),
    borderTopRightRadius: moderateScale(24),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(8),
    // paddingBottom is applied dynamically via useSafeAreaInsets
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  handleBar: {
    width: moderateScale(36),
    height: moderateScale(4),
    borderRadius: moderateScale(2),
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: verticalScale(14),
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: verticalScale(16),
    gap: moderateScale(12),
  },
  addressDotContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: moderateScale(20),
    height: moderateScale(20),
    marginTop: 2,
  },
  addressDot: {
    width: moderateScale(12),
    height: moderateScale(12),
    borderRadius: moderateScale(6),
    backgroundColor: '#EF4444',
  },
  addressDotPulse: {
    position: 'absolute',
    width: moderateScale(20),
    height: moderateScale(20),
    borderRadius: moderateScale(10),
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  addressLabel: {
    fontSize: fontScale(11),
    color: '#9CA3AF',
    marginBottom: 2,
  },
  addressText: {
    fontSize: fontScale(14),
    fontWeight: '600',
    color: '#1F2937',
    lineHeight: verticalScale(20),
  },
  resolvingText: {
    fontSize: fontScale(13),
    color: '#6B7280',
  },
  confirmBtn: {
    flexDirection: 'row',
    backgroundColor: '#3B82F6',
    borderRadius: moderateScale(14),
    paddingVertical: moderateScale(18),
    alignItems: 'center',
    justifyContent: 'center',
    gap: moderateScale(8),
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  confirmText: {
    color: '#fff',
    fontSize: fontScale(17),
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: moderateScale(20),
    paddingVertical: moderateScale(14),
    borderRadius: moderateScale(12),
    gap: moderateScale(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  loadingText: {
    fontSize: fontScale(14),
    color: '#6B7280',
    fontWeight: '500',
  },
});
