import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Platform,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';
import { RESPONSIVE, verticalScale, moderateScale, fontScale, isIOS } from '../utils/responsive';

export default function NoInternetScreen() {
  const [checking, setChecking] = useState(false);

  // Animated pulse for the icon
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in on mount
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // Pulse loop
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const handleRetry = async () => {
    setChecking(true);
    try {
      await NetInfo.fetch();
    } catch {}
    // Small delay so the user sees the loading state
    setTimeout(() => setChecking(false), 1000);
  };

  const openWiFiSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('App-Prefs:WIFI');
    } else {
      Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() => {
        Linking.openSettings();
      });
    }
  };

  const openMobileDataSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('App-Prefs:MOBILE_DATA_SETTINGS_ID');
    } else {
      Linking.sendIntent('android.settings.DATA_ROAMING_SETTINGS').catch(() => {
        Linking.openSettings();
      });
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Animated Icon */}
        <Animated.View style={[styles.iconOuterRing, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.iconInnerRing}>
            <View style={styles.iconContainer}>
              <Ionicons name="cloud-offline" size={moderateScale(52)} color={COLORS.primary} />
            </View>
          </View>
        </Animated.View>

        <Text style={styles.title}>No Internet Connection</Text>

        <Text style={styles.description}>
          It looks like you're offline. Please check your connection and try again.
        </Text>

        {/* Retry Button */}
        <TouchableOpacity
          style={[styles.retryButton, checking && styles.retryButtonDisabled]}
          onPress={handleRetry}
          disabled={checking}
          activeOpacity={0.8}
          accessibilityLabel={checking ? 'Checking connection' : 'Retry connection'}
          accessibilityRole="button"
        >
          {checking ? (
            <>
              <ActivityIndicator size="small" color={COLORS.white} />
              <Text style={styles.retryText}>Checking...</Text>
            </>
          ) : (
            <>
              <Ionicons name="refresh" size={moderateScale(20)} color={COLORS.white} />
              <Text style={styles.retryText}>Try Again</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Suggestions */}
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>Troubleshooting</Text>

          <TouchableOpacity style={styles.suggestionItem} onPress={openWiFiSettings} activeOpacity={0.7} accessibilityLabel="Open WiFi settings" accessibilityRole="button">
            <View style={[styles.suggestionIcon, { backgroundColor: COLORS.accentBg }]}>
              <Ionicons name="wifi" size={moderateScale(18)} color={COLORS.accent} />
            </View>
            <View style={styles.suggestionInfo}>
              <Text style={styles.suggestionLabel}>Check WiFi Settings</Text>
              <Text style={styles.suggestionSubtext}>Make sure WiFi is turned on and connected</Text>
            </View>
            <Ionicons name="chevron-forward" size={moderateScale(16)} color={COLORS.gray300} />
          </TouchableOpacity>

          <View style={styles.suggestionDivider} />

          <TouchableOpacity style={styles.suggestionItem} onPress={openMobileDataSettings} activeOpacity={0.7} accessibilityLabel="Open mobile data settings" accessibilityRole="button">
            <View style={[styles.suggestionIcon, { backgroundColor: COLORS.successBg }]}>
              <Ionicons name="cellular" size={moderateScale(18)} color={COLORS.success} />
            </View>
            <View style={styles.suggestionInfo}>
              <Text style={styles.suggestionLabel}>Check Mobile Data</Text>
              <Text style={styles.suggestionSubtext}>Ensure mobile data is enabled</Text>
            </View>
            <Ionicons name="chevron-forward" size={moderateScale(16)} color={COLORS.gray300} />
          </TouchableOpacity>

          <View style={styles.suggestionDivider} />

          <View style={styles.suggestionItem}>
            <View style={[styles.suggestionIcon, { backgroundColor: COLORS.warningBg }]}>
              <Ionicons name="airplane" size={moderateScale(18)} color={COLORS.warning} />
            </View>
            <View style={styles.suggestionInfo}>
              <Text style={styles.suggestionLabel}>Airplane Mode</Text>
              <Text style={styles.suggestionSubtext}>Make sure airplane mode is turned off</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    maxWidth: moderateScale(400),
  },
  iconOuterRing: {
    width: moderateScale(160),
    height: moderateScale(160),
    borderRadius: moderateScale(80),
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(28),
  },
  iconInnerRing: {
    width: moderateScale(130),
    height: moderateScale(130),
    borderRadius: moderateScale(65),
    backgroundColor: `${COLORS.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: moderateScale(100),
    height: moderateScale(100),
    borderRadius: moderateScale(50),
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  title: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: COLORS.gray900,
    marginBottom: verticalScale(10),
    textAlign: 'center',
  },
  description: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: fontScale(24),
    marginBottom: verticalScale(28),
    paddingHorizontal: moderateScale(16),
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: moderateScale(14),
    paddingHorizontal: moderateScale(36),
    borderRadius: RESPONSIVE.borderRadius.medium,
    minWidth: moderateScale(180),
    minHeight: moderateScale(48),
    gap: moderateScale(8),
    marginBottom: verticalScale(32),
    ...SHADOWS.colored(COLORS.accent),
  },
  retryButtonDisabled: {
    backgroundColor: COLORS.accentLight,
  },
  retryText: {
    color: COLORS.white,
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
  },
  suggestionsContainer: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(20),
    ...SHADOWS.md,
  },
  suggestionsTitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.gray500,
    textTransform: 'uppercase',
    letterSpacing: moderateScale(0.5),
    marginBottom: verticalScale(16),
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(10),
    minHeight: moderateScale(44),
  },
  suggestionIcon: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionInfo: {
    flex: 1,
    marginLeft: moderateScale(14),
  },
  suggestionLabel: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: verticalScale(2),
  },
  suggestionSubtext: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
  },
  suggestionDivider: {
    height: 1,
    backgroundColor: COLORS.gray100,
    marginVertical: verticalScale(4),
    marginLeft: moderateScale(54),
  },
});
