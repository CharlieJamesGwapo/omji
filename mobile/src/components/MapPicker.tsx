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
  Platform,
  FlatList,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../utils/responsive';

const { width } = Dimensions.get('window');

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

// Common places for quick selection
const QUICK_PLACES = [
  { name: 'Balingasag Public Market', icon: 'cart' },
  { name: 'Balingasag Hospital', icon: 'medkit' },
  { name: 'Balingasag Municipal Hall', icon: 'business' },
  { name: 'Balingasag Bus Terminal', icon: 'bus' },
  { name: 'Cagayan de Oro City', icon: 'location' },
];

export default function MapPicker({
  onLocationSelect,
  initialLocation,
  title = 'Select Location',
}: MapPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [address, setAddress] = useState('');
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedCoord, setSelectedCoord] = useState({
    latitude: initialLocation?.latitude ?? 0,
    longitude: initialLocation?.longitude ?? 0,
  });
  const [searchResults, setSearchResults] = useState<Array<{ name: string; latitude: number; longitude: number }>>([]);
  const [hasSelected, setHasSelected] = useState(false);

  useEffect(() => {
    initLocation();
  }, []);

  const initLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoading(false);
        return;
      }

      if (initialLocation && initialLocation.latitude !== 0) {
        setSelectedCoord(initialLocation);
        await getAddressFromCoords(initialLocation.latitude, initialLocation.longitude);
        setHasSelected(true);
        setLoading(false);
        return;
      }

      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 6000)
      );
      const loc = await Promise.race([locationPromise, timeoutPromise]);

      if (loc && 'coords' in loc) {
        setSelectedCoord({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        await getAddressFromCoords(loc.coords.latitude, loc.coords.longitude);
      }
    } catch (error) {
      console.log('Location init error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAddressFromCoords = async (latitude: number, longitude: number) => {
    try {
      setResolving(true);
      const result = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (result && result.length > 0) {
        const loc = result[0];
        const parts = [loc.streetNumber, loc.street, loc.subregion, loc.city, loc.region].filter(Boolean);
        const formatted = parts.length > 0
          ? parts.join(', ')
          : [loc.name, loc.city, loc.region].filter(Boolean).join(', ');
        setAddress(formatted || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
      } else {
        setAddress(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
      }
    } catch {
      setAddress(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    } finally {
      setResolving(false);
    }
  };

  const searchLocation = async () => {
    if (!searchQuery.trim()) return;
    Keyboard.dismiss();
    try {
      setResolving(true);
      setSearchResults([]);
      const results = await Location.geocodeAsync(searchQuery.trim());
      if (results && results.length > 0) {
        const mapped = [];
        for (const r of results.slice(0, 5)) {
          try {
            const rev = await Location.reverseGeocodeAsync({ latitude: r.latitude, longitude: r.longitude });
            const loc = rev?.[0];
            const parts = [loc?.streetNumber, loc?.street, loc?.subregion, loc?.city, loc?.region].filter(Boolean);
            const name = parts.length > 0 ? parts.join(', ') : [loc?.name, loc?.city, loc?.region].filter(Boolean).join(', ');
            mapped.push({ name: name || searchQuery, latitude: r.latitude, longitude: r.longitude });
          } catch {
            mapped.push({ name: searchQuery, latitude: r.latitude, longitude: r.longitude });
          }
        }
        if (mapped.length === 1) {
          // Auto-select if only one result
          selectResult(mapped[0]);
        } else {
          setSearchResults(mapped);
        }
      } else {
        Alert.alert('Not Found', 'Location not found. Try a different search term.');
      }
    } catch {
      Alert.alert('Error', 'Failed to search location. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  const selectResult = (result: { name: string; latitude: number; longitude: number }) => {
    setSelectedCoord({ latitude: result.latitude, longitude: result.longitude });
    setAddress(result.name);
    setSearchResults([]);
    setHasSelected(true);
  };

  const useCurrentLocation = async () => {
    try {
      setResolving(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please enable location access in settings.');
        return;
      }
      const loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
      ]);
      if (loc && 'coords' in loc) {
        setSelectedCoord({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        await getAddressFromCoords(loc.coords.latitude, loc.coords.longitude);
        setHasSelected(true);
      } else {
        Alert.alert('Timeout', 'Could not get location. Please search manually.');
      }
    } catch {
      Alert.alert('Error', 'Failed to get current location.');
    } finally {
      setResolving(false);
    }
  };

  const searchQuickPlace = async (placeName: string) => {
    setSearchQuery(placeName);
    try {
      setResolving(true);
      const results = await Location.geocodeAsync(placeName);
      if (results && results.length > 0) {
        const { latitude, longitude } = results[0];
        setSelectedCoord({ latitude, longitude });
        await getAddressFromCoords(latitude, longitude);
        setHasSelected(true);
      } else {
        Alert.alert('Not Found', `Could not find "${placeName}". Try searching manually.`);
      }
    } catch {
      Alert.alert('Error', 'Search failed. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  const confirmLocation = () => {
    if (!address || selectedCoord.latitude === 0) {
      Alert.alert('Select Location', 'Please search for or select a location first.');
      return;
    }
    onLocationSelect({
      address,
      latitude: selectedCoord.latitude,
      longitude: selectedCoord.longitude,
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
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={moderateScale(18)} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search address, place, or landmark..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={(t) => { setSearchQuery(t); setSearchResults([]); }}
            onSubmitEditing={searchLocation}
            returnKeyType="search"
            autoFocus={!hasSelected}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); Keyboard.dismiss(); }} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={moderateScale(18)} color="#9CA3AF" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.searchButton} onPress={searchLocation} disabled={!searchQuery.trim()}>
            <Ionicons name="arrow-forward" size={moderateScale(16)} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsTitle}>Select a result:</Text>
            {searchResults.map((result, index) => (
              <TouchableOpacity
                key={index}
                style={styles.resultItem}
                onPress={() => selectResult(result)}
                activeOpacity={0.7}
              >
                <Ionicons name="location" size={moderateScale(18)} color="#3B82F6" />
                <Text style={styles.resultText} numberOfLines={2}>{result.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Current Location Button */}
        <TouchableOpacity style={styles.currentLocationBtn} onPress={useCurrentLocation} activeOpacity={0.7}>
          <View style={styles.currentLocationIcon}>
            <Ionicons name="locate" size={moderateScale(20)} color="#3B82F6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.currentLocationTitle}>Use My Current Location</Text>
            <Text style={styles.currentLocationSub}>Automatically detect via GPS</Text>
          </View>
          <Ionicons name="chevron-forward" size={moderateScale(16)} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Quick Places */}
        {!hasSelected && searchResults.length === 0 && (
          <View style={styles.quickSection}>
            <Text style={styles.quickTitle}>Popular Places</Text>
            {QUICK_PLACES.map((place) => (
              <TouchableOpacity
                key={place.name}
                style={styles.quickItem}
                onPress={() => searchQuickPlace(place.name)}
                activeOpacity={0.7}
              >
                <View style={styles.quickIcon}>
                  <Ionicons name={place.icon as any} size={moderateScale(16)} color="#6B7280" />
                </View>
                <Text style={styles.quickText}>{place.name}</Text>
                <Ionicons name="chevron-forward" size={moderateScale(14)} color="#D1D5DB" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Loading */}
        {resolving && (
          <View style={styles.resolvingContainer}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.resolvingText}>Searching...</Text>
          </View>
        )}

        {/* Selected Location Card */}
        {hasSelected && address && !resolving && (
          <View style={styles.selectedCard}>
            <View style={styles.selectedHeader}>
              <View style={styles.selectedDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedLabel}>Selected Location</Text>
                <Text style={styles.selectedAddress}>{address}</Text>
              </View>
              <TouchableOpacity onPress={() => { setHasSelected(false); setAddress(''); setSearchQuery(''); }}>
                <Ionicons name="create-outline" size={moderateScale(18)} color="#3B82F6" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Confirm Button - Fixed at bottom */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.confirmButton, (!hasSelected || !address || resolving) && styles.confirmButtonDisabled]}
          onPress={confirmLocation}
          disabled={!hasSelected || !address || resolving}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark-circle" size={moderateScale(20)} color="#fff" />
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
    fontSize: fontScale(14),
    color: '#6B7280',
  },
  scrollContent: {
    padding: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(100),
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: moderateScale(14),
    paddingHorizontal: moderateScale(14),
    paddingVertical: Platform.OS === 'ios' ? moderateScale(12) : moderateScale(4),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    gap: moderateScale(8),
  },
  searchInput: {
    flex: 1,
    fontSize: fontScale(15),
    color: '#1F2937',
  },
  searchButton: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsContainer: {
    marginTop: verticalScale(12),
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  resultsTitle: {
    fontSize: fontScale(12),
    color: '#9CA3AF',
    paddingHorizontal: moderateScale(14),
    paddingTop: moderateScale(12),
    paddingBottom: moderateScale(4),
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(14),
    paddingVertical: moderateScale(14),
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: moderateScale(10),
  },
  resultText: {
    flex: 1,
    fontSize: fontScale(14),
    color: '#1F2937',
  },
  currentLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: moderateScale(14),
    padding: moderateScale(14),
    marginTop: verticalScale(16),
    gap: moderateScale(12),
  },
  currentLocationIcon: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocationTitle: {
    fontSize: fontScale(14),
    fontWeight: '600',
    color: '#1E40AF',
  },
  currentLocationSub: {
    fontSize: fontScale(12),
    color: '#60A5FA',
    marginTop: 1,
  },
  quickSection: {
    marginTop: verticalScale(20),
  },
  quickTitle: {
    fontSize: fontScale(14),
    fontWeight: '700',
    color: '#374151',
    marginBottom: verticalScale(10),
  },
  quickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    padding: moderateScale(14),
    marginBottom: verticalScale(8),
    gap: moderateScale(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  quickIcon: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: {
    flex: 1,
    fontSize: fontScale(14),
    color: '#374151',
  },
  resolvingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: moderateScale(10),
    marginTop: verticalScale(20),
  },
  resolvingText: {
    fontSize: fontScale(14),
    color: '#6B7280',
  },
  selectedCard: {
    marginTop: verticalScale(16),
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    padding: moderateScale(16),
    borderWidth: 2,
    borderColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: moderateScale(12),
  },
  selectedDot: {
    width: moderateScale(14),
    height: moderateScale(14),
    borderRadius: moderateScale(7),
    backgroundColor: '#3B82F6',
    marginTop: 3,
  },
  selectedLabel: {
    fontSize: fontScale(12),
    color: '#9CA3AF',
    marginBottom: 2,
  },
  selectedAddress: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: '#1F2937',
    lineHeight: verticalScale(20),
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: RESPONSIVE.paddingHorizontal,
    paddingBottom: Platform.OS === 'ios' ? verticalScale(28) : verticalScale(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 10,
  },
  confirmButton: {
    flexDirection: 'row',
    backgroundColor: '#3B82F6',
    borderRadius: moderateScale(14),
    paddingVertical: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    gap: moderateScale(8),
  },
  confirmButtonDisabled: {
    opacity: 0.4,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: fontScale(16),
    fontWeight: 'bold',
  },
});
