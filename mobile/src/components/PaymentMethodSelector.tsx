import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
];

interface Props {
  selected: string;
  onSelect: (method: string) => void;
  accentColor?: string;
}

export default function PaymentMethodSelector({ selected, onSelect, accentColor = '#3B82F6' }: Props) {
  const [showModal, setShowModal] = useState(false);
  const selectedMethod = PAYMENT_METHODS.find(m => m.id === selected) || PAYMENT_METHODS[0];

  return (
    <>
      {/* Selected Payment Display */}
      <TouchableOpacity
        style={styles.selectedCard}
        onPress={() => setShowModal(true)}
      >
        <View style={[styles.selectedIcon, { backgroundColor: selectedMethod.bgColor }]}>
          <Ionicons name={selectedMethod.icon as any} size={24} color={selectedMethod.color} />
        </View>
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedLabel}>Payment Method</Text>
          <Text style={styles.selectedName}>{selectedMethod.name}</Text>
        </View>
        <View style={styles.changeButton}>
          <Text style={[styles.changeText, { color: accentColor }]}>Change</Text>
          <Ionicons name="chevron-forward" size={16} color={accentColor} />
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
                >
                  <View style={[styles.methodIcon, { backgroundColor: method.bgColor }]}>
                    <Ionicons name={method.icon as any} size={28} color={method.color} />
                  </View>
                  <View style={styles.methodInfo}>
                    <Text style={styles.methodName}>{method.name}</Text>
                    <Text style={styles.methodDescription}>{method.description}</Text>
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
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedInfo: {
    flex: 1,
    marginLeft: 12,
  },
  selectedLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  selectedName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 2,
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 20,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  methodCardSelected: {
    backgroundColor: '#ffffff',
  },
  methodIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodInfo: {
    flex: 1,
    marginLeft: 14,
  },
  methodName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  methodDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  doneButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  doneButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
