import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { deliveryService } from '../../services/api';
import MapPicker from '../../components/MapPicker';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';

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

  const [itemDescription, setItemDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [itemPhoto, setItemPhoto] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [itemSize, setItemSize] = useState<'small' | 'medium' | 'large'>('small');
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      (async () => {
        try {
          const res = await deliveryService.getActiveDeliveries();
          const data = res.data?.data;
          if (Array.isArray(data) && data.length > 0) {
            setActiveDelivery(data[0]);
          } else {
            setActiveDelivery(null);
          }
        } catch {}
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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled) {
      setItemPhoto(result.assets[0].uri);
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
  const estimatedFare = distance > 0 ? Math.round((baseFare + distance * perKmRate) * 100) / 100 : 0;

  const handleBookDelivery = () => {
    if (activeDelivery) {
      Alert.alert('Active Delivery', 'You already have an active delivery. Please complete or cancel it first.', [
        { text: 'Track Delivery', onPress: () => navigation.navigate('Tracking', { type: 'delivery', rideId: activeDelivery.id, pickup: activeDelivery.pickup_location, dropoff: activeDelivery.dropoff_location, fare: activeDelivery.delivery_fee }) },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }

    if (!pickupLocation.latitude || !dropoffLocation.latitude) {
      Alert.alert('Missing Location', 'Please select both pickup and dropoff locations.');
      return;
    }
    if (!itemDescription.trim()) {
      Alert.alert('Missing Info', 'Please describe what you are sending.');
      return;
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
              const response = await deliveryService.createDelivery({
                pickup_location: pickupLabel,
                pickup_latitude: pickupLocation.latitude,
                pickup_longitude: pickupLocation.longitude,
                dropoff_location: dropoffLabel,
                dropoff_latitude: dropoffLocation.latitude,
                dropoff_longitude: dropoffLocation.longitude,
                item_description: `[${itemSize.toUpperCase()}] ${itemDescription}`,
                item_photo: itemPhoto || '',
                notes: notes,
                weight: weight,
                payment_method: paymentMethod,
              });
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
          <Ionicons name="cube" size={28} color="#DC2626" />
          <Text style={styles.headerTitle}>Pasugo Delivery</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Active Delivery Banner */}
        {activeDelivery && (
          <TouchableOpacity
            style={styles.activeBanner}
            onPress={() => navigation.navigate('Tracking', { type: 'delivery', rideId: activeDelivery.id, pickup: activeDelivery.pickup_location, dropoff: activeDelivery.dropoff_location, fare: activeDelivery.delivery_fee })}
          >
            <View style={[styles.activeBannerDot, { backgroundColor: '#DC2626' }]} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.activeBannerTitle, { color: '#991B1B' }]}>Active delivery in progress</Text>
              <Text style={[styles.activeBannerSub, { color: '#B91C1C' }]}>Tap to track • {activeDelivery.status?.replace('_', ' ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#DC2626" />
          </TouchableOpacity>
        )}

        {/* Pickup Location */}
        <View style={styles.section}>
          <Text style={styles.label}>Pickup Location *</Text>
          <TouchableOpacity style={styles.inputContainer} onPress={() => setShowPickupMap(true)}>
            <Ionicons name="location-outline" size={20} color="#DC2626" />
            {detectingLocation ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
                <ActivityIndicator size="small" color="#DC2626" />
                <Text style={{ marginLeft: 8, color: '#6B7280', fontSize: 14 }}>Detecting location...</Text>
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
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {sizeOptions.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.sizeCard, itemSize === opt.id && styles.sizeCardActive]}
                onPress={() => setItemSize(opt.id)}
              >
                <Ionicons name={opt.icon as any} size={24} color={itemSize === opt.id ? '#DC2626' : '#6B7280'} />
                <Text style={[styles.sizeName, itemSize === opt.id && { color: '#DC2626' }]}>{opt.label}</Text>
                <Text style={styles.sizeDesc}>{opt.desc}</Text>
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
          <PaymentMethodSelector selected={paymentMethod} onSelect={setPaymentMethod} accentColor="#DC2626" />
        </View>

        {/* Price Breakdown */}
        {distance > 0 && (
          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Base Fare</Text>
              <Text style={styles.priceValue}>₱{baseFare}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Distance ({distance.toFixed(1)} km x ₱{perKmRate})</Text>
              <Text style={styles.priceValue}>₱{(distance * perKmRate).toFixed(0)}</Text>
            </View>
            <View style={styles.priceDivider} />
            <View style={styles.priceRow}>
              <Text style={styles.priceTotalLabel}>Total</Text>
              <Text style={styles.priceTotalValue}>₱{estimatedFare.toFixed(0)}</Text>
            </View>
          </View>
        )}

        {/* Book Button */}
        <TouchableOpacity
          style={[styles.bookButton, (loading || !!activeDelivery) && { opacity: 0.7 }]}
          onPress={handleBookDelivery}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Text style={styles.bookButtonText}>Book Delivery</Text>
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
            <Text style={styles.modalTitle}>Select Dropoff Location</Text>
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
  activeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', marginHorizontal: 20, marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA' },
  activeBannerDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#DC2626' },
  activeBannerTitle: { fontSize: 14, fontWeight: '600' },
  activeBannerSub: { fontSize: 12, marginTop: 2 },
  section: { paddingHorizontal: 20, paddingTop: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  input: { flex: 1, marginLeft: 12, fontSize: 15, color: '#1F2937' },
  placeholder: { color: '#9CA3AF' },
  textArea: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 15, color: '#1F2937', textAlignVertical: 'top', minHeight: 80 },
  sizeCard: { flex: 1, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 8, borderWidth: 2, borderColor: '#E5E7EB' },
  sizeCardActive: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  sizeName: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 6 },
  sizeDesc: { fontSize: 11, color: '#9CA3AF', marginTop: 2, textAlign: 'center' },
  photoButton: { borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed' },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F9FAFB' },
  photoText: { marginTop: 8, fontSize: 14, color: '#6B7280' },
  photoPreview: { width: '100%', height: 180, resizeMode: 'cover' },
  priceCard: { backgroundColor: '#ffffff', marginHorizontal: 20, marginTop: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  priceLabel: { fontSize: 14, color: '#6B7280' },
  priceValue: { fontSize: 14, color: '#1F2937', fontWeight: '600' },
  priceDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  priceTotalLabel: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  priceTotalValue: { fontSize: 18, fontWeight: 'bold', color: '#DC2626' },
  bookButton: { flexDirection: 'row', backgroundColor: '#DC2626', marginHorizontal: 20, marginTop: 20, borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },
  bookButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginRight: 8 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
});
