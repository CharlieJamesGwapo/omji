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
      const [ridesRes, deliveriesRes, ordersRes] = await Promise.allSettled([
        rideService.getActiveRides(),
        deliveryService.getActiveDeliveries(),
        orderService.getActiveOrders(),
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
              icon: 'bicycle',
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
              from: order.store_name || 'Store',
              to: order.delivery_address || '',
              fare: order.total_amount || 0,
              createdAt: order.created_at || '',
              icon: 'storefront',
              color: '#EF4444',
            });
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
          <Text style={styles.statusText}>{order.status.replace('_', ' ')}</Text>
        </View>
      </View>

      <View style={styles.orderBody}>
        {order.from && (
          <View style={styles.orderRow}>
            <Ionicons name="location-outline" size={16} color="#6B7280" />
            <Text style={styles.orderText} numberOfLines={1}>
              {order.from}
            </Text>
          </View>
        )}
        {order.to && (
          <View style={styles.orderRow}>
            <Ionicons name="flag-outline" size={16} color="#6B7280" />
            <Text style={styles.orderText} numberOfLines={1}>
              {order.to}
            </Text>
          </View>
        )}

        {order.driverName && (
          <View style={styles.riderInfo}>
            <Ionicons name="person-circle-outline" size={20} color="#3B82F6" />
            <Text style={styles.riderName}>{order.driverName}</Text>
            {order.driverRating && (
              <>
                <Ionicons name="star" size={14} color="#FBBF24" />
                <Text style={styles.riderRating}>{order.driverRating.toFixed(1)}</Text>
              </>
            )}
          </View>
        )}
      </View>

      <View style={styles.orderFooter}>
        <View style={styles.fareContainer}>
          <Text style={styles.fareLabel}>Total Fare</Text>
          <Text style={styles.fareValue}>₱{order.fare?.toFixed(0) || '0'}</Text>
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
        {currentOrders && currentOrders.length > 0 ? (
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#EFF6FF',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#3B82F6',
  },
  tabBadge: {
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    paddingHorizontal: 6,
  },
  tabBadgeActive: {
    backgroundColor: '#3B82F6',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  tabBadgeTextActive: {
    color: '#ffffff',
  },
  scrollContent: {
    padding: 20,
  },
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
    marginBottom: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderHeaderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  orderTime: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    textTransform: 'capitalize',
  },
  orderBody: {
    paddingVertical: 8,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  orderText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
  },
  riderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  riderName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 8,
    flex: 1,
  },
  riderRating: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 4,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  fareContainer: {
    flex: 1,
  },
  fareLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  fareValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  trackButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
    marginRight: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
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
