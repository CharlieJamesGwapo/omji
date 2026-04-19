import React, { useState, useEffect, useRef } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { rideService, walletService, promoService, ratesService } from '../../services/api';
import MapPicker from '../../components/MapPicker';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';
import Toast, { ToastType } from '../../components/Toast';
import ConfirmBookingModal from '../../components/ConfirmBookingModal';
import type { BookingDetail } from '../../components/ConfirmBookingModal';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isTablet, isIOS } from '../../utils/responsive';
import { useRoadDistance } from '../../hooks/useDistance';
import { haptic } from '../../utils/haptics';

export default function PasundoScreen({ navigation, route }: any) {
  const initialDropoff = route?.params?.dropoff;
  const [showPickupMap, setShowPickupMap] = useState(false);
  const [showDropoffMap, setShowDropoffMap] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(true);

  const [pickupLocation, setPickupLocation] = useState({
    address: '',
    latitude: 0,
    longitude: 0,
  });

  const [dropoffLocation, setDropoffLocation] = useState({
    address: initialDropoff?.address || '',
    latitude: initialDropoff?.latitude || 0,
    longitude: initialDropoff?.longitude || 0,
  });

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setDetectingLocation(false); return; }
        const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
        let loc = await Promise.race([locationPromise, timeoutPromise]);
        if (!loc) {
          try { loc = await Location.getLastKnownPositionAsync(); } catch {}
        }
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
        // Location detection failed silently - user can pick manually
      } finally {
        setDetectingLocation(false);
      }
    })();
  }, []);

  const [pickupType, setPickupType] = useState('person');
  const [personName, setPersonName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [vehicleType, setVehicleType] = useState('motorcycle');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [estimatedTime, setEstimatedTime] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoApplied, setPromoApplied] = useState(false);
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [scheduleMode, setScheduleMode] = useState<'now' | 'schedule'>('now');
  const [scheduleDateIndex, setScheduleDateIndex] = useState(0);
  const [scheduleHour, setScheduleHour] = useState<number | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));
  const lastFetchRef = useRef<number>(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Schedule date options: today, tomorrow, day after tomorrow
  const getScheduleDates = () => {
    const now = new Date();
    const dates = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      dates.push({ label, date: d });
    }
    return dates;
  };

  // Schedule time slots: hourly from now+1h to 10 PM
  const getScheduleTimeSlots = () => {
    const now = new Date();
    const isToday = scheduleDateIndex === 0;
    const startHour = isToday ? now.getHours() + 2 : 6; // at least 2 hours from now if today, else 6 AM
    const endHour = 22; // 10 PM
    const slots: number[] = [];
    for (let h = startHour; h <= endHour; h++) {
      slots.push(h);
    }
    return slots;
  };

  const formatHour = (h: number) => {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:00 ${suffix}`;
  };

  const getScheduledAtISO = (): string | null => {
    if (scheduleMode !== 'schedule' || scheduleHour === null) return null;
    const dates = getScheduleDates();
    const selectedDate = dates[scheduleDateIndex]?.date;
    if (!selectedDate) return null;
    const scheduled = new Date(selectedDate);
    scheduled.setHours(scheduleHour, 0, 0, 0);
    return scheduled.toISOString();
  };

  const getScheduleLabel = (): string => {
    if (scheduleMode !== 'schedule' || scheduleHour === null) return '';
    const dates = getScheduleDates();
    return `${dates[scheduleDateIndex]?.label} at ${formatHour(scheduleHour)}`;
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const now = Date.now();
      if (now - lastFetchRef.current < 3000) return;
      lastFetchRef.current = now;
      (async () => {
        try {
          const res = await rideService.getActiveRides();
          if (!mountedRef.current) return;
          const data = res.data?.data;
          if (Array.isArray(data) && data.length > 0) {
            setActiveRide(data[0]);
          } else {
            setActiveRide(null);
          }
        } catch (e) {
          // Silently ignore - will retry on next focus
        }
      })();
    });
    return unsubscribe;
  }, [navigation]);

  const pickupTypes = [
    { id: 'person', name: 'Person', icon: 'person', desc: 'School, Market, etc.' },
    { id: 'parcel', name: 'Parcel', icon: 'cube', desc: 'Pick up package' },
    { id: 'document', name: 'Document', icon: 'document', desc: 'Important papers' },
  ];

  const [vehicleTypes, setVehicleTypes] = useState([
    { id: 'motorcycle', name: 'Motorcycle', icon: 'bicycle', base: 40, rate: 10 },
    { id: 'car', name: 'Car', icon: 'car', base: 60, rate: 15 },
  ]);

  useEffect(() => {
    (async () => {
      try {
        const res = await ratesService.getRates();
        if (!mountedRef.current) return;
        const rates = res.data?.data;
        if (Array.isArray(rates) && rates.length > 0) {
          const rideRates = rates.filter((r: any) => r.service_type === 'ride');
          if (rideRates.length > 0) {
            const mapped = rideRates.map((r: any) => ({
              id: r.vehicle_type || 'motorcycle',
              name: r.vehicle_type === 'car' ? 'Car' : 'Motorcycle',
              icon: r.vehicle_type === 'car' ? 'car' : 'bicycle',
              base: r.base_fare || 40,
              rate: r.rate_per_km || 10,
            }));
            setVehicleTypes(mapped);
          }
        }
      } catch (e) {
        // Keep fallback rates
      } finally {
        if (mountedRef.current) setRatesLoading(false);
      }
    })();
  }, []);

  const selectedVehicle = vehicleTypes.find(v => v.id === vehicleType) || vehicleTypes[0];

  const handlePickupSelect = (location: any) => {
    setPickupLocation(location);
    setShowPickupMap(false);
  };

  const handleDropoffSelect = (location: any) => {
    setDropoffLocation(location);
    setShowDropoffMap(false);
  };

  const { distance, duration: roadDuration, isRoad } = useRoadDistance(pickupLocation, dropoffLocation);
  const baseFareCalc = distance > 0
    ? Math.round((selectedVehicle.base + distance * selectedVehicle.rate) * 100) / 100
    : 0;
  const estimatedFare = Math.max(0, baseFareCalc - promoDiscount);

  // Calculate estimated arrival time from road duration
  useEffect(() => {
    if (distance > 0 && roadDuration > 0) {
      setEstimatedTime(roadDuration <= 1 ? '~1 min' : `~${roadDuration} min`);
    } else {
      setEstimatedTime('');
    }
  }, [distance, roadDuration]);

  // Reset promo when fare basis changes (locations or vehicle changed)
  useEffect(() => {
    if (promoApplied) {
      setPromoCode('');
      setPromoDiscount(0);
      setPromoApplied(false);
    }
  }, [pickupLocation.latitude, pickupLocation.longitude, dropoffLocation.latitude, dropoffLocation.longitude, vehicleType]);

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

  const buildPickupLabel = () => {
    let label = pickupLocation.address;
    if (pickupType === 'person' && personName) {
      label += ` [Pickup: ${personName}`;
      if (contactNumber) label += `, ${contactNumber}`;
      label += ']';
    } else if (pickupType !== 'person') {
      label += ` [${pickupType}]`;
    }
    if (notes.trim()) {
      label += ` (${notes.trim()})`;
    }
    return label;
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

  const handleBookPickup = async () => {
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
      showToast('Please select both pickup and dropoff locations on the map.', 'warning');
      return;
    }

    if (pickupLocation.latitude === dropoffLocation.latitude && pickupLocation.longitude === dropoffLocation.longitude) {
      showToast('Pickup and dropoff locations cannot be the same.', 'warning');
      return;
    }

    if (pickupType === 'person' && !personName.trim()) {
      showToast("Please enter the person's name to pick up.", 'warning');
      return;
    }

    // Validate schedule selection
    if (scheduleMode === 'schedule' && scheduleHour === null) {
      showToast('Please select a time for your scheduled ride.', 'warning');
      return;
    }

    // Check wallet balance if paying with wallet
    if (paymentMethod === 'wallet') {
      try {
        const balRes = await walletService.getBalance();
        const balance = balRes.data?.data?.balance ?? balRes.data?.balance ?? 0;
        if (balance < estimatedFare) {
          Alert.alert('Insufficient wallet balance', 'Please top up your wallet.');
          return;
        }
      } catch {
        Alert.alert('Error', 'Could not verify wallet balance. Please try again.');
        return;
      }
    }

    setShowConfirmModal(true);
  };

  const confirmBookingDetails: BookingDetail[] = [
    ...(pickupType === 'person' ? [{ icon: 'person-outline', label: 'Person', value: personName }] as BookingDetail[] : []),
    { icon: 'car-sport-outline', label: 'Vehicle', value: selectedVehicle.name },
    { icon: 'location-outline', label: 'Pickup', value: pickupLocation.address, color: '#3B82F6' },
    { icon: 'flag-outline', label: 'Dropoff', value: dropoffLocation.address, color: '#EF4444' },
    { icon: 'navigate-outline', label: 'Distance', value: `${distance.toFixed(1)} km` },
    { icon: 'time-outline', label: scheduleMode === 'schedule' ? 'Scheduled' : 'Est. Time', value: scheduleMode === 'schedule' ? getScheduleLabel() : (estimatedTime || '...') },
    { icon: 'card-outline', label: 'Payment', value: paymentMethod === 'gcash' ? 'GCash' : paymentMethod === 'maya' ? 'Maya' : paymentMethod === 'wallet' ? 'Wallet' : 'Cash' },
  ];

  const executePasundoBooking = () => {
    setShowConfirmModal(false);
    haptic.success();
    const pickupLabel = buildPickupLabel();
    const scheduledAtISO = getScheduledAtISO();
    navigation.navigate('RiderSelection', {
      bookingData: {
        pickup_location: pickupLabel,
        pickup_latitude: pickupLocation.latitude,
        pickup_longitude: pickupLocation.longitude,
        dropoff_location: dropoffLocation.address,
        dropoff_latitude: dropoffLocation.latitude,
        dropoff_longitude: dropoffLocation.longitude,
        vehicle_type: vehicleType,
        payment_method: paymentMethod,
        estimated_fare: estimatedFare,
        distance: distance,
        ...(promoApplied && promoCode.trim() ? { promo_code: promoCode.trim() } : {}),
        ...(scheduledAtISO ? { scheduled_at: scheduledAtISO } : {}),
      },
    });
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="people" size={24} color="#ffffff" />
          <Text style={styles.headerTitle}>Pasundo</Text>
          <Text style={styles.headerSubtitle}>Pick-up Service</Text>
        </View>
        <View style={{ width: moderateScale(40) }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? verticalScale(20) : verticalScale(28) }}>
        {/* Active Ride Banner */}
        {!!activeRide && (
          <TouchableOpacity
            style={styles.activeBanner}
            onPress={() => navigation.navigate('Tracking', { type: 'ride', rideId: activeRide.id, pickup: activeRide.pickup_location, dropoff: activeRide.dropoff_location, fare: activeRide.estimated_fare })}
            accessibilityLabel="Active ride in progress, tap to track"
            accessibilityRole="button"
          >
            <View style={styles.activeBannerDot} />
            <View style={{ flex: 1, marginLeft: moderateScale(12) }}>
              <Text style={styles.activeBannerTitle}>Active ride in progress</Text>
              <Text style={styles.activeBannerSub}>Tap to track • {activeRide.status?.replace(/_/g, ' ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#DC2626" />
          </TouchableOpacity>
        )}

        {/* Pickup Type */}
        <View style={styles.section}>
          <Text style={styles.label}>What to pick up?</Text>
          <View style={styles.typeContainer}>
            {pickupTypes.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[styles.typeCard, pickupType === type.id && styles.typeCardActive]}
                onPress={() => setPickupType(type.id)}
                accessibilityLabel={`${type.name}: ${type.desc}${pickupType === type.id ? ', selected' : ''}`}
                accessibilityRole="button"
              >
                <Ionicons name={type.icon as any} size={28} color={pickupType === type.id ? '#DC2626' : '#6B7280'} />
                <Text style={[styles.typeName, pickupType === type.id && styles.typeNameActive]}>{type.name}</Text>
                <Text style={styles.typeDesc}>{type.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Person Details */}
        {pickupType === 'person' && (
          <>
            <View style={styles.section}>
              <Text style={styles.label}>Person's Name *</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color="#DC2626" />
                <TextInput style={styles.input} placeholder="Enter name" value={personName} onChangeText={setPersonName} />
              </View>
            </View>
            <View style={styles.section}>
              <Text style={styles.label}>Contact Number</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={20} color="#DC2626" />
                <TextInput style={styles.input} placeholder="Enter contact number" value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" />
              </View>
            </View>
          </>
        )}

        {/* Pickup Location */}
        <View style={styles.section}>
          <Text style={styles.label}>Pickup Location *</Text>
          <TouchableOpacity style={styles.inputContainer} onPress={() => setShowPickupMap(true)} accessibilityLabel={pickupLocation.address ? `Pickup location: ${pickupLocation.address}` : 'Select pickup location'} accessibilityRole="button">
            <Ionicons name="location-outline" size={20} color="#DC2626" />
            {detectingLocation ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: moderateScale(12) }}>
                <ActivityIndicator size="small" color="#DC2626" />
                <Text style={{ marginLeft: moderateScale(8), color: '#6B7280', fontSize: RESPONSIVE.fontSize.medium }}>Detecting location...</Text>
              </View>
            ) : (
              <Text style={[styles.input, !pickupLocation.address && styles.placeholder]} numberOfLines={1}>
                {pickupLocation.address || 'Select pickup on map'}
              </Text>
            )}
            <Ionicons name="navigate" size={20} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {/* Dropoff Location */}
        <View style={styles.section}>
          <Text style={styles.label}>Dropoff Location *</Text>
          <TouchableOpacity style={styles.inputContainer} onPress={() => setShowDropoffMap(true)} accessibilityLabel={dropoffLocation.address ? `Dropoff location: ${dropoffLocation.address}` : 'Select dropoff location'} accessibilityRole="button">
            <Ionicons name="flag-outline" size={20} color="#EF4444" />
            <Text style={[styles.input, !dropoffLocation.address && styles.placeholder]} numberOfLines={1}>
              {dropoffLocation.address || 'Select dropoff on map'}
            </Text>
            <Ionicons name="map" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>

        {/* Schedule Ride */}
        <View style={styles.section}>
          <Text style={styles.label}>When?</Text>
          <View style={{ flexDirection: 'row', gap: moderateScale(8) }}>
            <TouchableOpacity
              style={[styles.scheduleChip, scheduleMode === 'now' && styles.scheduleChipActive]}
              onPress={() => { setScheduleMode('now'); setScheduleHour(null); }}
              accessibilityLabel="Book now"
              accessibilityRole="button"
            >
              <Ionicons name="flash" size={16} color={scheduleMode === 'now' ? '#ffffff' : '#6B7280'} />
              <Text style={[styles.scheduleChipText, scheduleMode === 'now' && styles.scheduleChipTextActive]}>Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.scheduleChip, scheduleMode === 'schedule' && styles.scheduleChipActive]}
              onPress={() => setScheduleMode('schedule')}
              accessibilityLabel="Schedule for later"
              accessibilityRole="button"
            >
              <Ionicons name="calendar" size={16} color={scheduleMode === 'schedule' ? '#ffffff' : '#6B7280'} />
              <Text style={[styles.scheduleChipText, scheduleMode === 'schedule' && styles.scheduleChipTextActive]}>Schedule</Text>
            </TouchableOpacity>
          </View>
          {scheduleMode === 'schedule' && (
            <View style={{ marginTop: verticalScale(10) }}>
              <Text style={[styles.label, { fontSize: RESPONSIVE.fontSize.small, marginBottom: verticalScale(6) }]}>Date</Text>
              <View style={{ flexDirection: 'row', gap: moderateScale(8) }}>
                {getScheduleDates().map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.scheduleChip, scheduleDateIndex === i && styles.scheduleChipActive, { flex: 1 }]}
                    onPress={() => { setScheduleDateIndex(i); setScheduleHour(null); }}
                    accessibilityLabel={d.label}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.scheduleChipText, scheduleDateIndex === i && styles.scheduleChipTextActive]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.label, { fontSize: RESPONSIVE.fontSize.small, marginTop: verticalScale(10), marginBottom: verticalScale(6) }]}>Time</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: moderateScale(-4) }}>
                <View style={{ flexDirection: 'row', gap: moderateScale(8), paddingHorizontal: moderateScale(4) }}>
                  {getScheduleTimeSlots().length > 0 ? getScheduleTimeSlots().map((h) => (
                    <TouchableOpacity
                      key={h}
                      style={[styles.scheduleChip, scheduleHour === h && styles.scheduleChipActive, { paddingHorizontal: moderateScale(14) }]}
                      onPress={() => setScheduleHour(h)}
                      accessibilityLabel={formatHour(h)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.scheduleChipText, scheduleHour === h && styles.scheduleChipTextActive]}>{formatHour(h)}</Text>
                    </TouchableOpacity>
                  )) : (
                    <Text style={{ color: '#9CA3AF', fontSize: RESPONSIVE.fontSize.small, paddingVertical: verticalScale(8) }}>No time slots available today. Try tomorrow.</Text>
                  )}
                </View>
              </ScrollView>
            </View>
          )}
        </View>

        {/* Vehicle Type */}
        <View style={styles.section}>
          <Text style={styles.label}>Vehicle Type</Text>
          <View style={{ flexDirection: 'row', gap: moderateScale(12) }}>
            {vehicleTypes.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.vehicleCard, vehicleType === v.id && styles.vehicleCardActive, { minHeight: moderateScale(48) }]}
                onPress={() => { haptic.light(); setVehicleType(v.id); }}
                accessibilityLabel={`Select ${v.name.toLowerCase()}, base fare ${v.base} pesos${vehicleType === v.id ? ', selected' : ''}`}
                accessibilityRole="button"
              >
                <Ionicons name={v.icon as any} size={28} color={vehicleType === v.id ? '#DC2626' : '#6B7280'} />
                <Text style={[styles.vehicleName, vehicleType === v.id && { color: '#DC2626' }]}>{v.name}</Text>
                <Text style={styles.vehiclePrice}>₱{v.base} + ₱{v.rate}/km</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Special Instructions</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Add any special instructions..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Payment */}
        <View style={styles.section}>
          <Text style={styles.label}>Payment Method</Text>
          <PaymentMethodSelector selected={paymentMethod} onSelect={setPaymentMethod} accentColor="#DC2626" />
        </View>

        {/* Promo Code */}
        <View style={styles.section}>
          <Text style={styles.label}>Promo Code</Text>
          {promoApplied ? (
            <View style={[styles.inputContainer, { borderColor: '#10B981', backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="pricetag" size={20} color="#10B981" />
              <Text style={[styles.input, { color: '#065F46', fontWeight: '600' }]}>{promoCode} (-₱{promoDiscount.toFixed(0)})</Text>
              <TouchableOpacity onPress={handleRemovePromo} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Remove promo code" accessibilityRole="button">
                <Ionicons name="close-circle" size={22} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.inputContainer}>
              <Ionicons name="pricetag-outline" size={20} color="#DC2626" />
              <TextInput style={styles.input} placeholder="Enter promo code" value={promoCode} onChangeText={setPromoCode} autoCapitalize="characters" />
              <TouchableOpacity onPress={handleApplyPromo} disabled={applyingPromo || !promoCode.trim()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Apply promo code" accessibilityRole="button">
                {applyingPromo ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Text style={{ color: promoCode.trim() ? '#DC2626' : '#D1D5DB', fontWeight: '600', fontSize: RESPONSIVE.fontSize.medium }}>Apply</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Price Breakdown */}
        <View style={styles.priceCard}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Base Fare ({selectedVehicle.name})</Text>
            <Text style={styles.priceValue}>₱{selectedVehicle.base}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Per Kilometer</Text>
            <Text style={styles.priceValue}>₱{selectedVehicle.rate}/km</Text>
          </View>
          {distance > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Distance ({distance.toFixed(1)} km)</Text>
              <Text style={styles.priceValue}>₱{(distance * selectedVehicle.rate).toFixed(0)}</Text>
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
            <Text style={styles.priceTotalLabel}>Estimated Total</Text>
            <Text style={styles.priceTotalValue}>
              {estimatedFare > 0 ? `₱${estimatedFare.toFixed(0)}` : 'Select locations'}
            </Text>
          </View>
        </View>

        {/* ETA Display */}
        {!!estimatedTime && (
          <View style={styles.etaCard}>
            <View style={styles.etaIconContainer}>
              <Ionicons name="time" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.etaLabel}>Estimated Travel Time</Text>
              <Text style={styles.etaValue}>{estimatedTime}</Text>
            </View>
            <View style={styles.etaDistanceBadge}>
              <Text style={styles.etaDistanceText}>{distance.toFixed(1)} km</Text>
            </View>
          </View>
        )}

        {/* Info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#DC2626" />
          <Text style={styles.infoText}>
            {scheduleMode === 'schedule'
              ? 'Your ride will be queued and matched with a rider when the scheduled time arrives.'
              : 'Nearby riders will be notified when you book'}
          </Text>
        </View>

        {/* Schedule Summary */}
        {scheduleMode === 'schedule' && scheduleHour !== null && (
          <View style={[styles.etaCard, { borderColor: '#DC2626' }]}>
            <View style={styles.etaIconContainer}>
              <Ionicons name="calendar" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.etaLabel}>Scheduled Pickup</Text>
              <Text style={styles.etaValue}>{getScheduleLabel()}</Text>
            </View>
          </View>
        )}

        {/* Book Button */}
        <TouchableOpacity
          style={[styles.bookButton, (loading || !!activeRide) && styles.bookButtonDisabled]}
          onPress={handleBookPickup}
          disabled={loading || !!activeRide}
          activeOpacity={0.85}
          accessibilityLabel={`${scheduleMode === 'schedule' ? 'Schedule' : 'Book'} pickup service${estimatedFare > 0 ? `, estimated fare ${estimatedFare.toFixed(0)} pesos` : ''}`}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <View style={styles.bookButtonContent}>
              <View>
                <Text style={styles.bookButtonText}>
                  {scheduleMode === 'schedule' ? 'Schedule Pickup' : 'Book Pickup Service'}
                </Text>
                {estimatedFare > 0 && <Text style={styles.bookButtonFare}>₱{estimatedFare.toFixed(0)}</Text>}
              </View>
              <View style={styles.bookButtonArrow}>
                <Ionicons name={scheduleMode === 'schedule' ? 'calendar' : 'arrow-forward'} size={20} color="#DC2626" />
              </View>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Pickup Map Modal */}
      <Modal visible={showPickupMap} animationType="slide">
        <View style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowPickupMap(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close pickup map" accessibilityRole="button">
              <Ionicons name="close" size={28} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Pickup Location</Text>
            <View style={{ width: moderateScale(28) }} />
          </View>
          <MapPicker title="Where to pick up?" onLocationSelect={handlePickupSelect} initialLocation={pickupLocation.latitude ? pickupLocation : undefined} />
        </View>
      </Modal>

      {/* Dropoff Map Modal */}
      <Modal visible={showDropoffMap} animationType="slide">
        <View style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDropoffMap(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close dropoff map" accessibilityRole="button">
              <Ionicons name="close" size={28} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Dropoff Location</Text>
            <View style={{ width: moderateScale(28) }} />
          </View>
          <MapPicker title="Where to drop off?" onLocationSelect={handleDropoffSelect} initialLocation={dropoffLocation.latitude ? dropoffLocation : pickupLocation.latitude ? pickupLocation : undefined} />
        </View>
      </Modal>

      <ConfirmBookingModal
        visible={showConfirmModal}
        title={scheduleMode === 'schedule' ? 'Confirm Scheduled Pickup' : 'Confirm Pickup'}
        subtitle="Pasundo Ride Service"
        details={confirmBookingDetails}
        fare={estimatedFare}
        discount={promoDiscount > 0 ? promoDiscount : undefined}
        confirmLabel={scheduleMode === 'schedule' ? 'Schedule Ride' : 'Find Rider'}
        accentColor="#DC2626"
        onConfirm={executePasundoBooking}
        onCancel={() => setShowConfirmModal(false)}
      />

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: isIOS ? verticalScale(50) : verticalScale(35), paddingBottom: verticalScale(16), backgroundColor: '#DC2626' },
  backBtn: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20), backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: RESPONSIVE.fontSize.xlarge, fontWeight: 'bold', color: '#ffffff' },
  headerSubtitle: { fontSize: RESPONSIVE.fontSize.small, color: 'rgba(255,255,255,0.85)', marginTop: verticalScale(2) },
  activeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12), padding: moderateScale(14), borderRadius: RESPONSIVE.borderRadius.medium, borderWidth: 1, borderColor: '#FCA5A5' },
  activeBannerDot: { width: moderateScale(12), height: moderateScale(12), borderRadius: moderateScale(6), backgroundColor: '#DC2626' },
  activeBannerTitle: { fontSize: RESPONSIVE.fontSize.medium, fontWeight: '600', color: '#991B1B' },
  activeBannerSub: { fontSize: RESPONSIVE.fontSize.small, color: '#1D4ED8', marginTop: verticalScale(2) },
  section: { paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: verticalScale(12) },
  label: { fontSize: RESPONSIVE.fontSize.medium, fontWeight: '600', color: '#374151', marginBottom: moderateScale(8) },
  typeContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  typeCard: { flex: 1, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(14), marginHorizontal: moderateScale(4), borderWidth: 2, borderColor: '#E5E7EB' },
  typeCardActive: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  typeName: { fontSize: RESPONSIVE.fontSize.small, fontWeight: '600', color: '#6B7280', marginTop: verticalScale(6) },
  typeNameActive: { color: '#DC2626' },
  typeDesc: { fontSize: fontScale(11), color: '#9CA3AF', marginTop: verticalScale(2), textAlign: 'center' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingVertical: moderateScale(12), borderWidth: 1, borderColor: '#E5E7EB' },
  input: { flex: 1, marginLeft: moderateScale(12), fontSize: RESPONSIVE.fontSize.regular, color: '#1F2937' },
  placeholder: { color: '#9CA3AF' },
  vehicleCard: { flex: 1, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(14), borderWidth: 2, borderColor: '#E5E7EB' },
  vehicleCardActive: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  vehicleName: { fontSize: RESPONSIVE.fontSize.small, fontWeight: '600', color: '#6B7280', marginTop: verticalScale(6) },
  vehiclePrice: { fontSize: fontScale(11), color: '#9CA3AF', marginTop: verticalScale(2) },
  textArea: { backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, padding: RESPONSIVE.paddingHorizontal, borderWidth: 1, borderColor: '#E5E7EB', fontSize: RESPONSIVE.fontSize.regular, color: '#1F2937', textAlignVertical: 'top', minHeight: verticalScale(70) },
  priceCard: { backgroundColor: '#ffffff', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12), borderRadius: RESPONSIVE.borderRadius.medium, padding: RESPONSIVE.paddingHorizontal, borderWidth: 1, borderColor: '#E5E7EB' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: moderateScale(8) },
  priceLabel: { fontSize: RESPONSIVE.fontSize.medium, color: '#6B7280' },
  priceValue: { fontSize: RESPONSIVE.fontSize.medium, color: '#1F2937', fontWeight: '600' },
  priceDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: moderateScale(8) },
  priceTotalLabel: { fontSize: RESPONSIVE.fontSize.regular, fontWeight: 'bold', color: '#1F2937' },
  priceTotalValue: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#DC2626' },
  infoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(14), marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12) },
  infoText: { flex: 1, marginLeft: moderateScale(12), fontSize: RESPONSIVE.fontSize.small, color: '#991B1B' },
  etaCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12), borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(14), borderWidth: 1, borderColor: '#FCA5A5' },
  etaIconContainer: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20), backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginRight: moderateScale(12) },
  etaLabel: { fontSize: RESPONSIVE.fontSize.small, color: '#6B7280' },
  etaValue: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#1F2937', marginTop: verticalScale(2) },
  etaDistanceBadge: { backgroundColor: '#FEF2F2', paddingHorizontal: moderateScale(12), paddingVertical: verticalScale(6), borderRadius: RESPONSIVE.borderRadius.small },
  etaDistanceText: { fontSize: RESPONSIVE.fontSize.small, fontWeight: '600', color: '#991B1B' },
  bookButton: { backgroundColor: '#DC2626', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(16), marginBottom: Platform.OS === 'ios' ? verticalScale(32) : verticalScale(40), borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(18), shadowColor: '#DC2626', shadowOffset: { width: 0, height: verticalScale(4) }, shadowOpacity: 0.3, shadowRadius: moderateScale(8), elevation: moderateScale(6) },
  bookButtonDisabled: { opacity: 0.5 },
  bookButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bookButtonText: { color: '#ffffff', fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold' },
  bookButtonFare: { color: 'rgba(255,255,255,0.9)', fontSize: RESPONSIVE.fontSize.small, marginTop: verticalScale(2) },
  bookButtonArrow: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20), backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: isIOS ? verticalScale(50) : verticalScale(35), paddingBottom: verticalScale(12), backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#1F2937' },
  scheduleChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: moderateScale(6), backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(10), borderWidth: 2, borderColor: '#E5E7EB' },
  scheduleChipActive: { borderColor: '#DC2626', backgroundColor: '#DC2626' },
  scheduleChipText: { fontSize: RESPONSIVE.fontSize.small, fontWeight: '600', color: '#6B7280' },
  scheduleChipTextActive: { color: '#ffffff' },
});
