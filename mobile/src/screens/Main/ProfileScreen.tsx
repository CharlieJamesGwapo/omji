import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants/theme';
import { rideService, orderService, deliveryService, walletService, userService, driverService } from '../../services/api';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

const SECTION_ACCENTS: Record<string, string> = {
  Account: COLORS.accent,
  Activity: COLORS.success,
  Support: COLORS.info,
};

const SECTION_ICONS: Record<string, { bg: string }> = {
  Account: { bg: COLORS.accentBg },
  Activity: { bg: COLORS.successBg },
  Support: { bg: COLORS.infoBg },
};

export default function ProfileScreen({ navigation }: any) {
  const { user, logout, updateUser } = useAuth();
  const [stats, setStats] = useState({ rides: 0, orders: 0, rating: 0, spent: 0 });
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [driverStatus, setDriverStatus] = useState<'none' | 'pending' | 'verified'>('none');

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchUserStats();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchUserStats = async () => {
    try {
      setLoading(true);

      const [ridesHistRes, ordersHistRes, deliveriesHistRes, walletRes, profileRes, driverRes] = await Promise.allSettled([
        rideService.getRideHistory(),
        orderService.getOrderHistory(),
        deliveryService.getDeliveryHistory(),
        walletService.getBalance(),
        userService.getProfile(),
        driverService.getProfile(),
      ]);

      // Update user with fresh profile data (includes created_at)
      if (profileRes.status === 'fulfilled') {
        const profileData = profileRes.value?.data?.data || profileRes.value?.data;
        if (profileData?.created_at) {
          updateUser({ created_at: profileData.created_at });
        }
      }

      // Check driver registration status — auto-switch to rider if approved
      if (driverRes.status === 'fulfilled') {
        const driverData = driverRes.value?.data?.data;
        if (driverData) {
          if (driverData.is_verified) {
            setDriverStatus('verified');
            // Auto-switch to rider mode when admin has approved
            if (user?.role === 'user') {
              updateUser({ role: 'driver' });
            }
          } else {
            setDriverStatus('pending');
          }
        }
      }

      const rides = ridesHistRes.status === 'fulfilled' && Array.isArray(ridesHistRes.value?.data?.data)
        ? ridesHistRes.value.data.data : [];
      const orders = ordersHistRes.status === 'fulfilled' && Array.isArray(ordersHistRes.value?.data?.data)
        ? ordersHistRes.value.data.data : [];
      const deliveries = deliveriesHistRes.status === 'fulfilled' && Array.isArray(deliveriesHistRes.value?.data?.data)
        ? deliveriesHistRes.value.data.data : [];

      const completedRides = rides.filter((r: any) => r.status === 'completed').length;
      const completedDeliveries = deliveries.filter((d: any) => d.status === 'completed').length;
      const totalCompleted = completedRides + completedDeliveries;

      const completedOrders = orders.filter((o: any) => o.status === 'delivered' || o.status === 'completed').length;

      const ridesSpent = rides.reduce((sum: number, ride: any) => sum + (ride.final_fare || ride.estimated_fare || 0), 0);
      const ordersSpent = orders.reduce((sum: number, order: any) => sum + (order.total_amount || 0), 0);
      const deliveriesSpent = deliveries.reduce((sum: number, delivery: any) => sum + (delivery.delivery_fee || 0), 0);
      const totalSpent = ridesSpent + ordersSpent + deliveriesSpent;

      const rating = Number(user?.rating) || 5.0;

      setStats({
        rides: totalCompleted,
        orders: completedOrders,
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

  const getMemberSince = useCallback(() => {
    const createdAt = user?.created_at;
    if (!createdAt) return null;
    try {
      const date = new Date(createdAt);
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return null;
    }
  }, [user]);

  const memberSince = getMemberSince();

  const menuSections = [
    {
      title: 'Account',
      items: [
        { icon: 'person-outline', label: 'Edit Profile', screen: 'EditProfile' },
        { icon: 'wallet-outline', label: 'Wallet', screen: 'Wallet' },
        { icon: 'location-outline', label: 'Saved Addresses', screen: 'SavedAddresses' },
        { icon: 'card-outline', label: 'Payment Methods', screen: 'PaymentMethods' },
        ...(!user?.role || user.role === 'user' ? (
          driverStatus === 'pending' ? [
            { icon: 'hourglass-outline', label: 'Rider Application (Pending)', screen: null, action: () => {
              Alert.alert(
                'Application Pending',
                'Your rider application is under review. Once an admin approves it, your account will automatically switch to rider mode.',
                [{ text: 'OK' }]
              );
            }},
          ] : driverStatus === 'none' ? [
            { icon: 'bicycle-outline', label: 'Become a Driver', screen: 'RiderRegistration' },
          ] : []
        ) : []),
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

  const renderStatItem = (icon: string, value: string | number, label: string, color: string) => (
    <View style={styles.statItem}>
      <View style={[styles.statIconContainer, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={moderateScale(18)} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={true}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Dark Profile Header */}
        <View style={styles.profileHeader}>
          {/* Top bar with settings */}
          <View style={styles.topBar}>
            <Text style={styles.headerTitle}>Profile</Text>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => Alert.alert('Settings', 'App Settings', [
                { text: 'Edit Profile', onPress: () => navigation.navigate('EditProfile') },
                { text: 'Notifications', onPress: () => navigation.navigate('Notifications') },
                { text: 'Cancel', style: 'cancel' },
              ])}
            >
              <Ionicons name="settings-outline" size={moderateScale(22)} color={COLORS.white} />
            </TouchableOpacity>
          </View>

          {/* Avatar and user info */}
          <View style={styles.profileInfo}>
            <View style={styles.avatarContainer}>
              <Image
                source={{
                  uri: user?.profile_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=3B82F6&color=fff&size=200`,
                }}
                style={styles.avatar}
              />
              <View style={styles.onlineIndicator} />
            </View>
            <View style={styles.userTextInfo}>
              <Text style={styles.userName} numberOfLines={1}>{user?.name || 'Guest User'}</Text>
              <View style={styles.emailRow}>
                <Ionicons name="mail-outline" size={moderateScale(13)} color={COLORS.gray400} />
                <Text style={styles.userEmail} numberOfLines={1}>{user?.email || 'guest@example.com'}</Text>
              </View>
              <View style={styles.phoneRow}>
                <Ionicons name="call-outline" size={moderateScale(13)} color={COLORS.gray400} />
                <Text style={styles.userPhone}>{user?.phone || '+63 912 345 6789'}</Text>
              </View>
              {memberSince && (
                <View style={styles.memberRow}>
                  <Ionicons name="calendar-outline" size={moderateScale(13)} color={COLORS.accentLight} />
                  <Text style={styles.memberSince}>Member since {memberSince}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Edit profile button in header */}
          <TouchableOpacity
            style={styles.editProfileButton}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <Ionicons name="create-outline" size={moderateScale(16)} color={COLORS.white} />
            <Text style={styles.editProfileText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          {loading ? (
            <View style={styles.statsLoading}>
              <ActivityIndicator size="small" color={COLORS.accent} />
            </View>
          ) : (
            <>
              {renderStatItem('car-outline', stats.rides, 'Trips', COLORS.accent)}
              {renderStatItem('bag-check-outline', stats.orders, 'Orders', COLORS.success)}
              {renderStatItem('star', stats.rating, 'Rating', COLORS.warning)}
              {renderStatItem('trending-up-outline', `₱${stats.spent >= 1000 ? (stats.spent / 1000).toFixed(1) + 'k' : stats.spent.toLocaleString()}`, 'Spent', COLORS.info)}
            </>
          )}
        </View>

        {/* Wallet Quick Access Card */}
        <TouchableOpacity
          style={styles.walletCard}
          onPress={() => navigation.navigate('Wallet')}
          activeOpacity={0.85}
        >
          <View style={styles.walletGradient}>
            <View style={styles.walletTop}>
              <View style={styles.walletIconContainer}>
                <Ionicons name="wallet" size={moderateScale(24)} color={COLORS.white} />
              </View>
              <View style={styles.walletInfo}>
                <Text style={styles.walletLabel}>Wallet Balance</Text>
                <Text style={styles.walletBalance}>
                  ₱{loading ? '---' : walletBalance.toFixed(2)}
                </Text>
              </View>
            </View>
            <View style={styles.walletActions}>
              <TouchableOpacity
                style={styles.walletActionButton}
                onPress={() => navigation.navigate('Wallet')}
              >
                <Ionicons name="add-circle-outline" size={moderateScale(16)} color={COLORS.white} />
                <Text style={styles.walletActionText}>Top Up</Text>
              </TouchableOpacity>
              <View style={styles.walletDivider} />
              <TouchableOpacity
                style={styles.walletActionButton}
                onPress={() => navigation.navigate('Wallet')}
              >
                <Ionicons name="swap-horizontal-outline" size={moderateScale(16)} color={COLORS.white} />
                <Text style={styles.walletActionText}>Transactions</Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Decorative circles */}
          <View style={styles.walletDecorCircle1} />
          <View style={styles.walletDecorCircle2} />
        </TouchableOpacity>

        {/* Menu Sections */}
        {menuSections.map((section) => {
          const accentColor = SECTION_ACCENTS[section.title] || COLORS.accent;
          const iconBg = SECTION_ICONS[section.title]?.bg || COLORS.accentBg;

          return (
            <View key={section.title} style={styles.menuSection}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionIndicator, { backgroundColor: accentColor }]} />
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
              <View style={styles.menuCard}>
                {section.items.map((item, itemIndex) => (
                  <TouchableOpacity
                    key={item.label}
                    style={[
                      styles.menuItem,
                      itemIndex < section.items.length - 1 && styles.menuItemBorder,
                    ]}
                    onPress={() => item.screen ? navigation.navigate(item.screen) : ('action' in item && item.action?.())}
                    activeOpacity={0.6}
                  >
                    <View style={[styles.menuIconContainer, { backgroundColor: iconBg }]}>
                      <Ionicons name={item.icon as any} size={moderateScale(18)} color={accentColor} />
                    </View>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={moderateScale(18)} color={COLORS.gray300} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
          <View style={styles.logoutIconContainer}>
            <Ionicons name="log-out-outline" size={moderateScale(20)} color={COLORS.error} />
          </View>
          <Text style={styles.logoutText}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={moderateScale(18)} color={COLORS.errorLight} />
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.versionText}>OMJI v1.0.0</Text>

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  scrollContent: {
    paddingBottom: verticalScale(20),
  },

  // Profile Header
  profileHeader: {
    backgroundColor: COLORS.gray900,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(24),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    borderBottomLeftRadius: moderateScale(24),
    borderBottomRightRadius: moderateScale(24),
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(20),
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  settingsButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(40),
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: moderateScale(2),
    right: moderateScale(2),
    width: moderateScale(16),
    height: moderateScale(16),
    borderRadius: moderateScale(8),
    backgroundColor: COLORS.success,
    borderWidth: 3,
    borderColor: COLORS.gray900,
  },
  userTextInfo: {
    flex: 1,
    marginLeft: moderateScale(16),
  },
  userName: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: verticalScale(4),
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(2),
  },
  userEmail: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    marginLeft: moderateScale(6),
    flex: 1,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(2),
  },
  userPhone: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    marginLeft: moderateScale(6),
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(4),
  },
  memberSince: {
    fontSize: fontScale(11),
    color: COLORS.accentLight,
    marginLeft: moderateScale(6),
    fontWeight: '500',
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: verticalScale(16),
    paddingHorizontal: moderateScale(14),
    paddingVertical: moderateScale(7),
    borderRadius: moderateScale(20),
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  editProfileText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.white,
    marginLeft: moderateScale(6),
    fontWeight: '500',
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(-1),
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    paddingVertical: verticalScale(16),
    paddingHorizontal: moderateScale(8),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.08,
    shadowRadius: moderateScale(12),
    elevation: moderateScale(5),
    top: verticalScale(-16),
    marginBottom: verticalScale(-4),
  },
  statsLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(16),
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statIconContainer: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(6),
  },
  statValue: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(2),
  },
  statLabel: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
    fontWeight: '500',
  },

  // Wallet Card
  walletCard: {
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(12),
    borderRadius: RESPONSIVE.borderRadius.large,
    overflow: 'hidden',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.2,
    shadowRadius: moderateScale(12),
    elevation: moderateScale(6),
  },
  walletGradient: {
    backgroundColor: COLORS.accentDark,
    padding: moderateScale(18),
  },
  walletTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  walletIconContainer: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(14),
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletInfo: {
    flex: 1,
    marginLeft: moderateScale(14),
  },
  walletLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: verticalScale(2),
  },
  walletBalance: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  walletActions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: verticalScale(12),
  },
  walletActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(4),
  },
  walletActionText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.white,
    marginLeft: moderateScale(6),
    fontWeight: '500',
  },
  walletDivider: {
    width: 1,
    height: moderateScale(20),
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  walletDecorCircle1: {
    position: 'absolute',
    top: moderateScale(-20),
    right: moderateScale(-20),
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(40),
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  walletDecorCircle2: {
    position: 'absolute',
    bottom: moderateScale(-10),
    right: moderateScale(40),
    width: moderateScale(50),
    height: moderateScale(50),
    borderRadius: moderateScale(25),
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // Menu Sections
  menuSection: {
    marginTop: verticalScale(24),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(10),
  },
  sectionIndicator: {
    width: moderateScale(4),
    height: moderateScale(18),
    borderRadius: moderateScale(2),
    marginRight: moderateScale(8),
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.gray700,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  menuCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.04,
    shadowRadius: moderateScale(6),
    elevation: moderateScale(2),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(14),
    paddingHorizontal: moderateScale(16),
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  menuIconContainer: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray800,
    marginLeft: moderateScale(12),
    fontWeight: '500',
  },

  // Logout Button
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(24),
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: verticalScale(14),
    paddingHorizontal: moderateScale(16),
    borderWidth: 1,
    borderColor: COLORS.errorBg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(1) },
    shadowOpacity: 0.03,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(1),
  },
  logoutIconContainer: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(10),
    backgroundColor: COLORS.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: COLORS.error,
    marginLeft: moderateScale(12),
  },

  // Version
  versionText: {
    fontSize: fontScale(11),
    color: COLORS.gray400,
    textAlign: 'center',
    marginTop: verticalScale(24),
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
