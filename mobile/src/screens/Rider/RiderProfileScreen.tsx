import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { driverService } from '../../services/api';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, verticalScale, moderateScale, fontScale, isIOS } from '../../utils/responsive';
import Toast, { ToastType } from '../../components/Toast';

export default function RiderProfileScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [earningsData, setEarningsData] = useState<any>({});

  const [driverData, setDriverData] = useState<any>({});
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  const fetchData = useCallback(async () => {
    try {
      const [earningsRes, profileRes] = await Promise.allSettled([
        driverService.getEarnings(),
        driverService.getProfile(),
      ]);
      if (earningsRes.status === 'fulfilled') {
        setEarningsData(earningsRes.value?.data?.data || {});
      }
      if (profileRes.status === 'fulfilled') {
        setDriverData(profileRes.value?.data?.data || {});
      }
    } catch (error) {
      // Fetch failed - toast will inform user to retry
      showToast('Could not load profile data. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsubscribe;
  }, [navigation, fetchData]);

  const riderProfile = {
    name: user?.name || 'Rider',
    email: user?.email || '',
    phone: user?.phone || '',
    avatar: user?.profile_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'R')}&background=10B981&color=fff&size=200`,
    rating: (user?.total_ratings ?? earningsData?.total_ratings ?? 0) > 0 ? Number(user?.rating ?? earningsData?.rating ?? 0) : 0,
    hasRatings: (user?.total_ratings ?? earningsData?.total_ratings ?? 0) > 0,
    totalRides: earningsData?.completed_rides ?? 0,
    vehicleType: driverData.vehicle_type || 'Motorcycle',
    plateNumber: driverData.vehicle_plate || '-',
    licenseNumber: driverData.license_number || '-',
    joinedDate: (user as any)?.created_at ? new Date((user as any).created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Member',
  };

  const totalRides = riderProfile.totalRides;

  const stats = [
    { label: 'Total Rides', value: `${totalRides}`, icon: 'bicycle', color: COLORS.accent, bg: COLORS.accentBg },
    { label: 'Rating', value: riderProfile.hasRatings ? `${riderProfile.rating.toFixed(1)}` : 'New', icon: 'star', color: COLORS.warning, bg: COLORS.warningBg },
    { label: 'Acceptance', value: earningsData?.acceptance_rate != null ? `${earningsData.acceptance_rate}%` : '-', icon: 'checkmark-circle', color: COLORS.success, bg: COLORS.successBg },
    { label: 'Completion', value: earningsData?.completion_rate != null ? `${earningsData.completion_rate}%` : '-', icon: 'checkmark-done', color: COLORS.success, bg: COLORS.successBg },
  ];

  const achievements = [
    { title: 'First Ride', icon: 'trophy', color: COLORS.warning, target: 1, current: totalRides, earned: totalRides >= 1 },
    { title: '5-Star Rider', icon: 'star', color: COLORS.warning, target: 4.5, current: riderProfile.rating, earned: riderProfile.hasRatings && riderProfile.rating >= 4.5, unit: '' },
    { title: '10 Rides', icon: 'sunny', color: COLORS.store, target: 10, current: totalRides, earned: totalRides >= 10 },
    { title: '50 Rides', icon: 'trophy', color: COLORS.accent, target: 50, current: totalRides, earned: totalRides >= 50 },
    { title: '100 Rides', icon: 'moon', color: COLORS.info, target: 100, current: totalRides, earned: totalRides >= 100 },
    { title: '500 Rides', icon: 'trophy', color: COLORS.primary, target: 500, current: totalRides, earned: totalRides >= 500 },
  ];

  const menuSections = [
    {
      title: 'Vehicle',
      items: [
        { icon: 'bicycle', iconColor: COLORS.accent, iconBg: COLORS.accentBg, label: 'Vehicle Details', subtitle: `${riderProfile.vehicleType} - ${riderProfile.plateNumber}`, action: () => Alert.alert('Vehicle Details', `Type: ${riderProfile.vehicleType}\nPlate: ${riderProfile.plateNumber}\nModel: ${driverData.vehicle_model || '-'}\nLicense: ${riderProfile.licenseNumber}`) },
        { icon: 'document-text', iconColor: COLORS.info, iconBg: COLORS.infoBg, label: 'Documents', subtitle: driverData.is_verified ? 'Verified & on file' : 'Pending verification', action: () => Alert.alert('Documents', driverData.is_verified ? 'Your documents have been verified and are on file.\n\nTo update documents, please contact support.' : 'Your documents are being reviewed.\n\nPlease wait for admin verification.') },
      ],
    },
    {
      title: 'Performance',
      items: [
        { icon: 'stats-chart', iconColor: COLORS.success, iconBg: COLORS.successBg, label: 'Earnings & Statistics', subtitle: 'View detailed breakdown', action: () => navigation.navigate('Earnings') },
        { icon: 'star', iconColor: COLORS.warning, iconBg: COLORS.warningBg, label: 'Ratings & Reviews', subtitle: riderProfile.hasRatings ? `${riderProfile.rating.toFixed(1)} average rating` : 'No ratings yet', action: () => Alert.alert('Ratings', riderProfile.hasRatings ? `Your Rating: ${riderProfile.rating.toFixed(1)} / 5.0\nTotal Ratings: ${user?.total_ratings || 0}\nTotal Rides: ${totalRides}\n\nKeep providing great service!` : `No ratings yet.\nComplete rides and provide great service to earn ratings!`) },
      ],
    },
    {
      title: 'Account',
      items: [
        { icon: 'person', iconColor: COLORS.accent, iconBg: COLORS.accentBg, label: 'Edit Profile', subtitle: riderProfile.email, action: () => Alert.alert('Edit Profile', `Name: ${riderProfile.name}\nEmail: ${riderProfile.email}\nPhone: ${riderProfile.phone}\n\nContact support to update your profile information.`) },
        { icon: 'card', iconColor: COLORS.info, iconBg: COLORS.infoBg, label: 'Bank Account', subtitle: 'Manage payout account', action: () => Alert.alert('Bank Account', 'Manage your payout account.\n\nCurrently using the account registered during signup.\nContact support to update your bank details.') },
        { icon: 'shield-checkmark', iconColor: COLORS.success, iconBg: COLORS.successBg, label: 'Privacy & Security', subtitle: 'Data protection settings', action: () => Alert.alert('Privacy & Security', 'Your data is encrypted and protected.\n\n\u2022 Location shared only during active rides\n\u2022 Personal info never shared with passengers\n\u2022 You can request data deletion anytime') },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help-circle', iconColor: COLORS.warning, iconBg: COLORS.warningBg, label: 'Help Center', subtitle: 'FAQs & troubleshooting', action: () => Linking.openURL('mailto:support@omji.app?subject=Rider%20Help%20Request') },
        { icon: 'book', iconColor: COLORS.pasabay, iconBg: COLORS.pasabayBg, label: 'Rider Guide', subtitle: 'Tips & best practices', action: () => Alert.alert('Rider Guide', 'OMJI Rider Guide\n\n1. Go online to receive ride requests\n2. Accept requests within 30 seconds\n3. Navigate to pickup location\n4. Confirm pickup with customer\n5. Complete the ride at destination\n6. Earnings are added to your wallet\n\nTips:\n\u2022 Maintain a high rating\n\u2022 Stay in busy areas\n\u2022 Be polite and professional') },
        { icon: 'chatbubble', iconColor: COLORS.primary, iconBg: COLORS.primaryBg, label: 'Contact Support', subtitle: '24/7 driver support', action: () => Linking.openURL('tel:+639123456789') },
      ],
    },
  ];

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

  return (
    <View style={styles.container}>
      {/* Header with colored background */}
      <View style={styles.headerBg}>
        <View style={styles.headerDecor} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity
            style={styles.headerSettingsBtn}
            onPress={() => Alert.alert('Settings', 'Rider Settings', [
              { text: 'Logout', style: 'destructive', onPress: handleLogout },
              { text: 'Cancel', style: 'cancel' },
            ])}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Settings"
            accessibilityRole="button"
          >
            <Ionicons name="settings-outline" size={moderateScale(22)} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Profile Card - overlapping the header */}
        <View style={styles.profileCardWrapper}>
          <View style={styles.profileCard}>
            <View style={styles.avatarContainer}>
              <Image
                source={{ uri: riderProfile.avatar }}
                style={styles.avatar}
              />
              {driverData.is_verified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={moderateScale(22)} color={COLORS.success} />
                </View>
              )}
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{riderProfile.name}</Text>
              <Text style={styles.profileEmail}>{riderProfile.email}</Text>
              <View style={styles.profileMetaRow}>
                <View style={styles.profileMetaItem}>
                  <Ionicons name="call-outline" size={moderateScale(13)} color={COLORS.gray500} />
                  <Text style={styles.profileMetaText}>{riderProfile.phone}</Text>
                </View>
                <View style={styles.profileMetaDot} />
                <View style={styles.profileMetaItem}>
                  <Ionicons name="calendar-outline" size={moderateScale(13)} color={COLORS.gray500} />
                  <Text style={styles.profileMetaText}>{riderProfile.joinedDate}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await fetchData();
              setRefreshing(false);
            }}
            colors={[COLORS.success]}
            tintColor={COLORS.success}
          />
        }
      >
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.success} />
          </View>
        )}

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: stat.bg }]}>
                <Ionicons name={stat.icon as any} size={moderateScale(18)} color={stat.color} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Verification Status */}
        <View style={styles.verificationCard}>
          <View style={styles.verificationHeader}>
            <View style={[styles.verificationIconWrap, {
              backgroundColor: driverData.is_verified ? COLORS.successBg : COLORS.warningBg,
            }]}>
              <Ionicons
                name={driverData.is_verified ? 'shield-checkmark' : 'shield-outline'}
                size={moderateScale(22)}
                color={driverData.is_verified ? COLORS.success : COLORS.warning}
              />
            </View>
            <View style={styles.verificationInfo}>
              <Text style={styles.verificationTitle}>Verification Status</Text>
              <Text style={[styles.verificationSubtitle, {
                color: driverData.is_verified ? COLORS.success : COLORS.warning,
              }]}>
                {driverData.is_verified ? 'All documents verified' : 'Verification in progress'}
              </Text>
            </View>
            <View style={[styles.verificationBadge, {
              backgroundColor: driverData.is_verified ? COLORS.successBg : COLORS.warningBg,
            }]}>
              <Text style={[styles.verificationBadgeText, {
                color: driverData.is_verified ? COLORS.success : COLORS.warning,
              }]}>
                {driverData.is_verified ? 'Verified' : 'Pending'}
              </Text>
            </View>
          </View>
        </View>

        {/* Vehicle Info */}
        <View style={styles.vehicleCard}>
          <View style={styles.vehicleHeader}>
            <View style={[styles.vehicleIconWrap, { backgroundColor: COLORS.accentBg }]}>
              <Ionicons name={(driverData.vehicle_type === 'car' ? 'car' : driverData.vehicle_type === 'motorcycle' ? 'bicycle' : 'navigate-circle') as any} size={moderateScale(22)} color={COLORS.accent} />
            </View>
            <Text style={styles.vehicleTitle}>Vehicle Information</Text>
          </View>
          <View style={styles.vehicleDetails}>
            <View style={styles.vehicleRow}>
              <View style={styles.vehicleLabelRow}>
                <Ionicons name="car-outline" size={moderateScale(16)} color={COLORS.gray500} />
                <Text style={styles.vehicleLabel}>Type</Text>
              </View>
              <Text style={styles.vehicleValue}>{driverData.vehicle_type || riderProfile.vehicleType}</Text>
            </View>
            <View style={styles.vehicleDivider} />
            <View style={styles.vehicleRow}>
              <View style={styles.vehicleLabelRow}>
                <Ionicons name="pricetag-outline" size={moderateScale(16)} color={COLORS.gray500} />
                <Text style={styles.vehicleLabel}>Plate Number</Text>
              </View>
              <Text style={styles.vehicleValue}>{driverData.vehicle_plate || riderProfile.plateNumber}</Text>
            </View>
            <View style={styles.vehicleDivider} />
            <View style={styles.vehicleRow}>
              <View style={styles.vehicleLabelRow}>
                <Ionicons name="construct-outline" size={moderateScale(16)} color={COLORS.gray500} />
                <Text style={styles.vehicleLabel}>Model</Text>
              </View>
              <Text style={styles.vehicleValue}>{driverData.vehicle_model || '-'}</Text>
            </View>
            {!!driverData.license_number && (
              <>
                <View style={styles.vehicleDivider} />
                <View style={styles.vehicleRow}>
                  <View style={styles.vehicleLabelRow}>
                    <Ionicons name="id-card-outline" size={moderateScale(16)} color={COLORS.gray500} />
                    <Text style={styles.vehicleLabel}>License</Text>
                  </View>
                  <Text style={styles.vehicleValue}>{driverData.license_number ? `****${driverData.license_number.slice(-4)}` : '-'}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Achievements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Achievements</Text>
          <View style={styles.achievementsGrid}>
            {achievements.map((achievement) => {
              const progress = achievement.earned ? 1 : Math.min(achievement.current / achievement.target, 1);
              return (
                <View
                  key={achievement.title}
                  style={[styles.achievementCard, !achievement.earned && styles.achievementCardLocked]}
                >
                  <View style={[styles.achievementIcon, {
                    backgroundColor: achievement.earned ? `${achievement.color}20` : COLORS.gray100,
                  }]}>
                    <Ionicons
                      name={achievement.icon as any}
                      size={moderateScale(22)}
                      color={achievement.earned ? achievement.color : COLORS.gray300}
                    />
                  </View>
                  <Text style={[styles.achievementTitle, !achievement.earned && styles.achievementTitleLocked]}>
                    {achievement.title}
                  </Text>
                  {/* Progress bar */}
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, {
                      width: `${Math.max(progress * 100, 3)}%`,
                      backgroundColor: achievement.earned ? achievement.color : COLORS.gray300,
                    }]} />
                  </View>
                  <Text style={[styles.progressText, { color: achievement.earned ? achievement.color : COLORS.gray400 }]}>
                    {achievement.earned ? 'Earned!' : `${Math.round(progress * 100)}%`}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Menu Sections */}
        {menuSections.map((section) => (
          <View key={section.title} style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.menuItem,
                    itemIndex < section.items.length - 1 && styles.menuItemBorder,
                  ]}
                  onPress={() => item.action?.()}
                  activeOpacity={0.7}
                  accessibilityLabel={item.label}
                  accessibilityRole="button"
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: item.iconBg }]}>
                    <Ionicons name={item.icon as any} size={moderateScale(18)} color={item.iconColor} />
                  </View>
                  <View style={styles.menuItemInfo}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    {!!item.subtitle && (
                      <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={moderateScale(18)} color={COLORS.gray300} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7} accessibilityLabel="Logout" accessibilityRole="button">
          <View style={styles.logoutIconWrap}>
            <Ionicons name="log-out-outline" size={moderateScale(20)} color={COLORS.error} />
          </View>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.versionText}>Rider App Version 1.0.1</Text>

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(20),
  },
  headerBg: {
    backgroundColor: COLORS.success,
    paddingBottom: verticalScale(60),
    borderBottomLeftRadius: RESPONSIVE.borderRadius.xlarge,
    borderBottomRightRadius: RESPONSIVE.borderRadius.xlarge,
    ...SHADOWS.lg,
  },
  headerDecor: {
    position: 'absolute',
    top: -moderateScale(40),
    right: -moderateScale(40),
    width: moderateScale(140),
    height: moderateScale(140),
    borderRadius: moderateScale(70),
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(16),
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  headerSettingsBtn: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCardWrapper: {
    position: 'absolute',
    bottom: verticalScale(-50),
    left: RESPONSIVE.marginHorizontal,
    right: RESPONSIVE.marginHorizontal,
    zIndex: 10,
  },
  profileCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(16),
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: moderateScale(72),
    height: moderateScale(72),
    borderRadius: moderateScale(36),
    borderWidth: moderateScale(3),
    borderColor: COLORS.successBg,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -moderateScale(2),
    right: -moderateScale(2),
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(12),
  },
  profileInfo: {
    flex: 1,
    marginLeft: moderateScale(14),
  },
  profileName: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray900,
    marginBottom: verticalScale(2),
  },
  profileEmail: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginBottom: verticalScale(8),
  },
  profileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  profileMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(4),
  },
  profileMetaText: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
  },
  profileMetaDot: {
    width: moderateScale(3),
    height: moderateScale(3),
    borderRadius: moderateScale(2),
    backgroundColor: COLORS.gray400,
    marginHorizontal: moderateScale(8),
  },
  scrollView: {
    marginTop: verticalScale(60),
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: moderateScale(16),
    gap: moderateScale(8),
  },
  statCard: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    alignItems: 'center',
    ...SHADOWS.md,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  statIcon: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  statValue: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: COLORS.gray900,
    marginBottom: verticalScale(2),
  },
  statLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    textAlign: 'center',
  },
  verificationCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(16),
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    ...SHADOWS.sm,
  },
  verificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationIconWrap: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  verificationInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  verificationTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(2),
  },
  verificationSubtitle: {
    fontSize: RESPONSIVE.fontSize.small,
  },
  verificationBadge: {
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(6),
    borderRadius: RESPONSIVE.borderRadius.small,
  },
  verificationBadgeText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '700',
  },
  vehicleCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(16),
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    ...SHADOWS.sm,
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(16),
    paddingBottom: verticalScale(14),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  vehicleIconWrap: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginLeft: moderateScale(12),
  },
  vehicleDetails: {},
  vehicleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: verticalScale(10),
  },
  vehicleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
  },
  vehicleLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
  },
  vehicleValue: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: COLORS.gray800,
  },
  vehicleDivider: {
    height: 1,
    backgroundColor: COLORS.gray100,
  },
  section: {
    marginTop: verticalScale(24),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(12),
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: moderateScale(8),
  },
  achievementCard: {
    width: '31%',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(12),
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  achievementCardLocked: {
    opacity: 0.65,
  },
  achievementIcon: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  achievementTitle: {
    fontSize: fontScale(11),
    fontWeight: '600',
    color: COLORS.gray700,
    textAlign: 'center',
    marginBottom: verticalScale(6),
  },
  achievementTitleLocked: {
    color: COLORS.gray400,
  },
  progressBarBg: {
    width: '100%',
    height: moderateScale(4),
    backgroundColor: COLORS.gray200,
    borderRadius: moderateScale(2),
    overflow: 'hidden',
    marginBottom: verticalScale(4),
  },
  progressBarFill: {
    height: '100%',
    borderRadius: moderateScale(2),
  },
  progressText: {
    fontSize: fontScale(9),
    fontWeight: '700',
  },
  menuSection: {
    marginTop: verticalScale(24),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  menuSectionTitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.gray500,
    marginBottom: verticalScale(10),
    textTransform: 'uppercase',
    letterSpacing: moderateScale(0.5),
  },
  menuCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: moderateScale(14),
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  menuIconWrap: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemInfo: {
    flex: 1,
    marginLeft: moderateScale(14),
  },
  menuLabel: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: COLORS.gray800,
  },
  menuSubtitle: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginTop: verticalScale(2),
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(24),
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    borderWidth: 1,
    borderColor: COLORS.errorLight,
    gap: moderateScale(8),
  },
  logoutIconWrap: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: COLORS.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: COLORS.error,
  },
  versionText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    textAlign: 'center',
    marginTop: verticalScale(20),
  },
});
