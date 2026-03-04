import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function WalletScreen({ navigation }: any) {
  const [balance] = useState(500);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('gcash');

  const transactions = [
    {
      id: '1',
      type: 'debit',
      title: 'Ride to Market',
      description: 'Pasabay Service',
      amount: -60,
      date: '2024-01-20 2:30 PM',
      status: 'completed',
      icon: 'bicycle',
      color: '#10B981',
    },
    {
      id: '2',
      type: 'credit',
      title: 'Top Up',
      description: 'GCash',
      amount: 500,
      date: '2024-01-20 10:00 AM',
      status: 'completed',
      icon: 'add-circle',
      color: '#3B82F6',
    },
    {
      id: '3',
      type: 'debit',
      title: 'Delivery Fee',
      description: 'Pasugo Service',
      amount: -80,
      date: '2024-01-19 4:15 PM',
      status: 'completed',
      icon: 'cube',
      color: '#3B82F6',
    },
    {
      id: '4',
      type: 'debit',
      title: 'Jollibee Order',
      description: 'Food Delivery',
      amount: -285,
      date: '2024-01-19 12:30 PM',
      status: 'completed',
      icon: 'storefront',
      color: '#EF4444',
    },
    {
      id: '5',
      type: 'debit',
      title: 'Pickup Service',
      description: 'Pasundo Service',
      amount: -70,
      date: '2024-01-18 3:00 PM',
      status: 'completed',
      icon: 'people',
      color: '#F59E0B',
    },
  ];

  const topUpOptions = [
    { amount: 100, label: '₱100' },
    { amount: 200, label: '₱200' },
    { amount: 500, label: '₱500' },
    { amount: 1000, label: '₱1,000' },
  ];

  const paymentMethods = [
    { id: 'gcash', name: 'GCash', icon: 'wallet' },
    { id: 'maya', name: 'Maya', icon: 'wallet' },
    { id: 'bank', name: 'Bank Transfer', icon: 'card' },
  ];

  const handleTopUp = () => {
    const amount = parseInt(topUpAmount);
    if (!amount || amount < 50) {
      Alert.alert('Invalid Amount', 'Minimum top-up amount is ₱50');
      return;
    }

    Alert.alert(
      'Confirm Top Up',
      `Add ₱${amount} to your wallet using ${selectedMethod.toUpperCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            setShowTopUp(false);
            setTopUpAmount('');
            Alert.alert('Success', 'Your wallet has been topped up!');
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
        <Text style={styles.headerTitle}>Wallet</Text>
        <TouchableOpacity>
          <Ionicons name="receipt-outline" size={24} color="#1F2937" />
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
                  style={styles.quickAmount}
                  onPress={() => setTopUpAmount(option.amount.toString())}
                >
                  <Text style={styles.quickAmountText}>{option.label}</Text>
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
            <TouchableOpacity style={styles.confirmButton} onPress={handleTopUp}>
              <Text style={styles.confirmButtonText}>Top Up Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Transaction History */}
        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>Transaction History</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {transactions.map((transaction) => (
            <View key={transaction.id} style={styles.transactionCard}>
              <View
                style={[
                  styles.transactionIcon,
                  { backgroundColor: `${transaction.color}20` },
                ]}
              >
                <Ionicons
                  name={transaction.icon as any}
                  size={24}
                  color={transaction.color}
                />
              </View>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionTitle}>{transaction.title}</Text>
                <Text style={styles.transactionDescription}>
                  {transaction.description}
                </Text>
                <Text style={styles.transactionDate}>{transaction.date}</Text>
              </View>
              <View style={styles.transactionAmount}>
                <Text
                  style={[
                    styles.amountText,
                    transaction.type === 'credit'
                      ? styles.amountCredit
                      : styles.amountDebit,
                  ]}
                >
                  {transaction.type === 'credit' ? '+' : ''}₱{Math.abs(transaction.amount)}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    transaction.status === 'completed' && styles.statusCompleted,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {transaction.status}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickAction}>
            <Ionicons name="download-outline" size={24} color="#3B82F6" />
            <Text style={styles.quickActionText}>Download Statement</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#10B981" />
            <Text style={styles.quickActionText}>Security Settings</Text>
          </TouchableOpacity>
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
    backgroundColor: '#3B82F6',
    margin: 20,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#3B82F6',
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
  topUpButton: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  topUpButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  topUpSection: {
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  quickAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  quickAmount: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    margin: 4,
  },
  quickAmountText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  inputLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6B7280',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    paddingVertical: 14,
  },
  paymentMethods: {
    marginBottom: 20,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  paymentMethodActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  paymentMethodText: {
    flex: 1,
    fontSize: 16,
    color: '#6B7280',
    marginLeft: 12,
  },
  paymentMethodTextActive: {
    color: '#1F2937',
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  historySection: {
    paddingHorizontal: 20,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  transactionCard: {
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
  transactionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  transactionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  transactionDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  amountCredit: {
    color: '#10B981',
  },
  amountDebit: {
    color: '#EF4444',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  statusCompleted: {
    backgroundColor: '#D1FAE5',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    textTransform: 'capitalize',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 20,
  },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 8,
  },
});
