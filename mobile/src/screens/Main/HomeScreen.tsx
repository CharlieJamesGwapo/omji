import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getCardWidth, RESPONSIVE, isTablet } from '../../utils/responsive';

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();

  const services = [
    {
      id: 'pasugo',
      name: 'Pasugo',
      description: 'Delivery Service',
      icon: 'cube-outline',
      color: '#3B82F6',
      gradient: ['#3B82F6', '#2563EB'],
      screen: 'Pasugo',
    },
    {
      id: 'pasabay',
      name: 'Pasabay',
      description: 'Ride Sharing',
      icon: 'bicycle-outline',
      color: '#10B981',
      gradient: ['#10B981', '#059669'],
      screen: 'Pasabay',
    },
    {
      id: 'pasundo',
      name: 'Pasundo',
      description: 'Pick-up Service',
      icon: 'people-outline',
      color: '#F59E0B',
      gradient: ['#F59E0B', '#D97706'],
      screen: 'Pasundo',
    },
    {
      id: 'stores',
      name: 'Stores',
      description: 'Shop & Deliver',
      icon: 'storefront-outline',
      color: '#EF4444',
      gradient: ['#EF4444', '#DC2626'],
      screen: 'Services',
    },
  ];

  const quickActions = [
    { icon: 'wallet-outline', label: 'Wallet', screen: 'Wallet' },
    { icon: 'time-outline', label: 'History', screen: 'RideHistory' },
    { icon: 'gift-outline', label: 'Promos', screen: 'Profile' },
    { icon: 'help-circle-outline', label: 'Help', screen: 'Profile' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello,</Text>
          <Text style={styles.userName}>{user?.name || 'Guest'}</Text>
        </View>
        <TouchableOpacity style={styles.notificationButton}>
          <Ionicons name="notifications-outline" size={24} color="#1F2937" />
          <View style={styles.notificationBadge} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Banner */}
        <View style={styles.banner}>
          <Image
            source={require('../../../assets/icon.png')}
            style={styles.bannerLogo}
          />
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>OMJI - Balingasag</Text>
            <Text style={styles.bannerSubtitle}>
              One App. All Rides. All Services.
            </Text>
          </View>
        </View>

        {/* Service Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Our Services</Text>
          <View style={styles.servicesGrid}>
            {services.map((service) => (
              <TouchableOpacity
                key={service.id}
                style={[styles.serviceCard, { backgroundColor: service.color }]}
                onPress={() => navigation.navigate(service.screen)}
                activeOpacity={0.8}
              >
                <View style={styles.serviceIconContainer}>
                  <Ionicons name={service.icon as any} size={32} color="#ffffff" />
                </View>
                <Text style={styles.serviceName}>{service.name}</Text>
                <Text style={styles.serviceDescription}>{service.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            {quickActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={styles.quickActionButton}
                onPress={() => navigation.navigate(action.screen)}
              >
                <View style={styles.quickActionIcon}>
                  <Ionicons name={action.icon as any} size={24} color="#3B82F6" />
                </View>
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Promo Banner */}
        <TouchableOpacity style={styles.promoBanner}>
          <Ionicons name="gift" size={32} color="#F59E0B" />
          <View style={styles.promoText}>
            <Text style={styles.promoTitle}>Special Promo!</Text>
            <Text style={styles.promoSubtitle}>Get 20% off your first ride</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Info Section */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#3B82F6" />
          <Text style={styles.infoText}>
            All services available in Balingasag, Misamis Oriental
          </Text>
        </View>
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
    paddingTop: isTablet() ? 40 : 60,
    paddingBottom: RESPONSIVE.paddingVertical,
    backgroundColor: '#ffffff',
  },
  greeting: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
  },
  userName: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  notificationButton: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  scrollContent: {
    padding: RESPONSIVE.paddingHorizontal,
    paddingBottom: 100,
  },
  banner: {
    flexDirection: 'row',
    backgroundColor: '#3B82F6',
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: RESPONSIVE.paddingHorizontal,
    alignItems: 'center',
    marginBottom: RESPONSIVE.marginVertical * 1.5,
  },
  bannerLogo: {
    width: isTablet() ? 80 : 60,
    height: isTablet() ? 80 : 60,
    borderRadius: RESPONSIVE.borderRadius.medium,
    marginRight: 16,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#E0E7FF',
  },
  section: {
    marginBottom: RESPONSIVE.marginVertical * 1.5,
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: RESPONSIVE.marginVertical,
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  serviceCard: {
    width: getCardWidth(isTablet() ? 4 : 2, RESPONSIVE.paddingHorizontal, 16),
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: RESPONSIVE.paddingHorizontal,
    marginBottom: RESPONSIVE.marginVertical,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  serviceIconContainer: {
    width: isTablet() ? 64 : 56,
    height: isTablet() ? 64 : 56,
    borderRadius: isTablet() ? 32 : 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  serviceName: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  serviceDescription: {
    fontSize: RESPONSIVE.fontSize.small,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  quickActionButton: {
    alignItems: 'center',
    width: getCardWidth(isTablet() ? 8 : 4, RESPONSIVE.paddingHorizontal, 16),
    marginBottom: RESPONSIVE.marginVertical,
  },
  quickActionIcon: {
    width: isTablet() ? 64 : 56,
    height: isTablet() ? 64 : 56,
    borderRadius: isTablet() ? 32 : 28,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    textAlign: 'center',
  },
  promoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: RESPONSIVE.paddingVertical,
    marginBottom: RESPONSIVE.marginVertical,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  promoText: {
    flex: 1,
    marginLeft: 16,
  },
  promoTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  promoSubtitle: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingVertical,
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#1F2937',
  },
});
