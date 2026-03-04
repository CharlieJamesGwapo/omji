import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { rideService } from '../../services/api';
import MapPicker from '../../components/MapPicker';

export default function PasabayScreen({ navigation }: any) {
  const [showPickupMap, setShowPickupMap] = useState(false);
  const [showDropoffMap, setShowDropoffMap] = useState(false);

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

  const [passengers, setPassengers] = useState(1);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [rideType, setRideType] = useState('single');
  const [loading, setLoading] = useState(false);

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

  const calculateFare = () => {
    const base = rideTypes.find(r => r.id === rideType)?.basePrice || 40;
    const passengerCharge = passengers > 1 ? (passengers - 1) * 20 : 0;
    const distance = calculateDistance(pickupLocation, dropoffLocation);
    const distanceCharge = distance * 10; // ₱10 per km
    return base + passengerCharge + distanceCharge;
  };

  const handleBookRide = () => {
    if (!pickupLocation.latitude || !dropoffLocation.latitude) {
      Alert.alert('Error', 'Please select pickup and dropoff locations');
      return;
    }

    const vehicleType = rideTypes.find(r => r.id === rideType)?.vehicleType || 'motorcycle';
    const distance = calculateDistance(pickupLocation, dropoffLocation);
    const estimatedFare = calculateFare();

    Alert.alert(
      'Confirm Ride',
      `Pickup: ${pickupLocation.address}\nDropoff: ${dropoffLocation.address}\nDistance: ${distance.toFixed(2)} km\nPassengers: ${passengers}\nEstimated Fare: ₱${estimatedFare.toFixed(2)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setLoading(true);
            try {
              const response = await rideService.createRide({
                pickup_location: pickupLocation.address,
                pickup_latitude: pickupLocation.latitude,
                pickup_longitude: pickupLocation.longitude,
                dropoff_location: dropoffLocation.address,
                dropoff_latitude: dropoffLocation.latitude,
                dropoff_longitude: dropoffLocation.longitude,
                vehicle_type: vehicleType,
              });
              const ride = response.data.data;
              Alert.alert(
                'Ride Booked!',
                `Fare: ₱${ride.estimated_fare?.toFixed(2) || estimatedFare.toFixed(2)}\nLooking for nearby riders...`,
              );
              navigation.navigate('Tracking', {
                type: 'ride',
                rideId: ride.id,
                pickup: pickupLocation.address,
                dropoff: dropoffLocation.address,
                fare: ride.estimated_fare || estimatedFare,
              });
            } catch (error: any) {
              const msg = error.response?.data?.error || 'Failed to book ride';
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
        <Ionicons name="bicycle" size={48} color="#10B981" />
        <Text style={styles.headerTitle}>Pasabay Ride</Text>
        <Text style={styles.headerSubtitle}>
          Affordable motorcycle ride sharing across Balingasag
        </Text>
      </View>

      {/* Ride Type Selection */}
      <View style={styles.section}>
        <Text style={styles.label}>Select Ride Type</Text>
        <View style={styles.rideTypeContainer}>
          {rideTypes.map((type) => (
            <TouchableOpacity
              key={type.id}
              style={[
                styles.rideTypeCard,
                rideType === type.id && styles.rideTypeCardActive,
              ]}
              onPress={() => setRideType(type.id)}
            >
              <Ionicons
                name={type.icon as any}
                size={32}
                color={rideType === type.id ? '#10B981' : '#6B7280'}
              />
              <Text
                style={[
                  styles.rideTypeName,
                  rideType === type.id && styles.rideTypeNameActive,
                ]}
              >
                {type.name}
              </Text>
              <Text
                style={[
                  styles.rideTypePrice,
                  rideType === type.id && styles.rideTypePriceActive,
                ]}
              >
                from ₱{type.basePrice}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Pickup Location */}
      <View style={styles.section}>
        <Text style={styles.label}>Pickup Location *</Text>
        <TouchableOpacity
          style={styles.inputContainer}
          onPress={() => setShowPickupMap(true)}
        >
          <Ionicons name="location-outline" size={20} color="#10B981" />
          <Text style={[styles.input, !pickupLocation.address && styles.placeholder]}>
            {pickupLocation.address || 'Select pickup location on map'}
          </Text>
          <Ionicons name="navigate" size={20} color="#10B981" />
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

      {/* Passenger Count */}
      <View style={styles.section}>
        <Text style={styles.label}>Number of Passengers</Text>
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
        <Text style={styles.helperText}>Maximum 4 passengers per ride</Text>
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
      <View style={styles.priceCard}>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Base Fare</Text>
          <Text style={styles.priceValue}>
            ₱{rideTypes.find(r => r.id === rideType)?.basePrice}
          </Text>
        </View>
        {passengers > 1 && (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>
              Additional Passengers ({passengers - 1})
            </Text>
            <Text style={styles.priceValue}>₱{(passengers - 1) * 20}</Text>
          </View>
        )}
        {pickupLocation.latitude && dropoffLocation.latitude && (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>
              Distance ({calculateDistance(pickupLocation, dropoffLocation).toFixed(2)} km)
            </Text>
            <Text style={styles.priceValue}>
              ₱{(calculateDistance(pickupLocation, dropoffLocation) * 10).toFixed(2)}
            </Text>
          </View>
        )}
        <View style={styles.priceDivider} />
        <View style={styles.priceRow}>
          <Text style={styles.priceTotalLabel}>Total</Text>
          <Text style={styles.priceTotalValue}>₱{calculateFare().toFixed(2)}</Text>
        </View>
      </View>

      {/* Book Button */}
      <TouchableOpacity
        style={[styles.bookButton, loading && { opacity: 0.7 }]}
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
  rideTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rideTypeCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  rideTypeCardActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  rideTypeName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  rideTypeNameActive: {
    color: '#10B981',
  },
  rideTypePrice: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  rideTypePriceActive: {
    color: '#059669',
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
  passengerControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonDisabled: {
    backgroundColor: '#F3F4F6',
  },
  passengerDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  passengerCount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 8,
  },
  helperText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
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
    backgroundColor: '#10B981',
    borderColor: '#10B981',
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
    color: '#10B981',
  },
  bookButton: {
    flexDirection: 'row',
    backgroundColor: '#10B981',
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
