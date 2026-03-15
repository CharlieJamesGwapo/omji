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
  ScrollView,
  Platform,
} from 'react-native';
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

// Expanded popular places in Balingasag and nearby areas
const POPULAR_PLACES = [
  { name: 'Balingasag Public Market', icon: 'cart', category: 'Market' },
  { name: 'Balingasag Hospital', icon: 'medkit', category: 'Hospital' },
  { name: 'Balingasag Municipal Hall', icon: 'business', category: 'Government' },
  { name: 'Balingasag Bus Terminal', icon: 'bus', category: 'Transport' },
  { name: 'Balingasag Church', icon: 'home', category: 'Church' },
  { name: 'Balingasag National High School', icon: 'school', category: 'School' },
  { name: 'Cagayan de Oro City', icon: 'location', category: 'City' },
  { name: 'SM CDO Downtown Premier', icon: 'storefront', category: 'Mall' },
  { name: 'Laguindingan Airport', icon: 'airplane', category: 'Airport' },
  { name: 'Gaisano Mall Cagayan de Oro', icon: 'storefront', category: 'Mall' },
  { name: 'Centrio Mall Cagayan de Oro', icon: 'storefront', category: 'Mall' },
  { name: 'JR Borja Street Cagayan de Oro', icon: 'navigate', category: 'Street' },
  { name: 'Opol Misamis Oriental', icon: 'location', category: 'Town' },
  { name: 'Villanueva Misamis Oriental', icon: 'location', category: 'Town' },
  { name: 'Jasaan Misamis Oriental', icon: 'location', category: 'Town' },
  { name: 'Tagoloan Misamis Oriental', icon: 'location', category: 'Town' },
];

