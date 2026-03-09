import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { driverService, walletService } from '../../services/api';
import { RESPONSIVE, verticalScale, moderateScale, fontScale, isIOS } from '../../utils/responsive';

export default function RiderEarningsScreen({ navigation }: any) {
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [earningsApiData, setEarningsApiData] = useState<any>({});
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchEarnings();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchEarnings = async () => {
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
      console.error('Error fetching earnings:', error);
    } finally {
      setLoading(false);
    }
  };

  const balance = walletBalance;
  const minimumWithdraw = 100;

  const periods = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
  ];

  const totalRides = earningsApiData.completed_rides || 0;
  const dailyEarnings = earningsApiData.today_earnings || 0;
  const totalEarnings = earningsApiData.total_earnings || 0;

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
        { service: 'Pasundo (Rides)', rides: todayRideCount, earnings: Math.round(todayRideEarnings), color: '#F59E0B' },
        { service: 'Pasugo (Deliveries)', rides: todayDeliveryCount, earnings: Math.round(todayDeliveryEarnings), color: '#3B82F6' },
      ];
    }
    if (selectedPeriod === 'week') {
      return [
        { service: 'Pasundo (Rides)', rides: weekRideCount, earnings: Math.round(weekRideEarnings), color: '#F59E0B' },
        { service: 'Pasugo (Deliveries)', rides: weekDeliveryCount, earnings: Math.round(weekDeliveryEarnings), color: '#3B82F6' },
      ];
    }
    return [
      { service: 'Pasundo (Rides)', rides: rideCount, earnings: Math.round(rideEarnings), color: '#F59E0B' },
      { service: 'Pasugo (Deliveries)', rides: deliveryCount, earnings: Math.round(deliveryEarnings), color: '#3B82F6' },
    ];
  };

  const earningsBreakdown = getBreakdown();

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

    // Let user select withdrawal method
    Alert.alert(
      'Withdraw To',
      `Amount: ₱${amount}\nSelect your payout method:`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'GCash',
          onPress: () => processWithdraw(amount, 'gcash'),
        },
        {
          text: 'Maya',
          onPress: () => processWithdraw(amount, 'maya'),
        },
        {
          text: 'Bank Transfer',
          onPress: () => processWithdraw(amount, 'bank'),
        },
      ]
    );
  };

  const processWithdraw = async (amount: number, method: string) => {
    setWithdrawLoading(true);
    try {
      await walletService.withdraw({ amount, payment_method: method });
      setWithdrawAmount('');
      Alert.alert('Success', `Withdrawal of ₱${amount} via ${method.toUpperCase()} submitted! Processing within 1-3 business days.`);
      fetchEarnings();
    } catch (error: any) {
      Alert.alert('Withdrawal Failed', error.response?.data?.error || 'Failed to process withdrawal. Please try again.');
    } finally {
      setWithdrawLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Earnings</Text>
        <TouchableOpacity onPress={() => Alert.alert('Download Report', 'Coming soon! Earnings report download will be available in a future update.')}>
          <Ionicons name="download-outline" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Ionicons name="wallet" size={32} color="#ffffff" />
            <Text style={styles.balanceLabel}>Available Balance</Text>
          </View>
          <Text style={styles.balanceAmount}>₱{balance.toFixed(2)}</Text>

          {/* Withdraw Section */}
          <View style={styles.withdrawSection}>
            <View style={styles.withdrawInputContainer}>
              <Text style={styles.currencySymbol}>₱</Text>
              <TextInput
                style={styles.withdrawInput}
                placeholder="0"
                placeholderTextColor="rgba(255, 255, 255, 0.5)"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="numeric"
              />
            </View>
            <TouchableOpacity
              style={[styles.withdrawButton, withdrawLoading && { opacity: 0.6 }]}
              onPress={handleWithdraw}
              disabled={withdrawLoading}
            >
              {withdrawLoading ? (
                <ActivityIndicator color="#10B981" size="small" />
              ) : (
                <Text style={styles.withdrawButtonText}>Withdraw</Text>
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.withdrawHint}>
            Minimum withdrawal: ₱{minimumWithdraw}
          </Text>
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {periods.map((period) => (
            <TouchableOpacity
              key={period.id}
              style={[
                styles.periodButton,
                selectedPeriod === period.id && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod(period.id)}
            >
              <Text
                style={[
                  styles.periodText,
                  selectedPeriod === period.id && styles.periodTextActive,
                ]}
              >
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Earnings Summary */}
        <View style={styles.summarySection}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Ionicons name="trending-up" size={24} color="#10B981" />
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryValue}>₱{currentData.total}</Text>
                <Text style={styles.summaryLabel}>Total Earnings</Text>
              </View>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summarySmallCard}>
              <Ionicons name="bicycle" size={20} color="#3B82F6" />
              <Text style={styles.summarySmallValue}>{currentData.rides}</Text>
              <Text style={styles.summarySmallLabel}>Total Rides</Text>
            </View>
            <View style={styles.summarySmallCard}>
              <Ionicons name="stats-chart" size={20} color="#F59E0B" />
              <Text style={styles.summarySmallValue}>₱{currentData.avg}</Text>
              <Text style={styles.summarySmallLabel}>Avg per Ride</Text>
            </View>
          </View>
        </View>

        {/* Earnings Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Earnings Breakdown</Text>
          {earningsBreakdown.map((item) => (
            <View key={`breakdown-${item.service}`} style={styles.breakdownCard}>
              <View
                style={[
                  styles.breakdownIcon,
                  { backgroundColor: `${item.color}20` },
                ]}
              >
                <View
                  style={[styles.breakdownDot, { backgroundColor: item.color }]}
                />
              </View>
              <View style={styles.breakdownInfo}>
                <Text style={styles.breakdownService}>{item.service}</Text>
                <Text style={styles.breakdownRides}>{item.rides} rides</Text>
              </View>
              <View style={styles.breakdownEarnings}>
                <Text style={styles.breakdownAmount}>₱{item.earnings}</Text>
                <Text style={styles.breakdownPercentage}>
                  {currentData.total > 0 ? Math.round((item.earnings / currentData.total) * 100) : 0}%
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Earnings Summary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Earnings Summary</Text>
            <TouchableOpacity onPress={fetchEarnings}>
              <Text style={styles.seeAllText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {totalRides === 0 ? (
            <View style={styles.earningCard}>
              <View style={[styles.earningIcon, { backgroundColor: 'rgba(243,244,246,0.13)' }]}>
                <Ionicons name="bicycle-outline" size={20} color="#6B7280" />
              </View>
              <View style={styles.earningInfo}>
                <Text style={styles.earningService}>No rides yet</Text>
                <Text style={styles.earningDate}>Start accepting rides to earn</Text>
              </View>
            </View>
          ) : (
            earningsBreakdown.map((item) => (
              <View key={`earning-${item.service}`} style={styles.earningCard}>
                <View style={[styles.earningIcon, { backgroundColor: `${item.color}20` }]}>
                  <Ionicons
                    name={item.service.includes('Deliveries') ? 'cube' : 'navigate-circle'}
                    size={20}
                    color={item.color}
                  />
                </View>
                <View style={styles.earningInfo}>
                  <Text style={styles.earningService}>{item.service}</Text>
                  <Text style={styles.earningDate}>{item.rides} rides</Text>
                </View>
                <Text style={styles.earningAmount}>₱{item.earnings}</Text>
              </View>
            ))
          )}
        </View>

        {/* Payment Info */}
        <View style={styles.paymentInfoCard}>
          <Ionicons name="information-circle" size={24} color="#3B82F6" />
          <Text style={styles.paymentInfoText}>
            Withdrawals are processed within 1-3 business days to your
            registered bank account or e-wallet.
          </Text>
        </View>

        <View style={{ height: verticalScale(100) }} />
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
  balanceCard: {
    backgroundColor: '#10B981',
    margin: moderateScale(20),
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(24),
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.3,
    shadowRadius: moderateScale(12),
    elevation: moderateScale(8),
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  balanceLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: 'rgba(255, 255, 255, 0.9)',
    marginLeft: moderateScale(12),
  },
  balanceAmount: {
    fontSize: fontScale(40),
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: verticalScale(20),
  },
  withdrawSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  withdrawInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingHorizontal: moderateScale(16),
    marginRight: moderateScale(12),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  currencySymbol: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#ffffff',
    marginRight: moderateScale(8),
  },
  withdrawInput: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#ffffff',
    paddingVertical: verticalScale(12),
  },
  withdrawButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: moderateScale(24),
    paddingVertical: verticalScale(12),
    borderRadius: RESPONSIVE.borderRadius.medium,
  },
  withdrawButtonText: {
    color: '#10B981',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },
  withdrawHint: {
    fontSize: RESPONSIVE.fontSize.small,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  periodSelector: {
    flexDirection: 'row',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(20),
  },
  periodButton: {
    flex: 1,
    paddingVertical: verticalScale(10),
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: moderateScale(4),
    borderRadius: RESPONSIVE.borderRadius.small,
  },
  periodButtonActive: {
    backgroundColor: '#3B82F6',
  },
  periodText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#6B7280',
  },
  periodTextActive: {
    color: '#ffffff',
  },
  summarySection: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(24),
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(20),
    marginBottom: verticalScale(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(2),
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryInfo: {
    marginLeft: moderateScale(16),
  },
  summaryValue: {
    fontSize: RESPONSIVE.fontSize.title,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(4),
  },
  summaryLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
  },
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: moderateScale(-4),
  },
  summarySmallCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    alignItems: 'center',
    marginHorizontal: moderateScale(4),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(2),
  },
  summarySmallValue: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: verticalScale(8),
    marginBottom: verticalScale(4),
  },
  summarySmallLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(24),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(12),
  },
  seeAllText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#3B82F6',
  },
  breakdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginBottom: verticalScale(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(2),
  },
  breakdownIcon: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownDot: {
    width: moderateScale(12),
    height: moderateScale(12),
    borderRadius: moderateScale(6),
  },
  breakdownInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  breakdownService: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: verticalScale(2),
  },
  breakdownRides: {
    fontSize: fontScale(13),
    color: '#6B7280',
  },
  breakdownEarnings: {
    alignItems: 'flex-end',
  },
  breakdownAmount: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: verticalScale(2),
  },
  breakdownPercentage: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
  },
  earningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginBottom: verticalScale(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(2),
  },
  earningIcon: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  earningService: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: verticalScale(2),
  },
  earningDate: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
  },
  earningAmount: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#10B981',
  },
  paymentInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginBottom: verticalScale(20),
  },
  paymentInfoText: {
    flex: 1,
    marginLeft: moderateScale(12),
    fontSize: fontScale(13),
    color: '#1E40AF',
    lineHeight: fontScale(18),
  },
});
