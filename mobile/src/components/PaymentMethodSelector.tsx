import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { moderateScale, fontScale, verticalScale, RESPONSIVE } from '../utils/responsive';

interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'cash',
    name: 'Cash',
    icon: 'cash-outline',
    color: '#F59E0B',
    bgColor: '#FFFBEB',
    description: 'Pay with cash upon delivery',
  },
  {
    id: 'gcash',
    name: 'GCash',
    icon: 'phone-portrait-outline',
    color: '#0070E0',
    bgColor: '#EFF6FF',
    description: 'Pay via GCash e-wallet',
  },
  {
    id: 'maya',
    name: 'Maya',
    icon: 'card-outline',
    color: '#00B251',
    bgColor: '#ECFDF5',
    description: 'Pay via Maya e-wallet',
  },
  {
    id: 'wallet',
    name: 'OMJI Wallet',
    icon: 'wallet-outline',
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
    description: 'Pay from your OMJI wallet balance',
  },
];

interface Props {
  selected: string;
  onSelect: (method: string) => void;
  accentColor?: string;
  walletBalance?: number | null;
}

export default function PaymentMethodSelector({ selected, onSelect, accentColor = '#3B82F6', walletBalance }: Props) {
  const [showModal, setShowModal] = useState(false);
  const selectedMethod = PAYMENT_METHODS.find(m => m.id === selected) || PAYMENT_METHODS[0];

  return (
    <>
      {/* Selected Payment Display */}
      <TouchableOpacity
        style={styles.selectedCard}
        onPress={() => setShowModal(true)}
        accessibilityLabel={`Payment method: ${selectedMethod.name}. Tap to change`}
        accessibilityRole="button"
      >
        <View style={[styles.selectedIcon, { backgroundColor: selectedMethod.bgColor }]}>
          <Ionicons name={selectedMethod.icon as any} size={moderateScale(24)} color={selectedMethod.color} />
        </View>
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedLabel}>Payment Method</Text>
          <View style={styles.nameRow}>
            <Ionicons name="lock-closed" size={moderateScale(12)} color="#9CA3AF" />
            <Text style={styles.selectedName}>{selectedMethod.name}</Text>
          </View>
          {selected === 'wallet' && walletBalance != null && (
            <Text style={styles.walletBalanceText}>
              Balance: {'\u20B1'}{(walletBalance ?? 0).toFixed(2)}
            </Text>
          )}
        </View>
        <View style={styles.changeButton}>
          <Text style={[styles.changeText, { color: accentColor }]}>Change</Text>
          <Ionicons name="chevron-forward" size={moderateScale(16)} color={accentColor} />
        </View>
      </TouchableOpacity>

      {/* Payment Method Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Payment Method</Text>

            {PAYMENT_METHODS.map((method) => {
              const isSelected = selected === method.id;
              return (
                <TouchableOpacity
                  key={method.id}
                  style={[
                    styles.methodCard,
                    isSelected && styles.methodCardSelected,
                    isSelected && { borderColor: method.color },
                  ]}
                  onPress={() => {
                    onSelect(method.id);
                    setShowModal(false);
                  }}
                  accessibilityLabel={`${method.name}: ${method.description}${isSelected ? ', currently selected' : ''}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={[styles.methodIcon, { backgroundColor: method.bgColor }]}>
                    <Ionicons name={method.icon as any} size={moderateScale(28)} color={method.color} />
                  </View>
                  <View style={styles.methodInfo}>
                    <View style={styles.methodNameRow}>
                      <Text style={styles.methodName}>{method.name}</Text>
                      <Ionicons name="lock-closed" size={moderateScale(12)} color="#9CA3AF" style={styles.lockIcon} />
                    </View>
                    <Text style={styles.methodDescription}>{method.description}</Text>
                    {method.id === 'wallet' && walletBalance != null && (
                      <Text style={styles.walletBalanceInModal}>
                        Balance: {'\u20B1'}{(walletBalance ?? 0).toFixed(2)}
                      </Text>
                    )}
                  </View>
                  <View style={[
                    styles.radio,
                    isSelected && { borderColor: method.color },
                  ]}>
                    {isSelected && (
                      <View style={[styles.radioInner, { backgroundColor: method.color }]} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: accentColor }]}
              onPress={() => setShowModal(false)}
              accessibilityLabel="Done selecting payment method"
              accessibilityRole="button"
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: moderateScale(12),
    padding: moderateScale(14),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedIcon: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  selectedLabel: {
    fontSize: fontScale(12),
    color: '#6B7280',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(4),
    marginTop: moderateScale(2),
  },
  selectedName: {
    fontSize: fontScale(16),
    fontWeight: 'bold',
    color: '#1F2937',
  },
  walletBalanceText: {
    fontSize: fontScale(12),
    color: '#8B5CF6',
    fontWeight: '600',
    marginTop: moderateScale(2),
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeText: {
    fontSize: fontScale(14),
    fontWeight: '600',
    marginRight: moderateScale(4),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: moderateScale(24),
    borderTopRightRadius: moderateScale(24),
    padding: moderateScale(20),
    paddingBottom: Platform.OS === 'ios' ? verticalScale(36) : verticalScale(40),
  },
  modalHandle: {
    width: moderateScale(40),
    height: moderateScale(4),
    borderRadius: moderateScale(2),
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: moderateScale(20),
  },
  modalTitle: {
    fontSize: fontScale(20),
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: moderateScale(20),
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: moderateScale(12),
    padding: moderateScale(16),
    marginBottom: moderateScale(12),
    borderWidth: 2,
    borderColor: 'transparent',
  },
  methodCardSelected: {
    backgroundColor: '#ffffff',
  },
  methodIcon: {
    width: moderateScale(52),
    height: moderateScale(52),
    borderRadius: moderateScale(26),
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodInfo: {
    flex: 1,
    marginLeft: moderateScale(14),
  },
  methodNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  methodName: {
    fontSize: fontScale(16),
    fontWeight: 'bold',
    color: '#1F2937',
  },
  lockIcon: {
    marginLeft: moderateScale(5),
  },
  walletBalanceInModal: {
    fontSize: fontScale(12),
    color: '#8B5CF6',
    fontWeight: '600',
    marginTop: moderateScale(3),
  },
  methodDescription: {
    fontSize: fontScale(13),
    color: '#6B7280',
    marginTop: moderateScale(2),
  },
  radio: {
    width: moderateScale(24),
    height: moderateScale(24),
    borderRadius: moderateScale(12),
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: moderateScale(12),
    height: moderateScale(12),
    borderRadius: moderateScale(6),
  },
  doneButton: {
    borderRadius: moderateScale(12),
    padding: moderateScale(16),
    alignItems: 'center',
    marginTop: moderateScale(8),
  },
  doneButtonText: {
    color: '#ffffff',
    fontSize: fontScale(16),
    fontWeight: 'bold',
  },
});
