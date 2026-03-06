import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { rideService, deliveryService, orderService } from '../../services/api';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

interface RideItem {
  id: number;
  pickup_location?: string;
  dropoff_location?: string;
  pickup?: string;
  dropoff?: string;
  status: string;
  vehicle_type: string;
  estimated_fare: number;
  distance?: number;
  distance_km?: number;
  created_at: string;
  driver?: { name: string; rating: number };
  Driver?: { name: string; rating: number };
  _type?: string;
  _key?: string;
}

export default function RideHistoryScreen({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rides, setRides] = useState<RideItem[]>([]);
  const [filterType, setFilterType] = useState('all');

  const fetchRides = useCallback(async () => {
    try {
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
          pickup_location: o.store_name || 'Store',
          dropoff_location: o.delivery_address || 'Delivery',
          _type: 'order',
          _key: `order-${o.id}`,
        })) : []),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setRides(allRides);
    } catch (error) {
      console.error('Error fetching rides:', error);
      setRides([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  const filterOptions = [
    { id: 'all', label: 'All' },
    { id: 'completed', label: 'Completed' },
    { id: 'pending', label: 'Pending' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  const filteredRides =
    filterType === 'all'
      ? rides
      : rides.filter((ride) => ride.status === filterType);

  const totalRides = rides.length;
  const totalSpent = rides.reduce((sum, ride) => sum + (ride.estimated_fare || 0), 0);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRides();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10B981';
      case 'pending': return '#F59E0B';
      case 'in_progress': return '#3B82F6';
      case 'cancelled': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getServiceIcon = (vehicleType: string) => {
    switch (vehicleType) {
      case 'motorcycle': return 'navigate-circle';
      case 'car': return 'car';
      case 'order': return 'storefront';
      default: return 'navigate-circle';
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride History</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh-outline" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="bicycle" size={24} color="#3B82F6" />
            <Text style={styles.statValue}>{totalRides}</Text>
            <Text style={styles.statLabel}>Total Rides</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="cash" size={24} color="#10B981" />
            <Text style={styles.statValue}>₱{totalSpent.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Total Spent</Text>
          </View>
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersContainer}
          contentContainerStyle={styles.filtersContent}
        >
          {filterOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.filterChip,
                filterType === option.id && styles.filterChipActive,
              ]}
              onPress={() => setFilterType(option.id)}
            >
              <Text
                style={[
                  styles.filterText,
                  filterType === option.id && styles.filterTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Ride History List */}
        <View style={styles.historySection}>
          {filteredRides.map((ride) => (
            <TouchableOpacity
              key={ride._key || ride.id}
              style={styles.rideCard}
              onPress={() =>
                navigation.navigate('Tracking', {
                  type: ride._type === 'delivery' ? 'delivery' : 'ride',
                  rideId: ride.id,
                  pickup: ride.pickup || ride.pickup_location || '',
                  dropoff: ride.dropoff || ride.dropoff_location || '',
                  fare: ride.estimated_fare,
                })
              }
            >
              <View style={styles.rideHeader}>
                <View
                  style={[styles.rideIcon, { backgroundColor: `${getStatusColor(ride.status)}20` }]}
                >
                  <Ionicons
                    name={getServiceIcon(ride.vehicle_type) as any}
                    size={24}
                    color={getStatusColor(ride.status)}
                  />
                </View>
                <View style={styles.rideHeaderInfo}>
                  <Text style={styles.rideService}>{ride._type === 'order' ? 'Store Order' : ride._type === 'delivery' ? 'Pasugo Delivery' : 'Pasundo Ride'}</Text>
                  <Text style={styles.rideDate}>{formatDate(ride.created_at)}</Text>
                </View>
                <Text style={styles.rideFare}>₱{(ride.estimated_fare || 0).toFixed(0)}</Text>
              </View>

              <View style={styles.rideBody}>
                <View style={styles.locationRow}>
                  <View style={styles.locationDot} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {ride.pickup || ride.pickup_location || 'Pickup'}
                  </Text>
                </View>
                <View style={styles.locationConnector} />
                <View style={styles.locationRow}>
                  <View style={[styles.locationDot, styles.locationDotDropoff]} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {ride.dropoff || ride.dropoff_location || 'Dropoff'}
                  </Text>
                </View>
              </View>

              <View style={styles.rideFooter}>
                {!!(ride.driver || ride.Driver) && (
                  <View style={styles.riderInfo}>
                    <Ionicons name="person-circle-outline" size={16} color="#6B7280" />
                    <Text style={styles.riderName}>{(ride.driver || ride.Driver)?.name}</Text>
                    {!!((ride.driver || ride.Driver)?.rating) && (
                      <>
                        <Ionicons name="star" size={12} color="#FBBF24" />
                        <Text style={styles.riderRating}>{Number((ride.driver || ride.Driver)?.rating).toFixed(1)}</Text>
                      </>
                    )}
                  </View>
                )}
                <View style={styles.rideMetrics}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ride.status) }]}>
                    <Text style={styles.statusText}>{ride.status}</Text>
                  </View>
                  {(ride.distance_km || ride.distance || 0) > 0 && (
                    <Text style={styles.rideMetric}>{(ride.distance_km || ride.distance || 0).toFixed(1)} km</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}

          {filteredRides.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>No rides found</Text>
              <Text style={styles.emptySubtext}>
                {filterType === 'all'
                  ? 'Start booking rides to see your history'
                  : `No ${filterType} rides yet`}
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: verticalScale(90) }} />
      </ScrollView>
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
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: verticalScale(16),
  },
  statCard: {
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
  statValue: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: verticalScale(6),
    marginBottom: verticalScale(3),
  },
  statLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    textAlign: 'center',
  },
  filtersContainer: {
    marginBottom: verticalScale(12),
  },
  filtersContent: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  filterChip: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: moderateScale(8),
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    backgroundColor: '#F3F4F6',
    marginRight: moderateScale(8),
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
  },
  filterText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  historySection: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  rideCard: {
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  rideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(10),
  },
  rideIcon: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideHeaderInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  rideService: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(2),
  },
  rideDate: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
  },
  rideFare: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  rideBody: {
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
  rideFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  riderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  riderName: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    marginLeft: moderateScale(6),
    marginRight: moderateScale(8),
  },
  riderRating: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: moderateScale(4),
  },
  rideMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
  },
  rideMetric: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(3),
    borderRadius: moderateScale(6),
  },
  statusText: {
    fontSize: fontScale(11),
    fontWeight: '600',
    color: '#ffffff',
    textTransform: 'capitalize',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(50),
  },
  emptyText: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#6B7280',
    marginTop: verticalScale(12),
  },
  emptySubtext: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#9CA3AF',
    marginTop: verticalScale(6),
    textAlign: 'center',
  },
});
