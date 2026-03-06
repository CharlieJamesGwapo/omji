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
import { rideService, orderService, deliveryService, walletService } from '../../services/api';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

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

      const [ridesRes, ordersRes, deliveriesRes, walletRes] = await Promise.allSettled([
        rideService.getActiveRides(),
        orderService.getActiveOrders(),
        deliveryService.getActiveDeliveries(),
        walletService.getBalance(),
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

      if (walletRes.status === 'fulfilled') {
        setWalletBalance(walletRes.value?.data?.data?.balance || 0);
      }
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
        { icon: 'person-outline', label: 'Edit Profile', screen: 'EditProfile' },
        { icon: 'wallet-outline', label: 'Wallet', screen: 'Wallet' },
        { icon: 'location-outline', label: 'Saved Addresses', screen: 'SavedAddresses' },
        { icon: 'card-outline', label: 'Payment Methods', screen: 'PaymentMethods' },
        { icon: 'bicycle-outline', label: 'Become a Driver', screen: 'RiderRegistration' },
      ],
    },
    {
      title: 'Activity',
      items: [
        { icon: 'receipt-outline', label: 'Order History', screen: 'Orders' },
        { icon: 'time-outline', label: 'Ride History', screen: 'RideHistory' },
        { icon: 'heart-outline', label: 'Favorites', screen: 'Favorites' },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help-circle-outline', label: 'Help Center', screen: null, action: () => Alert.alert('Help Center', 'For assistance, email us at support@omji.app or call +63 912 345 6789.\n\nFAQ:\n- How to book a ride?\n- How to track my delivery?\n- How to become a driver?') },
        { icon: 'chatbubble-outline', label: 'Contact Support', screen: null, action: () => Alert.alert('Contact Support', 'Email: support@omji.app\nPhone: +63 912 345 6789\nHours: 8AM - 10PM daily') },
        { icon: 'document-text-outline', label: 'Terms & Privacy', screen: null, action: () => Alert.alert('Terms & Privacy', 'By using OMJI, you agree to our Terms of Service and Privacy Policy.\n\nWe collect location data to provide ride and delivery services. Your data is securely stored and never shared with third parties without consent.') },
        { icon: 'information-circle-outline', label: 'About OMJI', screen: null, action: () => Alert.alert('About OMJI', 'OMJI - Balingasag\nYour ride-hailing and delivery app\n\nServices:\n- Pasundo (Pick-up)\n- Pasugo (Delivery)\n- Pasabay (Ride Sharing)\n- Store Orders\n\nVersion 1.0.0') },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={() => Alert.alert('Settings', 'App Settings', [
          { text: 'Edit Profile', onPress: () => navigation.navigate('EditProfile') },
          { text: 'Notifications', onPress: () => navigation.navigate('Notifications') },
          { text: 'Cancel', style: 'cancel' },
        ])}>
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
            <TouchableOpacity style={styles.editAvatarButton} onPress={() => navigation.navigate('EditProfile')}>
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
          <TouchableOpacity style={styles.topUpButton} onPress={() => navigation.navigate('Wallet')}>
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
                  onPress={() => item.screen ? navigation.navigate(item.screen) : ('action' in item && item.action?.())}
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
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(12),
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.title,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  userCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(16),
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: RESPONSIVE.paddingHorizontal,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: verticalScale(12),
  },
  avatar: {
    width: moderateScale(100),
    height: moderateScale(100),
    borderRadius: moderateScale(50),
    borderWidth: 4,
    borderColor: '#E5E7EB',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  userName: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(3),
  },
  userEmail: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
    marginBottom: verticalScale(2),
  },
  userPhone: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingTop: verticalScale(16),
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(3),
  },
  statLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
  },
  statDivider: {
    width: 1,
    height: moderateScale(40),
    backgroundColor: '#E5E7EB',
  },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(12),
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  walletIcon: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  walletLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    marginBottom: verticalScale(3),
  },
  walletBalance: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  topUpButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(8),
    borderRadius: RESPONSIVE.borderRadius.small,
  },
  topUpButtonText: {
    color: '#ffffff',
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
  },
  menuSection: {
    marginTop: verticalScale(20),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: verticalScale(10),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuCard: {
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
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
    padding: RESPONSIVE.paddingHorizontal,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  menuLabel: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#1F2937',
    marginLeft: moderateScale(16),
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(20),
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  logoutText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: '#EF4444',
    marginLeft: moderateScale(8),
  },
  versionText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: verticalScale(20),
  },
});
