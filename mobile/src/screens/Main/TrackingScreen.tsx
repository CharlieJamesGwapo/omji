import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { rideService, deliveryService, driverService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Toast, { ToastType } from '../../components/Toast';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

const { width, height } = Dimensions.get('window');

const STATUS_CONFIG: Record<string, { label: string; description: string; icon: string; color: string }> = {
  pending: { label: 'Finding Rider', description: 'Looking for the nearest available rider...', icon: 'search', color: '#F59E0B' },
  accepted: { label: 'Rider Accepted', description: 'Your rider is heading to the pickup point', icon: 'checkmark-circle', color: '#3B82F6' },
  driver_arrived: { label: 'Rider Arrived', description: 'Your rider is waiting at the pickup point', icon: 'location', color: '#8B5CF6' },
  picked_up: { label: 'Picked Up', description: 'Item has been picked up', icon: 'cube', color: '#8B5CF6' },
  in_progress: { label: 'On the Way', description: 'Your rider is heading to the destination', icon: 'navigate', color: '#10B981' },
  completed: { label: 'Delivered', description: 'Your order has been completed!', icon: 'checkmark-done-circle', color: '#10B981' },
  cancelled: { label: 'Cancelled', description: 'This order has been cancelled', icon: 'close-circle', color: '#EF4444' },
};

const PAYMENT_LABELS: Record<string, { name: string; icon: string; color: string }> = {
  cash: { name: 'Cash', icon: 'cash-outline', color: '#F59E0B' },
  gcash: { name: 'GCash', icon: 'phone-portrait-outline', color: '#0070E0' },
  maya: { name: 'Maya', icon: 'card-outline', color: '#00B251' },
  wallet: { name: 'OMJI Wallet', icon: 'wallet-outline', color: '#8B5CF6' },
};

export default function TrackingScreen({ route, navigation }: any) {
  const { rideId, pickup, dropoff, fare, type = 'ride' } = route.params || {};
  const { user } = useAuth();
  const isDriver = user?.role === 'rider' || user?.role === 'driver';
  const mapRef = useRef<MapView>(null);
  const [status, setStatus] = useState('pending');
  const [rideData, setRideData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [hasRated, setHasRated] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  const statusSteps = type === 'delivery'
    ? ['pending', 'accepted', 'driver_arrived', 'picked_up', 'in_progress', 'completed']
    : ['pending', 'accepted', 'driver_arrived', 'in_progress', 'completed'];

  const fetchRideDetails = useCallback(async () => {
    if (!rideId) { setLoading(false); return; }
    try {
      const response = type === 'delivery'
        ? await deliveryService.getDeliveryDetails(rideId)
        : await rideService.getRideDetails(rideId);
      const data = response.data?.data;
      setRideData(data);
      setStatus(data?.status || 'pending');
    } catch (error) {
      console.error('Error fetching ride details:', error);
    } finally {
      setLoading(false);
    }
  }, [rideId, type]);

  useEffect(() => {
    fetchRideDetails();
    // Stop polling once ride is completed or cancelled
    if (status === 'completed' || status === 'cancelled') return;
    const interval = setInterval(fetchRideDetails, 5000);
    return () => clearInterval(interval);
  }, [fetchRideDetails, status]);

  const getCurrentStepIndex = () => statusSteps.indexOf(status);
  const currentStepIndex = getCurrentStepIndex();

  const getNextDriverStatus = (): { status: string; label: string; icon: string } | null => {
    if (type === 'delivery') {
      switch (status) {
        case 'accepted': return { status: 'driver_arrived', label: 'Arrived at Pickup', icon: 'location' };
        case 'driver_arrived': return { status: 'picked_up', label: 'Picked Up Item', icon: 'cube' };
        case 'picked_up': return { status: 'in_progress', label: 'Start Delivery', icon: 'navigate' };
        case 'in_progress': return { status: 'completed', label: 'Complete Delivery', icon: 'checkmark-done-circle' };
        default: return null;
      }
    }
    switch (status) {
      case 'accepted': return { status: 'driver_arrived', label: 'Arrived at Pickup', icon: 'location' };
      case 'driver_arrived': return { status: 'in_progress', label: 'Start Ride', icon: 'navigate' };
      case 'in_progress': return { status: 'completed', label: 'Complete Ride', icon: 'checkmark-done-circle' };
      default: return null;
    }
  };

  const handleUpdateStatus = async () => {
    const next = getNextDriverStatus();
    if (!next || !rideId) return;

    const confirmMsg = next.status === 'completed'
      ? `Mark this ${type} as completed? This will finalize the fare.`
      : `Update status to "${next.label}"?`;

    Alert.alert('Update Status', confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setUpdatingStatus(true);
          try {
            await driverService.updateRideStatus(rideId, next.status);
            setStatus(next.status);
            fetchRideDetails();
          } catch (error: any) {
            const msg = error.response?.data?.error || 'Failed to update status';
            showToast(msg, 'error');
          } finally {
            setUpdatingStatus(false);
          }
        },
      },
    ]);
  };

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
            showToast(`Your ${itemType} has been cancelled.`, 'success');
            setTimeout(() => navigation.goBack(), 1000);
          } catch (error: any) {
            const msg = error.response?.data?.error || `Failed to cancel ${itemType}`;
            showToast(msg, 'error');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const pickupLabel = rideData?.pickup_location || rideData?.pickup || pickup || 'Pickup';
  const dropoffLabel = rideData?.dropoff_location || rideData?.dropoff || dropoff || 'Dropoff';
  const rideFare = rideData?.final_fare || rideData?.estimated_fare || rideData?.delivery_fee || rideData?.fare || fare || 0;
  const rideDistance = rideData?.distance_km || rideData?.distance || 0;
  const paymentMethod = rideData?.payment_method || 'cash';
  const pickupLat = rideData?.pickup_latitude || rideData?.pickup_lat || 8.4343;
  const pickupLng = rideData?.pickup_longitude || rideData?.pickup_lng || 124.5000;
  const dropoffLat = rideData?.dropoff_latitude || rideData?.dropoff_lat || 8.4400;
  const dropoffLng = rideData?.dropoff_longitude || rideData?.dropoff_lng || 124.5050;
  const driverInfo = rideData?.driver || rideData?.Driver;
  const driverVehicle = rideData?.driver || rideData?.Driver;
  const statusInfo = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const paymentInfo = PAYMENT_LABELS[paymentMethod] || PAYMENT_LABELS.cash;

  // ETA estimation: average speed ~25 km/h for city rides
  const estimatedEtaMinutes = rideDistance > 0 ? Math.round((rideDistance / 25) * 60) : 0;

  // Auto-show rating when ride completes (for users only)
  useEffect(() => {
    if (status === 'completed' && !isDriver && !hasRated && driverInfo) {
      const timer = setTimeout(() => setShowRating(true), 800);
      return () => clearTimeout(timer);
    }
  }, [status, isDriver, hasRated, driverInfo]);

  const handleSubmitRating = async () => {
    if (!rideId) return;
    setSubmittingRating(true);
    try {
      if (type === 'delivery') {
        await deliveryService.rateDelivery(rideId, rating);
      } else {
        await rideService.rateRide(rideId, rating, review);
      }
      setHasRated(true);
      setShowRating(false);
      showToast('Thank you! Your rating has been submitted.', 'success');
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to submit rating';
      showToast(msg, 'error');
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={{ marginTop: verticalScale(16), color: '#6B7280' }}>Loading details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={{
          latitude: (pickupLat + dropoffLat) / 2,
          longitude: (pickupLng + dropoffLng) / 2,
          latitudeDelta: Math.abs(pickupLat - dropoffLat) * 2.5 + 0.01,
          longitudeDelta: Math.abs(pickupLng - dropoffLng) * 2.5 + 0.01,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        onLayout={() => {
          const coords = [
            { latitude: pickupLat, longitude: pickupLng },
            { latitude: dropoffLat, longitude: dropoffLng },
          ];
          mapRef.current?.fitToCoordinates(coords, {
            edgePadding: { top: verticalScale(80), right: moderateScale(60), bottom: height * 0.55, left: moderateScale(60) },
            animated: false,
          });
        }}
      >
        <Polyline
          coordinates={[
            { latitude: pickupLat, longitude: pickupLng },
            { latitude: dropoffLat, longitude: dropoffLng },
          ]}
          strokeColor="#3B82F6"
          strokeWidth={4}
          lineDashPattern={[0]}
        />
        <Marker coordinate={{ latitude: pickupLat, longitude: pickupLng }} title={pickupLabel}>
          <View style={styles.markerPickup}>
            <Ionicons name="radio-button-on" size={14} color="#ffffff" />
          </View>
        </Marker>
        <Marker coordinate={{ latitude: dropoffLat, longitude: dropoffLng }} title={dropoffLabel}>
          <View style={styles.markerDropoff}>
            <Ionicons name="flag" size={14} color="#ffffff" />
          </View>
        </Marker>
        {!!driverInfo && status !== 'pending' && (
          <Marker
            coordinate={{
              latitude: driverVehicle?.current_latitude || driverVehicle?.latitude || pickupLat,
              longitude: driverVehicle?.current_longitude || driverVehicle?.longitude || pickupLng,
            }}
            title={driverInfo.name || 'Rider'}
          >
            <View style={styles.markerRider}>
              <Ionicons name="bicycle" size={16} color="#ffffff" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color="#1F2937" />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Status Banner */}
          <View style={[styles.statusBanner, { backgroundColor: `${statusInfo.color}15` }]}>
            <View style={[styles.statusIconCircle, { backgroundColor: statusInfo.color }]}>
              <Ionicons name={statusInfo.icon as any} size={20} color="#ffffff" />
            </View>
            <View style={styles.statusTextContainer}>
              <Text style={[styles.statusTitle, { color: statusInfo.color }]}>{statusInfo.label}</Text>
              <Text style={styles.statusDescription}>{statusInfo.description}</Text>
            </View>
            {status === 'pending' && (
              <ActivityIndicator size="small" color={statusInfo.color} />
            )}
          </View>

          {/* ETA Display */}
          {estimatedEtaMinutes > 0 && status !== 'completed' && status !== 'cancelled' && (
            <View style={styles.etaContainer}>
              <Ionicons name="time-outline" size={16} color="#6B7280" />
              <Text style={styles.etaText}>
                ETA: ~{estimatedEtaMinutes < 60 ? `${estimatedEtaMinutes} min` : `${Math.floor(estimatedEtaMinutes / 60)}h ${estimatedEtaMinutes % 60}m`}
              </Text>
            </View>
          )}

          {/* Progress Steps */}
          {status === 'cancelled' ? (
            <View style={styles.cancelledContainer}>
              <Ionicons name="close-circle" size={48} color="#EF4444" />
              <Text style={styles.cancelledText}>This {type === 'delivery' ? 'delivery' : 'ride'} has been cancelled</Text>
            </View>
          ) : (
            <View style={styles.progressContainer}>
              {statusSteps.map((step, index) => {
                const isActive = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;
                return (
                  <View key={step} style={styles.progressStep}>
                    <View style={[
                      styles.progressDot,
                      isActive && { backgroundColor: '#3B82F6' },
                      isCurrent && styles.progressDotCurrent,
                    ]}>
                      {isActive && !isCurrent && (
                        <Ionicons name="checkmark" size={10} color="#ffffff" />
                      )}
                    </View>
                    {index < statusSteps.length - 1 && (
                      <View style={[styles.progressLine, isActive && { backgroundColor: '#3B82F6' }]} />
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Driver Card */}
          {!!driverInfo && status !== 'pending' && (
            <View style={styles.driverCard}>
              <View style={styles.driverInfo}>
                {driverInfo.profile_image ? (
                  <Image source={{ uri: driverInfo.profile_image }} style={styles.driverPhoto} />
                ) : (
                  <View style={[styles.driverPhoto, { backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="person" size={24} color="#9CA3AF" />
                  </View>
                )}
                <View style={styles.driverDetails}>
                  <Text style={styles.driverName}>{driverInfo.name || 'Driver'}</Text>
                  <View style={styles.driverMeta}>
                    <Ionicons name="star" size={14} color="#FBBF24" />
                    <Text style={styles.driverRating}>{Number(driverInfo.rating || driverVehicle?.rating || 5.0).toFixed(1)}</Text>
                    {!!(driverVehicle?.vehicle_plate) && (
                      <Text style={styles.driverPlate}>{driverVehicle.vehicle_plate}</Text>
                    )}
                  </View>
                  {!!(driverVehicle?.vehicle_model || driverVehicle?.vehicle_type) && (
                    <Text style={styles.driverVehicle}>
                      {[driverVehicle.vehicle_type, driverVehicle.vehicle_model].filter(Boolean).join(' - ')}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.driverActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => navigation.navigate('Chat', {
                    rider: driverInfo,
                    rideId: type === 'ride' ? rideId : undefined,
                    deliveryId: type === 'delivery' ? rideId : undefined,
                  })}
                >
                  <Ionicons name="chatbubble" size={18} color="#3B82F6" />
                  <Text style={styles.actionBtnText}>Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#ECFDF5' }]}
                  onPress={() => {
                    if (driverInfo.phone) {
                      Linking.openURL(`tel:${driverInfo.phone}`);
                    } else {
                      Alert.alert('No Phone', 'Driver phone number is not available. Try chat instead.');
                    }
                  }}
                >
                  <Ionicons name="call" size={18} color="#10B981" />
                  <Text style={[styles.actionBtnText, { color: '#10B981' }]}>Call</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Route Details */}
          <View style={styles.routeCard}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Pickup</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>{pickupLabel}</Text>
              </View>
            </View>
            <View style={styles.routeConnector}>
              <View style={styles.routeLine} />
            </View>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Drop-off</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>{dropoffLabel}</Text>
              </View>
            </View>
          </View>

          {/* Fare & Payment Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Ionicons name="speedometer-outline" size={18} color="#6B7280" />
                <Text style={styles.summaryLabel}>Distance</Text>
                <Text style={styles.summaryValue}>{rideDistance > 0 ? `${Number(rideDistance).toFixed(1)} km` : '--'}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Ionicons name={paymentInfo.icon as any} size={18} color={paymentInfo.color} />
                <Text style={styles.summaryLabel}>Payment</Text>
                <Text style={[styles.summaryValue, { color: paymentInfo.color }]}>{paymentInfo.name}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Ionicons name="cash-outline" size={18} color="#10B981" />
                <Text style={styles.summaryLabel}>{status === 'completed' ? 'Total Fare' : 'Est. Fare'}</Text>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>
                  ₱{Number(rideFare || 0).toFixed(0)}
                </Text>
              </View>
            </View>
          </View>

          {/* Driver Status Update Button */}
          {isDriver && !!getNextDriverStatus() && (
            <TouchableOpacity
              style={styles.driverActionButton}
              onPress={handleUpdateStatus}
              disabled={updatingStatus}
            >
              {updatingStatus ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name={getNextDriverStatus()!.icon as any} size={20} color="#ffffff" />
                  <Text style={styles.driverActionButtonText}>{getNextDriverStatus()!.label}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Actions */}
          {status !== 'completed' && status !== 'cancelled' && !isDriver && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={cancelling || status === 'in_progress' || status === 'picked_up'}
            >
              {cancelling ? (
                <ActivityIndicator color="#EF4444" />
              ) : status === 'in_progress' || status === 'picked_up' ? (
                <Text style={[styles.cancelButtonText, { color: '#9CA3AF' }]}>Cannot cancel - {type === 'delivery' ? 'delivery' : 'ride'} in progress</Text>
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                  <Text style={styles.cancelButtonText}>Cancel {type === 'delivery' ? 'Delivery' : 'Ride'}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {status === 'completed' && !isDriver && (
            <View>
              {!hasRated && !!driverInfo && (
                <TouchableOpacity
                  style={styles.rateButton}
                  onPress={() => setShowRating(true)}
                >
                  <Ionicons name="star" size={20} color="#FBBF24" />
                  <Text style={styles.rateButtonText}>Rate Your Rider</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.doneButton}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          {status === 'completed' && isDriver && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: verticalScale(20) }} />
        </ScrollView>
      </View>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />

      {/* Rating Modal */}
      <Modal visible={showRating} animationType="slide" transparent>
        <View style={styles.ratingOverlay}>
          <View style={styles.ratingModal}>
            <Text style={styles.ratingTitle}>Rate Your Rider</Text>
            {!!driverInfo && (
              <Text style={styles.ratingDriverName}>{driverInfo.name || 'Driver'}</Text>
            )}

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={`star-${star}`} onPress={() => setRating(star)} style={styles.starButton}>
                  <Ionicons
                    name={star <= rating ? 'star' : 'star-outline'}
                    size={40}
                    color={star <= rating ? '#FBBF24' : '#D1D5DB'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.ratingLabel}>
              {rating === 5 ? 'Excellent!' : rating === 4 ? 'Great!' : rating === 3 ? 'Good' : rating === 2 ? 'Fair' : 'Poor'}
            </Text>

            {type !== 'delivery' && (
              <TextInput
                style={styles.reviewInput}
                placeholder="Leave a review (optional)"
                value={review}
                onChangeText={setReview}
                multiline
                numberOfLines={3}
              />
            )}

            <TouchableOpacity
              style={styles.submitRatingButton}
              onPress={handleSubmitRating}
              disabled={submittingRating}
            >
              {submittingRating ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitRatingText}>Submit Rating</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipRatingButton}
              onPress={() => { setShowRating(false); setHasRated(true); }}
            >
              <Text style={styles.skipRatingText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    height: height * 0.4,
  },
  markerPickup: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(14),
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(4),
  },
  markerDropoff: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(14),
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(4),
  },
  markerRider: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.3,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(5),
  },
  backButton: {
    position: 'absolute',
    top: isIOS ? verticalScale(50) : verticalScale(35),
    left: RESPONSIVE.paddingHorizontal,
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.1,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(3),
  },
  bottomSheet: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: RESPONSIVE.borderRadius.xlarge,
    borderTopRightRadius: RESPONSIVE.borderRadius.xlarge,
    marginTop: moderateScale(-24),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(10),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(-4) },
    shadowOpacity: 0.1,
    shadowRadius: moderateScale(8),
    elevation: moderateScale(10),
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginTop: verticalScale(6),
    marginBottom: verticalScale(12),
  },
  statusIconCircle: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTextContainer: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  statusTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },
  statusDescription: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    marginTop: verticalScale(2),
  },
  etaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
    gap: moderateScale(6),
  },
  etaText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    fontWeight: '600',
  },
  cancelledContainer: {
    alignItems: 'center',
    paddingVertical: verticalScale(16),
    marginBottom: verticalScale(12),
  },
  cancelledText: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#EF4444',
    fontWeight: '600',
    marginTop: verticalScale(8),
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
    paddingHorizontal: moderateScale(8),
  },
  progressStep: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: moderateScale(18),
    height: moderateScale(18),
    borderRadius: moderateScale(9),
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotCurrent: {
    width: moderateScale(22),
    height: moderateScale(22),
    borderRadius: moderateScale(11),
    borderWidth: 3,
    borderColor: '#BFDBFE',
  },
  progressLine: {
    flex: 1,
    height: moderateScale(3),
    backgroundColor: '#E5E7EB',
    borderRadius: moderateScale(2),
  },
  driverCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginBottom: verticalScale(10),
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(10),
  },
  driverPhoto: {
    width: moderateScale(52),
    height: moderateScale(52),
    borderRadius: moderateScale(26),
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  driverDetails: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  driverName: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(3),
  },
  driverRating: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: moderateScale(4),
  },
  driverPlate: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: '#3B82F6',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(2),
    borderRadius: moderateScale(4),
    marginLeft: moderateScale(8),
    overflow: 'hidden',
  },
  driverVehicle: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    marginTop: verticalScale(2),
  },
  driverActions: {
    flexDirection: 'row',
    gap: moderateScale(10),
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: RESPONSIVE.borderRadius.small,
    paddingVertical: moderateScale(10),
    gap: moderateScale(6),
  },
  actionBtnText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#3B82F6',
  },
  routeCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(10),
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeDot: {
    width: moderateScale(10),
    height: moderateScale(10),
    borderRadius: moderateScale(5),
    marginTop: verticalScale(5),
  },
  routeInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  routeLabel: {
    fontSize: fontScale(11),
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routeAddress: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#1F2937',
    fontWeight: '500',
    marginTop: verticalScale(2),
  },
  routeConnector: {
    paddingLeft: moderateScale(4),
    paddingVertical: moderateScale(2),
  },
  routeLine: {
    width: 2,
    height: verticalScale(18),
    backgroundColor: '#D1D5DB',
    marginVertical: verticalScale(2),
  },
  summaryCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(12),
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: fontScale(11),
    color: '#6B7280',
    marginTop: verticalScale(5),
  },
  summaryValue: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: verticalScale(2),
  },
  summaryDivider: {
    width: 1,
    height: moderateScale(40),
    backgroundColor: '#E5E7EB',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    borderWidth: 1,
    borderColor: '#FEE2E2',
    gap: moderateScale(8),
  },
  cancelButtonText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: '#EF4444',
  },
  driverActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(8),
    gap: moderateScale(8),
  },
  driverActionButtonText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    gap: moderateScale(8),
  },
  doneButtonText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  rateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(8),
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: moderateScale(8),
  },
  rateButtonText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#92400E',
  },
  ratingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  ratingModal: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: RESPONSIVE.borderRadius.xlarge,
    borderTopRightRadius: RESPONSIVE.borderRadius.xlarge,
    padding: moderateScale(24),
    paddingBottom: verticalScale(36),
    alignItems: 'center',
  },
  ratingTitle: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(3),
  },
  ratingDriverName: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#6B7280',
    marginBottom: verticalScale(16),
  },
  starsRow: {
    flexDirection: 'row',
    marginBottom: verticalScale(6),
  },
  starButton: {
    paddingHorizontal: moderateScale(6),
  },
  ratingLabel: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: '#374151',
    marginBottom: verticalScale(12),
  },
  reviewInput: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#1F2937',
    textAlignVertical: 'top',
    marginBottom: verticalScale(12),
    minHeight: verticalScale(70),
  },
  submitRatingButton: {
    width: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  submitRatingText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  skipRatingButton: {
    padding: moderateScale(10),
  },
  skipRatingText: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#6B7280',
  },
});
