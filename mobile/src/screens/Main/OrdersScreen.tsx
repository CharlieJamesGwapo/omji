import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { rideService, deliveryService, orderService } from '../../services/api';
import { COLORS, STATUS_CONFIG, formatStatus, getStatusColor, getStatusBg, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

interface OrderItem {
  id: number;
  type: 'ride' | 'delivery' | 'order';
  service: string;
  status: string;
  from: string;
  to: string;
  fare: number;
  createdAt: string;
  driverName?: string;
  driverRating?: number;
  icon: string;
  color: string;
}

const SERVICE_BADGE: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  ride: { label: 'Pasundo', color: COLORS.pasundo, bg: COLORS.pasundoBg, icon: 'car-sport' },
  delivery: { label: 'Pasugo', color: COLORS.pasugo, bg: COLORS.pasugoBg, icon: 'cube' },
  order: { label: 'Store Order', color: COLORS.store, bg: COLORS.storeBg, icon: 'storefront' },
};

const EMPTY_STATES: Record<string, { icon: string; title: string; subtitle: string }> = {
  ongoing: {
    icon: 'rocket-outline',
    title: 'No active orders',
    subtitle: 'Book a ride, delivery, or order food to get started!',
  },
  completed: {
    icon: 'checkmark-done-circle-outline',
    title: 'No completed orders yet',
    subtitle: 'Your completed rides, deliveries, and orders will appear here.',
  },
  cancelled: {
    icon: 'ban-outline',
    title: 'No cancelled orders',
    subtitle: 'Great news! You have no cancelled orders.',
  },
};

