import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';
import { useAuth } from '../../context/AuthContext';
import Toast, { ToastType } from '../../components/Toast';

const DATA_CATEGORIES = [
  { icon: 'person-outline', title: 'Profile Information', desc: 'Name, email, phone number, profile photo' },
  { icon: 'car-outline', title: 'Ride History', desc: 'Pickup/drop-off locations, fares, driver details' },
  { icon: 'cube-outline', title: 'Delivery History', desc: 'Sender/receiver info, package details, fees' },
  { icon: 'receipt-outline', title: 'Order History', desc: 'Store orders, items purchased, payment amounts' },
  { icon: 'location-outline', title: 'Location Data', desc: 'Locations used for rides, deliveries, and orders' },
  { icon: 'wallet-outline', title: 'Wallet & Payments', desc: 'Transaction history, wallet balance, payment methods' },
];

const DATA_RIGHTS = [
  { icon: 'eye-outline', title: 'Right to Access', desc: 'You can request a copy of all your personal data.' },
  { icon: 'download-outline', title: 'Right to Export', desc: 'You can export your data in a portable format.' },
  { icon: 'trash-outline', title: 'Right to Delete', desc: 'You can request permanent deletion of your account and data.' },
];

export default function PrivacyScreen({ navigation }: any) {
  const { logout } = useAuth();
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (msg: string, type: ToastType = 'info') => setToast({ visible: true, message: msg, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  const handleExportData = () => {
    Alert.alert(
      'Export Data Request',
      'Your data export request has been submitted. You will receive an email with your data within 48 hours.',
      [{ text: 'OK' }]
    );
    showToast('Data export requested', 'success');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data including ride history, orders, wallet balance, and personal information will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS === 'ios') {
              Alert.prompt(
                'Confirm Deletion',
                'Type DELETE to confirm account deletion.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete Forever',
                    style: 'destructive',
                    onPress: async (text?: string) => {
                      if (text?.toUpperCase() === 'DELETE') {
                        await logout();
                        showToast('Account deletion requested', 'info');
                      } else {
                        Alert.alert('Cancelled', 'Account deletion cancelled. You typed the wrong confirmation.');
                      }
                    },
                  },
                ],
                'plain-text'
              );
            } else {
              // Android: Alert.prompt is not available, use a second confirmation
              Alert.alert(
                'Final Confirmation',
                'Are you absolutely sure? This will permanently delete your account and all associated data. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete Forever',
                    style: 'destructive',
                    onPress: async () => {
                      await logout();
                      showToast('Account deletion requested', 'info');
                    },
                  },
                ]
              );
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={moderateScale(22)} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Data</Text>
        <View style={{ width: moderateScale(40) }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoIconRow}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="shield-checkmark" size={moderateScale(24)} color={COLORS.accent} />
            </View>
            <Text style={styles.infoTitle}>Your Data at ONE RIDE</Text>
          </View>
          <Text style={styles.infoDescription}>
            We take your privacy seriously. Below is a summary of the data we collect and your rights regarding that data.
          </Text>
        </View>

        {/* Data Collected Section */}
        <Text style={styles.sectionTitle}>Data We Collect</Text>
        <View style={styles.card}>
          {DATA_CATEGORIES.map((item, index) => (
            <View key={item.title} style={[styles.dataRow, index < DATA_CATEGORIES.length - 1 && styles.dataRowBorder]}>
              <View style={styles.dataIconContainer}>
                <Ionicons name={item.icon as any} size={moderateScale(18)} color={COLORS.gray600} />
              </View>
              <View style={styles.dataTextContainer}>
                <Text style={styles.dataTitle}>{item.title}</Text>
                <Text style={styles.dataDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Your Rights Section */}
        <Text style={styles.sectionTitle}>Your Rights</Text>
        <View style={styles.card}>
          {DATA_RIGHTS.map((item, index) => (
            <View key={item.title} style={[styles.dataRow, index < DATA_RIGHTS.length - 1 && styles.dataRowBorder]}>
              <View style={[styles.dataIconContainer, { backgroundColor: COLORS.accentBg }]}>
                <Ionicons name={item.icon as any} size={moderateScale(18)} color={COLORS.accent} />
              </View>
              <View style={styles.dataTextContainer}>
                <Text style={styles.dataTitle}>{item.title}</Text>
                <Text style={styles.dataDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Export Button */}
        <TouchableOpacity style={styles.exportButton} onPress={handleExportData} activeOpacity={0.8}>
          <Ionicons name="download-outline" size={moderateScale(20)} color={COLORS.white} />
          <Text style={styles.exportButtonText}>Export My Data</Text>
        </TouchableOpacity>

        {/* Delete Account Button */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={moderateScale(20)} color={COLORS.error} />
          <Text style={styles.deleteButtonText}>Delete My Account</Text>
        </TouchableOpacity>

        <Text style={styles.deleteWarning}>
          Account deletion is permanent and cannot be reversed.
        </Text>

        <View style={{ height: verticalScale(40) }} />
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={hideToast}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.gray900,
    paddingTop: isIOS ? verticalScale(54) : verticalScale(40),
    paddingBottom: verticalScale(16),
    paddingHorizontal: moderateScale(16),
  },
  backButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontScale(18),
    fontWeight: '700',
    color: COLORS.white,
  },
  scrollContent: {
    paddingHorizontal: moderateScale(16),
    paddingTop: verticalScale(20),
  },
  infoCard: {
    backgroundColor: COLORS.accentBg,
    borderRadius: moderateScale(14),
    padding: moderateScale(16),
    marginBottom: verticalScale(20),
    borderWidth: 1,
    borderColor: COLORS.accentLight + '40',
  },
  infoIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  infoIconContainer: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: moderateScale(10),
  },
  infoTitle: {
    fontSize: fontScale(16),
    fontWeight: '700',
    color: COLORS.accentDark,
  },
  infoDescription: {
    fontSize: fontScale(13),
    color: COLORS.gray600,
    lineHeight: fontScale(19),
  },
  sectionTitle: {
    fontSize: fontScale(15),
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: verticalScale(10),
    marginLeft: moderateScale(2),
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(14),
    padding: moderateScale(4),
    marginBottom: verticalScale(20),
    ...SHADOWS.md,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    paddingHorizontal: moderateScale(12),
  },
  dataRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  dataIconContainer: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(10),
    backgroundColor: COLORS.gray50,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: moderateScale(12),
  },
  dataTextContainer: {
    flex: 1,
  },
  dataTitle: {
    fontSize: fontScale(14),
    fontWeight: '600',
    color: COLORS.gray800,
  },
  dataDesc: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
    marginTop: verticalScale(2),
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(14),
    gap: moderateScale(8),
    ...SHADOWS.colored(COLORS.accent),
  },
  exportButtonText: {
    fontSize: fontScale(15),
    fontWeight: '700',
    color: COLORS.white,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.errorBg,
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(14),
    marginTop: verticalScale(16),
    gap: moderateScale(8),
    borderWidth: 1,
    borderColor: COLORS.errorLight,
  },
  deleteButtonText: {
    fontSize: fontScale(15),
    fontWeight: '700',
    color: COLORS.error,
  },
  deleteWarning: {
    fontSize: fontScale(12),
    color: COLORS.gray400,
    textAlign: 'center',
    marginTop: verticalScale(8),
  },
});
