import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, moderateScale, fontScale, verticalScale } from '../../utils/responsive';
import { rideService } from '../../services/api';
import Toast, { ToastType } from '../../components/Toast';

const TIMEOUT_SECONDS = 30;
const API_BASE = 'https://omji-backend.onrender.com/api/v1';

export default function RiderWaitingScreen({ navigation, route }: any) {
  const { rideId, driverName, driverRating, driverVehicle, bookingData, excludeDriverIds = [] } = route.params;
  const insets = useSafeAreaInsets();
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);
  const [status, setStatus] = useState<'waiting' | 'accepted' | 'declined' | 'expired' | 'cancelled'>('waiting');
  const progress = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });

  // Pulse animation for the waiting indicator
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Countdown bar animation
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: TIMEOUT_SECONDS * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // Countdown timer
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const handleResponse = useCallback((type: string) => {
    if (status !== 'waiting') return;
    if (type === 'ride_accepted') {
      setStatus('accepted');
      setTimeout(() => {
        navigation.replace('Tracking', {
          type: 'ride',
          rideId,
          pickup: bookingData.pickup_location,
          dropoff: bookingData.dropoff_location,
          fare: bookingData.estimated_fare,
        });
      }, 1000);
    } else if (type === 'ride_declined' || type === 'ride_expired') {
      setStatus(type === 'ride_declined' ? 'declined' : 'expired');
      setTimeout(() => {
        const newExcluded = [...excludeDriverIds];
        // Navigate back to selection
        navigation.replace('RiderSelection', {
          bookingData,
          excludeDriverIds: newExcluded,
        });
      }, 1500);
    }
  }, [status, navigation, rideId, bookingData, excludeDriverIds]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    (async () => {
      const token = await AsyncStorage.getItem('token');
      const wsUrl = API_BASE.replace('https://', 'wss://').replace('http://', 'ws://').replace('/api/v1', '');
      ws = new WebSocket(`${wsUrl}/ws/tracking/${rideId}?token=${token || ''}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ride_accepted' || data.type === 'ride_declined' || data.type === 'ride_expired') {
            handleResponse(data.type);
          }
        } catch {}
      };
      ws.onerror = () => {};
      ws.onclose = () => {};
    })();

    return () => { if (ws) ws.close(); };
  }, [rideId, handleResponse]);

  // Polling fallback — check ride status every 3s
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await rideService.getRideDetails(rideId);
        const ride = res?.data?.data;
        if (!ride) return;
        if (ride.status === 'accepted') handleResponse('ride_accepted');
        else if (ride.status === 'cancelled') handleResponse('ride_declined');
      } catch {}
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [rideId, handleResponse]);

  const handleCancel = async () => {
    setStatus('cancelled');
    try {
      await rideService.cancelRide(rideId);
    } catch {}
    navigation.goBack();
  };

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const barColor = secondsLeft <= 10 ? COLORS.primary : COLORS.accent;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Countdown bar */}
      <View style={styles.progressBar}>
        <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: barColor }]} />
      </View>

      <View style={styles.content}>
        {/* Pulsing indicator */}
        <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.innerCircle}>
            {status === 'waiting' && <Ionicons name="time-outline" size={40} color={COLORS.accent} />}
            {status === 'accepted' && <Ionicons name="checkmark-circle" size={40} color={COLORS.success} />}
            {(status === 'declined' || status === 'expired') && <Ionicons name="close-circle" size={40} color={COLORS.primary} />}
          </View>
        </Animated.View>

        {/* Status text */}
        <Text style={styles.statusTitle}>
          {status === 'waiting' && 'Waiting for response...'}
          {status === 'accepted' && 'Ride Accepted!'}
          {status === 'declined' && 'Rider Declined'}
          {status === 'expired' && 'Request Expired'}
        </Text>
        {status === 'waiting' && (
          <Text style={styles.timerText}>{secondsLeft}s remaining</Text>
        )}
        {status === 'accepted' && (
          <Text style={styles.subText}>Connecting you with your rider...</Text>
        )}
        {(status === 'declined' || status === 'expired') && (
          <Text style={styles.subText}>Returning to rider list...</Text>
        )}

        {/* Driver info card */}
        <View style={styles.driverCard}>
          <View style={styles.driverAvatar}>
            <Text style={styles.driverAvatarText}>{(driverName || 'R').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.driverDetails}>
            <Text style={styles.driverName}>{driverName}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color="#F59E0B" />
              <Text style={styles.ratingText}>{(driverRating || 0).toFixed(1)}</Text>
            </View>
            <Text style={styles.vehicleText}>{driverVehicle}</Text>
          </View>
        </View>

        {/* Route summary */}
        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.routeText} numberOfLines={1}>{bookingData.pickup_location}</Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.routeText} numberOfLines={1}>{bookingData.dropoff_location}</Text>
          </View>
        </View>

        {/* Cancel button */}
        {status === 'waiting' && (
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel Request</Text>
          </TouchableOpacity>
        )}
      </View>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast(p => ({ ...p, visible: false }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  progressBar: {
    height: 4, backgroundColor: COLORS.gray200, width: '100%',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: RESPONSIVE.paddingHorizontal },
  pulseCircle: {
    width: moderateScale(100), height: moderateScale(100), borderRadius: moderateScale(50),
    backgroundColor: COLORS.accentBg, alignItems: 'center', justifyContent: 'center',
    marginBottom: verticalScale(24),
  },
  innerCircle: {
    width: moderateScale(72), height: moderateScale(72), borderRadius: moderateScale(36),
    backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', ...SHADOWS.md,
  },
  statusTitle: { fontSize: fontScale(22), fontWeight: '700', color: COLORS.gray900, marginBottom: 8 },
  timerText: { fontSize: fontScale(16), fontWeight: '600', color: COLORS.accent, marginBottom: verticalScale(8) },
  subText: { fontSize: fontScale(14), color: COLORS.gray500, marginBottom: verticalScale(24) },
  driverCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: moderateScale(16), padding: moderateScale(16),
    width: '100%', marginBottom: verticalScale(16), ...SHADOWS.sm,
  },
  driverAvatar: {
    width: moderateScale(52), height: moderateScale(52), borderRadius: moderateScale(26),
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
  },
  driverAvatarText: { fontSize: fontScale(20), fontWeight: '700', color: COLORS.white },
  driverDetails: { marginLeft: moderateScale(14), flex: 1 },
  driverName: { fontSize: fontScale(16), fontWeight: '700', color: COLORS.gray900 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  ratingText: { fontSize: fontScale(13), fontWeight: '600', color: COLORS.gray800 },
  vehicleText: { fontSize: fontScale(12), color: COLORS.gray500, marginTop: 2, textTransform: 'capitalize' },
  routeCard: {
    backgroundColor: COLORS.white, borderRadius: moderateScale(14),
    padding: moderateScale(14), width: '100%', marginBottom: verticalScale(24), ...SHADOWS.sm,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(10) },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: {
    width: 1, height: verticalScale(16), backgroundColor: COLORS.gray200,
    marginLeft: 4, marginVertical: 4,
  },
  routeText: { flex: 1, fontSize: fontScale(13), color: COLORS.gray700 },
  cancelBtn: {
    paddingHorizontal: moderateScale(32), paddingVertical: moderateScale(14),
    borderRadius: moderateScale(12), borderWidth: 1.5, borderColor: COLORS.gray300,
  },
  cancelText: { fontSize: fontScale(14), fontWeight: '600', color: COLORS.gray600 },
});
