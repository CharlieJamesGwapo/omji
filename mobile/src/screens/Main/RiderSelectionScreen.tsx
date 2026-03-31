import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, moderateScale, fontScale, verticalScale } from '../../utils/responsive';
import { rideService } from '../../services/api';
import Toast, { ToastType } from '../../components/Toast';

interface NearbyDriver {
  id: number;
  name: string;
  rating: number;
  total_ratings: number;
  vehicle_type: string;
  vehicle_plate: string;
  distance: number;
  eta_minutes: number;
}

export default function RiderSelectionScreen({ navigation, route }: any) {
  const bookingData = route.params?.bookingData;
  if (!bookingData) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 16, color: '#6B7280' }}>Missing booking data</Text>
      </View>
    );
  }
  const insets = useSafeAreaInsets();
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const excludedIds = useRef<Set<number>>(new Set(route.params?.excludeDriverIds || []));
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await rideService.getNearbyDrivers({
        latitude: bookingData.pickup_latitude,
        longitude: bookingData.pickup_longitude,
        vehicle_type: bookingData.vehicle_type,
        max_distance: 15,
      });
      const data = res?.data?.data;
      if (Array.isArray(data)) {
        setDrivers(data.filter((d: NearbyDriver) => !excludedIds.current.has(d.id)));
      }
    } catch {
      showToast('Failed to load nearby riders', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingData]);

  useEffect(() => {
    fetchDrivers();
    refreshInterval.current = setInterval(fetchDrivers, 15000);
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, [fetchDrivers]);

  const handleSelectRider = async (driver: NearbyDriver) => {
    setSubmitting(true);
    try {
      const response = await rideService.createRide({
        ...bookingData,
        driver_id: driver.id,
      });
      const ride = response.data?.data;
      if (!ride?.id) {
        showToast('Failed to create ride. Try again.', 'error');
        setSubmitting(false);
        return;
      }
      navigation.replace('RiderWaiting', {
        rideId: ride.id,
        driverId: driver.id,
        driverName: driver.name,
        driverRating: driver.rating,
        driverVehicle: `${driver.vehicle_type} - ${driver.vehicle_plate}`,
        bookingData,
        excludeDriverIds: Array.from(excludedIds.current),
      });
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to send request. Try again.';
      showToast(msg, 'error');
      fetchDrivers(); // Refresh list — rider may no longer be available
    } finally {
      setSubmitting(false);
    }
  };

  const renderDriver = ({ item }: { item: NearbyDriver }) => (
    <TouchableOpacity
      style={styles.driverCard}
      onPress={() => handleSelectRider(item)}
      activeOpacity={0.7}
      disabled={submitting}
      accessibilityLabel={`Select rider ${item.name}, ${item.vehicle_type}, rating ${(item.rating || 0).toFixed(1)}`}
      accessibilityRole="button"
    >
      <View style={styles.driverLeft}>
        <View style={[styles.avatar, { backgroundColor: COLORS.accent }]}>
          <Text style={styles.avatarText}>{(item.name || 'R').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.driverInfo}>
          <Text style={styles.driverName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color="#F59E0B" />
            <Text style={styles.ratingText}>{(item.rating || 0).toFixed(1)}</Text>
            <Text style={styles.ratingCount}>({item.total_ratings || 0})</Text>
          </View>
          <Text style={styles.vehicleText}>{item.vehicle_type} - {item.vehicle_plate}</Text>
        </View>
      </View>
      <View style={styles.driverRight}>
        <Text style={styles.distanceText}>{item.distance.toFixed(1)} km</Text>
        <Text style={styles.etaText}>~{Math.max(1, Math.round(item.eta_minutes))} min</Text>
        <View style={styles.selectBadge}>
          <Text style={styles.selectText}>Select</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Select a Rider</Text>
          <Text style={styles.headerSub}>
            {drivers.length} rider{drivers.length !== 1 ? 's' : ''} nearby
          </Text>
        </View>
        <TouchableOpacity onPress={fetchDrivers} style={styles.refreshBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Refresh rider list" accessibilityRole="button">
          <Ionicons name="refresh" size={22} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      {/* Ride Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
          <Text style={styles.summaryText} numberOfLines={1}>{bookingData.pickup_location}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <View style={[styles.dot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.summaryText} numberOfLines={1}>{bookingData.dropoff_location}</Text>
        </View>
        <Text style={styles.fareText}>Estimated Fare: ₱{(bookingData.estimated_fare || 0).toFixed(0)}</Text>
      </View>

      {/* Driver List */}
      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Finding nearby riders...</Text>
        </View>
      ) : drivers.length === 0 ? (
        <View style={styles.centerWrap}>
          <Ionicons name="car-outline" size={64} color={COLORS.gray300} />
          <Text style={styles.emptyTitle}>No riders available nearby</Text>
          <Text style={styles.emptySubtitle}>Try again in a moment</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchDrivers} accessibilityLabel="Retry finding riders" accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={drivers}
          renderItem={renderDriver}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDrivers(); }} colors={[COLORS.accent]} tintColor={COLORS.accent} />
          }
        />
      )}

      {submitting && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.overlayText}>Sending request...</Text>
          </View>
        </View>
      )}
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast(p => ({ ...p, visible: false }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: verticalScale(12),
    backgroundColor: COLORS.white,
    ...SHADOWS.sm,
  },
  backBtn: { padding: 8 },
  headerCenter: { flex: 1, marginLeft: moderateScale(12) },
  headerTitle: { fontSize: fontScale(18), fontWeight: '700', color: COLORS.gray900 },
  headerSub: { fontSize: fontScale(12), color: COLORS.gray500, marginTop: 2 },
  refreshBtn: { padding: 8 },
  summaryCard: {
    margin: RESPONSIVE.paddingHorizontal, marginTop: verticalScale(12),
    backgroundColor: COLORS.white, borderRadius: moderateScale(14),
    padding: moderateScale(14), ...SHADOWS.sm,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(10) },
  dot: { width: 10, height: 10, borderRadius: 5 },
  summaryDivider: {
    width: 1, height: verticalScale(16), backgroundColor: COLORS.gray200,
    marginLeft: 4, marginVertical: 4,
  },
  summaryText: { flex: 1, fontSize: fontScale(13), color: COLORS.gray700 },
  fareText: {
    fontSize: fontScale(14), fontWeight: '700', color: COLORS.accent,
    marginTop: verticalScale(10), textAlign: 'right',
  },
  list: { padding: RESPONSIVE.paddingHorizontal, paddingBottom: verticalScale(20) },
  driverCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, borderRadius: moderateScale(14),
    padding: moderateScale(14), marginBottom: verticalScale(10), ...SHADOWS.sm,
  },
  driverLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: moderateScale(48), height: moderateScale(48),
    borderRadius: moderateScale(24), alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: fontScale(18), fontWeight: '700', color: COLORS.white },
  driverInfo: { marginLeft: moderateScale(12), flex: 1 },
  driverName: { fontSize: fontScale(15), fontWeight: '700', color: COLORS.gray900 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  ratingText: { fontSize: fontScale(13), fontWeight: '600', color: COLORS.gray800 },
  ratingCount: { fontSize: fontScale(11), color: COLORS.gray400 },
  vehicleText: { fontSize: fontScale(12), color: COLORS.gray500, marginTop: 2, textTransform: 'capitalize' },
  driverRight: { alignItems: 'flex-end', marginLeft: moderateScale(8) },
  distanceText: { fontSize: fontScale(13), fontWeight: '600', color: COLORS.gray700 },
  etaText: { fontSize: fontScale(11), color: COLORS.gray400, marginTop: 2 },
  selectBadge: {
    marginTop: verticalScale(6), backgroundColor: COLORS.accent,
    paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(8),
    borderRadius: moderateScale(10), minHeight: moderateScale(44),
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  selectText: { fontSize: fontScale(14), fontWeight: '700', color: COLORS.white },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingText: { fontSize: fontScale(14), color: COLORS.gray500, marginTop: verticalScale(12) },
  emptyTitle: { fontSize: fontScale(18), fontWeight: '700', color: COLORS.gray700, marginTop: verticalScale(16) },
  emptySubtitle: { fontSize: fontScale(14), color: COLORS.gray400, marginTop: 4 },
  retryBtn: {
    marginTop: verticalScale(16), backgroundColor: COLORS.accent,
    paddingHorizontal: moderateScale(28), paddingVertical: moderateScale(12),
    borderRadius: moderateScale(12),
  },
  retryText: { fontSize: fontScale(14), fontWeight: '700', color: COLORS.white },
  overlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  overlayCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    paddingHorizontal: moderateScale(24), paddingVertical: moderateScale(16),
    borderRadius: moderateScale(14), gap: moderateScale(12), ...SHADOWS.lg,
  },
  overlayText: { fontSize: fontScale(14), color: COLORS.gray700, fontWeight: '500' },
});
