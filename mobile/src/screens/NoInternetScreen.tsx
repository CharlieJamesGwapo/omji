import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { RESPONSIVE, verticalScale, moderateScale, isIOS } from '../utils/responsive';

export default function NoInternetScreen() {
  const [checking, setChecking] = useState(false);

  const handleRetry = async () => {
    setChecking(true);
    try {
      await NetInfo.fetch();
    } catch {}
    // Small delay so the user sees the loading state
    setTimeout(() => setChecking(false), 1000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="cloud-offline" size={moderateScale(80)} color="#EF4444" />
        </View>

        <Text style={styles.title}>No Internet Connection</Text>

        <Text style={styles.description}>
          Please check your WiFi or mobile data connection and try again. OMJI requires an active internet connection to work.
        </Text>

        <TouchableOpacity
          style={[styles.retryButton, checking && styles.retryButtonDisabled]}
          onPress={handleRetry}
          disabled={checking}
          activeOpacity={0.7}
        >
          {checking ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="refresh" size={20} color="#ffffff" />
              <Text style={styles.retryText}>Try Again</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  content: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(32),
    marginHorizontal: RESPONSIVE.marginHorizontal,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    width: '100%',
    maxWidth: 400,
  },
  iconContainer: {
    width: moderateScale(140),
    height: moderateScale(140),
    borderRadius: moderateScale(70),
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(24),
  },
  title: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(12),
    textAlign: 'center',
  },
  description: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: verticalScale(28),
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: moderateScale(14),
    paddingHorizontal: moderateScale(32),
    borderRadius: RESPONSIVE.borderRadius.medium,
    minWidth: moderateScale(160),
    gap: 8,
  },
  retryButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  retryText: {
    color: '#ffffff',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
  },
});
