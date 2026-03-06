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

export default function OrdersScreen({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ongoing');
  const [orders, setOrders] = useState<OrderItem[]>([]);

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
              fare: ride.estimated_fare || 0,
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
                fare: ride.estimated_fare || ride.final_fare || 0, createdAt: ride.created_at || '',
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

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  const ongoingStatuses = ['pending', 'accepted', 'driver_arrived', 'in_progress', 'preparing', 'picked_up'];
  const completedStatuses = ['completed', 'delivered'];
  const cancelledStatuses = ['cancelled'];

  const ongoingOrders = orders.filter((o) => ongoingStatuses.includes(o.status));
  const completedOrders = orders.filter((o) => completedStatuses.includes(o.status));
  const cancelledOrders = orders.filter((o) => cancelledStatuses.includes(o.status));

  const getStatusColor = (status: string) => {
    if (ongoingStatuses.includes(status)) return '#F59E0B';
    if (completedStatuses.includes(status)) return '#10B981';
    if (cancelledStatuses.includes(status)) return '#EF4444';
    return '#6B7280';
  };

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

  const renderOrderCard = (order: OrderItem) => (
    <TouchableOpacity
      key={`${order.type}-${order.id}`}
      style={styles.orderCard}
      onPress={() => {
        if (order.type === 'ride' || order.type === 'delivery') {
          navigation.navigate('Tracking', {
            type: order.type === 'delivery' ? 'delivery' : 'ride',
            rideId: order.id,
            pickup: order.from,
            dropoff: order.to,
            fare: order.fare,
          });
        }
      }}
    >
      <View style={styles.orderHeader}>
        <View style={[styles.iconContainer, { backgroundColor: `${order.color}20` }]}>
          <Ionicons name={order.icon as any} size={24} color={order.color} />
        </View>
        <View style={styles.orderHeaderInfo}>
          <Text style={styles.serviceName}>{order.service}</Text>
          <Text style={styles.orderTime}>{formatDate(order.createdAt)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
          <Text style={styles.statusText}>{order.status.replace(/_/g, ' ')}</Text>
        </View>
      </View>

      <View style={styles.orderBody}>
        {!!order.from && (
          <View style={styles.orderRow}>
            <Ionicons name="location-outline" size={16} color="#6B7280" />
            <Text style={styles.orderText} numberOfLines={1}>
              {order.from}
            </Text>
          </View>
        )}
        {!!order.to && (
          <View style={styles.orderRow}>
            <Ionicons name="flag-outline" size={16} color="#6B7280" />
            <Text style={styles.orderText} numberOfLines={1}>
              {order.to}
            </Text>
          </View>
        )}

        {!!order.driverName && (
          <View style={styles.riderInfo}>
            <Ionicons name="person-circle-outline" size={20} color="#3B82F6" />
            <Text style={styles.riderName}>{order.driverName}</Text>
            {!!order.driverRating && (
              <>
                <Ionicons name="star" size={14} color="#FBBF24" />
                <Text style={styles.riderRating}>{Number(order.driverRating).toFixed(1)}</Text>
              </>
            )}
          </View>
        )}
      </View>

      <View style={styles.orderFooter}>
        <View style={styles.fareContainer}>
          <Text style={styles.fareLabel}>Total Fare</Text>
          <Text style={styles.fareValue}>₱{(order.fare || 0).toFixed(0)}</Text>
        </View>
        {activeTab === 'ongoing' && (order.type === 'ride' || order.type === 'delivery') && (
          <TouchableOpacity
            style={styles.trackButton}
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
            <Text style={styles.trackButtonText}>Track</Text>
            <Ionicons name="chevron-forward" size={16} color="#3B82F6" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  const tabs = [
    { id: 'ongoing', name: 'Ongoing', count: ongoingOrders?.length || 0 },
    { id: 'completed', name: 'Completed', count: completedOrders?.length || 0 },
    { id: 'cancelled', name: 'Cancelled', count: cancelledOrders?.length || 0 },
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
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Orders</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh-outline" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.name}
            </Text>
            {tab.count > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.id && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab.id && styles.tabBadgeTextActive]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Orders List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {Array.isArray(currentOrders) && currentOrders.length > 0 ? (
          currentOrders.map(renderOrderCard)
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No {activeTab} orders</Text>
            <Text style={styles.emptySubtext}>
              {activeTab === 'ongoing'
                ? 'Book a service to get started'
                : `You don't have any ${activeTab} orders yet`}
            </Text>
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
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(16),
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.title,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingBottom: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(8),
    paddingHorizontal: moderateScale(16),
    marginRight: moderateScale(8),
    borderRadius: RESPONSIVE.borderRadius.small,
  },
  tabActive: {
    backgroundColor: '#EFF6FF',
  },
  tabText: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#3B82F6',
  },
  tabBadge: {
    backgroundColor: '#E5E7EB',
    borderRadius: moderateScale(10),
    minWidth: moderateScale(20),
    height: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: moderateScale(6),
    paddingHorizontal: moderateScale(6),
  },
  tabBadgeActive: {
    backgroundColor: '#3B82F6',
  },
  tabBadgeText: {
    fontSize: fontScale(11),
    fontWeight: 'bold',
    color: '#6B7280',
  },
  tabBadgeTextActive: {
    color: '#ffffff',
  },
  scrollContent: {
    padding: RESPONSIVE.paddingHorizontal,
  },
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginBottom: verticalScale(16),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  iconContainer: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderHeaderInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  serviceName: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  orderTime: {
    fontSize: fontScale(13),
    color: '#6B7280',
    marginTop: verticalScale(2),
  },
  statusBadge: {
    paddingHorizontal: moderateScale(10),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(6),
  },
  statusText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: '#ffffff',
    textTransform: 'capitalize',
  },
  orderBody: {
    paddingVertical: verticalScale(8),
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(6),
  },
  orderText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#374151',
    marginLeft: moderateScale(8),
    flex: 1,
  },
  riderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: moderateScale(10),
    borderRadius: RESPONSIVE.borderRadius.small,
    marginTop: verticalScale(8),
  },
  riderName: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: moderateScale(8),
    flex: 1,
  },
  riderRating: {
    fontSize: fontScale(13),
    fontWeight: '600',
    color: '#92400E',
    marginLeft: moderateScale(4),
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: verticalScale(12),
    paddingTop: verticalScale(12),
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  fareContainer: {
    flex: 1,
  },
  fareLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    marginBottom: verticalScale(2),
  },
  fareValue: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: moderateScale(16),
    paddingVertical: verticalScale(8),
    borderRadius: RESPONSIVE.borderRadius.small,
  },
  trackButtonText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#3B82F6',
    marginRight: moderateScale(4),
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(80),
  },
  emptyText: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#6B7280',
    marginTop: verticalScale(16),
  },
  emptySubtext: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#9CA3AF',
    marginTop: verticalScale(8),
    textAlign: 'center',
  },
});
