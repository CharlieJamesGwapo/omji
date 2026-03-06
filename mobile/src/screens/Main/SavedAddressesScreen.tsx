import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { userService } from '../../services/api';
import { RESPONSIVE, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

interface SavedAddress {
  id: number;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
}

const LABEL_OPTIONS = ['Home', 'Work', 'Other'] as const;

const LABEL_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Work: 'briefcase',
  Other: 'location',
};

export default function SavedAddressesScreen({ navigation }: any) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);

  // Form state
  const [selectedLabel, setSelectedLabel] = useState<string>('Home');
  const [addressText, setAddressText] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const fetchAddresses = useCallback(async () => {
    try {
      const response = await userService.getSavedAddresses();
      if (response.data?.success && Array.isArray(response.data.data)) {
        setAddresses(response.data.data);
      }
    } catch (error: any) {
      if (error.response?.status !== 401) {
        Alert.alert('Error', 'Failed to load saved addresses.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAddresses();
  }, [fetchAddresses]);

  const resetForm = () => {
    setSelectedLabel('Home');
    setAddressText('');
    setLatitude(null);
    setLongitude(null);
  };

  const handleOpenModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleUseCurrentLocation = async () => {
    try {
      setFetchingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to use this feature.');
        return;
      }

      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
      const location = await Promise.race([locationPromise, timeoutPromise]);
      if (!location || !('coords' in location)) {
        Alert.alert('Timeout', 'Could not get location. Please enter the address manually.');
        return;
      }

      setLatitude(location.coords.latitude);
      setLongitude(location.coords.longitude);

      // Reverse geocode to get address text
      const [geocoded] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (geocoded) {
        const parts = [
          geocoded.street,
          geocoded.district,
          geocoded.city,
          geocoded.region,
          geocoded.postalCode,
        ].filter(Boolean);
        setAddressText(parts.join(', '));
      }
    } catch (error) {
      Alert.alert('Error', 'Could not get current location. Please enter the address manually.');
    } finally {
      setFetchingLocation(false);
    }
  };

  const handleSaveAddress = async () => {
    if (!addressText.trim()) {
      Alert.alert('Missing Address', 'Please enter an address.');
      return;
    }

    try {
      setSaving(true);
      await userService.addSavedAddress({
        label: selectedLabel,
        address: addressText.trim(),
        latitude: latitude || 0,
        longitude: longitude || 0,
      });

      setModalVisible(false);
      resetForm();
      fetchAddresses();
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to save address.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAddress = (item: SavedAddress) => {
    Alert.alert(
      'Delete Address',
      `Are you sure you want to delete "${item.label}" (${item.address})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await userService.deleteSavedAddress(item.id);
              setAddresses((prev) => prev.filter((a) => a.id !== item.id));
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete address.');
            }
          },
        },
      ],
    );
  };

  const renderAddressItem = ({ item }: { item: SavedAddress }) => {
    const iconName = LABEL_ICONS[item.label] || 'location';

    return (
      <View style={styles.addressCard}>
        <View style={styles.addressIconContainer}>
          <Ionicons name={iconName} size={22} color="#3B82F6" />
        </View>
        <View style={styles.addressInfo}>
          <Text style={styles.addressLabel}>{item.label}</Text>
          <Text style={styles.addressText} numberOfLines={2}>
            {item.address}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteAddress(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="location-outline" size={64} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No Saved Addresses</Text>
      <Text style={styles.emptySubtitle}>
        Add frequently used addresses for faster booking.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Addresses</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderAddressItem}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={
            addresses.length === 0 ? styles.emptyListContent : styles.listContent
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add Address FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleOpenModal} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>

      {/* Add Address Modal */}
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
              <Text style={styles.modalTitle}>Add Address</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Label Selection */}
            <Text style={styles.formLabel}>Label</Text>
            <View style={styles.labelRow}>
              {LABEL_OPTIONS.map((label) => {
                const isSelected = selectedLabel === label;
                const iconName = LABEL_ICONS[label] || 'location';
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.labelChip, isSelected && styles.labelChipActive]}
                    onPress={() => setSelectedLabel(label)}
                  >
                    <Ionicons
                      name={iconName}
                      size={18}
                      color={isSelected ? '#ffffff' : '#6B7280'}
                    />
                    <Text
                      style={[styles.labelChipText, isSelected && styles.labelChipTextActive]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Address Input */}
            <Text style={styles.formLabel}>Address</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter address"
              placeholderTextColor="#9CA3AF"
              value={addressText}
              onChangeText={setAddressText}
              multiline
              numberOfLines={2}
            />

            {/* Use Current Location */}
            <TouchableOpacity
              style={styles.currentLocationButton}
              onPress={handleUseCurrentLocation}
              disabled={fetchingLocation}
            >
              {fetchingLocation ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : (
                <Ionicons name="navigate" size={18} color="#3B82F6" />
              )}
              <Text style={styles.currentLocationText}>
                {fetchingLocation ? 'Getting location...' : 'Use current location'}
              </Text>
            </TouchableOpacity>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSaveAddress}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Address</Text>
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
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: moderateScale(12),
    padding: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(10),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  addressIconContainer: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
    marginRight: moderateScale(8),
  },
  addressLabel: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: verticalScale(2),
  },
  addressText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
    lineHeight: moderateScale(20),
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
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
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
    marginBottom: verticalScale(8),
  },
  labelRow: {
    flexDirection: 'row',
    marginBottom: verticalScale(16),
    gap: moderateScale(10),
  },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(10),
    borderRadius: moderateScale(12),
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#ffffff',
    gap: moderateScale(6),
  },
  labelChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  labelChipText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '500',
    color: '#6B7280',
  },
  labelChipTextActive: {
    color: '#ffffff',
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: moderateScale(14),
    paddingVertical: moderateScale(12),
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#1F2937',
    minHeight: moderateScale(56),
    textAlignVertical: 'top',
    marginBottom: verticalScale(12),
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: moderateScale(10),
    marginBottom: verticalScale(20),
    gap: moderateScale(8),
  },
  currentLocationText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#3B82F6',
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    borderRadius: moderateScale(12),
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