export default function OrdersScreen({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ongoing');
  const [orders, setOrders] = useState<OrderItem[]>([]);

  const lastFetchRef = useRef<number>(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Subtle pulse animation for ongoing status indicators
  useEffect(() => {
    if (activeTab === 'ongoing') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [activeTab, pulseAnim]);

  const fetchOrders = useCallback(async () => {
    try {
      const [ridesRes, deliveriesRes, ordersRes, ridesHistRes, deliveriesHistRes, ordersHistRes] = await Promise.allSettled([
        rideService.getActiveRides(),
        deliveryService.getActiveDeliveries(),
        orderService.getActiveOrders(),
        rideService.getRideHistory(),
        deliveryService.getDeliveryHistory(),
        orderService.getOrderHistory(),
      ]);

      const allOrders: OrderItem[] = [];

      if (ridesRes.status === 'fulfilled') {
        const ridesData = ridesRes.value?.data?.data;
        if (Array.isArray(ridesData)) {
          ridesData.forEach((ride: any) => {
            allOrders.push({
              id: ride.id,
              type: 'ride',
              service: 'Pasundo',
              status: ride.status,
              from: ride.pickup_location || ride.pickup || '',
              to: ride.dropoff_location || ride.dropoff || '',
              fare: ride.final_fare || ride.estimated_fare || 0,
              createdAt: ride.created_at || '',
              driverName: ride.driver?.name || ride.Driver?.name,
              driverRating: ride.driver?.rating || ride.Driver?.rating,
              icon: 'navigate-circle',
              color: '#10B981',
            });
          });
        }
      }

      if (deliveriesRes.status === 'fulfilled') {
        const deliveriesData = deliveriesRes.value?.data?.data;
        if (Array.isArray(deliveriesData)) {
          deliveriesData.forEach((delivery: any) => {
            allOrders.push({
              id: delivery.id,
              type: 'delivery',
              service: 'Pasugo',
              status: delivery.status,
              from: delivery.pickup_location || '',
              to: delivery.dropoff_location || '',
              fare: delivery.delivery_fee || delivery.estimated_fare || delivery.fare || 0,
              createdAt: delivery.created_at || '',
              driverName: delivery.driver?.name || delivery.Driver?.name,
              driverRating: delivery.driver?.rating || delivery.Driver?.rating,
              icon: 'cube',
              color: '#3B82F6',
            });
          });
        }
      }

      if (ordersRes.status === 'fulfilled') {
        const ordersData = ordersRes.value?.data?.data;
        if (Array.isArray(ordersData)) {
          ordersData.forEach((order: any) => {
            allOrders.push({
              id: order.id,
              type: 'order',
              service: 'Store Order',
              status: order.status,
              from: order.Store?.name || order.store_name || 'Store',
              to: order.delivery_location || order.delivery_address || '',
              fare: order.total_amount || 0,
              createdAt: order.created_at || '',
              icon: 'storefront',
              color: '#EF4444',
            });
          });
        }
      }

      // Add history data (completed/cancelled)
      const existingIds = new Set(allOrders.map(o => `${o.type}-${o.id}`));

      if (ridesHistRes.status === 'fulfilled') {
        const data = ridesHistRes.value?.data?.data;
        if (Array.isArray(data)) {
          data.forEach((ride: any) => {
            if (!existingIds.has(`ride-${ride.id}`)) {
              allOrders.push({
                id: ride.id, type: 'ride', service: 'Pasundo', status: ride.status,
                from: ride.pickup_location || ride.pickup || '', to: ride.dropoff_location || ride.dropoff || '',
                fare: ride.final_fare || ride.estimated_fare || 0, createdAt: ride.created_at || '',
                driverName: ride.driver?.name || ride.Driver?.name,
                driverRating: ride.driver?.rating || ride.Driver?.rating,
                icon: 'navigate-circle', color: '#10B981',
              });
            }
          });
        }
      }

      if (deliveriesHistRes.status === 'fulfilled') {
        const data = deliveriesHistRes.value?.data?.data;
        if (Array.isArray(data)) {
          data.forEach((d: any) => {
            if (!existingIds.has(`delivery-${d.id}`)) {
              allOrders.push({
                id: d.id, type: 'delivery', service: 'Pasugo', status: d.status,
                from: d.pickup_location || '', to: d.dropoff_location || '',
                fare: d.delivery_fee || d.estimated_fare || 0, createdAt: d.created_at || '',
                driverName: d.driver?.name || d.Driver?.name,
                driverRating: d.driver?.rating || d.Driver?.rating,
                icon: 'cube', color: '#3B82F6',
              });
            }
          });
        }
      }

      if (ordersHistRes.status === 'fulfilled') {
        const data = ordersHistRes.value?.data?.data;
        if (Array.isArray(data)) {
          data.forEach((o: any) => {
            if (!existingIds.has(`order-${o.id}`)) {
              allOrders.push({
                id: o.id, type: 'order', service: 'Store Order', status: o.status,
                from: o.Store?.name || o.store_name || 'Store',
                to: o.delivery_location || o.delivery_address || '',
                fare: o.total_amount || 0, createdAt: o.created_at || '',
                icon: 'storefront', color: '#EF4444',
              });
            }
          });
        }
      }

      // Sort by date descending
      allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(allOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch whenever this screen is focused, but debounce to avoid rapid re-fetches
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const now = Date.now();
      if (now - lastFetchRef.current > 3000) {
        lastFetchRef.current = now;
        fetchOrders();
      }
    });
    return unsubscribe;
  }, [navigation, fetchOrders]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchOrders();
    } finally {
      setRefreshing(false);
    }
  };

  const ongoingStatuses = ['pending', 'accepted', 'driver_arrived', 'in_progress', 'preparing', 'picked_up', 'confirmed', 'ready', 'out_for_delivery'];
  const completedStatuses = ['completed', 'delivered'];
  const cancelledStatuses = ['cancelled'];

  const ongoingOrders = orders.filter((o) => ongoingStatuses.includes(o.status));
  const completedOrders = orders.filter((o) => completedStatuses.includes(o.status));
  const cancelledOrders = orders.filter((o) => cancelledStatuses.includes(o.status));

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleCancelOrder = (orderId: number) => {
    Alert.alert('Cancel Order', 'Are you sure you want to cancel this order?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await orderService.cancelOrder(orderId);
            fetchOrders();
          } catch (error: any) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to cancel order');
          }
        },
      },
    ]);
  };

  const renderOrderCard = (order: OrderItem) => {
    const statusColor = getStatusColor(order.status);
    const statusBgColor = getStatusBg(order.status);
    const statusIcon = STATUS_CONFIG[order.status]?.icon || 'ellipse';
    const serviceBadge = SERVICE_BADGE[order.type];
    const isOngoing = ongoingStatuses.includes(order.status);

    return (
      <TouchableOpacity
        key={`${order.type}-${order.id}`}
        style={[styles.orderCard, { borderLeftColor: statusColor, borderLeftWidth: moderateScale(4) }]}
        activeOpacity={0.7}
        onPress={() => {
          if (order.type === 'ride' || order.type === 'delivery') {
            navigation.navigate('Tracking', {
              type: order.type === 'delivery' ? 'delivery' : 'ride',
              rideId: order.id,
              pickup: order.from,
              dropoff: order.to,
              fare: order.fare,
            });
          } else if (order.type === 'order') {
            const actions: any[] = [{ text: 'Close', style: 'cancel' }];
            if (isOngoing && order.status !== 'in_progress') {
              actions.push({
                text: 'Cancel Order',
                style: 'destructive',
                onPress: () => handleCancelOrder(order.id),
              });
            }
            Alert.alert(
              'Store Order',
              `Store: ${order.from}\nDelivery: ${order.to || 'N/A'}\nTotal: \u20B1${(order.fare || 0).toFixed(0)}\nStatus: ${formatStatus(order.status)}`,
              actions
            );
          }
        }}
      >
        {/* Card Header */}
        <View style={styles.orderHeader}>
          <View style={styles.headerLeft}>
            <View style={[styles.serviceBadge, { backgroundColor: serviceBadge.bg }]}>
              <Ionicons name={serviceBadge.icon as any} size={moderateScale(14)} color={serviceBadge.color} />
              <Text style={[styles.serviceBadgeText, { color: serviceBadge.color }]}>{serviceBadge.label}</Text>
            </View>
            <Text style={styles.orderTime}>{formatDate(order.createdAt)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusBgColor }]}>
            {isOngoing ? (
              <Animated.View style={{ opacity: pulseAnim }}>
                <Ionicons name={statusIcon as any} size={moderateScale(14)} color={statusColor} />
              </Animated.View>
            ) : (
              <Ionicons name={statusIcon as any} size={moderateScale(14)} color={statusColor} />
            )}
            <Text style={[styles.statusText, { color: statusColor }]}>{formatStatus(order.status)}</Text>
          </View>
        </View>

        {/* Locations */}
        <View style={styles.orderBody}>
          {!!order.from && (
            <View style={styles.locationRow}>
              <View style={styles.locationDotContainer}>
                <View style={[styles.locationDot, { backgroundColor: COLORS.success }]} />
                {!!order.to && <View style={styles.locationLine} />}
              </View>
              <View style={styles.locationTextContainer}>
                <Text style={styles.locationLabel}>
                  {order.type === 'order' ? 'Store' : 'Pickup'}
                </Text>
                <Text style={styles.locationText} numberOfLines={1}>{order.from}</Text>
              </View>
            </View>
          )}
          {!!order.to && (
            <View style={styles.locationRow}>
              <View style={styles.locationDotContainer}>
                <View style={[styles.locationDot, { backgroundColor: COLORS.primary }]} />
              </View>
              <View style={styles.locationTextContainer}>
                <Text style={styles.locationLabel}>
                  {order.type === 'order' ? 'Delivery' : 'Drop-off'}
                </Text>
                <Text style={styles.locationText} numberOfLines={1}>{order.to}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Driver Info */}
        {!!order.driverName && (
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Ionicons name="person" size={moderateScale(14)} color={COLORS.white} />
            </View>
            <Text style={styles.driverName}>{order.driverName}</Text>
            {!!order.driverRating && (
              <View style={styles.driverRatingContainer}>
                <Ionicons name="star" size={moderateScale(12)} color={COLORS.warningDark} />
                <Text style={styles.driverRating}>{Number(order.driverRating).toFixed(1)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Footer */}
        <View style={styles.orderFooter}>
          <View style={styles.fareContainer}>
            <Text style={styles.fareLabel}>
              {order.status === 'completed' || order.status === 'delivered' ? 'Total' : 'Est. Fare'}
            </Text>
            <Text style={styles.fareValue}>{'\u20B1'}{(order.fare || 0).toFixed(0)}</Text>
          </View>
          {activeTab === 'ongoing' && (order.type === 'ride' || order.type === 'delivery') && (
            <TouchableOpacity
              style={styles.trackButton}
              activeOpacity={0.8}
              onPress={() =>
                navigation.navigate('Tracking', {
                  type: order.type === 'delivery' ? 'delivery' : 'ride',
                  rideId: order.id,
                  pickup: order.from,
                  dropoff: order.to,
                  fare: order.fare,
                })
              }
            >
              <Ionicons name="navigate" size={moderateScale(16)} color={COLORS.white} />
              <Text style={styles.trackButtonText}>Track Live</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const tabs = [
    { id: 'ongoing', name: 'Ongoing', count: ongoingOrders?.length || 0, icon: 'radio-button-on' },
    { id: 'completed', name: 'Completed', count: completedOrders?.length || 0, icon: 'checkmark-circle' },
    { id: 'cancelled', name: 'Cancelled', count: cancelledOrders?.length || 0, icon: 'close-circle' },
  ];

  const getCurrentOrders = () => {
    switch (activeTab) {
      case 'ongoing': return ongoingOrders || [];
      case 'completed': return completedOrders || [];
      case 'cancelled': return cancelledOrders || [];
      default: return [];
    }
  };

  const currentOrders = getCurrentOrders();

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Orders</Text>
        </View>
        <View style={styles.tabsContainer}>
          {[1, 2, 3].map((i) => (
            <View key={`tab-skeleton-${i}`} style={[styles.tabPill, { backgroundColor: COLORS.gray100 }]}>
              <View style={{ width: moderateScale(60), height: verticalScale(14), borderRadius: moderateScale(4), backgroundColor: COLORS.gray200 }} />
            </View>
          ))}
        </View>
        <View style={{ padding: RESPONSIVE.paddingHorizontal }}>
          {[1, 2, 3].map((i) => (
            <View key={`skeleton-${i}`} style={[styles.orderCard, { borderLeftWidth: moderateScale(4), borderLeftColor: COLORS.gray200, opacity: 0.6 }]}>
              <View style={styles.orderHeader}>
                <View style={[styles.serviceBadge, { backgroundColor: COLORS.gray100, width: moderateScale(90) }]}>
                  <View style={{ width: moderateScale(60), height: verticalScale(12), borderRadius: moderateScale(4), backgroundColor: COLORS.gray200 }} />
                </View>
                <View style={{ backgroundColor: COLORS.gray100, height: verticalScale(24), width: moderateScale(80), borderRadius: moderateScale(12) }} />
              </View>
              <View style={styles.orderBody}>
                <View style={{ backgroundColor: COLORS.gray100, height: verticalScale(12), width: '80%', borderRadius: moderateScale(4), marginBottom: verticalScale(10) }} />
                <View style={{ backgroundColor: COLORS.gray100, height: verticalScale(12), width: '60%', borderRadius: moderateScale(4) }} />
              </View>
              <View style={[styles.orderFooter, { borderTopColor: COLORS.gray100 }]}>
                <View style={{ backgroundColor: COLORS.gray100, height: verticalScale(18), width: moderateScale(60), borderRadius: moderateScale(4) }} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Orders</Text>
          <Text style={styles.headerSubtitle}>{orders.length} total order{orders.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={moderateScale(20)} color={COLORS.gray600} />
        </TouchableOpacity>
      </View>

      {/* Pill Tabs */}
      <View style={styles.tabsContainer}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tabPill,
                isActive && styles.tabPillActive,
              ]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabPillText, isActive && styles.tabPillTextActive]}>
                {tab.name}
              </Text>
              {tab.count > 0 && (
                <View style={[styles.tabCountBadge, isActive && styles.tabCountBadgeActive]}>
                  <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Orders List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {Array.isArray(currentOrders) && currentOrders.length > 0 ? (
          currentOrders.map(renderOrderCard)
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons
                name={(EMPTY_STATES[activeTab]?.icon || 'receipt-outline') as any}
                size={moderateScale(48)}
                color={COLORS.gray300}
              />
            </View>
            <Text style={styles.emptyText}>{EMPTY_STATES[activeTab]?.title || 'No orders'}</Text>
            <Text style={styles.emptySubtext}>{EMPTY_STATES[activeTab]?.subtitle || ''}</Text>
          </View>
        )}

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(12),
    backgroundColor: COLORS.white,
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.title,
    fontWeight: '800',
    color: COLORS.gray900,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: fontScale(13),
    color: COLORS.gray400,
    marginTop: verticalScale(2),
  },
  refreshButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: COLORS.gray50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pill Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingBottom: verticalScale(14),
    borderBottomWidth: 0,
    gap: moderateScale(8),
    ...SHADOWS.sm,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(10),
    paddingHorizontal: moderateScale(12),
    borderRadius: moderateScale(24),
    backgroundColor: COLORS.gray100,
    gap: moderateScale(6),
  },
  tabPillActive: {
    backgroundColor: COLORS.gray900,
  },
  tabPillText: {
    fontSize: fontScale(13),
    fontWeight: '600',
    color: COLORS.gray500,
  },
  tabPillTextActive: {
    color: COLORS.white,
  },
  tabCountBadge: {
    backgroundColor: COLORS.gray300,
    borderRadius: moderateScale(10),
    minWidth: moderateScale(20),
    height: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: moderateScale(6),
  },
  tabCountBadgeActive: {
    backgroundColor: COLORS.white,
  },
  tabCountText: {
    fontSize: fontScale(11),
    fontWeight: '700',
    color: COLORS.gray600,
  },
  tabCountTextActive: {
    color: COLORS.gray900,
  },
  scrollContent: {
    padding: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(16),
  },
  // Order Card
  orderCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: COLORS.gray200,
    ...SHADOWS.md,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(12),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(10),
  },
  serviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(10),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(20),
    gap: moderateScale(5),
  },
  serviceBadgeText: {
    fontSize: fontScale(11),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  orderTime: {
    fontSize: fontScale(12),
    color: COLORS.gray400,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(10),
    paddingVertical: verticalScale(5),
    borderRadius: moderateScale(20),
    gap: moderateScale(5),
  },
  statusText: {
    fontSize: fontScale(12),
    fontWeight: '700',
  },
  // Location rows
  orderBody: {
    paddingBottom: verticalScale(4),
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: verticalScale(2),
  },
  locationDotContainer: {
    alignItems: 'center',
    width: moderateScale(20),
    paddingTop: verticalScale(6),
  },
  locationDot: {
    width: moderateScale(8),
    height: moderateScale(8),
    borderRadius: moderateScale(4),
  },
  locationLine: {
    width: moderateScale(1.5),
    height: verticalScale(20),
    backgroundColor: COLORS.gray300,
    marginTop: verticalScale(3),
  },
  locationTextContainer: {
    flex: 1,
    marginLeft: moderateScale(8),
    paddingBottom: verticalScale(6),
  },
  locationLabel: {
    fontSize: fontScale(10),
    fontWeight: '600',
    color: COLORS.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: verticalScale(1),
  },
  locationText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray800,
    fontWeight: '500',
  },
  // Driver row
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentBg,
    paddingHorizontal: moderateScale(12),
    paddingVertical: verticalScale(8),
    borderRadius: RESPONSIVE.borderRadius.small,
    marginBottom: verticalScale(10),
  },
  driverAvatar: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(14),
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.gray800,
    marginLeft: moderateScale(10),
    flex: 1,
  },
  driverRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(3),
  },
  driverRating: {
    fontSize: fontScale(13),
    fontWeight: '700',
    color: COLORS.warningDark,
  },
  // Footer
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: verticalScale(12),
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  fareContainer: {
    flex: 1,
  },
  fareLabel: {
    fontSize: fontScale(11),
    color: COLORS.gray400,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  fareValue: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: '800',
    color: COLORS.gray900,
    marginTop: verticalScale(1),
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: moderateScale(18),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(24),
    gap: moderateScale(6),
    ...SHADOWS.colored(COLORS.accent),
  },
  trackButtonText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.white,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(80),
  },
  emptyIconContainer: {
    width: moderateScale(100),
    height: moderateScale(100),
    borderRadius: moderateScale(50),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(20),
  },
  emptyText: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.gray600,
  },
  emptySubtext: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray400,
    marginTop: verticalScale(8),
    textAlign: 'center',
    paddingHorizontal: moderateScale(40),
    lineHeight: fontScale(20),
  },
});
