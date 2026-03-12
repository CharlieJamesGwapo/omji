import React, { useState, useEffect, useRef } from 'react';
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
import * as Clipboard from 'expo-clipboard';
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
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGcash = type === 'gcash';
  const brandColor = isGcash ? '#0050DC' : '#16A34A';
  const brandColorLight = isGcash ? '#EFF6FF' : '#ECFDF5';
  const brandName = isGcash ? 'GCash' : 'Maya';
  const brandIcon = isGcash ? 'phone-portrait' : 'card';
  const displayAmount = Number(amount) || 0;

  useEffect(() => {
    fetchConfig();
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Intercept back gesture to prompt payment confirmation
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (e.data.action.type === 'GO_BACK') {
        e.preventDefault();
        handleDone();
      }
    });
    return unsubscribe;
  }, [navigation, serviceType, rideId, displayAmount, pickup, dropoff]);

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

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setCopiedField(field);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // silent
    }
  };

  const openApp = () => {
    const deepLink = isGcash ? 'gcash://' : 'paymaya://';
    Linking.canOpenURL(deepLink)
      .then((supported) => {
        if (supported) {
          Linking.openURL(deepLink);
        } else {
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
    Alert.alert(
      'Confirm Payment',
      `Have you completed the ${brandName} payment of \u20B1${displayAmount.toFixed(2)}?`,
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: 'Yes, I Paid',
          onPress: () => {
            if (serviceType === 'order') {
              navigation.navigate('Orders');
            } else if (rideId) {
              navigation.replace('Tracking', {
                type: serviceType === 'delivery' ? 'delivery' : 'ride',
                rideId,
                pickup: pickup || '',
                dropoff: dropoff || '',
                fare: displayAmount,
              });
            } else {
              navigation.goBack();
            }
          },
        },
      ]
    );
  };

  const serviceLabel =
    serviceType === 'ride' ? 'Ride' : serviceType === 'delivery' ? 'Delivery' : 'Order';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: brandColor }]}>
      <StatusBar barStyle="light-content" backgroundColor={brandColor} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: brandColor }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
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
            {displayAmount.toFixed(0)}
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

          {/* Step-by-step Instructions */}
          <View style={styles.stepsContainer}>
            <View style={styles.stepRow}>
              <View style={[styles.stepBadge, { backgroundColor: brandColor }]}>
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <Text style={styles.stepText}>Copy the amount and account number below</Text>
            </View>
            <View style={styles.stepRow}>
              <View style={[styles.stepBadge, { backgroundColor: brandColor }]}>
                <Text style={styles.stepBadgeText}>2</Text>
              </View>
              <Text style={styles.stepText}>Tap "Open {brandName}" to go to the app</Text>
            </View>
            <View style={styles.stepRow}>
              <View style={[styles.stepBadge, { backgroundColor: brandColor }]}>
                <Text style={styles.stepBadgeText}>3</Text>
              </View>
              <Text style={styles.stepText}>Send the exact amount, then come back and confirm</Text>
            </View>
          </View>

          {/* Amount Display with Copy */}
          <View style={[styles.amountContainer, { backgroundColor: brandColorLight }]}>
            <Text style={styles.amountLabel}>Amount to Pay</Text>
            <Text style={[styles.amountValue, { color: brandColor }]}>
              {'\u20B1'}{displayAmount.toFixed(2)}
            </Text>
            <TouchableOpacity
              style={[styles.copyButton, { borderColor: brandColor }]}
              onPress={() => copyToClipboard(displayAmount.toFixed(2), 'amount')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={copiedField === 'amount' ? 'checkmark' : 'copy-outline'}
                size={moderateScale(14)}
                color={brandColor}
              />
              <Text style={[styles.copyButtonText, { color: brandColor }]}>
                {copiedField === 'amount' ? 'Copied!' : 'Copy Amount'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Account Info with Copy */}
          {!!(config && (config.account_name || config.account_number)) && (
            <View style={[styles.accountInfoCard, { backgroundColor: brandColorLight }]}>
              <Ionicons
                name="person-circle-outline"
                size={moderateScale(28)}
                color={brandColor}
              />
              <View style={styles.accountInfoText}>
                <Text style={styles.sendToLabel}>Send to</Text>
                {!!config.account_name && (
                  <Text style={styles.accountName}>{config.account_name}</Text>
                )}
                {!!config.account_number && (
                  <View style={styles.accountNumberRow}>
                    <Text style={styles.accountNumber}>{config.account_number}</Text>
                    <TouchableOpacity
                      onPress={() => copyToClipboard(config.account_number, 'account')}
                      style={[styles.copySmallBtn, { backgroundColor: brandColor }]}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={copiedField === 'account' ? 'checkmark' : 'copy-outline'}
                        size={moderateScale(12)}
                        color="#ffffff"
                      />
                      <Text style={styles.copySmallText}>
                        {copiedField === 'account' ? 'Copied!' : 'Copy'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}

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
            <Text style={styles.openAppButtonText}>Open {brandName}</Text>
            <Ionicons name="open-outline" size={moderateScale(16)} color="#ffffff" />
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
              <Text style={styles.qrHint}>
                Open {brandName} app {'>'} Scan QR {'>'} Enter exact amount
              </Text>
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

          {/* Warning Note */}
          <View style={styles.noteCard}>
            <Ionicons
              name="information-circle"
              size={moderateScale(20)}
              color={COLORS.warning}
            />
            <Text style={styles.noteText}>
              Please send the exact amount of {'\u20B1'}{displayAmount.toFixed(2)} to avoid payment issues. Your booking will be processed after confirmation.
            </Text>
          </View>

          {/* Done Button */}
          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: brandColor }]}
            onPress={handleDone}
            activeOpacity={0.8}
          >
            <Ionicons
              name="checkmark-circle"
              size={moderateScale(22)}
              color="#ffffff"
            />
            <Text style={styles.doneButtonText}>
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
  stepsContainer: {
    marginBottom: verticalScale(20),
    gap: verticalScale(10),
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(10),
  },
  stepBadge: {
    width: moderateScale(24),
    height: moderateScale(24),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontSize: fontScale(12),
    fontWeight: 'bold',
    color: '#ffffff',
  },
  stepText: {
    flex: 1,
    fontSize: fontScale(13),
    color: COLORS.gray600,
    lineHeight: fontScale(18),
  },
  amountContainer: {
    alignItems: 'center',
    paddingVertical: verticalScale(16),
    paddingHorizontal: moderateScale(16),
    borderRadius: RESPONSIVE.borderRadius.medium,
    marginBottom: verticalScale(16),
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
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(4),
    marginTop: verticalScale(8),
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(6),
    borderRadius: moderateScale(16),
    borderWidth: 1,
  },
  copyButtonText: {
    fontSize: fontScale(12),
    fontWeight: '600',
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
  sendToLabel: {
    fontSize: fontScale(11),
    color: COLORS.gray400,
    marginBottom: verticalScale(2),
  },
  accountName: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: COLORS.gray800,
  },
  accountNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(4),
    gap: moderateScale(8),
  },
  accountNumber: {
    fontSize: fontScale(14),
    color: COLORS.gray600,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  copySmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(3),
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(3),
    borderRadius: moderateScale(10),
  },
  copySmallText: {
    fontSize: fontScale(10),
    fontWeight: '600',
    color: '#ffffff',
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
  qrHint: {
    fontSize: fontScale(12),
    color: COLORS.gray400,
    marginTop: verticalScale(8),
    textAlign: 'center',
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
    gap: moderateScale(8),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  doneButtonText: {
    fontSize: fontScale(16),
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
