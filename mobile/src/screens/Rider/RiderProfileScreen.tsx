import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function RiderProfileScreen({ navigation }: any) {
  const riderProfile = {
    name: 'Juan Dela Cruz',
    email: 'juan.delacruz@example.com',
    phone: '+63 912 345 6789',
    avatar: 'https://via.placeholder.com/100?text=Rider',
    rating: 4.9,
    totalRides: 245,
    vehicleType: 'Motorcycle',
    plateNumber: 'ABC 1234',
    licenseNumber: 'N01-23-456789',
    joinedDate: 'January 2024',
  };

  const stats = [
    { label: 'Total Rides', value: '245', icon: 'bicycle', color: '#3B82F6' },
    { label: 'Rating', value: '4.9', icon: 'star', color: '#FBBF24' },
    { label: 'Acceptance', value: '95%', icon: 'checkmark-circle', color: '#10B981' },
    { label: 'Completion', value: '98%', icon: 'checkmark-done', color: '#10B981' },
  ];

  const achievements = [
    { title: '100 Rides', icon: 'trophy', color: '#FBBF24', earned: true },
    { title: '5-Star Rider', icon: 'star', color: '#FBBF24', earned: true },
    { title: 'Early Bird', icon: 'sunny', color: '#F59E0B', earned: true },
    { title: '200 Rides', icon: 'trophy', color: '#3B82F6', earned: true },
    { title: 'Night Owl', icon: 'moon', color: '#6366F1', earned: false },
    { title: '500 Rides', icon: 'trophy', color: '#EF4444', earned: false },
  ];

  const menuSections = [
    {
      title: 'Vehicle',
      items: [
        { icon: 'bicycle-outline', label: 'Vehicle Details', screen: 'RiderProfile' },
        { icon: 'document-text-outline', label: 'Documents', screen: 'RiderProfile' },
      ],
    },
    {
      title: 'Performance',
      items: [
        { icon: 'stats-chart-outline', label: 'Statistics', screen: 'RiderProfile' },
        { icon: 'star-outline', label: 'Ratings & Reviews', screen: 'RiderProfile' },
      ],
    },
    {
      title: 'Account',
      items: [
        { icon: 'person-outline', label: 'Edit Profile', screen: 'RiderProfile' },
        { icon: 'card-outline', label: 'Bank Account', screen: 'RiderProfile' },
        { icon: 'shield-outline', label: 'Privacy & Security', screen: 'RiderProfile' },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help-circle-outline', label: 'Help Center', screen: 'RiderProfile' },
        { icon: 'book-outline', label: 'Rider Guide', screen: 'RiderProfile' },
        { icon: 'chatbubble-outline', label: 'Contact Support', screen: 'RiderProfile' },
      ],
    },
  ];

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          // Handle logout
          navigation.navigate('Home');
        },
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
        <TouchableOpacity>
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

        {/* Vehicle Info */}
        <View style={styles.vehicleCard}>
          <View style={styles.vehicleHeader}>
            <Ionicons name="bicycle" size={28} color="#3B82F6" />
            <Text style={styles.vehicleTitle}>Vehicle Information</Text>
          </View>
          <View style={styles.vehicleDetails}>
            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleLabel}>Type</Text>
              <Text style={styles.vehicleValue}>{riderProfile.vehicleType}</Text>
            </View>
            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleLabel}>Plate Number</Text>
              <Text style={styles.vehicleValue}>{riderProfile.plateNumber}</Text>
            </View>
            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleLabel}>License Number</Text>
              <Text style={styles.vehicleValue}>{riderProfile.licenseNumber}</Text>
            </View>
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
                  onPress={() => navigation.navigate(item.screen)}
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  profileCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    padding: 24,
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
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  profileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  profilePhone: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 6,
  },
  profileJoined: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 6,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginTop: 20,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    margin: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  vehicleCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  vehicleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 12,
  },
  vehicleDetails: {},
  vehicleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  vehicleLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  vehicleValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  achievementCard: {
    width: '31%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    margin: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  achievementCardLocked: {
    opacity: 0.5,
  },
  achievementIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  achievementTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  achievementTitleLocked: {
    color: '#9CA3AF',
  },
  menuSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  menuSectionTitle: {
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
