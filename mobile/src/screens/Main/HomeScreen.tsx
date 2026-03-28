import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Platform,
  RefreshControl,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../utils/i18n';
import { COLORS, SHADOWS, formatStatus } from '../../constants/theme';
import { getCardWidth, RESPONSIVE, isTablet, verticalScale, moderateScale, fontScale, isIOS } from '../../utils/responsive';
import { rideService, deliveryService, notificationService, storeService, userService, announcementService } from '../../services/api';
import type { SavedAddress, Ride } from '../../types';
import SkeletonBox from '../../components/SkeletonBox';
import Toast, { ToastType } from '../../components/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Dynamic greeting based on time of day
const getGreetingKey = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'home.greeting';
  if (hour < 17) return 'home.greeting_afternoon';
  return 'home.greeting_evening';
};



export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const [activeRides, setActiveRides] = useState<any[]>([]);
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [featuredStores, setFeaturedStores] = useState<any[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [recentTrips, setRecentTrips] = useState<Ride[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<Set<number>>(new Set());
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const carouselScrollRef = useRef<FlatList>(null);
  const carouselIndex = useRef(0);
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

  const fetchAllData = useCallback(async () => {
    let hadCriticalError = true;
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
      // At least one critical call succeeded
      if (ridesRes.status === 'fulfilled' || deliveriesRes.status === 'fulfilled') {
        hadCriticalError = false;
      }
    } catch (error) {
      console.error('Error fetching active orders:', error);
      showToast('Could not load active orders. Please check your connection.', 'error');
    }
    fetchUnreadCount();
    try {
      setStoresLoading(true);
      const res = await storeService.getStores();
      const data = res?.data?.data;
      if (Array.isArray(data)) {
        setFeaturedStores(data.slice(0, 10));
        hadCriticalError = false;
      }
    } catch {
      // Non-critical
    } finally {
      setStoresLoading(false);
    }

    // Fetch saved addresses
    try {
      const addrRes = await userService.getSavedAddresses();
      const addrData = addrRes?.data?.data;
      if (Array.isArray(addrData)) {
        setSavedAddresses(addrData);
      }
    } catch {
      // Non-critical
    }

    // Fetch recent trips (ride history, take last 3 completed)
    try {
      const histRes = await rideService.getRideHistory();
      const histData = histRes?.data?.data;
      if (Array.isArray(histData)) {
        const completed = histData
          .filter((r: Ride) => r.status === 'completed')
          .slice(0, 3);
        setRecentTrips(completed);
      }
    } catch {
      // Non-critical
    }

    // Fetch announcements
    try {
      const annRes = await announcementService.getAnnouncements();
      const annData = annRes?.data?.data;
      if (Array.isArray(annData)) {
        setAnnouncements(annData);
      }
    } catch {
      // Non-critical
    }

    setFetchError(hadCriticalError);
    setInitialLoading(false);
  }, [fetchUnreadCount]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const now = Date.now();
      if (now - lastFetchRef.current < 3000) return;
      lastFetchRef.current = now;
      fetchAllData();
    });
    return unsubscribe;
  }, [navigation, fetchAllData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setFetchError(false);
    lastFetchRef.current = 0; // Reset throttle
    await fetchAllData();
    setRefreshing(false);
  }, [fetchAllData]);

  const greeting = useMemo(() => t(getGreetingKey()), [language]);

  const services = [
    {
      id: 'pasugo',
      name: 'Pasugo',
      description: 'Delivery Service',
      icon: 'cube-outline',
      color: COLORS.primaryDark,
      bg: COLORS.primaryBg,
      screen: 'Pasugo',
    },
    {
      id: 'pasabay',
      name: 'Pasabay',
      description: 'Ride Sharing',
      icon: 'bicycle-outline',
      color: COLORS.primaryDark,
      bg: COLORS.primaryBg,
      screen: 'Pasabay',
    },
    {
      id: 'pasundo',
      name: 'Pasundo',
      description: 'Pick-up Service',
      icon: 'car-outline',
      color: COLORS.primaryDark,
      bg: COLORS.primaryBg,
      screen: 'Pasundo',
    },
    {
      id: 'stores',
      name: 'Stores',
      description: 'Shop & Deliver',
      icon: 'storefront-outline',
      color: COLORS.primaryDark,
      bg: COLORS.primaryBg,
      screen: 'Services',
    },
  ];

  const quickActions = [
    { icon: 'wallet-outline', label: 'Wallet', screen: 'Wallet', color: COLORS.primaryDark, bg: COLORS.primaryBg },
    { icon: 'time-outline', label: 'History', screen: 'RideHistory', color: COLORS.primaryDark, bg: COLORS.primaryBg },
    { icon: 'gift-outline', label: 'Promos', screen: 'Pasundo', color: COLORS.primaryDark, bg: COLORS.primaryBg },
    { icon: 'help-circle-outline', label: 'Help', screen: null, action: () => Linking.openURL('mailto:support@omji.app?subject=OMJI%20Support'), color: COLORS.primaryDark, bg: COLORS.primaryBg },
  ];

  const STORE_CATEGORY_CONFIG: Record<string, { color: string; icon: string }> = {
    restaurant: { color: COLORS.primary, icon: 'fast-food' },
    grocery: { color: COLORS.success, icon: 'cart' },
    pharmacy: { color: COLORS.accent, icon: 'medical' },
    retail: { color: '#8B5CF6', icon: 'bag' },
  };

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
            accessibilityLabel="Open profile"
            accessibilityRole="button"
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
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Notifications"
            accessibilityRole="button"
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

      {/* Search Bar */}
      <TouchableOpacity
        style={styles.fakeSearchBar}
        onPress={() => navigation.navigate('Search')}
        activeOpacity={0.7}
      >
        <Ionicons name="search-outline" size={moderateScale(18)} color={COLORS.gray400} />
        <Text style={styles.fakeSearchText}>Search stores, services...</Text>
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, {
          paddingBottom: 56 + Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0) + verticalScale(20),
        }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.accent]}
            tintColor={COLORS.accent}
          />
        }
      >
        {/* Skeleton Loader */}
        {initialLoading && (
          <View style={styles.skeletonContainer}>
            {/* Greeting placeholder */}
            <SkeletonBox width="55%" height={verticalScale(18)} borderRadius={moderateScale(12)} style={{ marginBottom: verticalScale(16) }} />
            {/* Service cards placeholder */}
            <View style={styles.skeletonServicesRow}>
              <SkeletonBox height={verticalScale(100)} borderRadius={moderateScale(12)} style={{ flex: 1, marginRight: moderateScale(10) }} />
              <SkeletonBox height={verticalScale(100)} borderRadius={moderateScale(12)} style={{ flex: 1, marginRight: moderateScale(10) }} />
              <SkeletonBox height={verticalScale(100)} borderRadius={moderateScale(12)} style={{ flex: 1 }} />
            </View>
            {/* Active rides placeholder */}
            <SkeletonBox height={verticalScale(72)} borderRadius={moderateScale(12)} style={{ marginBottom: verticalScale(12) }} />
            {/* Stores carousel placeholder */}
            <SkeletonBox width="35%" height={verticalScale(14)} borderRadius={moderateScale(12)} style={{ marginBottom: verticalScale(12) }} />
            <View style={styles.skeletonServicesRow}>
              <SkeletonBox width={moderateScale(140)} height={verticalScale(110)} borderRadius={moderateScale(12)} style={{ marginRight: moderateScale(10) }} />
              <SkeletonBox width={moderateScale(140)} height={verticalScale(110)} borderRadius={moderateScale(12)} style={{ marginRight: moderateScale(10) }} />
              <SkeletonBox width={moderateScale(140)} height={verticalScale(110)} borderRadius={moderateScale(12)} />
            </View>
          </View>
        )}

        {/* Error State */}
        {fetchError && !initialLoading && (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={moderateScale(48)} color={COLORS.gray400} />
            <Text style={styles.errorTitle}>Could not load data</Text>
            <Text style={styles.errorSubtext}>Check your connection and try again</Text>
            <TouchableOpacity
              style={styles.errorRetryButton}
              onPress={() => {
                setInitialLoading(true);
                setFetchError(false);
                lastFetchRef.current = 0;
                fetchAllData();
              }}
              activeOpacity={0.7}
              accessibilityLabel="Try again"
              accessibilityRole="button"
            >
              <Ionicons name="refresh" size={moderateScale(18)} color={COLORS.white} style={{ marginRight: moderateScale(6) }} />
              <Text style={styles.errorRetryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Announcement Banner */}
        {!initialLoading && !fetchError && announcements
          .filter((ann: any) => !dismissedAnnouncements.has(ann.id))
          .slice(0, 1)
          .map((ann: any) => {
            const typeColors: Record<string, { border: string; bg: string; icon: string }> = {
              info: { border: COLORS.accent, bg: COLORS.accentBg, icon: 'information-circle' },
              warning: { border: COLORS.warning, bg: COLORS.warningBg, icon: 'alert-circle' },
              promo: { border: COLORS.success, bg: COLORS.successBg, icon: 'gift' },
              update: { border: '#8B5CF6', bg: '#F5F3FF', icon: 'rocket' },
            };
            const colors = typeColors[ann.type] || typeColors.info;
            return (
              <View
                key={`ann-${ann.id}`}
                style={[
                  styles.announcementCard,
                  { borderLeftColor: colors.border, backgroundColor: colors.bg },
                ]}
              >
                <View style={styles.announcementContent}>
                  <Ionicons name={colors.icon as any} size={moderateScale(22)} color={colors.border} style={{ marginRight: moderateScale(10) }} />
                  <View style={styles.announcementTextWrap}>
                    <Text style={styles.announcementTitle} numberOfLines={1}>{ann.title}</Text>
                    <Text style={styles.announcementMessage} numberOfLines={2}>{ann.message}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDismissedAnnouncements(prev => new Set(prev).add(ann.id))}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={styles.announcementDismiss}
                    accessibilityLabel="Dismiss announcement"
                    accessibilityRole="button"
                  >
                    <Ionicons name="close" size={moderateScale(18)} color={COLORS.gray400} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

        {/* Active Ride/Delivery Banners */}
        {!initialLoading && !fetchError && activeRides.map((ride: any) => (
          <TouchableOpacity
            key={`ride-${ride.id}`}
            style={styles.activeCard}
            onPress={() => navigation.navigate('Tracking', { type: 'ride', rideId: ride.id, pickup: ride.pickup_location, dropoff: ride.dropoff_location, fare: ride.final_fare || ride.estimated_fare })}
            activeOpacity={0.8}
            accessibilityLabel={`Active ride to ${ride.dropoff_location || 'destination'}, status ${ride.status || 'unknown'}`}
            accessibilityRole="button"
          >
            <View style={[styles.activeAccent, { backgroundColor: COLORS.accent }]} />
            <View style={styles.activeCardContent}>
              <View style={styles.activeCardLeft}>
                <View style={[styles.activeIconWrap, { backgroundColor: COLORS.accentBg }]}>
                  <Animated.View style={[styles.activeDot, { backgroundColor: COLORS.accent, transform: [{ scale: dotPulse }] }]} />
                </View>
                <View style={styles.activeTextWrap}>
                  <Text style={styles.activeTitle}>Active Ride</Text>
                  <Text style={styles.activeSub} numberOfLines={1}>
                    {ride.dropoff_location || 'In progress'}
                  </Text>
                  <View style={styles.activeStatusWrap}>
                    <View style={[styles.activeStatusDot, { backgroundColor: COLORS.accent }]} />
                    <Text style={[styles.activeStatusText, { color: COLORS.accent }]}>
                      {formatStatus(ride.status || '')}
                    </Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={moderateScale(20)} color={COLORS.accent} />
            </View>
          </TouchableOpacity>
        ))}
        {!initialLoading && !fetchError && activeDeliveries.map((del: any) => (
          <TouchableOpacity
            key={`del-${del.id}`}
            style={[styles.activeCard]}
            onPress={() => navigation.navigate('Tracking', { type: 'delivery', rideId: del.id, pickup: del.pickup_location, dropoff: del.dropoff_location, fare: del.delivery_fee })}
            activeOpacity={0.8}
            accessibilityLabel={`Active delivery to ${del.dropoff_location || 'destination'}, status ${del.status || 'unknown'}`}
            accessibilityRole="button"
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

        {/* Empty state when no active rides/deliveries */}
        {!initialLoading && !fetchError && activeRides.length === 0 && activeDeliveries.length === 0 && !refreshing && (
          <View style={styles.noActiveContainer}>
            <Ionicons name="checkmark-circle-outline" size={moderateScale(24)} color={COLORS.gray400} />
            <Text style={styles.noActiveText}>No active rides or deliveries</Text>
          </View>
        )}

        {/* Featured Stores Carousel */}
        {!initialLoading && !fetchError && featuredStores.length > 0 && (
          <View style={styles.carouselSection}>
            <View style={styles.carouselHeader}>
              <Text style={styles.carouselTitle}>Popular Stores</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Services')}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ minHeight: 44, justifyContent: 'center' }}
                accessibilityLabel="See all stores"
                accessibilityRole="button"
              >
                <Text style={styles.carouselSeeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              ref={carouselScrollRef}
              data={featuredStores}
              horizontal
              pagingEnabled={false}
              snapToInterval={moderateScale(160) + moderateScale(12)}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselList}
              keyExtractor={(item) => String(item.id || item.ID)}
              renderItem={({ item }) => {
                const catCfg = STORE_CATEGORY_CONFIG[item.category] || { color: COLORS.accent, icon: 'storefront' };
                return (
                  <TouchableOpacity
                    style={styles.storeCard}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('StoreDetail', { store: item })}
                    accessibilityLabel={`${item.name || 'Store'}, ${item.category || 'store'}, rating ${Number(item.rating || 0).toFixed(1)}`}
                    accessibilityRole="button"
                  >
                    <View style={[styles.storeIconArea, { backgroundColor: `${catCfg.color}15` }]}>
                      <View style={[styles.storeIconCircle, { backgroundColor: catCfg.color }]}>
                        <Ionicons name={catCfg.icon as any} size={moderateScale(22)} color={COLORS.white} />
                      </View>
                      <View style={styles.storeRatingBadge}>
                        <Ionicons name="star" size={moderateScale(10)} color="#F59E0B" />
                        <Text style={styles.storeRatingText}>{Number(item.rating || 0).toFixed(1)}</Text>
                      </View>
                    </View>
                    <View style={styles.storeInfo}>
                      <Text style={styles.storeName} numberOfLines={1}>{item.name || 'Store'}</Text>
                      <Text style={styles.storeCategory} numberOfLines={1}>
                        {item.category || 'Store'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}
        {!initialLoading && !fetchError && storesLoading && featuredStores.length === 0 && (
          <View style={styles.carouselLoading}>
            <ActivityIndicator size="small" color={COLORS.accent} />
          </View>
        )}

        {/* Destination Search Bar */}
        {!initialLoading && !fetchError && <TouchableOpacity
          style={styles.destinationBar}
          onPress={() => navigation.navigate('Pasabay')}
          activeOpacity={0.8}
          accessibilityLabel="Search for a destination"
          accessibilityRole="button"
        >
          <View style={styles.destinationDot} />
          <Text style={styles.destinationText}>{t('home.where_to')}</Text>
          <View style={styles.destinationArrow}>
            <Ionicons name="arrow-forward" size={moderateScale(16)} color={COLORS.accent} />
          </View>
        </TouchableOpacity>}

        {/* Rider Promo Banner */}
        {!initialLoading && !fetchError && user?.role === 'user' && (
          <TouchableOpacity
            style={styles.riderPromoBanner}
            onPress={() => navigation.navigate('RiderRegistration')}
            activeOpacity={0.8}
            accessibilityLabel="Become a rider"
            accessibilityRole="button"
          >
            <View style={styles.riderPromoIcon}>
              <Ionicons name="bicycle" size={moderateScale(20)} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.riderPromoTitle}>Earn with OMJI</Text>
              <Text style={styles.riderPromoSubtext}>Become a rider and start earning today</Text>
            </View>
            <Ionicons name="chevron-forward" size={moderateScale(16)} color={COLORS.gray400} />
          </TouchableOpacity>
        )}

        {!initialLoading && !fetchError && (<>
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
                style={[styles.serviceCard, SHADOWS.md]}
                onPress={() => navigation.navigate(service.screen)}
                activeOpacity={0.85}
                accessibilityLabel={`${service.name} ${service.description.toLowerCase()}`}
                accessibilityRole="button"
              >
                <View style={styles.serviceCardInner}>
                  <View style={[styles.serviceIconContainer, { backgroundColor: service.bg }]}>
                    <Ionicons name={service.icon as any} size={moderateScale(28)} color={service.color} />
                  </View>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  <Text style={styles.serviceDescription}>{service.description}</Text>
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
                accessibilityLabel={action.label}
                accessibilityRole="button"
              >
                <View style={[styles.quickActionIcon, { backgroundColor: action.bg }]}>
                  <Ionicons name={action.icon as any} size={moderateScale(24)} color={action.color} />
                </View>
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Quick Book - Saved Addresses */}
        {savedAddresses.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.quick_book')}</Text>
              <Text style={styles.sectionSubtitle}>Your saved addresses</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.savedAddressesList}
            >
              {savedAddresses.map((addr) => {
                const iconName = addr.label === 'Home' ? 'home' : addr.label === 'Work' ? 'briefcase' : 'location';
                return (
                  <TouchableOpacity
                    key={addr.id}
                    style={styles.savedAddressCard}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('Pasundo', {
                      dropoff: {
                        address: addr.address,
                        latitude: addr.latitude,
                        longitude: addr.longitude,
                      },
                    })}
                    accessibilityLabel={`Book ride to ${addr.label}: ${addr.address}`}
                    accessibilityRole="button"
                  >
                    <View style={styles.savedAddressIconWrap}>
                      <Ionicons name={iconName} size={moderateScale(20)} color={COLORS.primary} />
                    </View>
                    <View style={styles.savedAddressInfo}>
                      <Text style={styles.savedAddressLabel} numberOfLines={1}>{addr.label}</Text>
                      <Text style={styles.savedAddressText} numberOfLines={2}>{addr.address}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={moderateScale(16)} color={COLORS.gray400} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Recent Trips */}
        {recentTrips.length > 0 && (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
              <View>
                <Text style={styles.sectionTitle}>{t('home.recent_trips')}</Text>
                <Text style={styles.sectionSubtitle}>Your last completed rides</Text>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('RideHistory')}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ minHeight: 44, justifyContent: 'center' }}
                accessibilityLabel="View all ride history"
                accessibilityRole="button"
              >
                <Text style={styles.recentTripsViewAll}>{t('home.view_all')}</Text>
              </TouchableOpacity>
            </View>
            {recentTrips.map((trip) => {
              const date = trip.completed_at || trip.created_at;
              const formattedDate = date
                ? new Date(date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                : '';
              return (
                <View key={trip.id} style={styles.recentTripCard}>
                  <View style={styles.recentTripIconWrap}>
                    <Ionicons name="car-outline" size={moderateScale(18)} color={COLORS.accent} />
                  </View>
                  <View style={styles.recentTripInfo}>
                    <Text style={styles.recentTripRoute} numberOfLines={1}>
                      {(trip.pickup_location || '').split(',')[0]} → {(trip.dropoff_location || '').split(',')[0]}
                    </Text>
                    <Text style={styles.recentTripMeta}>
                      {formattedDate}{trip.final_fare != null || trip.estimated_fare != null ? ` · ₱${(trip.final_fare ?? trip.estimated_fare ?? 0).toFixed(0)}` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Promo Banner */}
        <TouchableOpacity
          style={styles.promoBanner}
          onPress={() => Alert.alert('Special Promo', 'Use code OMJI20 for 20% off your first ride!')}
          activeOpacity={0.85}
          accessibilityLabel="Limited offer: 20% off your first ride"
          accessibilityRole="button"
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
          <Text style={styles.locationTagText}>Misamis Oriental, Philippines</Text>
        </View>
        </>)}
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
  fakeSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray100,
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(12),
    marginBottom: verticalScale(4),
    paddingHorizontal: moderateScale(14),
    height: moderateScale(42),
    borderRadius: moderateScale(12),
  },
  fakeSearchText: {
    fontSize: fontScale(14),
    color: COLORS.gray400,
    marginLeft: moderateScale(10),
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
  },

  // --- Announcement Banner ---
  announcementCard: {
    borderLeftWidth: moderateScale(4),
    borderRadius: RESPONSIVE.borderRadius.medium,
    marginBottom: verticalScale(12),
    overflow: 'hidden',
  },
  announcementContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    paddingHorizontal: moderateScale(14),
  },
  announcementTextWrap: {
    flex: 1,
  },
  announcementTitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.gray900,
    marginBottom: verticalScale(2),
  },
  announcementMessage: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray600,
    lineHeight: moderateScale(18),
  },
  announcementDismiss: {
    marginLeft: moderateScale(8),
    padding: moderateScale(4),
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
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray200,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(14),
  },
  serviceName: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.gray900,
    marginBottom: verticalScale(3),
    letterSpacing: 0.2,
  },
  serviceDescription: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginBottom: verticalScale(4),
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
    backgroundColor: COLORS.accentBg,
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
    backgroundColor: COLORS.primary,
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

  // --- Featured Stores Carousel ---
  carouselSection: {
    marginBottom: RESPONSIVE.marginVertical * 1.5,
  },
  carouselHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(10),
  },
  carouselTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: '700',
    color: COLORS.gray900,
    letterSpacing: -0.3,
  },
  carouselSeeAll: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: COLORS.accent,
  },
  carouselList: {
    paddingRight: RESPONSIVE.paddingHorizontal,
  },
  carouselLoading: {
    height: verticalScale(120),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: RESPONSIVE.marginVertical,
  },
  storeCard: {
    width: moderateScale(160),
    marginRight: moderateScale(12),
    borderRadius: RESPONSIVE.borderRadius.medium,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  storeIconArea: {
    width: '100%',
    height: verticalScale(90),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  storeIconCircle: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  storeRatingBadge: {
    position: 'absolute',
    top: moderateScale(6),
    right: moderateScale(6),
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(8),
    paddingHorizontal: moderateScale(5),
    paddingVertical: moderateScale(2),
    gap: moderateScale(2),
    ...SHADOWS.sm,
  },
  storeRatingText: {
    fontSize: fontScale(10),
    fontWeight: '700',
    color: COLORS.gray800,
  },
  storeInfo: {
    padding: moderateScale(10),
  },
  storeName: {
    fontSize: fontScale(13),
    fontWeight: '700',
    color: COLORS.gray900,
    marginBottom: verticalScale(2),
  },
  storeCategory: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
    textTransform: 'capitalize',
  },

  // --- No Active Rides/Deliveries ---
  noActiveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: verticalScale(12),
    paddingHorizontal: moderateScale(16),
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  noActiveText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    marginLeft: moderateScale(8),
    fontWeight: '500',
  },

  // --- Rider Promo Banner ---
  riderPromoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    marginBottom: verticalScale(12),
    padding: moderateScale(14),
    borderRadius: RESPONSIVE.borderRadius.medium,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: moderateScale(12),
  },
  riderPromoIcon: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderPromoTitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: '#065F46',
  },
  riderPromoSubtext: {
    fontSize: fontScale(11),
    color: '#047857',
    marginTop: verticalScale(1),
  },

  // --- Saved Addresses (Quick Book) ---
  savedAddressesList: {
    paddingRight: moderateScale(4),
  },
  savedAddressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(14),
    marginRight: moderateScale(12),
    width: moderateScale(240),
    borderWidth: 1,
    borderColor: COLORS.gray200,
    ...SHADOWS.sm,
  },
  savedAddressIconWrap: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: moderateScale(10),
  },
  savedAddressInfo: {
    flex: 1,
    marginRight: moderateScale(6),
  },
  savedAddressLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: verticalScale(2),
  },
  savedAddressText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    lineHeight: moderateScale(18),
  },

  // --- Recent Trips ---
  recentTripsViewAll: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: COLORS.accent,
  },
  recentTripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginBottom: verticalScale(8),
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  recentTripIconWrap: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: COLORS.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: moderateScale(12),
  },
  recentTripInfo: {
    flex: 1,
  },
  recentTripRoute: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: verticalScale(2),
  },
  recentTripMeta: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
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

  // --- Skeleton Loader ---
  skeletonContainer: {
    marginBottom: verticalScale(16),
  },
  skeletonServicesRow: {
    flexDirection: 'row' as const,
    marginBottom: verticalScale(16),
  },

  // --- Error State ---
  errorCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    padding: moderateScale(32),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: verticalScale(16),
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  errorTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700' as const,
    color: COLORS.gray900,
    marginTop: verticalScale(16),
    marginBottom: verticalScale(6),
  },
  errorSubtext: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    marginBottom: verticalScale(20),
    textAlign: 'center' as const,
  },
  errorRetryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: COLORS.accent,
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(12),
    paddingHorizontal: moderateScale(24),
  },
  errorRetryText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600' as const,
    color: COLORS.white,
  },
});
