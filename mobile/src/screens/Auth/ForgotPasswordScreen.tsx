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
import { authService } from '../../services/api';
import { COLORS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

type Step = 'request' | 'verify';

export default function ForgotPasswordScreen({ navigation }: any) {
  const [step, setStep] = useState<Step>('request');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const formatPhone = (input: string) => {
    let digits = input.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '63' + digits.slice(1);
    if (!digits.startsWith('63')) digits = '63' + digits;
    return '+' + digits;
  };

  const handleRequest = async () => {
    if (!phone.trim()) {
      Alert.alert('Validation Error', 'Please enter your phone number.');
      return;
    }
    const formatted = formatPhone(phone);
    if (formatted.length < 13) {
      Alert.alert('Validation Error', 'Please enter a valid Philippine phone number.');
      return;
    }
    try {
      setLoading(true);
      await authService.forgotPassword(formatted);
      setPhone(formatted);
      setStep('verify');
      Alert.alert(
        'Code Sent',
        `If an account exists for ${formatted}, we've sent a reset code via SMS. Enter the code below to set a new password.`
      );
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to send reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!otp.trim() || otp.trim().length < 4) {
      Alert.alert('Validation Error', 'Please enter the reset code from your SMS.');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      Alert.alert('Validation Error', 'New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match.');
      return;
    }
    try {
      setLoading(true);
      await authService.resetPassword(phone, otp.trim(), newPassword);
      Alert.alert(
        'Password Reset',
        'Your password has been reset. You can now log in with your new password.',
        [{ text: 'Go to Login', onPress: () => navigation.navigate('Login') }],
        { cancelable: false }
      );
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to reset password. The code may have expired.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setLoading(true);
      await authService.forgotPassword(phone);
      Alert.alert('Code Resent', 'A new reset code has been sent to your phone.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (step === 'verify' ? setStep('request') : navigation.goBack())}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={moderateScale(22)} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Forgot Password</Text>
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
              <Ionicons
                name={step === 'request' ? 'key-outline' : 'shield-checkmark-outline'}
                size={moderateScale(36)}
                color={COLORS.accent}
              />
            </View>
            <Text style={styles.title}>
              {step === 'request' ? 'Reset your password' : 'Verify and set new password'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'request'
                ? 'Enter the phone number associated with your ONE RIDE account. We\'ll send you a reset code via SMS.'
                : `We sent a reset code to ${phone}. Enter it below and choose a new password.`}
            </Text>
          </View>

          <View style={styles.formSection}>
            {step === 'request' ? (
              <>
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Phone Number</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="call-outline" size={moderateScale(18)} color={COLORS.gray400} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+63 9XX XXX XXXX"
                      placeholderTextColor={COLORS.gray400}
                      keyboardType="phone-pad"
                      editable={!loading}
                      autoFocus
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                  onPress={handleRequest}
                  disabled={loading}
                  activeOpacity={0.8}
                  accessibilityLabel="Send reset code"
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <View style={styles.primaryButtonContent}>
                      <Ionicons name="send-outline" size={moderateScale(20)} color={COLORS.white} />
                      <Text style={styles.primaryButtonText}>Send Reset Code</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation.navigate('Login')}
                >
                  <Text style={styles.secondaryButtonText}>Back to Login</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Reset Code</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="keypad-outline" size={moderateScale(18)} color={COLORS.gray400} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { letterSpacing: 4, fontWeight: '700', fontSize: fontScale(18) }]}
                      value={otp}
                      onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      placeholderTextColor={COLORS.gray400}
                      keyboardType="number-pad"
                      editable={!loading}
                      autoFocus
                      maxLength={6}
                    />
                  </View>
                </View>

                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>New Password</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed-outline" size={moderateScale(18)} color={COLORS.gray400} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="At least 8 characters"
                      placeholderTextColor={COLORS.gray400}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={moderateScale(20)} color={COLORS.gray500} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Confirm New Password</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="checkmark-outline" size={moderateScale(18)} color={COLORS.gray400} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Re-enter new password"
                      placeholderTextColor={COLORS.gray400}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                  onPress={handleReset}
                  disabled={loading}
                  activeOpacity={0.8}
                  accessibilityLabel="Reset password"
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <View style={styles.primaryButtonContent}>
                      <Ionicons name="shield-checkmark-outline" size={moderateScale(20)} color={COLORS.white} />
                      <Text style={styles.primaryButtonText}>Reset Password</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleResend}
                  disabled={loading}
                >
                  <Text style={styles.secondaryButtonText}>Didn't get the code? Resend</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={{ height: verticalScale(40) }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingTop: verticalScale(32),
    paddingBottom: verticalScale(24),
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
    marginBottom: verticalScale(16),
  },
  title: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: verticalScale(8),
    textAlign: 'center',
  },
  subtitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray500,
    textAlign: 'center',
    paddingHorizontal: moderateScale(20),
    lineHeight: fontScale(20),
  },
  formSection: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(20),
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
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: moderateScale(54),
    marginTop: verticalScale(8),
  },
  primaryButtonDisabled: { backgroundColor: COLORS.gray300 },
  primaryButtonContent: { flexDirection: 'row', alignItems: 'center' },
  primaryButtonText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.white,
    marginLeft: moderateScale(8),
  },
  secondaryButton: {
    paddingVertical: moderateScale(14),
    alignItems: 'center',
    marginTop: verticalScale(4),
  },
  secondaryButtonText: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.accent,
    fontWeight: '600',
  },
});
