import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS, isTablet } from '../../utils/responsive';
import { COLORS } from '../../constants/theme';

type BannerType = 'error' | 'success';

interface BannerState {
  visible: boolean;
  message: string;
  type: BannerType;
}

export default function LoginScreen({ navigation }: any) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [banner, setBanner] = useState<BannerState>({
    visible: false,
    message: '',
    type: 'error',
  });

  const { login } = useAuth();

  // Animation refs
  const bannerSlideAnim = useRef(new Animated.Value(-100)).current;
  const bannerOpacityAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, []);

  const showBanner = useCallback(
    (message: string, type: BannerType) => {
      // Clear any existing dismiss timer
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }

      setBanner({ visible: true, message, type });

      // Reset and animate in
      bannerSlideAnim.setValue(-100);
      bannerOpacityAnim.setValue(0);

      Animated.parallel([
        Animated.spring(bannerSlideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(bannerOpacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss after 4 seconds
      dismissTimer.current = setTimeout(() => {
        hideBanner();
      }, 4000);
    },
    [bannerSlideAnim, bannerOpacityAnim],
  );

  const hideBanner = useCallback(() => {
    Animated.parallel([
      Animated.timing(bannerSlideAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(bannerOpacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setBanner((prev) => ({ ...prev, visible: false }));
    });
  }, [bannerSlideAnim, bannerOpacityAnim]);

  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 4,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnim]);

  const clearFieldErrors = () => {
    setPhoneError('');
    setPasswordError('');
  };

  const handleLogin = async () => {
    clearFieldErrors();

    // Inline field validation
    let hasError = false;
    if (!phone.trim()) {
      setPhoneError('Phone number or email is required');
      hasError = true;
    }
    if (!password) {
      setPasswordError('Password is required');
      hasError = true;
    }
    if (hasError) {
      triggerShake();
      return;
    }

    setLoading(true);
    try {
      await login(phone, password);
      // Show success banner briefly before navigation handles the transition
      showBanner('Login successful! Redirecting...', 'success');
    } catch (error: any) {
      const message = error.message || 'Invalid credentials';
      showBanner(message, 'error');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.content}>
          {/* Minimal Logo Section */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image
                source={require('../../../assets/icon.png')}
                style={styles.logo}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.appName}>OMJI</Text>
            <Text style={styles.tagline}>One App. All Rides. All Services.</Text>
          </View>

          {/* Compact Login Form */}
          <Animated.View
            style={[
              styles.formContainer,
              { transform: [{ translateX: shakeAnim }] },
            ]}
          >
            <Text style={styles.welcomeText}>Welcome Back!</Text>

            {/* Toast Banner */}
            {banner.visible && (
              <Animated.View
                style={[
                  styles.banner,
                  banner.type === 'error'
                    ? styles.bannerError
                    : styles.bannerSuccess,
                  {
                    transform: [{ translateY: bannerSlideAnim }],
                    opacity: bannerOpacityAnim,
                  },
                ]}
              >
                <Ionicons
                  name={
                    banner.type === 'error'
                      ? 'alert-circle'
                      : 'checkmark-circle'
                  }
                  size={20}
                  color={banner.type === 'error' ? COLORS.primaryDark : COLORS.successDark}
                  style={styles.bannerIcon}
                />
                <Text
                  style={[
                    styles.bannerText,
                    banner.type === 'error'
                      ? styles.bannerTextError
                      : styles.bannerTextSuccess,
                  ]}
                  numberOfLines={2}
                >
                  {banner.message}
                </Text>
                <TouchableOpacity onPress={hideBanner} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons
                    name="close"
                    size={18}
                    color={banner.type === 'error' ? COLORS.primaryDark : COLORS.successDark}
                  />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Phone/Email Input */}
            <View
              style={[
                styles.inputWrapper,
                phoneFocused && styles.inputWrapperFocused,
                phoneError ? styles.inputWrapperError : null,
              ]}
            >
              <Ionicons
                name="person"
                size={20}
                color={phoneError ? COLORS.error : phoneFocused ? COLORS.primaryDark : COLORS.gray400}
                style={styles.icon}
              />
              <TextInput
                style={styles.input}
                placeholder="Phone Number or Email"
                placeholderTextColor={COLORS.gray400}
                value={phone}
                onChangeText={(text) => {
                  setPhone(text);
                  if (phoneError) setPhoneError('');
                }}
                onFocus={() => setPhoneFocused(true)}
                onBlur={() => setPhoneFocused(false)}
                autoCapitalize="none"
              />
            </View>
            {phoneError ? (
              <Text style={styles.fieldError}>{phoneError}</Text>
            ) : null}

            {/* Password Input */}
            <View
              style={[
                styles.inputWrapper,
                passwordFocused && styles.inputWrapperFocused,
                passwordError ? styles.inputWrapperError : null,
              ]}
            >
              <Ionicons
                name="lock-closed"
                size={20}
                color={passwordError ? COLORS.error : passwordFocused ? COLORS.primaryDark : COLORS.gray400}
                style={styles.icon}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={COLORS.gray400}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError('');
                }}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? 'eye' : 'eye-off'}
                  size={20}
                  color={COLORS.gray400}
                />
              </TouchableOpacity>
            </View>
            {passwordError ? (
              <Text style={styles.fieldError}>{passwordError}</Text>
            ) : null}

            {/* Forgot Password */}
            <TouchableOpacity style={styles.forgotButton} onPress={() => Alert.alert('Reset Password', 'To reset your password, please contact support at support@omji.app or call +63 912 345 6789.')}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.loginText}>Login</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.line} />
            </View>

            {/* Sign Up */}
            <TouchableOpacity
              style={styles.signupButton}
              onPress={() => navigation.navigate('Register')}
            >
              <Text style={styles.signupText}>
                Don't have an account?{' '}
                <Text style={styles.signupLink}>Sign Up</Text>
              </Text>
            </TouchableOpacity>

            {/* Driver Signup */}
            <TouchableOpacity
              style={styles.driverSignupButton}
              onPress={() => {
                Alert.alert(
                  'Become a Driver',
                  'To become a driver, please create an account first, then register as a driver from your Profile screen.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Create Account', onPress: () => navigation.navigate('Register') },
                  ]
                );
              }}
            >
              <Ionicons name="car-sport" size={18} color={COLORS.success} />
              <Text style={styles.driverSignupText}>
                Want to earn?{' '}
                <Text style={styles.driverSignupLink}>Become a Driver</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },

  // Header Section
  header: {
    alignItems: 'center',
    marginBottom: verticalScale(28),
  },
  logoContainer: {
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(20),
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(12),
    overflow: 'hidden',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.1,
    shadowRadius: moderateScale(12),
    elevation: moderateScale(6),
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: RESPONSIVE.fontSize.heading,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
    letterSpacing: 1,
    marginBottom: verticalScale(4),
  },
  tagline: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    fontWeight: '400',
  },

  // Form Container
  formContainer: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(24),
    padding: moderateScale(24),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.06,
    shadowRadius: moderateScale(16),
    elevation: moderateScale(3),
  },
  welcomeText: {
    fontSize: fontScale(22),
    fontWeight: 'bold',
    color: COLORS.gray900,
    marginBottom: verticalScale(16),
    textAlign: 'center',
  },

  // Toast Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: moderateScale(10),
    borderWidth: 1,
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(10),
    marginBottom: verticalScale(12),
  },
  bannerError: {
    backgroundColor: COLORS.errorBg,
    borderColor: COLORS.primaryDark,
  },
  bannerSuccess: {
    backgroundColor: COLORS.successBg,
    borderColor: COLORS.successDark,
  },
  bannerIcon: {
    marginRight: moderateScale(8),
  },
  bannerText: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '500',
  },
  bannerTextError: {
    color: COLORS.primaryDark,
  },
  bannerTextSuccess: {
    color: COLORS.successDark,
  },

  // Input Fields
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.large,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(15),
    marginBottom: verticalScale(12),
  },
  inputWrapperFocused: {
    borderColor: COLORS.primaryDark,
    backgroundColor: '#FFFBFB',
  },
  inputWrapperError: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorBg,
  },
  icon: {
    marginRight: moderateScale(10),
  },
  input: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray900,
  },

  // Inline field error
  fieldError: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.error,
    marginTop: verticalScale(-8),
    marginBottom: verticalScale(8),
    marginLeft: moderateScale(14),
    fontWeight: '500',
  },

  // Forgot Password
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: verticalScale(16),
  },
  forgotText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.primaryDark,
    fontWeight: '600',
  },

  // Login Button
  loginButton: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(12),
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(8),
    elevation: moderateScale(5),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loginText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.white,
    letterSpacing: 0.3,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(12),
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.gray200,
  },
  dividerText: {
    marginHorizontal: moderateScale(12),
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
    fontWeight: '500',
  },

  // Sign Up
  signupButton: {
    alignItems: 'center',
  },
  signupText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
  },
  signupLink: {
    color: COLORS.primaryDark,
    fontWeight: 'bold',
  },

  // Driver Signup
  driverSignupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(12),
    paddingVertical: moderateScale(12),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    backgroundColor: COLORS.successBg,
    borderRadius: moderateScale(10),
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  driverSignupText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    marginLeft: moderateScale(8),
  },
  driverSignupLink: {
    color: COLORS.success,
    fontWeight: 'bold',
  },
});
