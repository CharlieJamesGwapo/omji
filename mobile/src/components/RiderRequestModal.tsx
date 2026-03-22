import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Easing, Vibration, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';
import { moderateScale, fontScale, verticalScale, RESPONSIVE } from '../utils/responsive';

interface RideRequestData {
  ride_id: number;
  pickup_location: string;
  dropoff_location: string;
  distance: number;
  estimated_fare: number;
  vehicle_type: string;
  payment_method: string;
  passenger_name: string;
  expires_at: number;
}

interface Props {
  visible: boolean;
  request: RideRequestData | null;
  onAccept: (rideId: number) => void;
  onDecline: (rideId: number) => void;
  acceptLoading?: boolean;
  declineLoading?: boolean;
}

const TIMEOUT = 30;

export default function RiderRequestModal({ visible, request, onAccept, onDecline, acceptLoading, declineLoading }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT);
  const progress = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDeclineRef = useRef(onDecline);
  onDeclineRef.current = onDecline;
  const requestRef = useRef(request);
  requestRef.current = request;

  useEffect(() => {
    if (visible && request) {
      // Calculate remaining time from server expires_at
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(1, (request.expires_at || now + TIMEOUT) - now);
      setSecondsLeft(remaining);

      Vibration.vibrate([0, 400, 200, 400]);

      // Slide in
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();

      // Progress bar
      progress.setValue(1);
      Animated.timing(progress, {
        toValue: 0, duration: remaining * 1000,
        easing: Easing.linear, useNativeDriver: false,
      }).start();

      // Countdown
      countdownRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            // Use refs to avoid stale closure
            if (requestRef.current) onDeclineRef.current(requestRef.current.ride_id);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      slideAnim.setValue(0);
    };
  }, [visible, request]);

  if (!visible || !request) return null;

  const barColor = secondsLeft <= 10 ? COLORS.primary : COLORS.accent;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { transform: [{ translateY }] }]}>
          {/* Timer bar */}
          <View style={styles.timerBar}>
            <Animated.View style={[styles.timerFill, {
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: barColor,
            }]} />
          </View>

          <View style={styles.cardContent}>
            {/* Header */}
            <View style={styles.headerRow}>
              <Text style={styles.title}>New Ride Request</Text>
              <View style={[styles.timerBadge, secondsLeft <= 10 && { backgroundColor: COLORS.primaryBg }]}>
                <Text style={[styles.timerText, secondsLeft <= 10 && { color: COLORS.primary }]}>{secondsLeft}s</Text>
              </View>
            </View>

            {/* Passenger */}
            <View style={styles.passengerRow}>
              <View style={styles.passengerAvatar}>
                <Text style={styles.passengerAvatarText}>
                  {(request.passenger_name || 'P').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.passengerName}>{request.passenger_name || 'Passenger'}</Text>
            </View>

            {/* Route */}
            <View style={styles.routeSection}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
                <Text style={styles.routeLabel} numberOfLines={2}>{request.pickup_location}</Text>
              </View>
              <View style={styles.routeDivider} />
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
                <Text style={styles.routeLabel} numberOfLines={2}>{request.dropoff_location}</Text>
              </View>
            </View>

            {/* Details */}
            <View style={styles.detailsRow}>
              <View style={styles.detailItem}>
                <Ionicons name="cash-outline" size={moderateScale(18)} color={COLORS.accent} />
                <Text style={styles.detailValue}>{'\u20B1'}{(request.estimated_fare || 0).toFixed(0)}</Text>
              </View>
              <View style={styles.detailItem}>
                <Ionicons name="navigate-outline" size={moderateScale(18)} color={COLORS.accent} />
                <Text style={styles.detailValue}>{(request.distance || 0).toFixed(1)} km</Text>
              </View>
              <View style={styles.detailItem}>
                <Ionicons name="card-outline" size={moderateScale(18)} color={COLORS.accent} />
                <Text style={styles.detailValue}>{(request.payment_method || 'cash').toUpperCase()}</Text>
              </View>
              {!!request.vehicle_type && (
                <View style={styles.detailItem}>
                  <Ionicons name="bicycle-outline" size={moderateScale(18)} color={COLORS.accent} />
                  <Text style={styles.detailValue}>{request.vehicle_type}</Text>
                </View>
              )}
            </View>

            {/* Buttons */}
            <TouchableOpacity
              style={[styles.acceptBtn, acceptLoading && { opacity: 0.7 }]}
              onPress={() => onAccept(request.ride_id)}
              activeOpacity={0.8}
              disabled={acceptLoading || declineLoading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Accept ride request"
              accessibilityRole="button"
            >
              {acceptLoading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
                  <Text style={styles.acceptText}>Accept Ride</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.declineBtn, declineLoading && { opacity: 0.7 }]}
              onPress={() => onDecline(request.ride_id)}
              activeOpacity={0.7}
              disabled={acceptLoading || declineLoading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Reject ride request"
              accessibilityRole="button"
            >
              {declineLoading ? (
                <ActivityIndicator color={COLORS.gray600} size="small" />
              ) : (
                <Text style={styles.declineText}>Decline</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24),
    overflow: 'hidden', ...SHADOWS.xl,
  },
  timerBar: { height: 5, backgroundColor: COLORS.gray200, width: '100%' },
  timerFill: { height: '100%', borderRadius: 3 },
  cardContent: { padding: RESPONSIVE.paddingHorizontal, paddingBottom: verticalScale(32) },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: verticalScale(16), marginBottom: verticalScale(16),
  },
  title: { fontSize: fontScale(20), fontWeight: '700', color: COLORS.gray900 },
  timerBadge: {
    backgroundColor: COLORS.accentBg, paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(6), borderRadius: moderateScale(10),
  },
  timerText: { fontSize: fontScale(14), fontWeight: '700', color: COLORS.accent },
  passengerRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(16),
  },
  passengerAvatar: {
    width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20),
    backgroundColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center',
  },
  passengerAvatarText: { fontSize: fontScale(16), fontWeight: '700', color: COLORS.gray700 },
  passengerName: { fontSize: fontScale(15), fontWeight: '600', color: COLORS.gray800, marginLeft: moderateScale(12) },
  routeSection: {
    backgroundColor: COLORS.gray50, borderRadius: moderateScale(14),
    padding: moderateScale(14), marginBottom: verticalScale(16),
  },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: moderateScale(10) },
  routeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  routeLabel: { flex: 1, fontSize: fontScale(13), color: COLORS.gray700, lineHeight: verticalScale(20) },
  routeDivider: {
    width: 1, height: verticalScale(14), backgroundColor: COLORS.gray300,
    marginLeft: 4, marginVertical: 4,
  },
  detailsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginBottom: verticalScale(20), paddingVertical: verticalScale(10),
    backgroundColor: COLORS.gray50, borderRadius: moderateScale(12),
  },
  detailItem: { alignItems: 'center', gap: 4 },
  detailValue: { fontSize: fontScale(13), fontWeight: '700', color: COLORS.gray800 },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.success, borderRadius: moderateScale(14),
    paddingVertical: moderateScale(16), gap: moderateScale(8),
    marginBottom: verticalScale(10),
  },
  acceptText: { fontSize: fontScale(16), fontWeight: '700', color: COLORS.white },
  declineBtn: {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: moderateScale(14), paddingVertical: moderateScale(14),
    borderWidth: 1.5, borderColor: COLORS.gray300,
  },
  declineText: { fontSize: fontScale(14), fontWeight: '600', color: COLORS.gray600 },
});
