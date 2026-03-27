import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { driverService, walletService } from '../../services/api';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, verticalScale, moderateScale, fontScale, isIOS } from '../../utils/responsive';
import Toast, { ToastType } from '../../components/Toast';

export default function RiderEarningsScreen({ navigation }: any) {
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [earningsApiData, setEarningsApiData] = useState<any>({});
  const [walletBalance, setWalletBalance] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  // Withdrawal modal state
  const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
  const [withdrawMethod, setWithdrawMethod] = useState<'gcash' | 'maya'>('gcash');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const fetchEarnings = useCallback(async () => {
    try {
      setLoading(true);
      const [earningsRes, walletRes] = await Promise.allSettled([
        driverService.getEarnings(),
        walletService.getBalance(),
      ]);
      if (earningsRes.status === 'fulfilled') {
        setEarningsApiData(earningsRes.value?.data?.data || {});
      }
      if (walletRes.status === 'fulfilled') {
        setWalletBalance(walletRes.value?.data?.data?.balance ?? 0);
      }
    } catch (error) {
      // Fetch failed - toast will inform user to retry
      showToast('Could not load earnings data. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchEarnings();
    });
    return unsubscribe;
  }, [navigation, fetchEarnings]);

  const balance = walletBalance;
  const minimumWithdraw = 100;

  const periods = [
    { id: 'today', label: 'Today', icon: 'today-outline' as const },
    { id: 'week', label: 'This Week', icon: 'calendar-outline' as const },
    { id: 'month', label: 'This Month', icon: 'calendar' as const },
  ];

  const quickAmounts = [100, 500, 1000];

  const totalRides = earningsApiData.completed_rides ?? 0;
  const dailyEarnings = earningsApiData.today_earnings ?? 0;
  const totalEarnings = earningsApiData.total_earnings ?? 0;

  // Real per-service data from backend
  const rideEarnings = earningsApiData.ride_earnings || 0;
  const rideCount = earningsApiData.ride_count || 0;
  const deliveryEarnings = earningsApiData.delivery_earnings || 0;
  const deliveryCount = earningsApiData.delivery_count || 0;
  const todayRideEarnings = earningsApiData.today_ride_earnings || 0;
  const todayDeliveryEarnings = earningsApiData.today_delivery_earnings || 0;

  const todayRideCount = earningsApiData.today_ride_count || 0;
  const todayDeliveryCount = earningsApiData.today_delivery_count || 0;
  const todayTotalTrips = todayRideCount + todayDeliveryCount;

  const weekRideCount = earningsApiData.week_ride_count || 0;
  const weekRideEarnings = earningsApiData.week_ride_earnings || 0;
  const weekDeliveryCount = earningsApiData.week_delivery_count || 0;
  const weekDeliveryEarnings = earningsApiData.week_delivery_earnings || 0;
  const weekTotal = weekRideEarnings + weekDeliveryEarnings;
  const weekTrips = weekRideCount + weekDeliveryCount;

  const earningsData = {
    today: { total: dailyEarnings, rides: todayTotalTrips, avg: todayTotalTrips > 0 ? Math.round(dailyEarnings / todayTotalTrips) : 0 },
    week: { total: weekTotal, rides: weekTrips, avg: weekTrips > 0 ? Math.round(weekTotal / weekTrips) : 0 },
    month: { total: totalEarnings, rides: totalRides, avg: totalRides > 0 ? Math.round(totalEarnings / totalRides) : 0 },
  };

  const currentData = earningsData[selectedPeriod as keyof typeof earningsData];

  // Calculate breakdown based on period
  const getBreakdown = () => {
    if (selectedPeriod === 'today') {
      return [
        { service: 'Pasundo (Rides)', rides: todayRideCount, earnings: Math.round(todayRideEarnings), color: COLORS.warning, icon: 'navigate-circle' as const },
        { service: 'Pasugo (Deliveries)', rides: todayDeliveryCount, earnings: Math.round(todayDeliveryEarnings), color: COLORS.accent, icon: 'cube' as const },
      ];
    }
    if (selectedPeriod === 'week') {
      return [
        { service: 'Pasundo (Rides)', rides: weekRideCount, earnings: Math.round(weekRideEarnings), color: COLORS.warning, icon: 'navigate-circle' as const },
        { service: 'Pasugo (Deliveries)', rides: weekDeliveryCount, earnings: Math.round(weekDeliveryEarnings), color: COLORS.accent, icon: 'cube' as const },
      ];
    }
    return [
      { service: 'Pasundo (Rides)', rides: rideCount, earnings: Math.round(rideEarnings), color: COLORS.warning, icon: 'navigate-circle' as const },
      { service: 'Pasugo (Deliveries)', rides: deliveryCount, earnings: Math.round(deliveryEarnings), color: COLORS.accent, icon: 'cube' as const },
    ];
  };

  const earningsBreakdown = getBreakdown();

  // Calculate max for bar chart proportional display
  const maxBreakdownEarnings = Math.max(...(earningsBreakdown || []).map(b => b.earnings ?? 0), 1);

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);

    if (isNaN(amount) || amount <= 0 || amount < minimumWithdraw) {
      Alert.alert(
        'Invalid Amount',
        `Minimum withdrawal amount is ₱${minimumWithdraw}`
      );
      return;
    }

    if (amount > balance) {
      Alert.alert('Insufficient Balance', 'You don\'t have enough balance');
      return;
    }

    // Open the withdrawal modal
    setWithdrawModalVisible(true);
  };

  const processWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!accountNumber.trim()) {
      Alert.alert('Missing Info', 'Please enter your account number.');
      return;
    }
    if (!accountName.trim()) {
      Alert.alert('Missing Info', 'Please enter the account holder name.');
      return;
    }
    setWithdrawLoading(true);
    try {
      await driverService.requestWithdrawal({
        amount,
        method: withdrawMethod,
        account_number: accountNumber.trim(),
        account_name: accountName.trim(),
      });
      setWithdrawAmount('');
      setAccountNumber('');
      setAccountName('');
      setWithdrawModalVisible(false);
      showToast(`Withdrawal of ₱${amount} via ${withdrawMethod.toUpperCase()} submitted!`, 'success');
      fetchEarnings();
    } catch (error: any) {
      const msg = error.code === 'ECONNABORTED'
        ? 'Request timed out. Please check your connection and try again.'
        : error.response?.data?.error || 'Failed to process withdrawal. Please try again.';
      Alert.alert('Withdrawal Failed', msg);
    } finally {
      setWithdrawLoading(false);
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <TouchableOpacity
          style={styles.downloadButton}
          onPress={() => Alert.alert('Download Report', 'Coming soon! Earnings report download will be available in a future update.')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Download earnings report"
          accessibilityRole="button"
        >
          <Ionicons name="download-outline" size={moderateScale(22)} color={COLORS.gray800} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await fetchEarnings();
              setRefreshing(false);
            }}
            colors={[COLORS.accent]}
            tintColor={COLORS.accent}
          />
        }
      >
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>Loading earnings...</Text>
          </View>
        )}

        {/* Balance Card */}
        <View style={styles.balanceCardWrapper}>
          <View style={styles.balanceCard}>
            {/* Decorative circles */}
            <View style={styles.balanceDecor1} />
            <View style={styles.balanceDecor2} />

            <View style={styles.balanceHeader}>
              <View style={styles.balanceIconCircle}>
                <Ionicons name="wallet" size={moderateScale(20)} color={COLORS.white} />
              </View>
              <Text style={styles.balanceLabel}>Available Balance</Text>
            </View>
            <Text style={styles.balanceAmount}>₱{balance.toFixed(2)}</Text>

            {/* Quick Amount Buttons */}
            <View style={styles.quickAmountsRow}>
              {quickAmounts.map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={[
                    styles.quickAmountButton,
                    withdrawAmount === String(amt) && styles.quickAmountButtonActive,
                    amt > balance && { opacity: 0.4 },
                  ]}
                  onPress={() => amt <= balance && setWithdrawAmount(String(amt))}
                  disabled={amt > balance}
                  activeOpacity={0.7}
                  accessibilityLabel={`Select ${amt} pesos`}
                  accessibilityRole="button"
                >
                  <Text style={[
                    styles.quickAmountText,
                    withdrawAmount === String(amt) && styles.quickAmountTextActive,
                  ]}>
                    ₱{amt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Withdraw Section */}
            <View style={styles.withdrawSection}>
              <View style={styles.withdrawInputContainer}>
                <Text style={styles.currencySymbol}>₱</Text>
                <TextInput
                  style={styles.withdrawInput}
                  placeholder="Enter amount"
                  placeholderTextColor="rgba(255, 255, 255, 0.4)"
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                  keyboardType="numeric"
                  returnKeyType="done"
                />
              </View>
              <TouchableOpacity
                style={[styles.withdrawButton, withdrawLoading && { opacity: 0.6 }]}
                onPress={handleWithdraw}
                disabled={withdrawLoading}
                activeOpacity={0.8}
                accessibilityLabel={withdrawLoading ? 'Processing withdrawal' : 'Withdraw funds'}
                accessibilityRole="button"
              >
                {withdrawLoading ? (
                  <>
                    <ActivityIndicator color="#059669" size="small" />
                    <Text style={styles.withdrawButtonText}>Processing...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="arrow-up-circle" size={moderateScale(18)} color="#059669" />
                    <Text style={styles.withdrawButtonText}>Withdraw</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.withdrawHint}>
              Min. withdrawal: ₱{minimumWithdraw} | Processing: 1-3 business days
            </Text>
          </View>
        </View>

        {/* Period Selector - Pill Style */}
        <View style={styles.periodSelectorContainer}>
          <View style={styles.periodSelector}>
            {periods.map((period) => (
              <TouchableOpacity
                key={period.id}
                style={[
                  styles.periodPill,
                  selectedPeriod === period.id && styles.periodPillActive,
                ]}
                onPress={() => setSelectedPeriod(period.id)}
                activeOpacity={0.7}
                accessibilityLabel={`${period.label} earnings`}
                accessibilityRole="tab"
                accessibilityState={{ selected: selectedPeriod === period.id }}
              >
                <Ionicons
                  name={period.icon}
                  size={fontScale(14)}
                  color={selectedPeriod === period.id ? COLORS.white : COLORS.gray500}
                />
                <Text
                  style={[
                    styles.periodPillText,
                    selectedPeriod === period.id && styles.periodPillTextActive,
                  ]}
                >
                  {period.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Earnings Summary Cards */}
        <View style={styles.summarySection}>
          {/* Total Earnings Card */}
          <View style={styles.totalEarningsCard}>
            <View style={styles.totalEarningsLeft}>
              <View style={[styles.summaryIconCircle, { backgroundColor: COLORS.successBg }]}>
                <Ionicons name="trending-up" size={moderateScale(22)} color={COLORS.success} />
              </View>
              <View style={styles.totalEarningsInfo}>
                <Text style={styles.totalEarningsLabel}>Total Earnings</Text>
                <Text style={styles.totalEarningsValue}>₱{currentData.total.toLocaleString()}</Text>
              </View>
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.summaryRow}>
            <View style={styles.summarySmallCard}>
              <View style={[styles.smallCardIconCircle, { backgroundColor: COLORS.accentBg }]}>
                <Ionicons name="bicycle" size={moderateScale(18)} color={COLORS.accent} />
              </View>
              <Text style={styles.summarySmallValue}>{currentData.rides}</Text>
              <Text style={styles.summarySmallLabel}>Total Trips</Text>
            </View>
            <View style={styles.summarySmallCard}>
              <View style={[styles.smallCardIconCircle, { backgroundColor: COLORS.warningBg }]}>
                <Ionicons name="analytics" size={moderateScale(18)} color={COLORS.warning} />
              </View>
              <Text style={styles.summarySmallValue}>₱{currentData.avg}</Text>
              <Text style={styles.summarySmallLabel}>Per Trip Avg</Text>
            </View>
          </View>

          {/* Per Trip Average highlight */}
          {currentData.avg > 0 && (
            <View style={styles.perTripCard}>
              <View style={styles.perTripLeft}>
                <Ionicons name="speedometer-outline" size={moderateScale(20)} color={COLORS.info} />
                <View style={styles.perTripInfo}>
                  <Text style={styles.perTripLabel}>Average Earning Per Trip</Text>
                  <Text style={styles.perTripSub}>Based on {currentData.rides} completed trip{currentData.rides !== 1 ? 's' : ''}</Text>
                </View>
              </View>
              <Text style={styles.perTripValue}>₱{currentData.avg}</Text>
            </View>
          )}
        </View>

        {/* Bar Chart Visualization */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Earnings by Service</Text>
          <View style={styles.barChartCard}>
            {earningsBreakdown.map((item) => {
              const barWidth = maxBreakdownEarnings > 0
                ? Math.max(5, (item.earnings / maxBreakdownEarnings) * 100)
                : 5;
              const percentage = currentData.total > 0
                ? Math.round((item.earnings / currentData.total) * 100)
                : 0;

              return (
                <View key={`bar-${item.service}`} style={styles.barChartRow}>
                  <View style={styles.barChartLabel}>
                    <View style={[styles.barChartDot, { backgroundColor: item.color }]} />
                    <Text style={styles.barChartService} numberOfLines={1}>
                      {(item.service || '').split('(')[0].trim()}
                    </Text>
                  </View>
                  <View style={styles.barChartBarContainer}>
                    <View style={styles.barChartBarBg}>
                      <View
                        style={[
                          styles.barChartBarFill,
                          { width: `${barWidth}%`, backgroundColor: item.color },
                        ]}
                      />
                    </View>
                    <Text style={styles.barChartAmount}>₱{(item.earnings ?? 0).toLocaleString()}</Text>
                  </View>
                  <Text style={styles.barChartPercent}>{percentage}%</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Earnings Breakdown with Progress Bars */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detailed Breakdown</Text>
          {earningsBreakdown.map((item) => {
            const percentage = currentData.total > 0
              ? Math.round((item.earnings / currentData.total) * 100)
              : 0;
            return (
              <View key={`breakdown-${item.service}`} style={styles.breakdownCard}>
                <View style={styles.breakdownHeader}>
                  <View style={[styles.breakdownIcon, { backgroundColor: `${item.color}15` }]}>
                    <Ionicons name={item.icon} size={moderateScale(22)} color={item.color} />
                  </View>
                  <View style={styles.breakdownInfo}>
                    <Text style={styles.breakdownService}>{item.service}</Text>
                    <Text style={styles.breakdownRides}>{item.rides} trip{item.rides !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={styles.breakdownEarnings}>
                    <Text style={[styles.breakdownAmount, { color: item.color }]}>₱{(item.earnings ?? 0).toLocaleString()}</Text>
                    <Text style={styles.breakdownPercentage}>{percentage}%</Text>
                  </View>
                </View>
                {/* Progress bar */}
                <View style={styles.breakdownProgressBg}>
                  <View
                    style={[
                      styles.breakdownProgressFill,
                      { width: `${percentage}%`, backgroundColor: item.color },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* Earnings Summary */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Earnings Summary</Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={fetchEarnings}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Refresh earnings data"
              accessibilityRole="button"
            >
              <Ionicons name="refresh-outline" size={fontScale(14)} color={COLORS.accent} />
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {totalRides === 0 ? (
            <View style={styles.emptyEarningCard}>
              <View style={styles.emptyEarningIconCircle}>
                <Ionicons name="bicycle-outline" size={moderateScale(28)} color={COLORS.gray400} />
              </View>
              <Text style={styles.emptyEarningTitle}>No rides yet</Text>
              <Text style={styles.emptyEarningText}>Start accepting rides to see your earnings here</Text>
            </View>
          ) : (
            earningsBreakdown.map((item) => (
              <View key={`earning-${item.service}`} style={styles.earningCard}>
                <View style={[styles.earningIcon, { backgroundColor: `${item.color}12` }]}>
                  <Ionicons
                    name={item.icon}
                    size={moderateScale(20)}
                    color={item.color}
                  />
                </View>
                <View style={styles.earningInfo}>
                  <Text style={styles.earningService}>{item.service}</Text>
                  <Text style={styles.earningDate}>{item.rides} trip{item.rides !== 1 ? 's' : ''} completed</Text>
                </View>
                <Text style={[styles.earningAmount, { color: item.color }]}>₱{(item.earnings ?? 0).toLocaleString()}</Text>
              </View>
            ))
          )}
        </View>

        {/* Payment Info */}
        <View style={styles.paymentInfoCard}>
          <View style={styles.paymentInfoIconCircle}>
            <Ionicons name="information" size={moderateScale(16)} color={COLORS.accent} />
          </View>
          <Text style={styles.paymentInfoText}>
            Withdrawals are processed within 1-3 business days to your
            registered bank account or e-wallet.
          </Text>
        </View>

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>
      {/* Withdrawal Modal */}
      <Modal
        visible={withdrawModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !withdrawLoading && setWithdrawModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Withdraw Funds</Text>
              <TouchableOpacity
                onPress={() => !withdrawLoading && setWithdrawModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={moderateScale(24)} color={COLORS.gray600} />
              </TouchableOpacity>
            </View>

            {/* Amount Display */}
            <View style={styles.modalAmountBox}>
              <Text style={styles.modalAmountLabel}>Amount</Text>
              <Text style={styles.modalAmountValue}>₱{parseFloat(withdrawAmount || '0').toLocaleString()}</Text>
            </View>

            {/* Method Selector */}
            <Text style={styles.modalFieldLabel}>Payout Method</Text>
            <View style={styles.methodSelector}>
              <TouchableOpacity
                style={[
                  styles.methodButton,
                  withdrawMethod === 'gcash' && styles.methodButtonActive,
                ]}
                onPress={() => setWithdrawMethod('gcash')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="phone-portrait-outline"
                  size={moderateScale(18)}
                  color={withdrawMethod === 'gcash' ? COLORS.white : COLORS.gray600}
                />
                <Text style={[
                  styles.methodButtonText,
                  withdrawMethod === 'gcash' && styles.methodButtonTextActive,
                ]}>GCash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.methodButton,
                  withdrawMethod === 'maya' && styles.methodButtonActive,
                ]}
                onPress={() => setWithdrawMethod('maya')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="wallet-outline"
                  size={moderateScale(18)}
                  color={withdrawMethod === 'maya' ? COLORS.white : COLORS.gray600}
                />
                <Text style={[
                  styles.methodButtonText,
                  withdrawMethod === 'maya' && styles.methodButtonTextActive,
                ]}>Maya</Text>
              </TouchableOpacity>
            </View>

            {/* Account Number */}
            <Text style={styles.modalFieldLabel}>Account Number</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 09171234567"
              placeholderTextColor={COLORS.gray400}
              value={accountNumber}
              onChangeText={setAccountNumber}
              keyboardType="phone-pad"
              maxLength={13}
            />

            {/* Account Name */}
            <Text style={styles.modalFieldLabel}>Account Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Full name on the account"
              placeholderTextColor={COLORS.gray400}
              value={accountName}
              onChangeText={setAccountName}
              autoCapitalize="words"
            />

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.modalSubmitButton, withdrawLoading && { opacity: 0.6 }]}
              onPress={processWithdraw}
              disabled={withdrawLoading}
              activeOpacity={0.8}
            >
              {withdrawLoading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <>
                  <Ionicons name="arrow-up-circle" size={moderateScale(20)} color={COLORS.white} />
                  <Text style={styles.modalSubmitText}>Submit Withdrawal</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.modalHint}>
              Processing takes 1-3 business days. Amount will be deducted from your balance immediately.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  loadingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(40),
  },
  loadingText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    marginTop: verticalScale(10),
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(52) : verticalScale(38),
    paddingBottom: verticalScale(14),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  downloadButton: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Balance Card
  balanceCardWrapper: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(16),
  },
  balanceCard: {
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    padding: moderateScale(24),
    overflow: 'hidden',
    backgroundColor: '#059669',
    ...SHADOWS.xl,
  },
  balanceDecor1: {
    position: 'absolute',
    top: moderateScale(-30),
    right: moderateScale(-30),
    width: moderateScale(120),
    height: moderateScale(120),
    borderRadius: moderateScale(60),
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  balanceDecor2: {
    position: 'absolute',
    bottom: moderateScale(-20),
    left: moderateScale(-20),
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(40),
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  balanceIconCircle: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: 'rgba(255, 255, 255, 0.85)',
    marginLeft: moderateScale(10),
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: fontScale(38),
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: verticalScale(16),
    letterSpacing: 0.5,
  },
  // Quick Amount Buttons
  quickAmountsRow: {
    flexDirection: 'row',
    gap: moderateScale(8),
    marginBottom: verticalScale(12),
  },
  quickAmountButton: {
    paddingVertical: moderateScale(6),
    paddingHorizontal: moderateScale(16),
    borderRadius: moderateScale(20),
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  quickAmountButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderColor: COLORS.white,
  },
  quickAmountText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
  },
  quickAmountTextActive: {
    color: COLORS.white,
  },
  // Withdraw
  withdrawSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  withdrawInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingHorizontal: moderateScale(14),
    marginRight: moderateScale(10),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  currencySymbol: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.white,
    marginRight: moderateScale(6),
  },
  withdrawInput: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '600',
    color: COLORS.white,
    paddingVertical: verticalScale(11),
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: moderateScale(18),
    paddingVertical: verticalScale(11),
    borderRadius: RESPONSIVE.borderRadius.medium,
    gap: moderateScale(4),
  },
  withdrawButtonText: {
    color: '#059669',
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
  },
  withdrawHint: {
    fontSize: fontScale(11),
    color: 'rgba(255, 255, 255, 0.65)',
  },
  // Period Selector
  periodSelectorContainer: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    marginTop: verticalScale(20),
    marginBottom: verticalScale(20),
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: COLORS.gray100,
    borderRadius: moderateScale(25),
    padding: moderateScale(4),
  },
  periodPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(22),
    gap: moderateScale(4),
  },
  periodPillActive: {
    backgroundColor: COLORS.accent,
    ...SHADOWS.md,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.3,
    elevation: 4,
  },
  periodPillText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: COLORS.gray500,
  },
  periodPillTextActive: {
    color: COLORS.white,
  },
  // Summary Section
  summarySection: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(20),
  },
  totalEarningsCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(20),
    marginBottom: verticalScale(10),
    ...SHADOWS.md,
  },
  totalEarningsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryIconCircle: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalEarningsInfo: {
    marginLeft: moderateScale(14),
  },
  totalEarningsLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    fontWeight: '500',
    marginBottom: verticalScale(2),
  },
  totalEarningsValue: {
    fontSize: RESPONSIVE.fontSize.title,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: moderateScale(10),
  },
  summarySmallCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(16),
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  smallCardIconCircle: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  summarySmallValue: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginTop: verticalScale(8),
    marginBottom: verticalScale(2),
  },
  summarySmallLabel: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
    textAlign: 'center',
    fontWeight: '500',
  },
  // Per trip highlight
  perTripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.infoBg,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginTop: verticalScale(10),
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  perTripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  perTripInfo: {
    marginLeft: moderateScale(10),
    flex: 1,
  },
  perTripLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: COLORS.infoDark,
  },
  perTripSub: {
    fontSize: fontScale(11),
    color: COLORS.info,
    marginTop: verticalScale(1),
  },
  perTripValue: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.infoDark,
    marginLeft: moderateScale(8),
  },
  // Section
  section: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(20),
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: verticalScale(12),
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(4),
    paddingVertical: moderateScale(4),
    paddingHorizontal: moderateScale(10),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.accentBg,
  },
  refreshText: {
    fontSize: fontScale(12),
    fontWeight: '600',
    color: COLORS.accent,
  },
  // Bar Chart
  barChartCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(18),
    ...SHADOWS.sm,
  },
  barChartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(14),
  },
  barChartLabel: {
    width: moderateScale(80),
    flexDirection: 'row',
    alignItems: 'center',
  },
  barChartDot: {
    width: moderateScale(8),
    height: moderateScale(8),
    borderRadius: moderateScale(4),
    marginRight: moderateScale(6),
  },
  barChartService: {
    fontSize: fontScale(12),
    color: COLORS.gray700,
    fontWeight: '500',
    flex: 1,
  },
  barChartBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: moderateScale(8),
  },
  barChartBarBg: {
    flex: 1,
    height: moderateScale(20),
    backgroundColor: COLORS.gray100,
    borderRadius: moderateScale(10),
    overflow: 'hidden',
  },
  barChartBarFill: {
    height: '100%',
    borderRadius: moderateScale(10),
    minWidth: moderateScale(4),
  },
  barChartAmount: {
    fontSize: fontScale(12),
    fontWeight: '700',
    color: COLORS.gray700,
    marginLeft: moderateScale(8),
    minWidth: moderateScale(50),
  },
  barChartPercent: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
    fontWeight: '600',
    width: moderateScale(32),
    textAlign: 'right',
  },
  // Breakdown
  breakdownCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(16),
    marginBottom: verticalScale(10),
    ...SHADOWS.sm,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  breakdownIcon: {
    width: moderateScale(46),
    height: moderateScale(46),
    borderRadius: moderateScale(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  breakdownService: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: verticalScale(2),
  },
  breakdownRides: {
    fontSize: fontScale(13),
    color: COLORS.gray500,
  },
  breakdownEarnings: {
    alignItems: 'flex-end',
  },
  breakdownAmount: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.success,
    marginBottom: verticalScale(2),
  },
  breakdownPercentage: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    fontWeight: '500',
  },
  breakdownProgressBg: {
    height: moderateScale(5),
    backgroundColor: COLORS.gray100,
    borderRadius: moderateScale(3),
    overflow: 'hidden',
  },
  breakdownProgressFill: {
    height: '100%',
    borderRadius: moderateScale(3),
  },
  // Earning cards
  earningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginBottom: verticalScale(8),
    ...SHADOWS.sm,
  },
  earningIcon: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  earningService: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: verticalScale(2),
  },
  earningDate: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
  },
  earningAmount: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.success,
  },
  // Empty state
  emptyEarningCard: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    paddingVertical: moderateScale(32),
    paddingHorizontal: moderateScale(20),
    ...SHADOWS.sm,
  },
  emptyEarningIconCircle: {
    width: moderateScale(60),
    height: moderateScale(60),
    borderRadius: moderateScale(30),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(12),
  },
  emptyEarningTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
    color: COLORS.gray700,
    marginBottom: verticalScale(4),
  },
  emptyEarningText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    textAlign: 'center',
  },
  // Payment Info
  paymentInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentBg,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginBottom: verticalScale(20),
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  paymentInfoIconCircle: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentInfoText: {
    flex: 1,
    marginLeft: moderateScale(12),
    fontSize: fontScale(13),
    color: '#1E40AF',
    lineHeight: fontScale(18),
  },
  // Withdrawal Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: moderateScale(24),
    borderTopRightRadius: moderateScale(24),
    padding: moderateScale(24),
    paddingBottom: verticalScale(40),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(20),
  },
  modalTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  modalAmountBox: {
    backgroundColor: COLORS.primaryBg,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    alignItems: 'center',
    marginBottom: verticalScale(20),
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  modalAmountLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginBottom: verticalScale(4),
  },
  modalAmountValue: {
    fontSize: fontScale(28),
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  modalFieldLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: verticalScale(8),
  },
  methodSelector: {
    flexDirection: 'row',
    gap: moderateScale(10),
    marginBottom: verticalScale(16),
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(12),
    borderRadius: RESPONSIVE.borderRadius.medium,
    backgroundColor: COLORS.gray100,
    gap: moderateScale(6),
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
  },
  methodButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  methodButtonText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.gray600,
  },
  methodButtonTextActive: {
    color: COLORS.white,
  },
  modalInput: {
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingHorizontal: moderateScale(14),
    paddingVertical: verticalScale(12),
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray800,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    marginBottom: verticalScale(16),
  },
  modalSubmitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: verticalScale(14),
    borderRadius: RESPONSIVE.borderRadius.medium,
    gap: moderateScale(8),
    marginTop: verticalScale(4),
    ...SHADOWS.md,
  },
  modalSubmitText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.white,
  },
  modalHint: {
    fontSize: fontScale(11),
    color: COLORS.gray400,
    textAlign: 'center',
    marginTop: verticalScale(12),
    lineHeight: fontScale(16),
  },
});
