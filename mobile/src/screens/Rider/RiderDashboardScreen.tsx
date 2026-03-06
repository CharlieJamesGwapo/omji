import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { driverService } from '../../services/api';
import Toast, { ToastType } from '../../components/Toast';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

interface DriverRequest {
  id: number;
  type?: string;
  pickup_location?: string;
  pickup?: string;
  dropoff_location?: string;
  dropoff?: string;
  distance?: number;
  distance_km?: number;
  estimated_fare?: number;
  delivery_fee?: number;
  vehicle_type?: string;
  status: string;
  passenger_name?: string;
  passenger_phone?: string;
  item_description?: string;
  payment_method?: string;
  user?: { name: string };
  User?: { name: string };
}

export default function RiderDashboardScreen({ navigation }: any) {
  const [isOnline, setIsOnline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState<any>({ today_earnings: 0, total_earnings: 0, completed_rides: 0 });
  const [requests, setRequests] = useState<DriverRequest[]>([]);
  const [activeJobs, setActiveJobs] = useState<DriverRequest[]>([]);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));
  const previousRequestCount = useRef(-1);

  const fetchData = useCallback(async () => {
    try {
      const [earningsRes, requestsRes] = await Promise.allSettled([
        driverService.getEarnings(),
        driverService.getRequests(),
      ]);

      if (earningsRes.status === 'fulfilled') {
        setEarnings(earningsRes.value?.data?.data || {});
      }

      if (requestsRes.status === 'fulfilled') {
        const data = requestsRes.value?.data?.data;
        const newRequests = Array.isArray(data) ? data : [];
        if (newRequests.length > previousRequestCount.current) {
          Vibration.vibrate(500);
        }
        previousRequestCount.current = newRequests.length;
        setRequests(newRequests);
        const activeData = requestsRes.value?.data?.active;
        setActiveJobs(Array.isArray(activeData) ? activeData : []);
      }
    } catch (error) {
      console.error('Error fetching driver data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll for new requests when online
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [isOnline, fetchData]);

  const handleToggleOnline = async () => {
    if (!isOnline) {
      Alert.alert(
        'Go Online',
        'You will start receiving ride requests. Make sure you are ready!',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go Online',
            onPress: async () => {
              try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                  Alert.alert('Location Required', 'Please enable location access in settings to go online.');
                  return;
                }
                let lat = 8.4343, lng = 124.5000;
                const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
                const loc = await Promise.race([locationPromise, timeoutPromise]);
                if (loc && 'coords' in loc) {
                  lat = loc.coords.latitude;
                  lng = loc.coords.longitude;
                }
                await driverService.setAvailability({ available: true, latitude: lat, longitude: lng });
                setIsOnline(true);
                showToast('You are now online! Waiting for requests...', 'success');
                fetchData();
              } catch (error: any) {
                const msg = error.response?.data?.error || 'Failed to go online';
                showToast(msg, 'error');
              }
            },
          },
        ]
      );
    } else {
      try {
        await driverService.setAvailability({ available: false });
        setIsOnline(false);
        showToast('You are now offline.', 'info');
      } catch (error: any) {
        const msg = error.response?.data?.error || 'Failed to go offline. Please try again.';
        showToast(msg, 'error');
      }
    }
  };

  const handleAcceptJob = (request: DriverRequest) => {
    const fareAmount = request.estimated_fare || request.delivery_fee || 0;
    const pickupAddr = request.pickup_location || request.pickup || 'Pickup';
    const dropoffAddr = request.dropoff_location || request.dropoff || 'Dropoff';
    const isDelivery = request.type === 'delivery';
    const jobLabel = isDelivery ? 'Delivery' : 'Ride';

    let details = `Accept ${jobLabel.toLowerCase()} for ₱${fareAmount.toFixed(0)}?\n\nPickup: ${pickupAddr}\nDropoff: ${dropoffAddr}`;
    if (isDelivery && request.item_description) {
      details += `\nItem: ${request.item_description}`;
    }
    if (request.passenger_name) {
      details += `\nCustomer: ${request.passenger_name}`;
    }

    Alert.alert(
      `Accept ${jobLabel}`,
      details,
      [
        { text: 'Decline', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              await driverService.acceptRequest(request.id);
              await fetchData();
              showToast(`${jobLabel} accepted! Heading to pickup.`, 'success');
              navigation.navigate('Tracking', {
                type: isDelivery ? 'delivery' : 'ride',
                rideId: request.id,
                pickup: pickupAddr,
                dropoff: dropoffAddr,
                fare: fareAmount,
              });
            } catch (error: any) {
              const msg = error.response?.data?.error || 'Failed to accept request';
              showToast(msg, 'error');
            }
          },
        },
      ]
    );
  };

  const handleDeclineJob = (request: DriverRequest) => {
    const isDelivery = request.type === 'delivery';
    const jobLabel = isDelivery ? 'Delivery' : 'Ride';
    Alert.alert(
      `Decline ${jobLabel}`,
      `Are you sure you want to decline this ${jobLabel.toLowerCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              await driverService.rejectRequest(request.id);
              showToast(`${jobLabel} declined.`, 'info');
              fetchData();
            } catch (error: any) {
              const msg = error.response?.data?.error || 'Failed to decline request';
              showToast(msg, 'error');
            }
          },
        },
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const getJobIcon = (request: DriverRequest) => {
    if (request.type === 'delivery') return 'cube';
    switch (request.vehicle_type) {
      case 'motorcycle': return 'navigate-circle';
      case 'car': return 'car';
      default: return 'navigate-circle';
    }
  };

  const getJobColor = (request: DriverRequest) => {
    return request.type === 'delivery' ? '#3B82F6' : '#10B981';
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted': return 'Accepted - Head to pickup';
      case 'driver_arrived': return 'At pickup location';
      case 'picked_up': return 'Item picked up';
      case 'in_progress': return 'In progress';
      default: return status;
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Rider Dashboard</Text>
          <Text style={styles.headerSubtitle}>
            {isOnline ? 'You are online' : 'You are offline'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('RiderProfile')}>
          <Ionicons name="person-circle-outline" size={32} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Online/Offline Toggle */}
        <View style={styles.toggleCard}>
          <View style={styles.toggleInfo}>
            <View
              style={[
                styles.statusIndicator,
                isOnline ? styles.statusOnline : styles.statusOffline,
              ]}
            />
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
              <Text style={styles.toggleSubtitle}>
                {isOnline
                  ? 'Accepting ride requests'
                  : 'Not accepting ride requests'}
              </Text>
            </View>
          </View>
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
            thumbColor={isOnline ? '#10B981' : '#F3F4F6'}
          />
        </View>

        {/* Active Jobs Banner */}
        {activeJobs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Jobs</Text>
            {activeJobs.map((job) => (
              <TouchableOpacity
                key={`active-${job.type}-${job.id}`}
                style={styles.activeJobCard}
                onPress={() => navigation.navigate('Tracking', {
                  type: job.type === 'delivery' ? 'delivery' : 'ride',
                  rideId: job.id,
                  pickup: job.pickup_location || job.pickup || 'Pickup',
                  dropoff: job.dropoff_location || job.dropoff || 'Dropoff',
                  fare: job.estimated_fare || job.delivery_fee || 0,
                })}
              >
                <View style={[styles.activeJobIcon, { backgroundColor: `${getJobColor(job)}20` }]}>
                  <Ionicons name={getJobIcon(job) as any} size={24} color={getJobColor(job)} />
                </View>
                <View style={styles.activeJobInfo}>
                  <Text style={styles.activeJobTitle}>
                    {job.type === 'delivery' ? 'Delivery' : 'Ride'} #{job.id}
                  </Text>
                  <Text style={styles.activeJobStatus}>{getStatusLabel(job.status)}</Text>
                  <Text style={styles.activeJobRoute} numberOfLines={1}>
                    {job.pickup_location || job.pickup || 'Pickup'} → {job.dropoff_location || job.dropoff || 'Dropoff'}
                  </Text>
                </View>
                <View style={styles.activeJobRight}>
                  <Text style={[styles.activeJobFare, { color: getJobColor(job) }]}>
                    ₱{(job.estimated_fare || job.delivery_fee || 0).toFixed(0)}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Today's Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="cash" size={24} color="#10B981" />
              </View>
              <Text style={styles.statValue}>₱{(earnings.today_earnings || 0).toFixed(0)}</Text>
              <Text style={styles.statLabel}>Today</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="wallet" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.statValue}>₱{(earnings.total_earnings || 0).toFixed(0)}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="bicycle" size={24} color="#F59E0B" />
              </View>
              <Text style={styles.statValue}>{earnings.completed_rides || 0}</Text>
              <Text style={styles.statLabel}>Rides</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="star" size={24} color="#FBBF24" />
              </View>
              <Text style={styles.statValue}>{Number(earnings.rating || 5.0).toFixed(1)}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => navigation.navigate('RiderEarnings')}
          >
            <Ionicons name="wallet-outline" size={24} color="#10B981" />
            <Text style={styles.quickActionText}>Earnings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => navigation.navigate('RiderProfile')}
          >
            <Ionicons name="stats-chart-outline" size={24} color="#3B82F6" />
            <Text style={styles.quickActionText}>Stats</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => Alert.alert('Rider Help', 'Need assistance?\n\nEmail: driver-support@omji.app\nPhone: +63 912 345 6789\n\nCommon Issues:\n\u2022 Can\'t go online? Check GPS and internet\n\u2022 Ride not showing? Pull down to refresh\n\u2022 Payment issues? Contact support\n\nHours: 24/7 driver support')}
          >
            <Ionicons name="help-circle-outline" size={24} color="#6B7280" />
            <Text style={styles.quickActionText}>Help</Text>
          </TouchableOpacity>
        </View>

        {/* Available Jobs */}
        {isOnline && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Available Requests</Text>
              <View style={styles.availableBadge}>
                <Text style={styles.availableBadgeText}>
                  {requests.length}
                </Text>
              </View>
            </View>

            {requests.length > 0 ? (
              requests.map((request) => (
                <View key={request.id} style={styles.jobCard}>
                  <View style={styles.jobHeader}>
                    <View
                      style={[
                        styles.jobIcon,
                        { backgroundColor: `${getJobColor(request)}20` },
                      ]}
                    >
                      <Ionicons
                        name={getJobIcon(request) as any}
                        size={24}
                        color={getJobColor(request)}
                      />
                    </View>
                    <View style={styles.jobHeaderInfo}>
                      <Text style={styles.jobService}>
                        {request.type === 'delivery' ? 'Delivery' : request.vehicle_type === 'motorcycle' ? 'Motorcycle Ride' : request.vehicle_type === 'car' ? 'Car Ride' : 'Ride'}
                      </Text>
                      <View style={styles.jobMetrics}>
                        <Text style={styles.jobMetric}>
                          {(request.distance_km || request.distance || 0).toFixed(1)} km
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.jobFare, { color: getJobColor(request) }]}>
                      ₱{(request.estimated_fare || request.delivery_fee || 0).toFixed(0)}
                    </Text>
                  </View>

                  <View style={styles.jobBody}>
                    <View style={styles.locationRow}>
                      <View style={styles.locationDot} />
                      <Text style={styles.locationText} numberOfLines={1}>
                        {request.pickup_location || request.pickup || 'Pickup'}
                      </Text>
                    </View>
                    <View style={styles.locationConnector} />
                    <View style={styles.locationRow}>
                      <View
                        style={[styles.locationDot, styles.locationDotDropoff]}
                      />
                      <Text style={styles.locationText} numberOfLines={1}>
                        {request.dropoff_location || request.dropoff || 'Dropoff'}
                      </Text>
                    </View>
                  </View>

                  {!!(request.passenger_name || request.user?.name || request.User?.name) && (
                    <View style={styles.passengersInfo}>
                      <Ionicons name="person" size={16} color="#6B7280" />
                      <Text style={styles.passengersText}>
                        {request.passenger_name || request.user?.name || request.User?.name}
                      </Text>
                    </View>
                  )}

                  {!!(request.type === 'delivery' && request.item_description) && (
                    <View style={[styles.passengersInfo, { marginTop: request.passenger_name ? 4 : 0 }]}>
                      <Ionicons name="cube-outline" size={16} color="#3B82F6" />
                      <Text style={[styles.passengersText, { color: '#3B82F6' }]} numberOfLines={1}>
                        {request.item_description}
                      </Text>
                    </View>
                  )}

                  {!!request.passenger_phone && (
                    <View style={[styles.passengersInfo, { marginTop: 4 }]}>
                      <Ionicons name="call-outline" size={16} color="#10B981" />
                      <Text style={[styles.passengersText, { color: '#10B981' }]}>
                        {request.passenger_phone}
                      </Text>
                    </View>
                  )}

                  {!!request.payment_method && (
                    <View style={[styles.passengersInfo, { marginTop: 4 }]}>
                      <Ionicons name="cash-outline" size={16} color="#F59E0B" />
                      <Text style={[styles.passengersText, { color: '#F59E0B' }]}>
                        Payment: {request.payment_method.toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.declineButton}
                      onPress={() => handleDeclineJob(request)}
                    >
                      <Text style={styles.declineButtonText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.acceptButton, { backgroundColor: getJobColor(request), flex: 1 }]}
                      onPress={() => handleAcceptJob(request)}
                    >
                      <Text style={styles.acceptButtonText}>
                        Accept {request.type === 'delivery' ? 'Delivery' : 'Ride'}
                      </Text>
                      <Ionicons name="arrow-forward" size={20} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyJobs}>
                <Ionicons name="hourglass-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyJobsText}>
                  Waiting for ride requests...
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Offline Message */}
        {!isOnline && (
          <View style={styles.offlineCard}>
            <Ionicons name="moon-outline" size={48} color="#6B7280" />
            <Text style={styles.offlineTitle}>You're Offline</Text>
            <Text style={styles.offlineText}>
              Turn on online mode to start accepting ride requests
            </Text>
            <TouchableOpacity
              style={styles.goOnlineButton}
              onPress={handleToggleOnline}
            >
              <Text style={styles.goOnlineButtonText}>Go Online</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(12),
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
    marginTop: verticalScale(2),
  },
  toggleCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(16),
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIndicator: {
    width: moderateScale(12),
    height: moderateScale(12),
    borderRadius: moderateScale(6),
    marginRight: moderateScale(12),
  },
  statusOnline: {
    backgroundColor: '#10B981',
  },
  statusOffline: {
    backgroundColor: '#9CA3AF',
  },
  toggleText: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(2),
  },
  toggleSubtitle: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
  },
  section: {
    marginTop: verticalScale(20),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(10),
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  availableBadge: {
    backgroundColor: '#10B981',
    borderRadius: RESPONSIVE.borderRadius.medium,
    minWidth: moderateScale(24),
    height: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: moderateScale(8),
    paddingHorizontal: moderateScale(8),
  },
  availableBadgeText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: moderateScale(-4),
  },
  statCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    margin: moderateScale(4),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(10),
  },
  statValue: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(3),
  },
  statLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    marginTop: verticalScale(16),
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    alignItems: 'center',
    marginHorizontal: moderateScale(4),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: '#374151',
    marginTop: verticalScale(6),
  },
  jobCard: {
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(10),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(10),
  },
  jobIcon: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobHeaderInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  jobService: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(3),
  },
  jobMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobMetric: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
  },
  jobFare: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#10B981',
  },
  jobBody: {
    backgroundColor: '#F9FAFB',
    borderRadius: RESPONSIVE.borderRadius.small,
    padding: moderateScale(12),
    marginBottom: verticalScale(10),
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationDot: {
    width: moderateScale(10),
    height: moderateScale(10),
    borderRadius: moderateScale(5),
    backgroundColor: '#10B981',
  },
  locationDotDropoff: {
    backgroundColor: '#EF4444',
  },
  locationConnector: {
    width: 2,
    height: verticalScale(14),
    backgroundColor: '#D1D5DB',
    marginLeft: moderateScale(4),
    marginVertical: verticalScale(3),
  },
  locationText: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#374151',
    marginLeft: moderateScale(12),
  },
  passengersInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: moderateScale(10),
    borderRadius: RESPONSIVE.borderRadius.small,
    marginBottom: verticalScale(10),
  },
  passengersText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#374151',
    marginLeft: moderateScale(8),
  },
  actionRow: {
    flexDirection: 'row',
    gap: moderateScale(8),
  },
  declineButton: {
    borderRadius: RESPONSIVE.borderRadius.small,
    padding: moderateScale(14),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingHorizontal: moderateScale(20),
  },
  declineButtonText: {
    color: '#EF4444',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },
  acceptButton: {
    flexDirection: 'row',
    backgroundColor: '#10B981',
    borderRadius: RESPONSIVE.borderRadius.small,
    padding: moderateScale(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    marginRight: moderateScale(8),
  },
  emptyJobs: {
    alignItems: 'center',
    padding: moderateScale(36),
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
  },
  emptyJobsText: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#6B7280',
    marginTop: verticalScale(10),
  },
  offlineCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(32),
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(36),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  offlineTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: verticalScale(12),
    marginBottom: verticalScale(6),
  },
  offlineText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: verticalScale(20),
  },
  goOnlineButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: moderateScale(32),
    paddingVertical: moderateScale(12),
    borderRadius: RESPONSIVE.borderRadius.small,
  },
  goOnlineButtonText: {
    color: '#ffffff',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },
  activeJobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginBottom: verticalScale(8),
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  activeJobIcon: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeJobInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  activeJobTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  activeJobStatus: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#F59E0B',
    fontWeight: '600',
    marginTop: verticalScale(2),
  },
  activeJobRoute: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    marginTop: verticalScale(2),
  },
  activeJobRight: {
    alignItems: 'flex-end',
    marginLeft: moderateScale(8),
  },
  activeJobFare: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    marginBottom: verticalScale(3),
  },
});
