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

  // Auto-detect current location as pickup
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
    const R = 6371; // Earth radius in km
    const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
    const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(point1.latitude * Math.PI / 180) *
      Math.cos(point2.latitude * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
  };

  const handleBookDelivery = () => {
    if (!pickupLocation.latitude || !dropoffLocation.latitude || !itemDescription) {
      Alert.alert('Error', 'Please select pickup and dropoff locations and provide item description');
      return;
    }

    const distance = calculateDistance(pickupLocation, dropoffLocation);
    const baseFare = 50;
    const perKmRate = 15;
    const estimatedFare = baseFare + (distance * perKmRate);

    Alert.alert(
      'Confirm Delivery',
      `Pickup: ${pickupLocation.address}\nDropoff: ${dropoffLocation.address}\nDistance: ${distance.toFixed(2)} km\nEstimated Fare: ₱${estimatedFare.toFixed(2)}\nItem: ${itemDescription}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setLoading(true);
            try {
              const response = await deliveryService.createDelivery({
                pickup_location: pickupLocation.address,
                pickup_latitude: pickupLocation.latitude,
                pickup_longitude: pickupLocation.longitude,
                dropoff_location: dropoffLocation.address,
                dropoff_latitude: dropoffLocation.latitude,
                dropoff_longitude: dropoffLocation.longitude,
                item_description: itemDescription,
                item_photo: itemPhoto || '',
                notes: notes,
              });
              const delivery = response.data?.data || {};
              const finalFare = delivery.delivery_fee || delivery.estimated_fare || estimatedFare;
              Alert.alert(
                'Delivery Booked!',
                `Fare: ₱${typeof finalFare === 'number' ? finalFare.toFixed(2) : finalFare}\nLooking for nearby riders...`,
              );
              navigation.navigate('Tracking', {
                type: 'delivery',
                rideId: delivery.id || 0,
                pickup: pickupLocation.address,
                dropoff: dropoffLocation.address,
                fare: finalFare,
              });
            } catch (error: any) {
              const msg = error.response?.data?.error || 'Failed to book delivery';
              Alert.alert('Error', msg);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header Info */}
      <View style={styles.header}>
        <Ionicons name="cube" size={48} color="#DC2626" />
        <Text style={styles.headerTitle}>Pasugo Delivery</Text>
        <Text style={styles.headerSubtitle}>
          Fast and reliable delivery service across Balingasag
        </Text>
      </View>

      {/* Pickup Location */}
      <View style={styles.section}>
        <Text style={styles.label}>Pickup Location *</Text>
        <TouchableOpacity
          style={styles.inputContainer}
          onPress={() => setShowPickupMap(true)}
        >
          <Ionicons name="location-outline" size={20} color="#DC2626" />
          {detectingLocation ? (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
              <ActivityIndicator size="small" color="#DC2626" />
              <Text style={{ marginLeft: 8, color: '#6B7280', fontSize: 14 }}>Detecting your location...</Text>
            </View>
          ) : (
            <Text style={[styles.input, !pickupLocation.address && styles.placeholder]}>
              {pickupLocation.address || 'Select pickup location on map'}
            </Text>
          )}
          <Ionicons name="navigate" size={20} color="#DC2626" />
        </TouchableOpacity>
      </View>

      {/* Dropoff Location */}
      <View style={styles.section}>
        <Text style={styles.label}>Dropoff Location *</Text>
        <TouchableOpacity
          style={styles.inputContainer}
          onPress={() => setShowDropoffMap(true)}
        >
          <Ionicons name="flag-outline" size={20} color="#EF4444" />
          <Text style={[styles.input, !dropoffLocation.address && styles.placeholder]}>
            {dropoffLocation.address || 'Select dropoff location on map'}
          </Text>
          <Ionicons name="map" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {/* Item Description */}
      <View style={styles.section}>
        <Text style={styles.label}>Item Description *</Text>
        <TextInput
          style={styles.textArea}
          placeholder="What are you sending?"
          value={itemDescription}
          onChangeText={setItemDescription}
          multiline
          numberOfLines={3}
        />
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
          style={styles.textArea}
          placeholder="Special instructions..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={2}
        />
      </View>

      {/* Payment Method */}
      <View style={styles.section}>
        <Text style={styles.label}>Payment Method</Text>
        <View style={styles.paymentOptions}>
          {['cash', 'gcash', 'maya', 'wallet'].map((method) => (
            <TouchableOpacity
              key={method}
              style={[
                styles.paymentOption,
                paymentMethod === method && styles.paymentOptionActive,
              ]}
              onPress={() => setPaymentMethod(method)}
            >
              <Text
                style={[
                  styles.paymentText,
                  paymentMethod === method && styles.paymentTextActive,
                ]}
              >
                {method.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Pricing Info */}
      {pickupLocation.latitude && dropoffLocation.latitude && (
        <View style={styles.priceCard}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Base Fare</Text>
            <Text style={styles.priceValue}>₱50</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>
              Distance ({calculateDistance(pickupLocation, dropoffLocation).toFixed(2)} km)
            </Text>
            <Text style={styles.priceValue}>
              ₱{(calculateDistance(pickupLocation, dropoffLocation) * 15).toFixed(2)}
            </Text>
          </View>
          <View style={styles.priceDivider} />
          <View style={styles.priceRow}>
            <Text style={styles.priceTotalLabel}>Total</Text>
            <Text style={styles.priceTotalValue}>
              ₱{(50 + calculateDistance(pickupLocation, dropoffLocation) * 15).toFixed(2)}
            </Text>
          </View>
        </View>
      )}

      {/* Book Button */}
      <TouchableOpacity
        style={[styles.bookButton, loading && { opacity: 0.7 }]}
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

      <View style={{ height: 40 }} />

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
          <MapPicker
            title="Select Pickup Location"
            onLocationSelect={handlePickupSelect}
            initialLocation={pickupLocation.latitude ? pickupLocation : undefined}
          />
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
          <MapPicker
            title="Select Dropoff Location"
            onLocationSelect={handleDropoffSelect}
            initialLocation={dropoffLocation.latitude ? dropoffLocation : undefined}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  section: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  textArea: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 16,
    color: '#1F2937',
    textAlignVertical: 'top',
  },
  photoButton: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: '#F9FAFB',
  },
  photoText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  photoPreview: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  paymentOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  paymentOption: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  paymentOptionActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  paymentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  paymentTextActive: {
    color: '#ffffff',
  },
  priceCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  priceValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
  },
  priceDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  priceTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  priceTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  bookButton: {
    flexDirection: 'row',
    backgroundColor: '#DC2626',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  placeholder: {
    color: '#9CA3AF',
  },
});
