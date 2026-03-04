import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { driverService } from '../../services/api';

interface DriverRequest {
  id: number;
  type: string;
  pickup_location: string;
  dropoff_location: string;
  distance: number;
  estimated_fare: number;
  vehicle_type: string;
  status: string;
  user?: { name: string };
}

export default function RiderDashboardScreen({ navigation }: any) {
  const [isOnline, setIsOnline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState<any>({ daily_earnings: 0, total_earnings: 0, total_rides: 0 });
  const [requests, setRequests] = useState<DriverRequest[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [earningsRes, requestsRes] = await Promise.allSettled([
        driverService.getEarnings(),
        driverService.getRequests(),
      ]);

      if (earningsRes.status === 'fulfilled') {
        setEarnings(earningsRes.value.data.data || {});
      }

      if (requestsRes.status === 'fulfilled') {
        const data = requestsRes.value.data.data;
        setRequests(Array.isArray(data) ? data : []);
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
                await driverService.setAvailability({ available: true, latitude: 8.4343, longitude: 124.5000 });
                setIsOnline(true);
                fetchData();
              } catch (error: any) {
                const msg = error.response?.data?.error || 'Failed to go online';
                Alert.alert('Error', msg);
              }
            },
          },
        ]
      );
    } else {
      try {
        await driverService.setAvailability({ available: false });
        setIsOnline(false);
      } catch (error) {
        console.error('Failed to go offline:', error);
      }
    }
  };

  const handleAcceptJob = (request: DriverRequest) => {
    Alert.alert(
      'Accept Ride',
      `Accept ride for ₱${request.estimated_fare?.toFixed(0)}?\n\nPickup: ${request.pickup_location}\nDropoff: ${request.dropoff_location}`,
      [
        { text: 'Decline', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              await driverService.acceptRequest(request.id);
              Alert.alert('Success', 'Ride accepted! Navigate to pickup location.');
              fetchData();
            } catch (error: any) {
              const msg = error.response?.data?.error || 'Failed to accept ride';
              Alert.alert('Error', msg);
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

  const getJobIcon = (vehicleType: string) => {
    switch (vehicleType) {
      case 'motorcycle': return 'bicycle';
      case 'car': return 'car';
      default: return 'bicycle';
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

        {/* Today's Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="cash" size={24} color="#10B981" />
              </View>
              <Text style={styles.statValue}>₱{earnings.daily_earnings || 0}</Text>
              <Text style={styles.statLabel}>Today</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="wallet" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.statValue}>₱{earnings.total_earnings || 0}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="bicycle" size={24} color="#F59E0B" />
              </View>
              <Text style={styles.statValue}>{earnings.total_rides || 0}</Text>
              <Text style={styles.statLabel}>Rides</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="star" size={24} color="#FBBF24" />
              </View>
              <Text style={styles.statValue}>{earnings.rating?.toFixed(1) || '5.0'}</Text>
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
          <TouchableOpacity style={styles.quickActionButton}>
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
                        { backgroundColor: '#10B98120' },
                      ]}
                    >
                      <Ionicons
                        name={getJobIcon(request.vehicle_type) as any}
                        size={24}
                        color="#10B981"
                      />
                    </View>
                    <View style={styles.jobHeaderInfo}>
                      <Text style={styles.jobService}>
                        {request.vehicle_type === 'motorcycle' ? 'Motorcycle' : 'Car'} Ride
                      </Text>
                      <View style={styles.jobMetrics}>
                        <Text style={styles.jobMetric}>
                          {request.distance?.toFixed(1) || '0'} km
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.jobFare}>
                      ₱{request.estimated_fare?.toFixed(0) || '0'}
                    </Text>
                  </View>

                  <View style={styles.jobBody}>
                    <View style={styles.locationRow}>
                      <View style={styles.locationDot} />
                      <Text style={styles.locationText} numberOfLines={1}>
                        {request.pickup_location}
                      </Text>
                    </View>
                    <View style={styles.locationConnector} />
                    <View style={styles.locationRow}>
                      <View
                        style={[styles.locationDot, styles.locationDotDropoff]}
                      />
                      <Text style={styles.locationText} numberOfLines={1}>
                        {request.dropoff_location}
                      </Text>
                    </View>
                  </View>

                  {request.user?.name && (
                    <View style={styles.passengersInfo}>
                      <Ionicons name="person" size={16} color="#6B7280" />
                      <Text style={styles.passengersText}>
                        {request.user.name}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => handleAcceptJob(request)}
                  >
                    <Text style={styles.acceptButtonText}>Accept Ride</Text>
                    <Ionicons name="arrow-forward" size={20} color="#ffffff" />
                  </TouchableOpacity>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  toggleCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    padding: 16,
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
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 2,
  },
  toggleSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  availableBadge: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 8,
  },
  availableBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    margin: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 20,
  },
  quickActionButton: {
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
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
  },
  jobCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
    marginBottom: 12,
  },
  jobIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobHeaderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  jobService: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  jobMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobMetric: {
    fontSize: 13,
    color: '#6B7280',
  },
  jobFare: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10B981',
  },
  jobBody: {
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
  passengersInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  passengersText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
  },
  acceptButton: {
    flexDirection: 'row',
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  emptyJobs: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  emptyJobsText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
  },
  offlineCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginTop: 40,
    borderRadius: 16,
    padding: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  offlineTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  offlineText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  goOnlineButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  goOnlineButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
