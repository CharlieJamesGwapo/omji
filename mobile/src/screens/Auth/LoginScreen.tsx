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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { fontScale, verticalScale, moderateScale } from '../../utils/responsive';
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
  const [banner, setBanner] = useState<BannerState>({ visible: false, message: '', type: 'error' });

  const { login } = useAuth();

  const bannerSlideAnim = useRef(new Animated.Value(-100)).current;
  const bannerOpacityAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoAnim = useRef(new Animated.Value(0.9)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passwordInputRef = useRef<TextInput>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoAnim, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, delay: 150, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); };
  }, []);

  const showBanner = useCallback((message: string, type: BannerType) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setBanner({ visible: true, message, type });
    bannerSlideAnim.setValue(-60);
    bannerOpacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(bannerSlideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(bannerOpacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    dismissTimer.current = setTimeout(hideBanner, 4000);
  }, [bannerSlideAnim, bannerOpacityAnim]);

  const hideBanner = useCallback(() => {
    Animated.parallel([
      Animated.timing(bannerSlideAnim, { toValue: -60, duration: 180, useNativeDriver: true }),
      Animated.timing(bannerOpacityAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setBanner(prev => ({ ...prev, visible: false })));
  }, [bannerSlideAnim, bannerOpacityAnim]);

  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleLogin = async () => {
    setPhoneError('');
    setPasswordError('');
    let hasError = false;
    if (!phone.trim()) { setPhoneError('Required'); hasError = true; }
    if (!password) { setPasswordError('Required'); hasError = true; }
    if (hasError) { triggerShake(); return; }

    setLoading(true);
    try {
      await login(phone, password);
      showBanner('Login successful!', 'success');
    } catch (error: any) {
      showBanner(error.response?.data?.error || error.message || 'Invalid credentials', 'error');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>

          {/* Logo */}
          <Animated.View style={[styles.logoSection, { transform: [{ scale: logoAnim }] }]}>
            <View style={styles.logoShadow}>
              <View style={styles.logoBox}>
                <Image source={require('../../../assets/icon.png')} style={styles.logo} resizeMode="cover" />
              </View>
            </View>
            <Text style={styles.appName}>OMJI</Text>
            <Text style={styles.tagline}>Your Ride. Your Delivery. Your Way.</Text>

            {/* Service Pills */}
            <View style={styles.pills}>
              <View style={[styles.pill, { backgroundColor: COLORS.primaryBg }]}>
                <Ionicons name="car-outline" size={14} color={COLORS.primaryDark} />
                <Text style={[styles.pillText, { color: COLORS.primaryDark }]}>Pasundo</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: COLORS.primaryBg }]}>
                <Ionicons name="cube-outline" size={14} color={COLORS.primaryDark} />
                <Text style={[styles.pillText, { color: COLORS.primaryDark }]}>Pasugo</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: COLORS.primaryBg }]}>
                <Ionicons name="people-outline" size={14} color={COLORS.primaryDark} />
                <Text style={[styles.pillText, { color: COLORS.primaryDark }]}>Pasabay</Text>
              </View>
            </View>
          </Animated.View>

          {/* Form */}
          <Animated.View style={[styles.form, { opacity: fadeAnim, transform: [{ translateX: shakeAnim }] }]}>

            {/* Banner */}
            {banner.visible && (
              <Animated.View style={[styles.banner, banner.type === 'error' ? styles.bannerErr : styles.bannerOk, { transform: [{ translateY: bannerSlideAnim }], opacity: bannerOpacityAnim }]}>
                <Ionicons name={banner.type === 'error' ? 'alert-circle' : 'checkmark-circle'} size={18} color={banner.type === 'error' ? COLORS.primaryDark : COLORS.successDark} />
                <Text style={[styles.bannerMsg, { color: banner.type === 'error' ? COLORS.primaryDark : COLORS.successDark }]} numberOfLines={2}>{banner.message}</Text>
                <TouchableOpacity onPress={hideBanner} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Dismiss" accessibilityRole="button">
                  <Ionicons name="close" size={16} color={banner.type === 'error' ? COLORS.primaryDark : COLORS.successDark} />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Phone */}
            <Text style={styles.label}>Phone or Email</Text>
            <View style={[styles.field, phoneFocused && styles.fieldFocus, phoneError ? styles.fieldErr : null]}>
              <Ionicons name="person-outline" size={18} color={phoneError ? COLORS.error : phoneFocused ? COLORS.primaryDark : COLORS.gray300} style={styles.fieldIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter phone or email"
                placeholderTextColor={COLORS.gray400}
                value={phone}
                onChangeText={t => { setPhone(t); if (phoneError) setPhoneError(''); }}
                onFocus={() => setPhoneFocused(true)}
                onBlur={() => setPhoneFocused(false)}
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                accessibilityLabel="Phone number or email"
              />
            </View>
            {phoneError ? <Text style={styles.err}>{phoneError}</Text> : null}

            {/* Password */}
            <View style={styles.labelRow}>
              <Text style={styles.label}>Password</Text>
              <TouchableOpacity onPress={() => Alert.alert('Reset Password', 'Contact support@omji.app or call +63 912 345 6789.')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Forgot password" accessibilityRole="button">
                <Text style={styles.forgot}>Forgot?</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.field, passwordFocused && styles.fieldFocus, passwordError ? styles.fieldErr : null]}>
              <Ionicons name="lock-closed-outline" size={18} color={passwordError ? COLORS.error : passwordFocused ? COLORS.primaryDark : COLORS.gray300} style={styles.fieldIcon} />
              <TextInput
                ref={passwordInputRef}
                style={styles.input}
                placeholder="Enter password"
                placeholderTextColor={COLORS.gray400}
                value={password}
                onChangeText={t => { setPassword(t); if (passwordError) setPasswordError(''); }}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                accessibilityLabel="Password"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} accessibilityRole="button">
                <Ionicons name={showPassword ? 'eye' : 'eye-off-outline'} size={18} color={COLORS.gray400} />
              </TouchableOpacity>
            </View>
            {passwordError ? <Text style={styles.err}>{passwordError}</Text> : null}

            {/* Sign In Button */}
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnOff]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityLabel={loading ? 'Signing in' : 'Sign in'}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.btnText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.or}>or</Text>
              <View style={styles.line} />
            </View>

            {/* Sign Up */}
            <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('Register')} accessibilityLabel="Create account" accessibilityRole="button">
              <Text style={styles.linkText}>Don't have an account? <Text style={styles.linkBold}>Sign Up</Text></Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Driver CTA */}
          <Animated.View style={{ opacity: fadeAnim }}>
            <TouchableOpacity
              style={styles.driverCta}
              onPress={() => Alert.alert('Become a Driver', 'Create an account first, then register as a driver from your Profile.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign Up', onPress: () => navigation.navigate('Register') }])}
              activeOpacity={0.7}
              accessibilityLabel="Become a driver"
              accessibilityRole="button"
            >
              <Ionicons name="car-sport-outline" size={18} color={COLORS.success} />
              <Text style={styles.driverText}>Want to earn? <Text style={styles.driverBold}>Become a Driver</Text></Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.gray300} />
            </TouchableOpacity>
          </Animated.View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>By continuing, you agree to our <Text style={styles.footerLink}>Terms</Text> & <Text style={styles.footerLink}>Privacy Policy</Text></Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  scroll: { flexGrow: 1, paddingHorizontal: moderateScale(28) },

  // Logo
  logoSection: { alignItems: 'center', paddingTop: verticalScale(60), marginBottom: verticalScale(32) },
  logoShadow: {
    marginBottom: verticalScale(14),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  logoBox: {
    width: moderateScale(96),
    height: moderateScale(96),
    borderRadius: moderateScale(24),
    overflow: 'hidden',
    backgroundColor: COLORS.white,
  },
  logo: { width: '100%', height: '100%' },
  appName: { fontSize: fontScale(30), fontWeight: '800', color: COLORS.gray900, letterSpacing: 4 },
  tagline: { fontSize: fontScale(13), color: COLORS.gray400, marginTop: verticalScale(4), letterSpacing: 0.3 },
  pills: { flexDirection: 'row', marginTop: verticalScale(14), gap: moderateScale(8) },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(10),
    paddingVertical: moderateScale(6),
    borderRadius: moderateScale(20),
    gap: moderateScale(4),
  },
  pillText: { fontSize: fontScale(11), fontWeight: '600' },

  // Form
  form: { marginBottom: verticalScale(20) },

  // Banner
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: moderateScale(10), paddingHorizontal: moderateScale(12), paddingVertical: moderateScale(10), marginBottom: verticalScale(16), gap: moderateScale(8) },
  bannerErr: { backgroundColor: COLORS.errorBg },
  bannerOk: { backgroundColor: COLORS.successBg },
  bannerMsg: { flex: 1, fontSize: fontScale(13), fontWeight: '500' },

  // Fields
  label: { fontSize: fontScale(13), fontWeight: '600', color: COLORS.gray700, marginBottom: verticalScale(6) },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(6), marginTop: verticalScale(4) },
  forgot: { fontSize: fontScale(13), color: COLORS.primaryDark, fontWeight: '600' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: COLORS.gray200,
    backgroundColor: COLORS.gray50,
    paddingHorizontal: moderateScale(14),
    height: verticalScale(50),
    marginBottom: verticalScale(4),
  },
  fieldFocus: { borderColor: COLORS.primaryDark, backgroundColor: COLORS.white },
  fieldErr: { borderColor: COLORS.error, backgroundColor: COLORS.errorBg },
  fieldIcon: { marginRight: moderateScale(10) },
  input: { flex: 1, fontSize: fontScale(15), color: COLORS.gray900, paddingVertical: 0 },
  err: { fontSize: fontScale(11), color: COLORS.error, marginLeft: moderateScale(4), marginBottom: verticalScale(4), fontWeight: '500' },

  // Button
  btn: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: moderateScale(12),
    height: verticalScale(52),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(20),
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnOff: { opacity: 0.6 },
  btnText: { fontSize: fontScale(16), fontWeight: '700', color: COLORS.white, letterSpacing: 0.3 },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: verticalScale(20) },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.gray200 },
  or: { marginHorizontal: moderateScale(16), fontSize: fontScale(12), color: COLORS.gray400 },

  // Links
  linkBtn: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: fontScale(14), color: COLORS.gray500 },
  linkBold: { color: COLORS.primaryDark, fontWeight: '700' },

  // Driver
  driverCta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: moderateScale(14),
    paddingHorizontal: moderateScale(16),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.gray50,
    gap: moderateScale(8),
    marginBottom: verticalScale(8),
  },
  driverText: { flex: 1, fontSize: fontScale(13), color: COLORS.gray500 },
  driverBold: { color: COLORS.successDark, fontWeight: '700' },

  // Footer
  footer: { paddingVertical: verticalScale(16), alignItems: 'center' },
  footerText: { fontSize: fontScale(11), color: COLORS.gray400, textAlign: 'center', lineHeight: fontScale(16) },
  footerLink: { color: COLORS.gray500, fontWeight: '600' },
});
