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
  ScrollView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { RESPONSIVE, fontScale, verticalScale, moderateScale } from '../../utils/responsive';
import { COLORS } from '../../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideUpAnim = useRef(new Animated.Value(40)).current;
  const logoScaleAnim = useRef(new Animated.Value(0.8)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passwordInputRef = useRef<TextInput>(null);

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideUpAnim, {
        toValue: 0,
        tension: 50,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

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
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }

      setBanner({ visible: true, message, type });

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
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const clearFieldErrors = () => {
    setPhoneError('');
    setPasswordError('');
  };

  const handleLogin = async () => {
    clearFieldErrors();

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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Hero Section with Gradient */}
          <LinearGradient
            colors={['#DC2626', '#B91C1C', '#991B1B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroSection}
          >
            {/* Decorative circles */}
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />
            <View style={styles.decorCircle3} />

            <Animated.View style={[styles.logoArea, { transform: [{ scale: logoScaleAnim }] }]}>
              <View style={styles.logoContainer}>
                <Image
                  source={require('../../../assets/icon.png')}
                  style={styles.logo}
                  resizeMode="cover"
                />
              </View>
              <Text style={styles.appName}>OMJI</Text>
              <Text style={styles.tagline}>One App. All Rides. All Services.</Text>
            </Animated.View>
          </LinearGradient>

          {/* Form Card */}
          <Animated.View
            style={[
              styles.formCard,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideUpAnim }, { translateX: shakeAnim }],
              },
            ]}
          >
            <Text style={styles.welcomeText}>Welcome Back!</Text>
            <Text style={styles.welcomeSub}>Sign in to continue your journey</Text>

            {/* Toast Banner */}
            {banner.visible && (
              <Animated.View
                style={[
                  styles.banner,
                  banner.type === 'error' ? styles.bannerError : styles.bannerSuccess,
                  {
                    transform: [{ translateY: bannerSlideAnim }],
                    opacity: bannerOpacityAnim,
                  },
                ]}
              >
                <Ionicons
                  name={banner.type === 'error' ? 'alert-circle' : 'checkmark-circle'}
                  size={20}
                  color={banner.type === 'error' ? COLORS.primaryDark : COLORS.successDark}
                  style={styles.bannerIcon}
                />
                <Text
                  style={[
                    styles.bannerText,
                    banner.type === 'error' ? styles.bannerTextError : styles.bannerTextSuccess,
                  ]}
                  numberOfLines={2}
                >
                  {banner.message}
                </Text>
                <TouchableOpacity
                  onPress={hideBanner}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityLabel="Dismiss notification"
                  accessibilityRole="button"
                >
                  <Ionicons
                    name="close"
                    size={18}
                    color={banner.type === 'error' ? COLORS.primaryDark : COLORS.successDark}
                  />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Phone/Email Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone or Email</Text>
              <View
                style={[
                  styles.inputWrapper,
                  phoneFocused && styles.inputWrapperFocused,
                  phoneError ? styles.inputWrapperError : null,
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={phoneError ? COLORS.error : phoneFocused ? COLORS.primaryDark : COLORS.gray400}
                  style={styles.icon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your phone or email"
                  placeholderTextColor={COLORS.gray400}
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text);
                    if (phoneError) setPhoneError('');
                  }}
                  onFocus={() => setPhoneFocused(true)}
                  onBlur={() => setPhoneFocused(false)}
                  autoCapitalize="none"
                  autoComplete="email"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  accessibilityLabel="Phone number or email"
                />
              </View>
              {phoneError ? <Text style={styles.fieldError}>{phoneError}</Text> : null}
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Password</Text>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert(
                      'Reset Password',
                      'To reset your password, please contact support at support@omji.app or call +63 912 345 6789.',
                    )
                  }
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Forgot password"
                  accessibilityRole="button"
                >
                  <Text style={styles.forgotText}>Forgot?</Text>
                </TouchableOpacity>
              </View>
              <View
                style={[
                  styles.inputWrapper,
                  passwordFocused && styles.inputWrapperFocused,
                  passwordError ? styles.inputWrapperError : null,
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={passwordError ? COLORS.error : passwordFocused ? COLORS.primaryDark : COLORS.gray400}
                  style={styles.icon}
                />
                <TextInput
                  ref={passwordInputRef}
                  style={styles.input}
                  placeholder="Enter your password"
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
                  autoComplete="current-password"
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                  accessibilityLabel="Password"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={showPassword ? 'eye' : 'eye-off'}
                    size={20}
                    color={COLORS.gray400}
                  />
                </TouchableOpacity>
              </View>
              {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}
            </View>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityLabel={loading ? 'Logging in' : 'Login'}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={loading ? ['#9CA3AF', '#6B7280'] : ['#DC2626', '#B91C1C']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginGradient}
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={COLORS.white} size="small" />
                    <Text style={styles.loginText}>Signing in...</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.loginText}>Sign In</Text>
                    <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
                  </>
                )}
              </LinearGradient>
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
              activeOpacity={0.7}
              accessibilityLabel="Sign up for a new account"
              accessibilityRole="button"
            >
              <Text style={styles.signupText}>
                Don't have an account?{' '}
                <Text style={styles.signupLink}>Sign Up</Text>
              </Text>
            </TouchableOpacity>

            {/* Driver CTA */}
            <TouchableOpacity
              style={styles.driverButton}
              onPress={() => {
                Alert.alert(
                  'Become a Driver',
                  'To become a driver, please create an account first, then register as a driver from your Profile screen.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Create Account', onPress: () => navigation.navigate('Register') },
                  ],
                );
              }}
              activeOpacity={0.7}
              accessibilityLabel="Become a driver"
              accessibilityRole="button"
            >
              <View style={styles.driverIconWrap}>
                <Ionicons name="car-sport" size={16} color={COLORS.white} />
              </View>
              <Text style={styles.driverText}>
                Want to earn? <Text style={styles.driverLink}>Become a Driver</Text>
              </Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.success} />
            </TouchableOpacity>
          </Animated.View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By signing in, you agree to our{' '}
              <Text style={styles.footerLink}>Terms</Text> &{' '}
              <Text style={styles.footerLink}>Privacy Policy</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // Hero Section
  heroSection: {
    paddingTop: verticalScale(60),
    paddingBottom: verticalScale(50),
    overflow: 'hidden',
    position: 'relative',
  },
  decorCircle1: {
    position: 'absolute',
    width: moderateScale(200),
    height: moderateScale(200),
    borderRadius: moderateScale(100),
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -moderateScale(40),
    right: -moderateScale(60),
  },
  decorCircle2: {
    position: 'absolute',
    width: moderateScale(120),
    height: moderateScale(120),
    borderRadius: moderateScale(60),
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -moderateScale(20),
    left: -moderateScale(30),
  },
  decorCircle3: {
    position: 'absolute',
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(40),
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: moderateScale(20),
    left: moderateScale(40),
  },
  logoArea: {
    alignItems: 'center',
    zIndex: 1,
  },
  logoContainer: {
    width: moderateScale(100),
    height: moderateScale(100),
    borderRadius: moderateScale(28),
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: verticalScale(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: fontScale(32),
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 2,
    marginBottom: verticalScale(6),
  },
  tagline: {
    fontSize: fontScale(13),
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  // Form Card
  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(24),
    marginHorizontal: moderateScale(20),
    marginTop: verticalScale(-28),
    padding: moderateScale(24),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  welcomeText: {
    fontSize: fontScale(24),
    fontWeight: '700',
    color: COLORS.gray900,
    textAlign: 'center',
  },
  welcomeSub: {
    fontSize: fontScale(14),
    color: COLORS.gray400,
    textAlign: 'center',
    marginTop: verticalScale(4),
    marginBottom: verticalScale(24),
  },

  // Toast Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: moderateScale(12),
    borderWidth: 1,
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(10),
    marginBottom: verticalScale(16),
  },
  bannerError: {
    backgroundColor: COLORS.errorBg,
    borderColor: COLORS.errorLight,
  },
  bannerSuccess: {
    backgroundColor: COLORS.successBg,
    borderColor: COLORS.successLight,
  },
  bannerIcon: {
    marginRight: moderateScale(8),
  },
  bannerText: {
    flex: 1,
    fontSize: fontScale(13),
    fontWeight: '500',
  },
  bannerTextError: {
    color: COLORS.primaryDark,
  },
  bannerTextSuccess: {
    color: COLORS.successDark,
  },

  // Input Fields
  inputGroup: {
    marginBottom: verticalScale(16),
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(6),
  },
  inputLabel: {
    fontSize: fontScale(13),
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: verticalScale(6),
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: moderateScale(14),
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    paddingHorizontal: moderateScale(14),
    height: verticalScale(52),
  },
  inputWrapperFocused: {
    borderColor: COLORS.primaryDark,
    backgroundColor: '#FFFBFB',
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
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
    fontSize: fontScale(15),
    color: COLORS.gray900,
    paddingVertical: 0,
  },

  // Field error
  fieldError: {
    fontSize: fontScale(12),
    color: COLORS.error,
    marginTop: verticalScale(4),
    marginLeft: moderateScale(4),
    fontWeight: '500',
  },

  // Forgot Password
  forgotText: {
    fontSize: fontScale(13),
    color: COLORS.primaryDark,
    fontWeight: '600',
  },

  // Login Button
  loginButton: {
    borderRadius: moderateScale(14),
    overflow: 'hidden',
    marginTop: verticalScale(8),
    marginBottom: verticalScale(16),
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  loginGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(16),
    gap: moderateScale(8),
  },
  buttonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
  },
  loginText: {
    fontSize: fontScale(16),
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.5,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(8),
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.gray200,
  },
  dividerText: {
    marginHorizontal: moderateScale(16),
    fontSize: fontScale(12),
    color: COLORS.gray400,
    fontWeight: '600',
    letterSpacing: 1,
  },

  // Sign Up
  signupButton: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: verticalScale(12),
  },
  signupText: {
    fontSize: fontScale(14),
    color: COLORS.gray500,
  },
  signupLink: {
    color: COLORS.primaryDark,
    fontWeight: '700',
  },

  // Driver CTA
  driverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successBg,
    borderRadius: moderateScale(12),
    paddingVertical: moderateScale(14),
    paddingHorizontal: moderateScale(16),
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  driverIconWrap: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(10),
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: moderateScale(10),
  },
  driverText: {
    flex: 1,
    fontSize: fontScale(13),
    color: COLORS.gray600,
  },
  driverLink: {
    color: COLORS.successDark,
    fontWeight: '700',
  },

  // Footer
  footer: {
    paddingVertical: verticalScale(20),
    alignItems: 'center',
    paddingHorizontal: moderateScale(40),
  },
  footerText: {
    fontSize: fontScale(11),
    color: COLORS.gray400,
    textAlign: 'center',
    lineHeight: fontScale(16),
  },
  footerLink: {
    color: COLORS.primaryDark,
    fontWeight: '600',
  },
});
