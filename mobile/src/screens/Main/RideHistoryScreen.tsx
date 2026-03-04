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
import { rideService } from '../../services/api';

interface RideItem {
  id: number;
  pickup_location: string;
  dropoff_location: string;
  status: string;
  vehicle_type: string;
  estimated_fare: number;
  distance: number;
  created_at: string;
  driver?: { name: string; rating: number };
}

export default function RideHistoryScreen({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rides, setRides] = useState<RideItem[]>([]);
  const [filterType, setFilterType] = useState('all');

  const fetchRides = useCallback(async () => {
    try {
      const response = await rideService.getActiveRides();
      const data = response.data.data;
      setRides(Array.isArray(data) ? data : []);
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
      case 'motorcycle': return 'bicycle';
      case 'car': return 'car';
      default: return 'bicycle';
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
              key={ride.id}
              style={styles.rideCard}
              onPress={() =>
                navigation.navigate('Tracking', {
                  rideId: ride.id,
                  pickup: ride.pickup_location,
                  dropoff: ride.dropoff_location,
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
                  <Text style={styles.rideService}>Pasundo Ride</Text>
                  <Text style={styles.rideDate}>{formatDate(ride.created_at)}</Text>
                </View>
                <Text style={styles.rideFare}>₱{ride.estimated_fare?.toFixed(0) || '0'}</Text>
              </View>

              <View style={styles.rideBody}>
                <View style={styles.locationRow}>
                  <View style={styles.locationDot} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {ride.pickup_location}
                  </Text>
                </View>
                <View style={styles.locationConnector} />
                <View style={styles.locationRow}>
                  <View style={[styles.locationDot, styles.locationDotDropoff]} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {ride.dropoff_location}
                  </Text>
                </View>
              </View>

              <View style={styles.rideFooter}>
                {ride.driver && (
                  <View style={styles.riderInfo}>
                    <Ionicons name="person-circle-outline" size={16} color="#6B7280" />
                    <Text style={styles.riderName}>{ride.driver.name}</Text>
                    <Ionicons name="star" size={12} color="#FBBF24" />
                    <Text style={styles.riderRating}>{ride.driver.rating?.toFixed(1)}</Text>
                  </View>
                )}
                <View style={styles.rideMetrics}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ride.status) }]}>
                    <Text style={styles.statusText}>{ride.status}</Text>
                  </View>
                  {ride.distance > 0 && (
                    <Text style={styles.rideMetric}>{ride.distance.toFixed(1)} km</Text>
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

        <View style={{ height: 100 }} />
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  filtersContainer: {
    marginBottom: 16,
  },
  filtersContent: {
    paddingHorizontal: 20,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  historySection: {
    paddingHorizontal: 20,
  },
  rideCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  rideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rideIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideHeaderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  rideService: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 2,
  },
  rideDate: {
    fontSize: 13,
    color: '#6B7280',
  },
  rideFare: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  rideBody: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  locationDotDropoff: {
    backgroundColor: '#EF4444',
  },
  locationConnector: {
    width: 2,
    height: 16,
    backgroundColor: '#D1D5DB',
    marginLeft: 4,
    marginVertical: 4,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    marginLeft: 12,
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
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 6,
    marginRight: 8,
  },
  riderRating: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 4,
  },
  rideMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rideMetric: {
    fontSize: 12,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
    textTransform: 'capitalize',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
});
