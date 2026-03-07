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
import { driverService } from '../../services/api';
import { RESPONSIVE, verticalScale, moderateScale, fontScale, isIOS } from '../../utils/responsive';

export default function RiderProfileScreen({ navigation }: any) {
  const { user, logout, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [earningsData, setEarningsData] = useState<any>({});

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsubscribe;
  }, [navigation]);

  const [driverData, setDriverData] = useState<any>({});

  const fetchData = async () => {
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
      console.error('Error fetching rider data:', error);
    } finally {
      setLoading(false);
    }
  };

  const riderProfile = {
    name: user?.name || 'Rider',
    email: user?.email || '',
    phone: user?.phone || '',
    avatar: user?.profile_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'R')}&background=10B981&color=fff&size=200`,
    rating: Number(user?.rating || earningsData.rating) || 0,
    totalRides: earningsData.completed_rides || 0,
    vehicleType: driverData.vehicle_type || 'Motorcycle',
    plateNumber: driverData.vehicle_plate || '-',
    licenseNumber: driverData.license_number || '-',
    joinedDate: (user as any)?.created_at ? new Date((user as any).created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Member',
  };

  const totalRides = riderProfile.totalRides;

  const stats = [
    { label: 'Total Rides', value: `${totalRides}`, icon: 'bicycle', color: '#3B82F6' },
    { label: 'Rating', value: `${riderProfile.rating.toFixed(1)}`, icon: 'star', color: '#FBBF24' },
    { label: 'Acceptance', value: earningsData.acceptance_rate ? `${earningsData.acceptance_rate}%` : totalRides > 0 ? '-' : '-', icon: 'checkmark-circle', color: '#10B981' },
    { label: 'Completion', value: earningsData.completion_rate ? `${earningsData.completion_rate}%` : totalRides > 0 ? '-' : '-', icon: 'checkmark-done', color: '#10B981' },
  ];

  const achievements = [
    { title: 'First Ride', icon: 'trophy', color: '#FBBF24', earned: totalRides >= 1 },
    { title: '5-Star Rider', icon: 'star', color: '#FBBF24', earned: riderProfile.rating >= 4.5 },
    { title: '10 Rides', icon: 'sunny', color: '#F59E0B', earned: totalRides >= 10 },
    { title: '50 Rides', icon: 'trophy', color: '#3B82F6', earned: totalRides >= 50 },
    { title: '100 Rides', icon: 'moon', color: '#6366F1', earned: totalRides >= 100 },
    { title: '500 Rides', icon: 'trophy', color: '#EF4444', earned: totalRides >= 500 },
  ];

  const menuSections = [
    {
      title: 'Vehicle',
      items: [
        { icon: 'bicycle-outline', label: 'Vehicle Details', action: () => Alert.alert('Vehicle Details', `Type: ${riderProfile.vehicleType}\nPlate: ${riderProfile.plateNumber}\nModel: ${riderProfile.licenseNumber}`) },
        { icon: 'document-text-outline', label: 'Documents', action: () => Alert.alert('Documents', 'Your documents have been verified and are on file.\n\nTo update documents, please contact support.') },
      ],
    },
    {
      title: 'Performance',
      items: [
        { icon: 'stats-chart-outline', label: 'Statistics', action: () => navigation.navigate('RiderEarnings') },
        { icon: 'star-outline', label: 'Ratings & Reviews', action: () => Alert.alert('Ratings', `Your Rating: ${riderProfile.rating.toFixed(1)} \u2B50\nTotal Ratings: ${user?.total_ratings || 0}\nTotal Rides: ${totalRides}\n\nKeep providing great service!`) },
      ],
    },
    {
      title: 'Account',
      items: [
        { icon: 'person-outline', label: 'Edit Profile', action: () => Alert.alert('Edit Profile', `Name: ${riderProfile.name}\nEmail: ${riderProfile.email}\nPhone: ${riderProfile.phone}\n\nContact support to update your profile information.`) },
        { icon: 'card-outline', label: 'Bank Account', action: () => Alert.alert('Bank Account', 'Manage your payout account.\n\nCurrently using the account registered during signup.\nContact support to update your bank details.') },
        { icon: 'shield-outline', label: 'Privacy & Security', action: () => Alert.alert('Privacy & Security', 'Your data is encrypted and protected.\n\n\u2022 Location shared only during active rides\n\u2022 Personal info never shared with passengers\n\u2022 You can request data deletion anytime') },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help-circle-outline', label: 'Help Center', action: () => Alert.alert('Help Center', 'For assistance:\n\nEmail: support@omji.app\nPhone: +63 912 345 6789\nHours: 8AM - 10PM daily\n\nFAQ:\n\u2022 How to accept rides?\n\u2022 How to withdraw earnings?\n\u2022 How to update vehicle info?') },
        { icon: 'book-outline', label: 'Rider Guide', action: () => Alert.alert('Rider Guide', 'OMJI Rider Guide\n\n1. Go online to receive ride requests\n2. Accept requests within 30 seconds\n3. Navigate to pickup location\n4. Confirm pickup with customer\n5. Complete the ride at destination\n6. Earnings are added to your wallet\n\nTips:\n\u2022 Maintain a high rating\n\u2022 Stay in busy areas\n\u2022 Be polite and professional') },
        { icon: 'chatbubble-outline', label: 'Contact Support', action: () => Alert.alert('Contact Support', 'Email: driver-support@omji.app\nPhone: +63 912 345 6789\nHours: 24/7 for driver support') },
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={() => Alert.alert('Settings', 'Rider Settings', [
          { text: 'View Earnings', onPress: () => navigation.navigate('RiderEarnings') },
          { text: 'Switch to User Mode', onPress: () => {
            Alert.alert('Switch Mode', 'Switch back to user mode?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Switch', onPress: () => {
                updateUser({ role: 'user' });
              }},
            ]);
          }},
          { text: 'Logout', style: 'destructive', onPress: handleLogout },
          { text: 'Cancel', style: 'cancel' },
        ])}>
          <Ionicons name="settings-outline" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: riderProfile.avatar }}
              style={styles.avatar}
            />
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={24} color="#10B981" />
            </View>
          </View>
          <Text style={styles.profileName}>{riderProfile.name}</Text>
          <Text style={styles.profileEmail}>{riderProfile.email}</Text>
          <View style={styles.profileMeta}>
            <Ionicons name="call-outline" size={16} color="#6B7280" />
            <Text style={styles.profilePhone}>{riderProfile.phone}</Text>
          </View>
          <View style={styles.profileMeta}>
            <Ionicons name="calendar-outline" size={16} color="#6B7280" />
            <Text style={styles.profileJoined}>Joined {riderProfile.joinedDate}</Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {stats.map((stat, index) => (
            <View key={index} style={styles.statCard}>
              <View
                style={[
                  styles.statIcon,
                  { backgroundColor: `${stat.color}20` },
                ]}
              >
                <Ionicons
                  name={stat.icon as any}
                  size={20}
                  color={stat.color}
                />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Verification Status */}
        <View style={[styles.vehicleCard, { marginBottom: 0 }]}>
          <View style={styles.vehicleHeader}>
            <Ionicons
              name={driverData.is_verified ? 'shield-checkmark' : 'shield-outline'}
              size={28}
              color={driverData.is_verified ? '#10B981' : '#F59E0B'}
            />
            <Text style={styles.vehicleTitle}>Verification Status</Text>
            <View style={{
              marginLeft: 'auto',
              backgroundColor: driverData.is_verified ? '#ECFDF5' : '#FEF3C7',
              paddingHorizontal: moderateScale(12),
              paddingVertical: moderateScale(4),
              borderRadius: RESPONSIVE.borderRadius.small,
            }}>
              <Text style={{
                fontSize: RESPONSIVE.fontSize.small,
                fontWeight: '600',
                color: driverData.is_verified ? '#10B981' : '#F59E0B',
              }}>
                {driverData.is_verified ? 'Verified' : 'Pending'}
              </Text>
            </View>
          </View>
        </View>

        {/* Vehicle Info */}
        <View style={styles.vehicleCard}>
          <View style={styles.vehicleHeader}>
            <Ionicons name={(driverData.vehicle_type === 'car' ? 'car' : 'navigate-circle') as any} size={28} color="#3B82F6" />
            <Text style={styles.vehicleTitle}>Vehicle Information</Text>
          </View>
          <View style={styles.vehicleDetails}>
            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleLabel}>Type</Text>
              <Text style={styles.vehicleValue}>{driverData.vehicle_type || riderProfile.vehicleType}</Text>
            </View>
            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleLabel}>Plate Number</Text>
              <Text style={styles.vehicleValue}>{driverData.vehicle_plate || riderProfile.plateNumber}</Text>
            </View>
            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleLabel}>Model</Text>
              <Text style={styles.vehicleValue}>{driverData.vehicle_model || riderProfile.licenseNumber}</Text>
            </View>
            {!!driverData.license_number && (
              <View style={styles.vehicleRow}>
                <Text style={styles.vehicleLabel}>License Number</Text>
                <Text style={styles.vehicleValue}>{driverData.license_number}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Achievements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Achievements</Text>
          <View style={styles.achievementsGrid}>
            {achievements.map((achievement, index) => (
              <View
                key={index}
                style={[
                  styles.achievementCard,
                  !achievement.earned && styles.achievementCardLocked,
                ]}
              >
                <View
                  style={[
                    styles.achievementIcon,
                    { backgroundColor: achievement.earned ? `${achievement.color}20` : '#F3F4F6' },
                  ]}
                >
                  <Ionicons
                    name={achievement.icon as any}
                    size={24}
                    color={achievement.earned ? achievement.color : '#D1D5DB'}
                  />
                </View>
                <Text
                  style={[
                    styles.achievementTitle,
                    !achievement.earned && styles.achievementTitleLocked,
                  ]}
                >
                  {achievement.title}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Menu Sections */}
        {menuSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={itemIndex}
                  style={[
                    styles.menuItem,
                    itemIndex < section.items.length - 1 && styles.menuItemBorder,
                  ]}
                  onPress={() => item.action?.()}
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
        <Text style={styles.versionText}>Rider App Version 1.0.0</Text>

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
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  profileCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(20),
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(24),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(4),
    elevation: 2,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: verticalScale(16),
  },
  avatar: {
    width: moderateScale(100),
    height: moderateScale(100),
    borderRadius: moderateScale(50),
    borderWidth: moderateScale(4),
    borderColor: '#E5E7EB',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
  },
  profileName: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(4),
  },
  profileEmail: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
    marginBottom: verticalScale(12),
  },
  profileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(4),
  },
  profilePhone: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
    marginLeft: moderateScale(6),
  },
  profileJoined: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
    marginLeft: moderateScale(6),
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: moderateScale(16),
    marginTop: verticalScale(20),
  },
  statCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    alignItems: 'center',
    margin: moderateScale(4),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(4),
    elevation: 2,
  },
  statIcon: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  statValue: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(4),
  },
  statLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    textAlign: 'center',
  },
  vehicleCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(20),
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(20),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(4),
    elevation: 2,
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(16),
    paddingBottom: verticalScale(16),
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  vehicleTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: moderateScale(12),
  },
  vehicleDetails: {},
  vehicleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: verticalScale(10),
  },
  vehicleLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
  },
  vehicleValue: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: '#1F2937',
  },
  section: {
    marginTop: verticalScale(24),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(12),
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: moderateScale(-4),
  },
  achievementCard: {
    width: '31%',
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(12),
    alignItems: 'center',
    margin: moderateScale(4),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(4),
    elevation: 2,
  },
  achievementCardLocked: {
    opacity: 0.5,
  },
  achievementIcon: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  achievementTitle: {
    fontSize: fontScale(11),
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  achievementTitleLocked: {
    color: '#9CA3AF',
  },
  menuSection: {
    marginTop: verticalScale(24),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  menuSectionTitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: verticalScale(12),
    textTransform: 'uppercase',
    letterSpacing: moderateScale(0.5),
  },
  menuCard: {
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(4),
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: moderateScale(16),
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
    marginTop: verticalScale(24),
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
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
    marginTop: verticalScale(24),
  },
});
