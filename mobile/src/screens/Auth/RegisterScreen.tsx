import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS, isTablet } from '../../utils/responsive';
import { COLORS } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import Toast, { ToastType } from '../../components/Toast';

type PasswordStrength = 'none' | 'weak' | 'medium' | 'strong';

const getPasswordStrength = (password: string): PasswordStrength => {
  if (!password) return 'none';
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
};

const STRENGTH_CONFIG: Record<PasswordStrength, { label: string; color: string; width: string }> = {
  none: { label: '', color: COLORS.gray200, width: '0%' },
  weak: { label: 'Weak', color: COLORS.error, width: '33%' },
  medium: { label: 'Medium', color: COLORS.warning, width: '66%' },
  strong: { label: 'Strong', color: COLORS.success, width: '100%' },
};

export default function RegisterScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [focusedField, setFocusedField] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const { register } = useAuth();

  // Toast state
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'error') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  // Shake animation
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const strengthConfig = STRENGTH_CONFIG[passwordStrength];

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Full name is required';
    if (!email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email';
    if (!phone.trim()) errors.phone = 'Phone number is required';
    else {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) errors.phone = 'Phone must be 10-15 digits';
    }
    if (!password) errors.password = 'Password is required';
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
    if (!confirmPassword) errors.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
    if (!agreedToTerms) errors.terms = 'You must agree to the Terms & Privacy Policy';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    if (loading) return;
    if (!validate()) {
      shake();
      showToast('Please fix the errors below', 'warning');
      return;
    }

    setLoading(true);
    try {
      // Sanitize phone: strip non-digits, keep leading + if present
      const sanitizedPhone = phone.startsWith('+')
        ? '+' + phone.slice(1).replace(/\D/g, '')
        : phone.replace(/\D/g, '');

      await register(name.trim(), email.trim().toLowerCase(), sanitizedPhone, password);
      // Show success visual feedback
      setRegistrationSuccess(true);
      Animated.spring(successScaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 8,
      }).start();
      showToast('Account created successfully! Welcome to ONE RIDE!', 'success');
    } catch (error: any) {
      shake();
      const rawMsg = error.message || 'Registration failed. Please try again.';
      let friendly = rawMsg;
      const lowerMsg = rawMsg.toLowerCase();

      // Translate Go validator messages like:
      //   Key: 'RegisterInput.Password' Error:Field validation for 'Password' failed on the 'min' tag
      // into human copy and attach to the right field.
      const FIELD_LABELS: Record<string, string> = {
        name: 'Full name', email: 'Email', phone: 'Phone number', password: 'Password',
      };
      const validatorMatch = rawMsg.match(/'[^.']+\.(\w+)'[^']*'(\w+)' tag/);
      if (validatorMatch) {
        const field = validatorMatch[1].toLowerCase();
        const tag = validatorMatch[2];
        const label = FIELD_LABELS[field] || field;
        if (field === 'password' && tag === 'min') friendly = 'Password must be at least 8 characters';
        else if (field === 'password' && tag === 'max') friendly = 'Password is too long';
        else if (tag === 'email') friendly = 'Please enter a valid email address';
        else if (tag === 'required') friendly = `${label} is required`;
        else if (tag === 'min') friendly = `${label} is too short`;
        else if (tag === 'max') friendly = `${label} is too long`;
        else friendly = `${label} is invalid`;
        if (FIELD_LABELS[field]) {
          setFieldErrors(prev => ({ ...prev, [field]: friendly }));
        }
      } else if (lowerMsg.includes('email already')) {
        setFieldErrors(prev => ({ ...prev, email: 'This email is already registered' }));
        friendly = 'This email is already registered';
      } else if (lowerMsg.includes('phone already')) {
        setFieldErrors(prev => ({ ...prev, phone: 'This phone number is already registered' }));
        friendly = 'This phone number is already registered';
      } else if (lowerMsg.includes('phone') && lowerMsg.includes('format')) {
        setFieldErrors(prev => ({ ...prev, phone: 'Invalid phone format. Use digits only (10-15)' }));
        friendly = 'Invalid phone format. Use digits only (10-15)';
      }
      showToast(friendly, 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderInput = (
    icon: string,
    placeholder: string,
    value: string,
    onChangeText: (t: string) => void,
    fieldKey: string,
    options?: { secure?: boolean; keyboard?: any; autoCapitalize?: any }
  ) => {
    const hasError = !!fieldErrors[fieldKey];
    const isFocused = focusedField === fieldKey;
    const isConfirmField = fieldKey === 'confirmPassword';
    const isPasswordVisible = isConfirmField ? showConfirmPassword : showPassword;
    const toggleVisibility = () => isConfirmField ? setShowConfirmPassword(!showConfirmPassword) : setShowPassword(!showPassword);
    return (
      <View style={{ marginBottom: moderateScale(14) }}>
        <View
          style={[
            styles.inputContainer,
            isFocused && styles.inputFocused,
            hasError && styles.inputError,
          ]}
        >
          <Ionicons name={icon as any} size={20} color={hasError ? COLORS.error : isFocused ? COLORS.accent : COLORS.gray400} />
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={COLORS.gray400}
            value={value}
            onChangeText={(t) => {
              onChangeText(t);
              if (fieldErrors[fieldKey]) setFieldErrors(prev => { const n = { ...prev }; delete n[fieldKey]; return n; });
            }}
            onFocus={() => setFocusedField(fieldKey)}
            onBlur={() => setFocusedField('')}
            secureTextEntry={options?.secure && !isPasswordVisible}
            keyboardType={options?.keyboard || 'default'}
            autoCapitalize={options?.autoCapitalize || 'none'}
            accessibilityLabel={placeholder}
          />
          {options?.secure && (
            <TouchableOpacity onPress={toggleVisibility} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'} accessibilityRole="button">
              <Ionicons name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'} size={20} color={COLORS.gray400} />
            </TouchableOpacity>
          )}
        </View>
        {hasError && (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={14} color={COLORS.error} />
            <Text style={styles.errorText}>{fieldErrors[fieldKey]}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          {!registrationSuccess && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Go back" accessibilityRole="button">
              <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>{registrationSuccess ? 'Success!' : 'Create Account'}</Text>
        </View>

        {/* Success Overlay */}
        {registrationSuccess ? (
          <Animated.View style={[styles.successContainer, { transform: [{ scale: successScaleAnim }] }]}>
            <View style={styles.successIconWrapper}>
              <Ionicons name="checkmark-circle" size={moderateScale(72)} color={COLORS.success} />
            </View>
            <Text style={styles.successTitle}>Welcome to ONE RIDE!</Text>
            <Text style={styles.successSubtitle}>Your account has been created successfully. You are now being logged in...</Text>
          </Animated.View>
        ) : (
          /* Form */
          <Animated.View style={[styles.formContainer, { transform: [{ translateX: shakeAnim }] }]}>
            <Text style={styles.welcomeText}>Join ONE RIDE Today!</Text>
            <Text style={styles.subtitleText}>Get access to all services in Balingasag</Text>

            {renderInput('person-outline', 'Full Name', name, setName, 'name', { autoCapitalize: 'words' })}
            {renderInput('mail-outline', 'Email Address', email, setEmail, 'email', { keyboard: 'email-address' })}
            {renderInput('phone-portrait-outline', 'Phone Number', phone, setPhone, 'phone', { keyboard: 'phone-pad' })}
            {renderInput('lock-closed-outline', 'Password', password, setPassword, 'password', { secure: true })}

            {/* Password Requirements Hint */}
            {focusedField === 'password' && passwordStrength !== 'strong' && (
              <Text style={styles.passwordHint}>
                Min 8 characters. Use uppercase, numbers, and symbols for a stronger password.
              </Text>
            )}

            {/* Password Strength Indicator */}
            {password.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBarBg}>
                  <View
                    style={[
                      styles.strengthBarFill,
                      { width: strengthConfig.width as any, backgroundColor: strengthConfig.color },
                    ]}
                  />
                </View>
                <Text style={[styles.strengthLabel, { color: strengthConfig.color }]}>
                  {strengthConfig.label}
                </Text>
              </View>
            )}

            {renderInput('lock-closed-outline', 'Confirm Password', confirmPassword, setConfirmPassword, 'confirmPassword', { secure: true })}

            {confirmPassword.length > 0 && password !== confirmPassword && (
              <View style={styles.mismatchRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                <Text style={styles.mismatchText}>Passwords do not match</Text>
              </View>
            )}
            {confirmPassword.length > 0 && password === confirmPassword && (
              <View style={styles.matchRow}>
                <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                <Text style={styles.matchText}>Passwords match</Text>
              </View>
            )}

            {/* Terms & Privacy Checkbox */}
            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => {
                setAgreedToTerms(!agreedToTerms);
                if (fieldErrors.terms) setFieldErrors(prev => { const n = { ...prev }; delete n.terms; return n; });
              }}
              activeOpacity={0.7}
              accessibilityLabel={agreedToTerms ? 'Agreed to terms and privacy policy' : 'Agree to terms and privacy policy'}
              accessibilityRole="button"
            >
              <View style={[
                styles.checkbox,
                agreedToTerms && styles.checkboxChecked,
                fieldErrors.terms ? styles.checkboxError : null,
              ]}>
                {agreedToTerms && (
                  <Ionicons name="checkmark" size={moderateScale(14)} color={COLORS.white} />
                )}
              </View>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => Linking.openURL('https://landing-oneride.vercel.app/terms')}
                >
                  Terms of Service
                </Text>
                {' '}and{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => Linking.openURL('https://landing-oneride.vercel.app/privacy')}
                >
                  Privacy Policy
                </Text>
              </Text>
            </TouchableOpacity>
            {!!fieldErrors.terms && (
              <View style={[styles.errorRow, { marginTop: verticalScale(-4), marginBottom: verticalScale(8) }]}>
                <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                <Text style={styles.errorText}>{fieldErrors.terms}</Text>
              </View>
            )}

            {/* Register Button */}
            <TouchableOpacity
              style={[styles.registerButton, (loading || !agreedToTerms || (confirmPassword.length > 0 && password !== confirmPassword)) && styles.registerButtonDisabled]}
              onPress={handleRegister}
              disabled={loading || (confirmPassword.length > 0 && password !== confirmPassword)}
              accessibilityLabel={loading ? 'Creating account' : 'Create account'}
              accessibilityRole="button"
            >
              {loading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: moderateScale(8) }}>
                  <ActivityIndicator color={COLORS.white} />
                  <Text style={styles.registerButtonText}>Creating account...</Text>
                </View>
              ) : (
                <Text style={styles.registerButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            {/* Login Link */}
            <TouchableOpacity style={styles.loginContainer} onPress={() => navigation.navigate('Login')} accessibilityLabel="Go to login" accessibilityRole="button">
              <Text style={styles.loginText}>Already have an account? </Text>
              <Text style={styles.loginLink}>Login</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  scrollContent: { flexGrow: 1, padding: RESPONSIVE.paddingHorizontal, paddingTop: isIOS ? verticalScale(50) : verticalScale(35) },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(28) },
  backButton: { marginRight: moderateScale(16), minWidth: 44, minHeight: 44, justifyContent: 'center' },
  headerTitle: { fontSize: RESPONSIVE.fontSize.xxlarge, fontWeight: 'bold', color: COLORS.gray800 },
  formContainer: {
    backgroundColor: COLORS.white, borderRadius: moderateScale(20), padding: RESPONSIVE.paddingHorizontal,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: verticalScale(2) }, shadowOpacity: 0.1, shadowRadius: moderateScale(8), elevation: moderateScale(4),
  },
  welcomeText: { fontSize: RESPONSIVE.fontSize.xxlarge, fontWeight: 'bold', color: COLORS.gray800, marginBottom: verticalScale(8), textAlign: 'center' },
  subtitleText: { fontSize: RESPONSIVE.fontSize.medium, color: COLORS.gray500, marginBottom: verticalScale(20), textAlign: 'center' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.gray100,
    borderRadius: RESPONSIVE.borderRadius.medium, paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(12), borderWidth: 1.5, borderColor: COLORS.gray200,
  },
  inputFocused: { borderColor: COLORS.accent, backgroundColor: '#F8FAFF' },
  inputError: { borderColor: COLORS.error, backgroundColor: COLORS.errorBg },
  input: { flex: 1, marginLeft: moderateScale(12), fontSize: RESPONSIVE.fontSize.regular, color: COLORS.gray800 },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(4), marginLeft: moderateScale(4) },
  errorText: { fontSize: RESPONSIVE.fontSize.small, color: COLORS.error, marginLeft: moderateScale(4) },

  // Password strength indicator
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(-8),
    marginBottom: verticalScale(10),
    paddingHorizontal: moderateScale(4),
  },
  strengthBarBg: {
    flex: 1,
    height: moderateScale(4),
    backgroundColor: COLORS.gray200,
    borderRadius: moderateScale(2),
    overflow: 'hidden',
    marginRight: moderateScale(10),
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: moderateScale(2),
  },
  strengthLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    minWidth: moderateScale(52),
    textAlign: 'right',
  },

  // Terms & Privacy
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: verticalScale(16),
    paddingHorizontal: moderateScale(2),
    minHeight: 44,
  },
  checkbox: {
    width: moderateScale(22),
    height: moderateScale(22),
    borderRadius: moderateScale(6),
    borderWidth: 2,
    borderColor: COLORS.gray300,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: moderateScale(10),
    marginTop: verticalScale(1),
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  checkboxError: {
    borderColor: COLORS.error,
  },
  termsText: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray600,
    lineHeight: fontScale(18),
  },
  termsLink: {
    color: COLORS.accent,
    fontWeight: '600',
  },

  // Success state
  successContainer: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(20),
    padding: RESPONSIVE.paddingHorizontal,
    alignItems: 'center',
    paddingVertical: verticalScale(48),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.1,
    shadowRadius: moderateScale(8),
    elevation: moderateScale(4),
  },
  successIconWrapper: {
    width: moderateScale(100),
    height: moderateScale(100),
    borderRadius: moderateScale(50),
    backgroundColor: COLORS.successBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(20),
  },
  successTitle: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(8),
  },
  successSubtitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: fontScale(20),
    paddingHorizontal: moderateScale(16),
  },

  mismatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(-8),
    marginBottom: verticalScale(8),
    paddingHorizontal: moderateScale(4),
  },
  mismatchText: {
    fontSize: fontScale(12),
    color: COLORS.error,
    marginLeft: moderateScale(4),
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(-8),
    marginBottom: verticalScale(8),
    paddingHorizontal: moderateScale(4),
  },
  matchText: {
    fontSize: fontScale(12),
    color: COLORS.success,
    marginLeft: moderateScale(4),
  },

  registerButton: {
    backgroundColor: COLORS.accent, borderRadius: RESPONSIVE.borderRadius.medium, paddingVertical: moderateScale(16), alignItems: 'center', marginTop: verticalScale(8), marginBottom: verticalScale(12),
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: verticalScale(3) },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(6),
    elevation: moderateScale(4),
  },
  registerButtonDisabled: { opacity: 0.5 },
  registerButtonText: { color: COLORS.white, fontSize: RESPONSIVE.fontSize.regular, fontWeight: 'bold' },
  passwordHint: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    marginTop: verticalScale(-8),
    marginBottom: verticalScale(8),
    paddingHorizontal: moderateScale(4),
    lineHeight: fontScale(16),
  },
  loginContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: verticalScale(8), minHeight: 44 },
  loginText: { color: COLORS.gray500, fontSize: RESPONSIVE.fontSize.medium },
  loginLink: { color: COLORS.accent, fontSize: RESPONSIVE.fontSize.medium, fontWeight: 'bold' },
});
