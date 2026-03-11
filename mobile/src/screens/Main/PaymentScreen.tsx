import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { paymentConfigService } from '../../services/api';
import { COLORS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS, deviceWidth } from '../../utils/responsive';

export default function PaymentScreen({ route, navigation }: any) {
  const { type, amount, serviceType, rideId, pickup, dropoff } = route.params || {};
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState(true);

  const isGcash = type === 'gcash';
  const brandColor = isGcash ? '#0050DC' : '#16A34A';
  const brandColorLight = isGcash ? '#EFF6FF' : '#ECFDF5';
  const brandName = isGcash ? 'GCash' : 'Maya';
  const brandIcon = isGcash ? 'phone-portrait' : 'card';

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await paymentConfigService.getConfigs();
      const configs = res.data?.data || [];
      const found = configs.find((c: any) => c.type === type && c.is_active);
      setConfig(found || null);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const openApp = () => {
    const deepLink = isGcash ? 'gcash://' : 'paymaya://';
    Linking.canOpenURL(deepLink)
      .then((supported) => {
        if (supported) {
          Linking.openURL(deepLink);
        } else {
          // Fallback to app store links
          const storeLink = isGcash
            ? isIOS
              ? 'https://apps.apple.com/ph/app/gcash/id520020791'
              : 'https://play.google.com/store/apps/details?id=com.globe.gcash.android'
            : isIOS
              ? 'https://apps.apple.com/ph/app/maya-savings-wallet-pay/id991907993'
              : 'https://play.google.com/store/apps/details?id=com.paymaya';
          Alert.alert(
            `${brandName} Not Installed`,
            `Please install ${brandName} to complete payment, or scan the QR code below.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Get App', onPress: () => Linking.openURL(storeLink) },
            ]
          );
        }
      })
      .catch(() => {
        Alert.alert('Error', `Could not open ${brandName}`);
      });
  };

  const handleDone = () => {
    if (rideId) {
      navigation.replace('Tracking', {
        type: serviceType === 'delivery' ? 'delivery' : 'ride',
        rideId,
        pickup: pickup || '',
        dropoff: dropoff || '',
        fare: amount || 0,
      });
    } else {
      navigation.goBack();
    }
  };

  const serviceLabel =
    serviceType === 'ride' ? 'Ride' : serviceType === 'delivery' ? 'Delivery' : 'Order';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: brandColor }]}>
      <StatusBar barStyle="light-content" backgroundColor={brandColor} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: brandColor }]}>
        <TouchableOpacity onPress={handleDone} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={moderateScale(22)} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerBrandRow}>
            <Ionicons
              name={brandIcon as any}
              size={moderateScale(20)}
              color="#ffffff"
            />
            <Text style={styles.headerTitle}>{brandName} Payment</Text>
          </View>
          <Text style={styles.headerSubtitle}>{serviceLabel} Payment</Text>
        </View>
        <View style={styles.amountBadge}>
          <Text style={styles.amountBadgeText}>
            {'\u20B1'}
            {(amount ?? 0).toFixed(0)}
          </Text>
        </View>
      </View>

      {/* Content Card */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {/* Shield / Security Notice */}
          <View style={styles.securityRow}>
            <View style={[styles.shieldIcon, { backgroundColor: brandColorLight }]}>
              <Ionicons
                name="shield-checkmark"
                size={moderateScale(20)}
                color={brandColor}
              />
            </View>
            <Text style={styles.securityText}>A safer way to pay!</Text>
          </View>

          {/* Instructions */}
          <Text style={styles.instructionText}>
            Complete the payment in your {brandName} app by tapping the button
            below or scanning the QR code.
          </Text>

          {/* Amount Display */}
          <View style={[styles.amountContainer, { backgroundColor: brandColorLight }]}>
            <Text style={styles.amountLabel}>Amount to Pay</Text>
            <Text style={[styles.amountValue, { color: brandColor }]}>
              {'\u20B1'}
              {(amount ?? 0).toFixed(2)}
            </Text>
          </View>

          {/* Open App Button */}
          <TouchableOpacity
            style={[styles.openAppButton, { backgroundColor: brandColor }]}
            onPress={openApp}
            activeOpacity={0.85}
          >
            <Ionicons
              name={isGcash ? 'phone-portrait-outline' : 'card-outline'}
              size={moderateScale(20)}
              color="#ffffff"
            />
            <Text style={styles.openAppButtonText}>Open in {brandName}</Text>
          </TouchableOpacity>

          {/* Divider with "or" */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or scan this QR code</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* QR Code */}
          {loading ? (
            <View style={styles.qrPlaceholder}>
              <ActivityIndicator size="large" color={brandColor} />
              <Text style={styles.loadingText}>Loading QR code...</Text>
            </View>
          ) : config?.qr_code_url ? (
            <View style={styles.qrContainer}>
              <View style={[styles.qrBorder, { borderColor: brandColor }]}>
                {imageLoading && (
                  <View style={styles.qrImageLoader}>
                    <ActivityIndicator size="small" color={brandColor} />
                  </View>
                )}
                <Image
                  source={{ uri: config.qr_code_url }}
                  style={styles.qrImage}
                  resizeMode="contain"
                  onLoadStart={() => setImageLoading(true)}
                  onLoadEnd={() => setImageLoading(false)}
                />
              </View>
            </View>
          ) : (
            <View style={styles.qrPlaceholder}>
              <Ionicons
                name="qr-code-outline"
                size={moderateScale(48)}
                color={COLORS.gray300}
              />
              <Text style={styles.noQrText}>
                QR code not available.{'\n'}Please use the {brandName} app button above.
              </Text>
            </View>
          )}

          {/* Account Info */}
          {config && (config.account_name || config.account_number) && (
            <View style={[styles.accountInfoCard, { backgroundColor: brandColorLight }]}>
              <Ionicons
                name="person-circle-outline"
                size={moderateScale(24)}
                color={brandColor}
              />
              <View style={styles.accountInfoText}>
                {!!config.account_name && (
                  <Text style={styles.accountName}>{config.account_name}</Text>
                )}
                {!!config.account_number && (
                  <Text style={styles.accountNumber}>{config.account_number}</Text>
                )}
              </View>
            </View>
          )}

          {/* Instructions Note */}
          <View style={styles.noteCard}>
            <Ionicons
              name="information-circle"
              size={moderateScale(20)}
              color={COLORS.warning}
            />
            <Text style={styles.noteText}>
              After completing the payment in {brandName}, your booking will be
              processed. Please ensure the correct amount is sent.
            </Text>
          </View>

          {/* Done Button */}
          <TouchableOpacity
            style={[styles.doneButton, { borderColor: brandColor }]}
            onPress={handleDone}
            activeOpacity={0.8}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={moderateScale(20)}
              color={brandColor}
            />
            <Text style={[styles.doneButtonText, { color: brandColor }]}>
              I've Completed Payment
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const qrSize = Math.min(deviceWidth * 0.55, moderateScale(220));

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(8) : verticalScale(35),
    paddingBottom: verticalScale(16),
  },
  backBtn: {
    width: moderateScale(38),
    height: moderateScale(38),
    borderRadius: moderateScale(19),
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  headerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(6),
  },
  headerTitle: {
    fontSize: fontScale(18),
    fontWeight: 'bold',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: fontScale(12),
    color: 'rgba(255,255,255,0.8)',
    marginTop: verticalScale(2),
  },
  amountBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(6),
    borderRadius: moderateScale(16),
  },
  amountBadgeText: {
    fontSize: fontScale(14),
    fontWeight: 'bold',
    color: '#ffffff',
  },
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: moderateScale(24),
    borderTopRightRadius: moderateScale(24),
  },
  scrollContent: {
    padding: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(24),
    paddingBottom: verticalScale(40),
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(24),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  shieldIcon: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: moderateScale(10),
  },
  securityText: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: COLORS.gray600,
  },
  instructionText: {
    fontSize: fontScale(14),
    color: COLORS.gray500,
    lineHeight: fontScale(20),
    marginBottom: verticalScale(20),
  },
  amountContainer: {
    alignItems: 'center',
    paddingVertical: verticalScale(16),
    borderRadius: RESPONSIVE.borderRadius.medium,
    marginBottom: verticalScale(20),
  },
  amountLabel: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
    marginBottom: verticalScale(4),
  },
  amountValue: {
    fontSize: fontScale(32),
    fontWeight: 'bold',
  },
  openAppButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: moderateScale(16),
    borderRadius: moderateScale(50),
    gap: moderateScale(8),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  openAppButtonText: {
    fontSize: fontScale(16),
    fontWeight: 'bold',
    color: '#ffffff',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(20),
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.gray200,
  },
  dividerText: {
    fontSize: fontScale(12),
    color: COLORS.gray400,
    marginHorizontal: moderateScale(12),
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  qrBorder: {
    padding: moderateScale(12),
    borderWidth: 2,
    borderRadius: RESPONSIVE.borderRadius.medium,
    backgroundColor: COLORS.white,
  },
  qrImage: {
    width: qrSize,
    height: qrSize,
  },
  qrImageLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  qrPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(32),
  },
  loadingText: {
    fontSize: fontScale(14),
    color: COLORS.gray500,
    marginTop: verticalScale(12),
  },
  noQrText: {
    fontSize: fontScale(13),
    color: COLORS.gray400,
    textAlign: 'center',
    marginTop: verticalScale(12),
    lineHeight: fontScale(18),
  },
  accountInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: moderateScale(14),
    borderRadius: RESPONSIVE.borderRadius.medium,
    marginBottom: verticalScale(16),
  },
  accountInfoText: {
    marginLeft: moderateScale(10),
    flex: 1,
  },
  accountName: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: COLORS.gray800,
  },
  accountNumber: {
    fontSize: fontScale(13),
    color: COLORS.gray500,
    marginTop: verticalScale(2),
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.warningBg,
    padding: moderateScale(14),
    borderRadius: RESPONSIVE.borderRadius.medium,
    marginBottom: verticalScale(20),
    gap: moderateScale(10),
  },
  noteText: {
    flex: 1,
    fontSize: fontScale(12),
    color: COLORS.gray600,
    lineHeight: fontScale(18),
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: moderateScale(16),
    borderRadius: moderateScale(50),
    borderWidth: 2,
    gap: moderateScale(8),
  },
  doneButtonText: {
    fontSize: fontScale(16),
    fontWeight: 'bold',
  },
});