export default function MapPicker({
  onLocationSelect,
  initialLocation,
  title = 'Select Location',
}: MapPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [address, setAddress] = useState('');
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCoord, setSelectedCoord] = useState({ latitude: 0, longitude: 0 });
  const [searchResults, setSearchResults] = useState<Array<{ name: string; latitude: number; longitude: number }>>([]);
  const [hasSelected, setHasSelected] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Filter popular places based on search query
  const filteredPlaces = searchQuery.trim().length > 0
    ? POPULAR_PLACES.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : POPULAR_PLACES;

  const getAddressFromCoords = async (latitude: number, longitude: number) => {
    try {
      const result = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (result && result.length > 0) {
        const loc = result[0];
        const parts = [loc.streetNumber, loc.street, loc.subregion, loc.city, loc.region].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : [loc.name, loc.city, loc.region].filter(Boolean).join(', ') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      }
      return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    } catch {
      return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }
  };

  // Live search as user types (debounced)
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    setSearchResults([]);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (text.trim().length < 3) return;

    searchTimeout.current = setTimeout(async () => {
      try {
        setResolving(true);
        const results = await Location.geocodeAsync(text.trim());
        if (results && results.length > 0) {
          const mapped = [];
          for (const r of results.slice(0, 5)) {
            const addr = await getAddressFromCoords(r.latitude, r.longitude);
            mapped.push({ name: addr, latitude: r.latitude, longitude: r.longitude });
          }
          setSearchResults(mapped);
        }
      } catch {
        // Silent - user can still pick from popular places
      } finally {
        setResolving(false);
      }
    }, 800);
  }, []);

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
          const addr = await getAddressFromCoords(r.latitude, r.longitude);
          mapped.push({ name: addr, latitude: r.latitude, longitude: r.longitude });
        }
        if (mapped.length === 1) {
          selectResult(mapped[0]);
        } else if (mapped.length > 1) {
          setSearchResults(mapped);
        } else {
          Alert.alert('Not Found', 'Try a more specific location name.');
        }
      } else {
        Alert.alert('Not Found', 'Location not found. Try a different name or select from the list below.');
      }
    } catch {
      Alert.alert('Error', 'Search failed. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  const selectResult = (result: { name: string; latitude: number; longitude: number }) => {
    setSelectedCoord({ latitude: result.latitude, longitude: result.longitude });
    setAddress(result.name);
    setSearchQuery(result.name);
    setSearchResults([]);
    setHasSelected(true);
    Keyboard.dismiss();
  };

  const selectQuickPlace = async (placeName: string) => {
    Keyboard.dismiss();
    setSearchQuery(placeName);
    try {
      setResolving(true);
      const results = await Location.geocodeAsync(placeName);
      if (results && results.length > 0) {
        const { latitude, longitude } = results[0];
        const addr = await getAddressFromCoords(latitude, longitude);
        setSelectedCoord({ latitude, longitude });
        setAddress(addr || placeName);
        setHasSelected(true);
      } else {
        Alert.alert('Not Found', `Could not find "${placeName}".`);
      }
    } catch {
      Alert.alert('Error', 'Search failed.');
    } finally {
      setResolving(false);
    }
  };

  const useCurrentLocation = async () => {
    Keyboard.dismiss();
    try {
      setLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please enable location in your phone settings.');
        return;
      }
      const loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
      if (loc && 'coords' in loc) {
        const addr = await getAddressFromCoords(loc.coords.latitude, loc.coords.longitude);
        setSelectedCoord({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        setAddress(addr);
        setSearchQuery(addr);
        setHasSelected(true);
      } else {
        Alert.alert('Timeout', 'GPS is slow. Please type your location instead.');
      }
    } catch {
      Alert.alert('Error', 'Could not get location. Please type it manually.');
    } finally {
      setLoading(false);
    }
  };

  const confirmLocation = () => {
    if (!hasSelected || !address || selectedCoord.latitude === 0) {
      Alert.alert('Select Location', 'Please search and select a location first.');
      return;
    }
    onLocationSelect({
      address,
      latitude: selectedCoord.latitude,
      longitude: selectedCoord.longitude,
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={moderateScale(18)} color="#9CA3AF" />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Type any address or place name..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={handleSearchChange}
            onSubmitEditing={searchLocation}
            returnKeyType="search"
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); setHasSelected(false); }} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={moderateScale(20)} color="#D1D5DB" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.searchButton, !searchQuery.trim() && { opacity: 0.4 }]}
            onPress={searchLocation}
            disabled={!searchQuery.trim() || resolving}
          >
            {resolving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="arrow-forward" size={moderateScale(16)} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Selected Location */}
        {hasSelected && address && (
          <View style={styles.selectedCard}>
            <View style={styles.selectedDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedLabel}>Selected</Text>
              <Text style={styles.selectedAddress} numberOfLines={2}>{address}</Text>
            </View>
            <TouchableOpacity onPress={() => { setHasSelected(false); setSearchQuery(''); inputRef.current?.focus(); }}>
              <Ionicons name="create-outline" size={moderateScale(20)} color="#3B82F6" />
            </TouchableOpacity>
          </View>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Search Results</Text>
            {searchResults.map((result, i) => (
              <TouchableOpacity key={i} style={styles.placeItem} onPress={() => selectResult(result)} activeOpacity={0.6}>
                <View style={[styles.placeIcon, { backgroundColor: '#DBEAFE' }]}>
                  <Ionicons name="location" size={moderateScale(16)} color="#2563EB" />
                </View>
                <Text style={styles.placeText} numberOfLines={2}>{result.name}</Text>
                <Ionicons name="arrow-forward-circle" size={moderateScale(20)} color="#93C5FD" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* GPS Button */}
        {!hasSelected && (
          <TouchableOpacity style={styles.gpsButton} onPress={useCurrentLocation} activeOpacity={0.7} disabled={loading}>
            <View style={styles.gpsIcon}>
              {loading ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : (
                <Ionicons name="navigate" size={moderateScale(20)} color="#3B82F6" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.gpsTitle}>Use My Current Location</Text>
              <Text style={styles.gpsSub}>Auto-detect via GPS</Text>
            </View>
            <Ionicons name="chevron-forward" size={moderateScale(16)} color="#93C5FD" />
          </TouchableOpacity>
        )}

        {/* Popular Places */}
        {!hasSelected && searchResults.length === 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {searchQuery.trim() ? `Places matching "${searchQuery}"` : 'Popular Places'}
            </Text>
            {filteredPlaces.length > 0 ? (
              filteredPlaces.map((place) => (
                <TouchableOpacity
                  key={place.name}
                  style={styles.placeItem}
                  onPress={() => selectQuickPlace(place.name)}
                  activeOpacity={0.6}
                >
                  <View style={styles.placeIcon}>
                    <Ionicons name={place.icon as any} size={moderateScale(16)} color="#6B7280" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.placeText}>{place.name}</Text>
                    <Text style={styles.placeCategory}>{place.category}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={moderateScale(14)} color="#D1D5DB" />
                </TouchableOpacity>
              ))
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: verticalScale(20) }}>
                <Ionicons name="search-outline" size={moderateScale(32)} color="#D1D5DB" />
                <Text style={{ color: '#9CA3AF', marginTop: verticalScale(8), fontSize: fontScale(13) }}>
                  No matching places. Tap the search button to find it.
                </Text>
              </View>
            )}

            {/* Tip */}
            <View style={styles.tipCard}>
              <Ionicons name="bulb-outline" size={moderateScale(16)} color="#D97706" />
              <Text style={styles.tipText}>
                Tip: Type any street, barangay, landmark, or city name and tap the search button to find it.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Confirm Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.confirmButton, (!hasSelected || resolving || loading) && styles.confirmButtonDisabled]}
          onPress={confirmLocation}
          disabled={!hasSelected || resolving || loading}
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContent: {
    padding: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(100),
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    paddingHorizontal: moderateScale(14),
    paddingVertical: Platform.OS === 'ios' ? moderateScale(10) : moderateScale(2),
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
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: moderateScale(14),
    padding: moderateScale(16),
    marginTop: verticalScale(14),
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    gap: moderateScale(12),
  },
  selectedDot: {
    width: moderateScale(12),
    height: moderateScale(12),
    borderRadius: moderateScale(6),
    backgroundColor: '#3B82F6',
  },
  selectedLabel: {
    fontSize: fontScale(11),
    color: '#60A5FA',
    fontWeight: '600',
  },
  selectedAddress: {
    fontSize: fontScale(14),
    fontWeight: '700',
    color: '#1E40AF',
    marginTop: 1,
  },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    padding: moderateScale(14),
    marginTop: verticalScale(14),
    gap: moderateScale(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  gpsIcon: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsTitle: {
    fontSize: fontScale(14),
    fontWeight: '600',
    color: '#1E40AF',
  },
  gpsSub: {
    fontSize: fontScale(12),
    color: '#93C5FD',
    marginTop: 1,
  },
  section: {
    marginTop: verticalScale(20),
  },
  sectionTitle: {
    fontSize: fontScale(14),
    fontWeight: '700',
    color: '#374151',
    marginBottom: verticalScale(10),
  },
  placeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    padding: moderateScale(14),
    marginBottom: verticalScale(8),
    gap: moderateScale(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  placeIcon: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeText: {
    flex: 1,
    fontSize: fontScale(14),
    color: '#1F2937',
    fontWeight: '500',
  },
  placeCategory: {
    fontSize: fontScale(11),
    color: '#9CA3AF',
    marginTop: 1,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: moderateScale(12),
    padding: moderateScale(14),
    marginTop: verticalScale(12),
    gap: moderateScale(10),
  },
  tipText: {
    flex: 1,
    fontSize: fontScale(12),
    color: '#92400E',
    lineHeight: fontScale(18),
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: RESPONSIVE.paddingHorizontal,
    paddingBottom: Platform.OS === 'ios' ? verticalScale(28) : verticalScale(14),
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
    color: '#fff',
    fontSize: fontScale(16),
    fontWeight: 'bold',
  },
});
