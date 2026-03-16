import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    .pin-wrap {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -100%);
      z-index: 1000; pointer-events: none;
      display: flex; flex-direction: column; align-items: center;
    }
    .pin-head {
      width: 28px; height: 28px; border-radius: 50% 50% 50% 0;
      background: #EF4444; transform: rotate(-45deg);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .pin-head::after {
      content: ''; width: 10px; height: 10px; border-radius: 50%;
      background: white; transform: rotate(45deg);
    }
    .pin-shadow {
      width: 12px; height: 5px; border-radius: 50%;
      background: rgba(0,0,0,0.15); margin-top: 2px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="pin-wrap"><div class="pin-head"></div><div class="pin-shadow"></div></div>
  <script>
    var map = L.map('map', {
      center: [${lat}, ${lng}],
      zoom: 15,
      zoomControl: false,
      attributionControl: false
    });
    L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    // Send center coordinates on move
    var debounce = null;
    map.on('moveend', function() {
      clearTimeout(debounce);
      debounce = setTimeout(function() {
        var c = map.getCenter();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'move',
          latitude: c.lat,
          longitude: c.lng
        }));
      }, 300);
    });

    // Listen for commands from React Native
    window.addEventListener('message', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'flyTo') {
          map.flyTo([data.latitude, data.longitude], 16, { duration: 1 });
        }
      } catch(err) {}
    });
    document.addEventListener('message', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'flyTo') {
          map.flyTo([data.latitude, data.longitude], 16, { duration: 1 });
        }
      } catch(err) {}
    });
  </script>
</body>
</html>
`;

export default function MapPicker({ onLocationSelect, initialLocation, title }: MapPickerProps) {
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

  // Get user location on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setInitializing(false); return; }
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>((r) => setTimeout(() => r(null), 8000)),
        ]) || await Location.getLastKnownPositionAsync().catch(() => null);

        if (loc && 'coords' in loc) {
          const c = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setCoords(c);
          // Fly map to user location
          webRef.current?.postMessage(JSON.stringify({ type: 'flyTo', ...c }));
          resolveAddress(c.latitude, c.longitude);
        }
      } catch {} finally {
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

  const handleMapMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'move') {
        setCoords({ latitude: data.latitude, longitude: data.longitude });
        resolveAddress(data.latitude, data.longitude);
      }
    } catch {}
  }, [resolveAddress]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    Keyboard.dismiss();
    setSearching(true);
    try {
      const results = await Location.geocodeAsync(searchQuery.trim());
      if (results?.[0]) {
        const { latitude, longitude } = results[0];
        setCoords({ latitude, longitude });
        webRef.current?.postMessage(JSON.stringify({ type: 'flyTo', latitude, longitude }));
        resolveAddress(latitude, longitude);
      } else {
        Alert.alert('Not Found', 'Try a more specific address or place name.');
      }
    } catch {
      Alert.alert('Error', 'Search failed. Try again.');
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
        Alert.alert('GPS Slow', 'Could not get location. Move the map manually.');
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
        source={{ html: getMapHTML(coords.latitude, coords.longitude) }}
        style={styles.map}
        onMessage={handleMapMessage}
        onLoad={() => { setMapReady(true); setInitializing(false); }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        originWhitelist={['*']}
        userAgent="OMJI/1.0"
        mixedContentMode="always"
      />

      {/* My Location FAB */}
      <TouchableOpacity style={styles.locationFab} onPress={goToMyLocation} activeOpacity={0.8}>
        <Ionicons name="navigate" size={moderateScale(20)} color="#3B82F6" />
      </TouchableOpacity>

      {/* Bottom Card */}
      <View style={styles.bottomCard}>
        <View style={styles.addressRow}>
          <View style={styles.addressDot} />
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

      {/* Loading overlay - only shows briefly while GPS initializes */}
      {initializing && !mapReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ color: '#6B7280', marginTop: 8 }}>Loading map...</Text>
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
    bottom: verticalScale(160),
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
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(16),
    paddingBottom: Platform.OS === 'ios' ? verticalScale(28) : verticalScale(14),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: verticalScale(14),
    gap: moderateScale(12),
  },
  addressDot: {
    width: moderateScale(12),
    height: moderateScale(12),
    borderRadius: moderateScale(6),
    backgroundColor: '#EF4444',
    marginTop: 4,
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
    paddingVertical: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    gap: moderateScale(8),
  },
  confirmText: {
    color: '#fff',
    fontSize: fontScale(16),
    fontWeight: 'bold',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
});
