import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Switch,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { paymentService } from '../../services/api';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

interface PaymentMethod {
  id: number;
  type: string;
  is_default: boolean;
}

const PAYMENT_TYPES = [
  { type: 'cash', label: 'Cash', icon: 'cash-outline' as const, color: '#10B981' },
  { type: 'gcash', label: 'GCash', icon: 'phone-portrait-outline' as const, color: '#007BFF' },
  { type: 'maya', label: 'Maya', icon: 'wallet-outline' as const, color: '#4CAF50' },
  { type: 'card', label: 'Card', icon: 'card-outline' as const, color: '#FF9800' },
];

const getPaymentConfig = (type: string) => {
  const normalized = type.toLowerCase();
  return (
    PAYMENT_TYPES.find((p) => p.type === normalized) || {
      type: normalized,
      label: type,
      icon: 'help-circle-outline' as const,
      color: '#6B7280',
    }
  );
};

export default function PaymentMethodsScreen({ navigation }: any) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add form state
  const [selectedType, setSelectedType] = useState<string>('gcash');
  const [isDefault, setIsDefault] = useState(false);

  const fetchMethods = useCallback(async () => {
    try {
      const response = await paymentService.getPaymentMethods();
      const data = response.data?.data;
      if (Array.isArray(data)) {
        setMethods(data);
      }
    } catch (error: any) {
      if (error.response?.status !== 401) {
        Alert.alert('Error', 'Failed to load payment methods.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMethods();
  }, [fetchMethods]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMethods();
  }, [fetchMethods]);

  const resetForm = () => {
    setSelectedType('gcash');
    setIsDefault(false);
  };

  const handleOpenModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleAddMethod = async () => {
    try {
      setSaving(true);
      await paymentService.addPaymentMethod({
        type: selectedType,
        is_default: isDefault,
      });
      setModalVisible(false);
      resetForm();
      fetchMethods();
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to add payment method.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMethod = (item: PaymentMethod) => {
    const config = getPaymentConfig(item.type);
    Alert.alert(
      'Remove Payment Method',
      `Are you sure you want to remove "${config.label}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await paymentService.deletePaymentMethod(item.id);
              setMethods((prev) => prev.filter((m) => m.id !== item.id));
            } catch (error: any) {
              Alert.alert('Error', 'Failed to remove payment method.');
            }
          },
        },
      ],
    );
  };

  const renderMethodItem = ({ item }: { item: PaymentMethod }) => {
    const config = getPaymentConfig(item.type);

    return (
      <View style={styles.methodCard}>
        <View style={[styles.methodIconContainer, { backgroundColor: config.color + '15' }]}>
          <Ionicons name={config.icon} size={moderateScale(22)} color={config.color} />
        </View>
        <View style={styles.methodInfo}>
          <Text style={styles.methodName}>{config.label}</Text>
          {!!item.is_default && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Default</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteMethod(item)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={`Remove ${config.label} payment method`}
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={moderateScale(20)} color="#EF4444" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="card-outline" size={moderateScale(64)} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No Payment Methods</Text>
      <Text style={styles.emptySubtitle}>
        Add a payment method to get started with your orders and rides.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={moderateScale(24)} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <View style={{ width: moderateScale(24) }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#DC2626" />
        </View>
      ) : (
        <FlatList
          data={methods}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderMethodItem}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={
            methods.length === 0 ? styles.emptyListContent : styles.listContent
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DC2626" />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add Payment Method FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleOpenModal} activeOpacity={0.8} accessibilityLabel="Add payment method" accessibilityRole="button">
        <Ionicons name="add" size={moderateScale(28)} color="#ffffff" />
      </TouchableOpacity>

      {/* Add Payment Method Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Payment Method</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close" accessibilityRole="button">
                <Ionicons name="close" size={moderateScale(24)} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Type Selection */}
            <Text style={styles.formLabel}>Payment Type</Text>
            <View style={styles.typeGrid}>
              {PAYMENT_TYPES.map((pt) => {
                const isSelected = selectedType === pt.type;
                return (
                  <TouchableOpacity
                    key={pt.type}
                    style={[styles.typeCard, isSelected && styles.typeCardActive]}
                    onPress={() => setSelectedType(pt.type)}
                    accessibilityLabel={`${pt.label}${isSelected ? ', selected' : ''}`}
                    accessibilityRole="button"
                  >
                    <View
                      style={[
                        styles.typeIconWrapper,
                        {
                          backgroundColor: isSelected ? '#ffffff' : pt.color + '15',
                        },
                      ]}
                    >
                      <Ionicons
                        name={pt.icon}
                        size={moderateScale(24)}
                        color={isSelected ? '#DC2626' : pt.color}
                      />
                    </View>
                    <Text style={[styles.typeLabel, isSelected && styles.typeLabelActive]}>
                      {pt.label}
                    </Text>
                    {isSelected && (
                      <View style={styles.checkIcon}>
                        <Ionicons name="checkmark-circle" size={moderateScale(18)} color="#ffffff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Default Toggle */}
            <View style={styles.defaultToggleRow}>
              <View style={styles.defaultToggleInfo}>
                <Text style={styles.defaultToggleLabel}>Set as default</Text>
                <Text style={styles.defaultToggleHint}>
                  Use this method by default for payments
                </Text>
              </View>
              <Switch
                value={isDefault}
                onValueChange={setIsDefault}
                trackColor={{ false: '#E5E7EB', true: '#FCA5A5' }}
                thumbColor={isDefault ? '#DC2626' : '#ffffff'}
                ios_backgroundColor="#E5E7EB"
              />
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleAddMethod}
              disabled={saving}
              accessibilityLabel="Add payment method"
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>Add Payment Method</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingBottom: verticalScale(12),
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(100),
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(10),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(2),
  },
  methodIconContainer: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
    marginRight: moderateScale(8),
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
  },
  methodName: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: '#1F2937',
  },
  defaultBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(3),
    borderRadius: moderateScale(6),
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  defaultBadgeText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: '#DC2626',
  },
  deleteButton: {
    padding: moderateScale(8),
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  emptyTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: verticalScale(16),
  },
  emptySubtitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: verticalScale(8),
    lineHeight: moderateScale(22),
  },
  fab: {
    position: 'absolute',
    bottom: verticalScale(30),
    right: RESPONSIVE.paddingHorizontal,
    width: moderateScale(56),
    height: moderateScale(56),
    borderRadius: moderateScale(28),
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.3,
    shadowRadius: moderateScale(8),
    elevation: moderateScale(6),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    padding: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(20),
    paddingBottom: isIOS ? verticalScale(40) : verticalScale(24),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(20),
  },
  modalTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  formLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#374151',
    marginBottom: verticalScale(10),
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: moderateScale(10),
    marginBottom: verticalScale(20),
  },
  typeCard: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(14),
    borderRadius: RESPONSIVE.borderRadius.medium,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  typeCardActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  typeIconWrapper: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#374151',
    marginLeft: moderateScale(10),
  },
  typeLabelActive: {
    color: '#ffffff',
  },
  checkIcon: {
    position: 'absolute',
    top: moderateScale(6),
    right: moderateScale(6),
  },
  defaultToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginBottom: verticalScale(20),
  },
  defaultToggleInfo: {
    flex: 1,
    marginRight: moderateScale(12),
  },
  defaultToggleLabel: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: '#1F2937',
  },
  defaultToggleHint: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    marginTop: verticalScale(2),
  },
  saveButton: {
    backgroundColor: '#DC2626',
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(14),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: moderateScale(50),
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
  },
});
