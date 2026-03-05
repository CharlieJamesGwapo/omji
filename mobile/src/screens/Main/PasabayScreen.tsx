import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { rideService, rideShareService } from '../../services/api';
import MapPicker from '../../components/MapPicker';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';

export default function PasabayScreen({ navigation }: any) {
  const [showPickupMap, setShowPickupMap] = useState(false);
  const [showDropoffMap, setShowDropoffMap] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(true);

  const [pickupLocation, setPickupLocation] = useState({
    address: '',
    latitude: 0,
    longitude: 0,
  });

  const [dropoffLocation, setDropoffLocation] = useState({
    address: '',
    latitude: 0,
    longitude: 0,
  });

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setDetectingLocation(false); return; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const result = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        const addr = result?.[0];
        const parts = [addr?.streetNumber, addr?.street, addr?.subregion, addr?.city, addr?.region].filter(Boolean);
        const formatted = parts.length > 0 ? parts.join(', ') : [addr?.name, addr?.city, addr?.region].filter(Boolean).join(', ');
        setPickupLocation({
          address: formatted || 'Current Location',
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      } catch (e) {
        console.log('Auto-detect location failed:', e);
      } finally {
        setDetectingLocation(false);
      }
    })();
  }, []);

  const [passengers, setPassengers] = useState(1);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [rideType, setRideType] = useState('single');
  const [loading, setLoading] = useState(false);
  const [availableRides, setAvailableRides] = useState<any[]>([]);
  const [loadingRides, setLoadingRides] = useState(false);
  const [mode, setMode] = useState<'book' | 'join'>('book');
  const [activeRide, setActiveRide] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      (async () => {
        try {
          const res = await rideService.getActiveRides();
          const data = res.data?.data;
          if (Array.isArray(data) && data.length > 0) {
            setActiveRide(data[0]);
          } else {
            setActiveRide(null);
          }
        } catch {}
      })();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchAvailableRides = useCallback(async () => {
    setLoadingRides(true);
    try {
      const response = await rideShareService.getAvailableRideShares();
      const data = response.data?.data;
      setAvailableRides(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching rideshares:', error);
      setAvailableRides([]);
    } finally {
      setLoadingRides(false);
    }
  }, []);

  useEffect(() => {
    fetchAvailableRides();
  }, [fetchAvailableRides]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAvailableRides();
    setRefreshing(false);
  };

  const formatDepartureTime = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 0) return 'Departed';
    if (diffMins < 60) return `Leaves in ${diffMins} min`;
    const hours = Math.floor(diffMins / 60);
    if (hours < 24) return `Leaves in ${hours}h ${diffMins % 60}m`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const handleJoinRideShare = async (ride: any) => {
    if (activeRide) {
      Alert.alert('Active Ride', 'You already have an active ride. Please complete or cancel it first.', [
        { text: 'Track Ride', onPress: () => navigation.navigate('Tracking', { type: 'ride', rideId: activeRide.id, pickup: activeRide.pickup_location, dropoff: activeRide.dropoff_location, fare: activeRide.estimated_fare }) },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }

    Alert.alert(
      'Join Ride Share',
      `Route: ${ride.pickup_location} → ${ride.dropoff_location}\nFare: ₱${ride.base_fare || 0}\nSeats left: ${ride.available_seats}\n${ride.driver?.name ? `Driver: ${ride.driver.name}` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join Ride',
          onPress: async () => {
            try {
              setLoading(true);
              const response = await rideShareService.joinRideShare(ride.id);
              const data = response.data?.data;
              fetchAvailableRides();
              // Navigate to tracking with the created ride
              if (data?.ride_id) {
                navigation.navigate('Tracking', {
                  type: 'ride',
                  rideId: data.ride_id,
                  pickup: data.pickup || ride.pickup_location,
                  dropoff: data.dropoff || ride.dropoff_location,
                  fare: data.fare || ride.base_fare,
                });
              } else {
                Alert.alert('Joined!', `You joined the ride for ₱${ride.base_fare || 0}.\nThe driver will pick you up along the route.`);
              }
            } catch (error: any) {
              const msg = error.response?.data?.error || 'Failed to join ride share';
              Alert.alert('Error', msg);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const rideTypes = [
    { id: 'single', name: 'Single Ride', icon: 'bicycle', basePrice: 40, vehicleType: 'motorcycle' },
    { id: 'habal', name: 'Habal-Habal', icon: 'bicycle', basePrice: 60, vehicleType: 'motorcycle' },
    { id: 'tricycle', name: 'Tricycle', icon: 'car', basePrice: 80, vehicleType: 'car' },
  ];

  const handlePickupSelect = (location: any) => {
    setPickupLocation(location);
    setShowPickupMap(false);
  };

  const handleDropoffSelect = (location: any) => {
    setDropoffLocation(location);
    setShowDropoffMap(false);
  };

  const calculateDistance = (point1: any, point2: any) => {
    if (!point1.latitude || !point2.latitude) return 0;
    const R = 6371;
    const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
    const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(point1.latitude * Math.PI / 180) *
      Math.cos(point2.latitude * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const distance = calculateDistance(pickupLocation, dropoffLocation);
  const selectedType = rideTypes.find(r => r.id === rideType) || rideTypes[0];
  const passengerCharge = passengers > 1 ? (passengers - 1) * 20 : 0;
  const distanceCharge = distance * 10;
  const totalFare = selectedType.basePrice + passengerCharge + distanceCharge;

  const handleBookRide = () => {
    if (activeRide) {
      Alert.alert('Active Ride', 'You already have an active ride. Please complete or cancel it first.', [
        { text: 'Track Ride', onPress: () => navigation.navigate('Tracking', { type: 'ride', rideId: activeRide.id, pickup: activeRide.pickup_location, dropoff: activeRide.dropoff_location, fare: activeRide.estimated_fare }) },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }

    if (!pickupLocation.latitude || !dropoffLocation.latitude) {
      Alert.alert('Error', 'Please select pickup and dropoff locations');
      return;
    }

    const pickupLabel = passengers > 1
      ? `${pickupLocation.address} [${passengers} passengers]${notes.trim() ? ` (${notes.trim()})` : ''}`
      : notes.trim() ? `${pickupLocation.address} (${notes.trim()})` : pickupLocation.address;

    Alert.alert(
      'Confirm Ride',
      `Type: ${selectedType.name}\nPickup: ${pickupLocation.address}\nDropoff: ${dropoffLocation.address}\nDistance: ${distance.toFixed(1)} km\nPassengers: ${passengers}\nFare: ₱${totalFare.toFixed(0)}\nPayment: ${paymentMethod.toUpperCase()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Book Now',
          onPress: async () => {
            setLoading(true);
            try {
              const response = await rideService.createRide({
                pickup_location: pickupLabel,
                pickup_latitude: pickupLocation.latitude,
                pickup_longitude: pickupLocation.longitude,
                dropoff_location: dropoffLocation.address,
                dropoff_latitude: dropoffLocation.latitude,
                dropoff_longitude: dropoffLocation.longitude,
                vehicle_type: selectedType.vehicleType,
                payment_method: paymentMethod,
              });
              const ride = response.data?.data || {};
              navigation.navigate('Tracking', {
                type: 'ride',
                rideId: ride.id || 0,
                pickup: pickupLocation.address,
                dropoff: dropoffLocation.address,
                fare: ride.estimated_fare || totalFare,
              });
            } catch (error: any) {
              const msg = error.response?.data?.error || 'Failed to book ride';
              Alert.alert('Booking Failed', msg);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="bicycle" size={28} color="#10B981" />
          <Text style={styles.headerTitle}>Pasabay Ride</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />}
      >
        {/* Active Ride Banner */}
        {activeRide && (
          <TouchableOpacity
            style={styles.activeBanner}
            onPress={() => navigation.navigate('Tracking', { type: 'ride', rideId: activeRide.id, pickup: activeRide.pickup_location, dropoff: activeRide.dropoff_location, fare: activeRide.estimated_fare })}
          >
            <View style={styles.activeBannerDot} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.activeBannerTitle}>Active ride in progress</Text>
              <Text style={styles.activeBannerSub}>Tap to track • {activeRide.status?.replace('_', ' ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#10B981" />
          </TouchableOpacity>
        )}

        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'book' && styles.modeButtonActive]}
            onPress={() => setMode('book')}
          >
            <Ionicons name="add-circle-outline" size={20} color={mode === 'book' ? '#ffffff' : '#6B7280'} />
            <Text style={[styles.modeText, mode === 'book' && styles.modeTextActive]}>Book a Ride</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'join' && styles.modeButtonActive]}
            onPress={() => { setMode('join'); fetchAvailableRides(); }}
          >
            <Ionicons name="people-outline" size={20} color={mode === 'join' ? '#ffffff' : '#6B7280'} />
            <Text style={[styles.modeText, mode === 'join' && styles.modeTextActive]}>Join a Ride</Text>
          </TouchableOpacity>
        </View>

        {mode === 'join' ? (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.label}>Available Ride Shares</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{availableRides.length}</Text>
              </View>
            </View>
            {loadingRides ? (
              <ActivityIndicator size="large" color="#10B981" style={{ marginVertical: 40 }} />
            ) : availableRides.length > 0 ? (
              availableRides.map((ride: any) => (
                <View key={ride.id} style={styles.rideShareCard}>
                  <View style={styles.rideShareHeader}>
                    <View style={styles.rideShareIcon}>
                      <Ionicons name="car" size={24} color="#10B981" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.rideShareRoute} numberOfLines={1}>{ride.pickup_location}</Text>
                      <Text style={styles.rideShareDest} numberOfLines={1}>→ {ride.dropoff_location}</Text>
                    </View>
                    <Text style={styles.rideShareFare}>₱{ride.base_fare || 0}</Text>
                  </View>

                  <View style={styles.rideShareMeta}>
                    {!!ride.departure_time && (
                      <View style={styles.metaChip}>
                        <Ionicons name="time-outline" size={14} color="#6B7280" />
                        <Text style={styles.metaText}>{formatDepartureTime(ride.departure_time)}</Text>
                      </View>
                    )}
                    <View style={styles.metaChip}>
                      <Ionicons name="people-outline" size={14} color="#6B7280" />
                      <Text style={styles.metaText}>{ride.available_seats}/{ride.total_seats} seats</Text>
                    </View>
                    {!!ride.driver?.name && (
                      <View style={styles.metaChip}>
                        <Ionicons name="person-outline" size={14} color="#6B7280" />
                        <Text style={styles.metaText}>{ride.driver.name}</Text>
                        {!!ride.driver?.rating && (
                          <>
                            <Ionicons name="star" size={10} color="#FBBF24" style={{ marginLeft: 4 }} />
                            <Text style={{ fontSize: 11, color: '#92400E', marginLeft: 2 }}>{ride.driver.rating.toFixed(1)}</Text>
                          </>
                        )}
                      </View>
                    )}
                    {!!ride.driver?.vehicle_plate && (
                      <View style={[styles.metaChip, { backgroundColor: '#EFF6FF' }]}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#3B82F6' }}>{ride.driver.vehicle_plate}</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={styles.joinButton}
                    onPress={() => handleJoinRideShare(ride)}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <>
                        <Text style={styles.joinButtonText}>Join Ride</Text>
                        <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <View style={styles.emptyRides}>
                <Ionicons name="car-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>No ride shares available</Text>
                <Text style={styles.emptySubtext}>Pull to refresh or book your own ride</Text>
                <TouchableOpacity style={styles.switchModeButton} onPress={() => setMode('book')}>
                  <Text style={styles.switchModeText}>Book a Ride</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <>
            {/* Ride Type */}
            <View style={styles.section}>
              <Text style={styles.label}>Ride Type</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {rideTypes.map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={[styles.rideTypeCard, rideType === type.id && styles.rideTypeCardActive]}
                    onPress={() => setRideType(type.id)}
                  >
                    <Ionicons name={type.icon as any} size={28} color={rideType === type.id ? '#10B981' : '#6B7280'} />
                    <Text style={[styles.rideTypeName, rideType === type.id && styles.rideTypeNameActive]}>{type.name}</Text>
                    <Text style={[styles.rideTypePrice, rideType === type.id && styles.rideTypePriceActive]}>from ₱{type.basePrice}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Pickup */}
            <View style={styles.section}>
              <Text style={styles.label}>Pickup Location *</Text>
              <TouchableOpacity style={styles.inputContainer} onPress={() => setShowPickupMap(true)}>
                <Ionicons name="location-outline" size={20} color="#10B981" />
                {detectingLocation ? (
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
                    <ActivityIndicator size="small" color="#10B981" />
                    <Text style={{ marginLeft: 8, color: '#6B7280', fontSize: 14 }}>Detecting location...</Text>
                  </View>
                ) : (
                  <Text style={[styles.input, !pickupLocation.address && styles.placeholder]} numberOfLines={1}>
                    {pickupLocation.address || 'Select pickup on map'}
                  </Text>
                )}
                <Ionicons name="navigate" size={20} color="#10B981" />
              </TouchableOpacity>
            </View>

            {/* Dropoff */}
            <View style={styles.section}>
              <Text style={styles.label}>Dropoff Location *</Text>
              <TouchableOpacity style={styles.inputContainer} onPress={() => setShowDropoffMap(true)}>
                <Ionicons name="flag-outline" size={20} color="#EF4444" />
                <Text style={[styles.input, !dropoffLocation.address && styles.placeholder]} numberOfLines={1}>
                  {dropoffLocation.address || 'Select dropoff on map'}
                </Text>
                <Ionicons name="map" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>

            {/* Passengers */}
            <View style={styles.section}>
              <Text style={styles.label}>Passengers</Text>
              <View style={styles.passengerControl}>
                <TouchableOpacity
                  style={[styles.controlButton, passengers <= 1 && styles.controlButtonDisabled]}
                  onPress={() => setPassengers(Math.max(1, passengers - 1))}
                  disabled={passengers <= 1}
                >
                  <Ionicons name="remove" size={24} color={passengers <= 1 ? '#D1D5DB' : '#10B981'} />
                </TouchableOpacity>
                <View style={styles.passengerDisplay}>
                  <Ionicons name="people" size={24} color="#10B981" />
                  <Text style={styles.passengerCount}>{passengers}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.controlButton, passengers >= 4 && styles.controlButtonDisabled]}
                  onPress={() => setPassengers(Math.min(4, passengers + 1))}
                  disabled={passengers >= 4}
                >
                  <Ionicons name="add" size={24} color={passengers >= 4 ? '#D1D5DB' : '#10B981'} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Notes */}
            <View style={styles.section}>
              <Text style={styles.label}>Notes for Rider</Text>
              <TextInput
                style={[styles.textArea, { minHeight: 60 }]}
                placeholder="Special instructions..."
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Payment */}
            <View style={styles.section}>
              <Text style={styles.label}>Payment Method</Text>
              <PaymentMethodSelector selected={paymentMethod} onSelect={setPaymentMethod} accentColor="#10B981" />
            </View>

            {/* Price */}
            <View style={styles.priceCard}>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Base Fare ({selectedType.name})</Text>
                <Text style={styles.priceValue}>₱{selectedType.basePrice}</Text>
              </View>
              {passengers > 1 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Extra passengers ({passengers - 1} x ₱20)</Text>
                  <Text style={styles.priceValue}>₱{passengerCharge}</Text>
                </View>
              )}
              {distance > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Distance ({distance.toFixed(1)} km x ₱10)</Text>
                  <Text style={styles.priceValue}>₱{distanceCharge.toFixed(0)}</Text>
                </View>
              )}
              <View style={styles.priceDivider} />
              <View style={styles.priceRow}>
                <Text style={styles.priceTotalLabel}>Total</Text>
                <Text style={styles.priceTotalValue}>₱{totalFare.toFixed(0)}</Text>
              </View>
            </View>

            {/* Book */}
            <TouchableOpacity
              style={[styles.bookButton, (loading || !!activeRide) && { opacity: 0.7 }]}
              onPress={handleBookRide}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Text style={styles.bookButtonText}>Book Ride</Text>
                  <Ionicons name="arrow-forward" size={20} color="#ffffff" />
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Pickup Map Modal */}
      <Modal visible={showPickupMap} animationType="slide">
        <View style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowPickupMap(false)}>
              <Ionicons name="close" size={28} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Pickup</Text>
            <View style={{ width: 28 }} />
          </View>
          <MapPicker title="Select Pickup Location" onLocationSelect={handlePickupSelect} initialLocation={pickupLocation.latitude ? pickupLocation : undefined} />
        </View>
      </Modal>

      {/* Dropoff Map Modal */}
      <Modal visible={showDropoffMap} animationType="slide">
        <View style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDropoffMap(false)}>
              <Ionicons name="close" size={28} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Dropoff</Text>
            <View style={{ width: 28 }} />
          </View>
          <MapPicker title="Select Dropoff Location" onLocationSelect={handleDropoffSelect} initialLocation={dropoffLocation.latitude ? dropoffLocation : undefined} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1F2937' },
  activeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', marginHorizontal: 20, marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#A7F3D0' },
  activeBannerDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#10B981' },
  activeBannerTitle: { fontSize: 14, fontWeight: '600', color: '#065F46' },
  activeBannerSub: { fontSize: 12, color: '#047857', marginTop: 2 },
  modeToggle: { flexDirection: 'row', marginHorizontal: 20, marginTop: 16, backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4 },
  modeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, gap: 8 },
  modeButtonActive: { backgroundColor: '#10B981' },
  modeText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  modeTextActive: { color: '#ffffff' },
  section: { paddingHorizontal: 20, paddingTop: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  countBadge: { backgroundColor: '#10B981', borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginLeft: 8, paddingHorizontal: 8 },
  countText: { fontSize: 12, fontWeight: 'bold', color: '#ffffff' },
  rideShareCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  rideShareHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rideShareIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  rideShareRoute: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  rideShareDest: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  rideShareFare: { fontSize: 20, fontWeight: 'bold', color: '#10B981' },
  rideShareMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metaChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  metaText: { fontSize: 12, color: '#6B7280', marginLeft: 4 },
  joinButton: { backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  joinButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  emptyRides: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#6B7280', marginTop: 16 },
  emptySubtext: { fontSize: 13, color: '#9CA3AF', marginTop: 8 },
  switchModeButton: { backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24, marginTop: 16 },
  switchModeText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  rideTypeCard: { flex: 1, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, padding: 14, borderWidth: 2, borderColor: '#E5E7EB' },
  rideTypeCardActive: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  rideTypeName: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginTop: 6, textAlign: 'center' },
  rideTypeNameActive: { color: '#10B981' },
  rideTypePrice: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  rideTypePriceActive: { color: '#059669' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  input: { flex: 1, marginLeft: 12, fontSize: 15, color: '#1F2937' },
  placeholder: { color: '#9CA3AF' },
  passengerControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  controlButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  controlButtonDisabled: { backgroundColor: '#F3F4F6' },
  passengerDisplay: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12, marginHorizontal: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  passengerCount: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', marginLeft: 8 },
  textArea: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 15, color: '#1F2937', textAlignVertical: 'top' },
  priceCard: { backgroundColor: '#ffffff', marginHorizontal: 20, marginTop: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  priceLabel: { fontSize: 14, color: '#6B7280' },
  priceValue: { fontSize: 14, color: '#1F2937', fontWeight: '600' },
  priceDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  priceTotalLabel: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  priceTotalValue: { fontSize: 18, fontWeight: 'bold', color: '#10B981' },
  bookButton: { flexDirection: 'row', backgroundColor: '#10B981', marginHorizontal: 20, marginTop: 20, borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },
  bookButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginRight: 8 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
});
