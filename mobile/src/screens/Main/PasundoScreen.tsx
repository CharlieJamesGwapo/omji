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

export default function PasundoScreen({ navigation }: any) {
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

  const [pickupType, setPickupType] = useState('person');
  const [personName, setPersonName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [scheduleType, setScheduleType] = useState('now');
  const [loading, setLoading] = useState(false);

  const pickupTypes = [
    { id: 'person', name: 'Person', icon: 'person', desc: 'School, Market, etc.' },
    { id: 'parcel', name: 'Parcel', icon: 'cube', desc: 'Pick up package' },
    { id: 'document', name: 'Document', icon: 'document', desc: 'Important papers' },
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

  const handleBookPickup = async () => {
    if (!pickupLocation.latitude || !dropoffLocation.latitude) {
      Alert.alert('Error', 'Please select pickup and dropoff locations');
      return;
    }

    if (pickupType === 'person' && !personName) {
      Alert.alert('Error', "Please enter the person's name");
      return;
    }

    const distance = calculateDistance(pickupLocation, dropoffLocation);
    const baseFare = 40;
    const perKmRate = 10;
    const estimatedFare = baseFare + (distance * perKmRate);

    Alert.alert(
      'Confirm Pickup',
      `Type: ${pickupType}\nPickup: ${pickupLocation.address}\nDropoff: ${dropoffLocation.address}\nDistance: ${distance.toFixed(2)} km\nEstimated Fare: ₱${estimatedFare.toFixed(2)}`,
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
                vehicle_type: 'motorcycle',
              });
              const ride = response.data.data;
              Alert.alert(
                'Ride Booked!',
                `Fare: ₱${ride.estimated_fare?.toFixed(2) || estimatedFare.toFixed(2)}\nLooking for nearby riders...`,
              );
              navigation.navigate('Tracking', {
                type: 'pickup',
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
        <Ionicons name="people" size={48} color="#F59E0B" />
        <Text style={styles.headerTitle}>Pasundo Service</Text>
        <Text style={styles.headerSubtitle}>
          Reliable pickup service for people and items
        </Text>
      </View>

      {/* Pickup Type Selection */}
      <View style={styles.section}>
        <Text style={styles.label}>What do you need to pick up?</Text>
        <View style={styles.typeContainer}>
          {pickupTypes.map((type) => (
            <TouchableOpacity
              key={type.id}
              style={[
                styles.typeCard,
                pickupType === type.id && styles.typeCardActive,
              ]}
              onPress={() => setPickupType(type.id)}
            >
              <Ionicons
                name={type.icon as any}
                size={28}
                color={pickupType === type.id ? '#F59E0B' : '#6B7280'}
              />
              <Text
                style={[
                  styles.typeName,
                  pickupType === type.id && styles.typeNameActive,
                ]}
              >
                {type.name}
              </Text>
              <Text style={styles.typeDesc}>{type.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Person Details (if picking up a person) */}
      {pickupType === 'person' && (
        <>
          <View style={styles.section}>
            <Text style={styles.label}>Person's Name *</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#F59E0B" />
              <TextInput
                style={styles.input}
                placeholder="Enter name"
                value={personName}
                onChangeText={setPersonName}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Contact Number</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={20} color="#F59E0B" />
              <TextInput
                style={styles.input}
                placeholder="Enter contact number"
                value={contactNumber}
                onChangeText={setContactNumber}
                keyboardType="phone-pad"
              />
            </View>
          </View>
        </>
      )}

      {/* Pickup Location */}
      <View style={styles.section}>
        <Text style={styles.label}>Pickup Location *</Text>
        <TouchableOpacity
          style={styles.inputContainer}
          onPress={() => setShowPickupMap(true)}
        >
          <Ionicons name="location-outline" size={20} color="#F59E0B" />
          <Text style={[styles.input, !pickupLocation.address && styles.placeholder]}>
            {pickupLocation.address || 'Select where to pick up on map'}
          </Text>
          <Ionicons name="navigate" size={20} color="#F59E0B" />
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
            {dropoffLocation.address || 'Select where to drop off on map'}
          </Text>
          <Ionicons name="map" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {/* Schedule */}
      <View style={styles.section}>
        <Text style={styles.label}>Schedule</Text>
        <View style={styles.scheduleContainer}>
          <TouchableOpacity
            style={[
              styles.scheduleOption,
              scheduleType === 'now' && styles.scheduleOptionActive,
            ]}
            onPress={() => setScheduleType('now')}
          >
            <Ionicons
              name="flash"
              size={20}
              color={scheduleType === 'now' ? '#F59E0B' : '#6B7280'}
            />
            <Text
              style={[
                styles.scheduleText,
                scheduleType === 'now' && styles.scheduleTextActive,
              ]}
            >
              Pick up now
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.scheduleOption,
              scheduleType === 'later' && styles.scheduleOptionActive,
            ]}
            onPress={() => setScheduleType('later')}
          >
            <Ionicons
              name="calendar"
              size={20}
              color={scheduleType === 'later' ? '#F59E0B' : '#6B7280'}
            />
            <Text
              style={[
                styles.scheduleText,
                scheduleType === 'later' && styles.scheduleTextActive,
              ]}
            >
              Schedule later
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notes */}
      <View style={styles.section}>
        <Text style={styles.label}>Special Instructions</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Add any special instructions for the rider..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
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
          <Text style={styles.priceLabel}>Base Fare (Motorcycle)</Text>
          <Text style={styles.priceValue}>₱40</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Per Kilometer</Text>
          <Text style={styles.priceValue}>₱10/km</Text>
        </View>
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
          <Text style={styles.priceTotalLabel}>Estimated Total</Text>
          <Text style={styles.priceTotalValue}>
            {pickupLocation.latitude && dropoffLocation.latitude
              ? `₱${(40 + calculateDistance(pickupLocation, dropoffLocation) * 10).toFixed(2)}`
              : 'Select locations'}
          </Text>
        </View>
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={24} color="#F59E0B" />
        <Text style={styles.infoText}>
          Rider will contact the person being picked up before arrival
        </Text>
      </View>

      {/* Book Button */}
      <TouchableOpacity
        style={[styles.bookButton, loading && styles.bookButtonDisabled]}
        onPress={handleBookPickup}
        disabled={loading}
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
            title="Where to pick up?"
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
            title="Where to drop off?"
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
  typeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  typeCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  typeCardActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  typeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 8,
  },
  typeNameActive: {
    color: '#F59E0B',
  },
  typeDesc: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
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
  scheduleContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  scheduleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  scheduleOptionActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  scheduleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 8,
  },
  scheduleTextActive: {
    color: '#F59E0B',
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
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
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
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 13,
    color: '#92400E',
  },
  bookButton: {
    flexDirection: 'row',
    backgroundColor: '#F59E0B',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookButtonDisabled: {
    opacity: 0.7,
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
