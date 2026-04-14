import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { driverService } from '../../services/api';
import { COLORS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

export default function EditVehicleScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [originalModel, setOriginalModel] = useState('');
  const [originalPlate, setOriginalPlate] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await driverService.getProfile();
        const d = res.data?.data || res.data;
        setVehicleModel(d?.vehicle_model || '');
        setVehiclePlate(d?.vehicle_plate || '');
        setVehicleType(d?.vehicle_type || '');
        setLicenseNumber(d?.license_number || '');
        setOriginalModel(d?.vehicle_model || '');
        setOriginalPlate(d?.vehicle_plate || '');
      } catch (err: any) {
        Alert.alert('Error', err?.response?.data?.error || 'Failed to load vehicle details');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const hasChanges = vehicleModel.trim() !== originalModel || vehiclePlate.trim() !== originalPlate;

  const handleSave = async () => {
    if (!vehicleModel.trim()) {
      Alert.alert('Validation Error', 'Vehicle model is required.');
      return;
    }
    if (!vehiclePlate.trim()) {
      Alert.alert('Validation Error', 'Plate number is required.');
      return;
    }
    if (vehiclePlate.trim().length < 3) {
      Alert.alert('Validation Error', 'Plate number looks too short.');
      return;
    }
    try {
      setSaving(true);
      await driverService.updateProfile({
        vehicle_model: vehicleModel.trim(),
        vehicle_plate: vehiclePlate.trim().toUpperCase(),
      });
      setOriginalModel(vehicleModel.trim());
      setOriginalPlate(vehiclePlate.trim().toUpperCase());
      Alert.alert('Saved', 'Vehicle details updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to update vehicle details');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={moderateScale(22)} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vehicle Details</Text>
        <View style={{ width: moderateScale(40) }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconHeader}>
            <View style={styles.iconCircle}>
              <Ionicons name="bicycle" size={moderateScale(36)} color={COLORS.accent} />
            </View>
            <Text style={styles.title}>Update your vehicle</Text>
            <Text style={styles.subtitle}>
              Keep your vehicle information up to date so passengers can identify you.
            </Text>
          </View>

          <View style={styles.formSection}>
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Vehicle Model</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="bicycle-outline" size={moderateScale(18)} color={COLORS.gray400} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={vehicleModel}
                  onChangeText={setVehicleModel}
                  placeholder="e.g. Honda Click 150i"
                  placeholderTextColor={COLORS.gray400}
                  editable={!saving}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Plate Number</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="car-outline" size={moderateScale(18)} color={COLORS.gray400} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { letterSpacing: 1.5, fontWeight: '600' }]}
                  value={vehiclePlate}
                  onChangeText={(t) => setVehiclePlate(t.toUpperCase())}
                  placeholder="e.g. ABC 1234"
                  placeholderTextColor={COLORS.gray400}
                  editable={!saving}
                  autoCapitalize="characters"
                  maxLength={12}
                />
              </View>
            </View>

            <View style={styles.readonlyCard}>
              <View style={styles.readonlyRow}>
                <Text style={styles.readonlyLabel}>Vehicle Type</Text>
                <Text style={styles.readonlyValue}>{vehicleType || '—'}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.readonlyRow}>
                <Text style={styles.readonlyLabel}>License Number</Text>
                <Text style={styles.readonlyValue}>{licenseNumber || '—'}</Text>
              </View>
            </View>
            <Text style={styles.readonlyHint}>
              To change vehicle type or licence, please contact support — these require re-verification.
            </Text>

            <TouchableOpacity
              style={[styles.saveButton, (!hasChanges || saving) && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!hasChanges || saving}
              activeOpacity={0.8}
              accessibilityLabel="Save vehicle changes"
            >
              {saving ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <View style={styles.saveButtonContent}>
                  <Ionicons name="checkmark-circle-outline" size={moderateScale(20)} color={COLORS.white} />
                  <Text style={styles.saveButtonText}>{hasChanges ? 'Save Changes' : 'No Changes'}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ height: verticalScale(40) }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(12),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.gray50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  scrollContent: { paddingBottom: verticalScale(40) },
  iconHeader: {
    alignItems: 'center',
    paddingTop: verticalScale(28),
    paddingBottom: verticalScale(20),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    backgroundColor: COLORS.white,
    marginBottom: verticalScale(8),
  },
  iconCircle: {
    width: moderateScale(72),
    height: moderateScale(72),
    borderRadius: moderateScale(36),
    backgroundColor: COLORS.gray50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(14),
  },
  title: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: verticalScale(6),
  },
  subtitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray500,
    textAlign: 'center',
    paddingHorizontal: moderateScale(20),
  },
  formSection: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(16),
  },
  fieldContainer: { marginBottom: verticalScale(16) },
  label: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: COLORS.gray600,
    marginBottom: verticalScale(6),
    marginLeft: moderateScale(2),
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    paddingHorizontal: moderateScale(14),
    minHeight: moderateScale(52),
  },
  inputIcon: { marginRight: moderateScale(10) },
  input: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray800,
    paddingVertical: moderateScale(12),
  },
  readonlyCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingHorizontal: moderateScale(16),
    marginTop: verticalScale(8),
  },
  readonlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: moderateScale(14),
  },
  readonlyLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    fontWeight: '500',
  },
  readonlyValue: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray700,
    fontWeight: '600',
  },
  divider: { height: 1, backgroundColor: COLORS.gray100 },
  readonlyHint: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginTop: verticalScale(8),
    marginBottom: verticalScale(20),
    paddingHorizontal: moderateScale(4),
    fontStyle: 'italic',
  },
  saveButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: moderateScale(54),
  },
  saveButtonDisabled: { backgroundColor: COLORS.gray300 },
  saveButtonContent: { flexDirection: 'row', alignItems: 'center' },
  saveButtonText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.white,
    marginLeft: moderateScale(8),
  },
});
