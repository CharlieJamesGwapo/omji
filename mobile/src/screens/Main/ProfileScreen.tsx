import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { rideService, orderService, deliveryService } from '../../services/api';

export default function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({ rides: 0, rating: 0, spent: 0 });
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserStats();
  }, []);

  const fetchUserStats = async () => {
    try {
      setLoading(true);

      const [ridesRes, ordersRes, deliveriesRes] = await Promise.allSettled([
        rideService.getActiveRides(),
        orderService.getActiveOrders(),
        deliveryService.getActiveDeliveries(),
      ]);

      const rides = ridesRes.status === 'fulfilled' && Array.isArray(ridesRes.value?.data?.data)
        ? ridesRes.value.data.data : [];
      const orders = ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value?.data?.data)
        ? ordersRes.value.data.data : [];
      const deliveries = deliveriesRes.status === 'fulfilled' && Array.isArray(deliveriesRes.value?.data?.data)
        ? deliveriesRes.value.data.data : [];

      const totalRides = rides.length + deliveries.length;

      const ridesSpent = rides.reduce((sum: number, ride: any) => sum + (ride.final_fare || ride.estimated_fare || 0), 0);
      const ordersSpent = orders.reduce((sum: number, order: any) => sum + (order.total_amount || 0), 0);
      const deliveriesSpent = deliveries.reduce((sum: number, delivery: any) => sum + (delivery.delivery_fee || 0), 0);
      const totalSpent = ridesSpent + ordersSpent + deliveriesSpent;

      const rating = user?.rating || 5.0;

      setStats({
        rides: totalRides,
        rating: Number(rating.toFixed(1)),
        spent: totalSpent,
      });

      setWalletBalance(0);
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.warn('Could not fetch user stats:', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  const menuSections = [
    {
      title: 'Account',
      items: [
        { icon: 'person-outline', label: 'Edit Profile', screen: null, action: () => Alert.alert('Edit Profile', 'Coming soon!') },
        { icon: 'wallet-outline', label: 'Wallet', screen: 'Wallet' },
        { icon: 'location-outline', label: 'Saved Addresses', screen: null, action: () => Alert.alert('Saved Addresses', 'Coming soon!') },
        { icon: 'card-outline', label: 'Payment Methods', screen: null, action: () => Alert.alert('Payment Methods', 'Coming soon!') },
      ],
    },
    {
      title: 'Activity',
      items: [
        { icon: 'receipt-outline', label: 'Order History', screen: 'Orders' },
        { icon: 'time-outline', label: 'Ride History', screen: 'RideHistory' },
        { icon: 'heart-outline', label: 'Favorites', screen: null, action: () => Alert.alert('Favorites', 'Coming soon!') },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help-circle-outline', label: 'Help Center', screen: null, action: () => Alert.alert('Help Center', 'Coming soon!') },
        { icon: 'chatbubble-outline', label: 'Contact Support', screen: null, action: () => Alert.alert('Contact Support', 'Coming soon!') },
        { icon: 'document-text-outline', label: 'Terms & Privacy', screen: null, action: () => Alert.alert('Terms & Privacy', 'Coming soon!') },
        { icon: 'information-circle-outline', label: 'About OMJI', screen: null, action: () => Alert.alert('About OMJI', 'OMJI - Your ride-hailing and delivery app\nVersion 1.0.0') },
      ],
    },
    {
      title: 'Settings',
      items: [
        { icon: 'notifications-outline', label: 'Notifications', screen: null, action: () => Alert.alert('Notifications', 'Coming soon!') },
        { icon: 'language-outline', label: 'Language', screen: null, action: () => Alert.alert('Language', 'Coming soon!') },
        { icon: 'shield-outline', label: 'Privacy & Security', screen: null, action: () => Alert.alert('Privacy & Security', 'Coming soon!') },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity>
          <Ionicons name="settings-outline" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* User Info Card */}
        <View style={styles.userCard}>
          <View style={styles.avatarContainer}>
            <Image
              source={{
                uri: user?.profile_image || 'https://via.placeholder.com/100?text=User',
              }}
              style={styles.avatar}
            />
            <TouchableOpacity style={styles.editAvatarButton}>
              <Ionicons name="camera" size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name || 'Guest User'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'guest@example.com'}</Text>
            <Text style={styles.userPhone}>{user?.phone || '+63 912 345 6789'}</Text>
          </View>
          <View style={styles.statsContainer}>
            {loading ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.rides}</Text>
                  <Text style={styles.statLabel}>Rides</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.rating}</Text>
                  <Text style={styles.statLabel}>Rating</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>₱{stats.spent.toLocaleString()}</Text>
                  <Text style={styles.statLabel}>Spent</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Wallet Quick Access */}
        <TouchableOpacity
          style={styles.walletCard}
          onPress={() => navigation.navigate('Wallet')}
        >
          <View style={styles.walletIcon}>
            <Ionicons name="wallet" size={24} color="#3B82F6" />
          </View>
          <View style={styles.walletInfo}>
            <Text style={styles.walletLabel}>Wallet Balance</Text>
            <Text style={styles.walletBalance}>₱{walletBalance.toFixed(2)}</Text>
          </View>
          <TouchableOpacity style={styles.topUpButton}>
            <Text style={styles.topUpButtonText}>Top Up</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Menu Sections */}
        {menuSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.menuSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={itemIndex}
                  style={[
                    styles.menuItem,
                    itemIndex < section.items.length - 1 && styles.menuItemBorder,
                  ]}
                  onPress={() => item.screen ? navigation.navigate(item.screen) : item.action?.()}
                >
                  <Ionicons name={item.icon as any} size={22} color="#6B7280" />
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#EF4444" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.versionText}>Version 1.0.0</Text>

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
  userCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#E5E7EB',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  userPhone: {
    fontSize: 14,
    color: '#6B7280',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  walletIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletInfo: {
    flex: 1,
    marginLeft: 12,
  },
  walletLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  walletBalance: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  topUpButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  topUpButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  menuSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    marginLeft: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
    marginLeft: 8,
  },
  versionText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 24,
  },
});
