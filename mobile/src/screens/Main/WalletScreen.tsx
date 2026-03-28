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
import { COLORS } from '../../constants/theme';
import { RESPONSIVE, verticalScale, moderateScale, fontScale, isIOS } from '../../utils/responsive';
import Toast, { ToastType } from '../../components/Toast';

export default function WalletScreen({ navigation }: any) {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('gcash');
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('gcash');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  const [fetchError, setFetchError] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  const fetchWallet = useCallback(async () => {
    try {
      setFetchError(false);
      const response = await walletService.getBalance();
      const data = response.data?.data;
      setBalance(data?.balance != null ? Number(data.balance) : 0);
      setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.warn('Wallet: Could not load balance');
        showToast('Could not load wallet. Please check your connection.', 'error');
      }
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchWallet();
    } finally {
      setRefreshing(false);
    }
  }, [fetchWallet]);

  const quickTopUpAmounts = [
    { amount: 50, label: '50' },
    { amount: 100, label: '100' },
    { amount: 500, label: '500' },
    { amount: 1000, label: '1,000' },
  ];

  const topUpOptions = [
    { amount: 100, label: '100' },
    { amount: 200, label: '200' },
    { amount: 500, label: '500' },
    { amount: 1000, label: '1,000' },
  ];

  const paymentMethods = [
    { id: 'gcash', name: 'GCash', icon: 'phone-portrait-outline' },
    { id: 'maya', name: 'Maya', icon: 'card-outline' },
  ];

  const handleTopUp = () => {
    const amount = parseInt(topUpAmount, 10);
    if (isNaN(amount) || amount < 10) {
      Alert.alert('Invalid Amount', 'Minimum top-up amount is \u20B110');
      return;
    }
    if (amount > 50000) {
      Alert.alert('Invalid Amount', 'Maximum top-up amount is \u20B150,000');
      return;
    }

    Alert.alert(
      'Confirm Top Up',
      `Add \u20B1${amount} to your wallet using ${selectedMethod.toUpperCase()}?`,
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
              setBalance(data?.balance != null ? Number(data.balance) : balance + amount);
              setShowTopUp(false);
              setTopUpAmount('');
              Alert.alert('Success', `\u20B1${amount} has been added to your wallet!`);
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

  const getTransactionIcon = (type: string): { icon: string; color: string; bg: string } => {
    switch (type) {
      case 'top_up': return { icon: 'arrow-up-circle', color: COLORS.success, bg: COLORS.successBg };
      case 'payment': return { icon: 'cart', color: COLORS.error, bg: COLORS.errorBg };
      case 'refund': return { icon: 'return-down-back', color: COLORS.accent, bg: COLORS.accentBg };
      case 'earning': return { icon: 'cash', color: COLORS.success, bg: COLORS.successBg };
      case 'withdrawal': return { icon: 'arrow-down-circle', color: COLORS.warning, bg: COLORS.warningBg };
      default: return { icon: 'swap-horizontal', color: COLORS.gray500, bg: COLORS.gray100 };
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTransactionType = (type: string): string => {
    switch (type) {
      case 'top_up': return 'Top Up';
      case 'payment': return 'Payment';
      case 'refund': return 'Refund';
      case 'earning': return 'Earning';
      case 'withdrawal': return 'Withdrawal';
      default: return type?.replace(/_/g, ' ') || 'Transaction';
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading wallet...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wallet</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.headerRefreshBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Refresh wallet" accessibilityRole="button">
          {refreshing ? (
            <ActivityIndicator size="small" color={COLORS.gray600} />
          ) : (
            <Ionicons name="refresh-outline" size={22} color={COLORS.gray600} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceCardOverlay} />
          <View style={styles.balanceCardContent}>
            <View style={styles.balanceTopRow}>
              <View style={styles.walletIconWrapper}>
                <Ionicons name="wallet" size={moderateScale(24)} color={COLORS.white} />
              </View>
              <Text style={styles.balanceLabel}>Available Balance</Text>
            </View>
            <Text style={styles.balanceAmount}>
              {'\u20B1'}{balance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.topUpActionBtn]}
                onPress={() => { setShowTopUp(!showTopUp); setShowWithdraw(false); }}
                activeOpacity={0.8}
                accessibilityLabel="Top up wallet"
                accessibilityRole="button"
              >
                <View style={styles.actionIconCircle}>
                  <Ionicons name="add" size={moderateScale(20)} color={COLORS.accent} />
                </View>
                <Text style={[styles.actionButtonText, { color: COLORS.accent }]}>Top Up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.withdrawActionBtn]}
                onPress={() => { setShowWithdraw(!showWithdraw); setShowTopUp(false); }}
                activeOpacity={0.8}
                accessibilityLabel="Withdraw funds"
                accessibilityRole="button"
              >
                <View style={[styles.actionIconCircle, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <Ionicons name="arrow-down" size={moderateScale(20)} color={COLORS.white} />
                </View>
                <Text style={styles.actionButtonText}>Withdraw</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Quick Top Up Buttons */}
        {!showTopUp && !showWithdraw && (
          <View style={styles.quickTopUpSection}>
            <Text style={styles.quickTopUpLabel}>Quick Top Up</Text>
            <View style={styles.quickTopUpRow}>
              {quickTopUpAmounts.map((item) => (
                <TouchableOpacity
                  key={item.amount}
                  style={styles.quickTopUpBtn}
                  onPress={() => {
                    setTopUpAmount(item.amount.toString());
                    setShowTopUp(true);
                    setShowWithdraw(false);
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel={`Quick top up ${item.label} pesos`}
                  accessibilityRole="button"
                >
                  <Text style={styles.quickTopUpCurrency}>{'\u20B1'}</Text>
                  <Text style={styles.quickTopUpValue}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Top Up Section */}
        {showTopUp && (
          <View style={styles.formSection}>
            <View style={styles.formSectionHeader}>
              <Text style={styles.formSectionTitle}>Top Up Wallet</Text>
              <TouchableOpacity onPress={() => setShowTopUp(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close top up form" accessibilityRole="button">
                <Ionicons name="close-circle" size={moderateScale(24)} color={COLORS.gray400} />
              </TouchableOpacity>
            </View>

            {/* Quick Amount Selection */}
            <Text style={styles.inputLabel}>Select Amount</Text>
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
                  <Text style={styles.quickAmountCurrency}>{'\u20B1'}</Text>
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
              <Text style={styles.currencySymbol}>{'\u20B1'}</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={COLORS.gray400}
                value={topUpAmount}
                onChangeText={setTopUpAmount}
                keyboardType="numeric"
              />
            </View>

            {/* Payment Method */}
            <Text style={styles.inputLabel}>Payment Method</Text>
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
                  <View style={[
                    styles.paymentIconCircle,
                    selectedMethod === method.id && styles.paymentIconCircleActive,
                  ]}>
                    <Ionicons
                      name={method.icon as any}
                      size={moderateScale(20)}
                      color={selectedMethod === method.id ? COLORS.accent : COLORS.gray500}
                    />
                  </View>
                  <Text
                    style={[
                      styles.paymentMethodText,
                      selectedMethod === method.id && styles.paymentMethodTextActive,
                    ]}
                  >
                    {method.name}
                  </Text>
                  {selectedMethod === method.id && (
                    <Ionicons name="checkmark-circle" size={moderateScale(22)} color={COLORS.accent} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Confirm Button */}
            <TouchableOpacity
              style={[styles.confirmButton, topUpLoading && styles.confirmButtonDisabled]}
              onPress={handleTopUp}
              disabled={topUpLoading}
              activeOpacity={0.8}
              accessibilityLabel="Confirm top up"
              accessibilityRole="button"
            >
              {topUpLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="flash" size={moderateScale(18)} color={COLORS.white} />
                  <Text style={styles.confirmButtonText}>Top Up Now</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Withdraw Section */}
        {showWithdraw && (
          <View style={styles.formSection}>
            <View style={styles.formSectionHeader}>
              <Text style={styles.formSectionTitle}>Withdraw Funds</Text>
              <TouchableOpacity onPress={() => setShowWithdraw(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close withdraw form" accessibilityRole="button">
                <Ionicons name="close-circle" size={moderateScale(24)} color={COLORS.gray400} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Enter amount to withdraw</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>{'\u20B1'}</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={COLORS.gray400}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="numeric"
              />
            </View>
            <Text style={styles.availableHint}>
              Available: {'\u20B1'}{balance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>

            <Text style={styles.inputLabel}>Withdraw To</Text>
            <View style={styles.paymentMethods}>
              {paymentMethods.map((method) => (
                <TouchableOpacity
                  key={method.id}
                  style={[
                    styles.paymentMethod,
                    withdrawMethod === method.id && styles.paymentMethodActive,
                  ]}
                  onPress={() => setWithdrawMethod(method.id)}
                >
                  <View style={[
                    styles.paymentIconCircle,
                    withdrawMethod === method.id && styles.paymentIconCircleActive,
                  ]}>
                    <Ionicons
                      name={method.icon as any}
                      size={moderateScale(20)}
                      color={withdrawMethod === method.id ? COLORS.accent : COLORS.gray500}
                    />
                  </View>
                  <Text
                    style={[
                      styles.paymentMethodText,
                      withdrawMethod === method.id && styles.paymentMethodTextActive,
                    ]}
                  >
                    {method.name}
                  </Text>
                  {withdrawMethod === method.id && (
                    <Ionicons name="checkmark-circle" size={moderateScale(22)} color={COLORS.accent} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.confirmButton, styles.withdrawConfirmBtn, withdrawLoading && styles.confirmButtonDisabled]}
              onPress={() => {
                const amount = parseInt(withdrawAmount, 10);
                if (isNaN(amount) || amount < 10) {
                  Alert.alert('Invalid Amount', 'Minimum withdrawal is \u20B110');
                  return;
                }
                if (amount > balance) {
                  Alert.alert('Insufficient Balance', `Your balance is \u20B1${balance.toFixed(2)}`);
                  return;
                }
                Alert.alert(
                  'Confirm Withdrawal',
                  `Withdraw \u20B1${amount} to ${withdrawMethod.toUpperCase()}?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Confirm',
                      onPress: async () => {
                        setWithdrawLoading(true);
                        try {
                          const response = await walletService.withdraw({
                            amount,
                            payment_method: withdrawMethod,
                          });
                          const data = response.data?.data;
                          setBalance(data?.balance != null ? Number(data.balance) : balance - amount);
                          setShowWithdraw(false);
                          setWithdrawAmount('');
                          Alert.alert('Success', `\u20B1${amount} withdrawal request submitted!`);
                          fetchWallet();
                        } catch (error: any) {
                          Alert.alert(
                            'Withdrawal Failed',
                            error.response?.data?.error || 'Failed to withdraw. Please try again.'
                          );
                        } finally {
                          setWithdrawLoading(false);
                        }
                      },
                    },
                  ]
                );
              }}
              disabled={withdrawLoading}
              activeOpacity={0.8}
            >
              {withdrawLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="arrow-down-circle" size={moderateScale(18)} color={COLORS.white} />
                  <Text style={styles.confirmButtonText}>Withdraw Now</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Transaction History */}
        <View style={styles.historySection}>
          <View style={styles.historySectionHeader}>
            <Text style={styles.historySectionTitle}>Transaction History</Text>
            {transactions.length > 0 && (
              <Text style={styles.transactionCount}>{transactions.length} transactions</Text>
            )}
          </View>

          {fetchError ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrapper}>
                <Ionicons name="cloud-offline-outline" size={moderateScale(40)} color={COLORS.error} />
              </View>
              <Text style={styles.emptyTitle}>Could not load wallet</Text>
              <Text style={styles.emptySubtitle}>
                Pull down to refresh or check your connection
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => { setLoading(true); fetchWallet(); }}
                activeOpacity={0.8}
                accessibilityLabel="Retry loading wallet"
                accessibilityRole="button"
              >
                <Ionicons name="refresh" size={moderateScale(16)} color={COLORS.white} />
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrapper}>
                <Ionicons name="receipt-outline" size={moderateScale(40)} color={COLORS.gray300} />
              </View>
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptySubtitle}>
                Your transaction history will appear here once you start using your wallet
              </Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => { setShowTopUp(true); setShowWithdraw(false); }}
                activeOpacity={0.8}
                accessibilityLabel="Add funds to get started"
                accessibilityRole="button"
              >
                <Ionicons name="add-circle" size={moderateScale(18)} color={COLORS.accent} />
                <Text style={styles.emptyActionText}>Add funds to get started</Text>
              </TouchableOpacity>
            </View>
          ) : (
            transactions.map((tx: any) => {
              const txStyle = getTransactionIcon(tx.type);
              const isCredit = tx.type === 'top_up' || tx.type === 'refund' || tx.type === 'earning';
              return (
                <View key={tx.id} style={styles.transactionCard}>
                  <View style={[styles.transactionIcon, { backgroundColor: txStyle.bg }]}>
                    <Ionicons name={txStyle.icon as any} size={moderateScale(22)} color={txStyle.color} />
                  </View>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionTitle}>
                      {tx.description || formatTransactionType(tx.type)}
                    </Text>
                    <View style={styles.transactionMeta}>
                      <Ionicons name="time-outline" size={moderateScale(12)} color={COLORS.gray400} />
                      <Text style={styles.transactionDate}>{formatDate(tx.created_at)}</Text>
                    </View>
                  </View>
                  <View style={styles.transactionAmountWrapper}>
                    <Text style={[styles.amountText, isCredit ? styles.amountCredit : styles.amountDebit]}>
                      {isCredit ? '+' : '-'}{'\u20B1'}{Math.abs(tx.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <View style={[styles.amountBadge, { backgroundColor: isCredit ? COLORS.successBg : COLORS.errorBg }]}>
                      <Text style={[styles.amountBadgeText, { color: isCredit ? COLORS.success : COLORS.error }]}>
                        {isCredit ? 'Received' : 'Sent'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  loadingText: {
    marginTop: verticalScale(12),
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: moderateScale(16),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  headerBackBtn: {
    padding: moderateScale(4),
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  headerRefreshBtn: {
    padding: moderateScale(4),
  },

  // Balance Card
  balanceCard: {
    margin: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(16),
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    overflow: 'hidden',
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accentDark,
    shadowOffset: { width: 0, height: verticalScale(6) },
    shadowOpacity: 0.35,
    shadowRadius: moderateScale(14),
    elevation: moderateScale(10),
  },
  balanceCardOverlay: {
    position: 'absolute',
    top: -moderateScale(40),
    right: -moderateScale(40),
    width: moderateScale(160),
    height: moderateScale(160),
    borderRadius: moderateScale(80),
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  balanceCardContent: {
    padding: moderateScale(24),
  },
  balanceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  walletIconWrapper: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(12),
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: moderateScale(12),
  },
  balanceLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: fontScale(36),
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: verticalScale(20),
    letterSpacing: 0.5,
  },

  // Action buttons in balance card
  actionButtonsRow: {
    flexDirection: 'row',
    gap: moderateScale(12),
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(12),
    paddingHorizontal: moderateScale(16),
  },
  topUpActionBtn: {
    backgroundColor: COLORS.white,
  },
  withdrawActionBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  actionIconCircle: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: COLORS.accentBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: moderateScale(8),
  },
  actionButtonText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Quick Top Up
  quickTopUpSection: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    marginTop: verticalScale(20),
    marginBottom: verticalScale(4),
  },
  quickTopUpLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.gray600,
    marginBottom: verticalScale(10),
  },
  quickTopUpRow: {
    flexDirection: 'row',
    gap: moderateScale(10),
  },
  quickTopUpBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(14),
    minHeight: moderateScale(44),
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: verticalScale(1) },
    shadowOpacity: 0.04,
    shadowRadius: moderateScale(3),
    elevation: moderateScale(1),
  },
  quickTopUpCurrency: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: COLORS.accent,
    marginRight: moderateScale(2),
  },
  quickTopUpValue: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.gray800,
  },

  // Form section (shared by Top Up and Withdraw)
  formSection: {
    backgroundColor: COLORS.white,
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(16),
    marginBottom: verticalScale(4),
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: RESPONSIVE.paddingHorizontal,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.06,
    shadowRadius: moderateScale(6),
    elevation: moderateScale(3),
  },
  formSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  formSectionTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  inputLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: COLORS.gray600,
    marginBottom: verticalScale(8),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: moderateScale(8),
    marginBottom: verticalScale(20),
  },
  quickAmount: {
    flex: 1,
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.small,
    paddingVertical: moderateScale(12),
    minHeight: moderateScale(44),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
  },
  quickAmountActive: {
    backgroundColor: COLORS.accentBg,
    borderColor: COLORS.accent,
  },
  quickAmountCurrency: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginBottom: verticalScale(2),
  },
  quickAmountText: {
    fontSize: fontScale(15),
    fontWeight: '700',
    color: COLORS.gray700,
  },
  quickAmountTextActive: {
    color: COLORS.accent,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.medium,
    borderWidth: 2,
    borderColor: COLORS.gray200,
    paddingHorizontal: moderateScale(16),
    marginBottom: verticalScale(20),
  },
  currencySymbol: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.accent,
    marginRight: moderateScale(8),
  },
  input: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    paddingVertical: verticalScale(14),
  },
  availableHint: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginTop: verticalScale(-14),
    marginBottom: verticalScale(16),
    fontWeight: '500',
  },
  paymentMethods: {
    marginBottom: verticalScale(20),
    gap: verticalScale(10),
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    borderWidth: 2,
    borderColor: COLORS.gray200,
  },
  paymentMethodActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentBg,
  },
  paymentIconCircle: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: COLORS.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentIconCircleActive: {
    backgroundColor: COLORS.white,
  },
  paymentMethodText: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray500,
    marginLeft: moderateScale(12),
    fontWeight: '500',
  },
  paymentMethodTextActive: {
    color: COLORS.gray800,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: moderateScale(8),
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: verticalScale(3) },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(6),
    elevation: moderateScale(4),
  },
  withdrawConfirmBtn: {
    backgroundColor: COLORS.warning,
    shadowColor: COLORS.warning,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: COLORS.white,
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },

  // Transaction History
  historySection: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    marginTop: verticalScale(24),
  },
  historySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(14),
  },
  historySectionTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  transactionCount: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    fontWeight: '500',
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginBottom: verticalScale(10),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: verticalScale(1) },
    shadowOpacity: 0.04,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(2),
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  transactionIcon: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  transactionTitle: {
    fontSize: fontScale(14),
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: verticalScale(4),
    textTransform: 'capitalize',
  },
  transactionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(4),
  },
  transactionDate: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
  },
  transactionAmountWrapper: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: fontScale(15),
    fontWeight: 'bold',
    marginBottom: verticalScale(4),
  },
  amountCredit: {
    color: COLORS.success,
  },
  amountDebit: {
    color: COLORS.error,
  },
  amountBadge: {
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(2),
    borderRadius: moderateScale(4),
  },
  amountBadgeText: {
    fontSize: fontScale(10),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: verticalScale(40),
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: COLORS.gray100,
    borderStyle: 'dashed',
  },
  emptyIconWrapper: {
    width: moderateScale(72),
    height: moderateScale(72),
    borderRadius: moderateScale(36),
    backgroundColor: COLORS.gray50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  emptyTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
    color: COLORS.gray700,
    marginBottom: verticalScale(6),
  },
  emptySubtitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray400,
    textAlign: 'center',
    paddingHorizontal: moderateScale(32),
    lineHeight: fontScale(20),
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: RESPONSIVE.borderRadius.small,
    paddingHorizontal: moderateScale(20),
    paddingVertical: moderateScale(10),
    marginTop: verticalScale(16),
    gap: moderateScale(6),
  },
  retryButtonText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: RESPONSIVE.fontSize.medium,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(16),
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(10),
    borderRadius: RESPONSIVE.borderRadius.small,
    backgroundColor: COLORS.accentBg,
    gap: moderateScale(6),
  },
  emptyActionText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.accent,
  },
});
