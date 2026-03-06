import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '../../services/api';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

export default function OTPScreen({ navigation, route }: any) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const inputs = useRef<Array<TextInput | null>>([]);

  const handleOTPChange = (value: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      Alert.alert('Error', 'Please enter complete OTP');
      return;
    }

    const phone = route.params?.phone || '';
    if (!phone) {
      Alert.alert('Error', 'Phone number not available. Please go back and try again.');
      return;
    }

    setLoading(true);
    try {
      await authService.verifyOTP({ phone, otp: otpCode });
      setLoading(false);
      Alert.alert('Success', 'Phone verified successfully!', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (error: any) {
      setLoading(false);
      Alert.alert(
        'Verification Failed',
        error.response?.data?.error || 'Invalid OTP. Please try again.'
      );
    }
  };

  const handleResend = async () => {
    const phone = route.params?.phone || '';
    if (!phone) {
      Alert.alert('Error', 'Phone number not available');
      return;
    }
    try {
      setLoading(true);
      await authService.resendOTP({ phone });
      setLoading(false);
      Alert.alert('OTP Sent', 'A new OTP has been sent to your phone.');
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Error', error.response?.data?.error || 'Failed to resend OTP. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="phone-portrait" size={64} color="#3B82F6" />
        </View>

        <Text style={styles.title}>Verify Your Phone</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to{'\n'}
          {route.params?.phone || '+63 XXX XXX XXXX'}
        </Text>

        {/* OTP Inputs */}
        <View style={styles.otpContainer}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { inputs.current[index] = ref; }}
              style={styles.otpInput}
              value={digit}
              onChangeText={(value) => handleOTPChange(value, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        {/* Verify Button */}
        <TouchableOpacity
          style={[styles.verifyButton, loading && styles.verifyButtonDisabled]}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.verifyButtonText}>Verify</Text>
          )}
        </TouchableOpacity>

        {/* Resend */}
        <TouchableOpacity onPress={handleResend} style={styles.resendContainer}>
          <Text style={styles.resendText}>Didn't receive code? </Text>
          <Text style={styles.resendLink}>Resend</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  backButton: {
    width: moderateScale(40),
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  iconContainer: {
    width: moderateScale(120),
    height: moderateScale(120),
    borderRadius: moderateScale(60),
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(32),
  },
  title: {
    fontSize: RESPONSIVE.fontSize.title,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(12),
  },
  subtitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: verticalScale(40),
    lineHeight: fontScale(24),
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: verticalScale(40),
  },
  otpInput: {
    width: moderateScale(50),
    height: moderateScale(60),
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: RESPONSIVE.borderRadius.medium,
    marginHorizontal: moderateScale(6),
    textAlign: 'center',
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    backgroundColor: '#ffffff',
  },
  verifyButton: {
    backgroundColor: '#3B82F6',
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: verticalScale(16),
    paddingHorizontal: moderateScale(64),
    alignItems: 'center',
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: '#ffffff',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },
  resendContainer: {
    flexDirection: 'row',
    marginTop: verticalScale(24),
  },
  resendText: {
    color: '#6B7280',
    fontSize: RESPONSIVE.fontSize.medium,
  },
  resendLink: {
    color: '#3B82F6',
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: 'bold',
  },
});
