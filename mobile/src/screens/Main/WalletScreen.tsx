import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { walletService } from '../../services/api';
import { RESPONSIVE, verticalScale, moderateScale, fontScale, isIOS } from '../../utils/responsive';

export default function WalletScreen({ navigation }: any) {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('gcash');
  const [topUpLoading, setTopUpLoading] = useState(false);

  const [fetchError, setFetchError] = useState(false);

  const fetchWallet = useCallback(async () => {
    try {
      setFetchError(false);
      const response = await walletService.getBalance();
      const data = response.data?.data;
      setBalance(data?.balance || 0);
      setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.warn('Wallet: Could not load balance');
      }
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWallet();
    setRefreshing(false);
  };

  const topUpOptions = [
    { amount: 100, label: '₱100' },
    { amount: 200, label: '₱200' },
    { amount: 500, label: '₱500' },
    { amount: 1000, label: '₱1,000' },
  ];

  const paymentMethods = [
    { id: 'gcash', name: 'GCash', icon: 'phone-portrait-outline' },
    { id: 'maya', name: 'Maya', icon: 'card-outline' },
  ];

  const handleTopUp = () => {
    const amount = parseInt(topUpAmount, 10);
    if (isNaN(amount) || amount < 10) {
      Alert.alert('Invalid Amount', 'Minimum top-up amount is ₱10');
      return;
    }

    Alert.alert(
      'Confirm Top Up',
      `Add ₱${amount} to your wallet using ${selectedMethod.toUpperCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setTopUpLoading(true);
            try {
              const response = await walletService.topUp({
                amount,
                payment_method: selectedMethod,
              });
              const data = response.data?.data;
              setBalance(data?.balance || balance + amount);
              setShowTopUp(false);
              setTopUpAmount('');
              Alert.alert('Success', `₱${amount} has been added to your wallet!`);
              fetchWallet();
            } catch (error: any) {
              Alert.alert(
                'Top-up Failed',
                error.response?.data?.error || 'Failed to top up. Please try again.'
              );
            } finally {
              setTopUpLoading(false);
            }
          },
        },
      ]
    );
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'top_up': return { icon: 'add-circle', color: '#10B981' };
      case 'payment': return { icon: 'cart', color: '#EF4444' };
      case 'refund': return { icon: 'return-down-back', color: '#3B82F6' };
      case 'earning': return { icon: 'cash', color: '#10B981' };
      case 'withdrawal': return { icon: 'arrow-down-circle', color: '#F59E0B' };
      default: return { icon: 'swap-horizontal', color: '#6B7280' };
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh-outline" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Ionicons name="wallet" size={32} color="#ffffff" />
            <Text style={styles.balanceLabel}>Available Balance</Text>
          </View>
          <Text style={styles.balanceAmount}>₱{balance.toFixed(2)}</Text>
          <TouchableOpacity
            style={styles.topUpButton}
            onPress={() => setShowTopUp(!showTopUp)}
          >
            <Ionicons name="add-circle" size={20} color="#ffffff" />
            <Text style={styles.topUpButtonText}>Top Up</Text>
          </TouchableOpacity>
        </View>

        {/* Top Up Section */}
        {showTopUp && (
          <View style={styles.topUpSection}>
            <Text style={styles.sectionTitle}>Top Up Amount</Text>

            {/* Quick Amount Selection */}
            <View style={styles.quickAmounts}>
              {topUpOptions.map((option) => (
                <TouchableOpacity
                  key={option.amount}
                  style={[
                    styles.quickAmount,
                    topUpAmount === option.amount.toString() && styles.quickAmountActive,
                  ]}
                  onPress={() => setTopUpAmount(option.amount.toString())}
                >
                  <Text
                    style={[
                      styles.quickAmountText,
                      topUpAmount === option.amount.toString() && styles.quickAmountTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Amount */}
            <Text style={styles.inputLabel}>Or enter custom amount</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>₱</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                value={topUpAmount}
                onChangeText={setTopUpAmount}
                keyboardType="numeric"
              />
            </View>

            {/* Payment Method */}
            <Text style={styles.sectionTitle}>Payment Method</Text>
            <View style={styles.paymentMethods}>
              {paymentMethods.map((method) => (
                <TouchableOpacity
                  key={method.id}
                  style={[
                    styles.paymentMethod,
                    selectedMethod === method.id && styles.paymentMethodActive,
                  ]}
                  onPress={() => setSelectedMethod(method.id)}
                >
                  <Ionicons
                    name={method.icon as any}
                    size={24}
                    color={selectedMethod === method.id ? '#3B82F6' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.paymentMethodText,
                      selectedMethod === method.id && styles.paymentMethodTextActive,
                    ]}
                  >
                    {method.name}
                  </Text>
                  {selectedMethod === method.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#3B82F6" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Confirm Button */}
            <TouchableOpacity
              style={[styles.confirmButton, topUpLoading && { opacity: 0.6 }]}
              onPress={handleTopUp}
              disabled={topUpLoading}
            >
              {topUpLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.confirmButtonText}>Top Up Now</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Transaction History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Transaction History</Text>

          {fetchError ? (
            <View style={styles.emptyTransactions}>
              <Ionicons name="cloud-offline-outline" size={48} color="#EF4444" />
              <Text style={styles.emptyTransactionsText}>Could not load wallet</Text>
              <Text style={styles.emptyTransactionsSubtext}>
                Pull down to refresh or check your connection
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: '#3B82F6', borderRadius: RESPONSIVE.borderRadius.small, paddingHorizontal: moderateScale(20), paddingVertical: moderateScale(10), marginTop: verticalScale(12) }}
                onPress={() => { setLoading(true); fetchWallet(); }}
              >
                <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: RESPONSIVE.fontSize.medium }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyTransactions}>
              <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTransactionsText}>No transactions yet</Text>
              <Text style={styles.emptyTransactionsSubtext}>
                Top up your wallet to get started
              </Text>
            </View>
          ) : (
            transactions.map((tx: any) => {
              const txStyle = getTransactionIcon(tx.type);
              const isCredit = tx.type === 'top_up' || tx.type === 'refund' || tx.type === 'earning';
              return (
                <View key={tx.id} style={styles.transactionCard}>
                  <View style={[styles.transactionIcon, { backgroundColor: `${txStyle.color}15` }]}>
                    <Ionicons name={txStyle.icon as any} size={24} color={txStyle.color} />
                  </View>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionTitle}>
                      {tx.description || tx.type?.replace('_', ' ')}
                    </Text>
                    <Text style={styles.transactionDate}>{formatDate(tx.created_at)}</Text>
                  </View>
                  <Text style={[styles.amountText, isCredit ? styles.amountCredit : styles.amountDebit]}>
                    {isCredit ? '+' : '-'}₱{Math.abs(tx.amount || 0).toFixed(2)}
                  </Text>
                </View>
              );
            })
          )}
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
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: moderateScale(16),
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  balanceCard: {
    backgroundColor: '#3B82F6',
    margin: RESPONSIVE.marginHorizontal,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(24),
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
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
  topUpButton: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  topUpButtonText: {
    color: '#ffffff',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    marginLeft: moderateScale(8),
  },
  topUpSection: {
    backgroundColor: '#ffffff',
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginBottom: verticalScale(20),
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: RESPONSIVE.paddingHorizontal,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(12),
  },
  quickAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: verticalScale(20),
  },
  quickAmount: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#F3F4F6',
    borderRadius: RESPONSIVE.borderRadius.small,
    padding: moderateScale(12),
    alignItems: 'center',
    margin: moderateScale(4),
  },
  quickAmountActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  quickAmountText: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: '#374151',
  },
  quickAmountTextActive: {
    color: '#3B82F6',
  },
  inputLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
    marginBottom: verticalScale(8),
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: RESPONSIVE.borderRadius.medium,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    paddingHorizontal: moderateScale(16),
    marginBottom: verticalScale(20),
  },
  currencySymbol: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#6B7280',
    marginRight: moderateScale(8),
  },
  input: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    paddingVertical: verticalScale(14),
  },
  paymentMethods: {
    marginBottom: verticalScale(20),
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginBottom: verticalScale(12),
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  paymentMethodActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  paymentMethodText: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#6B7280',
    marginLeft: moderateScale(12),
  },
  paymentMethodTextActive: {
    color: '#1F2937',
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#3B82F6',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },
  historySection: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginBottom: verticalScale(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionIcon: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  transactionTitle: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: verticalScale(4),
    textTransform: 'capitalize',
  },
  transactionDate: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#9CA3AF',
  },
  amountText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },
  amountCredit: {
    color: '#10B981',
  },
  amountDebit: {
    color: '#EF4444',
  },
  emptyTransactions: {
    alignItems: 'center',
    paddingVertical: verticalScale(40),
  },
  emptyTransactionsText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: verticalScale(12),
  },
  emptyTransactionsSubtext: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#9CA3AF',
    marginTop: verticalScale(4),
  },
});
