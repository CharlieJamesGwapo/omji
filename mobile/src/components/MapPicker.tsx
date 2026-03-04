import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
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
  const [region, setRegion] = useState({
    latitude: initialLocation?.latitude || 8.4343, // Balingasag, Misamis Oriental
    longitude: initialLocation?.longitude || 124.5000,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  const [markerPosition, setMarkerPosition] = useState({
    latitude: initialLocation?.latitude || 8.4343,
    longitude: initialLocation?.longitude || 124.5000,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationPermission, setLocationPermission] = useState(false);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');

      if (status === 'granted') {
        console.log('Location permission granted');
      } else {
        Alert.alert(
          'Permission Required',
          'Location permission is needed to use this feature'
        );
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
    }
  };

  const getCurrentLocation = async () => {
    if (!locationPermission) {
      Alert.alert('Error', 'Location permission not granted');
      return;
    }

    try {
      setLoading(true);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const newRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      setRegion(newRegion);
      setMarkerPosition({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      // Get address from coordinates
      await getAddressFromCoords(
        location.coords.latitude,
        location.coords.longitude
      );
    } catch (error) {
      console.error('Error getting current location:', error);
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setLoading(false);
    }
  };

  const getAddressFromCoords = async (latitude: number, longitude: number) => {
    try {
      const result = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (result && result.length > 0) {
        const location = result[0];
        // Build detailed address with all available components
        const addressParts = [
          location.streetNumber,
          location.street,
          location.subregion,
          location.city,
          location.postalCode,
          location.region,
        ].filter(Boolean);

        const formattedAddress = addressParts.length > 0
          ? addressParts.join(', ')
          : [location.name, location.city, location.region].filter(Boolean).join(', ');

        setAddress(formattedAddress || 'Unknown location');
        setSearchQuery(formattedAddress || '');
      }
    } catch (error) {
      console.error('Error getting address:', error);
      setAddress('Location selected');
    }
  };

  const handleMapPress = async (event: any) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;

    setMarkerPosition({ latitude, longitude });
    setRegion({ ...region, latitude, longitude });

    await getAddressFromCoords(latitude, longitude);
  };

  const searchLocation = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Error', 'Please enter a location to search');
      return;
    }

    try {
      setLoading(true);
      const results = await Location.geocodeAsync(searchQuery);

      if (results && results.length > 0) {
        const { latitude, longitude } = results[0];

        const newRegion = {
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };

        setRegion(newRegion);
        setMarkerPosition({ latitude, longitude });
        await getAddressFromCoords(latitude, longitude);
      } else {
        Alert.alert('Not Found', 'Location not found. Please try another search term.');
      }
    } catch (error) {
      console.error('Error searching location:', error);
      Alert.alert('Error', 'Failed to search location');
    } finally {
      setLoading(false);
    }
  };

  const confirmLocation = () => {
    onLocationSelect({
      address: address || searchQuery || 'Selected location',
      latitude: markerPosition.latitude,
      longitude: markerPosition.longitude,
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search location..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={searchLocation}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Search and Current Location Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={searchLocation}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="search" size={18} color="#ffffff" />
                <Text style={styles.searchButtonText}>Search</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.currentLocationButton}
            onPress={getCurrentLocation}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <>
                <Ionicons name="locate" size={18} color="#3B82F6" />
                <Text style={styles.currentLocationText}>Current</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Map */}
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        region={region}
        onRegionChangeComplete={setRegion}
        onPress={handleMapPress}
        showsUserLocation={locationPermission}
        showsMyLocationButton={false}
      >
        <Marker
          coordinate={markerPosition}
          draggable
          onDragEnd={handleMapPress}
          title="Selected Location"
          description={address}
        >
          <View style={styles.markerContainer}>
            <Ionicons name="location" size={40} color="#EF4444" />
          </View>
        </Marker>
      </MapView>

      {/* Address Display */}
      {address ? (
        <View style={styles.addressContainer}>
          <Ionicons name="location-outline" size={20} color="#DC2626" />
          <Text style={styles.addressText}>{address}</Text>
        </View>
      ) : null}

      {/* Confirm Button */}
      <TouchableOpacity style={styles.confirmButton} onPress={confirmLocation}>
        <Text style={styles.confirmButtonText}>Confirm Location</Text>
        <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
      </TouchableOpacity>

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsText}>
          📍 Tap on map or drag marker to select location
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  searchContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  searchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  searchButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  currentLocationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  currentLocationText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '600',
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    lineHeight: 20,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    marginHorizontal: 20,
    marginVertical: 16,
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  instructionsContainer: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 20,
    marginHorizontal: 20,
    borderRadius: 8,
  },
  instructionsText: {
    fontSize: 13,
    color: '#92400E',
    textAlign: 'center',
  },
});
