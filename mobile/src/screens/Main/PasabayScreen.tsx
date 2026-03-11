import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { rideService, rideShareService, walletService, promoService, ratesService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import MapPicker from '../../components/MapPicker';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';
import NearbyRiders from '../../components/NearbyRiders';
import Toast, { ToastType } from '../../components/Toast';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isTablet, isIOS } from '../../utils/responsive';

export default function PasabayScreen({ navigation }: any) {
  const { user } = useAuth();
  const isDriver = user?.role === 'driver';
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
        const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
        const loc = await Promise.race([locationPromise, timeoutPromise]);
        if (loc && 'coords' in loc) {
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
        }
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
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [availableRides, setAvailableRides] = useState<any[]>([]);
  const [loadingRides, setLoadingRides] = useState(false);
  const [mode, setMode] = useState<'book' | 'join'>('book');
  const [activeRide, setActiveRide] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningRideId, setJoiningRideId] = useState<number | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoApplied, setPromoApplied] = useState(false);
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));
  const lastFetchRef = useRef<number>(0);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const now = Date.now();
      if (now - lastFetchRef.current < 3000) return;
      lastFetchRef.current = now;
      (async () => {
        try {
          const res = await rideService.getActiveRides();
          const data = res.data?.data;
          if (Array.isArray(data) && data.length > 0) {
            setActiveRide(data[0]);
          } else {
            setActiveRide(null);
          }
        } catch (e) {
          console.log('Failed to fetch active rides:', e);
        }
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
      Alert.alert(
        'Active Ride Found',
        `You have a ${activeRide.status?.replace(/_/g, ' ')} ride.\nWhat would you like to do?`,
        [
          { text: 'Close', style: 'cancel' },
          {
            text: 'Track Ride',
            onPress: () => navigation.navigate('Tracking', { type: 'ride', rideId: activeRide.id, pickup: activeRide.pickup_location, dropoff: activeRide.dropoff_location, fare: activeRide.estimated_fare }),
          },
          ...(activeRide.status === 'pending' ? [{
            text: 'Cancel & Rebook',
            style: 'destructive' as const,
            onPress: handleCancelActiveRide,
          }] : []),
        ]
      );
      return;
    }

    // Check wallet balance if paying with wallet
    if (paymentMethod === 'wallet') {
      try {
        const balRes = await walletService.getBalance();
        const balance = balRes.data?.data?.balance ?? balRes.data?.balance ?? 0;
        if (balance < (ride.base_fare || 0)) {
          Alert.alert('Insufficient wallet balance', 'Please top up your wallet.');
          return;
        }
      } catch {
        Alert.alert('Error', 'Could not verify wallet balance. Please try again.');
        return;
      }
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
              setJoiningRideId(ride.id);
              const response = await rideShareService.joinRideShare(ride.id, paymentMethod);
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
              showToast(msg, 'error');
            } finally {
              setJoiningRideId(null);
            }
          },
        },
      ]
    );
  };

  const [rideTypes, setRideTypes] = useState([
    { id: 'single', name: 'Single Ride', icon: 'bicycle', basePrice: 40, vehicleType: 'motorcycle', ratePerKm: 10 },
    { id: 'habal', name: 'Habal-Habal', icon: 'bicycle', basePrice: 60, vehicleType: 'motorcycle', ratePerKm: 10 },
    { id: 'tricycle', name: 'Tricycle', icon: 'car', basePrice: 80, vehicleType: 'car', ratePerKm: 15 },
  ]);

  useEffect(() => {
    (async () => {
      try {
        const res = await ratesService.getRates();
        const rates = res.data?.data;
        if (Array.isArray(rates) && rates.length > 0) {
          const rideRates = rates.filter((r: any) => r.service_type === 'ride' && r.is_active);
          if (rideRates.length > 0) {
            const motoRate = rideRates.find((r: any) => r.vehicle_type === 'motorcycle');
            const carRate = rideRates.find((r: any) => r.vehicle_type === 'car');
            const motoBase = motoRate?.base_fare || 40;
            const motoPerKm = motoRate?.rate_per_km || 10;
            const carBase = carRate?.base_fare || 60;
            const carPerKm = carRate?.rate_per_km || 15;
            setRideTypes([
              { id: 'single', name: 'Single Ride', icon: 'bicycle', basePrice: motoBase, vehicleType: 'motorcycle', ratePerKm: motoPerKm },
              { id: 'habal', name: 'Habal-Habal', icon: 'bicycle', basePrice: Math.round(motoBase * 1.5), vehicleType: 'motorcycle', ratePerKm: motoPerKm },
              { id: 'tricycle', name: 'Tricycle', icon: 'car', basePrice: carBase, vehicleType: 'car', ratePerKm: carPerKm },
            ]);
          }
        }
      } catch (e) {
        // Keep fallback rates
      }
    })();
  }, []);

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
  const distanceCharge = distance * selectedType.ratePerKm;
  const baseFareCalc = selectedType.basePrice + passengerCharge + distanceCharge;
  const totalFare = Math.max(0, baseFareCalc - promoDiscount);

  // Reset promo when fare basis changes
  useEffect(() => {
    if (promoApplied) {
      setPromoCode('');
      setPromoDiscount(0);
      setPromoApplied(false);
    }
  }, [pickupLocation.latitude, pickupLocation.longitude, dropoffLocation.latitude, dropoffLocation.longitude, rideType, passengers]);

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    if (baseFareCalc <= 0) {
      showToast('Select locations first to apply promo.', 'warning');
      return;
    }
    setApplyingPromo(true);
    try {
      const res = await promoService.applyPromo(promoCode.trim(), baseFareCalc, 'rides');
      const discount = res.data?.data?.discount || 0;
      if (discount > 0) {
        setPromoDiscount(discount);
        setPromoApplied(true);
        showToast(`Promo applied! ₱${discount.toFixed(0)} off`, 'success');
      } else {
        showToast('Promo code is not valid for this ride.', 'warning');
      }
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Invalid promo code';
      showToast(msg, 'error');
    } finally {
      setApplyingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoCode('');
    setPromoDiscount(0);
    setPromoApplied(false);
  };

  const handleCancelActiveRide = async () => {
    if (!activeRide) return;
    try {
      await rideService.cancelRide(activeRide.id);
      setActiveRide(null);
      showToast('Previous ride cancelled. You can now book a new one.', 'success');
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to cancel ride';
      showToast(msg, 'error');
    }
  };

  const handleBookRide = async () => {
    if (activeRide) {
      Alert.alert(
        'Active Ride Found',
        `You have a ${activeRide.status?.replace(/_/g, ' ')} ride.\nWhat would you like to do?`,
        [
          { text: 'Close', style: 'cancel' },
          {
            text: 'Track Ride',
            onPress: () => navigation.navigate('Tracking', { type: 'ride', rideId: activeRide.id, pickup: activeRide.pickup_location, dropoff: activeRide.dropoff_location, fare: activeRide.estimated_fare }),
          },
          ...(activeRide.status === 'pending' ? [{
            text: 'Cancel & Rebook',
            style: 'destructive' as const,
            onPress: handleCancelActiveRide,
          }] : []),
        ]
      );
      return;
    }

    if (!pickupLocation.latitude || !dropoffLocation.latitude) {
      showToast('Please select pickup and dropoff locations.', 'warning');
      return;
    }

    if (pickupLocation.latitude === dropoffLocation.latitude && pickupLocation.longitude === dropoffLocation.longitude) {
      showToast('Pickup and dropoff locations cannot be the same.', 'warning');
      return;
    }

    // Driver flow: create a rideshare offering
    if (isDriver) {
      Alert.alert(
        'Offer Ride Share',
        `You are offering a shared ride.\n\nPickup: ${pickupLocation.address}\nDropoff: ${dropoffLocation.address}\nSeats: ${passengers}\nFare per passenger: ₱${totalFare.toFixed(0)}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Create Ride Share',
            onPress: async () => {
              setLoading(true);
              try {
                const departureTime = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min from now
                await rideShareService.createRideShare({
                  pickup_location: pickupLocation.address,
                  pickup_latitude: pickupLocation.latitude,
                  pickup_longitude: pickupLocation.longitude,
                  dropoff_location: dropoffLocation.address,
                  dropoff_latitude: dropoffLocation.latitude,
                  dropoff_longitude: dropoffLocation.longitude,
                  total_seats: passengers,
                  base_fare: totalFare,
                  departure_time: departureTime,
                });
                Alert.alert('Ride Share Created!', 'Passengers can now see and join your ride. You can check your active rideshares from the Driver Dashboard.');
                fetchAvailableRides();
              } catch (error: any) {
                const msg = error.response?.data?.error || 'Failed to create ride share';
                showToast(msg, 'error');
              } finally {
                setLoading(false);
              }
            },
          },
        ]
      );
      return;
    }

    // Passenger flow: book a regular pasabay ride
    // Check wallet balance if paying with wallet
    if (paymentMethod === 'wallet') {
      try {
        const balRes = await walletService.getBalance();
        const balance = balRes.data?.data?.balance ?? balRes.data?.balance ?? 0;
        if (balance < totalFare) {
          Alert.alert('Insufficient wallet balance', 'Please top up your wallet.');
          return;
        }
      } catch {
        Alert.alert('Error', 'Could not verify wallet balance. Please try again.');
        return;
      }
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
                estimated_fare: totalFare,
                ...(promoApplied && promoCode.trim() ? { promo_code: promoCode.trim() } : {}),
                ...(selectedDriver?.id ? { driver_id: selectedDriver.id } : {}),
              });
              const ride = response.data?.data || {};
              const rideIdNum = Number(ride.id);
              if (!rideIdNum || rideIdNum <= 0) {
                Alert.alert('Booking Error', 'Ride was created but we could not get the booking ID. Please check your active rides.');
                return;
              }
              navigation.navigate('Tracking', {
                type: 'ride',
                rideId: rideIdNum,
                pickup: pickupLocation.address,
                dropoff: dropoffLocation.address,
                fare: ride.estimated_fare || totalFare,
              });
            } catch (error: any) {
              const msg = error.response?.data?.error || (error.code === 'ECONNABORTED' ? 'Request timed out. The server may be starting up — please try again.' : 'Failed to book ride. Please check your connection and try again.');
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="people" size={24} color="#ffffff" />
          <Text style={styles.headerTitle}>Pasabay</Text>
          <Text style={styles.headerSubtitle}>Ride Sharing</Text>
        </View>
        <View style={{ width: moderateScale(40) }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: verticalScale(36) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />}
      >
        {/* Active Ride Banner */}
        {!!activeRide && (
          <TouchableOpacity
            style={styles.activeBanner}
            onPress={() => navigation.navigate('Tracking', { type: 'ride', rideId: activeRide.id, pickup: activeRide.pickup_location, dropoff: activeRide.dropoff_location, fare: activeRide.estimated_fare })}
          >
            <View style={styles.activeBannerDot} />
            <View style={{ flex: 1, marginLeft: moderateScale(12) }}>
              <Text style={styles.activeBannerTitle}>Active ride in progress</Text>
              <Text style={styles.activeBannerSub}>Tap to track • {activeRide.status?.replace(/_/g, ' ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8B5CF6" />
          </TouchableOpacity>
        )}

        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'book' && styles.modeButtonActive]}
            onPress={() => setMode('book')}
          >
            <Ionicons name="add-circle-outline" size={20} color={mode === 'book' ? '#ffffff' : '#6B7280'} />
            <Text style={[styles.modeText, mode === 'book' && styles.modeTextActive]}>{isDriver ? 'Offer a Ride' : 'Book a Ride'}</Text>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(10) }}>
              <Text style={styles.label}>Available Ride Shares</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{availableRides.length}</Text>
              </View>
            </View>
            {loadingRides ? (
              <ActivityIndicator size="large" color="#8B5CF6" style={{ marginVertical: verticalScale(36) }} />
            ) : availableRides.length > 0 ? (
              availableRides.map((ride: any) => (
                <View key={ride.id} style={styles.rideShareCard}>
                  <View style={styles.rideShareHeader}>
                    <View style={styles.rideShareIcon}>
                      <Ionicons name="car" size={24} color="#8B5CF6" />
                    </View>
                    <View style={{ flex: 1, marginLeft: moderateScale(12) }}>
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
                            <Ionicons name="star" size={10} color="#FBBF24" style={{ marginLeft: moderateScale(4) }} />
                            <Text style={{ fontSize: fontScale(11), color: '#92400E', marginLeft: moderateScale(2) }}>{Number(ride.driver.rating).toFixed(1)}</Text>
                          </>
                        )}
                      </View>
                    )}
                    {!!ride.driver?.vehicle_plate && (
                      <View style={[styles.metaChip, { backgroundColor: '#EFF6FF' }]}>
                        <Text style={{ fontSize: fontScale(11), fontWeight: '600', color: '#3B82F6' }}>{ride.driver.vehicle_plate}</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={styles.joinButton}
                    onPress={() => handleJoinRideShare(ride)}
                    disabled={joiningRideId !== null}
                  >
                    {joiningRideId === ride.id ? (
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
                  <Text style={styles.switchModeText}>{isDriver ? 'Offer a Ride' : 'Book a Ride'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <>
            {/* Ride Type */}
            <View style={styles.section}>
              <Text style={styles.label}>Ride Type</Text>
              <View style={{ flexDirection: 'row', gap: moderateScale(8) }}>
                {rideTypes.map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={[styles.rideTypeCard, rideType === type.id && styles.rideTypeCardActive]}
                    onPress={() => setRideType(type.id)}
                  >
                    <Ionicons name={type.icon as any} size={28} color={rideType === type.id ? '#8B5CF6' : '#6B7280'} />
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
                <Ionicons name="location-outline" size={20} color="#8B5CF6" />
                {detectingLocation ? (
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: moderateScale(12) }}>
                    <ActivityIndicator size="small" color="#8B5CF6" />
                    <Text style={{ marginLeft: moderateScale(8), color: '#6B7280', fontSize: RESPONSIVE.fontSize.medium }}>Detecting location...</Text>
                  </View>
                ) : (
                  <Text style={[styles.input, !pickupLocation.address && styles.placeholder]} numberOfLines={1}>
                    {pickupLocation.address || 'Select pickup on map'}
                  </Text>
                )}
                <Ionicons name="navigate" size={20} color="#8B5CF6" />
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
                  <Ionicons name="remove" size={24} color={passengers <= 1 ? '#D1D5DB' : '#8B5CF6'} />
                </TouchableOpacity>
                <View style={styles.passengerDisplay}>
                  <Ionicons name="people" size={24} color="#8B5CF6" />
                  <Text style={styles.passengerCount}>{passengers}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.controlButton, passengers >= 4 && styles.controlButtonDisabled]}
                  onPress={() => setPassengers(Math.min(4, passengers + 1))}
                  disabled={passengers >= 4}
                >
                  <Ionicons name="add" size={24} color={passengers >= 4 ? '#D1D5DB' : '#8B5CF6'} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Notes */}
            <View style={styles.section}>
              <Text style={styles.label}>Notes for Rider</Text>
              <TextInput
                style={[styles.textArea, { minHeight: verticalScale(54) }]}
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
              <PaymentMethodSelector selected={paymentMethod} onSelect={setPaymentMethod} accentColor="#8B5CF6" />
            </View>

            {/* Promo Code */}
            <View style={styles.section}>
              <Text style={styles.label}>Promo Code</Text>
              {promoApplied ? (
                <View style={[styles.inputContainer, { borderColor: '#10B981', backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="pricetag" size={20} color="#10B981" />
                  <Text style={[styles.input, { color: '#065F46', fontWeight: '600' }]}>{promoCode} (-₱{promoDiscount.toFixed(0)})</Text>
                  <TouchableOpacity onPress={handleRemovePromo}>
                    <Ionicons name="close-circle" size={22} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.inputContainer}>
                  <Ionicons name="pricetag-outline" size={20} color="#8B5CF6" />
                  <TextInput style={styles.input} placeholder="Enter promo code" value={promoCode} onChangeText={setPromoCode} autoCapitalize="characters" />
                  <TouchableOpacity onPress={handleApplyPromo} disabled={applyingPromo || !promoCode.trim()}>
                    {applyingPromo ? (
                      <ActivityIndicator size="small" color="#8B5CF6" />
                    ) : (
                      <Text style={{ color: promoCode.trim() ? '#8B5CF6' : '#D1D5DB', fontWeight: '600', fontSize: RESPONSIVE.fontSize.medium }}>Apply</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
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
                  <Text style={styles.priceLabel}>Distance ({distance.toFixed(1)} km x ₱{selectedType.ratePerKm})</Text>
                  <Text style={styles.priceValue}>₱{distanceCharge.toFixed(0)}</Text>
                </View>
              )}
              {promoDiscount > 0 && (
                <View style={styles.priceRow}>
                  <Text style={[styles.priceLabel, { color: '#10B981' }]}>Promo Discount</Text>
                  <Text style={[styles.priceValue, { color: '#10B981' }]}>-₱{promoDiscount.toFixed(0)}</Text>
                </View>
              )}
              <View style={styles.priceDivider} />
              <View style={styles.priceRow}>
                <Text style={styles.priceTotalLabel}>Total</Text>
                <Text style={styles.priceTotalValue}>₱{totalFare.toFixed(0)}</Text>
              </View>
            </View>

            {/* Nearby Riders */}
            {pickupLocation.latitude && pickupLocation.longitude && !isDriver && (
              <NearbyRiders
                pickupLatitude={pickupLocation.latitude}
                pickupLongitude={pickupLocation.longitude}
                accentColor="#8B5CF6"
                selectedDriverId={selectedDriver?.id || null}
                onSelectDriver={setSelectedDriver}
              />
            )}

            {selectedDriver && (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#F5F3FF',
                borderRadius: moderateScale(10),
                padding: moderateScale(10),
                marginHorizontal: RESPONSIVE.marginHorizontal,
                marginTop: verticalScale(8),
                borderWidth: 1,
                borderColor: '#8B5CF6',
              }}>
                <Ionicons name="person-circle" size={20} color="#8B5CF6" />
                <Text style={{ flex: 1, marginLeft: moderateScale(8), fontSize: fontScale(13), color: '#374151', fontWeight: '600' }}>
                  {selectedDriver.name} · {selectedDriver.eta}
                </Text>
                <TouchableOpacity onPress={() => setSelectedDriver(null)}>
                  <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            )}

            {/* Book */}
            <TouchableOpacity
              style={[styles.bookButton, (loading || !!activeRide) && { opacity: 0.7 }]}
              onPress={handleBookRide}
              disabled={loading || !!activeRide}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <View style={styles.bookButtonContent}>
                  <View>
                    <Text style={styles.bookButtonText}>{isDriver ? 'Offer Ride Share' : 'Book Ride'}</Text>
                    {totalFare > 0 && <Text style={styles.bookButtonFare}>₱{totalFare.toFixed(0)} • {passengers} passenger{passengers > 1 ? 's' : ''}</Text>}
                  </View>
                  <View style={styles.bookButtonArrow}>
                    <Ionicons name="arrow-forward" size={20} color="#8B5CF6" />
                  </View>
                </View>
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
            <View style={{ width: moderateScale(28) }} />
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
            <View style={{ width: moderateScale(28) }} />
          </View>
          <MapPicker title="Select Dropoff Location" onLocationSelect={handleDropoffSelect} initialLocation={dropoffLocation.latitude ? dropoffLocation : pickupLocation.latitude ? pickupLocation : undefined} />
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: isIOS ? verticalScale(50) : verticalScale(35), paddingBottom: verticalScale(16), backgroundColor: '#8B5CF6' },
  backBtn: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20), backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: RESPONSIVE.fontSize.xlarge, fontWeight: 'bold', color: '#ffffff' },
  headerSubtitle: { fontSize: RESPONSIVE.fontSize.small, color: 'rgba(255,255,255,0.85)', marginTop: verticalScale(2) },
  activeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F3FF', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12), padding: moderateScale(14), borderRadius: RESPONSIVE.borderRadius.medium, borderWidth: 1, borderColor: '#DDD6FE' },
  activeBannerDot: { width: moderateScale(12), height: moderateScale(12), borderRadius: moderateScale(6), backgroundColor: '#8B5CF6' },
  activeBannerTitle: { fontSize: RESPONSIVE.fontSize.medium, fontWeight: '600', color: '#4C1D95' },
  activeBannerSub: { fontSize: RESPONSIVE.fontSize.small, color: '#6D28D9', marginTop: verticalScale(2) },
  modeToggle: { flexDirection: 'row', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12), backgroundColor: '#F3F4F6', borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(4) },
  modeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: moderateScale(12), borderRadius: RESPONSIVE.borderRadius.small, gap: moderateScale(8) },
  modeButtonActive: { backgroundColor: '#8B5CF6' },
  modeText: { fontSize: RESPONSIVE.fontSize.medium, fontWeight: '600', color: '#6B7280' },
  modeTextActive: { color: '#ffffff' },
  section: { paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: verticalScale(12) },
  label: { fontSize: RESPONSIVE.fontSize.medium, fontWeight: '600', color: '#374151', marginBottom: verticalScale(6) },
  countBadge: { backgroundColor: '#8B5CF6', borderRadius: RESPONSIVE.borderRadius.medium, minWidth: moderateScale(24), height: moderateScale(24), alignItems: 'center', justifyContent: 'center', marginLeft: moderateScale(8), paddingHorizontal: moderateScale(8) },
  countText: { fontSize: RESPONSIVE.fontSize.small, fontWeight: 'bold', color: '#ffffff' },
  rideShareCard: { backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, padding: RESPONSIVE.paddingHorizontal, marginBottom: verticalScale(10), borderWidth: 1, borderColor: '#E5E7EB' },
  rideShareHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(10) },
  rideShareIcon: { width: moderateScale(44), height: moderateScale(44), borderRadius: moderateScale(22), backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' },
  rideShareRoute: { fontSize: RESPONSIVE.fontSize.regular, fontWeight: '600', color: '#1F2937' },
  rideShareDest: { fontSize: RESPONSIVE.fontSize.small, color: '#6B7280', marginTop: verticalScale(2) },
  rideShareFare: { fontSize: RESPONSIVE.fontSize.xlarge, fontWeight: 'bold', color: '#8B5CF6' },
  rideShareMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: moderateScale(8), marginBottom: verticalScale(10) },
  metaChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: moderateScale(8), paddingVertical: moderateScale(4), borderRadius: RESPONSIVE.borderRadius.small },
  metaText: { fontSize: RESPONSIVE.fontSize.small, color: '#6B7280', marginLeft: moderateScale(4) },
  joinButton: { backgroundColor: '#8B5CF6', borderRadius: RESPONSIVE.borderRadius.small, paddingVertical: moderateScale(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: moderateScale(8) },
  joinButtonText: { color: '#ffffff', fontSize: RESPONSIVE.fontSize.regular, fontWeight: '600' },
  emptyRides: { alignItems: 'center', paddingVertical: verticalScale(36) },
  emptyText: { fontSize: RESPONSIVE.fontSize.regular, fontWeight: '600', color: '#6B7280', marginTop: verticalScale(12) },
  emptySubtext: { fontSize: RESPONSIVE.fontSize.small, color: '#9CA3AF', marginTop: verticalScale(8) },
  switchModeButton: { backgroundColor: '#8B5CF6', borderRadius: RESPONSIVE.borderRadius.small, paddingVertical: moderateScale(10), paddingHorizontal: moderateScale(24), marginTop: verticalScale(12) },
  switchModeText: { color: '#ffffff', fontSize: RESPONSIVE.fontSize.medium, fontWeight: '600' },
  rideTypeCard: { flex: 1, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(14), borderWidth: 2, borderColor: '#E5E7EB' },
  rideTypeCardActive: { borderColor: '#8B5CF6', backgroundColor: '#F5F3FF' },
  rideTypeName: { fontSize: fontScale(11), fontWeight: '600', color: '#6B7280', marginTop: verticalScale(6), textAlign: 'center' },
  rideTypeNameActive: { color: '#8B5CF6' },
  rideTypePrice: { fontSize: fontScale(11), color: '#9CA3AF', marginTop: verticalScale(4) },
  rideTypePriceActive: { color: '#7C3AED' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingVertical: moderateScale(12), borderWidth: 1, borderColor: '#E5E7EB' },
  input: { flex: 1, marginLeft: moderateScale(12), fontSize: RESPONSIVE.fontSize.regular, color: '#1F2937' },
  placeholder: { color: '#9CA3AF' },
  passengerControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  controlButton: { width: moderateScale(48), height: moderateScale(48), borderRadius: moderateScale(24), backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' },
  controlButtonDisabled: { backgroundColor: '#F3F4F6' },
  passengerDisplay: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, paddingHorizontal: moderateScale(32), paddingVertical: moderateScale(12), marginHorizontal: RESPONSIVE.paddingHorizontal, borderWidth: 1, borderColor: '#E5E7EB' },
  passengerCount: { fontSize: RESPONSIVE.fontSize.xxlarge, fontWeight: 'bold', color: '#1F2937', marginLeft: moderateScale(8) },
  textArea: { backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, padding: RESPONSIVE.paddingHorizontal, borderWidth: 1, borderColor: '#E5E7EB', fontSize: RESPONSIVE.fontSize.regular, color: '#1F2937', textAlignVertical: 'top' },
  priceCard: { backgroundColor: '#ffffff', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12), borderRadius: RESPONSIVE.borderRadius.medium, padding: RESPONSIVE.paddingHorizontal, borderWidth: 1, borderColor: '#E5E7EB' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: verticalScale(6) },
  priceLabel: { fontSize: RESPONSIVE.fontSize.medium, color: '#6B7280' },
  priceValue: { fontSize: RESPONSIVE.fontSize.medium, color: '#1F2937', fontWeight: '600' },
  priceDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: moderateScale(8) },
  priceTotalLabel: { fontSize: RESPONSIVE.fontSize.regular, fontWeight: 'bold', color: '#1F2937' },
  priceTotalValue: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#8B5CF6' },
  bookButton: { backgroundColor: '#8B5CF6', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(16), marginBottom: verticalScale(8), borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(18), shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: verticalScale(4) }, shadowOpacity: 0.3, shadowRadius: moderateScale(8), elevation: moderateScale(6) },
  bookButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bookButtonText: { color: '#ffffff', fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold' },
  bookButtonFare: { color: 'rgba(255,255,255,0.9)', fontSize: RESPONSIVE.fontSize.small, marginTop: verticalScale(2) },
  bookButtonArrow: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20), backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: isIOS ? verticalScale(50) : verticalScale(35), paddingBottom: verticalScale(12), backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#1F2937' },
});
