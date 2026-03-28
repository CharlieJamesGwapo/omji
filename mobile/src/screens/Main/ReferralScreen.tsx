import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Share, ActivityIndicator, StatusBar,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { referralService } from '../../services/api';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';
import Toast, { ToastType } from '../../components/Toast';

const HOW_IT_WORKS = [
  { step: 1, icon: 'share-social-outline', title: 'Share your code', desc: 'Send your referral code to friends and family' },
  { step: 2, icon: 'person-add-outline', title: 'They sign up & ride', desc: 'They sign up and take their first ride' },
  { step: 3, icon: 'gift-outline', title: 'Earn rewards', desc: 'You both earn bonus rewards' },
];

export default function ReferralScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [stats, setStats] = useState({ total_referrals: 0, bonus_earned: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      setLoading(true);
      const [codeRes, statsRes] = await Promise.allSettled([
        referralService.getCode(),
        referralService.getStats(),
      ]);

      if (codeRes.status === 'fulfilled') {
        const referralCode = codeRes.value?.data?.data?.code;
        if (referralCode) setCode(referralCode);
      }

      if (statsRes.status === 'fulfilled') {
        const data = statsRes.value?.data?.data;
        if (data) {
          setStats({
            total_referrals: data.total_referrals ?? 0,
            bonus_earned: data.bonus_earned ?? 0,
            pending: data.pending ?? 0,
          });
        }
      }
    } catch {
      showToast('Failed to load referral data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      showToast('Referral code copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy code', 'error');
    }
  };

  const handleShare = async () => {
    if (!code) return;
    try {
      await Share.share({
        message: `Join OMJI - Balingasag's ride & delivery app! Use my referral code: ${code} to get a bonus on your first ride. Download now!`,
      });
    } catch {
      // User cancelled share
    }
  };

  const renderStatCard = (icon: string, value: string | number, label: string, color: string) => (
    <View style={[styles.statCard, SHADOWS.md]}>
      <View style={[styles.statIconBg, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={moderateScale(20)} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + verticalScale(8) }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={moderateScale(22)} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Refer & Earn</Text>
        <View style={{ width: moderateScale(22) }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>Loading referral data...</Text>
          </View>
        ) : (
          <>
            {/* Share Card */}
            <View style={[styles.shareCard, SHADOWS.lg]}>
              <View style={styles.shareCardHeader}>
                <View style={styles.giftIconBg}>
                  <Ionicons name="gift" size={moderateScale(28)} color={COLORS.accent} />
                </View>
                <Text style={styles.shareCardTitle}>Invite Friends</Text>
                <Text style={styles.shareCardSubtitle}>
                  Share your code and earn rewards when your friends join OMJI
                </Text>
              </View>

              {/* Referral Code Display */}
              <View style={styles.codeContainer}>
                <Text style={styles.codeLabel}>Your Referral Code</Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText}>{code || '------'}</Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.copyButton, copied && styles.copyButtonCopied]}
                  onPress={handleCopy}
                  disabled={!code}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={copied ? 'checkmark-circle' : 'copy-outline'}
                    size={moderateScale(18)}
                    color={copied ? COLORS.success : COLORS.gray700}
                  />
                  <Text style={[styles.copyButtonText, copied && styles.copyButtonTextCopied]}>
                    {copied ? 'Copied!' : 'Copy'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shareButton}
                  onPress={handleShare}
                  disabled={!code}
                  activeOpacity={0.7}
                >
                  <Ionicons name="share-social" size={moderateScale(18)} color={COLORS.white} />
                  <Text style={styles.shareButtonText}>Share Code</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats Section */}
            <Text style={styles.sectionTitle}>Your Referral Stats</Text>
            <View style={styles.statsRow}>
              {renderStatCard('people-outline', stats.total_referrals, 'Total Referrals', COLORS.accent)}
              {renderStatCard('cash-outline', `₱${stats.bonus_earned}`, 'Bonus Earned', COLORS.success)}
              {renderStatCard('hourglass-outline', stats.pending, 'Pending', COLORS.warning)}
            </View>

            {/* How It Works */}
            <Text style={styles.sectionTitle}>How It Works</Text>
            <View style={[styles.howItWorksCard, SHADOWS.md]}>
              {HOW_IT_WORKS.map((item, index) => (
                <View key={item.step}>
                  <View style={styles.stepRow}>
                    <View style={styles.stepNumberBg}>
                      <Text style={styles.stepNumber}>{item.step}</Text>
                    </View>
                    <View style={styles.stepContent}>
                      <Text style={styles.stepTitle}>{item.title}</Text>
                      <Text style={styles.stepDesc}>{item.desc}</Text>
                    </View>
                    <Ionicons name={item.icon as any} size={moderateScale(22)} color={COLORS.accent} />
                  </View>
                  {index < HOW_IT_WORKS.length - 1 && <View style={styles.stepDivider} />}
                </View>
              ))}
            </View>

            <View style={{ height: verticalScale(32) }} />
          </>
        )}
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={hideToast}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: moderateScale(16),
    paddingBottom: verticalScale(14),
  },
  backButton: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontScale(18),
    fontWeight: '700',
    color: COLORS.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: moderateScale(16),
    paddingTop: verticalScale(20),
  },
  loadingContainer: {
    paddingTop: verticalScale(80),
    alignItems: 'center',
    gap: verticalScale(12),
  },
  loadingText: {
    fontSize: fontScale(14),
    color: COLORS.gray500,
  },

  // Share Card
  shareCard: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(16),
    padding: moderateScale(24),
    marginBottom: verticalScale(24),
  },
  shareCardHeader: {
    alignItems: 'center',
    marginBottom: verticalScale(20),
  },
  giftIconBg: {
    width: moderateScale(56),
    height: moderateScale(56),
    borderRadius: moderateScale(28),
    backgroundColor: COLORS.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(12),
  },
  shareCardTitle: {
    fontSize: fontScale(20),
    fontWeight: '700',
    color: COLORS.gray900,
    marginBottom: verticalScale(4),
  },
  shareCardSubtitle: {
    fontSize: fontScale(13),
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: fontScale(18),
  },

  // Code
  codeContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(20),
  },
  codeLabel: {
    fontSize: fontScale(12),
    fontWeight: '600',
    color: COLORS.gray500,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: verticalScale(8),
  },
  codeBox: {
    backgroundColor: COLORS.accentBg,
    borderWidth: 2,
    borderColor: COLORS.accentLight,
    borderStyle: 'dashed',
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(14),
    paddingHorizontal: moderateScale(32),
  },
  codeText: {
    fontSize: fontScale(28),
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 3,
  },

  // Action Buttons
  actionRow: {
    flexDirection: 'row',
    gap: moderateScale(12),
  },
  copyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: moderateScale(6),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(12),
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
  copyButtonCopied: {
    borderColor: COLORS.successLight,
    backgroundColor: COLORS.successBg,
  },
  copyButtonText: {
    fontSize: fontScale(14),
    fontWeight: '600',
    color: COLORS.gray700,
  },
  copyButtonTextCopied: {
    color: COLORS.successDark,
  },
  shareButton: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: moderateScale(6),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.accent,
  },
  shareButtonText: {
    fontSize: fontScale(14),
    fontWeight: '700',
    color: COLORS.white,
  },

  // Stats
  sectionTitle: {
    fontSize: fontScale(16),
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: verticalScale(12),
  },
  statsRow: {
    flexDirection: 'row',
    gap: moderateScale(10),
    marginBottom: verticalScale(24),
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(14),
    paddingHorizontal: moderateScale(8),
    alignItems: 'center',
  },
  statIconBg: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(6),
  },
  statValue: {
    fontSize: fontScale(18),
    fontWeight: '800',
    color: COLORS.gray900,
    marginBottom: verticalScale(2),
  },
  statLabel: {
    fontSize: fontScale(11),
    fontWeight: '500',
    color: COLORS.gray500,
    textAlign: 'center',
  },

  // How It Works
  howItWorksCard: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(16),
    padding: moderateScale(20),
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(14),
    paddingVertical: verticalScale(4),
  },
  stepNumberBg: {
    width: moderateScale(30),
    height: moderateScale(30),
    borderRadius: moderateScale(15),
    backgroundColor: COLORS.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: fontScale(14),
    fontWeight: '700',
    color: COLORS.accent,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: fontScale(14),
    fontWeight: '600',
    color: COLORS.gray800,
  },
  stepDesc: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
    marginTop: verticalScale(2),
  },
  stepDivider: {
    height: 1,
    backgroundColor: COLORS.gray100,
    marginVertical: verticalScale(10),
    marginLeft: moderateScale(44),
  },
});
