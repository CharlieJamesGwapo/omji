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
} from 'react-native';
import MapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

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
  const mapRef = useRef<MapView>(null);

  const [region, setRegion] = useState({
    latitude: initialLocation?.latitude || 8.4343,
    longitude: initialLocation?.longitude || 124.7762,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  });

  const [centerCoord, setCenterCoord] = useState({
    latitude: initialLocation?.latitude || 8.4343,
    longitude: initialLocation?.longitude || 124.7762,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [address, setAddress] = useState('');
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(!initialLocation);
  const [locationPermission, setLocationPermission] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const resolveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    initLocation();
  }, []);

  const initLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setLocationPermission(granted);

      if (granted && !initialLocation) {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
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
      } else if (initialLocation) {
        await getAddressFromCoords(initialLocation.latitude, initialLocation.longitude);
      }
    } catch (error) {
      console.error('Location init error:', error);
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
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
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

  const confirmLocation = () => {
    if (!address || address === 'Selected location') {
      // Still resolve if address wasn't set
      getAddressFromCoords(centerCoord.latitude, centerCoord.longitude).then(() => {
        onLocationSelect({
          address: address || searchQuery || 'Selected location',
          latitude: centerCoord.latitude,
          longitude: centerCoord.longitude,
        });
      });
      return;
    }
    onLocationSelect({
      address,
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
          style={[styles.confirmButton, (!address || resolving) && styles.confirmButtonDisabled]}
          onPress={confirmLocation}
          disabled={!address || resolving}
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
    marginTop: 12,
    fontSize: 15,
    color: '#6B7280',
  },
  map: {
    flex: 1,
  },

  // Search overlay
  searchOverlay: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: '#1F2937',
    paddingVertical: 2,
  },
  searchGo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
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
    right: 16,
    bottom: 160,
    width: 44,
    height: 44,
    borderRadius: 22,
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  addressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    marginTop: 4,
    marginRight: 12,
  },
  addressContent: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  addressText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    lineHeight: 20,
  },
  resolvingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resolvingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  confirmButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
