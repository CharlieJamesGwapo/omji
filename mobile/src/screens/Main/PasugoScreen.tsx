import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { deliveryService, walletService, promoService, ratesService } from '../../services/api';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isTablet, isIOS } from '../../utils/responsive';
import MapPicker from '../../components/MapPicker';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';
import Toast, { ToastType } from '../../components/Toast';
import ConfirmBookingModal from '../../components/ConfirmBookingModal';
import type { BookingDetail } from '../../components/ConfirmBookingModal';
import { useRoadDistance } from '../../hooks/useDistance';

export default function PasugoScreen({ navigation }: any) {
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
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
        let loc = await Promise.race([locationPromise, timeoutPromise]);
        if (!loc) {
          // Fallback to last known position
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

  const [itemDescription, setItemDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [itemPhoto, setItemPhoto] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [itemSize, setItemSize] = useState<'small' | 'medium' | 'large'>('small');
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const [estimatedTime, setEstimatedTime] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoApplied, setPromoApplied] = useState(false);
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [baseFare, setBaseFare] = useState(50);
  const [perKmRate, setPerKmRate] = useState(15);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));
  const lastFetchRef = useRef<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await ratesService.getRates();
        const rates = res.data?.data;
        if (Array.isArray(rates) && rates.length > 0) {
          const deliveryRate = rates.find((r: any) => r.service_type === 'delivery' && r.is_active);
          if (deliveryRate) {
            setBaseFare(deliveryRate.base_fare || 50);
            setPerKmRate(deliveryRate.rate_per_km || 15);
          }
        }
      } catch (e) {
        // Keep fallback rates
      }
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const now = Date.now();
      if (now - lastFetchRef.current < 3000) return;
      lastFetchRef.current = now;
      (async () => {
        try {
          const res = await deliveryService.getActiveDeliveries();
          const data = res.data?.data;
          if (Array.isArray(data) && data.length > 0) {
            setActiveDelivery(data[0]);
          } else {
            setActiveDelivery(null);
          }
        } catch (e) {
          // Silently ignore - will retry on next focus
        }
      })();
    });
    return unsubscribe;
  }, [navigation]);

  const sizeOptions = [
    { id: 'small' as const, label: 'Small', desc: 'Documents, envelope', icon: 'document-text', weight: 1, surcharge: 0 },
    { id: 'medium' as const, label: 'Medium', desc: 'Box, bag', icon: 'cube', weight: 5, surcharge: 20 },
    { id: 'large' as const, label: 'Large', desc: 'Large parcel', icon: 'cube-outline', weight: 15, surcharge: 50 },
  ];

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setItemPhoto(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Error', 'Could not open photo library. Please check permissions.');
    }
  };

  const handlePickupSelect = (location: any) => {
    setPickupLocation(location);
    setShowPickupMap(false);
  };

  const handleDropoffSelect = (location: any) => {
    setDropoffLocation(location);
    setShowDropoffMap(false);
  };

  const { distance, duration: roadDuration, isRoad } = useRoadDistance(pickupLocation, dropoffLocation);
  const sizeSurcharge = sizeOptions.find(s => s.id === itemSize)?.surcharge ?? 0;
  const baseFareCalc = distance > 0 ? Math.round((baseFare + distance * perKmRate + sizeSurcharge) * 100) / 100 : 0;
  const estimatedFare = Math.max(0, baseFareCalc - promoDiscount);

  // Calculate estimated delivery time from road duration
  useEffect(() => {
    if (distance > 0 && roadDuration > 0) {
      const minutes = roadDuration + 5; // +5 for pickup time
      setEstimatedTime(minutes <= 1 ? '~1 min' : `~${minutes} min`);
    } else {
      setEstimatedTime('');
    }
  }, [distance, roadDuration]);

  // Reset promo when fare basis changes (locations changed)
  useEffect(() => {
    if (promoApplied) {
      setPromoCode('');
      setPromoDiscount(0);
      setPromoApplied(false);
    }
  }, [pickupLocation.latitude, pickupLocation.longitude, dropoffLocation.latitude, dropoffLocation.longitude, itemSize]);

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    if (baseFareCalc <= 0) {
      showToast('Select locations first to apply promo.', 'warning');
      return;
    }
    setApplyingPromo(true);
    try {
      const res = await promoService.applyPromo(promoCode.trim(), baseFareCalc, 'deliveries');
      const discount = res.data?.data?.discount || 0;
      if (discount > 0) {
        setPromoDiscount(discount);
        setPromoApplied(true);
        showToast(`Promo applied! ₱${discount.toFixed(0)} off`, 'success');
      } else {
        showToast('Promo code is not valid for this delivery.', 'warning');
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

  const handleCancelActiveDelivery = async () => {
    if (!activeDelivery) return;
    try {
      await deliveryService.cancelDelivery(activeDelivery.id);
      setActiveDelivery(null);
      showToast('Previous delivery cancelled. You can now book a new one.', 'success');
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to cancel delivery';
      showToast(msg, 'error');
    }
  };

  const handleBookDelivery = async () => {
    if (activeDelivery) {
      Alert.alert(
        'Active Delivery Found',
        `You have a ${activeDelivery.status?.replace(/_/g, ' ')} delivery.\nWhat would you like to do?`,
        [
          { text: 'Close', style: 'cancel' },
          {
            text: 'Track Delivery',
            onPress: () => navigation.navigate('Tracking', { type: 'delivery', rideId: activeDelivery.id, pickup: activeDelivery.pickup_location, dropoff: activeDelivery.dropoff_location, fare: activeDelivery.delivery_fee }),
          },
          ...(activeDelivery.status === 'pending' ? [{
            text: 'Cancel & Rebook',
            style: 'destructive' as const,
            onPress: handleCancelActiveDelivery,
          }] : []),
        ]
      );
      return;
    }

    if (!pickupLocation.latitude || !dropoffLocation.latitude) {
      showToast('Please select both pickup and dropoff locations.', 'warning');
      return;
    }

    if (pickupLocation.latitude === dropoffLocation.latitude && pickupLocation.longitude === dropoffLocation.longitude) {
      showToast('Pickup and dropoff locations cannot be the same.', 'warning');
      return;
    }

    if (!itemDescription.trim()) {
      showToast('Please describe what you are sending.', 'warning');
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
    { icon: 'cube-outline', label: 'Item', value: `${itemDescription} (${itemSize})${sizeSurcharge > 0 ? ` +₱${sizeSurcharge}` : ''}` },
    { icon: 'location-outline', label: 'Pickup', value: pickupLocation.address, color: '#3B82F6' },
    { icon: 'flag-outline', label: 'Dropoff', value: dropoffLocation.address, color: '#EF4444' },
    ...(recipientName ? [{ icon: 'person-outline', label: 'Recipient', value: `${recipientName}${recipientPhone ? ` (${recipientPhone})` : ''}` }] as BookingDetail[] : []),
    { icon: 'navigate-outline', label: 'Distance', value: `${distance.toFixed(1)} km` },
    { icon: 'time-outline', label: 'Est. Time', value: estimatedTime || '...' },
    { icon: 'card-outline', label: 'Payment', value: paymentMethod === 'gcash' ? 'GCash' : paymentMethod === 'maya' ? 'Maya' : paymentMethod === 'wallet' ? 'Wallet' : 'Cash' },
  ];

  const executeBooking = async () => {
    const weight = sizeOptions.find(s => s.id === itemSize)?.weight || 1;
    setLoading(true);
    try {
      let pickupLabel = pickupLocation.address;
      if (notes.trim()) {
        pickupLabel += ` (${notes.trim()})`;
      }
      let dropoffLabel = dropoffLocation.address;
      if (recipientName.trim()) {
        dropoffLabel += ` [To: ${recipientName.trim()}`;
        if (recipientPhone.trim()) dropoffLabel += `, ${recipientPhone.trim()}`;
        dropoffLabel += ']';
      }
      const deliveryData: any = {
        pickup_location: pickupLabel,
        pickup_latitude: pickupLocation.latitude,
        pickup_longitude: pickupLocation.longitude,
        dropoff_location: dropoffLabel,
        dropoff_latitude: dropoffLocation.latitude,
        dropoff_longitude: dropoffLocation.longitude,
        item_description: `[${itemSize.toUpperCase()}] ${itemDescription}`,
        notes: notes,
        weight: weight,
        payment_method: paymentMethod,
        distance: distance,
      };
      if (promoApplied && promoCode.trim()) {
        deliveryData.promo_code = promoCode.trim();
      }
      const response = itemPhoto
        ? await deliveryService.createDeliveryWithPhoto(deliveryData, itemPhoto)
        : await deliveryService.createDelivery(deliveryData);
      const delivery = response.data?.data || {};
      const deliveryIdNum = Number(delivery.id);
      setShowConfirmModal(false);
      if (!deliveryIdNum || deliveryIdNum <= 0) {
        setLoading(false);
        Alert.alert('Booking Error', 'Delivery was created but we could not get the booking ID. Please check your active deliveries.');
        return;
      }
      if (paymentMethod === 'gcash' || paymentMethod === 'maya') {
        navigation.navigate('Payment', {
          type: paymentMethod,
          amount: delivery.delivery_fee || estimatedFare,
          serviceType: 'delivery',
          rideId: deliveryIdNum,
          pickup: pickupLocation.address,
          dropoff: dropoffLocation.address,
        });
      } else {
        navigation.navigate('Tracking', {
          type: 'delivery',
          rideId: deliveryIdNum,
          pickup: pickupLocation.address,
          dropoff: dropoffLocation.address,
          fare: delivery.delivery_fee || estimatedFare,
        });
      }
    } catch (error: any) {
      setShowConfirmModal(false);
      const msg = error.response?.data?.error || (error.code === 'ECONNABORTED' ? 'Request timed out. The server may be starting up — please try again.' : 'Failed to book delivery. Please check your connection and try again.');
      Alert.alert('Booking Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
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
          <Ionicons name="cube" size={24} color="#ffffff" />
          <Text style={styles.headerTitle}>Pasugo</Text>
          <Text style={styles.headerSubtitle}>Delivery Service</Text>
        </View>
        <View style={{ width: moderateScale(40) }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? verticalScale(20) : verticalScale(28) }}>
        {/* Active Delivery Banner */}
        {!!activeDelivery && (
          <TouchableOpacity
            style={styles.activeBanner}
            onPress={() => navigation.navigate('Tracking', { type: 'delivery', rideId: activeDelivery.id, pickup: activeDelivery.pickup_location, dropoff: activeDelivery.dropoff_location, fare: activeDelivery.delivery_fee })}
            accessibilityLabel="Active delivery in progress, tap to track"
            accessibilityRole="button"
          >
            <View style={[styles.activeBannerDot, { backgroundColor: '#DC2626' }]} />
            <View style={{ flex: 1, marginLeft: moderateScale(12) }}>
              <Text style={[styles.activeBannerTitle, { color: '#991B1B' }]}>Active delivery in progress</Text>
              <Text style={[styles.activeBannerSub, { color: '#047857' }]}>Tap to track • {activeDelivery.status?.replace(/_/g, ' ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#DC2626" />
          </TouchableOpacity>
        )}

        {/* Pickup Location */}
        <View style={styles.section}>
          <Text style={styles.label}>Pickup Location *</Text>
          <TouchableOpacity style={styles.inputContainer} onPress={() => setShowPickupMap(true)} accessibilityLabel={pickupLocation.address ? `Pickup location: ${pickupLocation.address}` : 'Select pickup location'} accessibilityRole="button">
            <Ionicons name="location-outline" size={20} color="#DC2626" />
            {detectingLocation ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: moderateScale(12) }}>
                <ActivityIndicator size="small" color="#DC2626" />
                <Text style={{ marginLeft: moderateScale(8), color: '#6B7280', fontSize: fontScale(14) }}>Detecting location...</Text>
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

        {/* Item Description */}
        <View style={styles.section}>
          <Text style={styles.label}>Item Description *</Text>
          <TextInput
            style={styles.textArea}
            placeholder="What are you sending? (e.g., Box of documents)"
            value={itemDescription}
            onChangeText={setItemDescription}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Item Size */}
        <View style={styles.section}>
          <Text style={styles.label}>Package Size</Text>
          <View style={{ flexDirection: 'row', gap: moderateScale(8) }}>
            {sizeOptions.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.sizeCard, itemSize === opt.id && styles.sizeCardActive, { minHeight: moderateScale(44) }]}
                onPress={() => setItemSize(opt.id)}
                accessibilityLabel={`${opt.label} package size: ${opt.desc}${itemSize === opt.id ? ', selected' : ''}`}
                accessibilityRole="button"
              >
                <Ionicons name={opt.icon as any} size={24} color={itemSize === opt.id ? '#DC2626' : '#6B7280'} />
                <Text style={[styles.sizeName, itemSize === opt.id && { color: '#DC2626' }]}>{opt.label}</Text>
                <Text style={styles.sizeDesc}>{opt.desc}</Text>
                <Text style={[styles.sizeSurcharge, itemSize === opt.id && { color: '#DC2626' }]}>
                  {opt.surcharge > 0 ? `+₱${opt.surcharge}` : 'Free'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recipient Info */}
        <View style={styles.section}>
          <Text style={styles.label}>Recipient Name</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#DC2626" />
            <TextInput style={styles.input} placeholder="Who should receive it?" value={recipientName} onChangeText={setRecipientName} />
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Recipient Phone</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="call-outline" size={20} color="#DC2626" />
            <TextInput style={styles.input} placeholder="Recipient's contact number" value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad" />
          </View>
        </View>

        {/* Item Photo */}
        <View style={styles.section}>
          <Text style={styles.label}>Item Photo (Optional)</Text>
          <TouchableOpacity style={styles.photoButton} onPress={pickImage} accessibilityLabel={itemPhoto ? 'Change item photo' : 'Upload item photo'} accessibilityRole="button">
            {itemPhoto ? (
              <Image source={{ uri: itemPhoto }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera-outline" size={32} color="#9CA3AF" />
                <Text style={styles.photoText}>Upload Photo</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Notes for Rider</Text>
          <TextInput
            style={[styles.textArea, { minHeight: verticalScale(60) }]}
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
          <PaymentMethodSelector selected={paymentMethod} onSelect={setPaymentMethod} accentColor="#DC2626" />
        </View>

        {/* Promo Code */}
        <View style={styles.section}>
          <Text style={styles.label}>Promo Code</Text>
          {promoApplied ? (
            <View style={[styles.inputContainer, { borderColor: '#DC2626', backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="pricetag" size={20} color="#DC2626" />
              <Text style={[styles.input, { color: '#991B1B', fontWeight: '600' }]}>{promoCode} (-₱{promoDiscount.toFixed(0)})</Text>
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
          <Text style={styles.priceCardTitle}>Fare Estimate</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Base Fare</Text>
            <Text style={styles.priceValue}>₱{baseFare}</Text>
          </View>
          {distance > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Distance ({distance.toFixed(1)} km x ₱{perKmRate}/km)</Text>
              <Text style={styles.priceValue}>₱{(distance * perKmRate).toFixed(0)}</Text>
            </View>
          )}
          {sizeSurcharge > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Size Surcharge ({itemSize})</Text>
              <Text style={styles.priceValue}>+₱{sizeSurcharge}</Text>
            </View>
          )}
          {promoDiscount > 0 && (
            <View style={styles.priceRow}>
              <Text style={[styles.priceLabel, { color: '#16A34A' }]}>Promo Discount</Text>
              <Text style={[styles.priceValue, { color: '#16A34A' }]}>-₱{promoDiscount.toFixed(0)}</Text>
            </View>
          )}
          <View style={styles.priceDivider} />
          <View style={[styles.priceRow, { marginBottom: 0 }]}>
            <Text style={styles.priceTotalLabel}>Total</Text>
            <Text style={styles.priceTotalValue}>{estimatedFare > 0 ? `₱${estimatedFare.toFixed(0)}` : 'Select locations'}</Text>
          </View>
        </View>

        {/* ETA Display */}
        {!!estimatedTime && (
          <View style={styles.etaCard}>
            <View style={styles.etaIconContainer}>
              <Ionicons name="time" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.etaLabel}>Estimated Delivery Time</Text>
              <Text style={styles.etaValue}>{estimatedTime}</Text>
            </View>
            <View style={styles.etaDistanceBadge}>
              <Text style={styles.etaDistanceText}>{distance.toFixed(1)} km</Text>
            </View>
          </View>
        )}

        {/* Book Button */}
        <TouchableOpacity
          style={[styles.bookButton, (loading || !!activeDelivery) && { opacity: 0.5 }]}
          onPress={handleBookDelivery}
          disabled={loading || !!activeDelivery}
          activeOpacity={0.85}
          accessibilityLabel={`Book delivery${estimatedFare > 0 ? `, estimated fare ${estimatedFare.toFixed(0)} pesos` : ''}`}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <View style={styles.bookButtonContent}>
              <View>
                <Text style={styles.bookButtonText}>Book Delivery</Text>
                {estimatedFare > 0 && <Text style={styles.bookButtonFare}>₱{estimatedFare.toFixed(0)}</Text>}
              </View>
              <View style={styles.bookButtonArrow}>
                <Ionicons name="arrow-forward" size={20} color="#DC2626" />
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
          <MapPicker title="Select Pickup Location" onLocationSelect={handlePickupSelect} initialLocation={pickupLocation.latitude ? pickupLocation : undefined} />
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
          <MapPicker title="Select Dropoff Location" onLocationSelect={handleDropoffSelect} initialLocation={dropoffLocation.latitude ? dropoffLocation : pickupLocation.latitude ? pickupLocation : undefined} />
        </View>
      </Modal>

      <ConfirmBookingModal
        visible={showConfirmModal}
        title="Confirm Delivery"
        subtitle="Pasugo Delivery Service"
        details={confirmBookingDetails}
        fare={estimatedFare}
        discount={promoDiscount > 0 ? promoDiscount : undefined}
        confirmLabel="Book Delivery"
        accentColor="#DC2626"
        loading={loading}
        onConfirm={executeBooking}
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
  activeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12), padding: moderateScale(14), borderRadius: RESPONSIVE.borderRadius.medium, borderWidth: 1, borderColor: '#FCA5A5' },
  activeBannerDot: { width: moderateScale(12), height: moderateScale(12), borderRadius: moderateScale(6), backgroundColor: '#DC2626' },
  activeBannerTitle: { fontSize: RESPONSIVE.fontSize.medium, fontWeight: '600' },
  activeBannerSub: { fontSize: RESPONSIVE.fontSize.small, marginTop: verticalScale(2) },
  section: { paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: verticalScale(14) },
  label: { fontSize: RESPONSIVE.fontSize.medium, fontWeight: '600', color: '#374151', marginBottom: verticalScale(6) },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingVertical: moderateScale(12), borderWidth: 1, borderColor: '#E5E7EB' },
  input: { flex: 1, marginLeft: moderateScale(12), fontSize: RESPONSIVE.fontSize.regular, color: '#1F2937' },
  placeholder: { color: '#9CA3AF' },
  textArea: { backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, padding: RESPONSIVE.paddingHorizontal, borderWidth: 1, borderColor: '#E5E7EB', fontSize: RESPONSIVE.fontSize.regular, color: '#1F2937', textAlignVertical: 'top', minHeight: verticalScale(70) },
  sizeCard: { flex: 1, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, paddingVertical: moderateScale(14), paddingHorizontal: moderateScale(8), borderWidth: 2, borderColor: '#E5E7EB' },
  sizeCardActive: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  sizeName: { fontSize: RESPONSIVE.fontSize.small, fontWeight: '600', color: '#374151', marginTop: verticalScale(6) },
  sizeDesc: { fontSize: fontScale(11), color: '#9CA3AF', marginTop: verticalScale(2), textAlign: 'center' },
  sizeSurcharge: { fontSize: fontScale(10), color: '#6B7280', marginTop: verticalScale(2), fontWeight: '500' },
  photoButton: { borderRadius: RESPONSIVE.borderRadius.medium, overflow: 'hidden', borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed' },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', padding: moderateScale(32), backgroundColor: '#F9FAFB' },
  photoText: { marginTop: verticalScale(8), fontSize: RESPONSIVE.fontSize.medium, color: '#6B7280' },
  photoPreview: { width: '100%', height: verticalScale(160), resizeMode: 'cover' },
  priceCard: { backgroundColor: '#ffffff', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(14), borderRadius: moderateScale(14), padding: moderateScale(16), borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  priceCardTitle: { fontSize: RESPONSIVE.fontSize.medium, fontWeight: '700', color: '#374151', marginBottom: verticalScale(10) },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: verticalScale(6) },
  priceLabel: { fontSize: RESPONSIVE.fontSize.medium, color: '#6B7280' },
  priceValue: { fontSize: RESPONSIVE.fontSize.medium, color: '#1F2937', fontWeight: '600' },
  priceDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: verticalScale(6) },
  priceTotalLabel: { fontSize: RESPONSIVE.fontSize.regular, fontWeight: 'bold', color: '#1F2937' },
  priceTotalValue: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#DC2626' },
  etaCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12), borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(14), borderWidth: 1, borderColor: '#FCA5A5' },
  etaIconContainer: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20), backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginRight: moderateScale(12) },
  etaLabel: { fontSize: RESPONSIVE.fontSize.small, color: '#6B7280' },
  etaValue: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#1F2937', marginTop: verticalScale(2) },
  etaDistanceBadge: { backgroundColor: '#FEF2F2', paddingHorizontal: moderateScale(12), paddingVertical: verticalScale(6), borderRadius: RESPONSIVE.borderRadius.small },
  etaDistanceText: { fontSize: RESPONSIVE.fontSize.small, fontWeight: '600', color: '#991B1B' },
  bookButton: { backgroundColor: '#DC2626', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(16), marginBottom: Platform.OS === 'ios' ? verticalScale(32) : verticalScale(40), borderRadius: moderateScale(14), padding: moderateScale(18), shadowColor: '#DC2626', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  bookButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bookButtonText: { color: '#ffffff', fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold' },
  bookButtonFare: { color: 'rgba(255,255,255,0.9)', fontSize: RESPONSIVE.fontSize.small, marginTop: verticalScale(2) },
  bookButtonArrow: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20), backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: isIOS ? verticalScale(50) : verticalScale(35), paddingBottom: verticalScale(12), backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#1F2937' },
});
