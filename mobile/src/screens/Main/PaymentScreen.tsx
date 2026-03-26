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
  Platform,
  TextInput,
  Keyboard,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { paymentConfigService } from '../../services/api';
import { COLORS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS, deviceWidth } from '../../utils/responsive';

const TIP_OPTIONS = [
  { label: 'No tip', value: 0 },
  { label: '₱10', value: 10 },
  { label: '₱20', value: 20 },
  { label: '₱50', value: 50 },
  { label: 'Custom', value: -1 },
];

export default function PaymentScreen({ route, navigation }: any) {
  const { type, amount, serviceType, rideId, pickup, dropoff } = route.params || {};
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [referenceNo] = useState(() => `OMJI-${Date.now().toString(36).toUpperCase()}`);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tip state
  const [selectedTipIndex, setSelectedTipIndex] = useState(0); // 0 = No tip
  const [customTip, setCustomTip] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const isGcash = type === 'gcash';
  const brandName = isGcash ? 'GCash' : 'Maya';
  const baseFare = Number(amount) || 0;

  const tipAmount = selectedTipIndex === 4
    ? (Number(customTip) || 0)
    : TIP_OPTIONS[selectedTipIndex].value;
  const totalAmount = baseFare + tipAmount;

  useEffect(() => {
    fetchConfig();
    // QR image timeout — if it doesn't load within 8s, show fallback
    const qrTimeout = setTimeout(() => {
      if (imageLoading) {
        setImageLoading(false);
        setImageError(true);
      }
    }, 8000);
    return () => {
      clearTimeout(qrTimeout);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Payment session countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          Alert.alert('Session Expired', 'Payment session has expired. Please try again.', [
            { text: 'Go Home', onPress: goHome },
          ]);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Back button goes to home screen directly
  const goHome = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' }],
    });
  };

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
    if (serviceType === 'order') {
      navigation.navigate('Orders');
    } else if (rideId) {
      navigation.replace('Tracking', {
        type: serviceType === 'delivery' ? 'delivery' : 'ride',
        rideId,
        pickup: pickup || '',
        dropoff: dropoff || '',
        fare: totalAmount,
      });
    } else {
      goHome();
    }
  };

  const handleSelectTip = (index: number) => {
    setSelectedTipIndex(index);
    if (index === 4) {
      setShowCustomInput(true);
    } else {
      setShowCustomInput(false);
      setCustomTip('');
      Keyboard.dismiss();
    }
  };

  const serviceLabel =
    serviceType === 'ride' ? 'Ride' : serviceType === 'delivery' ? 'Delivery' : 'Order';

  const timerWarning = timeLeft < 120;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = (timeLeft % 60).toString().padStart(2, '0');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#DC2626" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={goHome}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go home"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={moderateScale(22)} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Payment</Text>
          <Text style={styles.headerSubtitle}>{serviceLabel} • {brandName}</Text>
        </View>
        <View style={[styles.timerBadge, timerWarning && styles.timerBadgeWarning]}>
          <Ionicons name="time-outline" size={moderateScale(14)} color="#ffffff" />
          <Text style={styles.timerText}>{minutes}:{seconds}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Main Payment Card */}
        <View style={styles.card}>
          {/* Reference */}
          <View style={styles.referenceRow}>
            <View style={styles.referenceLeft}>
              <Text style={styles.referenceLabel}>Reference</Text>
              <Text style={styles.referenceValue}>{referenceNo}</Text>
            </View>
            <TouchableOpacity
              style={styles.copyPill}
              onPress={() => copyToClipboard(referenceNo, 'reference')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={copiedField === 'reference' ? 'Reference copied' : 'Copy reference'}
              accessibilityRole="button"
            >
              <Ionicons
                name={copiedField === 'reference' ? 'checkmark' : 'copy-outline'}
                size={moderateScale(12)}
                color="#DC2626"
              />
              <Text style={styles.copyPillText}>
                {copiedField === 'reference' ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Amount Display */}
          <View style={styles.amountSection}>
            <Text style={styles.amountLabel}>TOTAL AMOUNT</Text>
            <Text style={styles.amountValue}>
              {'\u20B1'}{totalAmount.toFixed(2)}
            </Text>
            {tipAmount > 0 && (
              <Text style={styles.amountBreakdown}>
                Fare {'\u20B1'}{baseFare.toFixed(2)} + Tip {'\u20B1'}{tipAmount.toFixed(2)}
              </Text>
            )}
          </View>

          {/* Tip Section */}
          <View style={styles.tipSection}>
            <View style={styles.tipHeaderRow}>
              <Ionicons name="heart-outline" size={moderateScale(16)} color="#DC2626" />
              <Text style={styles.tipTitle}>Add a tip for your rider</Text>
            </View>
            <View style={styles.tipOptions}>
              {TIP_OPTIONS.map((opt, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.tipChip,
                    selectedTipIndex === i && styles.tipChipActive,
                  ]}
                  onPress={() => handleSelectTip(i)}
                  activeOpacity={0.7}
                  accessibilityLabel={`${opt.label} tip${selectedTipIndex === i ? ', selected' : ''}`}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.tipChipText,
                      selectedTipIndex === i && styles.tipChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {showCustomInput && (
              <View style={styles.customTipRow}>
                <Text style={styles.customTipPeso}>{'\u20B1'}</Text>
                <TextInput
                  style={styles.customTipInput}
                  placeholder="Enter tip amount"
                  placeholderTextColor={COLORS.gray400}
                  keyboardType="numeric"
                  value={customTip}
                  onChangeText={(text) => setCustomTip(text.replace(/[^0-9.]/g, ''))}
                  autoFocus
                />
              </View>
            )}
          </View>

          {/* Send To */}
          {!!(config && (config.account_name || config.account_number)) && (
            <View style={styles.sendToCard}>
              <View style={styles.sendToAvatar}>
                <Text style={styles.sendToAvatarText}>
                  {(config.account_name || 'O')[0].toUpperCase()}
                </Text>
              </View>
              <View style={styles.sendToInfo}>
                <Text style={styles.sendToLabel}>Send to</Text>
                {!!config.account_name && (
                  <Text style={styles.sendToName}>{config.account_name}</Text>
                )}
                {!!config.account_number && (
                  <Text style={styles.sendToNumber}>{config.account_number}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.copyPill}
                onPress={() => copyToClipboard(config.account_number, 'account')}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={copiedField === 'account' ? 'Account copied' : 'Copy account number'}
                accessibilityRole="button"
              >
                <Ionicons
                  name={copiedField === 'account' ? 'checkmark' : 'copy-outline'}
                  size={moderateScale(12)}
                  color="#DC2626"
                />
                <Text style={styles.copyPillText}>
                  {copiedField === 'account' ? 'Copied!' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Pay Button — opens GCash/Maya */}
          <TouchableOpacity
            style={styles.payButton}
            onPress={openApp}
            activeOpacity={0.85}
            accessibilityLabel={`Pay ${totalAmount.toFixed(2)} pesos via ${brandName}`}
            accessibilityRole="button"
          >
            <Text style={styles.payButtonText}>
              Pay {'\u20B1'}{totalAmount.toFixed(2)} via {brandName}
            </Text>
            <Ionicons name="arrow-forward" size={moderateScale(20)} color="#ffffff" />
          </TouchableOpacity>

          {/* Copy Amount Helper */}
          <TouchableOpacity
            style={styles.copyAmountRow}
            onPress={() => copyToClipboard(totalAmount.toFixed(2), 'amount')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={copiedField === 'amount' ? 'Amount copied' : 'Copy amount'}
            accessibilityRole="button"
          >
            <Ionicons
              name={copiedField === 'amount' ? 'checkmark-circle' : 'copy-outline'}
              size={moderateScale(16)}
              color={copiedField === 'amount' ? '#10B981' : '#DC2626'}
            />
            <Text style={[styles.copyAmountText, copiedField === 'amount' && { color: '#10B981' }]}>
              {copiedField === 'amount' ? 'Amount copied!' : 'Copy amount to clipboard'}
            </Text>
          </TouchableOpacity>

          {/* Divider with QR */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or scan QR code</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* QR Code */}
          {loading ? (
            <View style={styles.qrPlaceholder}>
              <ActivityIndicator size="large" color="#DC2626" />
              <Text style={styles.loadingText}>Loading QR code...</Text>
            </View>
          ) : config?.qr_code_url && !imageError ? (
            <View style={styles.qrContainer}>
              <View style={styles.qrBorder}>
                {imageLoading && (
                  <View style={styles.qrImageLoader}>
                    <ActivityIndicator size="small" color="#DC2626" />
                  </View>
                )}
                <Image
                  source={{ uri: config.qr_code_url }}
                  style={[styles.qrImage, imageLoading && { opacity: 0 }]}
                  resizeMode="contain"
                  onLoadStart={() => { setImageLoading(true); setImageError(false); }}
                  onLoadEnd={() => setImageLoading(false)}
                  onError={() => { setImageLoading(false); setImageError(true); }}
                />
              </View>
              <Text style={styles.qrHint}>
                Open {brandName} {'>'} Scan QR {'>'} Enter {'\u20B1'}{totalAmount.toFixed(2)}
              </Text>
            </View>
          ) : (
            <View style={styles.qrPlaceholder}>
              <Ionicons name="qr-code-outline" size={moderateScale(40)} color={COLORS.gray300} />
              <Text style={styles.noQrText}>
                QR code not available.{'\n'}Use the pay button above to send payment.
              </Text>
            </View>
          )}

          {/* Warning */}
          <View style={styles.noteCard}>
            <Ionicons name="information-circle" size={moderateScale(18)} color={COLORS.warning} />
            <Text style={styles.noteText}>
              Send exactly {'\u20B1'}{totalAmount.toFixed(2)} to avoid payment issues. Your booking will be processed after confirmation.
            </Text>
          </View>
        </View>

        {/* Completed Payment Button — outside card */}
        <TouchableOpacity
          style={styles.doneButton}
          onPress={handleDone}
          activeOpacity={0.8}
          accessibilityLabel="Confirm payment completed"
          accessibilityRole="button"
        >
          <Ionicons name="checkmark-circle" size={moderateScale(22)} color="#DC2626" />
          <Text style={styles.doneButtonText}>I've Completed Payment</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const qrSize = Math.min(deviceWidth * 0.45, moderateScale(180));

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#DC2626',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(8) : verticalScale(35),
    paddingBottom: verticalScale(16),
    backgroundColor: '#DC2626',
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
  headerTitle: {
    fontSize: fontScale(18),
    fontWeight: 'bold',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: fontScale(12),
    color: 'rgba(255,255,255,0.85)',
    marginTop: verticalScale(2),
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: moderateScale(10),
    paddingVertical: moderateScale(5),
    borderRadius: moderateScale(12),
    gap: moderateScale(4),
  },
  timerBadgeWarning: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  timerText: {
    fontSize: fontScale(13),
    fontWeight: '700',
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
    paddingTop: verticalScale(20),
    paddingBottom: Platform.OS === 'ios' ? verticalScale(32) : verticalScale(40),
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(20),
    padding: moderateScale(20),
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  // Reference
  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryBg,
    padding: moderateScale(12),
    borderRadius: moderateScale(12),
    marginBottom: verticalScale(16),
  },
  referenceLeft: {
    flex: 1,
  },
  referenceLabel: {
    fontSize: fontScale(10),
    color: COLORS.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  referenceValue: {
    fontSize: fontScale(14),
    fontWeight: 'bold',
    color: '#DC2626',
    marginTop: verticalScale(2),
  },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(4),
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: moderateScale(10),
    paddingVertical: moderateScale(5),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  copyPillText: {
    fontSize: fontScale(11),
    fontWeight: '600',
    color: '#DC2626',
  },
  // Amount
  amountSection: {
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    marginBottom: verticalScale(4),
  },
  amountLabel: {
    fontSize: fontScale(11),
    color: COLORS.gray400,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  amountValue: {
    fontSize: fontScale(38),
    fontWeight: '800',
    color: '#DC2626',
    marginTop: verticalScale(4),
  },
  amountBreakdown: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
    marginTop: verticalScale(4),
  },
  // Tips
  tipSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
    paddingTop: verticalScale(14),
    marginBottom: verticalScale(16),
  },
  tipHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(6),
    marginBottom: verticalScale(10),
  },
  tipTitle: {
    fontSize: fontScale(13),
    fontWeight: '600',
    color: COLORS.gray700,
  },
  tipOptions: {
    flexDirection: 'row',
    gap: moderateScale(6),
  },
  tipChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: moderateScale(10),
    borderRadius: moderateScale(10),
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
  tipChipActive: {
    borderColor: '#DC2626',
    backgroundColor: COLORS.primaryBg,
  },
  tipChipText: {
    fontSize: fontScale(12),
    fontWeight: '600',
    color: COLORS.gray500,
  },
  tipChipTextActive: {
    color: '#DC2626',
  },
  customTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(10),
    backgroundColor: COLORS.gray50,
    borderRadius: moderateScale(10),
    borderWidth: 1.5,
    borderColor: '#DC2626',
    paddingHorizontal: moderateScale(12),
  },
  customTipPeso: {
    fontSize: fontScale(16),
    fontWeight: '700',
    color: '#DC2626',
    marginRight: moderateScale(4),
  },
  customTipInput: {
    flex: 1,
    fontSize: fontScale(16),
    color: COLORS.gray800,
    paddingVertical: moderateScale(10),
  },
  // Send To
  sendToCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryBg,
    padding: moderateScale(12),
    borderRadius: moderateScale(12),
    marginBottom: verticalScale(16),
  },
  sendToAvatar: {
    width: moderateScale(38),
    height: moderateScale(38),
    borderRadius: moderateScale(19),
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendToAvatarText: {
    fontSize: fontScale(16),
    fontWeight: 'bold',
    color: '#ffffff',
  },
  sendToInfo: {
    flex: 1,
    marginLeft: moderateScale(10),
  },
  sendToLabel: {
    fontSize: fontScale(10),
    color: COLORS.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sendToName: {
    fontSize: fontScale(14),
    fontWeight: '600',
    color: COLORS.gray800,
    marginTop: verticalScale(1),
  },
  sendToNumber: {
    fontSize: fontScale(13),
    color: COLORS.gray500,
    marginTop: verticalScale(1),
  },
  // Pay Button
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: moderateScale(16),
    borderRadius: moderateScale(14),
    gap: moderateScale(8),
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  payButtonText: {
    fontSize: fontScale(16),
    fontWeight: 'bold',
    color: '#ffffff',
  },
  // Copy amount
  copyAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: moderateScale(6),
    marginTop: verticalScale(12),
    paddingVertical: verticalScale(4),
  },
  copyAmountText: {
    fontSize: fontScale(12),
    fontWeight: '500',
    color: '#DC2626',
  },
  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(16),
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.gray200,
  },
  dividerText: {
    fontSize: fontScale(11),
    color: COLORS.gray400,
    marginHorizontal: moderateScale(12),
  },
  // QR
  qrContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  qrBorder: {
    padding: moderateScale(10),
    borderWidth: 2,
    borderColor: '#FCA5A5',
    borderRadius: moderateScale(14),
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
    fontSize: fontScale(11),
    color: COLORS.gray400,
    marginTop: verticalScale(8),
    textAlign: 'center',
  },
  qrPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(24),
  },
  loadingText: {
    fontSize: fontScale(13),
    color: COLORS.gray500,
    marginTop: verticalScale(10),
  },
  noQrText: {
    fontSize: fontScale(12),
    color: COLORS.gray400,
    textAlign: 'center',
    marginTop: verticalScale(10),
    lineHeight: fontScale(18),
  },
  // Warning
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.warningBg,
    padding: moderateScale(12),
    borderRadius: moderateScale(10),
    gap: moderateScale(8),
  },
  noteText: {
    flex: 1,
    fontSize: fontScale(11),
    color: COLORS.gray600,
    lineHeight: fontScale(16),
  },
  // Done Button — outside card
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(14),
    paddingVertical: moderateScale(16),
    borderRadius: moderateScale(14),
    borderWidth: 2,
    borderColor: '#DC2626',
    backgroundColor: COLORS.white,
    gap: moderateScale(8),
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  doneButtonText: {
    fontSize: fontScale(15),
    fontWeight: 'bold',
    color: '#DC2626',
  },
});
