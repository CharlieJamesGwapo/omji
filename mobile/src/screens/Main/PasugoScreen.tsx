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
import { deliveryService, walletService, promoService } from '../../services/api';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isTablet, isIOS } from '../../utils/responsive';
import MapPicker from '../../components/MapPicker';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';
import Toast, { ToastType } from '../../components/Toast';

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
          const res = await deliveryService.getActiveDeliveries();
          const data = res.data?.data;
          if (Array.isArray(data) && data.length > 0) {
            setActiveDelivery(data[0]);
          } else {
            setActiveDelivery(null);
          }
        } catch (e) {
          console.log('Failed to fetch active deliveries:', e);
        }
      })();
    });
    return unsubscribe;
  }, [navigation]);

  const sizeOptions = [
    { id: 'small' as const, label: 'Small', desc: 'Documents, envelope', icon: 'document-text', weight: 1 },
    { id: 'medium' as const, label: 'Medium', desc: 'Box, bag', icon: 'cube', weight: 5 },
    { id: 'large' as const, label: 'Large', desc: 'Large parcel', icon: 'cube-outline', weight: 15 },
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
  const baseFare = 50;
  const perKmRate = 15;
  const baseFareCalc = distance > 0 ? Math.round((baseFare + distance * perKmRate) * 100) / 100 : 0;
  const estimatedFare = Math.max(0, baseFareCalc - promoDiscount);

  // Calculate estimated delivery time
  useEffect(() => {
    if (distance > 0) {
      const avgSpeed = 20; // delivery average km/h
      const minutes = Math.ceil((distance / avgSpeed) * 60) + 5; // +5 for pickup time
      setEstimatedTime(minutes <= 1 ? '~1 min' : `~${minutes} min`);
    } else {
      setEstimatedTime('');
    }
  }, [distance]);

  // Reset promo when fare basis changes (locations changed)
  useEffect(() => {
    if (promoApplied) {
      setPromoCode('');
      setPromoDiscount(0);
      setPromoApplied(false);
    }
  }, [pickupLocation.latitude, pickupLocation.longitude, dropoffLocation.latitude, dropoffLocation.longitude]);

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

  const handleBookDelivery = async () => {
    if (activeDelivery) {
      showToast('You have an active delivery. Tap the banner above to track it.', 'warning');
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

    const weight = sizeOptions.find(s => s.id === itemSize)?.weight || 1;

    Alert.alert(
      'Confirm Delivery',
      `Item: ${itemDescription}\nSize: ${itemSize}\nPickup: ${pickupLocation.address}\nDropoff: ${dropoffLocation.address}\n${recipientName ? `Recipient: ${recipientName}\n` : ''}Distance: ${distance.toFixed(1)} km\nEstimated Fare: ₱${estimatedFare.toFixed(0)}\nPayment: ${paymentMethod.toUpperCase()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Book Now',
          onPress: async () => {
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
              };
              if (promoApplied && promoCode.trim()) {
                deliveryData.promo_code = promoCode.trim();
              }
              const response = itemPhoto
                ? await deliveryService.createDeliveryWithPhoto(deliveryData, itemPhoto)
                : await deliveryService.createDelivery(deliveryData);
              const delivery = response.data?.data || {};
              navigation.navigate('Tracking', {
                type: 'delivery',
                rideId: delivery.id || 0,
                pickup: pickupLocation.address,
                dropoff: dropoffLocation.address,
                fare: delivery.delivery_fee || estimatedFare,
              });
            } catch (error: any) {
              const msg = error.response?.data?.error || 'Failed to book delivery';
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="cube" size={24} color="#ffffff" />
          <Text style={styles.headerTitle}>Pasugo</Text>
          <Text style={styles.headerSubtitle}>Delivery Service</Text>
        </View>
        <View style={{ width: moderateScale(40) }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: verticalScale(40) }}>
        {/* Active Delivery Banner */}
        {!!activeDelivery && (
          <TouchableOpacity
            style={styles.activeBanner}
            onPress={() => navigation.navigate('Tracking', { type: 'delivery', rideId: activeDelivery.id, pickup: activeDelivery.pickup_location, dropoff: activeDelivery.dropoff_location, fare: activeDelivery.delivery_fee })}
          >
            <View style={[styles.activeBannerDot, { backgroundColor: '#10B981' }]} />
            <View style={{ flex: 1, marginLeft: moderateScale(12) }}>
              <Text style={[styles.activeBannerTitle, { color: '#065F46' }]}>Active delivery in progress</Text>
              <Text style={[styles.activeBannerSub, { color: '#047857' }]}>Tap to track • {activeDelivery.status?.replace(/_/g, ' ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#10B981" />
          </TouchableOpacity>
        )}

        {/* Pickup Location */}
        <View style={styles.section}>
          <Text style={styles.label}>Pickup Location *</Text>
          <TouchableOpacity style={styles.inputContainer} onPress={() => setShowPickupMap(true)}>
            <Ionicons name="location-outline" size={20} color="#10B981" />
            {detectingLocation ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: moderateScale(12) }}>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={{ marginLeft: moderateScale(8), color: '#6B7280', fontSize: fontScale(14) }}>Detecting location...</Text>
              </View>
            ) : (
              <Text style={[styles.input, !pickupLocation.address && styles.placeholder]} numberOfLines={1}>
                {pickupLocation.address || 'Select pickup on map'}
              </Text>
            )}
            <Ionicons name="navigate" size={20} color="#10B981" />
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
                style={[styles.sizeCard, itemSize === opt.id && styles.sizeCardActive]}
                onPress={() => setItemSize(opt.id)}
              >
                <Ionicons name={opt.icon as any} size={24} color={itemSize === opt.id ? '#10B981' : '#6B7280'} />
                <Text style={[styles.sizeName, itemSize === opt.id && { color: '#10B981' }]}>{opt.label}</Text>
                <Text style={styles.sizeDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recipient Info */}
        <View style={styles.section}>
          <Text style={styles.label}>Recipient Name</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#10B981" />
            <TextInput style={styles.input} placeholder="Who should receive it?" value={recipientName} onChangeText={setRecipientName} />
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Recipient Phone</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="call-outline" size={20} color="#10B981" />
            <TextInput style={styles.input} placeholder="Recipient's contact number" value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad" />
          </View>
        </View>

        {/* Item Photo */}
        <View style={styles.section}>
          <Text style={styles.label}>Item Photo (Optional)</Text>
          <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
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
          <PaymentMethodSelector selected={paymentMethod} onSelect={setPaymentMethod} accentColor="#10B981" />
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
              <Ionicons name="pricetag-outline" size={20} color="#10B981" />
              <TextInput style={styles.input} placeholder="Enter promo code" value={promoCode} onChangeText={setPromoCode} autoCapitalize="characters" />
              <TouchableOpacity onPress={handleApplyPromo} disabled={applyingPromo || !promoCode.trim()}>
                {applyingPromo ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : (
                  <Text style={{ color: promoCode.trim() ? '#10B981' : '#D1D5DB', fontWeight: '600', fontSize: RESPONSIVE.fontSize.medium }}>Apply</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Price Breakdown */}
        <View style={styles.priceCard}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Base Fare</Text>
            <Text style={styles.priceValue}>₱{baseFare}</Text>
          </View>
          {distance > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Distance ({distance.toFixed(1)} km x ₱{perKmRate})</Text>
              <Text style={styles.priceValue}>₱{(distance * perKmRate).toFixed(0)}</Text>
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
            <Text style={styles.priceTotalValue}>{estimatedFare > 0 ? `₱${estimatedFare.toFixed(0)}` : 'Select locations'}</Text>
          </View>
        </View>

        {/* ETA Display */}
        {!!estimatedTime && (
          <View style={styles.etaCard}>
            <View style={styles.etaIconContainer}>
              <Ionicons name="time" size={20} color="#10B981" />
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
          style={[styles.bookButton, (loading || !!activeDelivery) && { opacity: 0.7 }]}
          onPress={handleBookDelivery}
          disabled={loading || !!activeDelivery}
          activeOpacity={0.85}
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
                <Ionicons name="arrow-forward" size={20} color="#10B981" />
              </View>
            </View>
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
            <Text style={styles.modalTitle}>Select Dropoff Location</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: isIOS ? verticalScale(50) : verticalScale(35), paddingBottom: verticalScale(16), backgroundColor: '#10B981' },
  backBtn: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20), backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: RESPONSIVE.fontSize.xlarge, fontWeight: 'bold', color: '#ffffff' },
  headerSubtitle: { fontSize: RESPONSIVE.fontSize.small, color: 'rgba(255,255,255,0.85)', marginTop: verticalScale(2) },
  activeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12), padding: moderateScale(14), borderRadius: RESPONSIVE.borderRadius.medium, borderWidth: 1, borderColor: '#A7F3D0' },
  activeBannerDot: { width: moderateScale(12), height: moderateScale(12), borderRadius: moderateScale(6), backgroundColor: '#10B981' },
  activeBannerTitle: { fontSize: RESPONSIVE.fontSize.medium, fontWeight: '600' },
  activeBannerSub: { fontSize: RESPONSIVE.fontSize.small, marginTop: verticalScale(2) },
  section: { paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: verticalScale(14) },
  label: { fontSize: RESPONSIVE.fontSize.medium, fontWeight: '600', color: '#374151', marginBottom: verticalScale(6) },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingVertical: moderateScale(12), borderWidth: 1, borderColor: '#E5E7EB' },
  input: { flex: 1, marginLeft: moderateScale(12), fontSize: RESPONSIVE.fontSize.regular, color: '#1F2937' },
  placeholder: { color: '#9CA3AF' },
  textArea: { backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, padding: RESPONSIVE.paddingHorizontal, borderWidth: 1, borderColor: '#E5E7EB', fontSize: RESPONSIVE.fontSize.regular, color: '#1F2937', textAlignVertical: 'top', minHeight: verticalScale(70) },
  sizeCard: { flex: 1, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: RESPONSIVE.borderRadius.medium, paddingVertical: moderateScale(14), paddingHorizontal: moderateScale(8), borderWidth: 2, borderColor: '#E5E7EB' },
  sizeCardActive: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  sizeName: { fontSize: RESPONSIVE.fontSize.small, fontWeight: '600', color: '#374151', marginTop: verticalScale(6) },
  sizeDesc: { fontSize: fontScale(11), color: '#9CA3AF', marginTop: verticalScale(2), textAlign: 'center' },
  photoButton: { borderRadius: RESPONSIVE.borderRadius.medium, overflow: 'hidden', borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed' },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', padding: moderateScale(32), backgroundColor: '#F9FAFB' },
  photoText: { marginTop: verticalScale(8), fontSize: RESPONSIVE.fontSize.medium, color: '#6B7280' },
  photoPreview: { width: '100%', height: verticalScale(160), resizeMode: 'cover' },
  priceCard: { backgroundColor: '#ffffff', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(14), borderRadius: RESPONSIVE.borderRadius.medium, padding: RESPONSIVE.paddingHorizontal, borderWidth: 1, borderColor: '#E5E7EB' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: verticalScale(6) },
  priceLabel: { fontSize: RESPONSIVE.fontSize.medium, color: '#6B7280' },
  priceValue: { fontSize: RESPONSIVE.fontSize.medium, color: '#1F2937', fontWeight: '600' },
  priceDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: verticalScale(6) },
  priceTotalLabel: { fontSize: RESPONSIVE.fontSize.regular, fontWeight: 'bold', color: '#1F2937' },
  priceTotalValue: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#10B981' },
  etaCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(12), borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(14), borderWidth: 1, borderColor: '#A7F3D0' },
  etaIconContainer: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20), backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginRight: moderateScale(12) },
  etaLabel: { fontSize: RESPONSIVE.fontSize.small, color: '#6B7280' },
  etaValue: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#1F2937', marginTop: verticalScale(2) },
  etaDistanceBadge: { backgroundColor: '#ECFDF5', paddingHorizontal: moderateScale(12), paddingVertical: verticalScale(6), borderRadius: RESPONSIVE.borderRadius.small },
  etaDistanceText: { fontSize: RESPONSIVE.fontSize.small, fontWeight: '600', color: '#065F46' },
  bookButton: { backgroundColor: '#10B981', marginHorizontal: RESPONSIVE.marginHorizontal, marginTop: verticalScale(16), marginBottom: verticalScale(8), borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(18), shadowColor: '#10B981', shadowOffset: { width: 0, height: verticalScale(4) }, shadowOpacity: 0.3, shadowRadius: moderateScale(8), elevation: moderateScale(6) },
  bookButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bookButtonText: { color: '#ffffff', fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold' },
  bookButtonFare: { color: 'rgba(255,255,255,0.9)', fontSize: RESPONSIVE.fontSize.small, marginTop: verticalScale(2) },
  bookButtonArrow: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20), backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: isIOS ? verticalScale(50) : verticalScale(35), paddingBottom: verticalScale(12), backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: RESPONSIVE.fontSize.large, fontWeight: 'bold', color: '#1F2937' },
});
