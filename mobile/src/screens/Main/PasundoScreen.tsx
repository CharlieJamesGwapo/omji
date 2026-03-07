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
import { rideService, walletService, promoService } from '../../services/api';
import MapPicker from '../../components/MapPicker';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';
import Toast, { ToastType } from '../../components/Toast';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isTablet, isIOS } from '../../utils/responsive';

export default function PasundoScreen({ navigation }: any) {
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

  const [pickupType, setPickupType] = useState('person');
  const [personName, setPersonName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [vehicleType, setVehicleType] = useState('motorcycle');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [activeRide, setActiveRide] = useState<any>(null);
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

  const pickupTypes = [
    { id: 'person', name: 'Person', icon: 'person', desc: 'School, Market, etc.' },
    { id: 'parcel', name: 'Parcel', icon: 'cube', desc: 'Pick up package' },
    { id: 'document', name: 'Document', icon: 'document', desc: 'Important papers' },
  ];

  const vehicleTypes = [
    { id: 'motorcycle', name: 'Motorcycle', icon: 'bicycle', base: 40, rate: 10 },
    { id: 'car', name: 'Car', icon: 'car', base: 60, rate: 15 },
  ];

  const selectedVehicle = vehicleTypes.find(v => v.id === vehicleType) || vehicleTypes[0];

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
  const baseFareCalc = distance > 0
    ? Math.round((selectedVehicle.base + distance * selectedVehicle.rate) * 100) / 100
    : 0;
  const estimatedFare = Math.max(0, baseFareCalc - promoDiscount);

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

  const handleBookPickup = async () => {
    if (activeRide) {
      showToast('You have an active ride. Tap the banner above to track it.', 'warning');
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

    const pickupLabel = buildPickupLabel();

    Alert.alert(
      'Confirm Pickup',
      `${pickupType === 'person' ? `Person: ${personName}\n` : `Type: ${pickupType}\n`}Vehicle: ${selectedVehicle.name}\nPickup: ${pickupLocation.address}\nDropoff: ${dropoffLocation.address}\nDistance: ${distance.toFixed(1)} km\nEstimated Fare: ₱${estimatedFare.toFixed(0)}\nPayment: ${paymentMethod.toUpperCase()}`,
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
                vehicle_type: vehicleType,
                payment_method: paymentMethod,
                estimated_fare: estimatedFare,
                ...(promoApplied && promoCode.trim() ? { promo_code: promoCode.trim() } : {}),
              });
              const ride = response.data?.data || {};
              navigation.navigate('Tracking', {
                type: 'ride',
                rideId: ride.id || 0,
                pickup: pickupLocation.address,
                dropoff: dropoffLocation.address,
                fare: ride.estimated_fare || estimatedFare,
              });
            } catch (error: any) {
              const msg = error.response?.data?.error || 'Failed to book ride';
              showToast(msg, 'error');
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
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="people" size={28} color="#F59E0B" />
          <Text style={styles.headerTitle}>Pasundo Service</Text>
        </View>
        <View style={{ width: moderateScale(40) }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: verticalScale(32) }}>
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
            <Ionicons name="chevron-forward" size={20} color="#F59E0B" />
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
              >
                <Ionicons name={type.icon as any} size={28} color={pickupType === type.id ? '#F59E0B' : '#6B7280'} />
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
                <Ionicons name="person-outline" size={20} color="#F59E0B" />
                <TextInput style={styles.input} placeholder="Enter name" value={personName} onChangeText={setPersonName} />
              </View>
            </View>
            <View style={styles.section}>
              <Text style={styles.label}>Contact Number</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={20} color="#F59E0B" />
                <TextInput style={styles.input} placeholder="Enter contact number" value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" />
              </View>
            </View>
          </>
        )}

        {/* Pickup Location */}
        <View style={styles.section}>
          <Text style={styles.label}>Pickup Location *</Text>
          <TouchableOpacity style={styles.inputContainer} onPress={() => setShowPickupMap(true)}>
            <Ionicons name="location-outline" size={20} color="#F59E0B" />
            {detectingLocation ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: moderateScale(12) }}>
                <ActivityIndicator size="small" color="#F59E0B" />
                <Text style={{ marginLeft: moderateScale(8), color: '#6B7280', fontSize: RESPONSIVE.fontSize.medium }}>Detecting location...</Text>
              </View>
            ) : (
              <Text style={[styles.input, !pickupLocation.address && styles.placeholder]} numberOfLines={1}>
                {pickupLocation.address || 'Select pickup on map'}
              </Text>
            )}
            <Ionicons name="navigate" size={20} color="#F59E0B" />
          </TouchableOpacity>
        </View>

        {/* Dropoff Location */}
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

        {/* Vehicle Type */}
        <View style={styles.section}>
          <Text style={styles.label}>Vehicle Type</Text>
          <View style={{ flexDirection: 'row', gap: moderateScale(12) }}>
            {vehicleTypes.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.vehicleCard, vehicleType === v.id && styles.vehicleCardActive]}
                onPress={() => setVehicleType(v.id)}
              >
                <Ionicons name={v.icon as any} size={28} color={vehicleType === v.id ? '#F59E0B' : '#6B7280'} />
                <Text style={[styles.vehicleName, vehicleType === v.id && { color: '#F59E0B' }]}>{v.name}</Text>
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
          <PaymentMethodSelector selected={paymentMethod} onSelect={setPaymentMethod} accentColor="#F59E0B" />
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
              <Ionicons name="pricetag-outline" size={20} color="#F59E0B" />
              <TextInput style={styles.input} placeholder="Enter promo code" value={promoCode} onChangeText={setPromoCode} autoCapitalize="characters" />
              <TouchableOpacity onPress={handleApplyPromo} disabled={applyingPromo || !promoCode.trim()}>
                {applyingPromo ? (
                  <ActivityIndicator size="small" color="#F59E0B" />
                ) : (
                  <Text style={{ color: promoCode.trim() ? '#F59E0B' : '#D1D5DB', fontWeight: '600', fontSize: RESPONSIVE.fontSize.medium }}>Apply</Text>
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

        {/* Info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#F59E0B" />
          <Text style={styles.infoText}>Rider will contact the person before arrival</Text>
        </View>

        {/* Book Button */}
        <TouchableOpacity
          style={[styles.bookButton, (loading || !!activeRide) && styles.bookButtonDisabled]}
          onPress={handleBookPickup}
          disabled={loading || !!activeRide}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Text style={styles.bookButtonText}>Book Pickup Service</Text>
              <Ionicons name="arrow-forward" size={20} color="#ffffff" />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Pickup Map Modal */}
      <Modal visible={showPickupMap} animationType="slide">
        <View style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowPickupMap(false)}>
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
            <TouchableOpacity onPress={() => setShowDropoffMap(false)}>
              <Ionicons name="close" size={28} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Dropoff Location</Text>
            <View style={{ width: moderateScale(28) }} />
          </View>
          <MapPicker title="Where to drop off?" onLocationSelect={handleDropoffSelect} initialLocation={dropoffLocation.latitude ? dropoffLocation : pickupLocation.latitude ? pickupLocation : undefined} />
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: isIOS ? verticalScale(50) : verticalScale(35), paddingBottom: verticalScale(12), backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20), backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: moderateScale(8) },
  headerTitle: { fontSize: RESPONSIVE.fontSize.xlarge, fontWeight: 'bold', color: '#1F2937' },
  activeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12), padding: moderateScale(14), borderRadius: RESPONSIVE.borderRadius.medium, borderWidth: 1, borderColor: '#FDE68A' },
  activeBannerDot: { width: moderateScale(12), height: moderateScale(12), borderRadius: moderateScale(6), backgroundColor: '#F59E0B' },
  activeBannerTitle: { fontSize: RESPONSIVE.fontSize.medium, fontWeight: '600', color: '#92400E' },
  activeBannerSub: { fontSize: RESPONSIVE.fontSize.small, color: '#B45309', marginTop: verticalScale(2) },
  section: { paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: verticalScale(12) },
  label: { fontSize: RESPONSIVE.fontSize.medium, fontWeight: '600', color: '#374151', marginBottom: moderateScale(8) },
  typeContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  typeCard: { flex: 1, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(14), marginHorizontal: moderateScale(4), borderWidth: 2, borderColor: '#E5E7EB' },
  typeCardActive: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  typeName: { fontSize: RESPONSIVE.fontSize.small, fontWeight: '600', color: '#6B7280', marginTop: verticalScale(6) },
  typeNameActive: { color: '#F59E0B' },
  typeDesc: { fontSize: fontScale(11), color: '#9CA3AF', marginTop: verticalScale(2), textAlign: 'center' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingVertical: moderateScale(12), borderWidth: 1, borderColor: '#E5E7EB' },
  input: { flex: 1, marginLeft: moderateScale(12), fontSize: RESPONSIVE.fontSize.regular, color: '#1F2937' },
  placeholder: { color: '#9CA3AF' },
  vehicleCard: { flex: 1, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(14), borderWidth: 2, borderColor: '#E5E7EB' },
  vehicleCardActive: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  vehicleName: { fontSize: RESPONSIVE.fontSize.small, fontWeight: '600', color: '#6B7280', marginTop: verticalScale(6) },
  vehiclePrice: { fontSize: fontScale(11), color: '#9CA3AF', marginTop: verticalScale(2) },
  textArea: { backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, padding: RESPONSIVE.paddingHorizontal, borderWidth: 1, borderColor: '#E5E7EB', fontSize: RESPONSIVE.fontSize.regular, color: '#1F2937', textAlignVertical: 'top', minHeight: verticalScale(70) },
  priceCard: { backgroundColor: '#ffffff', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12), borderRadius: RESPONSIVE.borderRadius.medium, padding: RESPONSIVE.paddingHorizontal, borderWidth: 1, borderColor: '#E5E7EB' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: moderateScale(8) },
  priceLabel: { fontSize: RESPONSIVE.fontSize.medium, color: '#6B7280' },
  priceValue: { fontSize: RESPONSIVE.fontSize.medium, color: '#1F2937', fontWeight: '600' },
  priceDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: moderateScale(8) },
  priceTotalLabel: { fontSize: RESPONSIVE.fontSize.regular, fontWeight: 'bold', color: '#1F2937' },
  priceTotalValue: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#F59E0B' },
  infoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(14), marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12) },
  infoText: { flex: 1, marginLeft: moderateScale(12), fontSize: RESPONSIVE.fontSize.small, color: '#92400E' },
  bookButton: { flexDirection: 'row', backgroundColor: '#F59E0B', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(16), borderRadius: RESPONSIVE.borderRadius.medium, padding: RESPONSIVE.paddingHorizontal, alignItems: 'center', justifyContent: 'center' },
  bookButtonDisabled: { opacity: 0.7 },
  bookButtonText: { color: '#ffffff', fontSize: RESPONSIVE.fontSize.regular, fontWeight: 'bold', marginRight: moderateScale(8) },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: isIOS ? verticalScale(50) : verticalScale(35), paddingBottom: verticalScale(12), backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#1F2937' },
});
