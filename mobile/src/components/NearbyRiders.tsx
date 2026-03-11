import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { rideService } from '../services/api';
import { RESPONSIVE, fontScale, verticalScale, moderateScale } from '../utils/responsive';

interface NearbyDriver {
  id: number;
  user_id: number;
  name: string;
  phone: string;
  profile_image: string;
  vehicle_type: string;
  vehicle_model: string;
  vehicle_plate: string;
  rating: number;
  total_ratings: number;
  completed_rides: number;
  distance: number;
  eta: string;
}

interface Props {
  pickupLatitude: number;
  pickupLongitude: number;
  vehicleType?: string;
  accentColor?: string;
  selectedDriverId: number | null;
  onSelectDriver: (driver: NearbyDriver | null) => void;
}

export default function NearbyRiders({
  pickupLatitude,
  pickupLongitude,
  vehicleType,
  accentColor = '#3B82F6',
  selectedDriverId,
  onSelectDriver,
}: Props) {
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchNearbyDrivers = useCallback(async () => {
    if (!pickupLatitude || !pickupLongitude) return;
    setLoading(true);
    setError('');
    try {
      const res = await rideService.getNearbyDrivers({
        latitude: pickupLatitude,
        longitude: pickupLongitude,
        vehicle_type: vehicleType,
        max_distance: 15,
      });
      const data = res.data?.data || [];
      setDrivers(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not find nearby riders');
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, [pickupLatitude, pickupLongitude, vehicleType]);

  useEffect(() => {
    fetchNearbyDrivers();
  }, [fetchNearbyDrivers]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!pickupLatitude || !pickupLongitude) return;
    const interval = setInterval(fetchNearbyDrivers, 15000);
    return () => clearInterval(interval);
  }, [fetchNearbyDrivers, pickupLatitude, pickupLongitude]);

  const getAvatarUri = (driver: NearbyDriver) => {
    if (driver.profile_image) return driver.profile_image;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(driver.name || 'R')}&background=3B82F6&color=fff&size=100`;
  };

  const getVehicleIcon = (type: string) => {
    if (type === 'car') return 'car';
    if (type === 'van') return 'bus';
    return 'bicycle';
  };

  const renderDriver = ({ item }: { item: NearbyDriver }) => {
    const isSelected = selectedDriverId === item.id;
    return (
      <TouchableOpacity
        style={[
          styles.driverCard,
          isSelected && { borderColor: accentColor, borderWidth: 2, backgroundColor: `${accentColor}08` },
        ]}
        onPress={() => onSelectDriver(isSelected ? null : item)}
        activeOpacity={0.7}
      >
        <View style={styles.driverRow}>
          <Image source={{ uri: getAvatarUri(item) }} style={styles.avatar} />
          <View style={styles.driverInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.driverName} numberOfLines={1}>{item.name || 'Rider'}</Text>
              {isSelected && (
                <View style={[styles.selectedBadge, { backgroundColor: accentColor }]}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
              )}
            </View>
            <View style={styles.detailsRow}>
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={styles.ratingText}>{item.rating?.toFixed(1) || '5.0'}</Text>
              </View>
              <Text style={styles.dotSep}>·</Text>
              <Text style={styles.ridesText}>{item.completed_rides} rides</Text>
            </View>
            <View style={styles.vehicleRow}>
              <Ionicons name={getVehicleIcon(item.vehicle_type) as any} size={14} color="#6B7280" />
              <Text style={styles.vehicleText} numberOfLines={1}>
                {item.vehicle_model || item.vehicle_type} · {item.vehicle_plate}
              </Text>
            </View>
          </View>
          <View style={styles.distanceCol}>
            <View style={[styles.etaBadge, { backgroundColor: `${accentColor}15` }]}>
              <Text style={[styles.etaText, { color: accentColor }]}>{item.eta}</Text>
            </View>
            <Text style={styles.distanceText}>{item.distance.toFixed(1)} km</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!pickupLatitude || !pickupLongitude) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="navigate-circle" size={20} color={accentColor} />
          <Text style={styles.headerTitle}>Nearby Riders</Text>
        </View>
        <TouchableOpacity onPress={fetchNearbyDrivers} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={16} color={accentColor} />
        </TouchableOpacity>
      </View>

      {loading && drivers.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={accentColor} />
          <Text style={styles.loadingText}>Finding nearby riders...</Text>
        </View>
      ) : error && drivers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={32} color="#D1D5DB" />
          <Text style={styles.emptyText}>No riders available nearby</Text>
          <Text style={styles.emptySubtext}>Your booking will be visible to all riders</Text>
        </View>
      ) : drivers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={32} color="#D1D5DB" />
          <Text style={styles.emptyText}>No riders online right now</Text>
          <Text style={styles.emptySubtext}>You can still book - riders will see your request</Text>
        </View>
      ) : (
        <>
          <Text style={styles.countText}>
            {drivers.length} rider{drivers.length !== 1 ? 's' : ''} nearby
            {selectedDriverId ? ' · 1 selected' : ' · Tap to select'}
          </Text>
          <FlatList
            data={drivers}
            renderItem={renderDriver}
            keyExtractor={(item) => String(item.id)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(12),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(6),
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: '#374151',
  },
  refreshBtn: {
    padding: moderateScale(6),
  },
  countText: {
    fontSize: fontScale(12),
    color: '#6B7280',
    marginBottom: verticalScale(8),
  },
  listContent: {
    paddingRight: moderateScale(8),
  },
  driverCard: {
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(12),
    marginRight: moderateScale(10),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: moderateScale(240),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    backgroundColor: '#E5E7EB',
  },
  driverInfo: {
    flex: 1,
    marginLeft: moderateScale(10),
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(6),
  },
  driverName: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  selectedBadge: {
    width: moderateScale(20),
    height: moderateScale(20),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(3),
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(2),
  },
  ratingText: {
    fontSize: fontScale(12),
    fontWeight: '600',
    color: '#374151',
  },
  dotSep: {
    fontSize: fontScale(12),
    color: '#9CA3AF',
    marginHorizontal: moderateScale(4),
  },
  ridesText: {
    fontSize: fontScale(12),
    color: '#6B7280',
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(4),
    marginTop: verticalScale(3),
  },
  vehicleText: {
    fontSize: fontScale(11),
    color: '#6B7280',
    flex: 1,
  },
  distanceCol: {
    alignItems: 'center',
    marginLeft: moderateScale(8),
  },
  etaBadge: {
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(4),
    borderRadius: moderateScale(8),
    marginBottom: verticalScale(4),
  },
  etaText: {
    fontSize: fontScale(12),
    fontWeight: '700',
  },
  distanceText: {
    fontSize: fontScale(11),
    color: '#9CA3AF',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: moderateScale(16),
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    gap: moderateScale(8),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  loadingText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: moderateScale(20),
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: verticalScale(8),
  },
  emptySubtext: {
    fontSize: fontScale(12),
    color: '#9CA3AF',
    marginTop: verticalScale(4),
  },
});
