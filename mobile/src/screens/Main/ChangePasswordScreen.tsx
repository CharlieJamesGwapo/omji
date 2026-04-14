import React, { useState } from 'react';
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
import { userService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

const MIN_LEN = 8;

export default function ChangePasswordScreen({ navigation }: any) {
  const { logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const strength = (() => {
    if (!next) return { label: '', color: COLORS.gray300, score: 0 };
    let score = 0;
    if (next.length >= 8) score++;
    if (next.length >= 12) score++;
    if (/[A-Z]/.test(next) && /[a-z]/.test(next)) score++;
    if (/\d/.test(next)) score++;
    if (/[^A-Za-z0-9]/.test(next)) score++;
    if (score <= 2) return { label: 'Weak', color: '#EF4444', score };
    if (score <= 3) return { label: 'Fair', color: '#F59E0B', score };
    if (score === 4) return { label: 'Good', color: '#10B981', score };
    return { label: 'Strong', color: '#059669', score };
  })();

  const handleSave = async () => {
    if (!current || !next || !confirm) {
      Alert.alert('Validation Error', 'Please fill in all fields.');
      return;
    }
    if (next.length < MIN_LEN) {
      Alert.alert('Validation Error', `New password must be at least ${MIN_LEN} characters.`);
      return;
    }
    if (next === current) {
      Alert.alert('Validation Error', 'New password must be different from your current password.');
      return;
    }
    if (next !== confirm) {
      Alert.alert('Validation Error', 'New password and confirmation do not match.');
      return;
    }

    try {
      setSaving(true);
      await userService.changePassword(current, next);
      Alert.alert(
        'Password Updated',
        'Your password has been changed. For security, you have been signed out of all devices and need to log in again.',
        [
          {
            text: 'OK',
            onPress: async () => {
              await logout();
            },
          },
        ],
        { cancelable: false }
      );
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to change password. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (
    label: string,
    value: string,
    setValue: (v: string) => void,
    show: boolean,
    setShow: (b: boolean) => void,
    icon: keyof typeof Ionicons.glyphMap,
    autoFocus = false,
  ) => (
    <View style={styles.fieldContainer}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <Ionicons name={icon} size={moderateScale(18)} color={COLORS.gray400} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!saving}
          autoFocus={autoFocus}
          placeholder={label}
          placeholderTextColor={COLORS.gray400}
        />
        <TouchableOpacity
          onPress={() => setShow(!show)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={show ? 'Hide password' : 'Show password'}
        >
          <Ionicons
            name={show ? 'eye-off-outline' : 'eye-outline'}
            size={moderateScale(20)}
            color={COLORS.gray500}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={moderateScale(22)} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
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
              <Ionicons name="lock-closed" size={moderateScale(36)} color={COLORS.accent} />
            </View>
            <Text style={styles.title}>Update your password</Text>
            <Text style={styles.subtitle}>
              Choose a strong password to keep your ONE RIDE account secure.
            </Text>
          </View>

          <View style={styles.formSection}>
            {renderField('Current password', current, setCurrent, showCurrent, setShowCurrent, 'lock-closed-outline', true)}
            {renderField('New password', next, setNext, showNext, setShowNext, 'key-outline')}

            {next.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthBarBg}>
                  <View
                    style={[
                      styles.strengthBarFill,
                      { width: `${(strength.score / 5) * 100}%`, backgroundColor: strength.color },
                    ]}
                  />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
              </View>
            )}

            {renderField('Confirm new password', confirm, setConfirm, showConfirm, setShowConfirm, 'checkmark-outline')}

            <View style={styles.requirements}>
              <Text style={styles.requirementsTitle}>Password requirements</Text>
              <Requirement met={next.length >= MIN_LEN} text={`At least ${MIN_LEN} characters`} />
              <Requirement met={/[A-Z]/.test(next) && /[a-z]/.test(next)} text="Mix of upper and lowercase letters" />
              <Requirement met={/\d/.test(next)} text="At least one number" />
              <Requirement met={next.length > 0 && next !== current} text="Different from current password" />
            </View>

            <View style={styles.warning}>
              <Ionicons name="information-circle" size={moderateScale(20)} color={COLORS.accent} />
              <Text style={styles.warningText}>
                After changing your password you'll be signed out of all devices and need to log in again.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
              accessibilityLabel="Save new password"
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <View style={styles.saveButtonContent}>
                  <Ionicons name="shield-checkmark-outline" size={moderateScale(20)} color={COLORS.white} />
                  <Text style={styles.saveButtonText}>Update Password</Text>
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

function Requirement({ met, text }: { met: boolean; text: string }) {
  return (
    <View style={styles.requirementRow}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'ellipse-outline'}
        size={moderateScale(16)}
        color={met ? '#10B981' : COLORS.gray400}
      />
      <Text style={[styles.requirementText, met && styles.requirementMet]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
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

  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(-8),
    marginBottom: verticalScale(16),
    paddingHorizontal: moderateScale(2),
  },
  strengthBarBg: {
    flex: 1,
    height: moderateScale(6),
    borderRadius: moderateScale(3),
    backgroundColor: COLORS.gray200,
    overflow: 'hidden',
    marginRight: moderateScale(10),
  },
  strengthBarFill: { height: '100%', borderRadius: moderateScale(3) },
  strengthLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    minWidth: moderateScale(48),
    textAlign: 'right',
  },

  requirements: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginBottom: verticalScale(16),
  },
  requirementsTitle: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '700',
    color: COLORS.gray700,
    marginBottom: verticalScale(8),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(4),
  },
  requirementText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginLeft: moderateScale(8),
  },
  requirementMet: { color: COLORS.gray700 },

  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginBottom: verticalScale(20),
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  warningText: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray600,
    marginLeft: moderateScale(10),
    lineHeight: fontScale(18),
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
