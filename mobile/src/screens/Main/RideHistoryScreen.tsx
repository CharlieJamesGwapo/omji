import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { rideService, deliveryService, orderService } from '../../services/api';
import { COLORS, SHADOWS, STATUS_CONFIG, formatStatus, getStatusColor, getStatusBg } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';
import Toast, { ToastType } from '../../components/Toast';
import SkeletonBox from '../../components/SkeletonBox';

interface RideItem {
  id: number;
  pickup_location?: string;
  dropoff_location?: string;
  pickup?: string;
  dropoff?: string;
  status: string;
  vehicle_type: string;
  estimated_fare: number;
  final_fare?: number;
  distance?: number;
  distance_km?: number;
  created_at: string;
  driver?: { name: string; rating: number; phone?: string };
  Driver?: { name: string; rating: number; phone?: string };
  driver_name?: string;
  driver_phone?: string;
  _type?: string;
  _key?: string;
}

const SERVICE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  ride: { label: 'Pasundo Ride', icon: 'navigate-circle', color: COLORS.pasundo, bg: COLORS.pasundoBg },
  delivery: { label: 'Pasugo Delivery', icon: 'cube', color: COLORS.pasugo, bg: COLORS.pasugoBg },
  order: { label: 'Store Order', icon: 'storefront', color: COLORS.store, bg: COLORS.storeBg },
};

