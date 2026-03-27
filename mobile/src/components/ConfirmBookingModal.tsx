import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RESPONSIVE, fontScale, verticalScale, moderateScale } from '../utils/responsive';

export interface BookingDetail {
  icon: string;
  label: string;
  value: string;
  color?: string;
}

interface ConfirmBookingModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  details: BookingDetail[];
  fare?: number;
  fareLabel?: string;
  discount?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  accentColor?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmBookingModal({
  visible,
  title,
  subtitle,
  details,
  fare,
  fareLabel = 'Total Fare',
  discount,
  confirmLabel = 'Confirm Booking',
  cancelLabel = 'Cancel',
  accentColor = '#DC2626',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmBookingModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: accentColor }]}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="checkmark-circle" size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{title}</Text>
              {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
            </View>
            <TouchableOpacity
              onPress={onCancel}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>

          {/* Details */}
          <ScrollView
            style={styles.detailsScroll}
            contentContainerStyle={styles.detailsContainer}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {details.map((item, index) => (
              <View
                key={index}
                style={[
                  styles.detailRow,
                  index < details.length - 1 && styles.detailRowBorder,
                ]}
              >
                <View style={[styles.detailIconWrap, { backgroundColor: (item.color || accentColor) + '15' }]}>
                  <Ionicons name={item.icon as any} size={16} color={item.color || accentColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailLabel}>{item.label}</Text>
                  <Text style={styles.detailValue} numberOfLines={2}>{item.value}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Fare Summary */}
          {fare != null && fare > 0 && (
            <View style={styles.fareSection}>
              <View style={styles.fareDivider} />
              {!!discount && discount > 0 && (
                <View style={styles.fareRow}>
                  <Text style={styles.discountLabel}>Promo Discount</Text>
                  <Text style={styles.discountValue}>-₱{discount.toFixed(0)}</Text>
                </View>
              )}
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>{fareLabel}</Text>
                <Text style={[styles.fareValue, { color: accentColor }]}>₱{fare.toFixed(0)}</Text>
              </View>
            </View>
          )}

          {/* Buttons */}
          <View style={styles.buttonSection}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: accentColor }, loading && { opacity: 0.7 }]}
              onPress={onConfirm}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: moderateScale(24),
  },
  card: {
    width: '100%',
    maxWidth: moderateScale(400),
    backgroundColor: '#fff',
    borderRadius: moderateScale(20),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(18),
    paddingVertical: moderateScale(16),
    gap: moderateScale(12),
  },
  headerIconWrap: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontScale(17),
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: fontScale(12),
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },
  closeBtn: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsScroll: {
    maxHeight: verticalScale(280),
  },
  detailsContainer: {
    paddingHorizontal: moderateScale(18),
    paddingTop: moderateScale(14),
    paddingBottom: moderateScale(4),
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: moderateScale(10),
    gap: moderateScale(12),
  },
  detailRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  detailIconWrap: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  detailLabel: {
    fontSize: fontScale(11),
    color: '#9CA3AF',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: fontScale(14),
    fontWeight: '600',
    color: '#1F2937',
    lineHeight: fontScale(19),
  },
  fareSection: {
    paddingHorizontal: moderateScale(18),
    paddingBottom: moderateScale(4),
  },
  fareDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginBottom: moderateScale(10),
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: moderateScale(4),
  },
  discountLabel: {
    fontSize: fontScale(13),
    color: '#16A34A',
    fontWeight: '500',
  },
  discountValue: {
    fontSize: fontScale(13),
    color: '#16A34A',
    fontWeight: '600',
  },
  fareLabel: {
    fontSize: fontScale(15),
    fontWeight: '700',
    color: '#1F2937',
  },
  fareValue: {
    fontSize: fontScale(22),
    fontWeight: '800',
  },
  buttonSection: {
    flexDirection: 'row',
    gap: moderateScale(10),
    padding: moderateScale(18),
    paddingTop: moderateScale(14),
  },
  cancelButton: {
    flex: 1,
    paddingVertical: moderateScale(14),
    borderRadius: moderateScale(12),
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: fontScale(14),
    fontWeight: '600',
    color: '#6B7280',
  },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: moderateScale(14),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
    gap: moderateScale(6),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmButtonText: {
    fontSize: fontScale(15),
    fontWeight: '700',
    color: '#fff',
  },
});
