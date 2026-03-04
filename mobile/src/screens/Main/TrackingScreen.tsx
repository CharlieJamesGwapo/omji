import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { rideService, deliveryService } from '../../services/api';

const { width, height } = Dimensions.get('window');

export default function TrackingScreen({ route, navigation }: any) {
  const { rideId, pickup, dropoff, fare, type = 'delivery' } = route.params || {};
  const [status, setStatus] = useState('pending');
  const [rideData, setRideData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const statusSteps = [
    { id: 'pending', label: 'Finding Rider', icon: 'search' },
    { id: 'accepted', label: 'Rider Found', icon: 'checkmark-circle' },
    { id: 'driver_arrived', label: 'Rider Arrived', icon: 'bicycle' },
    { id: 'in_progress', label: 'In Transit', icon: 'navigate' },
    { id: 'completed', label: 'Completed', icon: 'checkmark-done' },
  ];

  const fetchRideDetails = useCallback(async () => {
    if (!rideId) {
      setLoading(false);
      return;
    }
    try {
      const response = type === 'delivery'
        ? await deliveryService.getDeliveryDetails(rideId)
        : await rideService.getRideDetails(rideId);
      const data = response.data.data;
      setRideData(data);
      setStatus(data.status || 'pending');
    } catch (error) {
      console.error('Error fetching ride details:', error);
    } finally {
      setLoading(false);
    }
  }, [rideId, type]);

  useEffect(() => {
    fetchRideDetails();
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchRideDetails, 5000);
    return () => clearInterval(interval);
  }, [fetchRideDetails]);

  const getCurrentStepIndex = () => {
    return statusSteps.findIndex((step) => step.id === status);
  };

  const currentStepIndex = getCurrentStepIndex();

  const handleCancel = async () => {
    if (!rideId) return;
    const itemType = type === 'delivery' ? 'delivery' : 'ride';
    Alert.alert(`Cancel ${itemType === 'delivery' ? 'Delivery' : 'Ride'}`, `Are you sure you want to cancel this ${itemType}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            if (type === 'delivery') {
              await deliveryService.cancelDelivery(rideId);
            } else {
              await rideService.cancelRide(rideId);
            }
            Alert.alert('Cancelled', `Your ${itemType} has been cancelled.`);
            navigation.goBack();
          } catch (error: any) {
            const msg = error.response?.data?.error || `Failed to cancel ${itemType}`;
            Alert.alert('Error', msg);
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const pickupLabel = rideData?.pickup_location || pickup || 'Pickup';
  const dropoffLabel = rideData?.dropoff_location || dropoff || 'Dropoff';
  const ridefare = rideData?.estimated_fare || rideData?.fare || fare || 0;
  const driverInfo = rideData?.driver;

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={{ marginTop: 16, color: '#6B7280' }}>Loading ride details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={{
          latitude: rideData?.pickup_latitude || 8.4343,
          longitude: rideData?.pickup_longitude || 124.5000,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        <Marker
          coordinate={{
            latitude: rideData?.pickup_latitude || 8.4343,
            longitude: rideData?.pickup_longitude || 124.5000,
          }}
          title={pickupLabel}
        >
          <View style={styles.markerPickup}>
            <Ionicons name="location" size={24} color="#10B981" />
          </View>
        </Marker>

        <Marker
          coordinate={{
            latitude: rideData?.dropoff_latitude || 8.4400,
            longitude: rideData?.dropoff_longitude || 124.5050,
          }}
          title={dropoffLabel}
        >
          <View style={styles.markerDropoff}>
            <Ionicons name="flag" size={24} color="#EF4444" />
          </View>
        </Marker>

        {driverInfo && status !== 'pending' && (
          <Marker
            coordinate={{
              latitude: driverInfo.latitude || 8.4370,
              longitude: driverInfo.longitude || 124.5025,
            }}
          >
            <View style={styles.markerRider}>
              <Ionicons name="bicycle" size={20} color="#ffffff" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Back Button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color="#1F2937" />
      </TouchableOpacity>

      {/* Status Progress */}
      <View style={styles.statusContainer}>
        <View style={styles.progressBar}>
          {statusSteps.map((step, index) => (
            <View key={step.id} style={styles.progressStep}>
              <View
                style={[
                  styles.progressDot,
                  index <= currentStepIndex && styles.progressDotActive,
                ]}
              >
                {index < currentStepIndex ? (
                  <Ionicons name="checkmark" size={12} color="#ffffff" />
                ) : index === currentStepIndex ? (
                  <View style={styles.progressDotPulse} />
                ) : null}
              </View>
              {index < statusSteps.length - 1 && (
                <View
                  style={[
                    styles.progressLine,
                    index < currentStepIndex && styles.progressLineActive,
                  ]}
                />
              )}
            </View>
          ))}
        </View>
        <View style={styles.statusLabelContainer}>
          <Text style={styles.statusLabel}>
            {statusSteps[currentStepIndex >= 0 ? currentStepIndex : 0]?.label}
          </Text>
        </View>
      </View>

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        {status === 'pending' ? (
          <View style={styles.searchingContainer}>
            <View style={styles.loadingSpinner}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
            <Text style={styles.searchingText}>Finding nearby rider...</Text>
            <Text style={styles.searchingSubtext}>
              This usually takes less than a minute
            </Text>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? (
                <ActivityIndicator color="#EF4444" />
              ) : (
                <Text style={styles.cancelButtonText}>Cancel Ride</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Rider Info */}
            {driverInfo && (
              <View style={styles.riderCard}>
                <Image
                  source={{ uri: driverInfo.profile_image || 'https://via.placeholder.com/100?text=Rider' }}
                  style={styles.riderPhoto}
                />
                <View style={styles.riderDetails}>
                  <Text style={styles.riderName}>{driverInfo.name || 'Driver'}</Text>
                  <View style={styles.riderRatingContainer}>
                    <Ionicons name="star" size={14} color="#FBBF24" />
                    <Text style={styles.riderRating}>{driverInfo.rating?.toFixed(1) || '5.0'}</Text>
                    {(driverInfo.vehicle_type || driverInfo.plate_number) && (
                      <Text style={styles.riderVehicle}>
                        {driverInfo.vehicle_type ? ` - ${driverInfo.vehicle_type}` : ''}
                        {driverInfo.plate_number ? ` - ${driverInfo.plate_number}` : ''}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.riderActions}>
                  <TouchableOpacity style={styles.actionButton}>
                    <Ionicons name="chatbubble" size={20} color="#3B82F6" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton}>
                    <Ionicons name="call" size={20} color="#10B981" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Order Details */}
            <View style={styles.orderDetails}>
              <View style={styles.orderRow}>
                <View style={styles.orderDot} />
                <View style={styles.orderInfo}>
                  <Text style={styles.orderLabel}>Pickup</Text>
                  <Text style={styles.orderValue}>{pickupLabel}</Text>
                </View>
              </View>
              <View style={styles.orderConnector} />
              <View style={styles.orderRow}>
                <View style={[styles.orderDot, styles.orderDotDropoff]} />
                <View style={styles.orderInfo}>
                  <Text style={styles.orderLabel}>Dropoff</Text>
                  <Text style={styles.orderValue}>{dropoffLabel}</Text>
                </View>
              </View>
            </View>

            {/* Fare & Distance */}
            <View style={styles.fareContainer}>
              <View style={styles.fareItem}>
                <Ionicons name="speedometer-outline" size={20} color="#6B7280" />
                <Text style={styles.fareLabel}>Distance</Text>
                <Text style={styles.fareValue}>
                  {rideData?.distance_km?.toFixed(1) || rideData?.distance?.toFixed(1) || '—'} km
                </Text>
              </View>
              <View style={styles.fareDivider} />
              <View style={styles.fareItem}>
                <Ionicons name="cash-outline" size={20} color="#6B7280" />
                <Text style={styles.fareLabel}>Total Fare</Text>
                <Text style={styles.fareValue}>₱{typeof ridefare === 'number' ? ridefare.toFixed(2) : ridefare}</Text>
              </View>
            </View>

            {/* Cancel Button */}
            {status !== 'completed' && status !== 'in_progress' && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator color="#EF4444" />
                ) : (
                  <Text style={styles.cancelButtonText}>Cancel Ride</Text>
                )}
              </TouchableOpacity>
            )}

            {status === 'completed' && (
              <TouchableOpacity
                style={styles.doneButton}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  map: {
    width,
    height: height * 0.5,
  },
  markerPickup: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  markerDropoff: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  markerRider: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusContainer: {
    position: 'absolute',
    top: height * 0.5 - 40,
    left: 20,
    right: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  progressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressStep: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotActive: {
    backgroundColor: '#3B82F6',
  },
  progressDotPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E5E7EB',
  },
  progressLineActive: {
    backgroundColor: '#3B82F6',
  },
  statusLabelContainer: {
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  searchingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingSpinner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  searchingText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  searchingSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  riderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  riderPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  riderDetails: {
    flex: 1,
    marginLeft: 12,
  },
  riderName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  riderRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  riderRating: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 4,
  },
  riderVehicle: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  riderActions: {
    flexDirection: 'row',
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  orderDetails: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  orderDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    marginTop: 4,
  },
  orderDotDropoff: {
    backgroundColor: '#EF4444',
  },
  orderConnector: {
    width: 2,
    height: 20,
    backgroundColor: '#D1D5DB',
    marginLeft: 5,
    marginVertical: 4,
  },
  orderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  orderLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  orderValue: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '600',
  },
  fareContainer: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  fareItem: {
    flex: 1,
    alignItems: 'center',
  },
  fareLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
  },
  fareValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 4,
  },
  fareDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
  cancelButton: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  doneButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