export default function RideHistoryScreen({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rides, setRides] = useState<RideItem[]>([]);
  const [fetchError, setFetchError] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  const fetchRides = useCallback(async () => {
    try {
      setFetchError(false);
      const [ridesRes, deliveriesRes, ordersRes] = await Promise.allSettled([
        rideService.getRideHistory(),
        deliveryService.getDeliveryHistory(),
        orderService.getOrderHistory(),
      ]);

      const rideData = ridesRes.status === 'fulfilled' ? ridesRes.value?.data?.data : [];
      const deliveryData = deliveriesRes.status === 'fulfilled' ? deliveriesRes.value?.data?.data : [];
      const orderData = ordersRes.status === 'fulfilled' ? ordersRes.value?.data?.data : [];

      const allRides = [
        ...(Array.isArray(rideData) ? rideData.map((r: any) => ({ ...r, _type: 'ride', _key: `ride-${r.id}` })) : []),
        ...(Array.isArray(deliveryData) ? deliveryData.map((d: any) => ({
          ...d,
          estimated_fare: d.delivery_fee || d.estimated_fare || 0,
          vehicle_type: 'motorcycle',
          _type: 'delivery',
          _key: `delivery-${d.id}`,
        })) : []),
        ...(Array.isArray(orderData) ? orderData.map((o: any) => ({
          ...o,
          estimated_fare: o.total_amount || 0,
          vehicle_type: 'order',
          pickup_location: o.Store?.name || 'Store',
          dropoff_location: o.delivery_location || 'Delivery',
          _type: 'order',
          _key: `order-${o.id}`,
        })) : []),
      ].sort((a, b) => (new Date(b.created_at || 0).getTime() || 0) - (new Date(a.created_at || 0).getTime() || 0));

      setRides(allRides);
    } catch (error) {
      console.error('Error fetching rides:', error);
      setFetchError(true);
      setRides([]);
      showToast('Could not load history. Pull down to retry.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  const ongoingStatuses = ['pending', 'accepted', 'driver_arrived', 'picked_up', 'in_progress', 'preparing', 'confirmed', 'ready', 'out_for_delivery'];
  const filteredRides =
    filterType === 'all'
      ? rides
      : filterType === 'pending'
        ? rides.filter((ride) => ongoingStatuses.includes(ride.status))
        : filterType === 'completed'
          ? rides.filter((ride) => ride.status === 'completed' || ride.status === 'delivered')
          : rides.filter((ride) => ride.status === filterType);

  const totalRides = rides.length;
  const completedRides = rides.filter(r => r.status === 'completed' || r.status === 'delivered').length;
  const totalSpent = rides.reduce((sum, ride) => sum + (ride.final_fare || ride.estimated_fare || 0), 0);

  const filterCounts = useMemo(() => ({
    all: rides.length,
    completed: rides.filter(r => r.status === 'completed' || r.status === 'delivered').length,
    pending: rides.filter(r => ongoingStatuses.includes(r.status)).length,
    cancelled: rides.filter(r => r.status === 'cancelled').length,
  }), [rides]);

  const filterOptions = [
    { id: 'all', label: 'All', icon: 'list' },
    { id: 'completed', label: 'Completed', icon: 'checkmark-circle' },
    { id: 'pending', label: 'Active', icon: 'time' },
    { id: 'cancelled', label: 'Cancelled', icon: 'close-circle' },
  ];

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchRides();
    } finally {
      setRefreshing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerBackBtn} />
          <Text style={styles.headerTitle}>Activity History</Text>
          <View style={{ width: moderateScale(22) }} />
        </View>
        <View style={{ paddingHorizontal: RESPONSIVE.paddingHorizontal, paddingTop: verticalScale(16) }}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={{ backgroundColor: '#fff', borderRadius: moderateScale(12), padding: moderateScale(14), marginBottom: verticalScale(10), flexDirection: 'row', alignItems: 'center' }}>
              <SkeletonBox width={moderateScale(44)} height={moderateScale(44)} borderRadius={moderateScale(22)} />
              <View style={{ flex: 1, marginLeft: moderateScale(12) }}>
                <SkeletonBox width="60%" height={fontScale(14)} borderRadius={4} style={{ marginBottom: verticalScale(8) }} />
                <SkeletonBox width="40%" height={fontScale(12)} borderRadius={4} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (fetchError && !loading && rides.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBackBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={moderateScale(22)} color={COLORS.gray800} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Activity History</Text>
          <View style={{ width: moderateScale(22) }} />
        </View>
        <View style={{ alignItems: 'center', paddingVertical: verticalScale(60) }}>
          <Ionicons name="cloud-offline-outline" size={moderateScale(48)} color={COLORS.error} />
          <Text style={{ fontSize: fontScale(16), fontWeight: '600', color: COLORS.gray700, marginTop: verticalScale(12) }}>Could not load data</Text>
          <Text style={{ fontSize: fontScale(13), color: COLORS.gray500, marginTop: verticalScale(4), textAlign: 'center' }}>Check your connection and try again</Text>
          <TouchableOpacity onPress={fetchRides} style={{ marginTop: verticalScale(16), backgroundColor: COLORS.accent, paddingHorizontal: moderateScale(24), paddingVertical: verticalScale(10), borderRadius: moderateScale(8) }}>
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: fontScale(14) }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={moderateScale(22)} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activity History</Text>
        <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Refresh history" accessibilityRole="button">
          <Ionicons name="refresh-outline" size={moderateScale(22)} color={COLORS.gray800} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.accent]} tintColor={COLORS.accent} />
        }
      >
        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: COLORS.accentBg }]}>
              <Ionicons name="bicycle" size={moderateScale(20)} color={COLORS.accent} />
            </View>
            <Text style={styles.statValue}>{totalRides}</Text>
            <Text style={styles.statLabel}>Total Trips</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: COLORS.successBg }]}>
              <Ionicons name="checkmark-done" size={moderateScale(20)} color={COLORS.success} />
            </View>
            <Text style={styles.statValue}>{completedRides}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: COLORS.warningBg }]}>
              <Ionicons name="cash" size={moderateScale(20)} color={COLORS.warning} />
            </View>
            <Text style={styles.statValue}>₱{totalSpent.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Total Spent</Text>
          </View>
        </View>

        {/* Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersContainer}
          contentContainerStyle={styles.filtersContent}
        >
          {filterOptions.map((option) => {
            const count = filterCounts[option.id as keyof typeof filterCounts];
            const isActive = filterType === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setFilterType(option.id)}
                activeOpacity={0.7}
                accessibilityLabel={`Filter: ${option.label}, ${count} items`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Ionicons
                  name={option.icon as any}
                  size={moderateScale(14)}
                  color={isActive ? COLORS.white : COLORS.gray500}
                />
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {option.label}
                </Text>
                {count > 0 && (
                  <View style={[styles.filterCountBadge, isActive && styles.filterCountBadgeActive]}>
                    <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Ride History List */}
        <View style={styles.historySection}>
          {filteredRides.map((ride) => {
            const serviceConfig = SERVICE_CONFIG[ride._type || 'ride'] || SERVICE_CONFIG.ride;
            const statusColor = getStatusColor(ride.status);
            const statusBg = getStatusBg(ride.status);
            return (
              <TouchableOpacity
                key={ride._key || `${ride._type}-${ride.id}`}
                style={styles.rideCard}
                accessibilityLabel={`${serviceConfig.label}, ${formatStatus(ride.status)}, ${(ride.final_fare || ride.estimated_fare || 0).toFixed(0)} pesos`}
                accessibilityRole="button"
                onPress={() => {
                  if (ride._type === 'order') {
                    Alert.alert(
                      'Store Order',
                      `Store: ${ride.pickup || ride.pickup_location || 'Store'}\nDelivery: ${ride.dropoff || ride.dropoff_location || 'N/A'}\nTotal: ₱${(ride.final_fare || ride.estimated_fare || 0).toFixed(0)}\nStatus: ${formatStatus(ride.status)}`,
                    );
                  } else {
                    navigation.navigate('Tracking', {
                      type: ride._type === 'delivery' ? 'delivery' : 'ride',
                      rideId: ride.id,
                      pickup: ride.pickup || ride.pickup_location || '',
                      dropoff: ride.dropoff || ride.dropoff_location || '',
                      fare: ride.final_fare || ride.estimated_fare,
                    });
                  }
                }}
                activeOpacity={0.7}
              >
                {/* Card accent strip */}
                <View style={[styles.cardAccent, { backgroundColor: statusColor }]} />

                <View style={styles.rideCardInner}>
                  {/* Header row */}
                  <View style={styles.rideHeader}>
                    <View style={[styles.rideIcon, { backgroundColor: serviceConfig.bg }]}>
                      <Ionicons name={serviceConfig.icon as any} size={moderateScale(20)} color={serviceConfig.color} />
                    </View>
                    <View style={styles.rideHeaderInfo}>
                      <View style={styles.rideHeaderTop}>
                        <Text style={styles.rideService}>{serviceConfig.label}</Text>
                        <View style={[styles.serviceTypeBadge, { backgroundColor: serviceConfig.bg }]}>
                          <Text style={[styles.serviceTypeBadgeText, { color: serviceConfig.color }]}>
                            {ride._type === 'order' ? 'Order' : ride._type === 'delivery' ? 'Delivery' : 'Ride'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.rideDate}>{formatDate(ride.created_at)}</Text>
                    </View>
                    <Text style={styles.rideFare}>₱{(ride.final_fare || ride.estimated_fare || 0).toFixed(0)}</Text>
                  </View>

                  {/* Locations */}
                  <View style={styles.rideBody}>
                    <View style={styles.locationRow}>
                      <View style={[styles.locationDot, { backgroundColor: COLORS.success }]} />
                      <Text style={styles.locationText} numberOfLines={1}>
                        {ride.pickup || ride.pickup_location || 'Pickup'}
                      </Text>
                    </View>
                    <View style={styles.locationConnector} />
                    <View style={styles.locationRow}>
                      <View style={[styles.locationDot, { backgroundColor: COLORS.primary }]} />
                      <Text style={styles.locationText} numberOfLines={1}>
                        {ride.dropoff || ride.dropoff_location || 'Dropoff'}
                      </Text>
                    </View>
                  </View>

                  {/* Footer */}
                  <View style={styles.rideFooter}>
                    {!!(ride.driver || ride.Driver) && (
                      <View style={styles.riderInfo}>
                        <View style={styles.riderAvatar}>
                          <Ionicons name="person" size={moderateScale(12)} color={COLORS.gray500} />
                        </View>
                        <Text style={styles.riderName}>{(ride.driver || ride.Driver)?.name}</Text>
                        {!!((ride.driver || ride.Driver)?.rating) && (
                          <View style={styles.ratingBadge}>
                            <Ionicons name="star" size={moderateScale(10)} color={COLORS.warning} />
                            <Text style={styles.riderRating}>{Number((ride.driver || ride.Driver)?.rating ?? 0).toFixed(1)}</Text>
                          </View>
                        )}
                      </View>
                    )}
                    <View style={styles.rideMetrics}>
                      {ride._type !== 'order' && (ride.status === 'completed' || ride.status === 'cancelled') && (
                        <TouchableOpacity
                          style={styles.chatBtn}
                          onPress={(e) => {
                            e.stopPropagation();
                            navigation.navigate('Chat', {
                              rider: ride.driver || ride.Driver || { name: ride.driver_name || 'Driver', phone: ride.driver_phone },
                              rideId: ride._type === 'ride' ? ride.id : undefined,
                              deliveryId: ride._type === 'delivery' ? ride.id : undefined,
                            });
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="View chat history"
                          accessibilityRole="button"
                        >
                          <Ionicons name="chatbubble-outline" size={moderateScale(12)} color={COLORS.gray600} />
                          <Text style={styles.chatBtnText}>Chat</Text>
                        </TouchableOpacity>
                      )}
                      <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                        <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
                        <Text style={[styles.statusText, { color: statusColor }]}>{formatStatus(ride.status)}</Text>
                      </View>
                      {(ride.distance_km || ride.distance || 0) > 0 && (
                        <View style={styles.distanceBadge}>
                          <Ionicons name="navigate-outline" size={moderateScale(10)} color={COLORS.gray500} />
                          <Text style={styles.rideMetric}>{(ride.distance_km || ride.distance || 0).toFixed(1)} km</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

          {filteredRides.length === 0 && (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="time-outline" size={moderateScale(56)} color={COLORS.gray300} />
              </View>
              <Text style={styles.emptyTitle}>No trips found</Text>
              <Text style={styles.emptySubtext}>
                {filterType === 'all'
                  ? 'Start booking rides to see your history here'
                  : `No ${filterOptions.find(f => f.id === filterType)?.label.toLowerCase()} trips yet`}
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: verticalScale(90) }} />
      </ScrollView>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(12),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  headerBackBtn: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: verticalScale(16),
    gap: moderateScale(10),
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    alignItems: 'center',
    ...SHADOWS.md,
  },
  statIconWrap: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  statValue: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.gray900,
    marginBottom: verticalScale(2),
  },
  statLabel: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
    textAlign: 'center',
  },
  filtersContainer: {
    marginBottom: verticalScale(12),
  },
  filtersContent: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    gap: moderateScale(8),
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(14),
    paddingVertical: moderateScale(8),
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    gap: moderateScale(6),
  },
  filterChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  filterText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.gray600,
  },
  filterTextActive: {
    color: COLORS.white,
  },
  filterCountBadge: {
    backgroundColor: COLORS.gray100,
    borderRadius: moderateScale(10),
    minWidth: moderateScale(20),
    height: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: moderateScale(6),
  },
  filterCountBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  filterCountText: {
    fontSize: fontScale(10),
    fontWeight: 'bold',
    color: COLORS.gray600,
  },
  filterCountTextActive: {
    color: COLORS.white,
  },
  historySection: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  rideCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    marginBottom: verticalScale(12),
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  cardAccent: {
    width: moderateScale(4),
  },
  rideCardInner: {
    flex: 1,
    padding: moderateScale(14),
  },
  rideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  rideIcon: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(21),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideHeaderInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  rideHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
    marginBottom: verticalScale(2),
  },
  rideService: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  serviceTypeBadge: {
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(2),
    borderRadius: moderateScale(6),
  },
  serviceTypeBadgeText: {
    fontSize: fontScale(10),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: moderateScale(0.3),
  },
  rideDate: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
  },
  rideFare: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  rideBody: {
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.small,
    padding: moderateScale(12),
    marginBottom: verticalScale(12),
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationDot: {
    width: moderateScale(10),
    height: moderateScale(10),
    borderRadius: moderateScale(5),
  },
  locationConnector: {
    width: moderateScale(2),
    height: verticalScale(14),
    backgroundColor: COLORS.gray300,
    marginLeft: moderateScale(4),
    marginVertical: verticalScale(3),
  },
  locationText: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray700,
    marginLeft: moderateScale(12),
  },
  rideFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  riderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  riderAvatar: {
    width: moderateScale(24),
    height: moderateScale(24),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderName: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray600,
    marginLeft: moderateScale(6),
    marginRight: moderateScale(8),
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: moderateScale(6),
    paddingVertical: moderateScale(2),
    borderRadius: moderateScale(6),
    gap: moderateScale(2),
  },
  riderRating: {
    fontSize: fontScale(11),
    fontWeight: '600',
    color: COLORS.warningDark,
  },
  rideMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
  },
  rideMetric: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(10),
    paddingVertical: moderateScale(4),
    borderRadius: moderateScale(8),
    gap: moderateScale(4),
  },
  statusIndicator: {
    width: moderateScale(6),
    height: moderateScale(6),
    borderRadius: moderateScale(3),
  },
  statusText: {
    fontSize: fontScale(11),
    fontWeight: '600',
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray300,
    borderRadius: moderateScale(6),
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(4),
    gap: moderateScale(4),
  },
  chatBtnText: {
    fontSize: fontScale(11),
    fontWeight: '600',
    color: COLORS.gray600,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray100,
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(4),
    borderRadius: moderateScale(6),
    gap: moderateScale(4),
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(60),
  },
  emptyIconWrap: {
    width: moderateScale(100),
    height: moderateScale(100),
    borderRadius: moderateScale(50),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(20),
  },
  emptyTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(8),
  },
  emptySubtext: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    textAlign: 'center',
    maxWidth: moderateScale(260),
    lineHeight: fontScale(22),
  },
});
