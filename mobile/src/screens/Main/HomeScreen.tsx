import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS, formatStatus } from '../../constants/theme';
import { getCardWidth, RESPONSIVE, isTablet, verticalScale, moderateScale, isIOS } from '../../utils/responsive';
import { rideService, deliveryService, notificationService } from '../../services/api';
import Toast, { ToastType } from '../../components/Toast';

// Dynamic greeting based on time of day
const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};



export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const [activeRides, setActiveRides] = useState<any[]>([]);
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const lastFetchRef = useRef<number>(0);
  const dotPulse = useRef(new Animated.Value(1)).current;
  const headerFade = useRef(new Animated.Value(0)).current;
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  // Header fade-in on mount
  useEffect(() => {
    Animated.timing(headerFade, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [headerFade]);

  // Pulsing dot for active rides/deliveries
  useEffect(() => {
    if (activeRides.length > 0 || activeDeliveries.length > 0) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(dotPulse, { toValue: 1.5, duration: 700, useNativeDriver: true }),
          Animated.timing(dotPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [activeRides.length, activeDeliveries.length, dotPulse]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await notificationService.getNotifications();
      const notifications = res?.data?.data;
      if (Array.isArray(notifications)) {
        const unread = notifications.filter((n: any) => !n.is_read).length;
        setUnreadCount(unread);
      }
    } catch {
      // Silently fail - notification count is non-critical
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const now = Date.now();
      if (now - lastFetchRef.current < 3000) return;
      lastFetchRef.current = now;
      (async () => {
        try {
          const [ridesRes, deliveriesRes] = await Promise.allSettled([
            rideService.getActiveRides(),
            deliveryService.getActiveDeliveries(),
          ]);
          if (ridesRes.status === 'fulfilled') {
            const data = ridesRes.value?.data?.data;
            setActiveRides(Array.isArray(data) ? data : []);
          }
          if (deliveriesRes.status === 'fulfilled') {
            const data = deliveriesRes.value?.data?.data;
            setActiveDeliveries(Array.isArray(data) ? data : []);
          }
        } catch (error) {
          console.error('Error fetching active orders:', error);
          showToast('Could not load active orders. Please check your connection.', 'error');
        }
      })();
      fetchUnreadCount();
    });
    return unsubscribe;
  }, [navigation, fetchUnreadCount]);

  const greeting = useMemo(() => getGreeting(), []);

  const services = [
    {
      id: 'pasugo',
      name: 'Pasugo',
      description: 'Delivery Service',
      icon: 'cube-outline',
      color: COLORS.pasugo,
      darkColor: COLORS.successDark,
      screen: 'Pasugo',
    },
    {
      id: 'pasabay',
      name: 'Pasabay',
      description: 'Ride Sharing',
      icon: 'bicycle-outline',
      color: COLORS.pasabay,
      darkColor: '#7C3AED',
      screen: 'Pasabay',
    },
    {
      id: 'pasundo',
      name: 'Pasundo',
      description: 'Pick-up Service',
      icon: 'car-outline',
      color: COLORS.pasundo,
      darkColor: '#2563EB',
      screen: 'Pasundo',
    },
    {
      id: 'stores',
      name: 'Stores',
      description: 'Shop & Deliver',
      icon: 'storefront-outline',
      color: COLORS.primary,
      darkColor: COLORS.primaryDark,
      screen: 'Services',
    },
  ];

  const quickActions = [
    { icon: 'wallet-outline', label: 'Wallet', screen: 'Wallet', color: COLORS.accent },
    { icon: 'time-outline', label: 'History', screen: 'RideHistory', color: COLORS.info },
    { icon: 'gift-outline', label: 'Promos', screen: null, action: () => Alert.alert('Promos', 'Check available promos when booking a ride!'), color: COLORS.warning },
    { icon: 'help-circle-outline', label: 'Help', screen: null, action: () => Alert.alert('Help', 'For support, contact us at support@omji.app'), color: COLORS.success },
  ];

  const firstName = user?.name?.split(' ')[0] || 'Guest';

  return (
    <View style={styles.container}>
      {/* Premium Header */}
      <Animated.View style={[styles.header, { opacity: headerFade }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.7}
          >
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greeting},</Text>
            <Text style={styles.userName} numberOfLines={1}>{firstName}</Text>
          </View>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => navigation.navigate('Notifications')}
            activeOpacity={0.7}
          >
            <View style={styles.notificationCircle}>
              <Ionicons name="notifications-outline" size={moderateScale(22)} color={COLORS.gray800} />
            </View>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Active Ride/Delivery Banners */}
        {activeRides.map((ride: any) => (
          <TouchableOpacity
            key={`ride-${ride.id}`}
            style={styles.activeCard}
            onPress={() => navigation.navigate('Tracking', { type: 'ride', rideId: ride.id, pickup: ride.pickup_location, dropoff: ride.dropoff_location, fare: ride.final_fare || ride.estimated_fare })}
            activeOpacity={0.8}
          >
            <View style={[styles.activeAccent, { backgroundColor: COLORS.warning }]} />
            <View style={styles.activeCardContent}>
              <View style={styles.activeCardLeft}>
                <View style={[styles.activeIconWrap, { backgroundColor: COLORS.warningBg }]}>
                  <Animated.View style={[styles.activeDot, { backgroundColor: COLORS.warning, transform: [{ scale: dotPulse }] }]} />
                </View>
                <View style={styles.activeTextWrap}>
                  <Text style={styles.activeTitle}>Active Ride</Text>
                  <Text style={styles.activeSub} numberOfLines={1}>
                    {ride.dropoff_location || 'In progress'}
                  </Text>
                  <View style={styles.activeStatusWrap}>
                    <View style={[styles.activeStatusDot, { backgroundColor: COLORS.warning }]} />
                    <Text style={[styles.activeStatusText, { color: COLORS.warningDark }]}>
                      {formatStatus(ride.status || '')}
                    </Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={moderateScale(20)} color={COLORS.warning} />
            </View>
          </TouchableOpacity>
        ))}
        {activeDeliveries.map((del: any) => (
          <TouchableOpacity
            key={`del-${del.id}`}
            style={[styles.activeCard]}
            onPress={() => navigation.navigate('Tracking', { type: 'delivery', rideId: del.id, pickup: del.pickup_location, dropoff: del.dropoff_location, fare: del.delivery_fee })}
            activeOpacity={0.8}
          >
            <View style={[styles.activeAccent, { backgroundColor: COLORS.primary }]} />
            <View style={styles.activeCardContent}>
              <View style={styles.activeCardLeft}>
                <View style={[styles.activeIconWrap, { backgroundColor: COLORS.primaryBg }]}>
                  <Animated.View style={[styles.activeDot, { backgroundColor: COLORS.primary, transform: [{ scale: dotPulse }] }]} />
                </View>
                <View style={styles.activeTextWrap}>
                  <Text style={[styles.activeTitle, { color: COLORS.gray900 }]}>Active Delivery</Text>
                  <Text style={styles.activeSub} numberOfLines={1}>
                    {del.dropoff_location || 'In progress'}
                  </Text>
                  <View style={styles.activeStatusWrap}>
                    <View style={[styles.activeStatusDot, { backgroundColor: COLORS.primary }]} />
                    <Text style={[styles.activeStatusText, { color: COLORS.primaryDark }]}>
                      {formatStatus(del.status || '')}
                    </Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={moderateScale(20)} color={COLORS.primary} />
            </View>
          </TouchableOpacity>
        ))}

        {/* Destination Search Bar */}
        <TouchableOpacity
          style={styles.destinationBar}
          onPress={() => navigation.navigate('Pasabay')}
          activeOpacity={0.8}
        >
          <View style={styles.destinationDot} />
          <Text style={styles.destinationText}>Where would you like to go?</Text>
          <View style={styles.destinationArrow}>
            <Ionicons name="arrow-forward" size={moderateScale(16)} color={COLORS.accent} />
          </View>
        </TouchableOpacity>

        {/* Service Cards */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Our Services</Text>
            <Text style={styles.sectionSubtitle}>Choose a service to get started</Text>
          </View>
          <View style={styles.servicesGrid}>
            {services.map((service) => (
              <TouchableOpacity
                key={service.id}
                style={[styles.serviceCard, { backgroundColor: service.color }, SHADOWS.colored(service.darkColor)]}
                onPress={() => navigation.navigate(service.screen)}
                activeOpacity={0.85}
              >
                <View style={styles.serviceCardInner}>
                  <View style={styles.serviceIconContainer}>
                    <View style={styles.serviceIconInner}>
                      <Ionicons name={service.icon as any} size={moderateScale(28)} color="#ffffff" />
                    </View>
                  </View>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  <Text style={styles.serviceDescription}>{service.description}</Text>
                  <View style={styles.serviceArrow}>
                    <Ionicons name="arrow-forward" size={moderateScale(14)} color="rgba(255,255,255,0.7)" />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
          <View style={styles.quickActionsGrid}>
            {quickActions.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={styles.quickActionButton}
                onPress={() => action.screen ? navigation.navigate(action.screen) : action.action?.()}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: action.color + '14' }]}>
                  <Ionicons name={action.icon as any} size={moderateScale(24)} color={action.color} />
                </View>
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Promo Banner */}
        <TouchableOpacity
          style={styles.promoBanner}
          onPress={() => Alert.alert('Special Promo', 'Use code OMJI20 for 20% off your first ride!')}
          activeOpacity={0.85}
        >
          <View style={styles.promoGlow} />
          <View style={styles.promoContent}>
            <View style={styles.promoIconWrap}>
              <Ionicons name="gift" size={moderateScale(28)} color={COLORS.white} />
            </View>
            <View style={styles.promoText}>
              <Text style={styles.promoLabel}>LIMITED OFFER</Text>
              <Text style={styles.promoTitle}>20% Off Your First Ride!</Text>
              <Text style={styles.promoSubtitle}>Use code OMJI20 at checkout</Text>
            </View>
            <View style={styles.promoArrow}>
              <Ionicons name="chevron-forward" size={moderateScale(20)} color={COLORS.white} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Location Info */}
        <View style={styles.locationTag}>
          <Ionicons name="location" size={moderateScale(14)} color={COLORS.accent} />
          <Text style={styles.locationTagText}>Balingasag, Misamis Oriental</Text>
        </View>
      </ScrollView>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },

  // --- Header ---
  header: {
    backgroundColor: COLORS.white,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(16),
    borderBottomLeftRadius: RESPONSIVE.borderRadius.xlarge,
    borderBottomRightRadius: RESPONSIVE.borderRadius.xlarge,
    ...SHADOWS.md,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  avatarButton: {
    marginRight: moderateScale(12),
  },
  avatarCircle: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.white,
  },
  headerLeft: {
    flex: 1,
    marginRight: moderateScale(16),
  },
  greeting: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    marginBottom: verticalScale(1),
  },
  userName: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: '700',
    color: COLORS.gray900,
    letterSpacing: -0.3,
  },
  notificationButton: {
    position: 'relative',
  },
  notificationCircle: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -verticalScale(2),
    right: -moderateScale(4),
    backgroundColor: COLORS.primary,
    borderRadius: moderateScale(10),
    minWidth: moderateScale(20),
    height: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: moderateScale(5),
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  badgeText: {
    fontSize: RESPONSIVE.fontSize.small - 2,
    fontWeight: '700',
    color: COLORS.white,
  },

  // --- Scroll ---
  scrollContent: {
    padding: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(100),
  },

  // --- Active Ride/Delivery Cards ---
  activeCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    marginBottom: verticalScale(12),
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  activeAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: moderateScale(4),
    borderTopLeftRadius: RESPONSIVE.borderRadius.large,
    borderBottomLeftRadius: RESPONSIVE.borderRadius.large,
  },
  activeCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(14),
    paddingHorizontal: moderateScale(16),
    paddingLeft: moderateScale(20),
  },
  activeCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeIconWrap: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: moderateScale(12),
  },
  activeDot: {
    width: moderateScale(12),
    height: moderateScale(12),
    borderRadius: moderateScale(6),
  },
  activeTextWrap: {
    flex: 1,
  },
  activeTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
    color: COLORS.gray900,
    marginBottom: verticalScale(2),
  },
  activeSub: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginBottom: verticalScale(4),
  },
  activeStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeStatusDot: {
    width: moderateScale(6),
    height: moderateScale(6),
    borderRadius: moderateScale(3),
    marginRight: moderateScale(6),
  },
  activeStatusText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
  },

  // --- Destination Bar ---
  destinationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    padding: moderateScale(16),
    marginBottom: RESPONSIVE.marginVertical * 1.5,
    ...SHADOWS.md,
  },
  destinationDot: {
    width: moderateScale(12),
    height: moderateScale(12),
    borderRadius: moderateScale(6),
    backgroundColor: COLORS.accent,
    marginRight: moderateScale(14),
  },
  destinationText: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray400,
    fontWeight: '500',
  },
  destinationArrow: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: COLORS.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- Sections ---
  section: {
    marginBottom: RESPONSIVE.marginVertical * 1.5,
  },
  sectionHeader: {
    marginBottom: RESPONSIVE.marginVertical,
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: '700',
    color: COLORS.gray900,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    marginTop: verticalScale(2),
  },

  // --- Service Cards ---
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  serviceCard: {
    width: getCardWidth(isTablet() ? 4 : 2, RESPONSIVE.paddingHorizontal, moderateScale(12)),
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    marginBottom: RESPONSIVE.marginVertical,
    overflow: 'hidden',
  },
  serviceCardInner: {
    padding: moderateScale(16),
    paddingTop: moderateScale(18),
    paddingBottom: moderateScale(14),
  },
  serviceIconContainer: {
    width: moderateScale(isTablet() ? 64 : 52),
    height: moderateScale(isTablet() ? 64 : 52),
    borderRadius: moderateScale(isTablet() ? 20 : 16),
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(14),
  },
  serviceIconInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceName: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: verticalScale(3),
    letterSpacing: 0.2,
  },
  serviceDescription: {
    fontSize: RESPONSIVE.fontSize.small,
    color: 'rgba(255, 255, 255, 0.75)',
    marginBottom: verticalScale(10),
  },
  serviceArrow: {
    alignSelf: 'flex-end',
    width: moderateScale(24),
    height: moderateScale(24),
    borderRadius: moderateScale(12),
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- Quick Actions ---
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  quickActionButton: {
    alignItems: 'center',
    width: getCardWidth(isTablet() ? 8 : 4, RESPONSIVE.paddingHorizontal, moderateScale(12)),
    marginBottom: RESPONSIVE.marginVertical,
  },
  quickActionIcon: {
    width: moderateScale(isTablet() ? 64 : 56),
    height: moderateScale(isTablet() ? 64 : 56),
    borderRadius: moderateScale(isTablet() ? 20 : 16),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  quickActionLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray600,
    fontWeight: '500',
    textAlign: 'center',
  },

  // --- Promo Banner ---
  promoBanner: {
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    marginBottom: RESPONSIVE.marginVertical * 1.5,
    overflow: 'hidden',
    backgroundColor: '#F97316',
    ...SHADOWS.lg,
  },
  promoGlow: {
    position: 'absolute',
    top: -moderateScale(40),
    right: -moderateScale(40),
    width: moderateScale(120),
    height: moderateScale(120),
    borderRadius: moderateScale(60),
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  promoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(18),
    paddingHorizontal: moderateScale(18),
  },
  promoIconWrap: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(14),
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoText: {
    flex: 1,
    marginLeft: moderateScale(14),
  },
  promoLabel: {
    fontSize: RESPONSIVE.fontSize.small - 1,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.2,
    marginBottom: verticalScale(2),
  },
  promoTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: verticalScale(3),
  },
  promoSubtitle: {
    fontSize: RESPONSIVE.fontSize.small,
    color: 'rgba(255,255,255,0.8)',
  },
  promoArrow: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: moderateScale(8),
  },

  // --- Location Tag ---
  locationTag: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(10),
  },
  locationTagText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    marginLeft: moderateScale(6),
    fontWeight: '500',
  },
});
