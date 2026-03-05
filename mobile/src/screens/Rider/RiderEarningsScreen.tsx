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
import { driverService } from '../../services/api';

export default function RiderEarningsScreen({ navigation }: any) {
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [earningsApiData, setEarningsApiData] = useState<any>({});

  useEffect(() => {
    fetchEarnings();
  }, []);

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      const response = await driverService.getEarnings();
      setEarningsApiData(response.data?.data || {});
    } catch (error) {
      console.error('Error fetching earnings:', error);
    } finally {
      setLoading(false);
    }
  };

  const balance = earningsApiData.total_earnings || 0;
  const minimumWithdraw = 100;

  const periods = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
  ];

  const totalRides = earningsApiData.completed_rides || 0;
  const dailyEarnings = earningsApiData.today_earnings || 0;
  const totalEarnings = earningsApiData.total_earnings || 0;

  const earningsData = {
    today: { total: dailyEarnings, rides: Math.round(totalRides / 30), avg: dailyEarnings > 0 ? Math.round(dailyEarnings / Math.max(1, Math.round(totalRides / 30))) : 0 },
    week: { total: Math.round(totalEarnings / 4), rides: Math.round(totalRides / 4), avg: totalRides > 0 ? Math.round(totalEarnings / totalRides) : 0 },
    month: { total: totalEarnings, rides: totalRides, avg: totalRides > 0 ? Math.round(totalEarnings / totalRides) : 0 },
  };

  const currentData = earningsData[selectedPeriod as keyof typeof earningsData];

  const earningsBreakdown = [
    { service: 'Pasabay', rides: Math.round(totalRides * 0.4), earnings: Math.round(currentData.total * 0.35), color: '#10B981' },
    { service: 'Pasugo', rides: Math.round(totalRides * 0.35), earnings: Math.round(currentData.total * 0.40), color: '#3B82F6' },
    { service: 'Pasundo', rides: Math.round(totalRides * 0.25), earnings: Math.round(currentData.total * 0.25), color: '#F59E0B' },
  ];

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);

    if (!amount || amount < minimumWithdraw) {
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

    Alert.alert(
      'Confirm Withdrawal',
      `Withdraw ₱${amount} to your registered account?\n\nProcessing time: 1-3 business days`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            setWithdrawAmount('');
            Alert.alert('Success', 'Withdrawal request submitted!');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Earnings</Text>
        <TouchableOpacity>
          <Ionicons name="download-outline" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
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
              style={styles.withdrawButton}
              onPress={handleWithdraw}
            >
              <Text style={styles.withdrawButtonText}>Withdraw</Text>
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
          {earningsBreakdown.map((item, index) => (
            <View key={index} style={styles.breakdownCard}>
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
              <View style={[styles.earningIcon, { backgroundColor: '#F3F4F620' }]}>
                <Ionicons name="bicycle-outline" size={20} color="#6B7280" />
              </View>
              <View style={styles.earningInfo}>
                <Text style={styles.earningService}>No rides yet</Text>
                <Text style={styles.earningDate}>Start accepting rides to earn</Text>
              </View>
            </View>
          ) : (
            earningsBreakdown.map((item, index) => (
              <View key={index} style={styles.earningCard}>
                <View style={[styles.earningIcon, { backgroundColor: `${item.color}20` }]}>
                  <Ionicons
                    name={item.service === 'Pasabay' ? 'bicycle' : item.service === 'Pasugo' ? 'cube' : 'people'}
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
  balanceCard: {
    backgroundColor: '#10B981',
    margin: 20,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginLeft: 12,
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 20,
  },
  withdrawSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  withdrawInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginRight: 8,
  },
  withdrawInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    paddingVertical: 12,
  },
  withdrawButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  withdrawButtonText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: 'bold',
  },
  withdrawHint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  periodSelector: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 4,
    borderRadius: 8,
  },
  periodButtonActive: {
    backgroundColor: '#3B82F6',
  },
  periodText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  periodTextActive: {
    color: '#ffffff',
  },
  summarySection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryInfo: {
    marginLeft: 16,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  summarySmallCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summarySmallValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 8,
    marginBottom: 4,
  },
  summarySmallLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  breakdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  breakdownIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  breakdownInfo: {
    flex: 1,
    marginLeft: 12,
  },
  breakdownService: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  breakdownRides: {
    fontSize: 13,
    color: '#6B7280',
  },
  breakdownEarnings: {
    alignItems: 'flex-end',
  },
  breakdownAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 2,
  },
  breakdownPercentage: {
    fontSize: 12,
    color: '#6B7280',
  },
  earningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  earningIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningInfo: {
    flex: 1,
    marginLeft: 12,
  },
  earningService: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  earningDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  earningAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981',
  },
  paymentInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  paymentInfoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
  },
});
