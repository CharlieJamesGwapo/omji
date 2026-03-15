import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../utils/responsive';

// Lazy import MapView to catch crashes on devices without Google Maps
let MapView: any = null;
let PROVIDER_DEFAULT: any = null;
try {
  const maps = require('react-native-maps');
  MapView = maps.default;
  PROVIDER_DEFAULT = maps.PROVIDER_DEFAULT;
} catch {
  // Maps not available
}

const { width, height } = Dimensions.get('window');

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

export default function MapPicker({
  onLocationSelect,
  initialLocation,
  title = 'Select Location',
}: MapPickerProps) {
  const mapRef = useRef<any>(null);

  const [region, setRegion] = useState({
    latitude: initialLocation?.latitude ?? 8.4343,
    longitude: initialLocation?.longitude ?? 124.7762,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  });

  const [centerCoord, setCenterCoord] = useState({
    latitude: initialLocation?.latitude ?? 8.4343,
    longitude: initialLocation?.longitude ?? 124.7762,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [address, setAddress] = useState('');
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(!initialLocation);
  const [locationPermission, setLocationPermission] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [mapError, setMapError] = useState(!MapView);

  const resolveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    initLocation();
    return () => {
      if (resolveTimeout.current) clearTimeout(resolveTimeout.current);
    };
  }, []);

  const initLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setLocationPermission(granted);

      if (granted && !initialLocation) {
        // Use timeout to prevent hanging on Android
        const locationPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 5000)
        );

        const loc = await Promise.race([locationPromise, timeoutPromise]);

        if (loc && 'coords' in loc) {
          const coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setCenterCoord(coords);
          setRegion({ ...coords, latitudeDelta: 0.005, longitudeDelta: 0.005 });
          mapRef.current?.animateToRegion(
            { ...coords, latitudeDelta: 0.005, longitudeDelta: 0.005 },
            500
          );
          await getAddressFromCoords(coords.latitude, coords.longitude);
        } else {
          // Timeout: use last known location or default
          try {
            const lastKnown = await Location.getLastKnownPositionAsync();
            if (lastKnown) {
              const coords = { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
              setCenterCoord(coords);
              setRegion({ ...coords, latitudeDelta: 0.005, longitudeDelta: 0.005 });
              await getAddressFromCoords(coords.latitude, coords.longitude);
            }
          } catch {}
          // Default coords (Balingasag) are already set, just show the map
          setAddress('Move the map to select location');
        }
      } else if (initialLocation) {
        await getAddressFromCoords(initialLocation.latitude, initialLocation.longitude);
      }
    } catch (error) {
      console.log('Location init error:', error);
      setAddress('Move the map to select location');
    } finally {
      setLoading(false);
    }
  };

  const goToCurrentLocation = async () => {
    if (!locationPermission) {
      Alert.alert('Permission Required', 'Please enable location access in settings.');
      return;
    }
    try {
      setResolving(true);
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 5000)
      );
      const loc = await Promise.race([locationPromise, timeoutPromise]);
      if (loc && 'coords' in loc) {
        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setCenterCoord(coords);
        mapRef.current?.animateToRegion(
          { ...coords, latitudeDelta: 0.005, longitudeDelta: 0.005 },
          600
        );
        await getAddressFromCoords(coords.latitude, coords.longitude);
      } else {
        Alert.alert('Timeout', 'Could not get location. Please move the map manually.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setResolving(false);
    }
  };

  const getAddressFromCoords = async (latitude: number, longitude: number) => {
    try {
      setResolving(true);
      const result = await Location.reverseGeocodeAsync({ latitude, longitude });

      if (result && result.length > 0) {
        const loc = result[0];
        const parts = [
          loc.streetNumber,
          loc.street,
          loc.subregion,
          loc.city,
          loc.region,
        ].filter(Boolean);

        const formatted = parts.length > 0
          ? parts.join(', ')
          : [loc.name, loc.city, loc.region].filter(Boolean).join(', ');

        setAddress(formatted || 'Selected location');
        setSearchQuery(formatted || '');
      } else {
        setAddress('Selected location');
      }
    } catch {
      setAddress('Selected location');
    } finally {
      setResolving(false);
    }
  };

  const handleRegionChange = (newRegion: any) => {
    setCenterCoord({
      latitude: newRegion.latitude,
      longitude: newRegion.longitude,
    });

    // Debounce reverse geocoding
    if (resolveTimeout.current) clearTimeout(resolveTimeout.current);
    resolveTimeout.current = setTimeout(() => {
      getAddressFromCoords(newRegion.latitude, newRegion.longitude);
    }, 400);
  };

  const searchLocation = async () => {
    if (!searchQuery.trim()) return;
    Keyboard.dismiss();
    try {
      setResolving(true);
      const results = await Location.geocodeAsync(searchQuery);
      if (results && results.length > 0) {
        const { latitude, longitude } = results[0];
        setCenterCoord({ latitude, longitude });
        mapRef.current?.animateToRegion(
          { latitude, longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 },
          600
        );
        await getAddressFromCoords(latitude, longitude);
      } else {
        Alert.alert('Not Found', 'Location not found. Try a different search.');
      }
    } catch {
      Alert.alert('Error', 'Failed to search location');
    } finally {
      setResolving(false);
    }
  };

  const confirmLocation = async () => {
    let finalAddress = address;
    if (!finalAddress || finalAddress === 'Selected location' || finalAddress === 'Move the map to select location') {
      // Resolve address before confirming
      try {
        const result = await Location.reverseGeocodeAsync({
          latitude: centerCoord.latitude,
          longitude: centerCoord.longitude,
        });
        if (result && result.length > 0) {
          const loc = result[0];
          const parts = [loc.streetNumber, loc.street, loc.subregion, loc.city, loc.region].filter(Boolean);
          finalAddress = parts.length > 0 ? parts.join(', ') : [loc.name, loc.city, loc.region].filter(Boolean).join(', ');
        }
      } catch {}
      if (!finalAddress) finalAddress = searchQuery || `${centerCoord.latitude.toFixed(4)}, ${centerCoord.longitude.toFixed(4)}`;
    }
    onLocationSelect({
      address: finalAddress,
      latitude: centerCoord.latitude,
      longitude: centerCoord.longitude,
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </View>
    );
  }

  // Fallback: text-based location picker when MapView is unavailable
  if (mapError) {
    return (
      <View style={styles.container}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: RESPONSIVE.paddingHorizontal, paddingTop: verticalScale(16) }}>
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: moderateScale(12), padding: moderateScale(14), marginBottom: verticalScale(16), flexDirection: 'row', alignItems: 'center', gap: moderateScale(10) }}>
            <Ionicons name="information-circle" size={22} color="#D97706" />
            <Text style={{ flex: 1, fontSize: fontScale(13), color: '#92400E' }}>Map is not available. Search for your location by name below.</Text>
          </View>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Type address or place name..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={searchLocation}
              returnKeyType="search"
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity style={styles.searchGo} onPress={searchLocation}>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </TouchableOpacity>
            )}
          </View>

          {resolving && (
            <View style={{ alignItems: 'center', marginTop: verticalScale(24) }}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={{ marginTop: verticalScale(8), color: '#6B7280' }}>Searching...</Text>
            </View>
          )}

          {!resolving && address && address !== 'Move the map to select location' && (
            <View style={{ marginTop: verticalScale(20), backgroundColor: '#fff', borderRadius: moderateScale(12), padding: moderateScale(16), shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: moderateScale(10), marginBottom: verticalScale(12) }}>
                <View style={{ width: moderateScale(12), height: moderateScale(12), borderRadius: moderateScale(6), backgroundColor: '#EF4444' }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontScale(12), color: '#9CA3AF' }}>Selected Location</Text>
                  <Text style={{ fontSize: fontScale(15), fontWeight: '600', color: '#1F2937' }}>{address}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={confirmLocation}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmButtonText}>Confirm Location</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            onPress={goToCurrentLocation}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: verticalScale(20), padding: moderateScale(14), backgroundColor: '#EFF6FF', borderRadius: moderateScale(12), gap: moderateScale(8) }}
            activeOpacity={0.7}
          >
            <Ionicons name="locate" size={20} color="#3B82F6" />
            <Text style={{ fontSize: fontScale(14), fontWeight: '600', color: '#3B82F6' }}>Use My Current Location</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar - Floating on top of map */}
      <View style={styles.searchOverlay}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a place..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={searchLocation}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchFocused(false); Keyboard.dismiss(); }}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
          {searchFocused && searchQuery.length > 0 && (
            <TouchableOpacity style={styles.searchGo} onPress={searchLocation}>
              <Ionicons name="arrow-forward" size={18} color="#ffffff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={region}
        onRegionChangeComplete={handleRegionChange}
        showsUserLocation={locationPermission}
        showsMyLocationButton={false}
        showsCompass={false}
      />

      {/* Center Pin - Fixed in the middle of the map */}
      <View style={styles.centerPinContainer} pointerEvents="none">
        <View style={styles.centerPin}>
          <Ionicons name="location" size={36} color="#EF4444" />
        </View>
        <View style={styles.pinShadow} />
      </View>

      {/* Current Location FAB */}
      <TouchableOpacity
        style={styles.currentLocationFab}
        onPress={goToCurrentLocation}
        activeOpacity={0.8}
      >
        <Ionicons name="locate" size={22} color="#3B82F6" />
      </TouchableOpacity>

      {/* Bottom Card */}
      <View style={styles.bottomCard}>
        {/* Address Display */}
        <View style={styles.addressRow}>
          <View style={styles.addressDot} />
          <View style={styles.addressContent}>
            {resolving ? (
              <View style={styles.resolvingRow}>
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

        {/* Confirm Button */}
        <TouchableOpacity
          style={[styles.confirmButton, (!address || address === 'Move the map to select location' || resolving) && styles.confirmButtonDisabled]}
          onPress={confirmLocation}
          disabled={!address || address === 'Move the map to select location' || resolving}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmButtonText}>Confirm Location</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: verticalScale(10),
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#6B7280',
  },
  map: {
    flex: 1,
  },

  // Search overlay
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
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingHorizontal: moderateScale(14),
    paddingVertical: moderateScale(10),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    marginLeft: moderateScale(10),
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#1F2937',
    paddingVertical: 2,
  },
  searchGo: {
    width: moderateScale(30),
    height: moderateScale(30),
    borderRadius: moderateScale(15),
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: moderateScale(8),
  },

  // Center pin
  centerPinContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -18,
    marginTop: -44,
    alignItems: 'center',
    zIndex: 5,
  },
  centerPin: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinShadow: {
    width: 8,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginTop: -2,
  },

  // Current location FAB
  currentLocationFab: {
    position: 'absolute',
    right: RESPONSIVE.paddingHorizontal,
    bottom: verticalScale(150),
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 5,
  },

  // Bottom card
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: RESPONSIVE.borderRadius.xlarge,
    borderTopRightRadius: RESPONSIVE.borderRadius.xlarge,
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(28),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: verticalScale(12),
  },
  addressDot: {
    width: moderateScale(12),
    height: moderateScale(12),
    borderRadius: moderateScale(6),
    backgroundColor: '#EF4444',
    marginTop: 4,
    marginRight: moderateScale(12),
  },
  addressContent: {
    flex: 1,
  },
  addressLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  addressText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: '#1F2937',
    lineHeight: verticalScale(20),
  },
  resolvingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
  },
  resolvingText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
  },
  confirmButton: {
    backgroundColor: '#3B82F6',
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(16),
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },
});
